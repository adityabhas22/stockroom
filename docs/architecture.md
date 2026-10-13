# Architecture decisions

## Stock is a ledger operation

`items.quantity` is the current balance. Each successful receipt or issue inserts a `movements` row containing the change, resulting balance, reason, and timestamp. The balance update and ledger insert commit in one database transaction.

A movement takes a PostgreSQL `SELECT FOR UPDATE` lock on its item. If two requests try to issue four units from a balance of five, one succeeds and the other sees the new balance of one and receives HTTP 409. Neither request can create a negative balance. A database check constraint provides a second guard.

The client supplies a UUID for each movement. Retrying the same item, delta, and reason with the same UUID returns the existing record. Reusing it for different content returns 409. The browser retains the UUID after a failed request; editing the movement creates a new one.

Item details use a version number. Updates lock the row and compare that version before writing. Stock movements increment it too, so an older edit form cannot overwrite a newer state.

There is no API for editing or deleting a movement. Archiving hides a zero-stock item from inventory without removing its ledger or releasing its SKU. Database administrators can still change the tables; this is not a tamper-proof audit system.

## PostgreSQL in every test environment

SQLite does not implement PostgreSQL row locks. The backend suite therefore uses an actual PostgreSQL database, including two tests that send requests concurrently. The test fixture refuses a database name that does not end in `_test` before truncating tables.

Alembic owns the schema. The application never calls `create_all`. CI applies the migration, tests the API, checks for model drift, and exercises a downgrade/upgrade round trip against disposable data.

## One migration process per release

Compose runs a migration service before starting the API. Kubernetes runs a release-specific Job alongside the application. The API starts without changing the schema, and readiness stays false until the `items` table is accessible. Helm waits for both workload readiness and Job completion.

The Job is a regular resource rather than a pre-install hook because a new installation first needs its database Service, StatefulSet, and PVC. Application changes must remain compatible with the previous schema during rollout. Future destructive schema changes need separate expand/migrate/contract releases; Helm rollback cannot undo data migrations.

## Shared workspace access

The application has one shared operator account. It does not claim per-person attribution. The server compares the configured password, then issues a signed, HTTP-only, SameSite Strict cookie. Kubernetes enables Secure cookies by default; loopback Compose and kind deliberately use HTTP.

A required custom header on mutations blocks cross-origin HTML form submissions. No CORS origins are enabled. Nginx limits login POST requests to five per minute per source address, with a burst of ten. Ingress routes the exact session path through Nginx. Direct internal access to the API bypasses that proxy rate limit, so the backend Service is ClusterIP and the optional network policy limits its callers.

The login limit is local to each Nginx replica and sees the proxy address when used behind ingress. It is a basic abuse control, not a distributed identity service. An internet-facing deployment should replace the shared account with an identity provider and enforce login limits at the trusted edge.

Secrets are supplied at runtime. `scripts/create-secret.sh` generates database and signing secrets and does not rotate them when re-run. Signing-key rotation invalidates existing sessions. A stolen stateless session remains valid until expiry or signing-key rotation; signing out only removes the browser cookie.

## Deployment shape

The chart defaults to two frontend replicas and a backend HPA with a minimum of two replicas. CPU requests are present so utilization can be calculated. A disruption budget keeps at least one replica available during voluntary disruptions. This does not guarantee availability during node or zone failures.

PostgreSQL is a single StatefulSet replica with a persistent volume. That is sufficient for this project but remains a single point of failure. EBS volumes are tied to an availability zone. A managed database with tested backups and recovery would be the next change for a sustained service.

AWS uses two public and two private subnets. Worker nodes run in the private subnets, with no SSH access. One NAT gateway provides outbound access. This keeps the footprint smaller but makes outbound access dependent on one zone. EKS public API access is restricted to explicitly supplied CIDRs; a private endpoint is also enabled.

The EBS CSI driver uses EKS Pod Identity. Nodes require IMDSv2 with a hop limit of one. The GitHub deployment role trusts only the configured repository's `capstone` environment and has Kubernetes edit access only in `stockroom`.

## Observability

The API exports request counts and latency histograms with method, route template, and status labels. Item IDs and search text are not metric labels, preventing an unbounded time-series count. Health, readiness, and scrape traffic are excluded from application request metrics.

Grafana shows request rate, server errors, p95 latency, available replicas, route traffic, and backend CPU. The two application alerts cover missing scrapeable backends and a sustained server-error ratio. Alertmanager is installed with its default receiver; external notification delivery is not configured.

Monitoring storage is ephemeral with 24-hour retention and a 1 GB Prometheus retention limit. Dashboard definitions live in Git. Long-term metrics storage, a notification destination, and database restore scheduling are outside the current deployment.
