-- Experience partners are paid in the weekly settlement run.
--
-- A guest pays for a concierge experience plan up front; the venues and
-- operators behind its blocks (experience_partner) are paid by NexG. The
-- money passes through: a partner is owed the full price of each of their
-- blocks, NexG keeps only the concierge fee, and a block is owed once it is
-- marked done. A block that was unavailable, removed or never done is never
-- owed.
--
-- On the ledger, in cents (plans keep whole shillings, multiplied by 100):
--
--   Plan marked paid    Dr cash.mpesa_paybill or cash.bank    quote total
--                       Cr deferred.experience_plan
--                       key plan_paid:<plan id>
--   Block marked done   Dr deferred.experience_plan           block price
--                       Cr payable.experience_partner:<partner id>
--                       key plan_block_partner:<block id>
--   Plan completed      Dr deferred.experience_plan           concierge fee
--                       Cr revenue.concierge_fee               fee less VAT
--                       Cr tax.vat_output                      VAT in the fee
--                       key plan_fee:<plan id>
--
-- Blocks and the fee post only for a plan whose payment was posted, so a
-- plan paid before this migration posts nothing. A block counts when it goes
-- from confirmed or changed (what the quote priced) to done, is not included
-- by another block, is priced above zero and is a partner's component. What
-- stays on deferred.experience_plan after a plan completes is the price of
-- blocks that were never done: no partner is owed it, and whether it goes
-- back to the guest is not decided here. deferred.experience_plan does not
-- start with payable., so the settlement run never pays it out, and it is not
-- a clearing account, so the invariants do not hold payouts back over it.
--
-- Payout details live in experience_partner_payout, closed to everyone but
-- the functions below. Staff who work Experiences (full level) declare them;
-- someone with full Finance other than whoever declared them verifies them
-- (a super admin may verify their own, which is logged for review).
-- Declaring again clears the verification. The settlement_account column on
-- experience_partner is not used: everyone who reaches Experiences can read
-- it, and nothing checks a change to it.
--
-- The run: rpc_settlement_build gains an experience_partner branch. A line
-- carries the partner's name, takes its rail and masked destination from
-- verified details, is held_kyc without them and held_suspended while the
-- partner is paused, suspended or delisted. fn_settlement_recompute adds
-- partners_cents and partners to a run's totals when it has partner lines, so
-- the totals and hash of a run without any are exactly as before.
-- fn_fin_build_party_owed counts payable.experience_partner, under the
-- partner's name.
--
-- Run 20270108300500 (the enum value) first, in its own transaction, and
-- 20270106060100_ledger_fixes before this file: it re-creates
-- fn_fin_build_party_owed too, and run afterwards it would drop partners
-- from the owed list. This file can be run again.
--
-- fn_finance_movements is not changed: a partner's settlement line is a
-- payout of kind merchant there, with category experience_partner, which
-- the console labels Partner Payout.
--
-- Bodies copied from their latest definitions, with only the changes above:
--   rpc_settlement_build     20260101017700_every_action_is_accounted_for.sql
--   fn_settlement_recompute  20260101015600_the_settlement_run.sql
--   fn_fin_build_party_owed  20270106060100_ledger_fixes.sql
--   rpc_mark_paid            20260101006400_experience_money_and_catalogue.sql
--
-- Rollback, in this order:
--   drop trigger if exists plan_block_posts_to_ledger on public.plan_block;
--   drop trigger if exists plan_posts_to_ledger on public.plan;
--   re-run rpc_settlement_build, fn_settlement_recompute and
--     fn_fin_build_party_owed from the files above;
--   drop function public.rpc_mark_paid(uuid, text, text); re-run rpc_mark_paid
--     from 20260101006400 and grant it to authenticated, service_role;
--   drop function public.tg_plan_block_posts_to_ledger(),
--     public.tg_plan_posts_to_ledger(),
--     public.rpc_experience_partner_payout_declare(uuid, jsonb),
--     public.rpc_experience_partner_payout_verify(uuid, integer),
--     public.rpc_experience_partner_payouts(),
--     public.fn_experience_partner_payout_masked(text, jsonb),
--     ledger.fn_post_plan_paid(uuid, text),
--     ledger.fn_post_plan_block_partner(uuid),
--     ledger.fn_post_plan_fee(uuid),
--     authz.works_experiences();
--   drop table public.experience_partner_payout;
--   delete from audit.action_registry where action in ('partner.payout_declared',
--     'finance.partner_payout_verified', 'finance.partner_payout_self_verified');
--   The two accounts and anything posted to them stay: the ledger is
--   append-only.

-- ═══════════════════════════════════════════════════════════ 1. accounts

insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  ('payable.experience_partner', 'payable.experience_partner', 'Owed to an experience partner',
   'liability', 'experience_partner', null, 'C'),
  ('deferred.experience_plan', 'deferred.experience_plan',
   'Experience plans paid for, not yet delivered', 'liability', null, null, 'C')
on conflict (code) do nothing;

-- ═══════════════════════════════════════════════ 2. who works Experiences

/* Super admins, and staff whose role reaches Experiences at full level:
   concierge agents and leads, growth and ops managers today. */
create or replace function authz.works_experiences()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin() or exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    join public.role_module_access a on a.role_key = r.key
    where su.user_id = (select auth.uid())
      and su.status = 'active'
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      and a.module_key = 'experiences'
      and a.level = 'full')
$$;

comment on function authz.works_experiences() is
  'True for super admins and staff whose role reaches the Experiences module at full level.';

revoke execute on function authz.works_experiences() from public, anon;
grant execute on function authz.works_experiences() to authenticated, service_role;

-- ═════════════════════════════════════════════════════ 3. payout details

create table if not exists public.experience_partner_payout (
  partner_id uuid primary key references public.experience_partner (id) on delete cascade,
  rail text not null check (rail in ('mpesa_phone', 'mpesa_till', 'mpesa_paybill', 'bank')),
  /* The fields of the rail, checked by rpc_experience_partner_payout_declare:
     mpesa_phone {phoneNumber, accountName}, mpesa_till {tillNumber},
     mpesa_paybill {paybillNumber, accountReference},
     bank {bankName, accountName, accountNumber}. */
  account jsonb not null check (jsonb_typeof(account) = 'object'),
  version integer not null default 1 check (version > 0),
  declared_by uuid references public.staff_user (id) on delete set null,
  declared_at timestamptz not null default now(),
  verified_by uuid references public.staff_user (id) on delete set null,
  verified_at timestamptz,
  /* The version Finance checked. Details are verified while it equals
     version; declaring again moves version on and clears it. */
  verified_version integer,
  constraint experience_partner_payout_verified_together check (
    (verified_at is null) = (verified_version is null)),
  constraint experience_partner_payout_verified_known check (
    verified_version is null or verified_version <= version)
);

comment on table public.experience_partner_payout is
  'Where an experience partner is paid. Declared by staff who work Experiences, verified by someone else with full Finance; the settlement run pays only verified details. Closed: read and written through the rpc_experience_partner_payout* functions.';

alter table public.experience_partner_payout enable row level security;
/* No policies on purpose: nobody reads or writes the rows directly. */
revoke all on table public.experience_partner_payout from anon, authenticated;

/* "•••• 1234": enough to recognise the destination, not enough to use it. */
create or replace function public.fn_experience_partner_payout_masked(p_rail text, p_account jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_rail
    when 'mpesa_phone' then
      '•••• ' || right(regexp_replace(coalesce(p_account ->> 'phoneNumber', ''), '\D', '', 'g'), 4)
    when 'mpesa_till' then
      'Till •••• ' || right(coalesce(p_account ->> 'tillNumber', ''), 4)
    when 'mpesa_paybill' then
      'Paybill ' || coalesce(p_account ->> 'paybillNumber', '') || ' · •••• '
        || right(regexp_replace(coalesce(p_account ->> 'accountReference', ''), '\s', '', 'g'), 4)
    when 'bank' then
      coalesce(nullif(btrim(p_account ->> 'bankName'), '') || ' ', '') || '•••• '
        || right(regexp_replace(coalesce(p_account ->> 'accountNumber', ''), '[^0-9A-Za-z]', '', 'g'), 4)
  end
$$;

comment on function public.fn_experience_partner_payout_masked(text, jsonb) is
  'A partner payout destination with all but its last four characters hidden.';

/*
 * Declares, or changes, where a partner is paid. Staff who work Experiences
 * (full level) and super admins. Declaring again clears the verification,
 * so a run holds the partner until Finance has checked the new details.
 * The account itself is not written to the audit log; its masked form is.
 */
create or replace function public.rpc_experience_partner_payout_declare(
  p_partner_id uuid,
  p_payout jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_partner public.experience_partner;
  v_old public.experience_partner_payout;
  v_new public.experience_partner_payout;
  v_rail text;
  v_keys text[];
  v_key text;
  v_payout jsonb := p_payout;
  v_phone text;
begin
  if v_staff is null or not authz.works_experiences() then
    raise exception 'Only people who work the Experiences module can declare payout details.'
      using errcode = '42501';
  end if;

  select * into v_partner from public.experience_partner where id = p_partner_id;
  if v_partner.id is null then
    raise exception 'That partner no longer exists.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_payout) is distinct from 'object' or octet_length(p_payout::text) > 4096 then
    raise exception 'Enter the payout details.' using errcode = '22023';
  end if;

  v_rail := p_payout ->> 'rail';
  v_keys := case v_rail
    when 'mpesa_phone' then array['rail', 'phoneNumber', 'accountName']
    when 'mpesa_till' then array['rail', 'tillNumber']
    when 'mpesa_paybill' then array['rail', 'paybillNumber', 'accountReference']
    when 'bank' then array['rail', 'bankName', 'accountName', 'accountNumber']
  end;
  if v_keys is null then
    raise exception 'Choose how the partner is paid (M-PESA number, till, paybill or bank).'
      using errcode = '22023';
  end if;
  if not (p_payout ?& v_keys)
     or exists (select 1 from jsonb_object_keys(p_payout) k where k <> all (v_keys)) then
    raise exception 'Fill in the fields for that payout method, and only those.' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if jsonb_typeof(p_payout -> v_key) is distinct from 'string'
       or length(btrim(p_payout ->> v_key)) not between 1 and
          (case v_key when 'accountName' then 200
                      when 'rail' then 20
                      when 'phoneNumber' then 20
                      when 'tillNumber' then 20
                      when 'paybillNumber' then 20
                      else 100 end) then
      raise exception 'Complete every payout field.' using errcode = '22023';
    end if;
    v_payout := jsonb_set(v_payout, array[v_key], to_jsonb(btrim(p_payout ->> v_key)));
  end loop;

  if v_rail = 'mpesa_phone' then
    v_phone := regexp_replace(v_payout ->> 'phoneNumber', '[\s()-]', '', 'g');
    v_phone := case
      when v_phone ~ '^0[17][0-9]{8}$' then '+254' || substr(v_phone, 2)
      when v_phone ~ '^254[17][0-9]{8}$' then '+' || v_phone
      else v_phone end;
    if v_phone !~ '^\+254[17][0-9]{8}$' then
      raise exception 'Enter a Kenyan M-PESA number, such as 0712 345 678.' using errcode = '22023';
    end if;
    v_payout := jsonb_set(v_payout, '{phoneNumber}', to_jsonb(v_phone));
  elsif (v_rail = 'mpesa_till' and v_payout ->> 'tillNumber' !~ '^[0-9]{1,20}$')
     or (v_rail = 'mpesa_paybill' and v_payout ->> 'paybillNumber' !~ '^[0-9]{1,20}$') then
    raise exception 'A till or paybill number is digits only.' using errcode = '22023';
  end if;

  select * into v_old from public.experience_partner_payout
   where partner_id = p_partner_id for update;

  insert into public.experience_partner_payout as x
    (partner_id, rail, account, version, declared_by, declared_at)
  values (p_partner_id, v_rail, v_payout - 'rail', 1, v_staff, now())
  on conflict (partner_id) do update set
    rail = excluded.rail,
    account = excluded.account,
    version = x.version + 1,
    declared_by = excluded.declared_by,
    declared_at = excluded.declared_at,
    verified_by = null,
    verified_at = null,
    verified_version = null
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'experiences', p_action => 'partner.payout_declared',
    p_actor_id => v_staff,
    p_target_type => 'experience_partner', p_target_id => p_partner_id,
    p_target_label => v_partner.name,
    p_city_id => v_partner.city_id,
    p_severity => 'notice',
    p_before => case when v_old.partner_id is null then null else jsonb_build_object(
      'rail', v_old.rail, 'version', v_old.version,
      'destination', public.fn_experience_partner_payout_masked(v_old.rail, v_old.account),
      'verified', v_old.verified_version is not distinct from v_old.version) end,
    p_after => jsonb_build_object(
      'rail', v_new.rail, 'version', v_new.version,
      'destination', public.fn_experience_partner_payout_masked(v_new.rail, v_new.account)));

  return jsonb_build_object(
    'ok', true,
    'partner_id', p_partner_id,
    'version', v_new.version,
    'rail', v_new.rail,
    'destination_masked', public.fn_experience_partner_payout_masked(v_new.rail, v_new.account),
    'message', 'Saved. Finance verifies the details before a payout run pays the partner.');
end;
$$;

comment on function public.rpc_experience_partner_payout_declare(uuid, jsonb) is
  'Experiences: declares or changes where a partner is paid. Clears any verification; Finance verifies again before a run pays.';

/*
 * Finance verifies the version it looked at. Full Finance only, and not
 * whoever declared the details, except a super admin, which is logged for
 * review.
 */
create or replace function public.rpc_experience_partner_payout_verify(
  p_partner_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_row public.experience_partner_payout;
  v_partner public.experience_partner;
  v_self boolean;
begin
  select * into v_row from public.experience_partner_payout
   where partner_id = p_partner_id for update;
  if v_row.partner_id is null then
    raise exception 'No payout details have been declared for that partner.' using errcode = 'P0002';
  end if;
  if p_version is distinct from v_row.version then
    raise exception 'The payout details changed after you opened them. Check the new details, then verify.'
      using errcode = '40001';
  end if;
  if v_row.verified_version is not distinct from v_row.version then
    raise exception 'These payout details are already verified.' using errcode = '23514';
  end if;

  v_self := coalesce(v_row.declared_by = v_staff, false);
  if v_self and not authz.is_super_admin() then
    raise exception 'Someone other than whoever declared these payout details has to verify them.'
      using errcode = '42501';
  end if;

  update public.experience_partner_payout
     set verified_by = v_staff, verified_at = now(), verified_version = version
   where partner_id = p_partner_id
  returning * into v_row;

  select * into v_partner from public.experience_partner where id = p_partner_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => case when v_self then 'finance.partner_payout_self_verified'
                     else 'finance.partner_payout_verified' end,
    p_actor_id => v_staff,
    p_target_type => 'experience_partner', p_target_id => p_partner_id,
    p_target_label => v_partner.name,
    p_city_id => v_partner.city_id,
    p_severity => case when v_self then 'high' else 'notice' end::public.audit_severity,
    p_after => jsonb_build_object(
      'rail', v_row.rail, 'version', v_row.version,
      'destination', public.fn_experience_partner_payout_masked(v_row.rail, v_row.account)));

  return jsonb_build_object(
    'ok', true,
    'partner_id', p_partner_id,
    'version', v_row.version,
    'destination_masked', public.fn_experience_partner_payout_masked(v_row.rail, v_row.account),
    'message', 'Verified. The next payout run pays ' || v_partner.name || ' there.');
end;
$$;

comment on function public.rpc_experience_partner_payout_verify(uuid, integer) is
  'Finance: verifies a partner''s declared payout details, by version. Not the person who declared them (a super admin may, logged for review).';

/*
 * Every partner with payout details declared, newest first with those
 * waiting on Finance at the top. People who reach Finance or Experiences
 * see the destination masked; people with full Finance, who verify and pay,
 * also get the details themselves.
 */
create or replace function public.rpc_experience_partner_payouts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := authz.has_full_finance();
begin
  if not (authz.is_super_admin() or authz.finance_reads() or authz.reaches_module('experiences')) then
    raise exception 'Only people who reach Finance or Experiences can see partner payout details.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'partner_id', p.id,
             'partner_name', p.name,
             'partner_status', p.status,
             'city', c.name,
             'rail', x.rail,
             'destination_masked', public.fn_experience_partner_payout_masked(x.rail, x.account),
             'account_name', x.account ->> 'accountName',
             'bank_name', x.account ->> 'bankName',
             'account', case when v_full then x.account end,
             'version', x.version,
             'declared_by', x.declared_by,
             'declared_by_name', coalesce(d.display_name, d.email),
             'declared_at', x.declared_at,
             'verified', x.verified_version is not distinct from x.version,
             'verified_by_name', coalesce(v.display_name, v.email),
             'verified_at', x.verified_at)
           order by (x.verified_version is not distinct from x.version), x.declared_at desc)
    from public.experience_partner_payout x
    join public.experience_partner p on p.id = x.partner_id
    left join public.city c on c.id = p.city_id
    left join public.staff_user d on d.id = x.declared_by
    left join public.staff_user v on v.id = x.verified_by), '[]'::jsonb);
end;
$$;

comment on function public.rpc_experience_partner_payouts() is
  'Finance and Experiences: partner payout details, masked, with who declared and verified them. Full Finance also gets the account itself. Reads only.';

-- ═════════════════════════════════════════════════════════ 4. the postings

/* The guest's money arrives: the quote total, held until the day happens. */
create or replace function ledger.fn_post_plan_paid(p_plan_id uuid, p_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_cents bigint;
  v_staff uuid := authz.staff_id();
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such plan.' using errcode = 'no_data_found';
  end if;
  if v_plan.paid_at is null then
    raise exception 'That plan is not marked paid, so there is nothing to post.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('mpesa', 'bank') then
    raise exception 'A plan is paid by M-PESA or bank.' using errcode = '22023';
  end if;

  v_cents := ledger.from_kes(coalesce(v_plan.quote_total_kes, 0));
  if v_cents <= 0 then
    return null;
  end if;

  return ledger.post(
    p_kind => 'experience_plan_paid',
    p_idempotency_key => 'plan_paid:' || p_plan_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', case p_method when 'bank' then 'cash.bank'
                                                  else 'cash.mpesa_paybill' end,
                         'debit', v_cents,
                         'memo', v_plan.reference || ' · ' || coalesce(v_plan.payment_reference, '')),
      jsonb_build_object('account', 'deferred.experience_plan', 'credit', v_cents,
                         'memo', v_plan.reference)),
    p_effective_at => v_plan.paid_at,
    p_city_id => v_plan.city_id,
    p_actor_kind => case when v_staff is null then 'system' else 'staff' end::public.actor_type,
    p_actor_id => v_staff,
    p_actor_label => case when v_staff is null then '[System] · ledger' end,
    p_reason_code => 'experience_plan_paid',
    p_related => jsonb_build_object('plan_id', p_plan_id, 'reference', v_plan.reference,
                                    'payment_reference', v_plan.payment_reference,
                                    'method', p_method));
end;
$$;

/* A block happened: its partner is owed its price, out of what the guest paid. */
create or replace function ledger.fn_post_plan_block_partner(p_block_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_plan public.plan;
  v_partner uuid;
  v_cents bigint;
  v_staff uuid := authz.staff_id();
begin
  select * into v_block from public.plan_block where id = p_block_id;
  if v_block.id is null then
    raise exception 'No such block.' using errcode = 'no_data_found';
  end if;

  if v_block.status <> 'done' or v_block.included_by is not null or v_block.kind = 'free' then
    return null;
  end if;

  v_cents := ledger.from_kes(coalesce(v_block.price_quoted_kes, 0));
  if v_cents <= 0 then
    return null;
  end if;

  select k.partner_id into v_partner
    from public.experience_component k where k.id = v_block.component_id;
  if v_partner is null then
    return null;
  end if;

  /* The guest's money reached the ledger only if the payment was posted.
     A plan paid before that was wired posts nothing. */
  if not exists (select 1 from ledger.transaction t
                  where t.idempotency_key = 'plan_paid:' || v_block.plan_id::text) then
    return null;
  end if;

  select * into v_plan from public.plan where id = v_block.plan_id;

  return ledger.post(
    p_kind => 'experience_partner_owed',
    p_idempotency_key => 'plan_block_partner:' || p_block_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'deferred.experience_plan', 'debit', v_cents,
                         'memo', v_plan.reference),
      jsonb_build_object('account', 'payable.experience_partner',
                         'party_type', 'experience_partner', 'party_id', v_partner,
                         'credit', v_cents,
                         'memo', v_plan.reference || ' · ' || v_block.title_snapshot)),
    p_effective_at => coalesce(v_block.done_at, now()),
    p_city_id => v_plan.city_id,
    p_actor_kind => case when v_staff is null then 'system' else 'staff' end::public.actor_type,
    p_actor_id => v_staff,
    p_actor_label => case when v_staff is null then '[System] · ledger' end,
    p_reason_code => 'experience_block_done',
    p_related => jsonb_build_object('plan_id', v_plan.id, 'plan_block_id', p_block_id,
                                    'partner_id', v_partner, 'reference', v_plan.reference));
end;
$$;

/* The day is closed: the concierge fee is NexG's, less the VAT in it. */
create or replace function ledger.fn_post_plan_fee(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_fee bigint;
  v_vat bigint;
  v_staff uuid := authz.staff_id();
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such plan.' using errcode = 'no_data_found';
  end if;
  if v_plan.status <> 'completed' then
    return null;
  end if;
  if not exists (select 1 from ledger.transaction t
                  where t.idempotency_key = 'plan_paid:' || p_plan_id::text) then
    return null;
  end if;

  v_fee := ledger.from_kes(coalesce(v_plan.concierge_fee_kes, 0));
  if v_fee <= 0 then
    return null;
  end if;
  v_vat := ledger.fn_vat_part(v_fee, coalesce(settings.fn_num('tax.vat_pct', v_plan.city_id), 16));

  return ledger.post(
    p_kind => 'experience_fee_recognised',
    p_idempotency_key => 'plan_fee:' || p_plan_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'deferred.experience_plan', 'debit', v_fee,
                         'memo', v_plan.reference),
      jsonb_build_object('account', 'revenue.concierge_fee', 'credit', v_fee - v_vat,
                         'memo', v_plan.reference),
      jsonb_build_object('account', 'tax.vat_output', 'credit', v_vat,
                         'memo', 'VAT on the concierge fee · ' || v_plan.reference)),
    p_effective_at => coalesce(v_plan.completed_at, now()),
    p_city_id => v_plan.city_id,
    p_actor_kind => case when v_staff is null then 'system' else 'staff' end::public.actor_type,
    p_actor_id => v_staff,
    p_actor_label => case when v_staff is null then '[System] · ledger' end,
    p_reason_code => 'experience_fee',
    p_related => jsonb_build_object('plan_id', p_plan_id, 'reference', v_plan.reference));
end;
$$;

comment on function ledger.fn_post_plan_paid(uuid, text) is
  'A paid experience plan: Dr cash (M-PESA paybill or bank) / Cr deferred.experience_plan for the quote total. Key plan_paid:<plan>.';
comment on function ledger.fn_post_plan_block_partner(uuid) is
  'A done block of a paid plan: Dr deferred.experience_plan / Cr payable.experience_partner:<partner> for its price. Key plan_block_partner:<block>.';
comment on function ledger.fn_post_plan_fee(uuid) is
  'A completed, paid plan: Dr deferred.experience_plan / Cr revenue.concierge_fee net of VAT and tax.vat_output. Key plan_fee:<plan>.';

-- ═══════════════════════════════════════ 5. marking a plan paid, with how

/* The two-argument version goes: with a third argument that has a default,
   calls naming two would match both and be refused as ambiguous. */
drop function if exists public.rpc_mark_paid(uuid, text);

create or replace function public.rpc_mark_paid(
  p_plan_id uuid,
  p_reference text,
  p_method text default 'mpesa'
)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_method text := lower(btrim(coalesce(p_method, 'mpesa')));
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'A payment needs the reference it was taken under.'
      using errcode = 'check_violation';
  end if;
  if v_method not in ('mpesa', 'bank') then
    raise exception 'Say how the guest paid, by M-PESA or by bank.' using errcode = '22023';
  end if;

  update public.plan
  set status = 'paid', paid_at = now(), payment_reference = trim(p_reference)
  where id = p_plan_id and status = 'approved'
  returning * into v_plan;

  if v_plan.id is null then
    raise exception 'That day is not waiting on payment.' using errcode = 'check_violation';
  end if;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_paid', p_plan_id, v_plan.guest_phone, 'pending');

  /* The quote total lands in cash and waits on deferred.experience_plan
     until each block is done and the day is closed. */
  perform ledger.fn_post_plan_paid(p_plan_id, v_method);

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.paid',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id,
    p_severity => 'notice'::public.audit_severity,
    p_after => jsonb_build_object('total', v_plan.quote_total_kes, 'reference', trim(p_reference),
                                  'method', v_method));

  return v_plan;
end;
$$;

comment on function public.rpc_mark_paid(uuid, text, text) is
  'Records a plan paid under the reference it was taken with and how (mpesa or bank), and posts the quote total to the ledger: cash in, held on deferred.experience_plan.';

-- ══════════════════════════════════════════════════ 6. the triggers

/* A block the quote priced (confirmed or changed) that is now done. An
   unavailable or removed block marked done was never paid for. */
create or replace function public.tg_plan_block_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status in ('confirmed', 'changed') then
    perform ledger.fn_post_plan_block_partner(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists plan_block_posts_to_ledger on public.plan_block;
create trigger plan_block_posts_to_ledger
  after update of status on public.plan_block
  for each row
  when (new.status = 'done' and old.status is distinct from new.status)
  execute function public.tg_plan_block_posts_to_ledger();

create or replace function public.tg_plan_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    perform ledger.fn_post_plan_fee(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists plan_posts_to_ledger on public.plan;
create trigger plan_posts_to_ledger
  after update of status on public.plan
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.tg_plan_posts_to_ledger();

-- ═════════════════════════════════════════════════════ 7. the weekly run

CREATE OR REPLACE FUNCTION public.rpc_settlement_build(p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_city_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := authz.staff_id();
  v_start timestamptz;
  v_end timestamptz;
  v_run uuid;
  r public.fin_settlement_run;
  owed record;
  v_line uuid;
  v_cash bigint;
  v_net bigint;
  v_state public.settlement_line_state;
  v_hold text;
  v_minimum bigint;
  v_label text;
  v_rail public.settlement_rail;
  v_dest text;
  v_partner_status public.partner_status;
  v_payout public.experience_partner_payout;
  v_lines integer := 0;
  v_held integer := 0;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()) then
    raise exception 'Building a run is Finance''s.' using errcode = '42501';
  end if;

  /* Monday 00:00 to Sunday 23:59 of the week just finished. */
  v_start := coalesce(p_period_start,
    date_trunc('week', (now() at time zone 'Africa/Nairobi') - interval '7 days')
      at time zone 'Africa/Nairobi');
  v_end := coalesce(p_period_end, v_start + interval '7 days');

  select * into r from public.fin_settlement_run
   where period_start = v_start and period_end = v_end and state <> 'cancelled';

  if r.id is not null then
    if r.state not in ('draft', 'built') then
      raise exception 'That week is already %. A run is frozen once it has been checked.', r.state;
    end if;
    /* A rebuild is a full rebuild: lines released, then
       reselected. A partial one would leave yesterday's answer
       mixed with today's. */
    delete from public.fin_settled_entry where run_id = r.id;
    delete from public.fin_settlement_line where run_id = r.id;
    v_run := r.id;
  else
    insert into public.fin_settlement_run (
      reference, city_id, period_start, period_end, cutoff_at, pay_date, built_by)
    values (
      'RUN-' || to_char(v_start, 'IYYY-"W"IW'), p_city_id, v_start, v_end,
      v_end - interval '1 day',
      (v_end + interval '5 days')::date, v_me)
    returning id into v_run;
  end if;

  v_minimum := ledger.from_kes(settings.fn_num('settlement.minimum_payout', p_city_id));

  for owed in select * from public.fn_settlement_owed(v_start, v_end, p_city_id) loop
    v_state := 'ready';
    v_hold := null;
    v_dest := null;
    v_net := owed.gross_cents;

    if owed.party_type = 'merchant' then
      select coalesce(m.trading_name, m.legal_name),
             case m.payout_rail when 'bank' then 'bank_eft'::public.settlement_rail
                                else 'mpesa_b2b'::public.settlement_rail end
        into v_label, v_rail
        from public.merchant m where m.id = owed.party_id;

      if exists (select 1 from public.merchant m where m.id = owed.party_id
                   and m.status in ('suspended', 'delisted')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'rider' then
      select nullif(trim(coalesce(rd.first_name,'') || ' ' || coalesce(rd.last_name,'')), ''),
             'mpesa_b2c'::public.settlement_rail
        into v_label, v_rail
        from public.rider rd where rd.id = owed.party_id;

      /*
       * Cash netting. A rider holding NexG's cash is paid the
       * difference, not the gross — and if they are holding more
       * than they earned, nothing goes out and recovery starts.
       */
      select coalesce(balance, 0) into v_cash from ledger.balance_v
       where code = 'cash.rider_on_hand:' || owed.party_id::text;

      if coalesce(v_cash, 0) > 0 then
        v_net := owed.gross_cents - v_cash;
        v_state := 'cash_netted';
        if v_net < 0 then
          v_state := 'held_suspended';
          v_hold := 'holds more of our cash than they earned · recovery';
          v_net := 0;
        end if;
      end if;

      if exists (select 1 from public.rider rd where rd.id = owed.party_id
                   and rd.status in ('suspended', 'offboarded')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'experience_partner' then
      /*
       * An experience partner: the venue or operator behind a concierge
       * plan's blocks. Paid only to details Finance has verified; held
       * without them, and held while the partner is paused, suspended or
       * delisted.
       */
      select nullif(trim(p.name), ''), p.status
        into v_label, v_partner_status
        from public.experience_partner p where p.id = owed.party_id;

      select * into v_payout from public.experience_partner_payout x
       where x.partner_id = owed.party_id;

      v_rail := case v_payout.rail
                  when 'mpesa_phone' then 'mpesa_b2c'::public.settlement_rail
                  when 'bank' then 'bank_eft'::public.settlement_rail
                  else 'mpesa_b2b'::public.settlement_rail end;

      if v_payout.partner_id is null then
        v_state := 'held_kyc';
        v_hold := 'no payout details on file';
      elsif v_payout.verified_version is distinct from v_payout.version then
        v_state := 'held_kyc';
        v_hold := 'payout details not yet verified by Finance';
      else
        v_dest := public.fn_experience_partner_payout_masked(v_payout.rail, v_payout.account);
      end if;

      if v_partner_status in ('paused', 'suspended', 'delisted') then
        v_state := 'held_suspended';
        v_hold := 'the partner is ' || v_partner_status::text;
      end if;

    else
      v_label := '[' || owed.party_type::text || ']';
      v_rail := 'credit_note';
    end if;

    /* Below the minimum, it rolls. A KES 12 payout costs more in
       provider fees than it is worth, and the rider would rather
       have it next week than not at all. */
    if v_state = 'ready' and v_minimum is not null and v_net < v_minimum and v_net > 0 then
      v_state := 'below_minimum_rolled';
      v_hold := 'under the minimum payout · rolls to next week';
    end if;

    insert into public.fin_settlement_line (
      run_id, party_type, party_id, party_label, rail, destination_masked,
      gross_cents, commission_cents, net_cents, state, hold_reason, ledger_entry_ids)
    values (
      v_run, owed.party_type, owed.party_id, coalesce(v_label, '[—]'), v_rail, v_dest,
      owed.gross_cents, owed.commission_cents, greatest(v_net, 0), v_state, v_hold,
      owed.entry_ids)
    returning id into v_line;

    /*
     * Claim the entries. A line that rolls forward does not
     * claim them — that is what lets the money appear in next
     * week's run instead of vanishing.
     */
    if v_state <> 'below_minimum_rolled' then
      insert into public.fin_settled_entry (entry_id, line_id, run_id)
      select unnest(owed.entry_ids), v_line, v_run;
    else
      delete from public.fin_settlement_line where id = v_line;
      continue;
    end if;

    v_lines := v_lines + 1;
    if v_state::text like 'held%' then v_held := v_held + 1; end if;
  end loop;

  perform public.fn_settlement_recompute(v_run);

  if r.state is null or r.state = 'draft' then
    perform public.fn_settlement_transition(v_run, 'built');
  end if;

  select * into r from public.fin_settlement_run where id = v_run;

  perform audit.log('staff'::public.actor_type, 'finance', 'settlement.built',
    p_target_type => 'settlement_run', p_target_id => v_run,
    p_severity => 'notice');

  return jsonb_build_object('ok', true, 'run_id', v_run, 'reference', r.reference,
    'lines', v_lines, 'held', v_held, 'totals', r.totals, 'hash', r.hash,
    'message', v_lines || ' line' || case when v_lines = 1 then '' else 's' end
      || ' built for ' || to_char(v_start, 'DD Mon') || '–' || to_char(v_end - interval '1 day', 'DD Mon')
      || '. Nothing is approved and nothing has been sent.');
end;
$function$;

/*
 * Totals, checks and the hash, recomputed together.
 *
 * Together on purpose: a hash that did not cover the checks
 * would let a run be approved, re-checked differently, and paid.
 * Partner totals are added only to a run that has partner lines, so
 * every other run totals and hashes exactly as it did before.
 */
create or replace function public.fn_settlement_recompute(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.fin_settlement_run;
  v_totals jsonb;
  v_checks jsonb;
  v_hash text;
  v_blocked jsonb;
begin
  select * into r from public.fin_settlement_run where id = p_run_id;

  select jsonb_build_object(
    'merchants_cents', coalesce(sum(net_cents) filter (where party_type = 'merchant'), 0),
    'riders_cents', coalesce(sum(net_cents) filter (where party_type = 'rider'), 0),
    'host_credits_cents', coalesce(sum(net_cents) filter (where party_type = 'host'), 0),
    'held_cents', coalesce(sum(net_cents) filter (where state::text like 'held%'), 0),
    'adjustments_cents', coalesce(sum(adjustment_cents), 0),
    'leaving_cents', coalesce(sum(net_cents) filter (
        where state not in ('held_suspended','held_kyc','name_mismatch','mismatch')), 0),
    'lines', count(*),
    'held_lines', count(*) filter (where state::text like 'held%'),
    'merchants', count(*) filter (where party_type = 'merchant'),
    'riders', count(*) filter (where party_type = 'rider'))
    || case when count(*) filter (where party_type = 'experience_partner') > 0
            then jsonb_build_object(
              'partners_cents', coalesce(sum(net_cents) filter (
                  where party_type = 'experience_partner'), 0),
              'partners', count(*) filter (where party_type = 'experience_partner'))
            else '{}'::jsonb end
  into v_totals
  from public.fin_settlement_line where run_id = p_run_id;

  v_blocked := public.fn_outbound_blocked();

  v_checks := jsonb_build_array(
    jsonb_build_object('key', 'ledger_equality',
      'label', 'Totals equal the ledger',
      'ok', not exists (
        select 1 from public.fin_settlement_line l
         where l.run_id = p_run_id
           and l.gross_cents <> coalesce((
             select sum(e.credit) - sum(e.debit) from ledger.entry e
              where e.id = any (l.ledger_entry_ids)), 0)),
      'detail', 'Every line re-summed from the entries it claims.'),

    jsonb_build_object('key', 'no_double_settlement',
      'label', 'No ledger line is in two runs',
      'ok', not exists (
        select 1 from public.fin_settled_entry s
         join public.fin_settlement_line l on l.id = s.line_id
         where s.run_id = p_run_id
           and exists (select 1 from public.fin_settled_entry s2
                        where s2.entry_id = s.entry_id and s2.run_id <> p_run_id)),
      'detail', 'Enforced by a primary key; checked again here so the screen can say so.'),

    jsonb_build_object('key', 'no_unconfirmed_refunds',
      'label', 'No unconfirmed refund is included',
      'ok', not exists (
        select 1 from public.refund rf
         where rf.status in ('requested', 'awaiting_approval')
           and rf.requested_at < r.period_end),
      'detail', 'A refund still being decided rolls to next week.'),

    jsonb_build_object('key', 'names_checked',
      'label', 'Every destination name has been looked up',
      'ok', not exists (
        select 1 from public.fin_settlement_line l
         where l.run_id = p_run_id and l.state = 'name_mismatch'),
      'detail', 'A payout to the wrong name is not recoverable.'),

    jsonb_build_object('key', 'invariants_clear',
      'label', 'The ledger has no open questions',
      'ok', not (v_blocked ->> 'blocked')::boolean,
      'detail', coalesce((select string_agg(x ->> 'label', '; ')
                            from jsonb_array_elements(v_blocked -> 'reasons') x),
                         'All nine answer zero.')),

    jsonb_build_object('key', 'nothing_negative',
      'label', 'No line pays a negative amount',
      'ok', not exists (select 1 from public.fin_settlement_line
                         where run_id = p_run_id and net_cents < 0),
      'detail', 'A negative net is a netting mistake, not a payout.')
  );

  v_hash := encode(extensions.digest(
    coalesce(v_totals::text, '') || '|' || coalesce(v_checks::text, '') || '|' ||
    coalesce((select string_agg(l.id::text || ':' || l.net_cents::text, ',' order by l.id)
                from public.fin_settlement_line l where l.run_id = p_run_id), ''),
    'sha256'), 'hex');

  update public.fin_settlement_run
     set totals = v_totals, checks = v_checks, hash = v_hash,
         built_at = coalesce(built_at, now()), updated_at = now()
   where id = p_run_id;
end;
$$;

-- ═══════════════════════════════════════════ 8. what is owed, by party

create or replace function public.fn_fin_build_party_owed()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  delete from public.fin_party_owed;

  with owed as (
    select
      e.party_type,
      e.party_id,
      /* Payables are credit-normal, so credits less debits is
         what is still owed. An entry already claimed by a
         settlement line is excluded — it is owed no longer, it
         is scheduled. */
      sum(e.credit - e.debit)::bigint as owed,
      min(e.effective_at) as oldest,
      count(*)::integer as n
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
     where a.kind = 'liability'
       and a.base in ('payable.merchant', 'payable.rider', 'payable.host_credit',
                      'payable.experience_partner')
       and e.party_type is not null
       and e.party_id is not null
       and not exists (select 1 from public.fin_settled_entry s where s.entry_id = e.id)
     group by e.party_type, e.party_id
    having sum(e.credit - e.debit) <> 0
  ),
  inserted as (
    insert into public.fin_party_owed
      (party_type, party_id, label, owed_cents, oldest_unsettled, entry_count,
       as_of_entry_id, built_at)
    select o.party_type, o.party_id,
           coalesce(
             case o.party_type
               when 'merchant' then (select coalesce(m.trading_name, m.legal_name)
                                       from public.merchant m where m.id = o.party_id)
               when 'rider' then (select nullif(trim(coalesce(r.first_name, '') || ' '
                                                  || coalesce(r.last_name, '')), '')
                                    from public.rider r where r.id = o.party_id)
               when 'host' then (select nullif(trim(h.display_name), '')
                                   from public.host h where h.id = o.party_id)
               when 'experience_partner' then (select nullif(trim(p.name), '')
                                                 from public.experience_partner p
                                                where p.id = o.party_id)
               else null
             end,
             /* Never a bare uuid on a payout screen. If the name
                will not resolve, say so — an unnamed payee is a
                reason to stop, not a cosmetic gap. */
             '[name not found]'),
           o.owed, o.oldest, o.n,
           coalesce((select max(id) from ledger.entry), 0), now()
      from owed o
    returning 1
  )
  select count(*)::integer into v_rows from inserted;

  return v_rows;
end;
$$;

-- ═════════════════════════════════════════════ 9. registry and grants

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('partner.payout_declared', 'experiences', 'notice', false, false, true, '{}',
   'Payout details for an experience partner were declared or changed; Finance verifies them before a run pays the partner'),
  ('finance.partner_payout_verified', 'finance', 'notice', false, true, true, '{}',
   'Finance verified an experience partner''s payout details, declared by someone else'),
  ('finance.partner_payout_self_verified', 'finance', 'high', true, false, true, '{}',
   'A super admin verified experience partner payout details they declared themselves')
on conflict (action) do nothing;

/* Internal: called by the functions and triggers above, never directly. */
revoke execute on function
  ledger.fn_post_plan_paid(uuid, text),
  ledger.fn_post_plan_block_partner(uuid),
  ledger.fn_post_plan_fee(uuid),
  public.fn_experience_partner_payout_masked(text, jsonb),
  public.tg_plan_block_posts_to_ledger(),
  public.tg_plan_posts_to_ledger()
  from public, anon, authenticated;
grant execute on function
  ledger.fn_post_plan_paid(uuid, text),
  ledger.fn_post_plan_block_partner(uuid),
  ledger.fn_post_plan_fee(uuid),
  public.fn_experience_partner_payout_masked(text, jsonb)
  to service_role;

/* Each checks its caller itself. */
revoke execute on function
  public.rpc_mark_paid(uuid, text, text),
  public.rpc_experience_partner_payout_declare(uuid, jsonb),
  public.rpc_experience_partner_payout_verify(uuid, integer),
  public.rpc_experience_partner_payouts()
  from public, anon;
grant execute on function
  public.rpc_mark_paid(uuid, text, text),
  public.rpc_experience_partner_payout_declare(uuid, jsonb),
  public.rpc_experience_partner_payout_verify(uuid, integer),
  public.rpc_experience_partner_payouts()
  to authenticated, service_role;

/* Unchanged by create or replace, restated so this file stands on its own. */
revoke execute on function public.fn_settlement_recompute(uuid) from public, anon, authenticated;
revoke execute on function public.fn_fin_build_party_owed() from public, anon, authenticated;
revoke execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) to authenticated;

notify pgrst, 'reload schema';
