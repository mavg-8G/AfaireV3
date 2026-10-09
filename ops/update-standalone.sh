#!/bin/sh
# Run beside docker-compose.yml and .env; no Git checkout is required.
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
version=${1:-}
case "$version" in ''|*[!0-9a-f]*) echo 'Uso: sudo sh update.sh SHA_COMPLETO_PUBLICADO' >&2; exit 1;; esac
test "${#version}" -eq 40 || { echo 'La versión debe ser un SHA completo de 40 caracteres.' >&2; exit 1; }
command -v docker >/dev/null
command -v flock >/dev/null
test -f .env && test -f docker-compose.yml || { echo 'Coloca este script junto a .env y docker-compose.yml.' >&2; exit 1; }
exec 9>.afaire-update.lock
flock -n 9 || { echo 'Ya hay una actualización en curso.' >&2; exit 1; }
# Ask Compose to read its own .env syntax, without sourcing it as shell code.
base_files=$(docker compose config --environment | sed -n 's/^COMPOSE_FILE=//p')
if test -z "$base_files"; then
    base_files=docker-compose.yml
    if test -f docker-compose.override.yml; then base_files="$base_files:docker-compose.override.yml"; fi
fi
# The previously generated override is replaced, not stacked on every update.
base_files=$(printf '%s\n' "$base_files" | awk -F: '{ out=""; for(i=1;i<=NF;i++) if($i !~ /(^|\/)docker-compose\.update\.yml$/) out=out (out ? ":" : "") $i; print out }')
test -n "$base_files"
export AFAIRE_VERSION="$version"
override=$(mktemp .afaire-compose.XXXXXX.yml)
temporary_env=
stopped=false
persisting=false
previous_override=
cleanup() {
    result=$?
    trap - EXIT
    if test "$result" -ne 0 && test "$stopped" = true; then
        compose stop afaire-web worker || true
        echo 'Actualización fallida: web y worker detenidos. Conserva el respaldo y revisa las migraciones; no se revierte la base automáticamente.' >&2
    fi
    if test "$result" -ne 0 && test "$persisting" = true && test -n "$previous_override"; then
        cp "$previous_override" docker-compose.update.yml
        override=
    fi
    if test -n "$override"; then rm -f "$override"; fi
    if test -n "$temporary_env"; then rm -f "$temporary_env"; fi
    exit "$result"
}
trap cleanup EXIT
cat > "$override" <<'YAML'
services:
  afaire-web:
    image: ${AFAIRE_IMAGE:-ghcr.io/mavg-8g/afairev3}:${AFAIRE_VERSION:?Define AFAIRE_VERSION}
    environment:
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-}
  worker:
    image: ${AFAIRE_IMAGE:-ghcr.io/mavg-8g/afairev3}:${AFAIRE_VERSION:?Define AFAIRE_VERSION}
    healthcheck:
      test: ["CMD", "node", "-e", "const p=require('node:fs').existsSync('dist/prisma-client.cjs')?require('./dist/prisma-client.cjs').createPrismaClient():new (require('@prisma/client').PrismaClient)();p.workerHeartbeat.findUnique({where:{id:'daily-planner'}}).then(h=>{if(!h||Date.now()-h.updatedAt.getTime()>300000)process.exitCode=1}).catch(()=>process.exitCode=1).finally(()=>p.$$disconnect())"]
    environment:
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-}
    networks:
      default: {}
      afaire_push_egress: {}
  migrate:
    image: ${AFAIRE_IMAGE:-ghcr.io/mavg-8g/afairev3}-migrate:${AFAIRE_VERSION:?Define AFAIRE_VERSION}
networks:
  default: {}
  afaire_push_egress:
    internal: false
YAML
compose() { COMPOSE_FILE="$base_files:$override" docker compose "$@"; }
compose config --quiet
services=$(compose config --services)
for service in db afaire-web worker migrate; do
    printf '%s\n' "$services" | grep -qx "$service" || { echo "Falta el servicio $service en tu Compose. No se han detenido los servicios." >&2; exit 1; }
done
# Pull and verify all images before affecting the running installation.
compose pull afaire-web worker migrate
resolved_config=$(compose config)
for service in afaire-web worker migrate; do
    # config --images SERVICE also includes dependency images; select by service name.
    image=$(printf '%s\n' "$resolved_config" | awk -v service="$service" '
        /^[^ ]/ { in_services=($0 == "services:"); selected=0 }
        in_services && /^  [^ ]/ { selected=($0 == "  " service ":") }
        selected && /^    image: / { print $2 }
    ')
    case "$image" in ''|*[[:space:]]*) echo "No se pudo resolver una única imagen para $service." >&2; exit 1;; esac
    revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    test "$revision" = "$version" || { echo "Imagen incompatible: $service" >&2; exit 1; }
done
existing_db=$(compose ps -a -q db)
if test -n "$existing_db"; then
    current_image=$(docker inspect --format '{{.Config.Image}}' "$existing_db")
    desired_image=$(compose config --images db)
    current_major=$(printf '%s' "$current_image" | sed -n 's/.*postgres:\([0-9]*\).*/\1/p')
    desired_major=$(printf '%s' "$desired_image" | sed -n 's/.*postgres:\([0-9]*\).*/\1/p')
    test -n "$current_major" && test "$current_major" = "$desired_major" || { echo 'Un cambio mayor de PostgreSQL requiere una migración independiente.' >&2; exit 1; }
fi
compose up -d --no-build --wait --wait-timeout 90 db
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
cp .env "backups/env-$stamp"
chmod 600 "backups/env-$stamp"
if test -f docker-compose.update.yml; then
    previous_override="backups/compose-update-$stamp.yml"
    cp docker-compose.update.yml "$previous_override"
fi
if test -n "$existing_db"; then
    backup="backups/afaire-$stamp.dump"
    compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup"
    test -s "$backup" || { echo 'El respaldo de PostgreSQL está vacío. No se han detenido los servicios.' >&2; exit 1; }
fi
stopped=true
compose stop afaire-web worker
compose run --rm --no-deps --pull never migrate
compose up -d --no-build --pull never --no-deps --wait --wait-timeout 180 afaire-web worker
temporary_env=$(mktemp .env.update.XXXXXX)
awk '!/^AFAIRE_VERSION=/ && !/^COMPOSE_FILE=/' .env > "$temporary_env"
printf '\nAFAIRE_VERSION=%s\nCOMPOSE_FILE=%s:docker-compose.update.yml\n' "$version" "$base_files" >> "$temporary_env"
# Persist only after successful migration and health checks.
persisting=true
mv "$override" docker-compose.update.yml
override=docker-compose.update.yml
mv "$temporary_env" .env
temporary_env=
override=
stopped=false
printf 'Afaire actualizado: %s\nCompose y volumen originales conservados. Respaldo en backups/.\n' "$version"
