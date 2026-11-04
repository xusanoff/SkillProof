#!/usr/bin/env bash
# Replaces the database and uploaded files with a backup. Usage: scripts/restore.sh <backup-dir> --yes
# RESTORE_DB restores the database into another (existing) database, for trying a backup out.
set -euo pipefail
cd "$(dirname "$0")/.."

source_dir="${1:?usage: scripts/restore.sh <backup-dir> --yes}"
[ "${2:-}" = "--yes" ] || { echo "This overwrites current data. Add --yes to go on." >&2; exit 2; }
compose=(docker compose ${COMPOSE_FILES:-})

(cd "$source_dir" && sha256sum --quiet -c SHA256SUMS)

"${compose[@]}" exec -T -e RESTORE_DB="${RESTORE_DB:-}" postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "${RESTORE_DB:-$POSTGRES_DB}" --clean --if-exists --no-owner --exit-on-error --single-transaction' \
  <"$source_dir/database.dump"

if [ -z "${RESTORE_DB:-}" ]; then
  "${compose[@]}" exec -T api tar -C /data/uploads -xzf - <"$source_dir/uploads.tar.gz"
  "${compose[@]}" restart api worker
fi
echo "restored: $source_dir"
