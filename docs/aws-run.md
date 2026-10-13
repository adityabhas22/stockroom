# AWS execution record

13 October 2026 · Mumbai (`ap-south-1`) · EKS 1.34 · two `t3.medium` managed workers.

Stockroom ran on infrastructure created by Terraform: a VPC, two public and two private subnets across two availability zones, a NAT gateway, EKS, managed workers, IAM access, and the EBS CSI addon. The application used encrypted EBS storage. Access to the cluster API was restricted to the administration address; application traffic passed through a loopback-only connection to Traefik. No public load balancer or public DNS record was created.

## Evidence

| Requirement | Capture | Supporting record |
| --- | --- | --- |
| Running application | [Inventory](images/aws/inventory.png), [mobile](images/mobile.png) | [Application health](evidence/aws/health-before.json) |
| Pytest, 21 passing tests | [Test output](images/pytest-output.png) | [Verbose output](evidence/aws/ci-pytest.txt), [JUnit](evidence/aws/pytest.xml) |
| At least ten meaningful commits | [Commit history](images/github-commits.png) | [Repository history](https://github.com/adityabhas22/stockroom/commits/main/) |
| Compose build and startup | [Compose output](images/compose-output.png), [local browser](images/local-final.png) | [CI output](evidence/aws/ci-compose.txt) |
| Successful pipeline | [Actions](images/aws/update-pipeline.png) | [Run 38432189390](https://github.com/adityabhas22/stockroom/actions/runs/38432189390) |
| SHA-tagged images | [Backend package](images/ghcr-backend.png), [frontend package](images/ghcr-frontend.png) | [Workflow record](evidence/aws/github-update-run.json) |
| Trivy scans | [Scan output](images/trivy-output.png) | [Backend](evidence/aws/backend-scan.txt), [frontend](evidence/aws/frontend-scan.txt) |
| Terraform initialization and nonempty plan | [Plan](images/aws/terraform-plan.png) | [Init](evidence/aws/terraform-init.txt), [plan excerpt](evidence/aws/terraform-plan-excerpt.txt) |
| AWS VPC and public subnets | [VPC](images/aws/vpc.png), [subnet map](images/aws/vpc-subnets.png) | Terraform configuration in `terraform/` |
| EKS and managed workers | [Active cluster](images/aws/eks-active.png), [worker group](images/aws/eks-workers.png) | [Apply completion](evidence/aws/terraform-apply-workers.txt) |
| Pods, Services, Helm release | [Kubernetes output](images/aws/kubernetes.png) | [Resources](evidence/aws/kubernetes.txt) |
| Ingress application | [AWS inventory](images/aws/inventory.png) | Host `stockroom.aws.localhost:8089` |
| Prometheus-format metrics | [Metrics output](images/aws/metrics.png) | [Raw metrics](evidence/aws/metrics.txt) |
| Application targets UP | [Prometheus Targets](images/aws/prometheus.png) | [Targets](evidence/aws/prometheus-targets.json) |
| Populated dashboard | [Grafana](images/aws/grafana.png) | HTTP traffic, latency, errors, and replicas |
| Deployed change | [Before](images/aws/before-update.png), [after](images/aws/after-update.png), [rollout](images/aws/rollout.png) | [Helm upgrade](evidence/aws/helm-update.txt), [deployed images](evidence/aws/rollout.txt) |
| Terraform teardown | [Destroy completion](images/aws/terraform-destroy.png), [empty EKS list](images/aws/eks-cleanup.png) | [Destroy output](evidence/aws/terraform-destroy.txt), [AWS resource audit](evidence/aws/cleanup-audit.json) |

The browser, AWS Console, GitHub, Prometheus, and Grafana images are browser screenshots. Command-output images are labelled renderings of saved command or CI output, with the corresponding text files linked above; they are not native terminal-window screenshots. The initial plan capture retains its final output and 34-resource summary rather than the entire plan. The apply record covers the final seven resources after the first 27 had been created.

Trivy scanned both built Linux AMD64 images, including operating-system and application packages. Both scans reported zero HIGH or CRITICAL findings, so the configured severity gate passed and those images were published. This result describes the images and vulnerability database at scan time; it does not establish that every possible vulnerability is absent.

## Deployment change

The first release used `4d66ca00d4761cadb2d98108edf9d2469f097b0b`. Selecting the low-stock filter narrowed the rows but left the heading as “All inventory.” Commit `388acdf426621f11f0186cb7351e121bfa02934a` made the heading follow the selected filter.

GitHub Actions passed 21 API tests, three Chromium tests, frontend compilation, infrastructure checks, and both image scans. It published both images with that full SHA. A manual Helm upgrade installed those images as release revision 2; the browser then displayed “Low stock,” and the API [health response](evidence/aws/health-after.json) reported the same SHA. The optional OIDC deployment job remained disabled. Automated publishing and manual deployment were both exercised; an unattended deployment was not.

The [captured walkthrough](../stockroom-walkthrough.mp4) presents the saved before/after, pipeline, infrastructure, monitoring, and teardown screens. It is a sequence of recorded captures with captions, not a continuous recording of the run.

## Application and resilience

The AWS session created item `AWS-001`, received seven units, changed its shelf from D-04 to D-05, issued all seven units, and archived the item. The movement ledger retained both transactions. The final active inventory contained 12 items and 154 units; the database contained 13 item rows, including the archived item, and 12 movements.

- [Load](evidence/aws/load.json): 38,343 successful reads, zero failures, 180 seconds, 48 workers.
- [Autoscaling](images/aws/hpa.png): two backend replicas increased to five and returned to two after traffic stopped, before the deployment upgrade.
- [Persistence](evidence/aws/ebs-persistence.txt): deleting and replacing the PostgreSQL pod changed its UID while preserving all 13 item rows, 154 units, and 12 movements.
- [Restore](evidence/aws/backup-restore.txt): a PostgreSQL dump restored into a separate database with the same counts.
- [Failure recovery](images/aws/failure-recovery.png): an invalid image tag produced `ImagePullBackOff`; replacing it restored the Deployment. An incorrect Service selector produced an empty EndpointSlice; correcting it restored the endpoint.

The migration Job finished successfully; its `Completed` status is expected. The application Deployments and PostgreSQL pod were Running. The temporary failure lab was isolated in its own namespace.

## Cleanup

The saved destroy plan removed all 34 Terraform-managed resources. Kubernetes workloads were removed first, and the application EBS volume was confirmed absent before EKS deletion. A separate AWS API audit found no remaining project VPC, cluster, network interfaces, allocated public IP, application volume, or cluster log group. The NAT gateway reported `deleted`, and Terraform state contained zero managed resources.

The VPC CNI left an unattached network interface after its worker terminated. EKS also left its cluster security group after cluster deletion. Both were checked for ownership and attachments, removed, and recorded in the [cleanup log](evidence/aws/cni-cleanup.txt); Terraform then completed the subnet and VPC deletions.

Both temporary bootstrap access keys, their IAM user, and the operator role were removed. [Access cleanup](evidence/aws/access-cleanup.json) records the verification. The default VPC and AWS service-linked roles were left intact. Local Docker and kind environments remain available; they do not depend on the deleted AWS infrastructure.

The run incurred AWS usage. Teardown stops further usage from these resources; it does not erase charges already incurred.
