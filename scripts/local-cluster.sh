#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for tool in docker kind kubectl helm openssl; do command -v "$tool" >/dev/null || { echo "Missing: $tool" >&2; exit 1; }; done
if ! kind get clusters | grep -qx stockroom; then
  kind create cluster --name stockroom --image kindest/node:v1.32.2 --config k8s/kind.yaml
fi
export KUBECONFIG
KUBECONFIG=$(mktemp)
trap 'rm -f "$KUBECONFIG"' EXIT
kind get kubeconfig --name stockroom > "$KUBECONFIG"
docker build -t stockroom-backend:local backend
docker build -t stockroom-frontend:local frontend
kind load docker-image --name stockroom stockroom-backend:local stockroom-frontend:local
helm repo add traefik https://traefik.github.io/charts --force-update
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ --force-update
helm repo update
helm upgrade --install traefik traefik/traefik --version 34.4.1 -n ingress-system --create-namespace \
  --set service.type=NodePort --set ports.web.nodePort=30080 --set ports.websecure.expose.default=false --wait --timeout 5m
helm upgrade --install metrics-server metrics-server/metrics-server --version 3.12.2 -n kube-system \
  --set 'args[0]=--kubelet-insecure-tls' --wait --timeout 5m
kubectl apply -f k8s/namespace.yaml
OPERATOR_PASSWORD="${OPERATOR_PASSWORD:-stockroom-local}" scripts/create-secret.sh
helm upgrade --install stockroom helm/stockroom -n stockroom -f helm/stockroom/values-local.yaml \
  --wait --wait-for-jobs --timeout 5m
kubectl -n stockroom get pods,svc,hpa
echo "Open http://stockroom.localhost:8088 (or curl -H 'Host: stockroom.localhost' http://localhost:8088)."
