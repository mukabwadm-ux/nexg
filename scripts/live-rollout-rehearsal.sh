#!/usr/bin/env bash
#
# Rehearse the 23 Nov 2026 live rollout on a throwaway local database.
#
#   bash scripts/live-rollout-rehearsal.sh
#
# 1. Builds a database at the live database's state on 11 Nov: the 280 versions
#    live has recorded, from main's files and the archived 20261111 block
#    (supabase/live-history), with no seed data.
# 2. Applies the rollout's repairs, exactly as the owner will on live.
# 3. Dry run: the list must equal what the rollout plan says, in order.
# 4. Pushes everything with --include-all, as on live.
# 5. Checks the history now equals main's files, nothing is left over, and
#    compares the schema with a database built fresh from main (the diff is
#    the set of live-only changes main lacks; it must match the known list).
#
# Needs Docker and the Supabase CLI. Uses only the local stack's default
# credentials; nothing here touches a hosted project.

set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
CONTAINER="supabase_db_$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)"
OUT="${REHEARSAL_OUT:-${RUNNER_TEMP:-/tmp}/live-rollout}"
mkdir -p "$OUT"
psql_q() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
say() { printf '\n== %s\n' "$*"; }
fail() { echo "::error::$*"; exit 1; }

say "Repeats and ids"
node scripts/check-migration-repeats.mjs --report | tee "$OUT/repairs-proof.txt"

say "Live's 11 Nov state"
node scripts/live-rollout-2026-11-23.mjs prepare "$OUT/live-1111"
node scripts/live-rollout-2026-11-23.mjs expected > "$OUT/expected-push.txt"
mv supabase/migrations "$OUT/migrations.main"
cp -r "$OUT/live-1111" supabase/migrations
restore() {
  if [ -d "$OUT/migrations.main" ]; then
    rm -rf supabase/migrations
    mv "$OUT/migrations.main" supabase/migrations
  fi
}
trap restore EXIT
# Live has real rows, not seed data, and main's seeds expect main's schema.
cp supabase/config.toml "$OUT/config.toml.orig"
sed -i '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' supabase/config.toml

supabase start || {
  echo "::warning::supabase start failed; retrying once in 20s"
  supabase stop --no-backup || true
  sleep 20
  supabase start
}
restore
trap - EXIT

psql_q -c "select version || '_' || name from supabase_migrations.schema_migrations order by version" > "$OUT/history-1111.txt"
node -e "
const v=require('./supabase/live-history/live-versions-2026-11-23.json').map(x=>x.version+'_'+x.name).join('\n');
const h=require('fs').readFileSync(process.argv[1],'utf8').trim();
if(v!==h){console.error('::error::the rebuilt 11 Nov history differs from live-versions-2026-11-23.json');process.exit(1)}
console.log('history at 11 Nov: '+h.split('\n').length+' versions, same names as live');" "$OUT/history-1111.txt"

say "Repairs"
node scripts/live-rollout-2026-11-23.mjs repairs --db-url "$DB_URL" | tee "$OUT/repairs.sh"
bash -euo pipefail "$OUT/repairs.sh"

say "Undo the repairs, check, repair again"
psql_q -f - < supabase/live-history/rollout-undo-repairs.sql | tee "$OUT/undo.txt"
if grep -q '|f$' "$OUT/undo.txt"; then fail "the undo did not restore the 20261111 rows exactly"; fi
psql_q -c "select version || '_' || name from supabase_migrations.schema_migrations order by version" > "$OUT/history-undone.txt"
diff -u "$OUT/history-1111.txt" "$OUT/history-undone.txt" || fail "after the undo the history is not live's 11 Nov history"
bash -euo pipefail "$OUT/repairs.sh"

say "Before the push: switch off live's extra category"
psql_q -f - < supabase/live-history/rollout-pre-push.sql | tee "$OUT/pre-push.txt"

say "Dry run"
supabase db push --db-url "$DB_URL" --include-all --dry-run 2>&1 | tee "$OUT/dry-run.txt"
grep -oE '[0-9]{14}_[a-z0-9_]+\.sql' "$OUT/dry-run.txt" | sed 's/\.sql$//' > "$OUT/dry-run-list.txt" || true
if ! diff -u "$OUT/expected-push.txt" "$OUT/dry-run-list.txt"; then
  fail "the dry run does not list exactly the plan's $(wc -l < "$OUT/expected-push.txt") migrations"
fi
echo "dry run lists exactly the $(wc -l < "$OUT/expected-push.txt") planned migrations, in order"

say "Push"
supabase --yes db push --db-url "$DB_URL" --include-all 2>&1 | tail -n 40

say "History after the push"
psql_q -c "select version || '_' || name from supabase_migrations.schema_migrations order by version" > "$OUT/history-after.txt"
ls supabase/migrations | sed 's/\.sql$//' > "$OUT/main-files.txt"
if ! diff -u "$OUT/main-files.txt" "$OUT/history-after.txt"; then
  fail "after the push the history is not exactly main's files (nothing missing, nothing live-only)"
fi
echo "history equals main's $(wc -l < "$OUT/main-files.txt") files: nothing unapplied, nothing live-only"

say "Checks"
psql_q -f - < supabase/live-history/rollout-post-checks.sql | tee "$OUT/post-checks.txt"
if grep -q '^FAIL' "$OUT/post-checks.txt"; then fail "a post-push check failed (see above)"; fi
# Main's own release gate (supabase/tests/26_wiring_check.sql), shown here so a
# red database job on main can be traced to its finding. It does not fail this job.
psql_q -c "select severity || '  ' || rule || '  ' || coalesce(finding, '') from public.fn_wiring_check() where severity = 'critical'" | tee "$OUT/wiring-critical.txt" || true
psql_q -f - < supabase/live-history/rollout-pause-jobs.sql | tee "$OUT/paused.txt"
paused=$(wc -l < "$OUT/paused.txt")
[ "$paused" -eq 10 ] || fail "rollout-pause-jobs.sql paused $paused jobs, not the 10 it names (a job was renamed or not created)"
psql_q -c "select jobname || '  ' || schedule || '  ' || case when active then 'on' else 'PAUSED' end from cron.job order by jobname" | tee "$OUT/cron-jobs.txt"

say "Schema compared with a database built fresh from main"
dump() { docker exec "$CONTAINER" pg_dump -U postgres --schema-only --exclude-schema=supabase_migrations postgres | grep -v '^--' | sed '/^$/d'; }
dump > "$OUT/schema-rehearsed.sql"
supabase db reset --local
dump > "$OUT/schema-fresh.sql"
diff -u "$OUT/schema-fresh.sql" "$OUT/schema-rehearsed.sql" > "$OUT/schema-diff.txt" || true
echo "$(grep -c '^[-+][^-+]' "$OUT/schema-diff.txt" || true) differing lines (fresh from main  ->  live after the rollout)"
node scripts/live-rollout-schema-diff.mjs "$OUT/schema-fresh.sql" "$OUT/schema-rehearsed.sql"

cp "$OUT/config.toml.orig" supabase/config.toml
say "Rehearsal passed"
