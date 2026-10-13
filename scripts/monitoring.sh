#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${GRAFANA_PASSWORD:?Set GRAFANA_PASSWORD before installing monitoring}"
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
if ! kubectl -n monitoring get secret grafana-admin >/dev/null 2>&1; then
  secret_file=$(mktemp)
  trap 'rm -f "$secret_file"' EXIT
  chmod 600 "$secret_file"
  printf 'admin-user=admin\nadmin-password=%s\n' "$GRAFANA_PASSWORD" > "$secret_file"
  kubectl -n monitoring create secret generic grafana-admin --from-env-file="$secret_file"
fi
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack --version 92.3.1 \
  -n monitoring -f monitoring/values.yaml --wait --timeout 10m
kubectl -n monitoring create configmap stockroom-dashboard --from-file=stockroom.json=monitoring/dashboard.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n monitoring label configmap stockroom-dashboard grafana_dashboard=1 --overwrite
echo "Monitoring installed. Enable monitoring.enabled in the application Helm release."
