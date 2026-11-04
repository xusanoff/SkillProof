#!/usr/bin/env bash
# Database and uploaded files, kept for BACKUP_KEEP_DAYS. Usage: scripts/backup.sh [directory]
set -euo pipefail
cd "$(dirname "$0")/.."

dir="${1:-backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
compose=(docker compose ${COMPOSE_FILES:-})
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$dir/$stamp"
umask 077
mkdir -p "$target"

"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"$target/database.dump"
"${compose[@]}" exec -T api tar -C /data/uploads -czf - . >"$target/uploads.tar.gz"

# A failed or truncated dump must not count as a backup, and must not push out good ones.
"${compose[@]}" exec -T postgres pg_restore --list <"$target/database.dump" >/dev/null
gzip -t "$target/uploads.tar.gz"
(cd "$target" && sha256sum database.dump uploads.tar.gz >SHA256SUMS)

find "$dir" -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime "+$keep_days" -exec rm -rf {} +
echo "backup: $target"
