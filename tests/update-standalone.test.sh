#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin"
cp "$root/ops/update-standalone.sh" "$fixture/update.sh"
printf 'original compose\n' > "$fixture/docker-compose.yml"
cat > "$fixture/bin/docker" <<'MOCK'
#!/bin/sh
echo "$*" >> "$UPDATE_LOG"
case "$*" in
 'compose config --environment') sed -n '/^COMPOSE_FILE=/p' .env;;
 'compose config --services') printf 'db\nafaire-web\nworker\nmigrate\n';;
 'compose pull '*) test "$UPDATE_CASE" != pull-failure;;
 'image inspect '*) if test "$UPDATE_CASE" = revision-failure; then echo wrong; else echo 1111111111111111111111111111111111111111; fi;;
 'inspect '*) echo postgres:18.4;;
 'compose config --images db') echo postgres:18.4;;
 'compose config --images '*) echo ghcr.io/example/image:test;;
 'compose ps -a -q db') echo test-db;;
 'compose exec '*) test "$UPDATE_CASE" != backup-failure || exit 1; echo dump;;
 'compose run '*) test "$UPDATE_CASE" != migrate-failure;;
 'compose up '*afaire-web*) test "$UPDATE_CASE" != health-failure;;
 *) exit 0;;
esac
MOCK
printf '#!/bin/sh\nexit 0\n' > "$fixture/bin/flock"
chmod +x "$fixture/bin/docker" "$fixture/bin/flock"
PATH="$fixture/bin:$PATH"
UPDATE_LOG="$fixture/log"
export PATH UPDATE_LOG
for UPDATE_CASE in success pull-failure revision-failure backup-failure migrate-failure health-failure; do
 export UPDATE_CASE
 printf 'AUTH_SECRET=fixture-secret\nAFAIRE_VERSION=old\nCOMPOSE_FILE=docker-compose.yml:proxy.yml\n' > "$fixture/.env"
 rm -f "$fixture/docker-compose.update.yml"
 : > "$UPDATE_LOG"
 if sh "$fixture/update.sh" 1111111111111111111111111111111111111111 > "$fixture/output" 2>&1; then result=0; else result=$?; fi
 grep -qx 'original compose' "$fixture/docker-compose.yml"
 grep -qx 'AUTH_SECRET=fixture-secret' "$fixture/.env"
 case "$UPDATE_CASE" in
 success)
   if test "$result" != 0; then cat "$fixture/output"; exit 1; fi
   grep -qx 'COMPOSE_FILE=docker-compose.yml:proxy.yml:docker-compose.update.yml' "$fixture/.env"
   test -s "$fixture/docker-compose.update.yml"
   sh "$fixture/update.sh" 1111111111111111111111111111111111111111 > "$fixture/output" 2>&1
   grep -qx 'COMPOSE_FILE=docker-compose.yml:proxy.yml:docker-compose.update.yml' "$fixture/.env";;
 *) test "$result" != 0; grep -qx 'AFAIRE_VERSION=old' "$fixture/.env"
   case "$UPDATE_CASE" in
    migrate-failure|health-failure) grep -q '^compose stop afaire-web worker$' "$UPDATE_LOG";;
    *) ! grep -q '^compose stop' "$UPDATE_LOG";;
   esac;;
 esac
 echo "Standalone updater: $UPDATE_CASE passed"
done
: > "$UPDATE_LOG"
if sh "$fixture/update.sh" invalid > "$fixture/output" 2>&1; then exit 1; fi
test ! -s "$UPDATE_LOG"
