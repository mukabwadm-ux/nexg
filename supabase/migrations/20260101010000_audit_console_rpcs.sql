-- Everything the Audit console can do.
--
-- Not one table in the `audit` schema has an insert, update or delete
-- policy. Every write in this file is SECURITY DEFINER and checks
-- `authz.audit_level()` itself, which means there is a finite,
-- readable list of the ways this log can change — and no way at all
-- to change an event that has already been written.
--
-- Where two people are required, the second is checked against the
-- first by id, not by role, because a role check lets one person with
-- two hats approve their own work.

-- ══════════════════════════════════════ guard clauses

create or replace function audit.fn_require(p_level text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_level text := authz.audit_level();
begin
  if v_staff is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_level = 'full' and v_level <> 'full' then
    raise exception 'That needs full access to the audit log. Yours is %.',
      coalesce(v_level, 'none') using errcode = '42501';
  end if;
  if v_level is null then
    raise exception 'You do not have access to the audit log.' using errcode = '42501';
  end if;
  return v_staff;
end;
$$;

-- ═══════════════════════════════════════════ sign-ins

/*
 * Called once, by the app, immediately after authentication resolves
 * — success or failure. It is the only thing in the system that can
 * honestly say "first time from this device", because it is the only
 * thing that remembers.
 *
 * It takes an email rather than requiring a session, because the
 * failures worth seeing are the ones where no session was created.
 */
create or replace function audit.rpc_sign_in_record(
  p_email text,
  p_outcome text,
  p_auth_method text default 'password',
  p_mfa_used boolean default false,
  p_ip inet default null,
  p_ip_country text default null,
  p_device_fingerprint text default null,
  p_device_label text default null,
  p_user_agent text default null,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_user;
  v_new_device boolean := false;
  v_new_country boolean := false;
  v_id bigint;
begin
  if p_outcome not in ('success', 'bad_password', 'unknown_email', 'mfa_failed',
                       'locked', 'blocked_ip', 'expired_invite') then
    raise exception 'Unknown sign-in outcome: %', p_outcome;
  end if;

  select * into v_staff from public.staff_user where lower(email) = lower(trim(p_email));

  /* Only a successful sign-in teaches the device memory anything. A
     failure must never be able to register a new device as known. */
  if p_outcome = 'success' and v_staff.id is not null then
    if p_device_fingerprint is not null then
      v_new_device := not exists (
        select 1 from audit.known_device d
        where d.staff_user_id = v_staff.id
          and d.device_fingerprint = p_device_fingerprint);

      insert into audit.known_device
        (staff_user_id, device_fingerprint, device_label, countries)
      values (v_staff.id, p_device_fingerprint, p_device_label,
              case when p_ip_country is null then '{}' else array[p_ip_country] end)
      on conflict (staff_user_id, device_fingerprint) do update
        set last_seen = now(),
            device_label = coalesce(excluded.device_label, audit.known_device.device_label),
            countries = case
              when p_ip_country is null
                or p_ip_country = any (audit.known_device.countries)
              then audit.known_device.countries
              else audit.known_device.countries || p_ip_country end;
    end if;

    if p_ip_country is not null then
      v_new_country := not exists (
        select 1 from audit.sign_in s
        where s.staff_user_id = v_staff.id
          and s.ip_country = p_ip_country
          and s.outcome = 'success');
    end if;
  end if;

  insert into audit.sign_in (
    staff_user_id, email_attempted, outcome, auth_method, mfa_used,
    ip, ip_country, device_label, device_fingerprint, user_agent, session_id,
    first_from_device, first_from_country
  )
  values (
    v_staff.id, lower(trim(p_email)), p_outcome, p_auth_method, p_mfa_used,
    p_ip, p_ip_country, p_device_label, p_device_fingerprint, p_user_agent, p_session_id,
    v_new_device, v_new_country
  )
  returning id into v_id;

  /* And the same fact as an event, so the Activity tab is complete
     without anybody having to know sign-ins live in their own table. */
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => case
      when p_outcome = 'success' and v_new_country then 'auth.new_country'
      when p_outcome = 'success' and v_new_device then 'auth.new_device'
      when p_outcome = 'success' then 'auth.sign_in'
      when p_outcome = 'mfa_failed' then 'auth.mfa_failed'
      else 'auth.sign_in_blocked' end,
    p_actor_id => v_staff.id,
    /* The address is kept even when it matched nobody — that is the
       interesting case — but it is masked in the event. */
    p_actor_label => coalesce(v_staff.email, audit.fn_mask_email(p_email)),
    p_target_type => 'sign_in',
    p_after => jsonb_build_object('outcome', p_outcome, 'mfa', p_mfa_used),
    p_context => jsonb_build_object(
      'ip_country', p_ip_country, 'device_label', p_device_label,
      'auth_method', p_auth_method, 'session_id', p_session_id,
      'surface', 'admin'),
    p_related => jsonb_build_object('sign_in_id', v_id));

  return jsonb_build_object('ok', true, 'new_device', v_new_device,
                            'new_country', v_new_country);
end;
$$;

create or replace function audit.fn_mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then '[—]'
    else split_part(p_email, '@', 1) || '@[' || split_part(p_email, '@', 2) || ']'
  end
$$;

create or replace function audit.rpc_sign_out(p_session_id text, p_reason text default 'signed_out')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update audit.sign_in
     set ended_at = now(), ended_reason = p_reason
   where session_id = p_session_id and ended_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

/*
 * Cutting somebody off. Marks every live session ended and writes a
 * high event; actually invalidating the JWT is Supabase's job and the
 * caller does that alongside.
 */
create or replace function audit.rpc_revoke_sessions(p_staff_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  v_count integer;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Cutting somebody off without a reason is how a mistake becomes a mystery.';
  end if;

  update audit.sign_in
     set ended_at = now(), ended_reason = 'revoked'
   where staff_user_id = p_staff_user_id and ended_at is null and outcome = 'success';
  get diagnostics v_count = row_count;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'staff',
    p_action => 'auth.sessions_revoked', p_actor_id => v_me,
    p_target_type => 'staff_user', p_target_id => p_staff_user_id,
    p_target_label => (select email from public.staff_user where id = p_staff_user_id),
    p_reason => p_reason, p_severity => 'high',
    p_after => jsonb_build_object('sessions_ended', v_count));

  return jsonb_build_object('ok', true, 'sessions_ended', v_count);
end;
$$;

-- ══════════════════════════════════════════ reviewing

create or replace function audit.rpc_review_event(
  p_event_id bigint, p_state text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('any');
  v_event audit.audit_event;
begin
  if p_state not in ('reviewed', 'escalated', 'needs_review') then
    raise exception 'A review is reviewed, escalated, or back to needs_review.';
  end if;

  select * into v_event from audit.audit_event where id = p_event_id;
  if not found then
    raise exception 'No such event.';
  end if;

  /* You cannot clear a review of your own action. The whole value of
     the queue is that somebody else looked. */
  if v_event.actor_id is not null and v_event.actor_id = v_me and p_state = 'reviewed' then
    raise exception 'Somebody else has to review your own actions.';
  end if;

  if p_state = 'escalated' and coalesce(trim(p_note), '') = '' then
    raise exception 'An escalation needs a note saying what you want done.';
  end if;

  insert into audit.event_meta (event_id, review_state, reviewed_by, reviewed_at, review_note)
  values (p_event_id, p_state, v_me, now(), p_note)
  on conflict (event_id) do update
    set review_state = excluded.review_state,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        review_note = excluded.review_note,
        updated_at = now();

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => 'audit.event_reviewed', p_actor_id => v_me,
    p_target_type => 'audit_event',
    p_target_label => 'event #' || p_event_id,
    p_reason => p_note,
    p_after => jsonb_build_object('state', p_state),
    p_related => jsonb_build_object('reviewed_event_id', p_event_id));

  return jsonb_build_object('ok', true);
end;
$$;

-- ════════════════════════════════════════════ alerts

/*
 * Walks the active rules and raises what they match. Idempotent: a
 * rule that is still matching updates the count on its open alert
 * rather than filing a second one, which is the difference between a
 * queue somebody reads and a queue somebody mutes.
 */
create or replace function audit.cron_run_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r audit.alert_rule;
  v_raised integer := 0;
  v_updated integer := 0;
  g record;
begin
  for r in select * from audit.alert_rule where active loop
    for g in
      execute format($q$
        select
          %s as actor_id,
          %s as target_id,
          max(case when e.actor_label is not null then e.actor_label end) as actor_label,
          max(e.target_type) as target_type,
          max(e.city_id::text)::uuid as city_id,
          count(*)::int as n,
          min(e.id) as first_id,
          max(e.id) as last_id
        from audit.audit_event e
        where e.at > now() - $1
          and (cardinality($2::text[]) = 0 or e.action = any ($2))
          and (cardinality($3::text[]) = 0 or e.module = any ($3))
          and e.severity >= $4
        group by 1, 2
        having count(*) >= $5
      $q$,
        case when r.group_by = 'actor' then 'e.actor_id' else 'null::uuid' end,
        case when r.group_by = 'target' then 'e.target_id' else 'null::uuid' end)
      using r.time_window, r.match_actions, r.match_modules, r.min_severity,
            coalesce(r.threshold, 1)
    loop
      insert into audit.alert (
        rule_key, severity, actor_id, actor_label, target_type, target_id,
        city_id, event_count, first_event_id, last_event_id, summary)
      values (
        r.key, r.severity, g.actor_id, g.actor_label, g.target_type, g.target_id,
        g.city_id, g.n, g.first_id, g.last_id,
        r.title || ' — ' || g.n || ' in the last '
          || trim(both from r.time_window::text))
      on conflict (rule_key,
                   coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
        where state = 'open'
      do update set
        event_count = excluded.event_count,
        last_event_id = excluded.last_event_id,
        summary = excluded.summary;

      if found then v_updated := v_updated + 1; else v_raised := v_raised + 1; end if;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'raised', v_raised, 'updated', v_updated);
end;
$$;

create or replace function audit.rpc_alert_act(
  p_alert_id uuid, p_action text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('any');
  a audit.alert;
begin
  select * into a from audit.alert where id = p_alert_id;
  if not found then raise exception 'No such alert.'; end if;

  if p_action = 'acknowledge' then
    update audit.alert
       set state = 'acknowledged', acknowledged_by = v_me, acknowledged_at = now()
     where id = p_alert_id and state = 'open';

  elsif p_action in ('resolve', 'false_positive') then
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Closing an alert needs a note. "Looked at it" is a note; nothing is not.';
    end if;
    /* Closing an alert about your own actions is the same conflict as
       reviewing your own event. */
    if a.actor_id is not null and a.actor_id = v_me then
      raise exception 'Somebody else has to close an alert that is about you.';
    end if;
    update audit.alert
       set state = case when p_action = 'resolve' then 'resolved' else 'false_positive' end,
           resolved_by = v_me, resolved_at = now(), resolution_note = p_note
     where id = p_alert_id;
  else
    raise exception 'An alert is acknowledged, resolved, or marked a false positive.';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════ break-glass

create or replace function audit.rpc_break_glass_open(
  p_reason text, p_scope text, p_minutes integer default 60,
  p_module_key text default null, p_city_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_id uuid;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  if length(trim(coalesce(p_reason, ''))) < 20 then
    raise exception 'Write the emergency down — at least a sentence. This is read later by somebody who was not there.';
  end if;
  if coalesce(p_minutes, 0) < 5 or p_minutes > 480 then
    raise exception 'Between five minutes and eight hours. A longer emergency opens a new session with a fresh reason.';
  end if;

  /* One at a time. Two overlapping sessions make the window
     meaningless. */
  if exists (select 1 from audit.break_glass b
             where b.staff_user_id = v_me and b.closed_at is null and b.expires_at > now()) then
    raise exception 'You already have one open. Close it first.';
  end if;

  insert into audit.break_glass
    (staff_user_id, reason, scope, module_key, city_id, expires_at)
  values (v_me, trim(p_reason), p_scope, p_module_key, p_city_id,
          now() + make_interval(mins => p_minutes))
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'staff',
    p_action => 'auth.break_glass_started', p_actor_id => v_me,
    p_target_type => 'break_glass', p_target_id => v_id,
    p_reason => trim(p_reason), p_severity => 'high',
    p_city_id => p_city_id,
    p_after => jsonb_build_object('scope', p_scope, 'module', p_module_key,
                                  'minutes', p_minutes));

  return jsonb_build_object('ok', true, 'id', v_id,
    'expires_at', now() + make_interval(mins => p_minutes));
end;
$$;

create or replace function audit.rpc_break_glass_close(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  b audit.break_glass;
begin
  select * into b from audit.break_glass where id = p_id;
  if not found then raise exception 'No such session.'; end if;
  if b.staff_user_id <> v_me and authz.audit_level() <> 'full' then
    raise exception 'Only the person who opened it, or the audit team, can close it.'
      using errcode = '42501';
  end if;

  update audit.break_glass set closed_at = now(), closed_by = v_me
   where id = p_id and closed_at is null;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'staff',
    p_action => 'auth.break_glass_ended', p_actor_id => v_me,
    p_target_type => 'break_glass', p_target_id => p_id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function audit.rpc_break_glass_review(
  p_id uuid, p_outcome text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  b audit.break_glass;
begin
  select * into b from audit.break_glass where id = p_id;
  if not found then raise exception 'No such session.'; end if;
  if b.staff_user_id = v_me then
    raise exception 'You cannot review your own break-glass session.';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'A review needs a note. What did they actually do with it?';
  end if;

  update audit.break_glass
     set reviewed_by = v_me, reviewed_at = now(),
         review_outcome = p_outcome, review_note = p_note
   where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════ holds and packs

create or replace function audit.rpc_legal_hold_place(
  p_reference text, p_title text, p_reason text, p_subject_type text,
  p_instructed_by text, p_subject_id uuid default null,
  p_city_id uuid default null, p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  v_id uuid;
begin
  if coalesce(trim(p_instructed_by), '') = '' then
    raise exception 'Name who instructed the hold. "Legal said so" is not a record.';
  end if;

  insert into audit.legal_hold
    (reference, title, reason, subject_type, subject_id, city_id,
     from_at, to_at, placed_by, instructed_by)
  values (p_reference, p_title, p_reason, p_subject_type, p_subject_id, p_city_id,
          p_from, p_to, v_me, p_instructed_by)
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => 'audit.legal_hold_set', p_actor_id => v_me,
    p_target_type => p_subject_type, p_target_id => p_subject_id,
    p_target_label => p_reference, p_reason => p_reason, p_severity => 'high',
    p_city_id => p_city_id,
    p_after => jsonb_build_object('instructed_by', p_instructed_by,
                                  'subject_type', p_subject_type));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function audit.rpc_legal_hold_release(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  h audit.legal_hold;
begin
  select * into h from audit.legal_hold where id = p_id;
  if not found then raise exception 'No such hold.'; end if;
  if h.released_at is not null then
    raise exception 'That hold is already released.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Releasing a hold needs a reason. Deletion resumes the moment you do.';
  end if;
  /* The person who placed it cannot release it alone. A hold that one
     person can both set and lift protects nothing. */
  if h.placed_by = v_me then
    raise exception 'Somebody other than the person who placed the hold has to release it.';
  end if;

  update audit.legal_hold
     set released_by = v_me, released_at = now(), release_reason = p_reason
   where id = p_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => 'audit.legal_hold_released', p_actor_id => v_me,
    p_target_type => h.subject_type, p_target_id => h.subject_id,
    p_target_label => h.reference, p_reason => p_reason, p_severity => 'high',
    p_approved_by => h.placed_by);

  return jsonb_build_object('ok', true);
end;
$$;

/*
 * Freezing a pack. The filter runs once, the matching events are
 * pinned by id with the hash they had at this moment, and the whole
 * set is digested. Running the same filter tomorrow and getting a
 * different digest means the log moved — which is exactly what the
 * pack exists to be able to prove did not happen.
 */
create or replace function audit.rpc_pack_create(
  p_reference text, p_title text, p_purpose text, p_requested_by text,
  p_reason text, p_filter jsonb, p_from timestamptz default null,
  p_to timestamptz default null, p_legal_hold_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  v_id uuid;
begin
  insert into audit.evidence_pack
    (reference, title, purpose, requested_by, reason, filter,
     from_at, to_at, legal_hold_id, created_by)
  values (p_reference, p_title, p_purpose, p_requested_by, p_reason, p_filter,
          p_from, p_to, p_legal_hold_id, v_me)
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => 'audit.pack_created', p_actor_id => v_me,
    p_target_type => 'evidence_pack', p_target_id => v_id,
    p_target_label => p_reference, p_reason => p_reason,
    p_after => jsonb_build_object('purpose', p_purpose, 'requested_by', p_requested_by));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function audit.rpc_pack_freeze(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  p audit.evidence_pack;
  v_chain record;
  v_count integer;
  v_hash bytea;
  v_first bigint;
  v_last bigint;
begin
  select * into p from audit.evidence_pack where id = p_id;
  if not found then raise exception 'No such pack.'; end if;
  if p.state <> 'draft' then
    raise exception 'That pack is already frozen. Create a new one rather than changing this.';
  end if;

  /* Pin the events. The filter is deliberately simple — a time
     window, modules, actions, actors, a target — because an evidence
     pack whose selection nobody can re-run by hand is not evidence. */
  insert into audit.evidence_pack_event (pack_id, event_id, hash_at_freeze)
  select p_id, e.id, e.hash
  from audit.audit_event e
  where (p.from_at is null or e.at >= p.from_at)
    and (p.to_at is null or e.at <= p.to_at)
    and (p.filter -> 'modules' is null
         or e.module = any (select jsonb_array_elements_text(p.filter -> 'modules')))
    and (p.filter -> 'actions' is null
         or e.action = any (select jsonb_array_elements_text(p.filter -> 'actions')))
    and (p.filter -> 'actor_ids' is null
         or e.actor_id::text = any (select jsonb_array_elements_text(p.filter -> 'actor_ids')))
    and (p.filter ->> 'target_id' is null
         or e.target_id::text = p.filter ->> 'target_id')
    and (p.filter ->> 'severity' is null
         or e.severity >= (p.filter ->> 'severity')::public.audit_severity)
  on conflict do nothing;

  select count(*), min(event_id), max(event_id)
    into v_count, v_first, v_last
  from audit.evidence_pack_event where pack_id = p_id;

  if v_count = 0 then
    raise exception 'That filter matched nothing. An empty pack is not an answer.';
  end if;

  /* One digest over every event in id order. */
  select extensions.digest(
           string_agg(audit.canonical(e), E'\n' order by e.id), 'sha256')
    into v_hash
  from audit.audit_event e
  join audit.evidence_pack_event pe on pe.event_id = e.id
  where pe.pack_id = p_id;

  /* And the state of the chain at this moment, recorded with it. */
  select * into v_chain from audit.verify_chain();

  update audit.evidence_pack
     set state = 'frozen', frozen_at = now(), content_hash = v_hash,
         event_count = v_count, first_event_id = v_first, last_event_id = v_last,
         chain_ok = v_chain.ok, chain_checked_at = now()
   where id = p_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => 'audit.pack_signed', p_actor_id => v_me,
    p_target_type => 'evidence_pack', p_target_id => p_id,
    p_target_label => p.reference, p_severity => 'high',
    p_after => jsonb_build_object(
      'events', v_count, 'hash', left(encode(v_hash, 'hex'), 16),
      'chain_ok', v_chain.ok));

  return jsonb_build_object('ok', true, 'events', v_count,
    'hash', encode(v_hash, 'hex'), 'chain_ok', v_chain.ok);
end;
$$;

create or replace function audit.rpc_pack_share(
  p_id uuid, p_shared_with text, p_how text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  p audit.evidence_pack;
begin
  select * into p from audit.evidence_pack where id = p_id;
  if not found then raise exception 'No such pack.'; end if;
  if p.state <> 'frozen' then
    raise exception 'Freeze it first. Sharing a draft shares something that can still change.';
  end if;
  if coalesce(trim(p_shared_with), '') = '' then
    raise exception 'Name who received it.';
  end if;

  update audit.evidence_pack
     set state = 'shared', shared_at = now(),
         shared_with = p_shared_with, shared_how = p_how
   where id = p_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => 'audit.pack_shared', p_actor_id => v_me,
    p_target_type => 'evidence_pack', p_target_id => p_id,
    p_target_label => p.reference, p_severity => 'high',
    p_reason => 'Shared with ' || p_shared_with,
    p_after => jsonb_build_object('with', p_shared_with, 'how', p_how));

  return jsonb_build_object('ok', true);
end;
$$;

-- ═════════════════════════════════════════ the chain

create or replace function audit.rpc_verify_chain()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('any');
  v record;
begin
  select * into v from audit.verify_chain();

  insert into audit.chain_check (ok, events_checked, first_bad_id, detail, run_by, trigger)
  values (v.ok, v.events_checked, v.first_bad_id, v.detail, v_me, 'manual');

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'audit',
    p_action => case when v.ok then 'audit.chain_verified' else 'audit.chain_failed' end,
    p_actor_id => v_me,
    p_severity => case when v.ok then 'info' else 'high' end::public.audit_severity,
    p_after => jsonb_build_object('ok', v.ok, 'checked', v.events_checked,
                                  'first_bad_id', v.first_bad_id));

  return jsonb_build_object('ok', v.ok, 'events_checked', v.events_checked,
    'first_bad_id', v.first_bad_id, 'detail', v.detail);
end;
$$;

create or replace function audit.cron_chain_check()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from audit.verify_chain();

  insert into audit.chain_check (ok, events_checked, first_bad_id, detail, trigger)
  values (v.ok, v.events_checked, v.first_bad_id, v.detail, 'cron');

  /* Only a failure writes an event. A nightly success that logged
     itself would be 365 rows a year saying nothing happened. */
  if not v.ok then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'audit',
      p_action => 'audit.chain_failed', p_severity => 'high',
      p_actor_label => '[System] · nightly check',
      p_after => jsonb_build_object('first_bad_id', v.first_bad_id, 'detail', v.detail));
  end if;

  return jsonb_build_object('ok', v.ok, 'events_checked', v.events_checked);
end;
$$;

-- ═════════════════════════════════════════ exports

/*
 * Called by whatever produced the file, before the bytes are handed
 * over. The reason is required and the event is written first, so an
 * export that fails halfway still leaves the intent recorded.
 */
create or replace function audit.rpc_record_export(
  p_module text, p_what text, p_reason text, p_row_count integer default null,
  p_format text default 'csv', p_contains_pii boolean default false,
  p_filter jsonb default null, p_destination text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_event bigint;
  v_id uuid;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say what the export is for, in a sentence. It is read by somebody deciding whether it should have happened.';
  end if;

  v_event := audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => p_module,
    p_action => 'export.created', p_actor_id => v_me,
    p_target_type => 'export', p_target_label => p_what,
    p_reason => p_reason, p_severity => 'high',
    p_after => jsonb_build_object('rows', p_row_count, 'format', p_format,
                                  'pii', p_contains_pii),
    p_context => jsonb_build_object('surface', 'admin'));

  insert into audit.export_log
    (staff_user_id, actor_label, module, what, filter, row_count, format,
     reason, contains_pii, destination, event_id)
  values (v_me, (select email from public.staff_user where id = v_me),
          p_module, p_what, p_filter, p_row_count, p_format,
          p_reason, p_contains_pii, p_destination, v_event)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'event_id', v_event);
end;
$$;

-- ═══════════════════════════════════════ retention

create or replace function audit.rpc_retention_set(
  p_key text, p_retain_for interval, p_basis text,
  p_anonymise boolean default true, p_module text default null,
  p_description text default null, p_subject text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  v_before jsonb;
  v_existing public.retention_rule;
begin
  select * into v_existing from public.retention_rule where key = p_key;
  v_before := to_jsonb(v_existing);

  insert into public.retention_rule
    (key, subject, retain_for, basis, anonymise, module, description, updated_by, updated_at)
  values (p_key, coalesce(p_subject, p_key), p_retain_for, p_basis,
          p_anonymise, p_module, p_description, v_me, now())
  on conflict (key) do update set
    retain_for = excluded.retain_for,
    basis = excluded.basis,
    anonymise = excluded.anonymise,
    module = coalesce(excluded.module, public.retention_rule.module),
    description = coalesce(excluded.description, public.retention_rule.description),
    subject = coalesce(excluded.subject, public.retention_rule.subject),
    updated_by = v_me,
    updated_at = now(),
    /* Changing a period voids its approval. Two people agreed the old
       number, not this one. */
    approved_by = null, second_approver_id = null, approved_at = null;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'settings.retention_rule_changed', p_actor_id => v_me,
    p_target_type => 'retention_rule', p_target_label => p_key,
    p_severity => 'high',
    p_before => v_before,
    p_after => to_jsonb((select r from public.retention_rule r where r.key = p_key)));

  return jsonb_build_object('ok', true, 'needs_approval', true);
end;
$$;

create or replace function audit.rpc_retention_approve(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := audit.fn_require('full');
  r public.retention_rule;
begin
  select * into r from public.retention_rule where key = p_key;
  if not found then raise exception 'No such rule.'; end if;
  if r.retain_for is null then
    raise exception 'Set a period before approving one. There is nothing here to agree to.';
  end if;

  if r.approved_by is null then
    update public.retention_rule set approved_by = v_me where key = p_key;
    return jsonb_build_object('ok', true, 'state', 'awaiting_second_approver');
  end if;

  if r.approved_by = v_me then
    raise exception 'You have already approved this. It needs a second person.';
  end if;

  update public.retention_rule
     set second_approver_id = v_me, approved_at = now()
   where key = p_key;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'settings.retention_rule_changed', p_actor_id => v_me,
    p_target_type => 'retention_rule', p_target_label => p_key,
    p_approved_by => r.approved_by, p_severity => 'high',
    p_reason => 'Second approval',
    p_after => jsonb_build_object('retain_for', r.retain_for::text, 'approved', true));

  return jsonb_build_object('ok', true, 'state', 'approved');
end;
$$;

grant execute on function audit.rpc_sign_in_record(text, text, text, boolean, inet, text, text, text, text, text) to authenticated;
grant execute on function audit.fn_mask_email(text) to authenticated;
grant execute on function audit.rpc_sign_out(text, text) to authenticated;
grant execute on function audit.rpc_revoke_sessions(uuid, text) to authenticated;
grant execute on function audit.rpc_review_event(bigint, text, text) to authenticated;
grant execute on function audit.rpc_alert_act(uuid, text, text) to authenticated;
grant execute on function audit.rpc_break_glass_open(text, text, integer, text, uuid) to authenticated;
grant execute on function audit.rpc_break_glass_close(uuid) to authenticated;
grant execute on function audit.rpc_break_glass_review(uuid, text, text) to authenticated;
grant execute on function audit.rpc_legal_hold_place(text, text, text, text, text, uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function audit.rpc_legal_hold_release(uuid, text) to authenticated;
grant execute on function audit.rpc_pack_create(text, text, text, text, text, jsonb, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function audit.rpc_pack_freeze(uuid) to authenticated;
grant execute on function audit.rpc_pack_share(uuid, text, text) to authenticated;
grant execute on function audit.rpc_verify_chain() to authenticated;
grant execute on function audit.rpc_record_export(text, text, text, integer, text, boolean, jsonb, text) to authenticated;
grant execute on function audit.rpc_retention_set(text, interval, text, boolean, text, text, text) to authenticated;
grant execute on function audit.rpc_retention_approve(text) to authenticated;
grant execute on function audit.fn_require(text) to authenticated;
