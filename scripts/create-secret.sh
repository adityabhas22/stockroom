#!/usr/bin/env bash
set -euo pipefail
: "${OPERATOR_PASSWORD:?Set OPERATOR_PASSWORD to at least 12 characters}"
[[ ${#OPERATOR_PASSWORD} -ge 12 ]] || { echo "Password must be at least 12 characters" >&2; exit 1; }
namespace="${NAMESPACE:-stockroom}"
release="${RELEASE:-stockroom}"
if kubectl -n "$namespace" get secret "$release-secrets" >/dev/null 2>&1; then
  echo "Secret already exists; leaving database credentials and sessions unchanged."
  exit 0
fi
database_password=$(openssl rand -hex 24)
session_secret=$(openssl rand -hex 32)
secret_file=$(mktemp)
trap 'rm -f "$secret_file"' EXIT
chmod 600 "$secret_file"
cat > "$secret_file" <<EOF
POSTGRES_PASSWORD=$database_password
DATABASE_URL=postgresql+psycopg://stockroom:$database_password@$release-postgres:5432/stockroom
OPERATOR_PASSWORD=$OPERATOR_PASSWORD
SESSION_SECRET=$session_secret
EOF
kubectl -n "$namespace" create secret generic "$release-secrets" --from-env-file="$secret_file"
