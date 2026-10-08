#!/bin/sh
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p backups
backup="backups/afaire-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup"
test -s "$backup"
echo "$backup"
# Keep 14 days locally; arrange a copy outside the VPS separately.
find backups -type f -name 'afaire-*.dump' -mtime +14 -delete
