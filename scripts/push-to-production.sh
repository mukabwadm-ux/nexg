#!/usr/bin/env bash
#
# Apply pending migrations to the hosted Supabase project.
#
#   bash scripts/push-to-production.sh --dry-run   # list what would run
#   bash scripts/push-to-production.sh             # actually run them
#
# Run it from the repo root, in Git Bash. Not PowerShell: the $(...)
# substitutions below are POSIX shell.
#
# Two things this exists to get right, both of which fail confusingly if
# you type the command by hand:
#
#   1. db.<ref>.supabase.co resolves only on IPv6 from some networks, so
#      this goes through the session pooler on port 5432 instead. A direct
#      connection gives "hostname resolving error", which reads like the
#      project is gone.
#
#   2. The database password contains an `@`, which terminates the host
#      portion of a URL. Unencoded, the password is silently truncated and
#      you get "password authentication failed" — which reads like the
#      wrong password rather than the wrong encoding.
#
# The password is read from nexgcr.txt, which is gitignored and never
# printed. It is still the one that was pasted into a chat and has not
# been rotated; rotating it remains outstanding.

set -euo pipefail

PROJECT_REF="bmrrifvtfvgagkhrmitv"
POOLER_HOST="aws-1-eu-west-1.pooler.supabase.com"
CRED_FILE="nexgcr.txt"

cd "$(dirname "$0")/.."

if [ ! -f "$CRED_FILE" ]; then
  echo "Cannot find $CRED_FILE in $(pwd)." >&2
  echo "It holds the database connection string and is deliberately not in git." >&2
  exit 1
fi

PW=$(grep -i 'DB Connection String' "$CRED_FILE" | sed -E 's|.*://postgres:(.*)@db\..*|\1|')

if [ -z "$PW" ]; then
  echo "Could not read the password out of $CRED_FILE." >&2
  echo "Expected a line like: DB Connection String:postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" >&2
  exit 1
fi

ENC=$(printf '%s' "$PW" | python -c "import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=''))")

echo "Pushing to ${PROJECT_REF} via ${POOLER_HOST}"
echo

supabase db push \
  --db-url "postgresql://postgres.${PROJECT_REF}:${ENC}@${POOLER_HOST}:5432/postgres" \
  "$@"
