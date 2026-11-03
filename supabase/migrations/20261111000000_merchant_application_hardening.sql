-- Merchant application hardening (review of codex/merchant-platform-unified-20261102).
--
-- 1. KDPA retention: the 90-day deleted-merchant anonymisation must succeed for
--    new-flow merchants and must also clear the personal data copied into
--    merchant_application, its submission snapshots, the payout declaration and
--    the operation journal.
-- 2. Segregation of duties: staff cannot review an application for a business
--    they belong to or submitted themselves.
-- 5. service_role writes to merchant / merchant_user must not fail on the
--    application guard triggers.
--
-- CREATE OR REPLACE resets a function's SET options, so the 5s statement /
-- 2s lock timeouts the earlier migration added with ALTER FUNCTION are
-- restated on each replaced application function. Grants are preserved.
--
-- Sorts after every migration on main (latest 20261110000000), so it applies the
-- same way on a fresh reset and on an environment that is already migrated.

-- ---------------------------------------------------------------------------
-- Fix 5: guard trigger helpers are called from SECURITY INVOKER triggers, so
-- every role that writes to merchant / merchant_user needs EXECUTE on them.
-- The earlier migration revoked PUBLIC and granted only authenticated.
-- membership_write_allowed still returns false for a new-flow merchant when
-- there is no signed-in owner/staff session (auth.uid() is null for
-- service_role); that is intended. Legacy merchants are unaffected.
-- ---------------------------------------------------------------------------
grant execute on function
  authz.merchant_application_row_write_allowed(jsonb),
  authz.merchant_application_has_capture(uuid),
  authz.merchant_application_membership_write_allowed(uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Fix 1a: let the retention anonymisation through the merchant write guard.
-- The exemption is narrow: it only matches the one-way transition the cron
-- performs (deleted_anonymized_at set for the first time, after the recovery
-- window ended), and the row still cannot go live, accept orders, or gain a
-- payout account or resume token.
-- ---------------------------------------------------------------------------
create or replace function public.tg_merchant_application_write_guard()
returns trigger language plpgsql set search_path = ''
  set statement_timeout = '5s' set lock_timeout = '2s' as $$
begin
  if new.deleted_anonymized_at is not null
     and old.deleted_anonymized_at is null
     and old.deleted_until is not null
     and old.deleted_until <= now()
     and new.status is not distinct from old.status
     and new.status <> 'live'
     and not coalesce(new.accepting_orders, false)
     and new.payout_account is null
     and new.payout_rail is null
     and new.resume_token_hash is null
     and new.resume_token_expires_at is null then
    return new;
  end if;

  if not authz.merchant_application_row_write_allowed(to_jsonb(new)) then
    raise exception 'Use application commands; operational activation is not available.' using errcode='42501';
  end if;
  if (new.payout_account is distinct from old.payout_account or new.payout_rail is distinct from old.payout_rail)
    and authz.merchant_application_has_capture(new.id) then
    raise exception 'Use the private payout declaration command.' using errcode='42501';
  end if;
  if (new.resume_token_hash is not null or new.resume_token_expires_at is not null)
    and authz.merchant_application_has_capture(new.id) then
    raise exception 'Resume this application through the existing signed-in account.' using errcode='42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix 1b: submission snapshots stay immutable and undeletable, with one
-- exception: once the merchant itself is anonymised, the payload may be
-- replaced by the fixed redaction marker. Nothing else on the row may change.
-- ---------------------------------------------------------------------------
create or replace function public.tg_merchant_application_submission_immutable()
returns trigger language plpgsql set search_path = ''
  set statement_timeout = '5s' set lock_timeout = '2s' as $$
begin
  if tg_op = 'UPDATE'
     and new.merchant_id = old.merchant_id
     and new.revision = old.revision
     and new.submitted_by = old.submitted_by
     and new.submitted_at = old.submitted_at
     and new.payload = '{"anonymized": true}'::jsonb
     and exists (select 1 from public.merchant m
                 where m.id = old.merchant_id and m.deleted_anonymized_at is not null) then
    return new;
  end if;
  raise exception 'Submitted application snapshots are immutable.' using errcode='42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix 1c: the retention job. Body is unchanged from
-- 20261031000000_merchant_deleted_retention.sql except for the block marked
-- "new-flow application data".
-- ---------------------------------------------------------------------------
create or replace function public.cron_merchant_deleted_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_anonymise boolean;
begin
  select anonymise into v_anonymise
  from public.retention_rule
  where key = 'merchant_deleted';

  if not found then
    raise exception 'Merchant deletion retention is not configured.';
  end if;

  if not v_anonymise then
    return 0;
  end if;

  select coalesce(array_agg(stale.id), '{}'::uuid[])
    into v_ids
  from (
    select m.id
    from public.merchant m
    where m.deleted_until <= now()
      and m.deleted_at is not null
      and m.deleted_anonymized_at is null
    order by m.deleted_until
    limit 500
    for update skip locked
  ) stale;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  update public.merchant m
  set legal_name = 'Deleted merchant ' || left(replace(m.id::text, '-', ''), 12),
      trading_name = 'Deleted merchant ' || left(replace(m.id::text, '-', ''), 12),
      contact_name = 'Deleted',
      contact_phone = '+10000000',
      contact_email = 'deleted+' || m.id::text || '@retained.invalid',
      category_other = null,
      cover_photo_path = null,
      settlement_account = null,
      payout_account = null,
      payout_name_lookup = null,
      payout_rail = null,
      kra_pin = null,
      landmark = null,
      source_url = null,
      answers = '{}'::jsonb,
      status_reason = null,
      deletion_reason = null,
      deactivated_at = null,
      deactivated_by = null,
      deactivation_reason = null,
      deactivation_state = null,
      deletion_state = jsonb_build_object('status', m.status),
      deleted_anonymized_at = now()
  where m.id = any(v_ids);

  -- new-flow application data -------------------------------------------
  -- The application payload, every submitted snapshot and every journalled
  -- command result hold the applicant's name, phone and email. The payout
  -- declaration holds account details. Keep the rows (revision history and
  -- idempotency keys stay valid for audit) but drop the personal content.
  update public.merchant_application a
  set payload = '{"anonymized": true}'::jsonb,
      review_reason = null,
      updated_at = now()
  where a.merchant_id = any(v_ids);

  update public.merchant_application_submission s
  set payload = '{"anonymized": true}'::jsonb
  where s.merchant_id = any(v_ids);

  update public.merchant_application_operation o
  set result = jsonb_build_object('merchant_id', o.merchant_id, 'anonymized', true)
  where o.merchant_id = any(v_ids);

  delete from public.merchant_application_payout p
  where p.merchant_id = any(v_ids);
  -- ----------------------------------------------------------------------

  delete from public.merchant_user mu
  where mu.merchant_id = any(v_ids);

  perform audit.log(
    p_actor_type => 'system'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.retention_anonymized',
    p_target_type => 'merchant',
    p_target_id => id,
    p_after => jsonb_build_object('deleted_anonymized_at', now())
  )
  from unnest(v_ids) as expired(id);

  return cardinality(v_ids);
end;
$$;

revoke all on function public.cron_merchant_deleted_retention()
  from public, anon, authenticated;
grant execute on function public.cron_merchant_deleted_retention()
  to service_role;

-- ---------------------------------------------------------------------------
-- Fix 1d: the operation journal exists for idempotent retries and the 24-hour
-- start limit. It does not need full payload copies indefinitely. Results
-- older than 30 days are reduced to a receipt; the row (actor, operation id,
-- command, request hash) is kept so a very late retry still replays instead
-- of executing twice.
-- ---------------------------------------------------------------------------
create or replace function public.cron_merchant_application_operation_redact()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.merchant_application_operation o
  set result = jsonb_build_object('merchant_id', o.merchant_id, 'operation_id', o.operation_id,
                                  'redacted', true)
  where o.created_at < now() - interval '30 days'
    and not (o.result ? 'redacted')
    and not (o.result ? 'anonymized');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cron_merchant_application_operation_redact()
  from public, anon, authenticated;
grant execute on function public.cron_merchant_application_operation_redact()
  to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'merchant-application-operation-redact-daily',
      '20 23 * * *',
      $schedule$select public.cron_merchant_application_operation_redact()$schedule$
    );
  else
    raise notice 'pg_cron is not installed; merchant application operation results will need manual redaction.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix 2: segregation of duties on review. Body is unchanged from
-- 20261102000100_merchant_application.sql except for the conflict check.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_merchant_application_review(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
  set statement_timeout = '5s' set lock_timeout = '2s' as $$
declare a public.merchant_application; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_staff(p_merchant_id) then raise exception 'Merchant review permission is required.' using errcode='42501'; end if;
  -- Conflict of interest: a reviewer may not belong to the business (any
  -- membership role) or have submitted any revision of its application.
  if exists (select 1 from public.merchant_user mu
             where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid()))
     or exists (select 1 from public.merchant_application_submission s
                where s.merchant_id = p_merchant_id and s.submitted_by = (select auth.uid())) then
    raise exception 'You cannot review an application for a business you belong to or submitted.' using errcode='42501';
  end if;
  if p_decision not in ('approved','changes_requested','rejected') or p_decision is null
    or length(coalesce(p_reason,''))>2000 or (p_decision<>'approved' and trim(coalesce(p_reason,''))='') then
    raise exception 'Choose a review decision and explain required changes or rejection.' using errcode='22023'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision,'decision',p_decision,'reason',nullif(trim(p_reason),''));
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'review',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('review');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision or a.submitted_revision is distinct from a.revision then
    raise exception 'Review the current submitted revision.' using errcode='40001'; end if;
  if a.review_state<>'pending' then raise exception 'This revision has already been reviewed.' using errcode='22023'; end if;
  update public.merchant_application set review_state=p_decision,review_reason=nullif(trim(p_reason),''),
    approved_revision=case when p_decision='approved' then revision else null end,
    reviewed_by=authz.staff_id(),reviewed_at=now(),updated_at=now() where merchant_id=p_merchant_id;
  perform audit.log(p_actor_type=>'staff'::public.actor_type,p_actor_id=>authz.staff_id(),p_module=>'merchant',
    p_action=>'merchant.application_reviewed',p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('revision',a.revision,'decision',p_decision),p_reason=>nullif(trim(p_reason),''));
  return public.fn_merchant_application_operation_finish(p_operation_id,'review',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;
