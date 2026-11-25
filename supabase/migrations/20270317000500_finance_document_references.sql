-- Branded finance documents: reference numbers, a register, and a public check.
--
-- Finance now prints four branded documents (tax invoice, payment receipt,
-- merchant settlement statement, monthly financial report). Each carries a
-- reference that is unique per type and sequential per year:
--
--   NEXG-INV-2026-00001   tax invoices and client invoices (the KRA series)
--   NEXG-RCT-2026-00001   payment receipts
--   NEXG-MST-2026-00001   settlement statements
--   NEXG-FR-2026-00001    monthly financial reports
--
-- 1. fin_document_counter + fin_document: the register. A document gets its
--    reference the first time it is printed and keeps it: printing the same
--    receipt again gives the same number (unique kind + subject). The counter
--    row is locked until the document commits, so the series is gapless.
-- 2. rpc_fin_document_issue: the admin's way in, for staff who reach Finance.
--    Amounts and names are read from the records here, not taken from the
--    caller.
-- 3. rpc_fin_document_verify: the public check behind nexgapp.com/verify. Anyone
--    with a reference learns only whether it is genuine, its type and date;
--    the check code printed on the document (in its QR code) also shows who
--    it was issued to and the amount.
-- 4. The KRA series reads NEXG-INV-YYYY-NNNNN from now on (it read
--    NX-INV-YYYY-NNNNNN). The counter carries on, so nothing repeats; numbers
--    already issued keep their old form. Credit notes read NEXG-CRN-.

-- ═══════════════════════════════════════════════════════════════ register

create table if not exists public.fin_document_counter (
  kind text not null check (kind in ('receipt', 'settlement', 'report')),
  year integer not null check (year between 2020 and 2200),
  last_number integer not null check (last_number > 0),
  primary key (kind, year)
);

alter table public.fin_document_counter enable row level security;

comment on table public.fin_document_counter is
  'The last reference number per document type and year. Written only by fn_fin_document_next_reference.';

create table if not exists public.fin_document (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('receipt', 'settlement', 'report')),
  reference text not null unique
    check (reference ~ '^NEXG-(RCT|MST|FR)-[0-9]{4}-[0-9]{5,}$'),
  /* What the document is about: 'payment:<uuid>', 'settlement_line:<uuid>', 'month:YYYY-MM'. */
  subject text not null check (subject ~ '^(payment|settlement_line|month):'),
  party_label text check (party_label is null or length(party_label) <= 300),
  amount_cents bigint,
  /* Printed on the document and in its QR code: unlocks the details on the verify page. */
  check_code text not null default left(replace(gen_random_uuid()::text, '-', ''), 12),
  issued_at timestamptz not null default now(),
  issued_by uuid references public.staff_user (id) on delete set null,
  constraint fin_document_one_per_subject unique (kind, subject)
);

alter table public.fin_document enable row level security;

drop policy if exists fin_document_read_finance on public.fin_document;
create policy fin_document_read_finance on public.fin_document
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('finance'));

revoke all on public.fin_document, public.fin_document_counter from anon;
grant select on public.fin_document to authenticated;

comment on table public.fin_document is
  'Every branded receipt, settlement statement and monthly report Finance has printed, with its reference. Written only by rpc_fin_document_issue.';

-- Gapless within a year: the counter row is locked until the document commits.
create or replace function public.fn_fin_document_next_reference(p_kind text, p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from p_at at time zone 'Africa/Nairobi')::integer;
  v_n integer;
  v_code text := case p_kind
                   when 'receipt' then 'RCT'
                   when 'settlement' then 'MST'
                   when 'report' then 'FR'
                 end;
begin
  if v_code is null then
    raise exception 'Unknown document type %.', p_kind using errcode = '22023';
  end if;
  insert into public.fin_document_counter as c (kind, year, last_number) values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_number = c.last_number + 1
  returning last_number into v_n;
  return 'NEXG-' || v_code || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
end;
$$;

revoke execute on function public.fn_fin_document_next_reference(text, timestamptz)
  from public, anon, authenticated;

/*
 * The reference for a document, given the first time it is printed. p_kind
 * is receipt (p_subject_id: a client invoice payment), settlement (a
 * settlement line) or report (p_month, the month's first day). Returns
 * reference, check_code and issued_at, the same on every later call, and for
 * a settlement the number of orders its line pays for.
 */
create or replace function public.rpc_fin_document_issue(
  p_kind text,
  p_subject_id uuid default null,
  p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_party text;
  v_amount bigint;
  v_orders integer;
  v_doc public.fin_document;
  v_staff uuid;
begin
  if not (authz.is_super_admin() or authz.reaches_module('finance')) then
    raise exception 'Only people who reach Finance can print finance documents.' using errcode = '42501';
  end if;

  if p_kind = 'receipt' then
    select 'payment:' || p.id, coalesce(i.bill_to ->> 'legal_name', c.legal_name), p.amount_cents
      into v_subject, v_party, v_amount
      from public.fin_invoice_payment p
      join public.fin_invoice i on i.id = p.invoice_id
      join public.fin_client c on c.id = i.client_id
     where p.id = p_subject_id;
  elsif p_kind = 'settlement' then
    select 'settlement_line:' || l.id, l.party_label, l.net_cents
      into v_subject, v_party, v_amount
      from public.fin_settlement_line l
     where l.id = p_subject_id;
    /* The orders the line pays for, for the statement's "Completed orders". */
    select count(distinct t.order_id)::integer into v_orders
      from public.fin_settlement_line l
      join ledger.entry e on e.id = any (l.ledger_entry_ids)
      join ledger.transaction t on t.id = e.transaction_id
     where l.id = p_subject_id;
  elsif p_kind = 'report' then
    if p_month is null or p_month <> date_trunc('month', p_month)::date then
      raise exception 'Give the first day of the report''s month.' using errcode = '22023';
    end if;
    if p_month > (now() at time zone 'Africa/Nairobi')::date then
      raise exception 'That month has not started yet.' using errcode = '22023';
    end if;
    v_subject := 'month:' || to_char(p_month, 'YYYY-MM');
    v_party := 'Monthly financial report, ' || to_char(p_month, 'FMMonth YYYY');
  else
    raise exception 'Unknown document type %.', p_kind using errcode = '22023';
  end if;

  if v_subject is null then
    raise exception 'That record is not on file.' using errcode = 'P0002';
  end if;

  /* One printer at a time per document, so two people printing it at once
     share one reference and the series keeps no gap. */
  perform pg_advisory_xact_lock(hashtext('fin_document:' || p_kind || ':' || v_subject));
  select * into v_doc from public.fin_document where kind = p_kind and subject = v_subject;
  if v_doc.id is null then
    select s.id into v_staff from public.staff_user s where s.user_id = auth.uid();
    insert into public.fin_document (kind, reference, subject, party_label, amount_cents, issued_by)
    values (p_kind, public.fn_fin_document_next_reference(p_kind), v_subject, v_party, v_amount, v_staff)
    returning * into v_doc;

    perform audit.log(
      p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.document_issued',
      p_actor_id => v_staff,
      p_target_type => 'fin_document', p_target_id => v_doc.id,
      p_target_label => v_doc.reference,
      p_after => jsonb_build_object('kind', p_kind, 'subject', v_subject,
        'party', v_party, 'amount_cents', v_amount));
  end if;

  return jsonb_build_object(
    'reference', v_doc.reference,
    'check_code', v_doc.check_code,
    'issued_at', v_doc.issued_at,
    'orders', v_orders);
end;
$$;

revoke execute on function public.rpc_fin_document_issue(text, uuid, date) from public, anon;
grant execute on function public.rpc_fin_document_issue(text, uuid, date) to authenticated;

/* The check code printed on a tax invoice: the first 12 hex of SHA-256 of its id. */
create or replace function public.fn_tax_invoice_check_code(p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(encode(sha256(convert_to(p_id::text, 'UTF8')), 'hex'), 12);
$$;

revoke execute on function public.fn_tax_invoice_check_code(uuid) from public, anon, authenticated;

/*
 * Is this NexG reference genuine? For the public verify page. Without the
 * document's check code: found, type, reference, date and status only.
 * With it: also who it was issued to and the amount.
 */
create or replace function public.rpc_fin_document_verify(p_reference text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref text := upper(btrim(coalesce(p_reference, '')));
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_doc public.fin_document;
  v_tax public.tax_invoice;
  v_void boolean;
begin
  if v_ref = '' or length(v_ref) > 40 then
    return jsonb_build_object('found', false);
  end if;

  select * into v_doc from public.fin_document where reference = v_ref;
  if v_doc.id is not null then
    return jsonb_build_object(
      'found', true,
      'kind', v_doc.kind,
      'reference', v_doc.reference,
      'issued_on', (v_doc.issued_at at time zone 'Africa/Nairobi')::date,
      'status', 'issued',
      'details', v_code <> '' and v_code = v_doc.check_code)
      || case when v_code <> '' and v_code = v_doc.check_code
              then jsonb_build_object('party', v_doc.party_label, 'amount_cents', v_doc.amount_cents)
              else '{}'::jsonb end;
  end if;

  select * into v_tax from public.tax_invoice where number = v_ref;
  if v_tax.id is not null then
    select exists (select 1 from public.fin_invoice i where i.tax_invoice_id = v_tax.id and i.status = 'void')
      into v_void;
    return jsonb_build_object(
      'found', true,
      'kind', case when v_tax.kind = 'credit_note' then 'credit_note' else 'invoice' end,
      'reference', v_tax.number,
      'issued_on', (v_tax.issued_at at time zone 'Africa/Nairobi')::date,
      'status', case when v_void then 'void' else 'issued' end,
      'details', v_code <> '' and v_code = public.fn_tax_invoice_check_code(v_tax.id))
      || case when v_code <> '' and v_code = public.fn_tax_invoice_check_code(v_tax.id)
              then jsonb_build_object('party', v_tax.party_name, 'amount_cents', v_tax.gross_cents)
              else '{}'::jsonb end;
  end if;

  return jsonb_build_object('found', false);
end;
$$;

revoke execute on function public.rpc_fin_document_verify(text, text) from public;
grant execute on function public.rpc_fin_document_verify(text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════ audit and the wiring gate (test 26)

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('finance.document_issued', 'finance', 'info', false,
   'Finance printed a receipt, settlement statement or monthly report for the first time, which gave it its reference')
on conflict (action) do nothing;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_fin_document_verify',
   'Anyone holding a NexG finance document checks it on nexgapp.com/verify, with no session: customers, merchants, banks and KRA.',
   'Read-only (stable, writes nothing). With a reference alone it says only whether it exists, its type, date and status; the party and amount need the 12-character check code printed in the document''s QR code (random per register row, or the SHA-256 of the tax invoice id, which is never public). References over 40 characters are refused.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ═══════════════════════════════════════════════════════════ KRA series

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
  return 'NEXG-INV-' || v_year || '-' || lpad(v_n::text, 5, '0');
end;
$$;

revoke execute on function public.fn_tax_next_number(timestamptz) from public, anon, authenticated;

alter table public.fin_invoice drop constraint if exists fin_invoice_number_check;
alter table public.fin_invoice add constraint fin_invoice_number_check
  check (number is null or number ~ '^(NX-INV-[0-9]{4}-[0-9]{6}|NEXG-INV-[0-9]{4}-[0-9]{5,})$');

-- As before, except that a credit note reads NEXG-CRN- with the series' year and number.
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
     stays gapless; a credit note reads NEXG-CRN-. */
  v_number := 'NEXG-CRN-' || regexp_replace(public.fn_tax_next_number(now()), '^[A-Z]+-INV-', '');

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
