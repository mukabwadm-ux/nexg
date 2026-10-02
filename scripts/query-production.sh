#!/usr/bin/env bash
#
# Run a read-only query against the hosted database.
#
#   bash scripts/query-production.sh "select count(*) from audit.audit_event;"
#   bash scripts/query-production.sh -f some-file.sql
#
# Exists because every push to production should be followed by looking
# at production, and the connection is fiddly enough (IPv6, an `@` in the
# password, psql not always on PATH) that doing it by hand each time is
# how a verification step quietly stops happening.
#
# Same credential handling as push-to-production.sh: read from the
# gitignored nexgcr.txt, percent-encoded, never printed.

set -euo pipefail

PROJECT_REF="bmrrifvtfvgagkhrmitv"
POOLER_HOST="aws-1-eu-west-1.pooler.supabase.com"
CRED_FILE="nexgcr.txt"

cd "$(dirname "$0")/.."

die() { printf '\n%s\n' "$*" >&2; exit 1; }

urlencode() {
  local s=$1 i c out=''
  for (( i = 0; i < ${#s}; i++ )); do
    c=${s:i:1}
    case $c in
      [a-zA-Z0-9.~_-]) out+=$c ;;
      *)               out+=$(printf '%%%02X' "'$c") ;;
    esac
  done
  printf '%s' "$out"
}

[ -f "$CRED_FILE" ] || die "Cannot find $CRED_FILE in $(pwd)."

PW=$(grep -i 'DB Connection String' "$CRED_FILE" | sed -E 's|.*://postgres:(.*)@db\..*|\1|')
[ -n "$PW" ] || die "Could not read the password out of $CRED_FILE."
ENC=$(urlencode "$PW")

URL="postgresql://postgres.${PROJECT_REF}:${ENC}@${POOLER_HOST}:5432/postgres"

# psql is not installed on this machine; the one inside the local
# Supabase container is the same major version and reaches the internet.
if command -v psql >/dev/null 2>&1; then
  exec psql "$URL" "$@"
else
  exec docker exec -i supabase_db_nexg psql "$URL" "$@"
fi
