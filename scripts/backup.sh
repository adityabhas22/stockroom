#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_file="${1:?Usage: scripts/backup.sh /path/to/backup.dump}"
[[ ! -e "$backup_file" ]] || { echo "File already exists: $backup_file" >&2; exit 1; }
umask 077
docker compose exec -T postgres pg_dump -U stockroom -d stockroom -Fc > "$backup_file"
echo "Backup saved to $backup_file"
