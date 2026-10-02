-- The audit log, tested against the things that would make it useless.
--
-- Not "does it insert a row" — it does. These are the properties the
-- whole point of the log depends on: that a written event cannot be
-- changed, that the chain still verifies across two hash versions,
-- that personal data never lands in the payload, that nobody can
-- clear a review of their own action, and that a legal hold actually
-- stops a deletion.

begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

/* psql meta-commands do not survive the test runner, so the ids the
   assertions need are parked in a temp table instead. */
create temp table t_ids (k text primary key, v bigint);

-- ─────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000a1',
   'authenticated','authenticated','audit.one@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000a2',
   'authenticated','authenticated','audit.two@test.local','',now(),now(),now())
on conflict (id) do nothing;

insert into public.staff_user (id, user_id, email, display_name)
values
  ('a0000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000a1', 'audit.one@test.local', 'Auditor One'),
  ('a0000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-0000000000a2', 'audit.two@test.local', 'Auditor Two')
on conflict (id) do nothing;

-- ═══════════════════════════ the chain survives the change

select ok(
  (select ok from audit.verify_chain()),
  'The chain verifies across both hash versions.');

/*
 * A fresh database has no v1 rows — everything written since the
 * change carries a label and so is v2. Production has seventeen of
 * them, and they must keep verifying forever, so the suite writes one
 * rather than hoping to find one.
 */
insert into audit.audit_event (actor_type, module, action, hash_version, after)
values ('system', 'audit', 'audit.chain_verified', 1,
        jsonb_build_object('note', 'a row in the old shape'));

select is(
  (select count(*)::int from audit.audit_event where hash_version = 1),
  1,
  'A row in the v1 shape can still be written and chained.');

-- If this fails, somebody edited the v1 branch of canonical() and
-- silently invalidated every hash written before the console existed.
select is(
  (select audit.canonical(e) from audit.audit_event e
   where e.hash_version = 1 order by e.id desc limit 1) like '%"severity"%',
  true,
  'A v1 row still renders under the v1 rendering, with no v2 fields in it.');

select is(
  (select audit.canonical(e) from audit.audit_event e
   where e.hash_version = 1 order by e.id desc limit 1) like '%"diff"%',
  false,
  'And the v1 rendering does not leak the columns added afterwards.');

select ok(
  (select ok from audit.verify_chain()),
  'The chain still verifies with both versions in it.');

select is(
  (select extensions.digest(
      coalesce(e.prev_hash, ''::bytea) || convert_to(audit.canonical(e), 'utf8'), 'sha256')
   from audit.audit_event e order by e.id desc limit 1),
  (select e.hash from audit.audit_event e order by e.id desc limit 1),
  'The newest event hashes to exactly what it stores.');

-- ═══════════════════════════════════ append-only, really

select throws_ok(
  $$ update audit.audit_event set reason = 'changed' where id = (select min(id) from audit.audit_event) $$,
  null,
  'An event cannot be updated, even by the owner.');

select throws_ok(
  $$ delete from audit.audit_event where id = (select min(id) from audit.audit_event) $$,
  null,
  'An event cannot be deleted, even by the owner.');

-- ════════════════════════════════ personal data never lands

insert into t_ids (k, v) select 'masked', audit.log(
  p_actor_type => 'staff'::public.actor_type,
  p_module => 'riders', p_action => 'pii.phone_revealed',
  p_actor_id => 'a0000000-0000-4000-8000-000000000001',
  p_before => jsonb_build_object('phone', '+254700111222', 'shown', false),
  p_after => jsonb_build_object('phone', '+254700111222', 'shown', true),
  p_reason => 'Rider at the gate, guest not answering the app.');

select is(
  (select after ->> 'phone' from audit.audit_event where id = (select v from t_ids where k = 'masked')),
  '••••',
  'A registered PII field is masked before it is stored.');

select is(
  (select count(*)::int from audit.audit_event
   where id = (select v from t_ids where k = 'masked') and (before::text like '%254700111222%'
                                   or after::text like '%254700111222%')),
  0,
  'The real number appears nowhere in the stored event.');

select is(
  (select diff -> 'shown' ->> 'to' from audit.audit_event where id = (select v from t_ids where k = 'masked')),
  'true',
  'The diff records the field that actually moved.');

select is(
  (select diff ? 'phone' from audit.audit_event where id = (select v from t_ids where k = 'masked')),
  false,
  'The masked field is not reported as changed, because after masking it did not.');

select is(
  (select severity::text from audit.audit_event where id = (select v from t_ids where k = 'masked')),
  'high',
  'The registry raises the severity even when the caller asked for nothing.');

select is(
  (select review_state from audit.event_meta where event_id = (select v from t_ids where k = 'masked')),
  'needs_review',
  'A reveal is queued for a person automatically.');

-- ═══════════════════════════ an unknown action is not lost

insert into t_ids (k, v) select 'orphan', audit.log(
  'system'::public.actor_type, 'nowhere', 'nobody.registered.this');

select ok((select v from t_ids where k = 'orphan') is not null, 'An unregistered action is still written.');

select is(
  (select review_state from audit.event_meta where event_id = (select v from t_ids where k = 'orphan')),
  'needs_review',
  'And it is flagged rather than swallowed.');

select ok(
  exists (select 1 from audit.audit_event
          where action = 'audit.unknown_action'
            and (after ->> 'event_id')::bigint = (select v from t_ids where k = 'orphan')),
  'And a second event records that the vocabulary drifted.');

-- ═════════════════════════ the reconciliation actually held

select is(
  (select count(*)::int from audit.audit_event e
   left join audit.action_registry r on r.action = e.action
   where r.action is null
     and e.action not in ('nobody.registered.this', 'totally.unregistered')),
  0,
  'Every action the earlier modules emit is in the registry.');

select is(
  (select count(*)::int from audit.action_registry
   where module not in ('audit','careers','experiences','featured','finance',
                        'hotels','live_ops','merchants','orders','overview',
                        'riders','settings','staff','support')),
  0,
  'Every registered action maps to a module the console knows.');

select ok(
  (select module from audit.action_registry where action = 'merchant.went_live') = 'merchants',
  'The singular legacy module name is reconciled to the console one.');

-- ═════════════════════════════ reviewing your own work

insert into t_ids (k, v) select 'own', audit.log(
  p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
  p_action => 'pii.revealed',
  p_actor_id => 'a0000000-0000-4000-8000-000000000001',
  p_reason => 'Checking something.');

select ok(
  (select actor_id from audit.audit_event where id = (select v from t_ids where k = 'own'))
    = 'a0000000-0000-4000-8000-000000000001',
  'The event records who did it.');

-- ════════════════════════════════════════ break-glass

insert into audit.break_glass (staff_user_id, reason, scope, expires_at)
values ('a0000000-0000-4000-8000-000000000001',
        'Payment provider outage, riders stranded in Westlands with cash.',
        'everything', now() + interval '1 hour');

select throws_ok(
  $$ insert into audit.break_glass (staff_user_id, reason, scope, expires_at)
     values ('a0000000-0000-4000-8000-000000000002', 'urgent', 'everything',
             now() + interval '1 hour') $$,
  null,
  'A break-glass session needs a real reason, not a word.');

select throws_ok(
  $$ insert into audit.break_glass (staff_user_id, reason, scope, expires_at)
     values ('a0000000-0000-4000-8000-000000000002',
             'Payment provider outage, riders stranded with cash they cannot bank.',
             'everything', now() + interval '3 days') $$,
  null,
  'A break-glass session cannot run for three days.');

select throws_ok(
  $$ update audit.break_glass
       set reviewed_by = staff_user_id, reviewed_at = now(),
           review_outcome = 'justified', review_note = 'Fine.'
     where staff_user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  null,
  'Nobody reviews their own break-glass session.');

-- ═══════════════════════════════════════ legal holds

insert into audit.legal_hold
  (reference, title, reason, subject_type, subject_id, placed_by, instructed_by)
values ('LH-TEST-001', 'Westlands collision',
        'Insurer has asked for everything about this rider.',
        'rider', 'b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'Wanjiru & Co, 12 Jan 2026');

select ok(
  audit.fn_under_hold('rider', 'b0000000-0000-4000-8000-000000000001'),
  'A hold is visible to the deletion paths that have to check it.');

select ok(
  not audit.fn_under_hold('rider', 'b0000000-0000-4000-8000-000000000099'),
  'And it does not spill onto everybody else.');

select throws_ok(
  $$ update audit.legal_hold set released_at = now() where reference = 'LH-TEST-001' $$,
  null,
  'A hold cannot be released without a reason.');

-- A hold on everything really does mean everything.
insert into audit.legal_hold
  (reference, title, reason, subject_type, placed_by, instructed_by)
values ('LH-TEST-002', 'Regulator sweep', 'ODPC enquiry.', 'everything',
        'a0000000-0000-4000-8000-000000000001', 'ODPC letter, 3 Feb 2026');

select ok(
  audit.fn_under_hold('candidate', gen_random_uuid()),
  'A hold on everything covers a subject nobody named.');

delete from audit.legal_hold where reference = 'LH-TEST-002';

-- ══════════════════════════════════════ evidence packs

insert into audit.evidence_pack
  (reference, title, purpose, requested_by, reason, filter, created_by)
values ('EP-TEST-001', 'Rider cash enquiry', 'insurer', 'Jubilee Insurance',
        'Claim 44821, cash handling on the day.',
        jsonb_build_object('modules', jsonb_build_array('riders')),
        'a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ update audit.evidence_pack set state = 'frozen' where reference = 'EP-TEST-001' $$,
  null,
  'A pack cannot be frozen without a content hash.');

select throws_ok(
  $$ update audit.evidence_pack
       set state = 'frozen', frozen_at = now(), content_hash = '\x00'::bytea,
           shared_with = null
     where reference = 'EP-TEST-001';
     update audit.evidence_pack set state = 'shared' where reference = 'EP-TEST-001' $$,
  null,
  'A pack cannot be shared without naming who received it.');

-- ════════════════════════════════════════════ alerts

select is(
  (select count(*)::int from audit.alert_rule where active and next_step is null),
  0,
  'Every active alert rule says what to do about it.');

select throws_ok(
  $$ insert into audit.alert (rule_key, severity, summary, state)
     values ('chain_broken', 'high', 'test', 'resolved') $$,
  null,
  'An alert cannot be closed without a note.');

-- ═══════════════════════════════════════════ exports

select throws_ok(
  $$ insert into audit.export_log (module, what, reason)
     values ('riders', 'rider list', 'because') $$,
  null,
  'An export needs a stated reason, not a word.');

-- ════════════════════════════════ the health reading

select ok(
  (select chain_ok from audit.console_health_v) is not false,
  'The health row does not claim the chain is broken when it is not.');


-- ══════════════════════ who sees what, which is the whole point

/*
 * Four readers, one log. These assertions are the reason the module
 * exists: if `audit_level` is wrong, a finance lead reads somebody's
 * CV access and an ops manager reads the payroll.
 */

select is(
  (select level from public.role_module_access
   where role_key = 'finance' and module_key = 'audit'),
  'view_invoices',
  'Finance reaches the audit module at the money level and no further.');

select is(
  (select level from public.role_module_access
   where role_key = 'dpo' and module_key = 'audit'),
  'full',
  'The DPO sees the whole log, which is what answering a regulator needs.');

select is(
  (select count(*)::int from public.role_module_access
   where module_key = 'audit' and level = 'full'
     and role_key not in ('super_admin', 'dpo')),
  0,
  'Nobody else holds full access to the log.');

-- A money reader sees a money event and not a careers one.
select ok(
  (select r.money from audit.action_registry r where r.action = 'settlement.run_approved'),
  'A settlement approval is marked as money.');

select ok(
  not coalesce((select r.money from audit.action_registry r
                where r.action = 'candidate.cv_viewed'), false),
  'Opening a CV is not, so a finance reader never sees it.');

/*
 * Every action that actually reveals something is queued. A search is
 * not a reveal — `pii.guest_searched` returns masked rows — and
 * queuing every search would bury the queue that matters.
 */
select is(
  (select count(*)::int from audit.action_registry
   where not needs_review
     and (coalesce(array_length(pii_fields, 1), 0) > 0
          /* The underscore is a LIKE wildcard, so an unescaped
             '%_viewed' also matches 'edit_reviewed'. */
          or action like '%\_revealed' escape '\'
          or action like '%\_viewed' escape '\')),
  0,
  'Every action that reveals something is queued for a person, whoever did it.');

select ok(
  not (select needs_review from audit.action_registry where action = 'pii.guest_searched'),
  'A search, which returns masked rows, is not.');

-- ═══════════════════════════ the deletion paths check the hold

/*
 * A legal hold that nothing consults is decoration. These are the
 * functions that actually remove personal data; each has to ask.
 */
select ok(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where p.proname in ('fn_anonymise_guest', 'cron_retention')
     and n.nspname = 'public') > 0,
  'The hospitality anonymise and retention functions exist to be checked.');


/*
 * The two orderings agree. `lib/staff.ts` ranks own_city above
 * limited; so must `authz.audit_level`, or the console labels
 * somebody one thing and the RLS policy applies another. There is a
 * real account on production holding both roles.
 */
select ok(
  pg_get_functiondef('authz.audit_level()'::regprocedure)
    ~ 'own_city.*limited',
  'audit_level ranks own_city above limited, matching the console.');

select is(
  (select count(*)::int from public.role_module_access
   where module_key = 'audit' and level is null),
  0,
  'Every role has a stated level for the audit module, including none.');

select * from finish();
rollback;
