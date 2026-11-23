-- Seven functions that could not run.
--
-- `supabase db lint` on a copy of production found statements that fail the
-- moment they run. Each was confirmed on that copy by running the statement.
-- None has failed for a real user yet: production has no job offers,
-- refunds, cash deposits, featured events, hotel statements or connector
-- secrets so far. Each would fail the first time its feature is used.
--
-- Every body below is the one production runs now, with only the broken
-- statement changed:
--
--   1. app_email.for_receipt (20270128000200): the refund branch used the
--      table alias p while a variable is also called p, so the query failed
--      with "column reference p.id is ambiguous". The error was caught, so no
--      refund receipt email was ever queued. The alias is now pay.
--   2. hr.rpc_candidate_respond_offer (20260101009100): a candidate accepting
--      or declining an offer on the careers status page failed with "column
--      status is of type hr.offer_status but expression is of type text".
--      The case is now cast to hr.offer_status.
--   3. hr.rpc_offer_approve (20260101009100): the same mistake when a
--      recruiter approves an offer. Same cast.
--   4. public.rpc_reconciliation_import (20260101008200): the same mistake
--      with public.recon_status when a hotel statement is reconciled.
--   5. public.rpc_connector_transition (20261102000050): disconnecting or
--      revoking a connection called vault.delete_secret, which Supabase Vault
--      does not have. It now deletes the row from vault.secrets.
--   6. public.fn_featured_rollup (20260101008700): max(uuid) does not exist
--      in Postgres 17, so the daily rollup could never run. It now takes
--      max over the text form. A booking has one placement and one merchant,
--      so the value is the same.
--      Also: only service_role may run it now. It is an internal writer, like
--      the helpers closed in 20270106020100, and it had been open to every
--      signed-in user.
--   7. public.fn_match_deposit (20260101007800): min(uuid) does not exist
--      either. A match is only used when exactly one rider has the number,
--      so taking min over the text form changes nothing.
--
-- Left alone on purpose: public.rpc_merchant_set_pause fails the same way,
-- but nothing calls it (the console uses rpc_merchant_set_paused). Making it
-- work would open a second, older way to pause or resume a shop, so it stays
-- as it is. Dropping it is the owner's call.
--
-- Rollback: re-run the seven definitions from the migrations named above.
-- 1. ─────────────────────────────────────────────── app_email.for_receipt
create or replace function app_email.for_receipt(r public.receipt)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_refund public.refund;
  v_paid public.receipt;
begin
  if r.party_type <> 'guest' then
    return false;
  end if;

  if r.source_type = 'payment' then
    select * into p from public.payment where id = r.source_id;
    if p.intent = 'order' and p.order_id is not null then
      return app_email.send('11-order-placed', 'order', p.order_id,
        app_email.order_vars(p.order_id) || app_email.receipt_vars(r)
          || jsonb_build_object('total', app_email.kes(r.total_cents)),
        r.party_id, null, 'paid') is not null;
    elsif p.intent = 'stay' and p.stay_id is not null then
      return app_email.send('30-stay-confirmed', 'stay', p.stay_id,
        app_email.stay_vars(p.stay_id) || app_email.receipt_vars(r) || jsonb_build_object(
          'total', app_email.kes(r.total_cents),
          'items', (select coalesce(jsonb_agg(jsonb_build_object('quantity', 1, 'name', l ->> 'label',
                      'amount', app_email.kes((l ->> 'amount_cents')::bigint))), '[]'::jsonb)
                      from jsonb_array_elements(r.lines) l)),
        r.party_id, null, 'paid') is not null;
    end if;

  elsif r.source_type = 'refund' then
    select * into v_refund from public.refund where id = r.source_id;
    select pr.* into v_paid from public.receipt pr
      join public.payment pay on pay.id = pr.source_id and pr.source_type = 'payment'
     where pay.order_id = v_refund.order_id and pr.party_type = 'guest'
     order by pr.issued_at desc limit 1;
    return app_email.send('13-order-refunded', 'refund', r.source_id,
      app_email.order_vars(v_refund.order_id) || jsonb_strip_nulls(jsonb_build_object(
        'receipt_number', r.number,
        'refund_amount', app_email.kes(r.total_cents),
        'refund_method', coalesce(r.method, 'your original payment'),
        'refund_timing', case r.method when 'M-Pesa' then 'It usually arrives within a few minutes.'
          when 'NexG credit' then 'It is in your NexG account now.'
          else 'Cards and banks can take up to 7 working days.' end,
        'payment_method', v_paid.method,
        'payment_reference', r.method_ref,
        'paid_at', app_email.at(r.issued_at),
        'total', app_email.kes(r.total_cents),
        'items', jsonb_build_array(jsonb_build_object('quantity', 1,
          'name', coalesce(nullif(v_refund.reason_text, ''), 'Refund'), 'amount', app_email.kes(r.total_cents))),
        'price_lines', jsonb_build_array(jsonb_build_object('label', 'Refunded', 'amount', app_email.kes(r.total_cents))))),
      r.party_id, null, 'issued') is not null;
  end if;
  return false;
exception when others then
  raise warning 'app email for receipt % not queued: %', r.number, sqlerrm;
  return false;
end
$$;

-- 2. ─────────────────────────────────────── hr.rpc_candidate_respond_offer
create or replace function hr.rpc_candidate_respond_offer(
  p_token text,
  p_accept boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
  v_offer hr.offer;
begin
  a := hr.fn_application_for_token(p_token);
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_offer from hr.offer where application_id = a.id and status = 'sent';
  if v_offer.id is null then
    return jsonb_build_object('ok', false, 'reason', 'There is no open offer to answer.');
  end if;

  update hr.offer set
    status = (case when p_accept then 'accepted' else 'declined' end)::hr.offer_status,
    responded_at = now(),
    decline_reason = case when p_accept then null else nullif(trim(coalesce(p_reason, '')), '') end
  where id = v_offer.id;

  perform audit.log('guest'::public.actor_type, 'careers',
    case when p_accept then 'offer.accepted' else 'offer.declined' end,
    p_target_type => 'application', p_target_id => a.id, p_reason => p_reason,
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true);
end;
$$;

-- 3. ───────────────────────────────────────────────── hr.rpc_offer_approve
create or replace function hr.rpc_offer_approve(p_application_id uuid)
returns hr.offer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer hr.offer;
  v_me uuid := authz.staff_id();
  v_threshold bigint;
  v_needs_two boolean;
begin
  if not authz.is_recruiter() then
    raise exception 'Not yours to approve.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_offer from hr.offer where application_id = p_application_id;
  if v_offer.id is null then
    raise exception 'No offer drafted.' using errcode = 'no_data_found';
  end if;

  select nullif(value #>> '{}', '')::bigint into v_threshold
  from hr.setting where key = 'offer_second_approver_above';

  v_needs_two := v_threshold is null or coalesce(v_offer.salary, 0) >= v_threshold;

  if v_offer.approved_by is null then
    update hr.offer set
      approved_by = v_me,
      status = (case when v_needs_two then 'awaiting_approval' else 'sent' end)::hr.offer_status,
      sent_at = case when not v_needs_two then now() end
    where id = v_offer.id returning * into v_offer;

  elsif v_offer.approved_by = v_me then
    raise exception 'You approved this one. %',
      case when v_threshold is null
        then 'No salary threshold has been set, so every offer needs a second person.'
        else 'Offers at or above KES ' || v_threshold || ' need a second person.' end
      using errcode = 'insufficient_privilege';

  else
    update hr.offer set second_approver_id = v_me, status = 'sent', sent_at = now()
    where id = v_offer.id returning * into v_offer;

    insert into hr.email (application_id, candidate_id, template_key, subject, status, sent_by)
    select p_application_id, a.candidate_id, 'offer_sent', t.subject, 'queued', v_me
    from hr.application a, hr.email_template t
    where a.id = p_application_id and t.key = 'offer_sent';
  end if;

  perform audit.log('staff'::public.actor_type, 'careers', 'offer.' || v_offer.status::text,
    p_target_type => 'application', p_target_id => p_application_id, p_approved_by => v_me,
    p_after => jsonb_build_object('salary', v_offer.salary, 'status', v_offer.status),
    p_severity => 'high'::public.audit_severity);

  return v_offer;
end;
$$;

-- 4. ─────────────────────────────────── public.rpc_reconciliation_import
create or replace function public.rpc_reconciliation_import(
  p_statement_id uuid,
  p_lines jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.hotel_statement;
  v_line jsonb;
  v_match public.folio_posting;
  v_n integer := 0;
begin
  if not authz.works_hospitality(null) and not authz.has_role('finance', null) then
    raise exception 'Not yours to import.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_statement from public.hotel_statement where id = p_statement_id;
  delete from public.folio_reconciliation where statement_id = p_statement_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_match := null;

    if nullif(v_line ->> 'ref', '') is not null then
      select * into v_match from public.folio_posting
      where hotel_id = v_statement.hotel_id and folio_ref = v_line ->> 'ref';
    end if;

    if v_match.id is null then
      select * into v_match from public.folio_posting f
      where f.hotel_id = v_statement.hotel_id
        and f.room_no = v_line ->> 'room'
        and f.amount = (v_line ->> 'amount')::bigint
        and f.desk_action_at between (v_line ->> 'date')::date - 1
                                 and (v_line ->> 'date')::date + 1
      limit 1;
    end if;

    insert into public.folio_reconciliation
      (statement_id, hotel_line_ref, hotel_amount, nexg_order_reference, nexg_amount, status)
    values (
      p_statement_id,
      v_line ->> 'ref',
      (v_line ->> 'amount')::bigint,
      v_match.order_reference,
      v_match.amount,
      (case when v_match.id is null then 'missing_reference' else 'matched' end)::public.recon_status
    );

    v_n := v_n + 1;
  end loop;

  if exists (
    select 1 from public.folio_reconciliation
    where statement_id = p_statement_id and status = 'missing_reference'
  ) then
    insert into public.notification (kind, status) values ('reconciliation_lines', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'statement.reconciled',
    p_target_type => 'hotel_statement', p_target_id => p_statement_id,
    p_after => jsonb_build_object('lines', v_n));

  return v_n;
end;
$$;

-- 5. ──────────────────────────────────── public.rpc_connector_transition
create or replace function public.rpc_connector_transition(
  p_connection_id uuid,
  p_next_state public.connector_connection_state,
  p_reason text default null
)
returns public.connector_connection_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.connector_connection;
  v_allowed boolean;
  v_secret_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may transition a connection.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_connection
  from public.connector_connection
  where id = p_connection_id
  for update;

  if not found then
    raise exception 'That connector connection does not exist.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from (values
      ('draft', 'authorising'),
      ('authorising', 'handshaking'),
      ('authorising', 'degraded'),
      ('handshaking', 'operational'),
      ('handshaking', 'degraded'),
      ('operational', 'degraded'),
      ('operational', 'disconnected'),
      ('operational', 'suspended'),
      ('degraded', 'operational'),
      ('degraded', 'disconnected'),
      ('degraded', 'suspended'),
      ('disconnected', 'authorising'),
      ('disconnected', 'revoked'),
      ('suspended', 'operational'),
      ('suspended', 'disconnected'),
      ('suspended', 'revoked')
    ) as allowed(from_state, to_state)
    where allowed.from_state = v_connection.state::text
      and allowed.to_state = p_next_state::text
  ) into v_allowed;

  if not v_allowed then
    raise exception 'That connection state change is not allowed (% to %).',
      v_connection.state, p_next_state
      using errcode = '22023';
  end if;

  if p_next_state = 'degraded' and nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required when degrading a connection.'
      using errcode = '22023';
  end if;

  if p_next_state = 'operational' and not exists (
    select 1 from public.connector_connection_consent c
    where c.connection_id = v_connection.id
      and c.manifest_version = v_connection.manifest ->> 'version'
  ) then
    raise exception 'Record consent for the current adapter capabilities before activating the connection.'
      using errcode = 'check_violation';
  end if;

  update public.connector_connection
  set state = p_next_state, updated_at = now(),
      last_error = case when p_next_state = 'degraded' then nullif(trim(p_reason), '') else null end
  where id = v_connection.id;

  if p_next_state in ('disconnected', 'revoked') then
    for v_secret_id in
      select s.vault_secret_id
      from public.connector_connection_secret s
      where s.connection_id = v_connection.id
    loop
      delete from vault.secrets where id = v_secret_id;
    end loop;
    delete from public.connector_connection_secret s
    where s.connection_id = v_connection.id;
  end if;

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.connection_state_changed',
    p_target_type => 'connector_connection', p_target_id => v_connection.id,
    p_before => jsonb_build_object('state', v_connection.state),
    p_after => jsonb_build_object('state', p_next_state),
    p_reason => p_reason
  );

  return p_next_state;
end;
$$;

-- 6. ────────────────────────────────────────── public.fn_featured_rollup
create or replace function public.fn_featured_rollup(p_day date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.featured_metrics_daily
    (booking_id, placement_id, merchant_id, day, views, taps, orders, order_value,
     ctr, conversion, refreshed_at)
  select
    e.booking_id,
    max(e.placement_id::text)::uuid,
    max(e.merchant_id::text)::uuid,
    p_day,
    count(*) filter (where e.kind = 'view')::integer,
    count(*) filter (where e.kind = 'tap')::integer,
    count(*) filter (where e.kind = 'order')::integer,
    0,
    case when count(*) filter (where e.kind = 'view') > 0
      then round(count(*) filter (where e.kind = 'tap')::numeric
                 / count(*) filter (where e.kind = 'view'), 4) end,
    case when count(*) filter (where e.kind = 'tap') > 0
      then round(count(*) filter (where e.kind = 'order')::numeric
                 / count(*) filter (where e.kind = 'tap'), 4) end,
    now()
  from public.featured_event e
  where e.at >= p_day and e.at < p_day + 1
  group by e.booking_id
  on conflict (booking_id, day) do update set
    views = excluded.views, taps = excluded.taps, orders = excluded.orders,
    ctr = excluded.ctr, conversion = excluded.conversion, refreshed_at = now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.fn_featured_rollup(date) from public, anon, authenticated;
grant execute on function public.fn_featured_rollup(date) to service_role;

-- 7. ──────────────────────────────────────────── public.fn_match_deposit
create or replace function public.fn_match_deposit(p_deposit_id uuid)
returns public.cash_deposit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep public.cash_deposit;
  v_rider_id uuid;
  v_n integer;
begin
  select * into v_dep from public.cash_deposit where id = p_deposit_id;
  if v_dep.id is null or v_dep.match_status <> 'unmatched' then
    return v_dep;
  end if;

  select count(*), min(r.id::text)::uuid into v_n, v_rider_id
  from public.rider r
  where v_dep.msisdn is not null
    and right(regexp_replace(coalesce(r.payout_msisdn, r.phone), '\D', '', 'g'), 9)
      = right(regexp_replace(v_dep.msisdn, '\D', '', 'g'), 9);

  /* Two riders on one number is not a match, it is a question. */
  if v_n <> 1 then
    return v_dep;
  end if;

  update public.cash_deposit
  set rider_id = v_rider_id, match_status = 'auto_matched', matched_at = now()
  where id = p_deposit_id
  returning * into v_dep;

  insert into public.cash_event (rider_id, kind, amount_kes, deposit_id, note)
  values (v_rider_id, 'deposit', -v_dep.amount_kes, v_dep.id,
          'Paybill ' || v_dep.provider_ref || ' · auto-matched');

  insert into public.notification (kind, rider_id, status)
  values ('deposit_matched', v_rider_id, 'pending');

  perform audit.log('system'::public.actor_type, 'riders', 'cash.deposit_matched',
    p_target_type => 'rider', p_target_id => v_rider_id,
    p_after => jsonb_build_object('provider_ref', v_dep.provider_ref, 'amount', v_dep.amount_kes));

  return v_dep;
end;
$$;
