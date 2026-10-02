-- Enough in the log to see the Audit console working.
--
-- Local only. Every event here goes through `audit.log`, so the chain
-- stays valid and the rows carry real hashes — a seed that inserted
-- straight into `audit_event` would leave the chain broken and the
-- first thing the console told you would be a lie.
--
-- The retention rules are the exception: their periods are left null
-- on purpose, because nobody has agreed them with counsel yet and the
-- console is supposed to say so.

do $$
declare
  v_dev uuid;
  v_city uuid;
  v_other uuid;
  v_i integer;
  v_at timestamptz;
begin
  select id into v_dev from public.staff_user order by created_at limit 1;
  select id into v_city from public.city where status = 'live' order by sort limit 1;
  if v_dev is null then return; end if;

  /* A second staff member, so two-person flows have somebody to be
     the second person. */
  select id into v_other from public.staff_user where id <> v_dev limit 1;

  -- ─────────────────────────────────────────────── sign-ins

  delete from audit.sign_in;
  delete from audit.known_device;

  for v_i in 1..18 loop
    v_at := now() - make_interval(hours => v_i * 7);
    insert into audit.sign_in (
      at, staff_user_id, email_attempted, outcome, auth_method, mfa_used,
      ip, ip_country, device_label, device_fingerprint, session_id,
      first_from_device, first_from_country,
      ended_at, ended_reason)
    values (
      v_at, v_dev, (select email from public.staff_user where id = v_dev),
      'success', 'password', v_i % 3 = 0,
      ('41.90.64.' || (10 + v_i))::inet, 'KE',
      case when v_i % 4 = 0 then 'Chrome · Windows' else 'Safari · iPhone' end,
      case when v_i % 4 = 0 then 'fp-desk-01' else 'fp-phone-01' end,
      'sess-' || v_i,
      v_i = 18, v_i = 18,
      case when v_i = 1 then null else v_at + interval '4 hours' end,
      case when v_i = 1 then null else 'signed_out' end);
  end loop;

  /* Three refusals against one address in a few minutes, which is the
     shape the repeated-failure rule is looking for. */
  for v_i in 1..4 loop
    insert into audit.sign_in (
      at, email_attempted, outcome, auth_method, ip, ip_country, device_label)
    values (now() - make_interval(mins => 40 + v_i * 2),
            'finance@nexgapp.com', 'bad_password', 'password',
            '102.68.77.4'::inet, 'NG', 'Chrome · Windows');
  end loop;

  insert into audit.known_device (staff_user_id, device_fingerprint, device_label, countries)
  values (v_dev, 'fp-phone-01', 'Safari · iPhone', array['KE']),
         (v_dev, 'fp-desk-01', 'Chrome · Windows', array['KE'])
  on conflict do nothing;

  -- ──────────────────────────────────── a week of activity

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'riders',
    p_action => 'pii.location_viewed', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'rider', p_target_label => 'KBX 441Q',
    p_reason => 'Guest reported the rider had not arrived; checked against the drop pin.',
    p_city_id => v_city,
    p_before => jsonb_build_object('lat', -1.2688, 'lng', 36.8065, 'shown', false),
    p_after => jsonb_build_object('lat', -1.2688, 'lng', 36.8065, 'shown', true),
    p_context => jsonb_build_object('surface', 'admin', 'ip_country', 'KE',
                                    'device_label', 'Chrome · Windows'));

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'hotels',
    p_action => 'pii.gate_code_revealed', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'unit', p_target_label => 'Kilimani · Unit 4B',
    p_city_id => v_city,
    p_before => jsonb_build_object('code', '4471', 'shown', false),
    p_after => jsonb_build_object('code', '4471', 'shown', true),
    p_context => jsonb_build_object('surface', 'rider_app', 'ip_country', 'KE'));

  /* Deliberately with no reason given, so the Data access tab has the
     row it is designed to sort to the top. */
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'careers',
    p_action => 'candidate.phone_revealed', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'candidate', p_target_label => 'Candidate #2214',
    p_context => jsonb_build_object('surface', 'admin', 'ip_country', 'KE'));

  -- money, including one missing its second person

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'riders',
    p_action => 'settlement.run_built', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'settlement_run', p_target_label => 'Week 14 · Nairobi',
    p_city_id => v_city,
    p_after => jsonb_build_object('amount_cents', 184250000, 'currency', 'KES',
                                  'riders', 63));

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'riders',
    p_action => 'cash.manual_adjustment', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'rider', p_target_label => 'KBX 441Q',
    p_reason => 'Deposit slip 8841 was banked but never matched; corrected by hand.',
    p_city_id => v_city,
    p_before => jsonb_build_object('cash_on_hand_cents', 1250000),
    p_after => jsonb_build_object('cash_on_hand_cents', 0, 'amount_cents', 1250000,
                                  'currency', 'KES'));

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'hotels',
    p_action => 'folio.posted', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'folio', p_target_label => 'Room 212 · Villa Rosa',
    p_city_id => v_city,
    p_after => jsonb_build_object('amount_cents', 480000, 'currency', 'KES'));

  /* An event the registry marks as money whose payload never carried
     an amount — the case the tab must render as [—] rather than 0. */
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'featured',
    p_action => 'featured.quoted', p_actor_id => v_dev,
    p_actor_label => (select email from public.staff_user where id = v_dev),
    p_target_type => 'featured_booking', p_target_label => 'Homepage band · wk 15');

  -- ordinary traffic, so the stream is not all alarms

  for v_i in 1..14 loop
    perform audit.log(
      p_actor_type => 'staff'::public.actor_type, p_module => 'merchants',
      p_action => case v_i % 4
        when 0 then 'merchant.step_saved'
        when 1 then 'merchant.branch_saved'
        when 2 then 'merchant.category_set'
        else 'merchant.phone_verified' end,
      p_actor_id => v_dev,
      p_actor_label => (select email from public.staff_user where id = v_dev),
      p_target_type => 'merchant', p_target_label => 'Merchant #' || (100 + v_i),
      p_city_id => v_city,
      p_before => jsonb_build_object('step', v_i),
      p_after => jsonb_build_object('step', v_i + 1));
  end loop;

  -- ──────────────────────────────── break-glass, reviewed

  delete from audit.break_glass;
  insert into audit.break_glass (
    staff_user_id, staff_label, opened_at, reason, scope, expires_at, closed_at, closed_by,
    reviewed_by, reviewed_at, review_outcome, review_note)
  values (
    v_dev, (select email from public.staff_user where id = v_dev),
    now() - interval '6 days',
    'M-Pesa callback outage — thirty riders could not close their shifts and were holding cash overnight.',
    'everything', now() - interval '6 days' + interval '2 hours',
    now() - interval '6 days' + interval '95 minutes', v_dev,
    v_other, now() - interval '5 days', 'justified',
    'Checked the 40 actions in the window. All of them were shift closures. Nothing touched personal data.');

  -- ───────────────────────────── a hold and a draft pack

  delete from audit.evidence_pack_event;
  delete from audit.evidence_pack;
  delete from audit.legal_hold;

  insert into audit.legal_hold (
    reference, title, reason, subject_type, subject_id, city_id,
    placed_by, instructed_by)
  values (
    'LH-2026-001', 'Westlands collision, 14 March',
    'Insurer has asked for everything about this rider and the trips either side of it.',
    'rider', gen_random_uuid(), v_city, v_dev, 'Wanjiru & Co, letter of 18 March 2026');

  insert into audit.evidence_pack (
    reference, title, purpose, requested_by, reason, filter, from_at, to_at, created_by)
  values (
    'EP-2026-001', 'Rider cash handling, week 12', 'insurer', 'Jubilee Insurance',
    'Claim 44821 — they have asked for the cash trail around the incident.',
    jsonb_build_object('modules', jsonb_build_array('riders')),
    now() - interval '30 days', now(), v_dev);

  -- ─────────────────────────────── retention, unanswered

  insert into public.retention_rule (key, subject, retain_for, basis, anonymise, module, description)
  values
    ('audit_events', 'Audit events', null, 'Legal obligation · KDPA s.37', false, 'audit',
     'The log itself. Cannot be anonymised — the chain depends on the contents.'),
    ('sign_ins', 'Sign-in records', null, 'Legitimate interest · security', false, 'audit',
     'Who signed in, from where.'),
    ('rider_location', 'Rider location history', null, 'Contract · dispatch', true, 'riders',
     'Every ping, which is the most sensitive thing we hold.'),
    ('guest_orders', 'Guest order history', null, 'Contract', true, 'orders',
     'Addresses, phone numbers and what they ordered.')
  on conflict (key) do nothing;

  /* And one rule that is set and agreed, so the tab shows both states
     rather than only the unfinished one. */
  update public.retention_rule
     set retain_for = interval '6 months',
         approved_by = v_dev,
         second_approver_id = coalesce(v_other, v_dev),
         approved_at = now() - interval '20 days',
         last_run_at = now() - interval '1 day',
         last_run_rows = 14,
         last_run_held = 1,
         module = 'careers'
   where key in (select key from public.retention_rule where subject ilike '%candidate%' limit 1);

  -- and a recorded export, with its reason

  delete from audit.export_log;
  /* Not through `rpc_record_export`: that one reads `authz.staff_id()`,
     and a seed has no session. The event is written the same way the
     RPC would write it. */
  insert into audit.export_log (
    staff_user_id, actor_label, module, what, row_count, format,
    reason, contains_pii, destination, event_id)
  values (
    v_dev, (select email from public.staff_user where id = v_dev),
    'riders', 'Rider settlement, week 14', 63, 'csv',
    'Finance asked for the week 14 payout list to reconcile against the bank statement.',
    false, 'finance@nexgapp.com',
    audit.log(
      p_actor_type => 'staff'::public.actor_type, p_module => 'riders',
      p_action => 'export.created', p_actor_id => v_dev,
      p_actor_label => (select email from public.staff_user where id = v_dev),
      p_target_type => 'export', p_target_label => 'Rider settlement, week 14',
      p_reason => 'Finance asked for the week 14 payout list to reconcile against the bank statement.',
      p_after => jsonb_build_object('rows', 63, 'format', 'csv', 'pii', false)));
exception when others then
  raise notice 'Audit seed skipped: %', sqlerrm;
end $$;

/* Raise the alerts the seeded stream should trigger, so the
   Sign-ins tab opens with something in it. */
select audit.cron_run_alerts();

/* And walk the chain once, so the Evidence tab opens on a verified
   state rather than "never checked" — which on a fresh database is
   true but says nothing. */
select audit.cron_chain_check();
