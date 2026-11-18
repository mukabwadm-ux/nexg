-- Client invoices: Finance → Invoices → Create Invoice.
--
-- Finance invoices clients that are not billed by any other part of the
-- platform: corporate clients, and partners (hosts, hotels, merchants,
-- experience partners) for services outside their statements. These
-- invoices are on the books:
--
--   * Prices are typed without VAT. VAT is added per line: 16% (the
--     tax.vat_pct setting), 0% (zero-rated) or exempt. Every line and total
--     is worked out here, never taken from the browser.
--   * Issuing numbers the invoice from the shared, gapless KRA series
--     (NX-INV-YYYY-NNNNNN), files it in tax_invoice (kra_status pending: there
--     is no eTIMS link yet; Finance records the KRA reference by hand) and
--     posts it: Dr receivable.client gross / Cr revenue per line category
--     net / Cr tax.vat_output VAT, key fin_invoice:<id>, dated the issue date.
--   * A payment (bank or M-PESA, part or whole, never more than is owed)
--     posts Dr cash.bank or cash.mpesa_paybill / Cr receivable.client, key
--     fin_invoice_payment:<id>. The invoice is paid when nothing is owed.
--   * An issued invoice never changes. One with no payments is voided: its
--     posting is reversed (ledger.reverse, called here after the Finance
--     check) and a credit note for the whole amount is filed in tax_invoice.
--   * The PDF is rendered in the console on the NexG letterhead and kept in
--     the private finance-invoices bucket with its SHA-256.
--
-- Rules, all enforced here:
--   * Anyone who reaches Finance reads clients and invoices. Saving,
--     issuing, payments, voiding, PDFs and sending need full Finance
--     (authz.office_finance_require).
--   * Every change goes through an rpc_fin_* function that writes audit.log;
--     the tables have no write policies. Voiding is high severity and waits
--     for review.
--   * Nothing here changes what the existing invoice list returns for host
--     invoices, hotel statements and merchant statements; client invoices are
--     added to it (party_kind 'client').
--
-- Re-runnable: create or replace, if not exists, on conflict do nothing.
--
-- Rollback (nothing has posted to the ledger until an invoice is issued; once
-- one has, its transactions stay, as the ledger is append-only):
--   drop function public.rpc_fin_client_save(uuid, jsonb),
--     public.rpc_fin_clients(),
--     public.rpc_fin_invoice_save(uuid, uuid, jsonb),
--     public.rpc_fin_invoice_issue(uuid),
--     public.rpc_fin_invoice_record_payment(uuid, bigint, text, text, date),
--     public.rpc_fin_invoice_void(uuid, text),
--     public.rpc_fin_invoice_pdf_record(uuid, text, text),
--     public.rpc_fin_invoice_mark_sent(uuid, text),
--     public.rpc_fin_invoice_detail(uuid),
--     public.rpc_fin_letterhead(),
--     ledger.fn_post_fin_invoice(uuid),
--     ledger.fn_post_fin_invoice_payment(uuid);
--   re-run public.rpc_finance_invoices from 20261231000300;
--   drop table public.fin_invoice_payment, public.fin_invoice_line,
--     public.fin_invoice, public.fin_client;
--   drop function public.tg_fin_invoice_guard(), public.tg_fin_invoice_line_guard(),
--     public.tg_fin_invoice_payment_guard();
--   delete from public.tax_invoice where purpose = 'client_invoice' (only
--     while none has been filed with KRA), then put back the two checks
--     from 20260101022400 / 20261026000000;
--   empty finance-invoices through the Storage API, then
--     delete from storage.buckets where id = 'finance-invoices';
--   delete from audit.action_registry where action like 'finance.client\_%';
--   the two accounts stay: accounts are not deleted.

-- ═══════════════════════════════════════════════════════════ the accounts

/* receivable.client is a template posted without a party: a client is not
   a ledger party kind, and the invoice row says whose receivable it is. */
insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  ('receivable.client', 'receivable.client', 'Invoiced to a corporate client or partner',
   'asset', null, null, 'D'),
  ('revenue.other_services', 'revenue.other_services', 'Other services invoiced to clients',
   'revenue', 'nexg', null, 'C')
on conflict (code) do nothing;

-- ═══════════════════════════════════════════ the tax register takes clients

alter table public.tax_invoice
  drop constraint if exists tax_invoice_party_type_check,
  add constraint tax_invoice_party_type_check
    check (party_type in ('merchant', 'guest', 'client')) not valid;
alter table public.tax_invoice validate constraint tax_invoice_party_type_check;

alter table public.tax_invoice
  drop constraint if exists tax_invoice_purpose_check,
  add constraint tax_invoice_purpose_check
    check (purpose in ('merchant_commission', 'guest_fees', 'guest_service_fee',
                       'guest_delivery_fee', 'guest_other_fees', 'client_invoice')) not valid;
alter table public.tax_invoice validate constraint tax_invoice_purpose_check;

-- ═══════════════════════════════════════════════════════════════ clients

create table if not exists public.fin_client (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'corporate' check (kind in ('corporate', 'partner')),
  /* A partner can be tied to its record on the platform. */
  host_id uuid references public.host (id) on delete set null,
  hotel_id uuid references public.hotel (id) on delete set null,
  merchant_id uuid references public.merchant (id) on delete set null,
  experience_partner_id uuid references public.experience_partner (id) on delete set null,
  legal_name text not null check (length(btrim(legal_name)) between 2 and 200),
  trading_name text check (trading_name is null or length(btrim(trading_name)) between 1 and 200),
  kra_pin text check (kra_pin is null or kra_pin ~ '^[AP][0-9]{9}[A-Z]$'),
  email text check (email is null or (length(email) <= 254
                    and email ~* '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$')),
  cc_emails text[] not null default '{}' check (cardinality(cc_emails) <= 5),
  phone text check (phone is null or length(phone) <= 40),
  address text check (address is null or length(address) <= 300),
  payment_terms_days integer not null default 14 check (payment_terms_days between 0 and 365),
  active boolean not null default true,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_client_one_link check (
    num_nonnulls(host_id, hotel_id, merchant_id, experience_partner_id) <= 1),
  constraint fin_client_only_partners_link check (
    kind = 'partner' or num_nonnulls(host_id, hotel_id, merchant_id, experience_partner_id) = 0)
);

create index if not exists fin_client_name_idx on public.fin_client (lower(legal_name));

comment on table public.fin_client is
  'Who Finance invoices by hand: corporate clients and partners. Read by everyone who reaches Finance; written only through rpc_fin_client_save.';

-- ═══════════════════════════════════════════════════════════════ invoices

create table if not exists public.fin_invoice (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fin_client (id) on delete restrict,
  /* From the KRA series when issued; a draft has none. */
  number text unique check (number is null or number ~ '^NX-INV-[0-9]{4}-[0-9]{6}$'),
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  issue_date date not null,
  due_date date not null,
  currency text not null default 'KES' check (currency = 'KES'),
  net_cents bigint not null default 0 check (net_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  gross_cents bigint not null default 0 check (gross_cents >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  /* Made by the form when it opens: a second press of Save finds the first. */
  client_ref uuid not null unique,
  /* The client's details as they were printed on the invoice. */
  bill_to jsonb,
  tax_invoice_id uuid unique references public.tax_invoice (id),
  credit_note_id uuid unique references public.tax_invoice (id),
  issue_txn_id uuid references ledger.transaction (id),
  void_txn_id uuid references ledger.transaction (id),
  pdf_path text check (pdf_path is null or length(pdf_path) <= 300),
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  sent_to text check (sent_to is null or length(sent_to) <= 1500),
  paid_at timestamptz,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_by uuid references public.staff_user (id) on delete set null,
  issued_at timestamptz,
  voided_by uuid references public.staff_user (id) on delete set null,
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(void_reason) <= 500),
  constraint fin_invoice_adds_up check (net_cents + vat_cents = gross_cents),
  constraint fin_invoice_due_after_issue check (due_date >= issue_date),
  constraint fin_invoice_draft_has_no_number check (status <> 'draft' or number is null),
  constraint fin_invoice_issued_is_filed check (
    status = 'draft' or (number is not null and tax_invoice_id is not null
                         and issued_at is not null and bill_to is not null)),
  constraint fin_invoice_paid_has_date check (status <> 'paid' or paid_at is not null),
  constraint fin_invoice_void_is_credited check (
    status <> 'void' or (void_reason is not null and void_txn_id is not null
                         and credit_note_id is not null and voided_at is not null))
);

create index if not exists fin_invoice_client_idx on public.fin_invoice (client_id);
create index if not exists fin_invoice_issue_idx on public.fin_invoice (issue_date desc);
create index if not exists fin_invoice_open_idx on public.fin_invoice (due_date)
  where status = 'issued';

comment on table public.fin_invoice is
  'Invoices Finance raises to clients. Drafts change freely; an issued invoice is numbered in the KRA series, filed in tax_invoice and posted to the ledger, and never changes again: it is paid or voided.';

create table if not exists public.fin_invoice_line (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.fin_invoice (id) on delete cascade,
  sort integer not null check (sort between 1 and 100),
  description text not null check (length(btrim(description)) between 2 and 300),
  quantity numeric(12, 3) not null check (quantity > 0),
  /* Excluding VAT. */
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  vat_rate text not null check (vat_rate in ('standard', 'zero', 'exempt')),
  vat_pct numeric(5, 2) not null check (vat_pct >= 0 and vat_pct <= 100),
  net_cents bigint not null check (net_cents >= 0),
  vat_cents bigint not null check (vat_cents >= 0),
  gross_cents bigint not null,
  revenue_account text not null check (revenue_account in (
    'revenue.commission', 'revenue.service_fee', 'revenue.delivery_fee',
    'revenue.concierge_fee', 'revenue.featured', 'revenue.packages',
    'revenue.other_services')),
  constraint fin_invoice_line_adds_up check (net_cents + vat_cents = gross_cents),
  constraint fin_invoice_line_rate_has_no_vat check (
    vat_rate = 'standard' or (vat_pct = 0 and vat_cents = 0)),
  constraint fin_invoice_line_order unique (invoice_id, sort)
);

comment on table public.fin_invoice_line is
  'The lines of a client invoice: quantity times a unit price excluding VAT, and VAT per line at the standard rate, zero-rated or exempt.';

create table if not exists public.fin_invoice_payment (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.fin_invoice (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('bank', 'mpesa')),
  /* Stored upper-case and trimmed, so one reference is one payment. */
  reference text not null unique
    check (reference = upper(btrim(reference)) and length(reference) between 3 and 80),
  paid_on date not null,
  cash_account text not null check (cash_account in ('cash.bank', 'cash.mpesa_paybill')),
  txn_id uuid references ledger.transaction (id),
  recorded_by uuid references public.staff_user (id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint fin_invoice_payment_account_fits check (
    (method = 'bank' and cash_account = 'cash.bank')
    or (method = 'mpesa' and cash_account = 'cash.mpesa_paybill'))
);

create index if not exists fin_invoice_payment_invoice_idx
  on public.fin_invoice_payment (invoice_id);

comment on table public.fin_invoice_payment is
  'Money received against a client invoice, with its bank or M-PESA reference and the ledger transaction that posted it. Never changed or deleted.';

-- ═══════════════════════════════════════════ an issued invoice never changes

create or replace function public.tg_fin_invoice_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'An issued invoice is never deleted. Void it instead.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'issued') then
      raise exception 'A draft is issued before it is paid or voided.' using errcode = '23514';
    end if;
    return new;
  end if;

  if (new.client_id, new.number, new.issue_date, new.due_date, new.currency,
      new.net_cents, new.vat_cents, new.gross_cents, new.notes, new.client_ref,
      new.bill_to, new.tax_invoice_id, new.issued_by, new.issued_at,
      new.created_by, new.created_at)
     is distinct from
     (old.client_id, old.number, old.issue_date, old.due_date, old.currency,
      old.net_cents, old.vat_cents, old.gross_cents, old.notes, old.client_ref,
      old.bill_to, old.tax_invoice_id, old.issued_by, old.issued_at,
      old.created_by, old.created_at)
     or (old.issue_txn_id is not null and new.issue_txn_id is distinct from old.issue_txn_id)
     or (old.void_txn_id is not null and new.void_txn_id is distinct from old.void_txn_id)
     or (old.credit_note_id is not null and new.credit_note_id is distinct from old.credit_note_id)
  then
    raise exception 'An issued invoice''s client, number, dates and amounts never change. Void it and issue a new one.'
      using errcode = '23514';
  end if;

  if new.status <> old.status and not (old.status = 'issued' and new.status in ('paid', 'void')) then
    raise exception 'An invoice that is % cannot become %.', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists fin_invoice_guard on public.fin_invoice;
create trigger fin_invoice_guard
  before update or delete on public.fin_invoice
  for each row execute function public.tg_fin_invoice_guard();

create or replace function public.tg_fin_invoice_line_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    select i.status into v_status from public.fin_invoice i where i.id = old.invoice_id;
  else
    if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
      raise exception 'A line stays on its invoice.' using errcode = '23514';
    end if;
    select i.status into v_status from public.fin_invoice i where i.id = new.invoice_id;
  end if;

  /* A draft's lines are replaced on every save; an issued invoice's never. */
  if v_status is not null and v_status <> 'draft' then
    raise exception 'The lines of an issued invoice never change. Void it and issue a new one.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists fin_invoice_line_guard on public.fin_invoice_line;
create trigger fin_invoice_line_guard
  before insert or update or delete on public.fin_invoice_line
  for each row execute function public.tg_fin_invoice_line_guard();

create or replace function public.tg_fin_invoice_payment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'A recorded payment is never deleted.' using errcode = '23514';
  end if;
  /* Only the ledger transaction is filled in, once, after posting. */
  if (new.invoice_id, new.amount_cents, new.method, new.reference, new.paid_on,
      new.cash_account, new.recorded_by, new.recorded_at)
     is distinct from
     (old.invoice_id, old.amount_cents, old.method, old.reference, old.paid_on,
      old.cash_account, old.recorded_by, old.recorded_at)
     or (old.txn_id is not null and new.txn_id is distinct from old.txn_id)
  then
    raise exception 'A recorded payment never changes.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists fin_invoice_payment_guard on public.fin_invoice_payment;
create trigger fin_invoice_payment_guard
  before update or delete on public.fin_invoice_payment
  for each row execute function public.tg_fin_invoice_payment_guard();

-- ═════════════════════════════════════════════════════════════ who reads

alter table public.fin_client enable row level security;
alter table public.fin_invoice enable row level security;
alter table public.fin_invoice_line enable row level security;
alter table public.fin_invoice_payment enable row level security;

drop policy if exists fin_client_read on public.fin_client;
create policy fin_client_read on public.fin_client
  for select to authenticated using ((select authz.finance_reads()));
drop policy if exists fin_invoice_read on public.fin_invoice;
create policy fin_invoice_read on public.fin_invoice
  for select to authenticated using ((select authz.finance_reads()));
drop policy if exists fin_invoice_line_read on public.fin_invoice_line;
create policy fin_invoice_line_read on public.fin_invoice_line
  for select to authenticated using ((select authz.finance_reads()));
drop policy if exists fin_invoice_payment_read on public.fin_invoice_payment;
create policy fin_invoice_payment_read on public.fin_invoice_payment
  for select to authenticated using ((select authz.finance_reads()));

revoke all on table public.fin_client, public.fin_invoice, public.fin_invoice_line,
  public.fin_invoice_payment from anon;
revoke insert, update, delete, truncate, references, trigger on table public.fin_client,
  public.fin_invoice, public.fin_invoice_line, public.fin_invoice_payment from authenticated;
grant select on table public.fin_client, public.fin_invoice, public.fin_invoice_line,
  public.fin_invoice_payment to authenticated;

-- ═══════════════════════════════════════════════════════════════════ PDFs

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-invoices', 'finance-invoices', false, 10 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* Written by full Finance into their own folder, read by everyone who
   reaches Finance. Nothing is deleted: the PDF is part of the record. */
drop policy if exists finance_invoices_insert on storage.objects;
create policy finance_invoices_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finance-invoices'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select authz.has_full_finance()));

drop policy if exists finance_invoices_read on storage.objects;
create policy finance_invoices_read on storage.objects
  for select to authenticated
  using (bucket_id = 'finance-invoices' and (select authz.finance_reads()));

-- ═══════════════════════════════════════════════════════ audit registry

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('finance.client_saved', 'finance', 'info', false, false, false, '{}',
   'A client Finance invoices was added or its details changed'),
  ('finance.client_invoice_saved', 'finance', 'info', false, false, true, '{}',
   'A client invoice draft was saved'),
  ('finance.client_invoice_issued', 'finance', 'notice', false, false, true, '{}',
   'A client invoice was issued: numbered, filed as a tax invoice and posted to the ledger'),
  ('finance.client_invoice_payment_recorded', 'finance', 'notice', false, false, true, '{}',
   'A payment against a client invoice was recorded and posted to the ledger'),
  ('finance.client_invoice_voided', 'finance', 'high', true, false, true, '{}',
   'An issued client invoice was voided: its posting reversed and a credit note issued'),
  ('finance.client_invoice_pdf_recorded', 'finance', 'info', false, false, false, '{}',
   'The PDF of a client invoice was stored'),
  ('finance.client_invoice_sent', 'finance', 'info', false, false, false, '{}',
   'A client invoice was emailed to the client')
on conflict (action) do nothing;

-- ══════════════════════════════════════════════════════ the ledger postings

/*
 * An issued invoice becomes a receivable: Dr receivable.client gross,
 * Cr each line category's revenue net, Cr tax.vat_output VAT. Dated the
 * issue date in Nairobi (now, when that is today). Idempotent on the
 * invoice, so it can never post twice.
 */
create or replace function ledger.fn_post_fin_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.fin_invoice;
  v_name text;
  v_net bigint;
  v_vat bigint;
  v_entries jsonb;
begin
  select * into v_inv from public.fin_invoice where id = p_invoice_id;
  if v_inv.id is null then
    raise exception 'No such invoice.' using errcode = 'P0002';
  end if;
  if v_inv.number is null then
    raise exception 'Only an issued invoice is posted.' using errcode = '23514';
  end if;
  if v_inv.gross_cents <= 0 then
    raise exception 'Nothing to post: that invoice totals zero.' using errcode = '22023';
  end if;

  select coalesce(sum(l.net_cents), 0), coalesce(sum(l.vat_cents), 0) into v_net, v_vat
    from public.fin_invoice_line l where l.invoice_id = p_invoice_id;
  if v_net <> v_inv.net_cents or v_vat <> v_inv.vat_cents then
    raise exception 'Invoice % does not add up to its lines.', v_inv.number using errcode = '23514';
  end if;

  v_name := coalesce(v_inv.bill_to ->> 'legal_name',
                     (select c.legal_name from public.fin_client c where c.id = v_inv.client_id));

  select jsonb_agg(x.entry order by x.ord, x.account)
    into v_entries
    from (
      select 0 as ord, 'receivable.client'::text as account,
             jsonb_build_object('account', 'receivable.client', 'debit', v_inv.gross_cents,
                                'memo', v_inv.number || ' · ' || coalesce(v_name, 'client')) as entry
      union all
      select 1, l.revenue_account,
             jsonb_build_object('account', l.revenue_account, 'credit', sum(l.net_cents)::bigint,
                                'memo', v_inv.number)
        from public.fin_invoice_line l
       where l.invoice_id = p_invoice_id
       group by l.revenue_account
      union all
      select 2, 'tax.vat_output',
             jsonb_build_object('account', 'tax.vat_output', 'credit', v_inv.vat_cents,
                                'memo', 'VAT on ' || v_inv.number)
    ) x;

  return ledger.post(
    p_kind => 'client_invoice_issued',
    p_idempotency_key => 'fin_invoice:' || p_invoice_id::text,
    p_entries => v_entries,
    p_effective_at => case
      when v_inv.issue_date >= (now() at time zone 'Africa/Nairobi')::date then now()
      else (v_inv.issue_date::timestamp + time '12:00') at time zone 'Africa/Nairobi' end,
    p_actor_kind => 'staff',
    p_actor_id => coalesce(v_inv.issued_by, authz.staff_id()),
    p_reason_code => 'client_invoice',
    p_related => jsonb_build_object('fin_invoice_id', v_inv.id, 'number', v_inv.number,
                                    'client_id', v_inv.client_id));
end;
$$;

comment on function ledger.fn_post_fin_invoice(uuid) is
  'Posts an issued client invoice: Dr receivable.client / Cr revenue per line / Cr tax.vat_output. Internal: rpc_fin_invoice_issue calls it after checking full Finance.';

/* Money received clears the receivable: Dr the cash account / Cr receivable.client. */
create or replace function ledger.fn_post_fin_invoice_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.fin_invoice_payment;
  v_number text;
begin
  select * into v_pay from public.fin_invoice_payment where id = p_payment_id;
  if v_pay.id is null then
    raise exception 'No such payment.' using errcode = 'P0002';
  end if;
  select i.number into v_number from public.fin_invoice i where i.id = v_pay.invoice_id;

  return ledger.post(
    p_kind => 'client_invoice_paid',
    p_idempotency_key => 'fin_invoice_payment:' || p_payment_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', v_pay.cash_account, 'debit', v_pay.amount_cents,
                         'memo', v_pay.reference),
      jsonb_build_object('account', 'receivable.client', 'credit', v_pay.amount_cents,
                         'memo', 'Paid · ' || coalesce(v_number, ''))),
    p_effective_at => case
      when v_pay.paid_on >= (now() at time zone 'Africa/Nairobi')::date then now()
      else (v_pay.paid_on::timestamp + time '12:00') at time zone 'Africa/Nairobi' end,
    p_actor_kind => 'staff',
    p_actor_id => coalesce(v_pay.recorded_by, authz.staff_id()),
    p_reason_code => 'client_invoice_payment',
    p_related => jsonb_build_object('fin_invoice_id', v_pay.invoice_id, 'number', v_number,
                                    'payment_id', v_pay.id, 'reference', v_pay.reference));
end;
$$;

comment on function ledger.fn_post_fin_invoice_payment(uuid) is
  'Posts a payment against a client invoice: Dr cash.bank or cash.mpesa_paybill / Cr receivable.client. Internal: rpc_fin_invoice_record_payment calls it after checking full Finance.';

revoke execute on function ledger.fn_post_fin_invoice(uuid), ledger.fn_post_fin_invoice_payment(uuid)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ clients

/* Adds a client (p_id null) or changes one. */
create or replace function public.rpc_fin_client_save(p_id uuid default null, p_client jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_client;
  v_new public.fin_client;
  v_kind text;
  v_legal text;
  v_trading text;
  v_pin text;
  v_email text;
  v_cc text[];
  v_phone text;
  v_address text;
  v_terms integer;
  v_active boolean;
  v_host uuid;
  v_hotel uuid;
  v_merchant uuid;
  v_partner uuid;
  v_bad text;
begin
  if p_client is null or jsonb_typeof(p_client) <> 'object' then
    raise exception 'Send the client''s details.' using errcode = '22023';
  end if;

  v_kind := coalesce(nullif(btrim(p_client ->> 'kind'), ''), 'corporate');
  v_legal := btrim(coalesce(p_client ->> 'legal_name', ''));
  v_trading := nullif(btrim(coalesce(p_client ->> 'trading_name', '')), '');
  v_pin := nullif(upper(regexp_replace(coalesce(p_client ->> 'kra_pin', ''), '\s', '', 'g')), '');
  v_email := nullif(lower(btrim(coalesce(p_client ->> 'email', ''))), '');
  v_phone := nullif(btrim(coalesce(p_client ->> 'phone', '')), '');
  v_address := nullif(btrim(coalesce(p_client ->> 'address', '')), '');

  if v_kind not in ('corporate', 'partner') then
    raise exception 'Choose whether the client is a corporate client or a partner.'
      using errcode = '22023';
  end if;
  if length(v_legal) < 2 or length(v_legal) > 200 then
    raise exception 'Enter the client''s legal name.' using errcode = '22023';
  end if;
  if v_trading is not null and length(v_trading) > 200 then
    raise exception 'Keep the trading name under 200 characters.' using errcode = '22023';
  end if;
  if v_pin is not null and v_pin !~ '^[AP][0-9]{9}[A-Z]$' then
    raise exception 'A KRA PIN is a letter, nine digits and a letter, like P051234567X.'
      using errcode = '22023';
  end if;
  if v_email is not null and (length(v_email) > 254
      or v_email !~* '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'Enter a valid email address for invoices.' using errcode = '22023';
  end if;

  /* Copies: a list, or one string separated by commas. */
  select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x) <> ''), '{}')
    into v_cc
    from unnest(case jsonb_typeof(p_client -> 'cc_emails')
                  when 'array' then array(select jsonb_array_elements_text(p_client -> 'cc_emails'))
                  when 'string' then regexp_split_to_array(p_client ->> 'cc_emails', '[,;[:space:]]+')
                  else '{}'::text[] end) as x;
  if cardinality(v_cc) > 5 then
    raise exception 'Copy the invoice to five addresses at most.' using errcode = '22023';
  end if;
  select x into v_bad from unnest(v_cc) as x
   where length(x) > 254 or x !~* '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
   limit 1;
  if v_bad is not null then
    raise exception '% is not a valid email address.', v_bad using errcode = '22023';
  end if;

  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{6,24}$' then
    raise exception 'Enter the phone number with digits only, like +254 712 345 678.'
      using errcode = '22023';
  end if;
  if v_address is not null and length(v_address) > 300 then
    raise exception 'Keep the address under 300 characters.' using errcode = '22023';
  end if;

  begin
    v_terms := coalesce(nullif(p_client ->> 'payment_terms_days', '')::integer, 14);
    v_active := coalesce((p_client ->> 'active')::boolean, true);
    v_host := nullif(p_client ->> 'host_id', '')::uuid;
    v_hotel := nullif(p_client ->> 'hotel_id', '')::uuid;
    v_merchant := nullif(p_client ->> 'merchant_id', '')::uuid;
    v_partner := nullif(p_client ->> 'experience_partner_id', '')::uuid;
  exception when others then
    raise exception 'Some of the client''s details are not in the right form.' using errcode = '22023';
  end;
  if v_terms < 0 or v_terms > 365 then
    raise exception 'Payment terms are between 0 and 365 days.' using errcode = '22023';
  end if;
  if num_nonnulls(v_host, v_hotel, v_merchant, v_partner) > 1 then
    raise exception 'Link the client to one partner record at most.' using errcode = '22023';
  end if;
  if v_kind <> 'partner' and num_nonnulls(v_host, v_hotel, v_merchant, v_partner) > 0 then
    raise exception 'Only a partner is linked to a host, hotel, merchant or experience partner.'
      using errcode = '22023';
  end if;
  if (v_host is not null and not exists (select 1 from public.host h where h.id = v_host))
     or (v_hotel is not null and not exists (select 1 from public.hotel h where h.id = v_hotel))
     or (v_merchant is not null and not exists (select 1 from public.merchant m where m.id = v_merchant))
     or (v_partner is not null and not exists (select 1 from public.experience_partner e
                                                where e.id = v_partner)) then
    raise exception 'That partner is not on file.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.fin_client (
      kind, host_id, hotel_id, merchant_id, experience_partner_id, legal_name, trading_name,
      kra_pin, email, cc_emails, phone, address, payment_terms_days, active, created_by)
    values (
      v_kind, v_host, v_hotel, v_merchant, v_partner, v_legal, v_trading,
      v_pin, v_email, v_cc, v_phone, v_address, v_terms, v_active, v_staff)
    returning * into v_new;
  else
    select * into v_old from public.fin_client where id = p_id for update;
    if v_old.id is null then
      raise exception 'That client is no longer on file.' using errcode = 'P0002';
    end if;
    update public.fin_client
       set kind = v_kind,
           host_id = v_host,
           hotel_id = v_hotel,
           merchant_id = v_merchant,
           experience_partner_id = v_partner,
           legal_name = v_legal,
           trading_name = v_trading,
           kra_pin = v_pin,
           email = v_email,
           cc_emails = v_cc,
           phone = v_phone,
           address = v_address,
           payment_terms_days = v_terms,
           active = v_active,
           updated_at = now()
     where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.client_saved',
    p_actor_id => v_staff,
    p_target_type => 'fin_client', p_target_id => v_new.id,
    p_target_label => coalesce(v_new.trading_name, v_new.legal_name),
    /* Contact details never enter the audit trail in clear: the log keeps
       masked forms, so the action needs no pii_fields (test 16 treats any
       pii_fields as a reveal that must be queued for review). */
    p_before => case when v_old.id is null then null
                     else to_jsonb(v_old) - 'email' - 'cc_emails' - 'phone'
                          || jsonb_build_object(
                               'email', regexp_replace(v_old.email, '^(.).*(@.*)$', '\1•••\2'),
                               'cc_count', coalesce(cardinality(v_old.cc_emails), 0),
                               'phone', case when v_old.phone is null then null
                                             else '•••' || right(v_old.phone, 3) end)
                end,
    p_after => to_jsonb(v_new) - 'email' - 'cc_emails' - 'phone'
               || jsonb_build_object(
                    'email', regexp_replace(v_new.email, '^(.).*(@.*)$', '\1•••\2'),
                    'cc_count', coalesce(cardinality(v_new.cc_emails), 0),
                    'phone', case when v_new.phone is null then null
                                  else '•••' || right(v_new.phone, 3) end));

  return v_new.id;
end;
$$;

/* Clients for the invoice form, with what each still owes, and the VAT rate. */
create or replace function public.rpc_fin_clients()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.finance_reads() then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'vat_pct', round(coalesce(settings.fn_num('tax.vat_pct', null), 16), 2),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'kind', c.kind,
               'legal_name', c.legal_name,
               'trading_name', c.trading_name,
               'kra_pin', c.kra_pin,
               'email', c.email,
               'cc_emails', to_jsonb(c.cc_emails),
               'phone', c.phone,
               'address', c.address,
               'payment_terms_days', c.payment_terms_days,
               'active', c.active,
               'host_id', c.host_id,
               'hotel_id', c.hotel_id,
               'merchant_id', c.merchant_id,
               'experience_partner_id', c.experience_partner_id,
               'linked_name', coalesce(h.display_name, ht.name, m.trading_name, ep.name),
               'invoices', s.issued,
               'open_cents', s.open_cents)
             order by c.active desc, lower(coalesce(c.trading_name, c.legal_name)))
        from public.fin_client c
        left join public.host h on h.id = c.host_id
        left join public.hotel ht on ht.id = c.hotel_id
        left join public.merchant m on m.id = c.merchant_id
        left join public.experience_partner ep on ep.id = c.experience_partner_id
        left join lateral (
          select count(*) filter (where i.status <> 'draft')::integer as issued,
                 coalesce(sum(i.gross_cents - coalesce(p.paid, 0))
                            filter (where i.status = 'issued'), 0)::bigint as open_cents
            from public.fin_invoice i
            left join lateral (
              select sum(fp.amount_cents) as paid
                from public.fin_invoice_payment fp where fp.invoice_id = i.id) p on true
           where i.client_id = c.id) s on true), '[]'::jsonb));
end;
$$;

-- ═══════════════════════════════════════════════════════════════ drafts

/*
 * Saves a draft: the header, and its lines replaced. Amounts are worked out
 * here from quantity, unit price (excluding VAT) and VAT treatment; anything
 * else the browser sends is ignored. A new draft carries the form's
 * p_client_ref, so pressing Save twice makes one draft.
 */
create or replace function public.rpc_fin_invoice_save(
  p_id uuid default null,
  p_client_ref uuid default null,
  p_invoice jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_pct numeric := round(coalesce(settings.fn_num('tax.vat_pct', null), 16), 2);
  v_id uuid := p_id;
  v_old public.fin_invoice;
  v_new public.fin_invoice;
  v_client public.fin_client;
  v_client_id uuid;
  v_issue date;
  v_due date;
  v_notes text;
  v_lines jsonb;
  v_line jsonb;
  v_n integer := 0;
  v_desc text;
  v_qty numeric;
  v_unit bigint;
  v_rate text;
  v_account text;
  v_net bigint;
  v_vat bigint;
  v_rows jsonb := '[]'::jsonb;
  v_net_total bigint := 0;
  v_vat_total bigint := 0;
  v_old_lines integer := 0;
begin
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception 'Send the invoice''s details.' using errcode = '22023';
  end if;

  begin
    v_client_id := nullif(p_invoice ->> 'client_id', '')::uuid;
    v_issue := coalesce(nullif(p_invoice ->> 'issue_date', '')::date, v_today);
    v_due := nullif(p_invoice ->> 'due_date', '')::date;
  exception when others then
    raise exception 'Enter the client and the dates in the right form.' using errcode = '22023';
  end;

  if v_client_id is null then
    raise exception 'Choose the client.' using errcode = '22023';
  end if;
  select * into v_client from public.fin_client where id = v_client_id;
  if v_client.id is null then
    raise exception 'That client is not on file.' using errcode = 'P0002';
  end if;
  if not v_client.active then
    raise exception 'That client is archived. Choose another, or restore it first.'
      using errcode = '23514';
  end if;

  if v_issue < v_today - 366 or v_issue > v_today + 366 then
    raise exception 'Enter an issue date within a year of today.' using errcode = '22023';
  end if;
  v_due := coalesce(v_due, v_issue + v_client.payment_terms_days);
  if v_due < v_issue then
    raise exception 'The due date is on or after the issue date.' using errcode = '22023';
  end if;
  if v_due > v_issue + 366 then
    raise exception 'Choose a due date within a year of the issue date.' using errcode = '22023';
  end if;

  v_notes := nullif(btrim(coalesce(p_invoice ->> 'notes', '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'Keep the notes under 2,000 characters.' using errcode = '22023';
  end if;

  v_lines := coalesce(p_invoice -> 'lines', '[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'Send the lines as a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_lines) > 100 then
    raise exception 'An invoice has 100 lines at most.' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Line %: send it as an object.', v_n using errcode = '22023';
    end if;
    v_desc := btrim(coalesce(v_line ->> 'description', ''));
    v_rate := coalesce(v_line ->> 'vat_rate', '');
    v_account := coalesce(v_line ->> 'revenue_account', '');
    begin
      v_qty := (v_line ->> 'quantity')::numeric;
      v_unit := (v_line ->> 'unit_price_cents')::bigint;
    exception when others then
      raise exception 'Line %: enter the quantity and the unit price as numbers.', v_n
        using errcode = '22023';
    end;

    if length(v_desc) < 2 or length(v_desc) > 300 then
      raise exception 'Line %: say what it is for.', v_n using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 999999999.999 then
      raise exception 'Line %: enter a quantity above zero.', v_n using errcode = '22023';
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'Line %: use at most three decimal places for the quantity.', v_n
        using errcode = '22023';
    end if;
    if v_unit is null or v_unit < 0 or v_unit > 100000000000 then
      raise exception 'Line %: enter a unit price of zero or more.', v_n using errcode = '22023';
    end if;
    if v_qty * v_unit > 10000000000000 then
      raise exception 'Line %: that line is too large for one invoice.', v_n using errcode = '22023';
    end if;
    if v_rate not in ('standard', 'zero', 'exempt') then
      raise exception 'Line %: choose 16%%, 0%% or Exempt for VAT.', v_n using errcode = '22023';
    end if;
    if v_account not in ('revenue.commission', 'revenue.service_fee', 'revenue.delivery_fee',
                         'revenue.concierge_fee', 'revenue.featured', 'revenue.packages',
                         'revenue.other_services') then
      raise exception 'Line %: choose what the line is for.', v_n using errcode = '22023';
    end if;

    v_net := round(v_qty * v_unit)::bigint;
    v_vat := case when v_rate = 'standard' then round(v_net * v_pct / 100)::bigint else 0 end;
    v_net_total := v_net_total + v_net;
    v_vat_total := v_vat_total + v_vat;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'sort', v_n, 'description', v_desc, 'quantity', v_qty, 'unit_price_cents', v_unit,
      'vat_rate', v_rate, 'vat_pct', case when v_rate = 'standard' then v_pct else 0 end,
      'net_cents', v_net, 'vat_cents', v_vat, 'gross_cents', v_net + v_vat,
      'revenue_account', v_account));
  end loop;

  if v_id is null then
    if p_client_ref is null then
      raise exception 'The form reference is missing. Close the form and open it again.'
        using errcode = '22023';
    end if;
    select * into v_old from public.fin_invoice where client_ref = p_client_ref for update;
    if v_old.id is not null then
      /* The same form, saved again. Once it has gone past draft (saved and
         issued from one press, say), a repeat leaves it as it is. */
      if v_old.status <> 'draft' then
        return v_old.id;
      end if;
      v_id := v_old.id;
    end if;
  else
    select * into v_old from public.fin_invoice where id = v_id for update;
    if v_old.id is null then
      raise exception 'That invoice no longer exists.' using errcode = 'P0002';
    end if;
    if v_old.status <> 'draft' then
      raise exception 'Only a draft can be changed. An issued invoice is corrected by voiding it and issuing a new one.'
        using errcode = '23514';
    end if;
  end if;

  if v_id is null then
    insert into public.fin_invoice (
      client_id, issue_date, due_date, notes, client_ref,
      net_cents, vat_cents, gross_cents, created_by)
    values (
      v_client_id, v_issue, v_due, v_notes, p_client_ref,
      v_net_total, v_vat_total, v_net_total + v_vat_total, v_staff)
    on conflict (client_ref) do nothing
    returning * into v_new;
    if v_new.id is null then
      /* Saved a moment ago by the same form, in another request. */
      select i.id into v_id from public.fin_invoice i where i.client_ref = p_client_ref;
      return v_id;
    end if;
    v_id := v_new.id;
  else
    select count(*)::integer into v_old_lines from public.fin_invoice_line where invoice_id = v_id;
    delete from public.fin_invoice_line where invoice_id = v_id;
    update public.fin_invoice
       set client_id = v_client_id,
           issue_date = v_issue,
           due_date = v_due,
           notes = v_notes,
           net_cents = v_net_total,
           vat_cents = v_vat_total,
           gross_cents = v_net_total + v_vat_total,
           updated_at = now()
     where id = v_id
    returning * into v_new;
  end if;

  insert into public.fin_invoice_line (
    invoice_id, sort, description, quantity, unit_price_cents, vat_rate, vat_pct,
    net_cents, vat_cents, gross_cents, revenue_account)
  select v_id, r.sort, r.description, r.quantity, r.unit_price_cents, r.vat_rate, r.vat_pct,
         r.net_cents, r.vat_cents, r.gross_cents, r.revenue_account
    from jsonb_to_recordset(v_rows) as r(
      sort integer, description text, quantity numeric, unit_price_cents bigint, vat_rate text,
      vat_pct numeric, net_cents bigint, vat_cents bigint, gross_cents bigint,
      revenue_account text);

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.client_invoice_saved',
    p_actor_id => v_staff,
    p_target_type => 'fin_invoice', p_target_id => v_id,
    p_target_label => 'Draft · ' || coalesce(v_client.trading_name, v_client.legal_name),
    p_before => case when v_old.id is null then null
                     else jsonb_build_object('client_id', v_old.client_id,
                       'issue_date', v_old.issue_date, 'due_date', v_old.due_date,
                       'lines', v_old_lines, 'net_cents', v_old.net_cents,
                       'vat_cents', v_old.vat_cents, 'gross_cents', v_old.gross_cents) end,
    p_after => jsonb_build_object('client_id', v_new.client_id,
      'issue_date', v_new.issue_date, 'due_date', v_new.due_date, 'lines', v_n,
      'net_cents', v_new.net_cents, 'vat_cents', v_new.vat_cents,
      'gross_cents', v_new.gross_cents));

  return v_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════ issue

/*
 * Issues a draft: the next number in the KRA series, a tax invoice for KRA
 * (pending until its reference is recorded), the client's details frozen as
 * printed, and the posting. Once issued it never changes.
 */
create or replace function public.rpc_fin_invoice_issue(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_pct numeric := round(coalesce(settings.fn_num('tax.vat_pct', null), 16), 2);
  v_inv public.fin_invoice;
  v_client public.fin_client;
  v_lines integer;
  v_net bigint;
  v_vat bigint;
  v_stale integer;
  v_standard integer;
  v_at timestamptz;
  v_number text;
  v_tax uuid;
  v_txn uuid;
begin
  select * into v_inv from public.fin_invoice where id = p_id for update;
  if v_inv.id is null then
    raise exception 'That invoice no longer exists.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'This invoice has already been issued, as %.', v_inv.number
      using errcode = '23514';
  end if;

  select count(*)::integer, coalesce(sum(net_cents), 0), coalesce(sum(vat_cents), 0),
         (count(*) filter (where vat_rate = 'standard' and vat_pct <> v_pct))::integer,
         (count(*) filter (where vat_rate = 'standard'))::integer
    into v_lines, v_net, v_vat, v_stale, v_standard
    from public.fin_invoice_line where invoice_id = p_id;

  if v_lines = 0 then
    raise exception 'Add at least one line before issuing.' using errcode = '23514';
  end if;
  if v_net <> v_inv.net_cents or v_vat <> v_inv.vat_cents then
    raise exception 'The totals do not match the lines. Open the draft and save it again.'
      using errcode = '23514';
  end if;
  if v_stale > 0 then
    raise exception 'The VAT rate is now %. Open the draft and save it again so its VAT is worked out at that rate.',
      trim_scale(v_pct)::text || '%' using errcode = '23514';
  end if;
  if v_inv.gross_cents <= 0 then
    raise exception 'Nothing to invoice: the total is zero.' using errcode = '22023';
  end if;
  if v_inv.issue_date > v_today then
    raise exception 'This invoice is dated %. Issue it on that day, or change its issue date.',
      to_char(v_inv.issue_date, 'FMDD Mon YYYY') using errcode = '22023';
  end if;
  if v_inv.issue_date < v_today - 31 then
    raise exception 'An invoice can be dated at most 31 days back. Change its issue date.'
      using errcode = '22023';
  end if;

  select * into v_client from public.fin_client where id = v_inv.client_id;
  if not v_client.active then
    raise exception 'That client is archived. Restore it before invoicing it.' using errcode = '23514';
  end if;

  v_at := case when v_inv.issue_date = v_today then now()
               else (v_inv.issue_date::timestamp + time '12:00') at time zone 'Africa/Nairobi' end;
  v_number := public.fn_tax_next_number(v_at);

  insert into public.tax_invoice (
    number, kind, purpose, order_id, city_id, party_type, party_id, party_name, party_pin,
    issued_at, currency, net_cents, vat_cents, gross_cents, vat_pct, kra_status)
  values (
    v_number, 'tax_invoice', 'client_invoice', null, null, 'client', v_client.id,
    v_client.legal_name, v_client.kra_pin, v_at, 'KES', v_inv.net_cents, v_inv.vat_cents,
    v_inv.gross_cents, case when v_standard > 0 then v_pct else 0 end, 'pending')
  returning id into v_tax;

  insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
  select v_tax, l.sort,
         l.description || case l.vat_rate
           when 'standard' then ' · VAT ' || trim_scale(l.vat_pct)::text || '%'
           when 'zero' then ' · zero-rated'
           else ' · exempt' end,
         l.net_cents, l.vat_cents, l.gross_cents
    from public.fin_invoice_line l
   where l.invoice_id = p_id
   order by l.sort;

  update public.fin_invoice
     set status = 'issued',
         number = v_number,
         bill_to = jsonb_build_object(
           'kind', v_client.kind,
           'legal_name', v_client.legal_name,
           'trading_name', v_client.trading_name,
           'kra_pin', v_client.kra_pin,
           'email', v_client.email,
           'cc_emails', to_jsonb(v_client.cc_emails),
           'phone', v_client.phone,
           'address', v_client.address),
         tax_invoice_id = v_tax,
         issued_by = v_staff,
         issued_at = now(),
         updated_at = now()
   where id = p_id;

  v_txn := ledger.fn_post_fin_invoice(p_id);

  update public.fin_invoice set issue_txn_id = v_txn where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.client_invoice_issued',
    p_actor_id => v_staff,
    p_target_type => 'fin_invoice', p_target_id => p_id,
    p_target_label => v_number || ' · ' || coalesce(v_client.trading_name, v_client.legal_name),
    p_before => jsonb_build_object('status', 'draft'),
    p_after => jsonb_build_object('status', 'issued', 'number', v_number,
      'issue_date', v_inv.issue_date, 'due_date', v_inv.due_date,
      'net_cents', v_inv.net_cents, 'vat_cents', v_inv.vat_cents,
      'gross_cents', v_inv.gross_cents, 'tax_invoice_id', v_tax, 'transaction_id', v_txn),
    p_related => jsonb_build_object('ledger_transaction', v_txn, 'tax_invoice', v_tax));

  return jsonb_build_object('id', p_id, 'number', v_number, 'tax_invoice_id', v_tax,
                            'transaction_id', v_txn);
end;
$$;

-- ══════════════════════════════════════════════════════════════ payments

/*
 * Records money received against an issued invoice, in part or in full,
 * never more than is still owed, and posts it. Paid in full, the invoice is
 * paid.
 */
create or replace function public.rpc_fin_invoice_record_payment(
  p_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_reference text,
  p_paid_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_paid_on date := coalesce(p_paid_on, v_today);
  v_ref text := upper(btrim(coalesce(p_reference, '')));
  v_inv public.fin_invoice;
  v_paid bigint;
  v_owed bigint;
  v_other text;
  v_pay public.fin_invoice_payment;
  v_txn uuid;
  v_status text := 'issued';
begin
  if p_method is null or p_method not in ('bank', 'mpesa') then
    raise exception 'Choose how it was paid: bank transfer or M-PESA.' using errcode = '22023';
  end if;
  if length(v_ref) < 3 or length(v_ref) > 80 then
    raise exception 'Enter the bank or M-PESA reference.' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Enter an amount above zero.' using errcode = '22023';
  end if;
  if v_paid_on > v_today then
    raise exception 'Enter the day it was paid, today or earlier.' using errcode = '22023';
  end if;

  select * into v_inv from public.fin_invoice where id = p_id for update;
  if v_inv.id is null then
    raise exception 'That invoice no longer exists.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Issue the invoice before recording a payment against it.' using errcode = '23514';
  end if;
  if v_inv.status = 'paid' then
    raise exception 'This invoice is already paid in full.' using errcode = '23514';
  end if;
  if v_inv.status = 'void' then
    raise exception 'This invoice is void, so it takes no payments.' using errcode = '23514';
  end if;
  if v_paid_on < v_inv.issue_date - 366 then
    raise exception 'Enter the day it was paid.' using errcode = '22023';
  end if;

  select coalesce(i.number, 'a draft') into v_other
    from public.fin_invoice_payment p
    join public.fin_invoice i on i.id = p.invoice_id
   where p.reference = v_ref;
  if found then
    raise exception 'Reference % is already recorded, against %.', v_ref, v_other
      using errcode = '23514';
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid
    from public.fin_invoice_payment where invoice_id = p_id;
  v_owed := v_inv.gross_cents - v_paid;
  if p_amount_cents > v_owed then
    raise exception 'That is more than the KES % still owed on this invoice.',
      to_char(v_owed / 100.0, 'FM999,999,999,990.00') using errcode = '23514';
  end if;

  insert into public.fin_invoice_payment (
    invoice_id, amount_cents, method, reference, paid_on, cash_account, recorded_by)
  values (
    p_id, p_amount_cents, p_method, v_ref, v_paid_on,
    case p_method when 'bank' then 'cash.bank' else 'cash.mpesa_paybill' end, v_staff)
  returning * into v_pay;

  v_txn := ledger.fn_post_fin_invoice_payment(v_pay.id);
  update public.fin_invoice_payment set txn_id = v_txn where id = v_pay.id;

  if p_amount_cents = v_owed then
    v_status := 'paid';
    update public.fin_invoice
       set status = 'paid',
           paid_at = case when v_paid_on = v_today then now()
                          else (v_paid_on::timestamp + time '12:00') at time zone 'Africa/Nairobi' end,
           updated_at = now()
     where id = p_id;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => 'finance.client_invoice_payment_recorded',
    p_actor_id => v_staff,
    p_target_type => 'fin_invoice', p_target_id => p_id,
    p_target_label => v_inv.number,
    p_before => jsonb_build_object('status', v_inv.status, 'paid_cents', v_paid),
    p_after => jsonb_build_object('status', v_status, 'paid_cents', v_paid + p_amount_cents,
      'amount_cents', p_amount_cents, 'method', p_method, 'reference', v_ref,
      'paid_on', v_paid_on, 'transaction_id', v_txn),
    p_related => jsonb_build_object('payment', v_pay.id, 'ledger_transaction', v_txn));

  return jsonb_build_object('payment_id', v_pay.id, 'status', v_status,
                            'balance_cents', v_owed - p_amount_cents, 'transaction_id', v_txn);
end;
$$;

-- ══════════════════════════════════════════════════════════════════ void

/*
 * Voids an issued invoice nothing has been paid against: its posting is
 * reversed and a credit note for the whole amount is filed for KRA. Logged
 * for review.
 */
create or replace function public.rpc_fin_invoice_void(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_inv public.fin_invoice;
  v_tax public.tax_invoice;
  v_rev uuid;
  v_number text;
  v_cn uuid;
begin
  if v_reason = '' then
    raise exception 'Say why the invoice is voided.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
  end if;

  select * into v_inv from public.fin_invoice where id = p_id for update;
  if v_inv.id is null then
    raise exception 'That invoice no longer exists.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'A draft was never issued, so there is nothing to void. Change it instead.'
      using errcode = '23514';
  end if;
  if v_inv.status = 'void' then
    raise exception 'This invoice is already void.' using errcode = '23514';
  end if;
  if v_inv.status = 'paid'
     or exists (select 1 from public.fin_invoice_payment p where p.invoice_id = p_id) then
    raise exception 'Payments are recorded against this invoice, so it cannot be voided.'
      using errcode = '23514';
  end if;
  if v_inv.issue_txn_id is null then
    raise exception 'This invoice has no posting to reverse.' using errcode = '23514';
  end if;

  v_rev := ledger.reverse(v_inv.issue_txn_id, 'client_invoice_void', v_reason,
                          'staff'::public.actor_type, v_staff);

  select * into v_tax from public.tax_invoice where id = v_inv.tax_invoice_id;
  /* The KRA series is shared by invoices and credit notes, so the counter
     stays gapless; a credit note reads NX-CRN-. */
  v_number := 'NX-CRN-' || substr(public.fn_tax_next_number(now()), 8);

  insert into public.tax_invoice (
    number, kind, purpose, order_id, city_id, party_type, party_id, party_name, party_pin,
    issued_at, currency, net_cents, vat_cents, gross_cents, vat_pct, kra_status)
  values (
    v_number, 'credit_note', 'client_invoice', null, null, 'client', v_tax.party_id,
    v_tax.party_name, v_tax.party_pin, now(), 'KES', v_tax.net_cents, v_tax.vat_cents,
    v_tax.gross_cents, v_tax.vat_pct, 'pending')
  returning id into v_cn;

  insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
  select v_cn, l.position, l.description, l.net_cents, l.vat_cents, l.gross_cents
    from public.tax_invoice_line l
   where l.invoice_id = v_tax.id
   order by l.position;

  update public.fin_invoice
     set status = 'void',
         void_txn_id = v_rev,
         credit_note_id = v_cn,
         voided_by = v_staff,
         voided_at = now(),
         void_reason = v_reason,
         updated_at = now()
   where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.client_invoice_voided',
    p_actor_id => v_staff,
    p_target_type => 'fin_invoice', p_target_id => p_id,
    p_target_label => v_inv.number,
    p_before => jsonb_build_object('status', v_inv.status, 'gross_cents', v_inv.gross_cents),
    p_after => jsonb_build_object('status', 'void', 'credit_note', v_number,
      'reversal_transaction_id', v_rev),
    p_reason => v_reason,
    p_related => jsonb_build_object('ledger_transaction', v_rev, 'credit_note', v_cn));

  return jsonb_build_object('id', p_id, 'credit_note_id', v_cn, 'credit_note_number', v_number,
                            'reversal_transaction_id', v_rev);
end;
$$;

-- ═══════════════════════════════════════════════════════ the PDF, and sending

/* Records the invoice's PDF once it is in the finance-invoices bucket. */
create or replace function public.rpc_fin_invoice_pdf_record(
  p_id uuid,
  p_path text,
  p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_invoice;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The PDF''s fingerprint is not a SHA-256.' using errcode = '22023';
  end if;
  select * into v_old from public.fin_invoice where id = p_id for update;
  if v_old.id is null then
    raise exception 'That invoice no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.number is null then
    raise exception 'Only an issued invoice has a PDF.' using errcode = '23514';
  end if;
  if p_path is null
     or p_path !~ ('^[0-9a-f-]{36}/' || p_id::text || '/' || v_old.number || '\.pdf$') then
    raise exception 'That is not where this invoice''s PDF is kept.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'finance-invoices' and o.name = p_path) then
    raise exception 'The PDF did not arrive. Try again.' using errcode = 'P0002';
  end if;

  update public.fin_invoice
     set pdf_path = p_path, pdf_sha256 = p_sha256, updated_at = now()
   where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => 'finance.client_invoice_pdf_recorded',
    p_actor_id => v_staff,
    p_target_type => 'fin_invoice', p_target_id => p_id,
    p_target_label => v_old.number,
    p_before => case when v_old.pdf_path is null then null
                     else jsonb_build_object('pdf_path', v_old.pdf_path,
                                             'pdf_sha256', v_old.pdf_sha256) end,
    p_after => jsonb_build_object('pdf_path', p_path, 'pdf_sha256', p_sha256));
end;
$$;

/* Records that an issued invoice was emailed, and to whom. */
create or replace function public.rpc_fin_invoice_mark_sent(p_id uuid, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_to text := btrim(coalesce(p_to, ''));
  v_old public.fin_invoice;
begin
  if v_to = '' or length(v_to) > 1500 then
    raise exception 'Say who it was sent to.' using errcode = '22023';
  end if;
  select * into v_old from public.fin_invoice where id = p_id for update;
  if v_old.id is null then
    raise exception 'That invoice no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status = 'draft' then
    raise exception 'Issue the invoice before sending it.' using errcode = '23514';
  end if;
  if v_old.status = 'void' then
    raise exception 'A void invoice is not sent.' using errcode = '23514';
  end if;

  update public.fin_invoice
     set sent_at = now(), sent_to = v_to, updated_at = now()
   where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.client_invoice_sent',
    p_actor_id => v_staff,
    p_target_type => 'fin_invoice', p_target_id => p_id,
    p_target_label => v_old.number,
    p_after => jsonb_build_object(
      'recipients', cardinality(string_to_array(v_to, ',')),
      'sent_to', regexp_replace(v_to, '(^|,\s*)([^@,\s])[^@,]*@', '\1\2•••@', 'g')));
end;
$$;

-- ═══════════════════════════════════════════════════════════════ reading

/* One invoice with its client, lines, payments, balance and tax documents. */
create or replace function public.rpc_fin_invoice_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not authz.finance_reads() then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'invoice', to_jsonb(i) || jsonb_build_object(
             'created_by_name', (select su.display_name from public.staff_user su where su.id = i.created_by),
             'issued_by_name', (select su.display_name from public.staff_user su where su.id = i.issued_by),
             'voided_by_name', (select su.display_name from public.staff_user su where su.id = i.voided_by)),
           'client', to_jsonb(c),
           'lines', coalesce((
             select jsonb_agg(to_jsonb(l) order by l.sort)
               from public.fin_invoice_line l where l.invoice_id = i.id), '[]'::jsonb),
           'payments', coalesce((
             select jsonb_agg(to_jsonb(p) || jsonb_build_object('recorded_by_name', su.display_name)
                              order by p.paid_on, p.recorded_at)
               from public.fin_invoice_payment p
               left join public.staff_user su on su.id = p.recorded_by
              where p.invoice_id = i.id), '[]'::jsonb),
           'paid_cents', paid.cents,
           'balance_cents', case when i.status in ('issued', 'paid')
                                 then i.gross_cents - paid.cents else 0 end,
           'tax_invoice', (
             select jsonb_build_object('id', t.id, 'number', t.number, 'kra_status', t.kra_status,
                                       'kra_reference', t.kra_reference, 'issued_at', t.issued_at)
               from public.tax_invoice t where t.id = i.tax_invoice_id),
           'credit_note', (
             select jsonb_build_object('id', t.id, 'number', t.number, 'kra_status', t.kra_status,
                                       'kra_reference', t.kra_reference, 'issued_at', t.issued_at)
               from public.tax_invoice t where t.id = i.credit_note_id))
    into v
    from public.fin_invoice i
    join public.fin_client c on c.id = i.client_id
    cross join lateral (
      select coalesce(sum(p.amount_cents), 0)::bigint as cents
        from public.fin_invoice_payment p where p.invoice_id = i.id) paid
   where i.id = p_id;

  if v is null then
    raise exception 'That invoice is not on file.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

/*
 * The current NexG letterhead for the invoice PDF: the address and contact
 * lines only, never the signature. Read from the merchant agreement
 * signer's newest version, which Finance cannot read directly. Null until
 * one is saved.
 */
create or replace function public.rpc_fin_letterhead()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.has_full_finance() then
    raise exception 'Only people with full Finance access can do this.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'registered_office', s.registered_office,
             'po_box', s.po_box,
             'phone', s.phone,
             'email', s.email,
             'website', s.website)
      from public.merchant_agreement_signer s
     order by s.created_at desc
     limit 1);
end;
$$;

/*
 * The invoice list, as before (host invoices, hotel statements, merchant
 * statements), with client invoices added: party_kind 'client', the number
 * ('Draft' until issued), status draft, sent (issued), paid or credited
 * (void), and balance_cents, what is still owed. The other kinds carry a
 * null balance_cents: theirs is the whole amount until paid.
 */
create or replace function public.rpc_finance_invoices(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lo timestamptz := p_from::timestamp at time zone 'Africa/Nairobi';
  v_hi timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  perform public.fn_finance_period_check(p_from, p_to);
  return coalesce((
    select jsonb_agg(to_jsonb(i) order by i.issued_at desc, i.id)
    from (
      select 'host'::text as party_kind, hi.id,
             'HI-' || to_char(hi.period, 'YYYYMM') || '-' || upper(left(hi.id::text, 4)) as number,
             hi.host_id as party_id, h.display_name as party_name,
             to_char(hi.period, 'Mon YYYY') as period,
             hi.total::bigint as total_cents, hi.status::text as status,
             hi.created_at as issued_at, hi.due_at, hi.paid_at, hi.provider_ref,
             null::bigint as balance_cents
      from public.host_invoice hi
      left join public.host h on h.id = hi.host_id
      union all
      select 'hotel', hs.id,
             'HS-' || to_char(hs.period, 'YYYYMM') || '-' || upper(left(hs.id::text, 4)),
             hs.hotel_id, ht.name, to_char(hs.period, 'Mon YYYY'),
             hs.net_invoiced::bigint, hs.status::text, hs.created_at, hs.due_at, hs.paid_at,
             hs.provider_ref, null::bigint
      from public.hotel_statement hs
      left join public.hotel ht on ht.id = hs.hotel_id
      union all
      select 'merchant', ms.id,
             'MS-' || to_char(ms.period_end, 'YYYYMMDD') || '-' || upper(left(ms.id::text, 4)),
             ms.merchant_id, m.trading_name,
             to_char(ms.period_start, 'DD Mon') || ' – ' || to_char(ms.period_end, 'DD Mon YYYY'),
             ms.net_kes::bigint * 100, ms.status::text, ms.created_at, null::date, ms.paid_at,
             ms.provider_ref, null::bigint
      from public.merchant_statement ms
      left join public.merchant m on m.id = ms.merchant_id
      union all
      select 'client', fi.id,
             coalesce(fi.number, 'Draft'),
             fi.client_id,
             coalesce(fi.bill_to ->> 'trading_name', fi.bill_to ->> 'legal_name',
                      fc.trading_name, fc.legal_name),
             coalesce((select left(l.description, 80) from public.fin_invoice_line l
                        where l.invoice_id = fi.id order by l.sort limit 1), 'No lines yet'),
             fi.gross_cents,
             case fi.status when 'issued' then 'sent' when 'void' then 'credited'
                            else fi.status end,
             (fi.issue_date::timestamp + time '12:00') at time zone 'Africa/Nairobi',
             fi.due_date, fi.paid_at,
             (select p.reference from public.fin_invoice_payment p
               where p.invoice_id = fi.id order by p.recorded_at desc limit 1),
             case when fi.status in ('issued', 'paid')
                  then fi.gross_cents - coalesce((select sum(p.amount_cents) from public.fin_invoice_payment p
                                                   where p.invoice_id = fi.id), 0)::bigint
                  else 0::bigint end
      from public.fin_invoice fi
      left join public.fin_client fc on fc.id = fi.client_id
    ) i
    where (i.issued_at >= v_lo and i.issued_at < v_hi)
       or (i.status not in ('paid', 'credited', 'draft') and i.due_at < v_today)), '[]'::jsonb);
end;
$$;

comment on function public.rpc_finance_invoices(date, date) is
  'Finance: host invoices, hotel statements, merchant statements and client invoices issued in a period or overdue, amounts in cents, as JSON. Reads only.';

-- ═══════════════════════════════════════════════════════════════ grants

revoke execute on function
  public.rpc_fin_client_save(uuid, jsonb),
  public.rpc_fin_clients(),
  public.rpc_fin_invoice_save(uuid, uuid, jsonb),
  public.rpc_fin_invoice_issue(uuid),
  public.rpc_fin_invoice_record_payment(uuid, bigint, text, text, date),
  public.rpc_fin_invoice_void(uuid, text),
  public.rpc_fin_invoice_pdf_record(uuid, text, text),
  public.rpc_fin_invoice_mark_sent(uuid, text),
  public.rpc_fin_invoice_detail(uuid),
  public.rpc_fin_letterhead(),
  public.rpc_finance_invoices(date, date)
  from public, anon;

grant execute on function
  public.rpc_fin_client_save(uuid, jsonb),
  public.rpc_fin_clients(),
  public.rpc_fin_invoice_save(uuid, uuid, jsonb),
  public.rpc_fin_invoice_issue(uuid),
  public.rpc_fin_invoice_record_payment(uuid, bigint, text, text, date),
  public.rpc_fin_invoice_void(uuid, text),
  public.rpc_fin_invoice_pdf_record(uuid, text, text),
  public.rpc_fin_invoice_mark_sent(uuid, text),
  public.rpc_fin_invoice_detail(uuid),
  public.rpc_fin_letterhead(),
  public.rpc_finance_invoices(date, date)
  to authenticated, service_role;

notify pgrst, 'reload schema';
