#!/usr/bin/env bash
#
# Turns the senders on, end to end.
#
#   bash scripts/enable-messaging.sh
#
# Two edge functions: push-dispatch, which puts notifications on
# a lock screen, and notify-dispatch, which sends the SMS, email
# and WhatsApp sitting in the outbox. They are one script because
# they are one job — messages reaching people — and a second
# script is a second thing to forget.
#
# Run it from anywhere, in Git Bash. It needs you to have run
# `supabase login` once first — deploying a function and setting
# its secrets go through Supabase's management API, which uses a
# personal access token rather than the database password the
# other scripts here use.
#
# What it does, in order:
#   1. deploys the push-dispatch edge function
#   2. sets the VAPID keys and a generated dispatch secret on it
#   3. stores the function URL and that same secret in Vault, so
#      the minute-by-minute cron can call it
#   4. calls the cron function once and reports what came back
#   5. does the same for notify-dispatch
#
# Both secrets are generated here rather than typed, so the two
# halves of each pair are written from one variable and cannot
# drift apart.
#
# The private key is read from vapid-keys.txt and passed
# straight to Supabase. It is never printed, never echoed, and
# never written anywhere else.

set -euo pipefail

PROJECT_REF="bmrrifvtfvgagkhrmitv"
KEYS_FILE="vapid-keys.txt"
SUBJECT="${VAPID_SUBJECT:-mailto:hello@nexgapp.com}"

cd "$(dirname "$0")/.."

if [ ! -f "$KEYS_FILE" ]; then
  echo "No $KEYS_FILE in $(pwd)."
  echo "It holds the VAPID pair generated earlier. Without it there is nothing to deploy."
  exit 1
fi

PUBLIC_KEY=$(grep '^NEXT_PUBLIC_VAPID_PUBLIC_KEY=' "$KEYS_FILE" | cut -d= -f2-)
PRIVATE_KEY=$(grep '^VAPID_PRIVATE_KEY=' "$KEYS_FILE" | cut -d= -f2-)

if [ -z "$PUBLIC_KEY" ] || [ -z "$PRIVATE_KEY" ]; then
  echo "Could not read both keys out of $KEYS_FILE."
  exit 1
fi

# Checked before anything is deployed, so a missing login fails
# on the first line rather than half way through.
if ! npx supabase projects list >/dev/null 2>&1; then
  cat <<'MSG'
Supabase CLI is not logged in.

Run this once, approve it in the browser, then run this script again:

    npx supabase login

MSG
  exit 1
fi

# A fresh secret each run. Changing it is harmless: step 3 writes
# the same value into Vault, so the two stay in step.
DISPATCH_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')

echo "1/5  Deploying push-dispatch…"
npx supabase functions deploy push-dispatch --project-ref "$PROJECT_REF" --no-verify-jwt

echo
echo "2/5  Setting its secrets…"
npx supabase secrets set --project-ref "$PROJECT_REF" \
  "VAPID_PUBLIC_KEY=$PUBLIC_KEY" \
  "VAPID_PRIVATE_KEY=$PRIVATE_KEY" \
  "VAPID_SUBJECT=$SUBJECT" \
  "PUSH_DISPATCH_SECRET=$DISPATCH_SECRET" >/dev/null
echo "     done (values not printed)"

echo
echo "3/5  Telling the cron where to call…"
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/push-dispatch"

# Vault rather than a settings row: a row is readable by anything
# that can read rows, and this secret lets its holder trigger
# every pending notification.
bash scripts/query-production.sh <<SQL >/dev/null
delete from vault.secrets where name in ('push_dispatch_url', 'push_dispatch_secret');
select vault.create_secret('${FUNCTION_URL}', 'push_dispatch_url');
select vault.create_secret('${DISPATCH_SECRET}', 'push_dispatch_secret');
SQL
echo "     stored push_dispatch_url and push_dispatch_secret"

echo
echo "4/5  Calling it once…"
bash scripts/query-production.sh <<'SQL'
\pset pager off
select jsonb_pretty(public.cron_push_dispatch()) as dispatch;
select count(*) as waiting_to_push from public.user_notification where pushed_at is null;
SQL

echo
echo "5/5  Deploying notify-dispatch (email and SMS)…"

# The same shape as push: one function, one shared secret, two
# Vault rows. It is deployed here rather than in its own script
# because the two are one job — "messages reach people" — and a
# second script is a second thing to forget.
npx supabase functions deploy notify-dispatch --project-ref "$PROJECT_REF" --no-verify-jwt

NOTIFY_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' 
')
NOTIFY_URL="https://${PROJECT_REF}.supabase.co/functions/v1/notify-dispatch"

npx supabase secrets set --project-ref "$PROJECT_REF"   "NOTIFY_DISPATCH_SECRET=$NOTIFY_SECRET" >/dev/null

bash scripts/query-production.sh <<SQL >/dev/null
delete from vault.secrets where name in ('notify_dispatch_url', 'notify_dispatch_secret');
select vault.create_secret('${NOTIFY_URL}', 'notify_dispatch_url');
select vault.create_secret('${NOTIFY_SECRET}', 'notify_dispatch_secret');
SQL

bash scripts/query-production.sh <<'SQL'
\pset pager off
select jsonb_pretty(public.cron_notify_dispatch()) as notify_dispatch;
SQL

cat <<'MSG'

Done. Both crons run every minute from here on.

What is left before a phone actually buzzes:

  * NEXT_PUBLIC_VAPID_PUBLIC_KEY must be set on the *nexg* Vercel
    project (not nexg-zjkl), scoped to Production, and a build run
    after it was added. Until then no browser can subscribe, so
    there is nothing to push to. The bell says this in the product.

  * Somebody has to open the bell and tap "Also show these on my
    screen". Nothing subscribes on their behalf.

  * On iPhone, only after the site is added to the home screen.

And before an SMS or an email actually goes out, notify-dispatch
needs a provider. It reports which one is missing rather than
guessing, and holds the backlog until a key appears:

  * SMS — AT_API_KEY and AT_USERNAME (Africa's Talking), plus
    AT_SENDER_ID once the sender ID is approved. Or
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.

  * Email — RESEND_API_KEY and EMAIL_FROM.

  * WhatsApp — WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID, and
    for the inbound webhook WHATSAPP_VERIFY_TOKEN and
    WHATSAPP_APP_SECRET.

Set them the same way:

    npx supabase secrets set --project-ref bmrrifvtfvgagkhrmitv       RESEND_API_KEY=... EMAIL_FROM=...

One thing not to skip: until a provider exists, both OTP
functions put the code on screen instead of sending it. The
moment you set one, they stop doing that and send for real. If
the provider key is wrong, nobody can verify a phone number and
the screen no longer shows the code — so test one signup right
after setting it.
MSG
