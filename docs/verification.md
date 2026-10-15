# Verification

## Recorded demonstration · 14–15 October

Commit `99a0e2ca5b0b1beea3b142b3782ab439ac514ff1` added the matching-item count to the inventory search description. The recording follows the commit and push, [GitHub Actions run 38615525049](https://github.com/adityabhas22/stockroom/actions/runs/38615525049), image publication, and a manual Helm upgrade to revision 5 in the local kind cluster. The updated application displays `1 match for “Arduino”` through the cluster ingress. Browser assertions cover a single match and an empty result.

| Check | Record |
| --- | --- |
| PostgreSQL API tests | [Native terminal capture](images/demo/pytest.png) |
| Compose services healthy | [Native terminal capture](images/demo/compose-healthy.png) |
| API create, read, update and archive | [Create](images/demo/api-create.png), [read](images/demo/api-read.png), [update](images/demo/api-crud.png), [archive](images/demo/api-delete.png) |
| PostgreSQL inventory and movement tables | [Database query](images/demo/database.png) |
| Successful CI run | [GitHub Actions](images/demo/ci-success.png) |
| Trivy results for both published images | [Backend scan](images/demo/scans.png), [frontend scan](images/demo/scans-frontend.png) |
| Helm revision 5 deployment | [Helm completion](images/demo/helm-complete.png), [release and deployed images](images/demo/helm-release.png), [updated application](images/demo/deployment-after.png) |
| Running workloads, Services and Helm release | [Kubernetes output](images/demo/kubernetes.png) |
| Published images and non-root runtime users | [Image tags](images/demo/images.png), [digests and runtime users](evidence/demo/images.txt) |
| Prometheus-format application metrics | [Metrics endpoint](images/demo/metrics-endpoint.png) |
| Application targets UP | [Prometheus, 5/5 targets](images/demo/prometheus.png) |
| Live traffic and scaling from two replicas to five | [Grafana](images/demo/live-monitoring.png) |
| Invalid image and Service selector diagnosis | [Failure state](images/demo/failure-diagnose.png), [correction](images/demo/failure-fix.png), [recovery](images/demo/failure-recovered.png) |

The 15 October local load test completed 9,218 successful reads with zero failures over 60 seconds using 12 workers. The Grafana capture shows application traffic and an increase from two backend replicas to five; Prometheus reports five healthy application targets.

[CI run](evidence/demo/ci-run.json) · [API tests](evidence/demo/pytest.txt) · [Compose](evidence/demo/compose.txt) · [Database query](evidence/demo/database.txt) · [Image digests](evidence/demo/images.txt) · [Kubernetes](evidence/demo/kubernetes.txt) · [Metrics](evidence/demo/metrics.txt) · [Load](evidence/demo/load.json) · [Failure diagnosis](evidence/demo/failure-diagnose.txt) · [Recovery](evidence/demo/failure-fix.txt) · [Backend scan](evidence/demo/backend-scan.txt) · [Frontend scan](evidence/demo/frontend-scan.txt).

The terminal captures show command execution in a native terminal. GitHub published the images automatically; the Helm upgrade was run manually. The optional AWS deployment job was skipped. The recording uses dated evidence for the 13 October AWS provisioning and teardown.

## Local verification · 13 October

These checks ran on macOS, Docker Desktop, and a local kind cluster running Kubernetes 1.32.2.

| Check | Result | Record |
| --- | --- | --- |
| PostgreSQL API tests | 21 passed | [Output](evidence/backend-tests.txt) |
| Migration consistency | No model drift; downgrade and upgrade completed | [Output](evidence/backend-tests.txt) |
| Chromium on Compose | 3 passed | [Output](evidence/browser-compose.txt) |
| Chromium through Kubernetes ingress | 3 passed | [Output](evidence/browser-kubernetes.txt) |
| Frontend compilation | TypeScript and Vite build completed | Reproduced in both Docker builds |
| Compose startup | Database, API, and frontend healthy; migration completed | [Services](evidence/compose.txt) |
| Helm deployment | Application and monitoring installed | [Resources](evidence/kubernetes.txt) |
| AWS chart resources | Accepted by Kubernetes server dry run | [Output](evidence/manifest-validation.txt) |
| Terraform | Init, validate, and one mocked plan test passed | [Output](evidence/terraform.txt) |
| GitHub workflow syntax | Actionlint passed | `.github/actionlint.yaml` includes the custom runner label |
| Container scanning | No HIGH or CRITICAL findings in either final application image | [Scan summary and image IDs](evidence/security-scans.json) |
| Prometheus scraping | Application targets UP | [Targets](evidence/prometheus-targets.json) |
| Autoscaling | Backend increased from 2 to 5 replicas under load, then returned to 2 | [HPA observations](evidence/autoscaling.txt) |
| Load generation | 76,855 successful reads; 0 failures over 180 seconds with 24 workers | [Result](evidence/load.json) |
| Database outage | `/health` returned 200; `/ready` returned 503; readiness recovered after restart | [Output](evidence/database-outage.txt) |
| PostgreSQL pod replacement | Inventory remained at 12 active items and 154 units | [Output](evidence/postgres-persistence.txt) |
| Backup restore | Archive restored into a separate database; 14 item rows and 12 movements recovered | [Counts](evidence/restore.txt) |
| Failure exercises | Bad image reproduced and corrected; empty Service endpoints reproduced and corrected | [Output](evidence/failure-labs.txt) |

The backup includes two archived test items. The active sample inventory contains 12 items and 154 units. Browser tests leave their own archived items and movement records, so later database counts can increase.

The backend test run emits a dependency deprecation warning about Starlette's HTTPX test client. It does not fail the suite. The runtime does not use that test client.

## Interface

The desktop and mobile captures show the running application with the optional seed dataset. Fonts are bundled locally; the interface makes no font requests to an external service.

![Inventory](images/inventory.png)

![Mobile inventory](images/mobile.png)

## Monitoring

The Grafana capture contains application traffic, latency, CPU, and the increase to five backend replicas. Grafana's initial 256 MiB memory limit caused an OOM restart during dashboard loading. The final configuration uses a 768 MiB limit, and the replacement pod loaded all six panels successfully.

![Grafana application dashboard](images/grafana.png)

![Prometheus application targets](images/prometheus.png)

## Initial GitHub delivery · 13 October

[Workflow run 38426641286](https://github.com/adityabhas22/stockroom/actions/runs/38426641286) passed on GitHub-hosted Linux runners on 13 October 2026 for commit `4d66ca00d4761cadb2d98108edf9d2469f097b0b`.

- All 21 PostgreSQL API tests and all 3 Chromium tests passed.
- Frontend compilation, formatting, Helm validation, and Terraform validation and mocked planning passed.
- Both Linux AMD64 images passed Trivy with zero HIGH or CRITICAL findings and were pushed with the full commit SHA as their tag.
- Anonymous access to both image manifests and every image layer was verified.
- The optional AWS deployment job was skipped because deployment is disabled.

The first run found a Terraform lock-file portability issue. Adding the Linux provider checksum resolved it while retaining checksum verification.

[Run and image digests](evidence/github-run.json) · [Pytest results](evidence/github-pytest.xml) · [Backend scan](evidence/github-backend-scan.txt) · [Frontend scan](evidence/github-frontend-scan.txt)

## AWS execution

The application also ran on a temporary EKS cluster in Mumbai on 13 October 2026. The [AWS execution record](aws-run.md) includes infrastructure, application, rollout, load, persistence, recovery, and teardown evidence.

## Not executed

- Deploying to EKS through the OIDC deployment job.
- External TLS, public DNS, and public load-balancer access.

The configuration and commands for those steps are in [deployment.md](deployment.md). The AWS run used a manual Helm upgrade of the images published by GitHub Actions. Scan results apply to the recorded images and vulnerability database at the time of each run.
