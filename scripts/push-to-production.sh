#!/usr/bin/env bash
#
# Apply pending migrations to the hosted Supabase project.
#
#   bash scripts/push-to-production.sh --dry-run   # list what would run
#   bash scripts/push-to-production.sh             # actually run them
#
# Run it from anywhere, in Git Bash. Not PowerShell: this is POSIX shell.
#
# Three things this exists to get right, all of which fail with an error
# that points somewhere other than the cause:
#
#   1. db.<ref>.supabase.co resolves only on IPv6 from some networks, so
#      this goes through the session pooler on port 5432 instead. A direct
#      connection gives "hostname resolving error", which reads like the
#      project has been deleted.
#
#   2. The database password contains an `@`, which terminates the host
#      portion of a URL. Unencoded, the password is silently truncated and
#      the server says "password authentication failed" — which reads like
#      the wrong password rather than the wrong encoding. The encoder below
#      is pure bash on purpose: an earlier version shelled out to python,
#      and on a machine where `python` is the Windows Store stub that
#      produced an empty string and the same misleading auth error.
#
#   3. `supabase` may be an npm shim that is not on PATH in every shell.
#      If it is missing we fall back to npx rather than failing at the
#      point of connecting.
#
# The password is read from nexgcr.txt, which is gitignored, and is never
# printed. It is still the one that was pasted into a chat and has not been
# rotated; that remains outstanding.

set -euo pipefail

PROJECT_REF="bmrrifvtfvgagkhrmitv"
POOLER_HOST="aws-1-eu-west-1.pooler.supabase.com"
CRED_FILE="nexgcr.txt"

cd "$(dirname "$0")/.."

say() { printf '%s\n' "$*"; }
die() { printf '\n%s\n' "$*" >&2; exit 1; }

# ── percent-encode, without depending on anything ─────────────────────
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

# ── the supabase CLI, however it is installed ─────────────────────────
if command -v supabase >/dev/null 2>&1; then
  SUPABASE=(supabase)
elif command -v npx >/dev/null 2>&1; then
  say "supabase is not on PATH — falling back to npx."
  SUPABASE=(npx --yes supabase)
else
  die "Neither 'supabase' nor 'npx' is on PATH. Open Git Bash and check: command -v npx"
fi

# ── the credentials ───────────────────────────────────────────────────
[ -f "$CRED_FILE" ] || die "Cannot find $CRED_FILE in $(pwd).
It holds the database connection string and is deliberately not in git."

PW=$(grep -i 'DB Connection String' "$CRED_FILE" | sed -E 's|.*://postgres:(.*)@db\..*|\1|')

[ -n "$PW" ] || die "Could not read the password out of $CRED_FILE.
Expected a line like:
  DB Connection String:postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

ENC=$(urlencode "$PW")

[ -n "$ENC" ] || die "Percent-encoding produced nothing. That is a bug in this script, not your password."

# Length only. The password itself never reaches the terminal.
say "Project     : ${PROJECT_REF}"
say "Host        : ${POOLER_HOST}:5432 (session pooler)"
say "Password    : ${#PW} characters read from ${CRED_FILE}, ${#ENC} after encoding"
say "CLI         : ${SUPABASE[*]}"
say ""

"${SUPABASE[@]}" db push \
  --db-url "postgresql://postgres.${PROJECT_REF}:${ENC}@${POOLER_HOST}:5432/postgres" \
  "$@"
