#!/bin/sh
# Run on the VPS with Docker Compose v2; production secrets remain in .env.
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
command -v git >/dev/null
command -v docker >/dev/null
command -v flock >/dev/null
exec 9>.afaire-update.lock
flock -n 9 || { echo 'Ya hay una actualización en curso.' >&2; exit 1; }
test -f .env || { echo 'Configura .env desde ops/production.env.example.' >&2; exit 1; }
test -z "$(git status --porcelain --untracked-files=no)" || { echo 'Hay cambios locales: revísalos antes de actualizar.' >&2; exit 1; }
git fetch origin main
git merge --ff-only origin/main
AFAIRE_VERSION=$(git rev-parse HEAD)
export AFAIRE_VERSION
docker compose config --quiet
# Download first: a failed pull leaves the current services running.
docker compose pull afaire-web worker migrate
for service in afaire-web worker migrate; do
    image=$(docker compose config --images "$service")
    revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    test "$revision" = "$AFAIRE_VERSION" || { echo "Imagen incompatible: $service" >&2; exit 1; }
done
existing_db=$(docker compose ps -a -q db)
if test -n "$existing_db"; then
    current_image=$(docker inspect --format '{{.Config.Image}}' "$existing_db")
    desired_image=$(docker compose config --images db)
    current_major=$(printf '%s' "$current_image" | sed -n 's/.*postgres:\([0-9]*\).*/\1/p')
    desired_major=$(printf '%s' "$desired_image" | sed -n 's/.*postgres:\([0-9]*\).*/\1/p')
    test -n "$current_major" && test "$current_major" = "$desired_major" || {
        echo 'Cambio de versión mayor de PostgreSQL: requiere una migración independiente.' >&2; exit 1;
    }
fi
docker compose up -d --no-build --wait --wait-timeout 90 db
if test -n "$existing_db"; then sh scripts/backup.sh; fi
stopped=false
temporary_env=
cleanup() {
    result=$?
    trap - EXIT
    if test -n "$temporary_env"; then rm -f "$temporary_env"; fi
    if test "$result" -ne 0 && test "$stopped" = true; then
        docker compose stop afaire-web worker || true
        echo 'Actualización fallida. Web y worker detenidos; conserva el respaldo y revisa los logs. No se revierte la base automáticamente.' >&2
    fi
    exit "$result"
}
trap cleanup EXIT
stopped=true
docker compose stop afaire-web worker
docker compose run --rm --no-deps --pull never migrate
docker compose up -d --no-build --pull never --no-deps --wait --wait-timeout 180 afaire-web worker
temporary_env=$(mktemp .env.update.XXXXXX)
awk '!/^AFAIRE_VERSION=/' .env > "$temporary_env"
printf '\nAFAIRE_VERSION=%s\n' "$AFAIRE_VERSION" >> "$temporary_env"
mv "$temporary_env" .env
temporary_env=
stopped=false
printf 'Afaire actualizado: %s\n' "$AFAIRE_VERSION"
