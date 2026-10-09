#!/usr/bin/env bash
#
# Does this Google key work for address search?
#
#   bash scripts/check-maps-key.sh            # asks for the key
#   bash scripts/check-maps-key.sh --deployed # tests the live site instead
#
# From PowerShell, `bash` resolves to the WSL launcher rather than
# Git Bash. Either use a Git Bash terminal, or:
#
#   & "C:\Program Files\Git\bin\bash.exe" scripts/check-maps-key.sh
#
# Run it before putting a key into Vercel. A key that fails here
# will fail there, and finding out at that end means a redeploy
# per attempt and a 403 that could be any of four things.
#
# It makes exactly the request `apps/web/app/api/location/search`
# makes — same endpoint, same header, same field mask — because a
# key that works for a different Places call can still be refused
# for this one.
#
# Nothing here uses Python. The first version did, and on Windows
# the system Python cannot open a Git Bash `/tmp` path — so the
# one line that read Google's reason code failed silently and the
# script printed a list of three guesses while holding the exact
# answer in a file next to it. grep and sed are Git Bash's own and
# have no such problem.
#
# The key is read from the terminal and never written anywhere:
# not to a file, not to your shell history, not to the process
# list. Nothing in this script echoes it.

set -euo pipefail

cd "$(dirname "$0")/.."

SITE="${NEXG_SITE:-https://nexg-sepia.vercel.app}"
OUT="./.maps-check.json"

cleanup() { rm -f "$OUT"; }
trap cleanup EXIT

# ── reading the response without a JSON parser ──────────────
#
# Good enough for these fields and nothing more: each is a flat
# string in Google's error envelope.

field() { # field <name> → first "name": "value" in the file
  grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$OUT" 2>/dev/null \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
}

if [ "${1:-}" = "--deployed" ]; then
  echo "Asking the deployed site to search for an address…"
  echo
  curl -s "$SITE/api/location/search?q=Yaya+Centre" --max-time 30 -o "$OUT"

  REASON=$(field reason)
  if [ -n "$REASON" ]; then
    echo "NOT WORKING"
    echo
    echo "$REASON" | fold -s -w 72
    exit 1
  fi

  COUNT=$(grep -o '"label"' "$OUT" 2>/dev/null | wc -l | tr -d ' ')
  echo "WORKING — $COUNT result(s)"
  [ "$COUNT" != "0" ] && echo "  first: $(field label)"
  exit 0
fi

printf 'Paste the key (it will not be shown): '
read -r -s KEY
printf '\n\n'

if [ -z "$KEY" ]; then
  echo "Nothing entered." >&2
  exit 1
fi

# The same call the route makes. A mismatch here is the point of
# the script, so none of it is "close enough".
BODY=$(cat <<'JSON'
{
  "textQuery": "Yaya Centre Nairobi",
  "locationBias": {
    "rectangle": {
      "low":  { "latitude": -4.8, "longitude": 33.9 },
      "high": { "latitude":  1.6, "longitude": 41.9 }
    }
  },
  "maxResultCount": 3
}
JSON
)

HTTP=$(curl -s -o "$OUT" -w '%{http_code}' \
  -X POST 'https://places.googleapis.com/v1/places:searchText' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $KEY" \
  -H 'X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location,places.plusCode' \
  -d "$BODY" --max-time 20)

unset KEY

echo "HTTP $HTTP"
echo

if [ "$HTTP" = "200" ]; then
  COUNT=$(grep -o '"formattedAddress"' "$OUT" | wc -l | tr -d ' ')
  if [ "$COUNT" = "0" ]; then
    echo "The key works, but Google found nothing for that query."
    echo 'That is unusual for "Yaya Centre Nairobi" — check the'
    echo "project is the one you think it is."
    exit 0
  fi
  echo "WORKS — $COUNT result(s):"
  grep -o '"formattedAddress"[[:space:]]*:[[:space:]]*"[^"]*"' "$OUT" \
    | sed 's/.*:[[:space:]]*"//; s/"$//; s/^/  - /'
  echo
  echo "This is the key for GOOGLE_MAPS_API_KEY in Vercel"
  echo "(no NEXT_PUBLIC_ prefix — that would publish it)."
  exit 0
fi

# ── Google's reason code, which is the whole answer ─────────
#
# The human message is "The caller does not have permission" for
# three different causes, so printing it alone tells nobody which.

CODE=$(field reason)
MSG=$(field message)

case "$CODE" in
  API_KEY_HTTP_REFERRER_BLOCKED)
    echo "THIS KEY IS RESTRICTED TO WEBSITES."
    echo
    echo "It can never work from a server: the call sends no referer."
    echo "That is the right setting for your *browser* key, which"
    echo "belongs in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."
    echo
    echo "GOOGLE_MAPS_API_KEY needs the other key — the one with"
    echo "Application restrictions set to None. The two are easy to"
    echo "swap when pasting into Vercel."
    ;;
  API_KEY_SERVICE_BLOCKED)
    echo "THE KEY'S API RESTRICTIONS EXCLUDE PLACES API (NEW)."
    echo
    echo "Add it to the key's allowed APIs, or set API restrictions"
    echo "to \"Don't restrict key\"."
    ;;
  SERVICE_DISABLED)
    echo "PLACES API (NEW) IS NOT ENABLED ON THIS PROJECT."
    echo
    echo "It is a separate entry from the older Places API."
    echo "Enable it in the API Library."
    ;;
  BILLING_DISABLED)
    echo "BILLING IS NOT ENABLED ON THIS CLOUD PROJECT."
    echo "Places API (New) will not serve a request without it."
    ;;
  API_KEY_IP_ADDRESS_BLOCKED)
    echo "THIS KEY IS RESTRICTED TO IP ADDRESSES."
    echo
    echo "Vercel functions have no fixed egress IP, so set"
    echo "Application restrictions to None."
    ;;
  API_KEY_INVALID)
    echo "THE KEY ITSELF IS NOT VALID."
    echo
    echo "Nothing to do with restrictions. Copy it again from"
    echo "Credentials → your key → Show key → the copy button,"
    echo "rather than selecting the text by hand."
    ;;
  RATE_LIMIT_EXCEEDED)
    echo "OVER QUOTA for now."
    ;;
  *)
    case "$MSG" in
      *"API key not valid"*)
        echo "THE KEY ITSELF IS NOT VALID."
        echo
        echo "Nothing to do with restrictions. Copy it again from"
        echo "Credentials → your key → Show key → the copy button,"
        echo "rather than selecting the text by hand. A single"
        echo "missing character at either end does this."
        ;;
      *)
        echo "HTTP $HTTP, and Google sent no reason code."
        echo
        [ -n "$MSG" ] && echo "Google said: $MSG"
        echo
        echo "The raw response:"
        sed 's/^/  /' "$OUT"
        ;;
    esac
    ;;
esac

exit 1
