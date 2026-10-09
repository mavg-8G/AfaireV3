#!/bin/sh
# Exercise deployment control flow without accessing Docker, GitHub or a real DB.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/scripts" "$fixture/bin"
cp "$root/scripts/update.sh" "$fixture/scripts/update.sh"
cp "$root/tests/fixtures/update-compose.yml" "$fixture/resolved-compose.yml"
printf '#!/bin/sh\necho backup >> "$UPDATE_LOG"\n' > "$fixture/scripts/backup.sh"
cat > "$fixture/bin/git" <<'MOCK'
#!/bin/sh
case "$1" in
 status) exit 0;;
 rev-parse) printf '%s\n' 1111111111111111111111111111111111111111;;
esac
MOCK
cat > "$fixture/bin/docker" <<'MOCK'
#!/bin/sh
echo "$*" >> "$UPDATE_LOG"
case "$*" in
 'compose pull '*) test "$UPDATE_CASE" != pull-failure;;
 'compose config')
   test "$UPDATE_CASE" != config-failure || exit 1
   if test "$UPDATE_CASE" = missing-image; then sed '/^    image: ghcr/d' resolved-compose.yml; else cat resolved-compose.yml; fi;;
 'image inspect '*)
   test "$#" -eq 5 || exit 1
   case "$5" in ghcr.io/example/afaire:test|ghcr.io/example/afaire-migrate:test) ;; *) echo 'Error response from daemon: page not found' >&2; exit 1;; esac
   if test "$UPDATE_CASE" = revision-failure; then echo wrong; else echo 1111111111111111111111111111111111111111; fi;;
 'inspect '*) echo postgres:18.4-bookworm;;
 'compose config --images db') echo postgres:18.4-bookworm;;
 'compose config --images '*) printf 'postgres:18.4-bookworm\nghcr.io/example/afaire-migrate:test\nghcr.io/example/afaire:test\n';;
 'compose ps -a -q db') echo test-db;;
 'compose run '*) test "$UPDATE_CASE" != migrate-failure;;
 *) exit 0;;
esac
MOCK
chmod +x "$fixture/bin/git" "$fixture/bin/docker"
printf '#!/bin/sh\nexit 0\n' > "$fixture/bin/flock"
chmod +x "$fixture/bin/flock"
PATH="$fixture/bin:$PATH"
export PATH
UPDATE_LOG="$fixture/log"
export UPDATE_LOG
for UPDATE_CASE in success pull-failure config-failure missing-image revision-failure migrate-failure; do
    export UPDATE_CASE
    printf 'AUTH_SECRET=fixture-secret\nAFAIRE_VERSION=old\n' > "$fixture/.env"
    : > "$UPDATE_LOG"
    if sh "$fixture/scripts/update.sh" > "$fixture/output" 2>&1; then result=0; else result=$?; fi
    case "$UPDATE_CASE" in
      success)
        if test "$result" != 0; then cat "$fixture/output"; exit 1; fi
        grep -q '^AUTH_SECRET=fixture-secret$' "$fixture/.env"
        grep -q '^AFAIRE_VERSION=1111111111111111111111111111111111111111$' "$fixture/.env"
        grep -q '^backup$' "$UPDATE_LOG";;
      pull-failure|config-failure|missing-image|revision-failure)
        test "$result" != 0
        ! grep -q '^compose stop' "$UPDATE_LOG"
        grep -q '^AFAIRE_VERSION=old$' "$fixture/.env";;
      migrate-failure)
        test "$result" != 0
        grep -q '^backup$' "$UPDATE_LOG"
        grep -q '^compose stop afaire-web worker$' "$UPDATE_LOG"
        ! grep -q '^compose up .*afaire-web worker$' "$UPDATE_LOG"
        grep -q '^AFAIRE_VERSION=old$' "$fixture/.env";;
    esac
    echo "Updater: $UPDATE_CASE passed"
done
sh "$root/tests/update-standalone.test.sh"
