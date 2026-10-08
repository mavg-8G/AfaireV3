#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
backup="${1:?Uso: sh scripts/restore.sh backups/archivo.dump}"
test -f "$backup"
if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "La restauración reemplaza los datos actuales. Ejecuta con CONFIRM_RESTORE=YES."
  exit 1
fi
# Keep the current state before overwriting.
sh scripts/backup.sh
docker compose stop afaire-web worker
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --exit-on-error --single-transaction' < "$backup"
docker compose up -d afaire-web worker
