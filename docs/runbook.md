# Operations

Commands below assume the `stockroom` namespace and release. Check `kubectl config current-context` before changing a cluster.

## Basic checks

```sh
kubectl -n stockroom get pods,svc,ingress,hpa
helm list -n stockroom
kubectl -n stockroom logs deployment/stockroom-backend --tail=100
kubectl -n stockroom get events --sort-by=.lastTimestamp
```

`/health` confirms that the API process is alive. `/ready` also queries the schema. A database outage should remove the API from service without causing a liveness restart loop.

```sh
kubectl -n stockroom port-forward svc/stockroom-backend 8001:8000
curl -i http://localhost:8001/health
curl -i http://localhost:8001/ready
curl http://localhost:8001/metrics
```

## Backend unavailable

For `StockroomBackendUnavailable`, check the backend pods and their readiness first. Then inspect the database pod, PVC, migration Job, and Secret references:

```sh
kubectl -n stockroom describe deployment stockroom-backend
kubectl -n stockroom get jobs,pvc
kubectl -n stockroom logs stockroom-postgres-0 --tail=60
kubectl -n stockroom logs job/stockroom-migrate-1
```

Use the current migration Job name from `kubectl get jobs`; its suffix is the Helm revision. A completed Job may have been removed after its one-hour TTL. Do not print Secret contents into logs or screenshots.

If pods are ready but Prometheus has no target, check that the ServiceMonitor exists and has `release: monitoring`, that the backend Service has the matching labels, and that its port is named `http`.

## Server errors

For `StockroomServerErrors`, inspect backend logs and the Grafana route panel. Validation failures are 422; insufficient stock and stale edits are 409. Neither is a server error. Investigate database connections, query timeouts, and unexpected exceptions before restarting pods.

Connection establishment is bounded to three seconds. Database statements have a five-second timeout and row locks have a three-second timeout. A timed-out movement must roll back; retry it using the same request ID.

## Monitoring

```sh
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
kubectl -n monitoring port-forward svc/monitoring-grafana 3001:80
```

Run each forward in a separate terminal. Prometheus is at `localhost:9090`; the Targets page should show the Stockroom backend endpoints as UP. Grafana is at `localhost:3001`; open **Stockroom / Application**.

Useful queries:

```promql
sum(rate(stockroom_http_requests_total{namespace="stockroom"}[2m]))

histogram_quantile(0.95,
  sum by (le) (rate(stockroom_http_request_duration_seconds_bucket{namespace="stockroom"}[2m]))
)

sum by (status) (rate(stockroom_http_requests_total{namespace="stockroom"}[2m]))
```

An idle application can have no request-rate series until it receives traffic. The panels use a two-minute rate window. Allow several scrapes after generating traffic.

## Autoscaling

```sh
kubectl -n stockroom get hpa -w
python3 scripts/load.py --url http://stockroom.localhost:8088 --seconds 180 --workers 24
```

The generator makes authenticated reads and does not change stock. Set `OPERATOR_PASSWORD` if the workspace uses a different password. It stops after the requested duration and reports successes and failures.

The default target is 65% CPU, with two to five backend replicas. The downscale stabilization window is 120 seconds, followed by at most one pod removed per minute. A light workload may not cause scaling; inspect `kubectl top pods -n stockroom` and HPA conditions rather than inferring scale from request count.

`<unknown>` immediately after installation is normal while Metrics Server collects samples. Persistent unknown values require checking Metrics Server logs, pod readiness, and CPU requests.

## Rollout and rollback

```sh
helm history stockroom -n stockroom
kubectl -n stockroom rollout status deployment/stockroom-backend
helm rollback stockroom PREVIOUS_REVISION -n stockroom --wait --timeout 5m
```

Use an actual revision from `helm history`. Rollback restores the prior application templates and image tags. It does not revert PostgreSQL or remove migration effects. Only roll back to a version compatible with the current database schema.

## Backup and restore

Compose backup:

```sh
./scripts/backup.sh /path/to/stockroom.dump
```

Kubernetes backup:

```sh
umask 077
kubectl -n stockroom exec stockroom-postgres-0 -- \
  pg_dump -U stockroom -d stockroom -Fc > /path/to/stockroom.dump
```

Test a restore into a separate database before replacing live data. For example, with Compose PostgreSQL running:

```sh
docker compose exec -T postgres createdb -U stockroom stockroom_restore
docker compose exec -T postgres pg_restore -U stockroom -d stockroom_restore \
  --exit-on-error < /path/to/stockroom.dump
docker compose exec -T postgres psql -U stockroom -d stockroom_restore \
  -c 'SELECT count(*) FROM items;' -c 'SELECT count(*) FROM movements;'
```

The archive includes the migration revision. Before replacing the live database, stop writers, keep the old database, and verify item balances against the restored movement ledger. A backup file alone is not proof of recoverability.

## Broken image lab

The failure manifests use `stockroom-lab`, separate from the application.

```sh
kubectl apply -f troubleshooting/broken-image.yaml
kubectl -n stockroom-lab get pods
kubectl -n stockroom-lab describe deployment broken-image
kubectl -n stockroom-lab get events --sort-by=.lastTimestamp
```

The image tag does not exist, so the pod enters `ErrImagePull` or `ImagePullBackOff`. Correct it and wait for rollout:

```sh
kubectl -n stockroom-lab set image deployment/broken-image \
  nginx=nginxinc/nginx-unprivileged:1.28-alpine
kubectl -n stockroom-lab rollout status deployment/broken-image --timeout=180s
```

## Broken Service lab

```sh
kubectl apply -f troubleshooting/broken-service.yaml
kubectl -n stockroom-lab get pods --show-labels
kubectl -n stockroom-lab get endpointslices -l kubernetes.io/service-name=lab-web
kubectl -n stockroom-lab describe svc lab-web
```

The Service selector is `app=wrong-label`; the pod label is `app=lab-web`. Correct the selector:

```sh
kubectl -n stockroom-lab patch svc lab-web --type merge \
  -p '{"spec":{"selector":{"app":"lab-web"}}}'
kubectl -n stockroom-lab get endpointslices -l kubernetes.io/service-name=lab-web
```

The EndpointSlice should now contain the ready pod's IP. Remove the lab after use:

```sh
kubectl delete namespace stockroom-lab
```

## Security scan failures

The pipeline stops publishing if either image has a HIGH or CRITICAL finding. Read the package, installed version, fixed version, and advisory in the scan artifact. Update the base image or dependency and run the tests again. A clean scan means that the scanner's database found no matching issues at that time; it does not establish that the application is free of vulnerabilities.

The image build upgrades Alpine packages before switching back to the non-root runtime user. Dependencies are pinned in the Python requirements files and npm lockfile. Base-image digests should be refreshed alongside a new scan, rather than left indefinitely on an old patch release.
