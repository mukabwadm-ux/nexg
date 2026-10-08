#!/usr/bin/env bash
#
# Partner logins on production, so the merchant, rider and host
# portals can be opened and walked through.
#
#   bash scripts/demo-partners.sh            # create them
#   bash scripts/demo-partners.sh --remove   # take them away again
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
select count(*) as demo_accounts_left from auth.users where id::text like 'dddddddd-0000-%';
SQL
  echo "Gone."
  exit 0
fi

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
bash scripts/query-production.sh -v pw="$PW" < scripts/demo-partners.sql

cat <<'MSG'

Two logins now work on https://nexg-sepia.vercel.app/sign-in :

  demo.merchant@nexgapp.com   ->  /merchant
  demo.rider@nexgapp.com      ->  /rider
  demo.host@nexgapp.com       ->  /host

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
