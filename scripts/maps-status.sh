#!/usr/bin/env bash
#
# Is everything the maps need actually in place?
#
#   bash scripts/maps-status.sh
#
# From PowerShell, `bash` is the WSL launcher rather than Git Bash:
#
#   & "C:\Program Files\Git\bin\bash.exe" scripts/maps-status.sh
#
# One command, because "are the maps working" has six answers and
# checking them one at a time — a key here, a Vercel variable
# there, zones in the database — is how three of them stay broken
# while somebody is sure they fixed it.
#
# Everything here is read-only. It changes nothing.

set -uo pipefail

cd "$(dirname "$0")/.."

WEB="${NEXG_SITE:-https://nexg-sepia.vercel.app}"
ADMIN="${NEXG_ADMIN_SITE:-https://nexg-zjkl.vercel.app}"
TMP="./.maps-status.json"
trap 'rm -f "$TMP"' EXIT

PASS=0
FAIL=0
BLOCK=0

ok()    { printf '  \033[32mOK\033[0m    %s\n' "$1"; PASS=$((PASS + 1)); }
bad()   { printf '  \033[31mNO\033[0m    %s\n' "$1"; FAIL=$((FAIL + 1)); }
block() { printf '  \033[31mBLOCK\033[0m %s\n' "$1"; BLOCK=$((BLOCK + 1)); FAIL=$((FAIL + 1)); }
warn()  { printf '  \033[33m--\033[0m    %s\n' "$1"; }
note()  { printf '        %s\n' "$1"; }

field() {
  grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$TMP" 2>/dev/null \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
}

echo
echo "═══ 1. Address search on the live site ═══════════════════"
echo

curl -s "$WEB/api/location/search?q=Yaya+Centre" --max-time 30 -o "$TMP"
REASON=$(field reason)

if [ -z "$REASON" ]; then
  N=$(grep -o '"label"' "$TMP" 2>/dev/null | wc -l | tr -d ' ')
  ok "Google is answering — $N result(s) for \"Yaya Centre\""
else
  case "$REASON" in
    *"GOOGLE_MAPS_API_KEY is not set"*)
      block "GOOGLE_MAPS_API_KEY is not set on the web project"
      note  "Vercel → nexg → Settings → Environment Variables" ;;
    *API_KEY_HTTP_REFERRER_BLOCKED*|*"referer"*)
      block "GOOGLE_MAPS_API_KEY holds a website-restricted key"
      note  "That is the browser key. The server one needs"
      note  "Application restrictions: None." ;;
    *API_KEY_SERVICE_BLOCKED*)
      block "The server key is not allowed to call Places API (New)" ;;
    *SERVICE_DISABLED*)
      block "Places API (New) is not enabled on the Cloud project" ;;
    *BILLING_DISABLED*)
      block "Billing is not enabled on the Cloud project" ;;
    *API_KEY_INVALID*|*"not valid"*)
      block "The key in GOOGLE_MAPS_API_KEY is not a valid key"
      note  "Re-copy it with the copy button, not by selecting text." ;;
    *"No map is drawn"*)
      block "No maps keys at all on the web project"
      note  "Needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and _ID too." ;;
    *"does not have permission"*)
      block "Google refused the server key (403)"
      note  "Run: bash scripts/check-maps-key.sh with the key that is"
      note  "in GOOGLE_MAPS_API_KEY — it names which of the four." ;;
    *)
      block "Refused — $(echo "$REASON" | cut -c1-72)" ;;
  esac
fi

echo
echo "═══ 2. The browser key, on both deployments ══════════════"
echo

# The capability check needs the key *and* the Map ID, and the
# route only gets past it when both are present — so reaching a
# Google error at all proves both are set on the web project.
if [ -n "$REASON" ] && [ "${REASON#*No map is drawn}" != "$REASON" ]; then
  block "web: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY / _ID missing"
else
  ok "web: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and _ID are set"
fi

ACODE=$(curl -s -o /dev/null -w '%{http_code}' "$ADMIN/" --max-time 25)
if [ "$ACODE" = "000" ]; then
  warn "admin: $ADMIN did not respond — check the URL"
  note  "Set NEXG_ADMIN_SITE if the project is at another domain."
else
  warn "admin: reachable (HTTP $ACODE), but its env cannot be read"
  note  "Vercel variables are per project. The live-ops map needs"
  note  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and NEXT_PUBLIC_GOOGLE_MAPS_ID"
  note  "set on the admin project as well as the web one."
fi

echo
echo "═══ 3. What the maps will have to draw ═══════════════════"
echo

if [ -f nexgcr.txt ] && command -v docker >/dev/null 2>&1; then
  GEO=$(bash scripts/query-production.sh 2>/dev/null <<'SQL'
select 'ZONES|' || c.name || '|' || count(z.id)
  from city c left join zone z on z.city_id = c.id and z.active
 where c.status in ('live','soft_launch') group by c.name order by c.name;
select 'BRANCH|' || count(*) filter (where location is null) || '|' || count(*)
  from merchant_branch;
select 'UNIT|' || count(*) filter (where point is null) || '|' || count(*)
  from unit where archived_at is null;
SQL
)

  echo "$GEO" | grep '^ *ZONES|' | while IFS='|' read -r _ city n; do
    city=$(echo "$city" | sed 's/^ *//; s/ *$//')
    n=$(echo "$n" | tr -d ' ')
    if [ "$n" -gt 0 ] 2>/dev/null; then
      printf '  \033[32mOK\033[0m    %s — %s active zone(s)\n' "$city" "$n"
    else
      printf '  \033[33m--\033[0m    %s — no zones, so its map draws empty\n' "$city"
    fi
  done

  B=$(echo "$GEO" | grep '^ *BRANCH|' | head -1)
  U=$(echo "$GEO" | grep '^ *UNIT|' | head -1)
  [ -n "$B" ] && warn "merchant branches with no pin: $(echo "$B" | cut -d'|' -f2 | tr -d ' ') of $(echo "$B" | cut -d'|' -f3 | tr -d ' ')"
  [ -n "$U" ] && warn "host units with no pin: $(echo "$U" | cut -d'|' -f2 | tr -d ' ') of $(echo "$U" | cut -d'|' -f3 | tr -d ' ')"
  note "Pins fill in as partners finish setup — once address"
  note "search works, which is step 1."
else
  warn "Skipped: needs nexgcr.txt and a running Docker for psql."
fi

echo
echo "══════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "  $FAIL thing(s) blocking. Address search is the one that"
  echo "  stops guests giving an address and partners onboarding."
  echo
  echo "  Test a key before putting it in Vercel:"
  echo "    bash scripts/check-maps-key.sh"
  exit 1
fi
echo "  Nothing blocking. $PASS check(s) passed."
echo "  The '--' lines are data to fill in, not configuration."
exit 0
