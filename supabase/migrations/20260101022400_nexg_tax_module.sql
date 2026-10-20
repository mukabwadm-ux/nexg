-- NexG's own tax module.
--
-- Every paid order produces sequentially numbered tax documents: one to the
-- merchant for NexG's commission, one to the guest for NexG's fees. VAT is
-- carved out of the inclusive amounts at the configured rate. Each document
-- carries a KRA status so a provider (eTIMS or otherwise) can be connected
-- later without reshaping anything: until then every document is `pending`.

alter table public.merchant add column if not exists kra_pin text;

create table if not exists public.tax_counter (
  year integer primary key,
  last_number integer not null default 0
);

create table if not exists public.tax_invoice (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  kind text not null default 'tax_invoice' check (kind in ('tax_invoice', 'credit_note')),
  purpose text not null check (purpose in ('merchant_commission', 'guest_fees')),
  order_id uuid references public."order" (id),
  city_id uuid,
  party_type text not null check (party_type in ('merchant', 'guest')),
  party_id uuid,
  party_name text,
  party_pin text,
  issued_at timestamptz not null default now(),
  currency text not null default 'KES',
  net_cents bigint not null,
  vat_cents bigint not null,
  gross_cents bigint not null,
  vat_pct numeric(5, 2) not null,
  kra_status text not null default 'pending'
    check (kra_status in ('pending', 'submitted', 'accepted', 'rejected', 'not_required')),
  kra_reference text,
  kra_submitted_at timestamptz,
  kra_response jsonb,
  created_at timestamptz not null default now(),
  constraint tax_invoice_adds_up check (net_cents + vat_cents = gross_cents),
  constraint tax_invoice_one_per_purpose unique (order_id, purpose, kind)
);

create table if not exists public.tax_invoice_line (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.tax_invoice (id) on delete cascade,
  position integer not null,
  description text not null,
  net_cents bigint not null,
  vat_cents bigint not null,
  gross_cents bigint not null,
  constraint tax_invoice_line_adds_up check (net_cents + vat_cents = gross_cents)
);

create index if not exists tax_invoice_issued_idx on public.tax_invoice (issued_at desc);
create index if not exists tax_invoice_status_idx on public.tax_invoice (kra_status);
create index if not exists tax_invoice_line_invoice_idx on public.tax_invoice_line (invoice_id);

alter table public.tax_counter enable row level security;
alter table public.tax_invoice enable row level security;
alter table public.tax_invoice_line enable row level security;

drop policy if exists tax_invoice_read_finance on public.tax_invoice;
create policy tax_invoice_read_finance on public.tax_invoice
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('finance'));

drop policy if exists tax_invoice_line_read_finance on public.tax_invoice_line;
create policy tax_invoice_line_read_finance on public.tax_invoice_line
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('finance'));

-- Gapless within a year: the counter row is locked until the document commits.
create or replace function public.fn_tax_next_number(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from p_at at time zone 'Africa/Nairobi')::integer;
  v_n integer;
begin
  insert into public.tax_counter as c (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_n;
  return 'NX-INV-' || v_year || '-' || lpad(v_n::text, 6, '0');
end;
$$;

revoke execute on function public.fn_tax_next_number(timestamptz) from public, anon, authenticated;

create or replace function public.fn_tax_issue_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public."order";
  v_pct numeric;
  v_issued integer := 0;
  v_id uuid;
  v_fees bigint;
  v_m record;
  v_g record;
  v_vat bigint;
begin
  select * into o from public."order" where id = p_order_id;
  if not found then return 0; end if;

  v_pct := coalesce(settings.fn_num('tax.vat_pct', o.city_id), 16);

  if coalesce(o.commission_cents, 0) > 0
     and not exists (select 1 from public.tax_invoice
                      where order_id = o.id and purpose = 'merchant_commission' and kind = 'tax_invoice') then
    select m.trading_name, m.legal_name, m.kra_pin into v_m
      from public.merchant m where m.id = o.merchant_id;
    v_vat := ledger.fn_vat_part(o.commission_cents, v_pct);

    insert into public.tax_invoice (number, purpose, order_id, city_id, party_type, party_id,
      party_name, party_pin, issued_at, net_cents, vat_cents, gross_cents, vat_pct)
    values (public.fn_tax_next_number(), 'merchant_commission', o.id, o.city_id, 'merchant',
      o.merchant_id, coalesce(v_m.legal_name, v_m.trading_name), v_m.kra_pin, now(),
      o.commission_cents - v_vat, v_vat, o.commission_cents, v_pct)
    returning id into v_id;

    insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
    values (v_id, 1, 'Platform commission · order ' || o.reference,
      o.commission_cents - v_vat, v_vat, o.commission_cents);
    v_issued := v_issued + 1;
  end if;

  v_fees := o.delivery_fee_cents + o.service_fee_cents + o.small_basket_fee_cents
          + o.night_surcharge_cents + o.concierge_fee_cents + o.cash_handling_cents;

  if v_fees > 0
     and not exists (select 1 from public.tax_invoice
                      where order_id = o.id and purpose = 'guest_fees' and kind = 'tax_invoice') then
    select g.name into v_g from public.guest g where g.id = o.guest_id;
    v_vat := ledger.fn_vat_part(v_fees, v_pct);

    insert into public.tax_invoice (number, purpose, order_id, city_id, party_type, party_id,
      party_name, issued_at, net_cents, vat_cents, gross_cents, vat_pct)
    values (public.fn_tax_next_number(), 'guest_fees', o.id, o.city_id, 'guest',
      o.guest_id, v_g.name, now(), v_fees - v_vat, v_vat, v_fees, v_pct)
    returning id into v_id;

    insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
    select v_id, row_number() over (), f.d, f.g - ledger.fn_vat_part(f.g, v_pct),
           ledger.fn_vat_part(f.g, v_pct), f.g
    from (values
      ('Delivery fee', o.delivery_fee_cents),
      ('Service fee', o.service_fee_cents),
      ('Small basket fee', o.small_basket_fee_cents),
      ('Night surcharge', o.night_surcharge_cents),
      ('Concierge fee', o.concierge_fee_cents),
      ('Cash handling', o.cash_handling_cents)) as f(d, g)
    where f.g > 0;
    v_issued := v_issued + 1;
  end if;

  return v_issued;
end;
$$;

revoke execute on function public.fn_tax_issue_order(uuid) from public, anon, authenticated;
grant execute on function public.fn_tax_issue_order(uuid) to service_role;

/* Tax paperwork must never be the reason a guest's payment fails; a missed
   document is picked up by rpc_tax_issue_missing. */
create or replace function public.tg_order_issues_tax()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status::text in ('paid', 'collected')
     and (old is null or old.payment_status is distinct from new.payment_status) then
    begin
      perform public.fn_tax_issue_order(new.id);
    exception when others then
      raise warning 'tax documents for order % not issued: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists order_issues_tax on public."order";
create trigger order_issues_tax
  after insert or update of payment_status on public."order"
  for each row execute function public.tg_order_issues_tax();

create or replace function authz.has_full_finance()
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
      and a.module_key = 'finance'
      and a.level = 'full')
$$;

grant execute on function authz.has_full_finance() to authenticated, service_role;

create or replace function public.rpc_tax_issue_missing()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  r record;
begin
  if not authz.has_full_finance() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  for r in
    select o.id from public."order" o
    where o.payment_status::text in ('paid', 'collected')
      and not exists (select 1 from public.tax_invoice t where t.order_id = o.id)
  loop
    v_n := v_n + public.fn_tax_issue_order(r.id);
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.rpc_tax_issue_missing() from public, anon;
grant execute on function public.rpc_tax_issue_missing() to authenticated;

-- The slot a KRA / eTIMS integration fills in. Today finance can record it by hand.
create or replace function public.rpc_tax_set_kra_status(
  p_invoice_id uuid,
  p_status text,
  p_reference text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not authz.has_full_finance() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'submitted', 'accepted', 'rejected', 'not_required') then
    raise exception 'Unknown KRA status.';
  end if;
  update public.tax_invoice
     set kra_status = p_status,
         kra_reference = coalesce(nullif(trim(p_reference), ''), kra_reference),
         kra_submitted_at = case when p_status in ('submitted', 'accepted') then coalesce(kra_submitted_at, now())
                                 else kra_submitted_at end,
         kra_response = coalesce(kra_response, '{}'::jsonb)
           || jsonb_build_object('note', p_note, 'set_at', now(), 'set_by', (select auth.uid()))
   where id = p_invoice_id;
  if not found then raise exception 'No such document.'; end if;
end;
$$;

revoke execute on function public.rpc_tax_set_kra_status(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_tax_set_kra_status(uuid, text, text, text) to authenticated;

create or replace view public.tax_vat_summary_v
with (security_invoker = true) as
select
  to_char(date_trunc('month', issued_at at time zone 'Africa/Nairobi'), 'YYYY-MM') as month,
  count(*)::integer as documents,
  sum(case when kind = 'credit_note' then -net_cents else net_cents end)::bigint as net_cents,
  sum(case when kind = 'credit_note' then -vat_cents else vat_cents end)::bigint as vat_cents,
  count(*) filter (where kra_status = 'pending')::integer as pending_kra
from public.tax_invoice
group by 1;

-- Output VAT on commission and fees now has a rate, so the tax position computes it.
create or replace view fin_tax_position_v
with (security_invoker = true) as
select
  1 as sort,
  'Featured placement'::text as source,
  'VAT charged on featured fees'::text as basis,
  coalesce(sum(f.fee_ex_vat), 0)::bigint as base_cents,
  coalesce(sum(f.vat), 0)::bigint as tax_cents,
  true as configured,
  'featured_rate_card.vat_pct'::text as rate_source
from public.featured_fee_line f
union all
select
  2,
  'Merchant settlements',
  'Withholding deducted before payout',
  coalesce(sum(ms.gross_kes), 0)::bigint,
  coalesce(sum(ms.tax_withheld_kes), 0)::bigint,
  true,
  'merchant_statement.tax_withheld_kes'
from public.merchant_statement ms
union all
select
  3,
  'Commission, delivery and service fees',
  'Output VAT on orders, from the tax documents',
  coalesce(sum(case when t.kind = 'credit_note' then -t.net_cents else t.net_cents end), 0)::bigint,
  coalesce(sum(case when t.kind = 'credit_note' then -t.vat_cents else t.vat_cents end), 0)::bigint,
  true,
  'settings tax.vat_pct'
from public.tax_invoice t;
