-- The connected hosts workspace (migrations 20261111000200 – 20261111001300).
--
-- The workspace's server code already refuses most of these, but every RPC
-- below can be called directly with a member's own session. So each block asks:
--
--   * does the owner's normal path work
--   * does a team member limited to one unit stay inside that unit
--   * does another host see nothing
--   * do retries and stale edits behave (same answer, or a clean conflict)

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ══════════════════ fixtures (as postgres, before any role switch)

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into t (k, v) values
  ('owner',  (select id::text from auth.users where email = 'host.live@nexgapp.com')),
  ('other',  (select id::text from auth.users where email = 'host.pending@nexgapp.com')),
  ('host_a', 'c2000000-0000-4000-8000-000000000001'),
  ('host_b', 'c2000000-0000-4000-8000-000000000002'),
  ('unit_1', 'c4000000-0000-4000-8000-000000000001'),  -- A1204, property 1
  ('unit_2', 'c4000000-0000-4000-8000-000000000002'),  -- A0810, property 1
  ('prop_2', 'c3000000-0000-4000-8000-000000000002'),
  ('unit_b', (select id::text from public.unit
               where host_id = 'c2000000-0000-4000-8000-000000000002' limit 1)),
  ('stay_1', (select id::text from public.stay
               where unit_id = 'c4000000-0000-4000-8000-000000000001' limit 1)),
  ('stay_2', (select id::text from public.stay
               where unit_id = 'c4000000-0000-4000-8000-000000000002' limit 1)),
  ('scoped', gen_random_uuid()::text),
  ('fin_id', gen_random_uuid()::text),
  ('task_id', gen_random_uuid()::text),
  ('pkg_id', gen_random_uuid()::text);

-- A manager whose access covers unit 1 only.
insert into auth.users (id, email, aud, role)
values ((select v::uuid from t where k = 'scoped'), 'scoped.manager@example.test', 'authenticated', 'authenticated');
insert into public.host_user (host_id, user_id, role, units, accepted_at)
values ((select v::uuid from t where k = 'host_a'), (select v::uuid from t where k = 'scoped'),
        'manager', array[(select v::uuid from t where k = 'unit_1')], now());

-- A live host package with a 4-hour lead time, for the placement checks.
insert into public.welcome_package (id, host_id, name, status, lead_hours)
values ((select v::uuid from t where k = 'pkg_id'), (select v::uuid from t where k = 'host_a'),
        'Test basket', 'live', 4);

select isnt((select v from t where k = 'stay_1'), null, 'The seed has a stay on unit 1.');
select isnt((select v from t where k = 'stay_2'), null, 'And one on unit 2.');

create function pg_temp.act_as(p_key text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select v from t where k = p_key), 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act_as(text) to authenticated;

set local role authenticated;

-- ══════════════════ 1. unit save respects unit scope (20261111001200)

select pg_temp.act_as('scoped');

select lives_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"A1204","floor":"12"}'::jsonb, %L::uuid) $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'unit_1')),
  'A unit-limited manager can save the unit they cover.');

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"A0810","floor":"8"}'::jsonb, %L::uuid) $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'unit_2')),
  '42501', null,
  'But not another unit on the same host. Host membership alone used to be enough.');

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"New flat"}'::jsonb) $$,
         (select v from t where k = 'host_a')),
  '42501', null,
  'Nor add a unit.');

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, jsonb_build_object('name','A1204','property_id',%L), %L::uuid) $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'prop_2'), (select v from t where k = 'unit_1')),
  '42501', null,
  'Nor move their unit to another property.');

select pg_temp.act_as('owner');

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"A1204"}'::jsonb) $$,
         (select v from t where k = 'host_a')),
  '23505', null,
  'The owner cannot create a second unit with an existing name.');

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"A1204"}'::jsonb, %L::uuid) $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'unit_2')),
  '23505', null,
  'Or rename one onto another unit''s name. The old check only looked at new units.');

select lives_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"A0810","floor":"9"}'::jsonb, %L::uuid) $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'unit_2')),
  'Saving a unit without changing its name still works.');

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"Taken"}'::jsonb, %L::uuid) $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'unit_b')),
  '42501', null,
  'A unit id from another host is refused even when the caller''s own host id is passed.');

-- ══════════════════ 2. manual finance (20261111000300)

select is(
  public.rpc_host_manual_finance_record((select v::uuid from t where k = 'host_a'),
    jsonb_build_object('id', (select v from t where k = 'fin_id'), 'stay_id', (select v from t where k = 'stay_1'),
      'kind', 'Receipt', 'amount_minor', 500000, 'recorded_on', current_date::text,
      'reference', 'MPESA-TEST-1', 'status', 'Recorded')),
  (select v::uuid from t where k = 'fin_id'),
  'The owner records a receipt against a stay.');

select is(
  public.rpc_host_manual_finance_record((select v::uuid from t where k = 'host_a'),
    jsonb_build_object('id', (select v from t where k = 'fin_id'), 'stay_id', (select v from t where k = 'stay_1'),
      'kind', 'Receipt', 'amount_minor', 500000, 'recorded_on', current_date::text,
      'reference', 'MPESA-TEST-1', 'status', 'Recorded')),
  (select v::uuid from t where k = 'fin_id'),
  'Sending the same entry again returns the same id instead of a second receipt.');

select throws_ok(
  format($$ select public.rpc_host_manual_finance_record(%L::uuid, jsonb_build_object('id',%L,'stay_id',%L,
      'kind','Receipt','amount_minor',900000,'recorded_on',current_date::text,'reference','MPESA-TEST-1','status','Recorded')) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'fin_id'), (select v from t where k = 'stay_1')),
  '22023', null,
  'The same id with a different amount is refused, not overwritten.');

select throws_ok(
  format($$ select public.rpc_host_manual_finance_record(%L::uuid, jsonb_build_object('id',gen_random_uuid(),'stay_id',%L,
      'kind','Receipt','amount_minor',100,'recorded_on',current_date::text,'reference','mpesa-test-1','status','Recorded')) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'stay_1')),
  '23505', null,
  'A payment reference can only be recorded once per host, whatever its case.');

select throws_ok(
  format($$ select public.rpc_host_manual_finance_record(%L::uuid, jsonb_build_object('id',gen_random_uuid(),'stay_id',%L,
      'kind','Refund','amount_minor',600000,'recorded_on',current_date::text,'reference','REFUND-1','status','Recorded')) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'stay_1')),
  '22023', null,
  'A refund larger than what was received for the stay is refused.');

select pg_temp.act_as('scoped');

select throws_ok(
  format($$ select public.rpc_host_manual_finance_record(%L::uuid, jsonb_build_object('id',gen_random_uuid(),'stay_id',%L,
      'kind','Receipt','amount_minor',100,'recorded_on',current_date::text,'reference','SCOPED-1','status','Recorded')) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'stay_2')),
  '42501', null,
  'A unit-limited manager cannot record money on a stay outside their unit.');

select is((select count(*)::int from public.host_manual_finance where stay_id = (select v::uuid from t where k = 'stay_1')),
  1, 'They can read entries for their own unit.');

select pg_temp.act_as('other');

select is((select count(*)::int from public.host_manual_finance where host_id = (select v::uuid from t where k = 'host_a')),
  0, 'Another host sees none of them.');

-- ══════════════════ 3. preferences (20261111000400)

select pg_temp.act_as('owner');

select lives_ok(
  format($$ select public.rpc_host_workspace_profile_save(%L::uuid, '{}'::jsonb,
      '{"business":"Seed Stays","checkIn":"14:00","checkOut":"10:00","daily":true}'::jsonb) $$,
    (select v from t where k = 'host_a')),
  'The owner saves workspace profile fields.');

select throws_ok(
  format($$ select public.rpc_host_workspace_profile_save(%L::uuid, '{}'::jsonb, '{"admin":true}'::jsonb) $$,
    (select v from t where k = 'host_a')),
  '22023', null,
  'Unknown profile keys are refused rather than stored.');

select throws_ok(
  format($$ select public.rpc_host_workspace_profile_save(%L::uuid, '{"features":{"charge_to_room":true}}'::jsonb, '{}'::jsonb) $$,
    (select v from t where k = 'host_a')),
  '22023', null,
  'Charge-to-room cannot be switched on from the workspace.');

select ok(
  (select count(*) from public.rpc_host_workspace_settings_activity((select v::uuid from t where k = 'host_a'))) >= 1,
  'The save shows in the owner''s settings activity.');

select pg_temp.act_as('scoped');

select throws_ok(
  format($$ select public.rpc_host_workspace_profile_save(%L::uuid, '{}'::jsonb, '{"business":"Mine now"}'::jsonb) $$,
    (select v from t where k = 'host_a')),
  '42501', null,
  'A manager cannot change workspace settings.');

select is(
  (select count(*)::int from public.rpc_host_workspace_settings_activity((select v::uuid from t where k = 'host_a'))),
  0, 'Nor read the settings activity.');

-- ══════════════════ 4. gallery (20261111000500)

select throws_ok(
  format($$ select public.rpc_host_workspace_photos_set('unit', %L::uuid, '[]'::jsonb, '[]'::jsonb) $$,
    (select v from t where k = 'unit_2')),
  '42501', null,
  'A unit-limited manager cannot edit another unit''s photos.');

select throws_ok(
  format($$ select public.rpc_host_workspace_photos_set('property', 'c3000000-0000-4000-8000-000000000001'::uuid, '[]'::jsonb, '[]'::jsonb) $$),
  '42501', null,
  'Or any property gallery.');

select pg_temp.act_as('owner');

select throws_ok(
  format($$ select public.rpc_host_workspace_photos_set('unit', %L::uuid, '[{"path":"stale"}]'::jsonb, '[]'::jsonb) $$,
    (select v from t where k = 'unit_1')),
  '40001', null,
  'A save based on an out-of-date gallery is refused, so two tabs cannot overwrite each other.');

-- ══════════════════ 5. package placements (20261111000700, 000800)

insert into t (k, v) select 'placement',
  (public.rpc_package_schedule((select v::uuid from t where k = 'host_a'), (select v::uuid from t where k = 'unit_1'),
     (select v::uuid from t where k = 'pkg_id'), now() + interval '2 days')).id::text;

select throws_ok(
  format($$ select public.rpc_host_package_archive(%L::uuid) $$, (select v from t where k = 'pkg_id')),
  '23503', null,
  'A package with a scheduled placement cannot be retired.');

select pg_temp.act_as('other');

select throws_ok(
  format($$ select public.rpc_host_workspace_package_cancel(%L::uuid, %L::uuid) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'placement')),
  '42501', null,
  'Another host cannot cancel it.');

select pg_temp.act_as('owner');

select lives_ok(
  format($$ select public.rpc_host_workspace_package_cancel(%L::uuid, %L::uuid) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'placement')),
  'The owner cancels the scheduled placement.');

select lives_ok(
  format($$ select public.rpc_host_workspace_package_cancel(%L::uuid, %L::uuid) $$,
    (select v from t where k = 'host_a'), (select v from t where k = 'placement')),
  'Cancelling twice is a no-op, so a retried request does not fail.');

select is(
  (public.rpc_host_package_archive((select v::uuid from t where k = 'pkg_id')) ->> 'ok'),
  'true', 'With nothing scheduled, the package retires.');

-- ══════════════════ 6. privacy status sharing (20261111000900)

select throws_ok(
  $$ select public.rpc_host_workspace_data_share_set(gen_random_uuid(), gen_random_uuid(), true) $$,
  '42501', null,
  'A host cannot share a data request''s status. Only data-request staff can.');

select pg_temp.act_as('scoped');

select is(
  (select count(*)::int from public.rpc_host_workspace_shared_data_requests((select v::uuid from t where k = 'host_a'))),
  0, 'A unit-limited manager sees no shared data requests.');

-- ══════════════════ 7. tasks (20261111001000, 001300)

select throws_ok(
  format($$ select public.rpc_host_workspace_task_save(gen_random_uuid(), %L::uuid, null,
      jsonb_build_object('title','Fix tap','kind','Maintenance','due_at',(now()+interval '1 day')::text)) $$,
    (select v from t where k = 'unit_2')),
  '42501', null,
  'A unit-limited manager cannot create a task on another unit.');

select pg_temp.act_as('owner');

select lives_ok(
  format($$ select public.rpc_host_workspace_task_save(%L::uuid, %L::uuid, null,
      jsonb_build_object('title','Turnover clean','kind','Cleaning','due_at',(now()+interval '1 day')::text)) $$,
    (select v from t where k = 'task_id'), (select v from t where k = 'unit_1')),
  'The owner creates a task.');

select lives_ok(
  format($$ select public.rpc_host_workspace_task_save(%L::uuid, %L::uuid, 1, '{"priority":"High"}'::jsonb) $$,
    (select v from t where k = 'task_id'), (select v from t where k = 'unit_1')),
  'And edits it at version 1.');

select throws_ok(
  format($$ select public.rpc_host_workspace_task_save(%L::uuid, %L::uuid, 1, '{"priority":"Urgent"}'::jsonb) $$,
    (select v from t where k = 'task_id'), (select v from t where k = 'unit_1')),
  '40001', null,
  'A second edit from the old version is a conflict, not a silent overwrite.');

select throws_ok(
  format($$ select public.rpc_host_workspace_task_save(%L::uuid, %L::uuid, 2, '{"status":"Done"}'::jsonb) $$,
    (select v from t where k = 'task_id'), (select v from t where k = 'unit_1')),
  '22023', null,
  'A cleaning task cannot be finished without completion evidence.');

reset role;  -- hosts cannot read the audit trail; check it as the owner of the database
select ok(
  exists (select 1 from audit.audit_event where action = 'host.task_saved'
           and target_id = (select v::uuid from t where k = 'unit_1')),
  'Task saves are on the audit trail.');
set local role authenticated;

select pg_temp.act_as('other');

select is((select count(*)::int from public.host_workspace_task where unit_id = (select v::uuid from t where k = 'unit_1')),
  0, 'Another host cannot read the task.');

-- ══════════════════ 8. guest guides (20261111001100, 001300)

select pg_temp.act_as('owner');

select is(
  public.rpc_host_workspace_guide_commit((select v::uuid from t where k = 'unit_1'), 0, 'draft',
    '{"articles":[]}'::jsonb, null),
  1, 'The first draft moves the guide to revision 1.');

select throws_ok(
  format($$ select public.rpc_host_workspace_guide_commit(%L::uuid, 0, 'draft', '{"articles":[]}'::jsonb, null) $$,
    (select v from t where k = 'unit_1')),
  '40001', null,
  'A save from an older revision is a conflict.');

select throws_ok(
  format($$ select public.rpc_host_workspace_guide_commit(%L::uuid, 1, 'publish', null, null) $$,
    (select v from t where k = 'unit_1')),
  '22023', null,
  'An empty guide cannot be published.');

select pg_temp.act_as('scoped');

select throws_ok(
  format($$ select public.rpc_host_workspace_guide_commit(%L::uuid, 0, 'draft', '{"articles":[]}'::jsonb, null) $$,
    (select v from t where k = 'unit_2')),
  '42501', null,
  'A unit-limited manager cannot edit another unit''s guide.');

select * from finish();
rollback;
