-- "[Unknown] did something" is useless for an audit log.
--
-- Three separate reasons the log was anonymous, and only one of
-- them was a missing fact:
--
--  1. Every staff event already carries an `actor_id` that resolves
--     to an email. The console read the denormalised `actor_label`
--     and fell straight through to '[Unknown]' when it was null —
--     which it is on every row written before that column existed.
--     Nothing was missing; nobody looked.
--
--  2. Merchant, rider and guest actors have no `actor_id` by
--     design: they are not staff, and `actor_id` references
--     `staff_user`. But every one of those rows carries a
--     `target_id` naming the merchant or rider involved, so the row
--     can say "[Merchant] Imprinnt" instead of shrugging.
--
--  3. Nothing defaulted `p_actor_id`. A call site that forgot it
--     produced an anonymous row, silently, forever.
--
-- The first two are fixed at read time, which is the only honest
-- option: the event table is hash-chained and append-only, so
-- backfilling a label would either break every hash after it or
-- mean rewriting history — and rewriting an audit log to make it
-- read better is the exact thing an audit log exists to prevent.
-- The facts were always there. The views now use them.

-- ═══════════════════════════ who an event was actually by

/*
 * Resolved in one place, used by every console view.
 *
 * Order matters: the label written at the time wins, because it was
 * true at the time. Only when there is none do we go looking.
 */
create or replace function audit.fn_actor_name(e audit.audit_event)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    /* What the event recorded. Survives the staff row being deleted,
       which is why it is written at all. */
    nullif(trim(e.actor_label), ''),

    /* A staff member who did not get a label. Resolved now rather
       than guessed — the id has been on the row all along. */
    (select su.email from public.staff_user su where su.id = e.actor_id),

    /* Not staff. The actor is the subject: a merchant filling in
       their own application, a rider uploading their own licence.
       Naming them beats a shrug. */
    case e.actor_type
      when 'merchant_user' then
        '[Merchant] ' || coalesce(
          (select coalesce(m.trading_name, m.legal_name)
             from public.merchant m where m.id = e.target_id),
          /* A document event names the document; the merchant is
             one hop behind it. */
          (select coalesce(m.trading_name, m.legal_name)
             from public.merchant m
             join public.document d on d.owner_id = m.id
            where d.id = e.target_id and d.owner_type = 'merchant'),
          'not named')
      when 'rider' then
        '[Rider] ' || coalesce(
          (select trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
             from public.rider r where r.id = e.target_id),
          (select trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
             from public.rider r
             join public.document d on d.owner_id = r.id
            where d.id = e.target_id and d.owner_type = 'rider'),
          'not named')
      when 'host_user' then '[Host]'
      when 'guest' then
        /* Somebody applying as a rider is the rider they named. */
        coalesce(
          '[Guest] ' || nullif(
            (select trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
               from public.rider r where r.id = e.target_id), ''),
          '[Guest]')
      when 'system' then '[System]'
    end,

    '[Unknown]')
$$;

comment on function audit.fn_actor_name is
  'Who an event was by. The label written at the time wins because it was true at the time; failing that the staff row is resolved by id, and failing that a non-staff actor is named from the subject it acted on. Read-time only — the event table is hash-chained, so backfilling a label would mean rewriting an audit log to make it read better, which is the thing an audit log exists to prevent.';

/* The same, for an approver. */
create or replace function audit.fn_approver_name(e audit.audit_event)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(e.approver_label), ''),
    (select su.email from public.staff_user su where su.id = e.approved_by))
$$;

-- ════════════════ and nothing anonymous from here on

/*
 * `p_actor_id` now defaults to the signed-in staff member.
 *
 * Every call site that passes one is unaffected. Every call site
 * that forgets — and there were plenty — stops producing an
 * anonymous row. This cannot be done for merchant or rider actors,
 * who have no staff id, which is what the subject fallback above is
 * for.
 */
create or replace function audit.log(
  p_actor_type public.actor_type,
  p_module text,
  p_action text,
  p_actor_id uuid default null,
  p_actor_role text default null,
  p_target_type text default null,
  p_target_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_approved_by uuid default null,
  p_severity public.audit_severity default null,
  p_city_id uuid default null,
  p_actor_label text default null,
  p_target_label text default null,
  p_approver_label text default null,
  p_on_behalf_of uuid default null,
  p_context jsonb default null,
  p_related jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry audit.action_registry;
  v_id bigint;
  v_severity public.audit_severity;
  v_before jsonb;
  v_after jsonb;
  v_version smallint;
  v_actor_label text;
  v_actor_id uuid;
  v_drift_id bigint;
begin
  select * into v_registry from audit.action_registry where action = p_action;

  v_severity := greatest(
    coalesce(p_severity, 'info'::public.audit_severity),
    coalesce(v_registry.default_severity, 'info'::public.audit_severity));

  /*
   * If the caller did not say who, and a staff member is signed in,
   * it was them. A call site forgetting to pass an id used to mean
   * an anonymous row forever.
   */
  v_actor_id := coalesce(
    p_actor_id,
    case when p_actor_type = 'staff' then authz.staff_id() end);

  v_before := audit.fn_mask_payload(p_before, coalesce(v_registry.pii_fields, '{}'));
  v_after := audit.fn_mask_payload(p_after, coalesce(v_registry.pii_fields, '{}'));

  v_actor_label := coalesce(
    p_actor_label,
    (select su.email from public.staff_user su where su.id = v_actor_id),
    case p_actor_type
      when 'system' then '[System]'
      when 'guest' then '[Guest]'
      when 'rider' then '[Rider]'
      when 'merchant_user' then '[Merchant]'
      else null
    end);

  v_version := case
    when p_actor_label is not null or p_target_label is not null
      or p_approver_label is not null or p_on_behalf_of is not null
      or p_context is not null or p_related is not null
      or v_actor_label is not null
    then 2 else 1 end;

  insert into audit.audit_event (
    actor_type, actor_id, actor_role, module, action,
    target_type, target_id, before, after, reason, approved_by,
    severity, city_id, hash_version,
    actor_label, target_label, approver_label, on_behalf_of,
    diff, context, related,
    session_id, ip, user_agent
  )
  values (
    p_actor_type, v_actor_id, p_actor_role, p_module, p_action,
    p_target_type, p_target_id, v_before, v_after, p_reason, p_approved_by,
    v_severity, p_city_id, v_version,
    v_actor_label, p_target_label,
    coalesce(p_approver_label,
             (select su.email from public.staff_user su where su.id = p_approved_by)),
    p_on_behalf_of,
    audit.fn_diff(v_before, v_after),
    coalesce(p_context, '{}'::jsonb),
    coalesce(p_related, '{}'::jsonb),
    nullif(current_setting('app.session_id', true), ''),
    nullif(current_setting('app.ip', true), '')::inet,
    nullif(current_setting('app.user_agent', true), '')
  )
  returning id into v_id;

  if coalesce(v_registry.needs_review, v_registry.action is null) then
    insert into audit.event_meta (event_id, review_state)
    values (v_id, 'needs_review')
    on conflict (event_id) do nothing;
  end if;

  if v_registry.action is null and p_action <> 'audit.unknown_action' then
    insert into audit.audit_event (
      actor_type, module, action, severity, target_type, target_id,
      after, hash_version, actor_label
    )
    values ('system', 'audit', 'audit.unknown_action', 'high',
            'audit_event', null,
            jsonb_build_object('action', p_action, 'module', p_module, 'event_id', v_id),
            2, '[System] · registry')
    returning id into v_drift_id;

    insert into audit.event_meta (event_id, review_state)
    values (v_drift_id, 'needs_review')
    on conflict (event_id) do nothing;
  end if;

  return v_id;
end;
$$;

-- ════════════════════════ the views use the resolver

create or replace view audit.console_activity_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.hash_version,
  e.actor_type,
  e.actor_id,
  audit.fn_actor_name(e) as actor_label,
  e.actor_role,
  e.on_behalf_of,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  e.target_type,
  e.target_id,
  e.target_label,
  e.severity,
  e.city_id,
  c.name as city_name,
  e.reason,
  e.approved_by,
  audit.fn_approver_name(e) as approver_label,
  e.before,
  e.after,
  e.diff,
  e.context,
  e.related,
  audit.fn_actor_name(e)
    || ' '
    || coalesce(lower(r.description), replace(e.action, '.', ' '))
    || coalesce(' · ' || e.target_label, '')
    || coalesce(' · ' || nullif(trim(e.reason), ''), '') as sentence,
  coalesce(jsonb_array_length(
    case when e.diff is null then '[]'::jsonb
    else (select jsonb_agg(k) from jsonb_object_keys(e.diff) k) end), 0) as changed_fields,
  coalesce(r.money, false) as is_money,
  coalesce(array_length(r.pii_fields, 1), 0) > 0 as touches_pii,
  coalesce(r.two_person, false) as needs_two_people,
  r.action is null as unregistered,
  coalesce(m.review_state, 'none') as review_state,
  m.reviewed_by,
  m.reviewed_at,
  m.review_note,
  su.display_name as reviewed_by_name,
  e.hash,
  e.prev_hash
from audit.audit_event e
left join audit.action_registry r on r.action = e.action
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id
left join public.staff_user su on su.id = m.reviewed_by;

create or replace view audit.console_money_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  audit.fn_actor_name(e) as actor_label,
  e.actor_id,
  e.target_type,
  e.target_id,
  e.target_label,
  e.city_id,
  c.name as city_name,
  e.reason,
  e.approved_by,
  audit.fn_approver_name(e) as approver_label,
  r.two_person as needs_two_people,
  coalesce(r.two_person, false) and e.approved_by is null as missing_second_person,
  nullif(e.after ->> 'amount_cents', '')::bigint as amount_cents,
  nullif(e.after ->> 'currency', '') as currency,
  (e.after ->> 'amount_cents') is null as amount_not_recorded,
  e.related ->> 'order_reference' as order_reference,
  (e.related ->> 'statement_id')::uuid as statement_id,
  (e.related ->> 'settlement_run_id')::uuid as settlement_run_id,
  (e.related ->> 'dispute_id')::uuid as dispute_id,
  e.diff,
  e.severity,
  coalesce(m.review_state, 'none') as review_state
from audit.audit_event e
join audit.action_registry r on r.action = e.action and r.money
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id;

create or replace view audit.console_data_access_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  e.actor_id,
  audit.fn_actor_name(e) as actor_label,
  e.actor_role,
  e.on_behalf_of,
  e.target_type,
  e.target_id,
  e.target_label as subject_label,
  r.pii_fields,
  e.reason,
  coalesce(trim(e.reason), '') = '' as no_reason_given,
  e.context ->> 'surface' as surface,
  e.context ->> 'ip_country' as ip_country,
  e.city_id,
  c.name as city_name,
  e.severity,
  coalesce(m.review_state, 'none') as review_state,
  m.reviewed_at,
  (select count(*) from audit.audit_event x
    join audit.action_registry xr on xr.action = x.action
   where x.actor_id = e.actor_id
     and coalesce(array_length(xr.pii_fields, 1), 0) > 0
     and x.at between e.at - interval '30 minutes' and e.at + interval '30 minutes'
  ) as reveals_in_the_hour
from audit.audit_event e
join audit.action_registry r on r.action = e.action
  and (coalesce(array_length(r.pii_fields, 1), 0) > 0 or r.action like 'pii.%' or r.action = 'export.created')
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id;

grant execute on function audit.fn_actor_name(audit.audit_event) to authenticated;
grant execute on function audit.fn_approver_name(audit.audit_event) to authenticated;
