# AWS and GitHub deployment

## Prerequisites

- An AWS account and an authenticated operator IAM role capable of creating the network, EKS, IAM roles, and addons.
- AWS CLI, Terraform 1.11+, kubectl, Helm 3, Docker, and OpenSSL.
- A GitHub repository for this source tree and permission to publish GHCR packages.

EKS, worker instances, NAT, EBS, and log storage incur charges while present. The defaults request two `t3.medium` workers. Terraform does not calculate account-specific cost.

## Provision

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Set `admin_principal_arn` to the operator IAM role ARN, `api_allowed_cidrs` to the public IP CIDR used for administration, and `github_repository` to the actual `owner/repository`. If the account already has a GitHub OIDC provider, set `github_oidc_provider_arn` to reuse it. The example account ID and CIDR are documentation values and will not provide access.

```sh
terraform init
terraform plan -out=stockroom.tfplan
terraform apply stockroom.tfplan
terraform output -raw configure_kubectl
```

Run the printed `aws eks update-kubeconfig` command. Then verify the selected context and nodes before installing anything:

```sh
kubectl config current-context
kubectl get nodes
```

Terraform state is local and excluded from Git. Keep it backed up securely until teardown. For shared operation, configure an encrypted S3 backend with locking before the first apply. Losing state makes reliable cleanup harder.

## Bootstrap the cluster

From the repository root:

```sh
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deploy-rbac.yaml
kubectl apply -f k8s/storage-class.yaml
export OPERATOR_PASSWORD='choose-a-strong-workspace-password'
./scripts/create-secret.sh

helm repo add traefik https://traefik.github.io/charts
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update
helm upgrade --install traefik traefik/traefik --version 34.4.1 \
  -n ingress-system --create-namespace --set service.type=ClusterIP --wait
helm upgrade --install metrics-server metrics-server/metrics-server --version 3.12.2 \
  -n kube-system --wait

export GRAFANA_PASSWORD='choose-a-separate-grafana-password'
./scripts/monitoring.sh
```

Unlike kind, EKS does not use `--kubelet-insecure-tls`.

The initial AWS access path uses a local port-forward to Traefik. It creates no public load balancer and needs no AWS Load Balancer Controller. A publicly reachable service would additionally need a controller-managed load balancer, DNS, and a trusted TLS certificate.

Create a TLS Secret for the hostname chosen for the application, using an existing certificate and key:

```sh
kubectl -n stockroom create secret tls stockroom-tls \
  --cert=/path/to/certificate.pem --key=/path/to/private-key.pem
```

For a private demonstration, a locally generated development certificate is possible, but the browser must trust its issuer. Never commit the private key.

## GitHub configuration

The workflow runs on pull requests and pushes to `main`. Tests, frontend compilation, infrastructure checks, and browser tests must pass before image building. Both images are scanned for HIGH and CRITICAL vulnerabilities. Only after both scans succeed are those exact images pushed to GHCR. No `latest` tag is used.

The repository is [adityabhas22/stockroom](https://github.com/adityabhas22/stockroom). Its backend and frontend GHCR images are publicly pullable. Pushes to `main` publish a new commit-SHA tag after validation. The chart assumes public GHCR packages. For private packages, create an image-pull Secret and set `imagePullSecrets` in a private values file or the deployment command.

Create the GitHub environment `capstone` and restrict it to the `main` branch. Configure these repository or environment variables:

| Variable | Value |
| --- | --- |
| `DEPLOY_ENABLED` | `true` when cluster bootstrap is complete |
| `AWS_DEPLOY_ROLE_ARN` | Terraform's `github_deploy_role_arn` output |
| `AWS_REGION` | The Terraform region |
| `EKS_CLUSTER_NAME` | Terraform's `cluster_name` output |
| `STOCKROOM_HOST` | The hostname on the TLS certificate |

The deployment job uses a self-hosted Linux runner labelled `stockroom-deploy`. It needs AWS CLI and kubectl, network access to the private EKS endpoint, and outbound access to GitHub and the registries. Place it on a trusted machine connected to the VPC. It does not need permanent AWS credentials: GitHub OIDC assumes the scoped deployment role.

Pull requests never run on that runner. Keep environment branch restrictions in place because a self-hosted runner is a trusted execution environment. Repository variables leave deployment disabled until the cluster and runner are available; tests, scans, and image publishing still run.

## Deploy a published revision manually

Set the repository and the full SHA from a successful workflow run:

```sh
export IMAGE_PATH=ghcr.io/adityabhas22/stockroom
export IMAGE_TAG=full-commit-sha
export STOCKROOM_HOST=inventory.example.com

helm upgrade --install stockroom helm/stockroom -n stockroom \
  -f helm/stockroom/values-aws.yaml \
  --set-string backend.image="$IMAGE_PATH/backend",backend.tag="$IMAGE_TAG" \
  --set-string frontend.image="$IMAGE_PATH/frontend",frontend.tag="$IMAGE_TAG" \
  --set-string ingress.host="$STOCKROOM_HOST" \
  --set-string 'ingress.tls[0].secretName=stockroom-tls' \
  --set-string "ingress.tls[0].hosts[0]=$STOCKROOM_HOST" \
  --wait --wait-for-jobs --atomic --timeout 10m

kubectl -n ingress-system port-forward svc/traefik 8443:443
```

Resolve the chosen hostname to `127.0.0.1` locally and open `https://<hostname>:8443`. The Host header selects the ingress route; the certificate must match that hostname. For a command-line check without changing local DNS:

```sh
curl --resolve "$STOCKROOM_HOST:8443:127.0.0.1" "https://$STOCKROOM_HOST:8443/"
```

Do not disable Secure cookies to work around a TLS problem on an exposed deployment.

## Teardown

Take and verify any required database backup first. Then remove workloads and their volumes before deleting the cluster:

```sh
helm uninstall stockroom -n stockroom
kubectl -n stockroom delete pvc data-stockroom-postgres-0
helm uninstall monitoring -n monitoring
helm uninstall traefik -n ingress-system
helm uninstall metrics-server -n kube-system
kubectl get pv
cd terraform
terraform plan -destroy
terraform destroy
```

Wait for the application EBS volume to be deleted before destroying EKS. If additional load balancers, volumes, or snapshots were created outside this configuration, inspect and remove those separately. Verify that the EKS cluster, managed worker group, NAT gateway, and tagged volumes are gone after teardown.
