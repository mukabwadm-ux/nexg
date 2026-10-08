#!/usr/bin/env bash
#
# Partner logins on production, so the merchant, rider and host
# portals can be opened and walked through.
#
#   bash scripts/demo-partners.sh            # the three live partners
#   bash scripts/demo-partners.sh --setup    # and three mid-onboarding
#   bash scripts/demo-partners.sh --remove   # take all six away again
#
# The setup three matter as much as the live three. The setup
# state is half the work in each portal and the easiest half
# never to look at: whoever is testing signs in, sees a working
# dashboard, and never finds the screen a real applicant stares
# at for a week.
#
# It asks for a password rather than taking one on the command
# line: an argument goes into your shell history and into the
# process list, where it outlives the terminal you typed it in.
# Nothing here writes the password to disk, and it is not in the
# repository.
#
# These are real credentials on a live system. Remove them when
# the testing is done — the --remove flag above does it.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" = "--remove" ]; then
  echo "Removing the demo partner accounts…"
  bash scripts/query-production.sh <<'SQL'
\set ON_ERROR_STOP on
begin;
delete from catalogue_item  where id::text like 'eeeeeeee-9999-%';
delete from catalogue_section where id::text like 'eeeeeeee-8888-%';
delete from unit            where id::text like 'eeeeeeee-7777-%';
delete from property        where id::text like 'eeeeeeee-6666-%';
delete from host_user       where user_id::text like 'eeeeeeee-0000-%';
delete from host            where id::text like 'eeeeeeee-5555-%';
delete from rider_device    where id::text like 'eeeeeeee-4444-%';
delete from rider           where id::text like 'eeeeeeee-3333-%';
delete from merchant_branch where id::text like 'eeeeeeee-2222-%';
delete from merchant_user   where user_id::text like 'eeeeeeee-0000-%';
delete from merchant        where id::text like 'eeeeeeee-1111-%';
delete from auth.identities where user_id::text like 'eeeeeeee-0000-%';
delete from auth.users      where id::text like 'eeeeeeee-0000-%';
delete from unit            where id::text like 'dddddddd-8888-%';
delete from property        where id::text like 'dddddddd-7777-%';
delete from host_user       where user_id::text like 'dddddddd-0000-%';
delete from host            where id::text like 'dddddddd-6666-%';
delete from merchant_branch where id::text like 'dddddddd-2222-%';
delete from merchant_user   where user_id::text like 'dddddddd-0000-%';
delete from merchant        where id::text like 'dddddddd-1111-%';
delete from rider           where id::text like 'dddddddd-3333-%';
delete from auth.identities where user_id::text like 'dddddddd-0000-%';
delete from auth.users      where id::text like 'dddddddd-0000-%';
commit;
select count(*) as demo_accounts_left from auth.users
 where id::text like 'dddddddd-0000-%' or id::text like 'eeeeeeee-0000-%';
SQL
  echo "Gone."
  exit 0
fi

WHICH="${1:-}"

# -s so it is not echoed to the screen as you type it.
printf 'Password for the two demo accounts: '
read -r -s PW
printf '\n'
printf 'Again, to be sure: '
read -r -s PW2
printf '\n'

if [ "$PW" != "$PW2" ]; then
  echo "Those did not match. Nothing was changed." >&2
  exit 1
fi

# Supabase refuses anything shorter, and the refusal arrives at
# sign-in rather than here, which is a confusing place to find out.
if [ "${#PW}" -lt 8 ]; then
  echo "Use at least 8 characters. Nothing was changed." >&2
  exit 1
fi

# Passed as a psql variable rather than interpolated into the SQL,
# so a quote or a backslash in the password cannot end the string
# early and change what the statement means.
# Piped on stdin rather than passed with -f: query-production.sh
# reaches psql through `docker exec`, so a file path argument is
# resolved inside the container, where this file does not exist.
if [ "$WHICH" = "--setup" ]; then
  bash scripts/query-production.sh -v pw="$PW" < scripts/demo-partners-setup.sql
else
  bash scripts/query-production.sh -v pw="$PW" < scripts/demo-partners.sql
fi

cat <<'MSG'

Two logins now work on https://nexg-sepia.vercel.app/sign-in :

  demo.merchant@nexgapp.com         ->  /merchant   live
  demo.rider@nexgapp.com            ->  /rider      active
  demo.host@nexgapp.com             ->  /host       live

And with --setup, the same three roles mid-onboarding:

  demo.merchant.setup@nexgapp.com   ->  /merchant   4 of 7
  demo.rider.setup@nexgapp.com      ->  /rider      3 of 7
  demo.host.setup@nexgapp.com       ->  /host       2 of 5

Both use the password you just typed.

What you will see: the dashboards, the navigation, the real
states. What you will not see: orders, earnings or money —
production has none, and inventing some would put figures into
the Finance console that trace back to nothing.

The merchant is deliberately not visible on the public site
(`explore_visible = false`). A convincing-looking business on a
live homepage is one a real guest could try to order from.

When you are done:  bash scripts/demo-partners.sh --remove
MSG
