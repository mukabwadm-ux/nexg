#!/usr/bin/env bash
#
# Does this Google key work for address search?
#
#   bash scripts/check-maps-key.sh            # asks for the key
#   bash scripts/check-maps-key.sh --deployed # tests the live site instead
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
# The key is read from the terminal and never written anywhere:
# not to a file, not to your shell history, not to the process
# list. Nothing in this script echoes it.

set -euo pipefail

cd "$(dirname "$0")/.."

SITE="${NEXG_SITE:-https://nexg-sepia.vercel.app}"

if [ "${1:-}" = "--deployed" ]; then
  echo "Asking the deployed site to search for an address…"
  echo
  curl -s "$SITE/api/location/search?q=Yaya+Centre" --max-time 30 \
    | python -c 'import json,sys
d = json.load(sys.stdin)
n = len(d.get("results") or [])
if d.get("reason"):
    print("NOT WORKING\n")
    print(d["reason"])
else:
    print("WORKING — %d result(s), first: %s" % (
        n, (d["results"][0].get("label") if n else "none")))
'
  exit 0
fi

printf 'Paste the server key (it will not be shown): '
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

HTTP=$(curl -s -o /tmp/nexg-maps-check.json -w '%{http_code}' \
  -X POST 'https://places.googleapis.com/v1/places:searchText' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $KEY" \
  -H 'X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location,places.plusCode' \
  -d "$BODY" --max-time 20)

unset KEY

echo "HTTP $HTTP"
echo

case "$HTTP" in
  200)
    python - <<'PY'
import json
d = json.load(open('/tmp/nexg-maps-check.json'))
places = d.get('places') or []
if not places:
    print('The key works, but Google found nothing for that query.')
    print('That is unusual for "Yaya Centre Nairobi" — check the')
    print('project is the one you think it is.')
else:
    print('WORKS. %d result(s):' % len(places))
    for p in places:
        print('  - %s — %s' % (
            (p.get('displayName') or {}).get('text', '?'),
            p.get('formattedAddress', '?')))
    print()
    print('Put this key in Vercel as GOOGLE_MAPS_API_KEY')
    print('(no NEXT_PUBLIC_ prefix — that would publish it).')
PY
    ;;
  403)
    echo "REFUSED. The three things that cause a 403, in the order"
    echo "they are usually wrong:"
    echo
    echo "  1. Places API (New) is not enabled on the project."
    echo "     It is a separate entry from the older Places API."
    echo "  2. The key has an Application restriction. It must be"
    echo "     None — this call comes from a server with no"
    echo "     referer and no fixed IP."
    echo "  3. The key's API restriction does not include"
    echo "     Places API (New)."
    echo
    echo "Google said:"
    python -c 'import json;print("  "+(json.load(open("/tmp/nexg-maps-check.json")).get("error",{}).get("message","(no message)")))' 2>/dev/null \
      || cat /tmp/nexg-maps-check.json
    ;;
  429)
    echo "QUOTA. The key is valid but the project is over its limit"
    echo "for the day, or billing is not enabled."
    ;;
  400)
    # A mistyped key and a wrong-API project both land on 400,
    # and telling somebody to check their API when they actually
    # pasted half a key wastes the afternoon this script exists
    # to save. Google distinguishes them; so should we.
    if grep -q "API key not valid" /tmp/nexg-maps-check.json 2>/dev/null; then
      echo "THE KEY ITSELF IS NOT VALID."
      echo
      echo "Nothing to do with restrictions. Copy it again from"
      echo "Credentials -> your key -> Show key, and watch for a"
      echo "missing character at either end."
    else
      echo "BAD REQUEST - the key is valid but the project most"
      echo "likely has the legacy Places API enabled rather than"
      echo "Places API (New)."
      echo
      cat /tmp/nexg-maps-check.json
    fi
    ;;
  *)
    cat /tmp/nexg-maps-check.json
    ;;
esac

rm -f /tmp/nexg-maps-check.json
