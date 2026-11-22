-- Finance → Reconciliations → New Reconciliation: statement imports.
--
-- Finance uploads an M-PESA organisation statement or a bank statement (CSV)
-- for a period. Every line of it is matched against NexG's own records of the
-- same money, and whatever does not match is listed for a person to resolve.
-- A reconciliation is closed once nothing on it is left open.
--
--   finance-statements      private bucket: the file as uploaded, kept
--   fin_statement_import    one uploaded statement, numbered REC-YYYY-NNNN
--   fin_statement_line      its lines, as the console read them
--   fin_statement_match     what each line was matched to, plus the NexG
--                           records of that money the statement does not show
--
-- Rules, all enforced here:
--   * Anyone who reaches Finance reads imports, lines, matches and the files.
--     Importing, resolving, closing and voiding need full Finance
--     (authz.office_finance_require), and every change writes audit.log.
--   * The console reads the file twice: in the browser for the preview, and
--     again on the server from the stored file, whose SHA-256 is recorded. The
--     same file is not imported twice for one source unless the first import
--     was voided.
--   * Phone numbers in the statement's text are kept to their last three
--     digits; names stay as printed.
--   * fn_fin_statement_match re-runs whenever something is resolved. What a
--     person decided (a match by hand, a confirmed suggestion, an explanation)
--     is kept, and the rows it re-works keep their ids.
--
-- Matching, in order:
--   1. Classify: a line the statement says did not complete is ignored; a
--      charge is a charge (not posted to the ledger by design); on M-PESA, a
--      second line with the same receipt, direction and amount is a duplicate;
--      a reversal is checked against the record of the receipt it reverses.
--   2. Receipt: the M-PESA receipt (or bank reference) on a NexG record:
--      payments and the prompts sent for them, double payments (prompt
--      outcome duplicate), Paybill messages, rider cash deposits, rider kits,
--      experiences, B2C payouts, refunds, settlement lines, office expenses.
--   3. Account + amount + time (M-PESA): an STK payment settled without a
--      receipt (the background status query returns none). The account the
--      customer's phone sent is the order number without dashes, the amount
--      is the whole shillings M-PESA was asked for (ceil(cents / 100)), and
--      the line completed while that prompt was open
--      [sent_at − 2 min, resolved_at + 2 min, or sent_at + 7 days if never
--      resolved]. Only when exactly one payment fits.
--   4. Amount + time (10 minutes) + the phone's last three digits (M-PESA):
--      a suggestion, for a person to confirm.
--   Left over: a line is not in NexG; a NexG record of that source in the
--   period with no line is not on the statement. A matched record whose
--   amount or state disagrees (a payment not paid, a prompt that failed, a
--   payout uncertain or failed, a Paybill message nobody handled) is listed
--   as differing.
--
-- Ledger: a matched order payment should have its sale posted
-- (ledger.transaction 'sale:<order_id>'), a refund 'refund_issued:<id>'.
-- Stays, featured slots, rider floats, money sent back (return_excess),
-- double payments, office expenses and M-PESA charges are not posted to the
-- ledger by design (expected_ledger false). Null means not checked.
--
-- Rollback:
--   drop function public.rpc_fin_statement_import(text, text, date, date, text, text, text, bigint, text, jsonb),
--     public.rpc_fin_statement_resolve(uuid, text, text, uuid, text),
--     public.rpc_fin_statement_close(uuid),
--     public.rpc_fin_statement_void(uuid, text),
--     public.rpc_fin_statement_imports(date, date),
--     public.rpc_fin_statement_detail(uuid),
--     public.rpc_fin_statement_find(uuid, text),
--     public.fn_fin_statement_match(uuid),
--     public.fn_fin_statement_records(text, timestamptz, timestamptz, text[]),
--     public.fn_fin_mask_phones(text);
--   drop table public.fin_statement_match, public.fin_statement_line, public.fin_statement_import;
--   drop sequence public.fin_statement_import_seq;
--   drop policy finance_statements_insert on storage.objects;
--   drop policy finance_statements_read on storage.objects;
--   empty finance-statements through the Storage API, then
--     delete from storage.buckets where id = 'finance-statements';
--   delete from audit.action_registry where action like 'finance.statement\_%';

-- ═══════════════════════════════════════════════════════════════ the files

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-statements', 'finance-statements', false, 20 * 1024 * 1024,
        array['text/csv', 'application/vnd.ms-excel', 'text/plain'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* Uploaded into the uploader's own folder by people with full Finance, read
   by everyone who reaches Finance. Nothing is deleted: the file is the
   evidence behind the reconciliation. */
drop policy if exists finance_statements_insert on storage.objects;
create policy finance_statements_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finance-statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select authz.has_full_finance()));

drop policy if exists finance_statements_read on storage.objects;
create policy finance_statements_read on storage.objects
  for select to authenticated
  using (bucket_id = 'finance-statements' and (select authz.finance_reads()));

-- ═══════════════════════════════════════════════════════════════ the tables

create sequence if not exists public.fin_statement_import_seq;

create table if not exists public.fin_statement_import (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'REC-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-'
    || lpad(nextval('public.fin_statement_import_seq')::text, 4, '0')),
  source text not null check (source in ('mpesa_paybill', 'mpesa_till', 'mpesa_b2c', 'bank')),
  account_label text not null check (length(btrim(account_label)) between 2 and 120),
  period_from date not null,
  period_to date not null,
  file_path text not null check (length(file_path) <= 400),
  file_name text not null check (length(file_name) between 1 and 200),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  format text not null check (format in ('mpesa', 'bank')),
  line_count integer not null default 0,
  opening_balance_cents bigint,
  closing_balance_cents bigint,
  paid_in_cents bigint not null default 0,
  withdrawn_cents bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'closed', 'void')),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  /* Who closed or voided it, and when. */
  closed_by uuid references public.staff_user (id) on delete set null,
  closed_at timestamptz,
  /* Why it was voided. */
  note text check (note is null or length(note) <= 1000),
  constraint fin_statement_import_period check (
    period_to >= period_from and period_to - period_from <= 400),
  constraint fin_statement_import_format check ((format = 'bank') = (source = 'bank')),
  constraint fin_statement_import_finished check ((status = 'open') = (closed_at is null))
);

/* One import per file and source, unless the earlier one was voided. */
create unique index if not exists fin_statement_import_file_once
  on public.fin_statement_import (source, file_sha256) where status <> 'void';
create index if not exists fin_statement_import_period_idx
  on public.fin_statement_import (period_to desc, period_from);
create index if not exists fin_statement_import_created_by_idx
  on public.fin_statement_import (created_by);
create index if not exists fin_statement_import_closed_by_idx
  on public.fin_statement_import (closed_by);

comment on table public.fin_statement_import is
  'An M-PESA or bank statement uploaded by Finance for a period, matched line by line against NexG records. The file stays in the finance-statements bucket.';

create table if not exists public.fin_statement_line (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.fin_statement_import (id) on delete cascade,
  /* The line's row in the stored file (the first row is 1). */
  line_no integer not null check (line_no > 0),
  /* M-PESA receipt or bank reference: upper case, no spaces. */
  receipt text check (receipt is null or length(receipt) <= 80),
  completed_at timestamptz not null,
  initiated_at timestamptz,
  details text check (details is null or length(details) <= 500),
  /* As printed, with phone numbers kept to their last three digits. */
  other_party text check (other_party is null or length(other_party) <= 200),
  phone_tail text check (phone_tail is null or phone_tail ~ '^[0-9]{3}$'),
  /* The account the payer typed, compacted like fn_compact_reference. */
  account_ref text check (account_ref is null or length(account_ref) <= 80),
  status_text text check (status_text is null or length(status_text) <= 40),
  reason_type text check (reason_type is null or length(reason_type) <= 120),
  direction text not null check (direction in ('in', 'out')),
  amount_cents bigint not null check (amount_cents >= 0),
  balance_cents bigint,
  linked_receipt text check (linked_receipt is null or length(linked_receipt) <= 80),
  kind text not null check (kind in (
    'collection', 'payout', 'charge', 'transfer', 'reversal', 'failed', 'other')),
  /* The row's cells as printed, phone numbers masked. */
  raw jsonb not null default '[]'::jsonb,
  unique (import_id, line_no)
);

create index if not exists fin_statement_line_receipt_idx
  on public.fin_statement_line (receipt) where receipt is not null;

comment on table public.fin_statement_line is
  'The lines of an imported statement. Phone numbers are kept to their last three digits.';

create table if not exists public.fin_statement_match (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.fin_statement_import (id) on delete cascade,
  /* Null for a NexG record the statement does not show. */
  line_id uuid references public.fin_statement_line (id) on delete cascade,
  result text not null check (result in (
    'matched', 'suggested', 'amount_differs', 'state_differs', 'not_in_nexg',
    'not_on_statement', 'duplicate', 'charge', 'ignored', 'explained')),
  rule text check (rule is null or rule in (
    'receipt', 'paybill_event', 'account_amount_time', 'amount_phone_time', 'manual')),
  record_type text check (record_type is null or record_type in (
    'payment', 'payment_prompt', 'paybill_event', 'cash_deposit', 'rider_kit', 'plan',
    'mpesa_payout', 'refund', 'settlement_line', 'office_expense')),
  record_id uuid,
  record_reference text,
  record_label text,
  record_amount_cents bigint,
  record_state text,
  record_at timestamptz,
  /* True: should be on the ledger; false: not posted by design; null: not checked. */
  expected_ledger boolean,
  ledger_found boolean,
  /* The statement's amount less NexG's; zero when they agree. */
  difference_cents bigint,
  note text check (note is null or length(note) <= 1000),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fin_statement_match_record_pair check ((record_type is null) = (record_id is null)),
  constraint fin_statement_match_subject check (
    line_id is not null or (record_id is not null and result in ('not_on_statement', 'explained')))
);

create unique index if not exists fin_statement_match_one_per_line
  on public.fin_statement_match (line_id) where line_id is not null;
create unique index if not exists fin_statement_match_one_per_missing
  on public.fin_statement_match (import_id, record_type, record_id) where line_id is null;
create index if not exists fin_statement_match_import_idx
  on public.fin_statement_match (import_id, result);
create index if not exists fin_statement_match_record_idx
  on public.fin_statement_match (record_type, record_id);
create index if not exists fin_statement_match_decided_by_idx
  on public.fin_statement_match (decided_by);

comment on table public.fin_statement_match is
  'What each statement line was matched to, and the NexG records of that money the statement does not show. Rows with decided_at were decided by a person and survive re-matching.';

alter table public.fin_statement_import enable row level security;
alter table public.fin_statement_line enable row level security;
alter table public.fin_statement_match enable row level security;

drop policy if exists fin_statement_import_read on public.fin_statement_import;
create policy fin_statement_import_read on public.fin_statement_import
  for select to authenticated using ((select authz.finance_reads()));
drop policy if exists fin_statement_line_read on public.fin_statement_line;
create policy fin_statement_line_read on public.fin_statement_line
  for select to authenticated using ((select authz.finance_reads()));
drop policy if exists fin_statement_match_read on public.fin_statement_match;
create policy fin_statement_match_read on public.fin_statement_match
  for select to authenticated using ((select authz.finance_reads()));

revoke all on table public.fin_statement_import, public.fin_statement_line,
  public.fin_statement_match from anon;
revoke insert, update, delete, truncate, references, trigger on table
  public.fin_statement_import, public.fin_statement_line, public.fin_statement_match
  from authenticated;
grant select on table public.fin_statement_import, public.fin_statement_line,
  public.fin_statement_match to authenticated;
revoke all on sequence public.fin_statement_import_seq from anon, authenticated;

-- ═══════════════════════════════════════════════════════════ audit registry

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('finance.statement_imported', 'finance', 'notice', false, false, true, '{}', 'An M-PESA or bank statement was imported and matched against NexG records'),
  ('finance.statement_line_matched', 'finance', 'notice', false, false, true, '{}', 'A statement line was matched to a NexG record by hand, with a note'),
  ('finance.statement_suggestion_confirmed', 'finance', 'info', false, false, true, '{}', 'A suggested match for a statement line was confirmed'),
  ('finance.statement_item_explained', 'finance', 'notice', false, false, true, '{}', 'A statement line or NexG record that did not match was explained, with a note'),
  ('finance.statement_closed', 'finance', 'notice', false, false, true, '{}', 'A statement reconciliation was closed with nothing left open'),
  ('finance.statement_voided', 'finance', 'high', true, false, true, '{}', 'A statement import was voided, with a reason')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ helpers

/* Phone numbers in a statement's text, down to their last three digits:
   "Pay Bill Online from 254712345678 - JANE W" → "… from ···678 - JANE W".
   Shortcodes and order numbers (letters before the digits) stay as printed. */
create or replace function public.fn_fin_mask_phones(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(p_text, '(?<![A-Za-z0-9])[0-9*]{6,}([0-9]{3})(?![0-9])', '···\1', 'g')
$$;

/*
 * NexG's records of money moving, in one shape, for a statement source:
 * those dated between p_lo and p_hi, and any carrying one of p_receipts.
 *
 *   grp        one movement of money: a payment and its Paybill message, or
 *              a refund and the payout that sent it, are matched once
 *   opened_at  for an M-PESA prompt, the time it was open (rule 3)
 *   listable   should appear on a statement of this source when it falls in
 *              the period (not_on_statement)
 *   priority   which record a receipt names first
 *
 * Internal: the matcher and the Match search call it after their own checks.
 */
create or replace function public.fn_fin_statement_records(
  p_source text,
  p_lo timestamptz,
  p_hi timestamptz,
  p_receipts text[] default '{}'
)
returns table (
  record_type text,
  record_id uuid,
  grp text,
  direction text,
  receipt text,
  has_receipt boolean,
  account_ref text,
  pay_ref text,
  phone3 text,
  amount_cents bigint,
  at timestamptz,
  opened_at timestamptz,
  closed_at timestamptz,
  state text,
  state_ok boolean,
  reference text,
  label text,
  expected_ledger boolean,
  ledger_found boolean,
  listable boolean,
  priority integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with src as (
    select p_source in ('mpesa_paybill', 'mpesa_till') as collections,
           p_source = 'mpesa_b2c' as b2c,
           p_source like 'mpesa\_%' as mpesa,
           p_source = 'bank' as bank
  ),
  pay as (
    select p.id, p.reference, p.intent, p.order_id, p.amount_cents, p.state, p.paid_at,
           p.created_at, p.payer_phone, p.provider_receipt, o.reference as order_reference,
           p.provider_receipt is not null or exists (
             select 1 from public.payment_prompt q
              where q.payment_id = p.id and q.outcome = 'paid' and q.receipt is not null)
             as has_receipt,
           case when p.intent = 'order' then exists (
             select 1 from ledger.transaction t
              where t.idempotency_key = 'sale:' || p.order_id::text) end as sale_posted,
           case p.intent
             when 'order' then 'Order ' || coalesce(o.reference, '?')
             when 'stay' then 'Stay booking'
             when 'featured_slot' then 'Featured placement'
             else 'Rider float top-up' end || ' · payment ' || p.reference as label
      from public.payment p
      cross join src
      left join public."order" o on o.id = p.order_id
     where ((src.collections and p.provider = 'mpesa') or (src.bank and p.provider like 'bank\_%'))
       and (   (coalesce(p.paid_at, p.created_at) >= p_lo and coalesce(p.paid_at, p.created_at) < p_hi)
            or p.provider_receipt = any (p_receipts)
            or exists (select 1 from public.payment_prompt q
                        where q.payment_id = p.id
                          and ((q.sent_at >= p_lo and q.sent_at < p_hi) or q.receipt = any (p_receipts))))
  )
  -- a payment ...
  select 'payment'::text, p.id, 'payment:' || p.id, 'in'::text,
         nullif(regexp_replace(upper(coalesce(p.provider_receipt, '')), '\s', '', 'g'), ''),
         p.has_receipt,
         nullif(public.fn_compact_reference(p.order_reference), ''),
         public.fn_compact_reference(p.reference),
         substring(p.payer_phone from '([0-9]{3})[^0-9]*$'),
         p.amount_cents, coalesce(p.paid_at, p.created_at), null::timestamptz, null::timestamptz,
         p.state::text, p.state in ('paid', 'reversed'),
         coalesce(p.order_reference, p.reference), p.label,
         p.intent = 'order', p.sale_posted,
         p.state = 'paid', 1
    from pay p

  union all
  -- ... and each prompt sent for it: its receipt, and the time it was open
  select 'payment', p.id, 'payment:' || p.id, 'in',
         nullif(regexp_replace(upper(coalesce(q.receipt, '')), '\s', '', 'g'), ''),
         p.has_receipt,
         nullif(public.fn_compact_reference(p.order_reference), ''),
         public.fn_compact_reference(p.reference),
         substring(coalesce(q.phone, p.payer_phone) from '([0-9]{3})[^0-9]*$'),
         p.amount_cents, coalesce(q.resolved_at, q.sent_at),
         q.sent_at - interval '2 minutes',
         coalesce(q.resolved_at + interval '2 minutes', q.sent_at + interval '7 days'),
         p.state::text, p.state in ('paid', 'reversed'),
         coalesce(p.order_reference, p.reference), p.label,
         p.intent = 'order', p.sale_posted,
         false, 1
    from pay p
    join public.payment_prompt q on q.payment_id = p.id and q.outcome is distinct from 'duplicate'

  union all
  -- money received twice for one payment (prompt outcome duplicate), to send back
  select 'payment_prompt', q.id, 'prompt:' || q.id, 'in',
         nullif(regexp_replace(upper(coalesce(q.receipt, '')), '\s', '', 'g'), ''),
         q.receipt is not null,
         nullif(public.fn_compact_reference(p.order_reference), ''),
         public.fn_compact_reference(p.reference),
         substring(q.phone from '([0-9]{3})[^0-9]*$'),
         p.amount_cents, coalesce(q.resolved_at, q.sent_at),
         q.sent_at - interval '2 minutes',
         coalesce(q.resolved_at + interval '2 minutes', q.sent_at + interval '7 days'),
         'duplicate', true,
         coalesce(p.order_reference, p.reference),
         'Paid twice · payment ' || p.reference || ' (to send back)',
         false, null::boolean,
         true, 2
    from pay p
    join public.payment_prompt q on q.payment_id = p.id and q.outcome = 'duplicate'

  union all
  -- a Paybill payment as Safaricom reported it; for no order, it exists only here
  select 'paybill_event', ev.id,
         coalesce('payment:' || ev.payment_id::text, 'paybill:' || upper(substr(ev.dedupe_key, 9))),
         'in', upper(substr(ev.dedupe_key, 9)), true,
         nullif(public.fn_compact_reference(ev.payload ->> 'BillRefNumber'), ''), null,
         case when ev.payload ->> 'MSISDN' ~ '^\+?[0-9]{9,15}$' then right(ev.payload ->> 'MSISDN', 3) end,
         case when ev.payload ->> 'TransAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$'
              then round((ev.payload ->> 'TransAmount')::numeric * 100)::bigint end,
         ev.received_at, null, null,
         case when ev.handled then 'handled' else 'unhandled' end, ev.handled,
         upper(substr(ev.dedupe_key, 9)),
         'Paybill payment'
           || coalesce(', account ' || nullif(left(ev.payload ->> 'BillRefNumber', 30), ''), '')
           || case when ev.handled then '' else ' (not handled)' end,
         null, null,
         ev.payment_id is null, 3
    from public.payment_event ev
    cross join src
   where src.collections and ev.provider = 'mpesa' and ev.event = 'mpesa.paybill'
     and ev.dedupe_key ~ '^paybill:[^:]+$'
     and ((ev.received_at >= p_lo and ev.received_at < p_hi)
          or upper(substr(ev.dedupe_key, 9)) = any (p_receipts))

  union all
  -- cash a rider paid in to the Paybill
  select 'cash_deposit', d.id, 'cash_deposit:' || d.id, 'in',
         nullif(regexp_replace(upper(coalesce(d.provider_ref, '')), '\s', '', 'g'), ''),
         d.provider_ref is not null,
         nullif(public.fn_compact_reference(d.account_reference), ''), null, null,
         d.amount_kes * 100, d.paid_at, null, null,
         d.match_status::text, d.match_status in ('auto_matched', 'manual_matched'),
         d.provider_ref, 'Rider cash deposit',
         null, null,
         d.match_status <> 'rejected', 4
    from public.cash_deposit d
    cross join src
   where src.collections
     and ((d.paid_at >= p_lo and d.paid_at < p_hi) or d.provider_ref = any (p_receipts))

  union all
  -- a rider's kit, paid by M-PESA (which account it reached is not recorded)
  select 'rider_kit', k.rider_id, 'rider_kit:' || k.rider_id, 'in',
         nullif(regexp_replace(upper(k.paid_reference), '\s', '', 'g'), ''), true,
         null, null, null,
         k.paid_amount_kes * 100, k.paid_at, null, null,
         k.status, k.status in ('paid', 'issued'),
         k.paid_reference, 'Rider kit payment',
         null, null,
         false, 5
    from public.rider_kit_order k
    cross join src
   where src.collections and k.paid_method = 'mpesa' and k.paid_reference is not null
     and ((k.paid_at >= p_lo and k.paid_at < p_hi)
          or regexp_replace(upper(k.paid_reference), '\s', '', 'g') = any (p_receipts))

  union all
  -- an experience, paid with a reference (which account it reached is not recorded)
  select 'plan', pl.id, 'plan:' || pl.id, 'in',
         nullif(regexp_replace(upper(pl.payment_reference), '\s', '', 'g'), ''), true,
         nullif(public.fn_compact_reference(pl.reference), ''), null,
         substring(pl.guest_phone from '([0-9]{3})[^0-9]*$'),
         pl.quote_total_kes * 100, pl.paid_at, null, null,
         pl.status::text, pl.status in ('paid', 'in_progress', 'completed'),
         pl.reference, 'Experience ' || pl.reference,
         null, null,
         false, 6
    from public.plan pl
    cross join src
   where (src.collections or src.bank) and pl.payment_reference is not null
     and ((pl.paid_at >= p_lo and pl.paid_at < p_hi)
          or regexp_replace(upper(pl.payment_reference), '\s', '', 'g') = any (p_receipts))

  union all
  -- M-PESA B2C: refunds, and money sent back (return_excess)
  select 'mpesa_payout', m.id, coalesce('refund:' || m.refund_id::text, 'payout:' || m.id::text), 'out',
         nullif(regexp_replace(upper(coalesce(m.receipt, '')), '\s', '', 'g'), ''),
         m.receipt is not null,
         nullif(public.fn_compact_reference(o.reference), ''), null,
         substring(m.phone from '([0-9]{3})[^0-9]*$'),
         m.amount_cents, coalesce(m.finished_at, m.answered_at, m.requested_at, m.created_at), null, null,
         m.state, m.state = 'sent',
         m.originator_id,
         case m.purpose when 'return_excess' then 'Money sent back' else 'Refund by M-PESA' end
           || coalesce(' · order ' || o.reference, ''),
         m.purpose = 'order_refund',
         case when m.refund_id is not null then exists (
           select 1 from ledger.transaction t
            where t.idempotency_key = 'refund_issued:' || m.refund_id::text) end,
         src.b2c and m.state in ('sent', 'accepted', 'uncertain'), 7
    from public.mpesa_payout m
    cross join src
    left join public."order" o on o.id = m.order_id
   where src.mpesa
     and ((coalesce(m.finished_at, m.answered_at, m.requested_at, m.created_at) >= p_lo
           and coalesce(m.finished_at, m.answered_at, m.requested_at, m.created_at) < p_hi)
          or m.receipt = any (p_receipts))

  union all
  -- refunds sent by M-PESA
  select 'refund', r.id, 'refund:' || r.id, 'out',
         nullif(regexp_replace(upper(coalesce(r.provider_ref, '')), '\s', '', 'g'), ''),
         r.provider_ref is not null,
         nullif(public.fn_compact_reference(o.reference), ''), null,
         substring(g.phone from '([0-9]{3})[^0-9]*$'),
         r.amount_cents, coalesce(r.issued_at, r.requested_at), null, null,
         r.status, r.status = 'issued',
         'RF-' || upper(left(r.id::text, 8)), 'Refund · order ' || coalesce(o.reference, '?'),
         true, exists (select 1 from ledger.transaction t
                        where t.idempotency_key = 'refund_issued:' || r.id::text),
         src.b2c and r.status = 'issued', 8
    from public.refund r
    cross join src
    left join public."order" o on o.id = r.order_id
    left join public.guest g on g.id = o.guest_id
   where src.mpesa and r.method = 'mpesa_b2c'
     and ((coalesce(r.issued_at, r.requested_at) >= p_lo and coalesce(r.issued_at, r.requested_at) < p_hi)
          or r.provider_ref = any (p_receipts))

  union all
  -- weekly payouts to merchants, hosts and riders
  select 'settlement_line', l.id, 'settlement_line:' || l.id, 'out',
         nullif(regexp_replace(upper(coalesce(l.provider_ref, '')), '\s', '', 'g'), ''),
         l.provider_ref is not null,
         null, null,
         substring(l.destination_masked from '([0-9]{3})[^0-9]*$'),
         l.net_cents,
         coalesce(l.paid_at, (r.pay_date::timestamp + time '09:00') at time zone 'Africa/Nairobi'),
         null, null,
         l.state::text, l.state = 'paid',
         r.reference, 'Payout · ' || l.party_label || ' · ' || r.reference,
         null, null,
         ((src.b2c and l.rail in ('mpesa_b2c', 'mpesa_b2b')) or (src.bank and l.rail = 'bank_eft'))
           and l.state in ('paid', 'sent'), 9
    from public.fin_settlement_line l
    join public.fin_settlement_run r on r.id = l.run_id
    cross join src
   where r.state not in ('draft', 'cancelled') and l.net_cents > 0
     and ((src.mpesa and l.rail in ('mpesa_b2c', 'mpesa_b2b')) or (src.bank and l.rail = 'bank_eft'))
     and ((coalesce(l.paid_at, (r.pay_date::timestamp + time '09:00') at time zone 'Africa/Nairobi') >= p_lo
           and coalesce(l.paid_at, (r.pay_date::timestamp + time '09:00') at time zone 'Africa/Nairobi') < p_hi)
          or l.provider_ref = any (p_receipts))

  union all
  -- office expenses paid by M-PESA or bank transfer (not posted to the ledger by design)
  select 'office_expense', e.id, 'expense:' || e.id, 'out',
         nullif(regexp_replace(upper(coalesce(e.payment_reference, '')), '\s', '', 'g'), ''),
         e.payment_reference is not null,
         null, null, null,
         e.amount_cents,
         (coalesce(e.paid_on, e.spent_on)::timestamp + time '12:00') at time zone 'Africa/Nairobi',
         null, null,
         e.status, e.status = 'paid',
         e.number, 'Office expense ' || e.number || ' · ' || left(e.description, 80),
         false, null,
         src.bank and e.payment_method = 'bank_transfer', 10
    from public.fin_office_expense e
    cross join src
   where e.status = 'paid'
     and ((src.mpesa and e.payment_method = 'mpesa') or (src.bank and e.payment_method = 'bank_transfer'))
     and (((coalesce(e.paid_on, e.spent_on)::timestamp + time '12:00') at time zone 'Africa/Nairobi' >= p_lo
           and (coalesce(e.paid_on, e.spent_on)::timestamp + time '12:00') at time zone 'Africa/Nairobi' < p_hi)
          or regexp_replace(upper(coalesce(e.payment_reference, '')), '\s', '', 'g') = any (p_receipts))
$$;

comment on function public.fn_fin_statement_records(text, timestamptz, timestamptz, text[]) is
  'NexG records of money moving for a statement source, in one shape. Internal: the statement matcher and rpc_fin_statement_find call it.';

-- ═══════════════════════════════════════════════════════════════ matching

/*
 * Matches an open import's lines against NexG's records. Re-runnable: rows
 * a person decided are kept, the rest are worked out again, and a line's row
 * keeps its id. Returns the number of rows per result.
 */
create or replace function public.fn_fin_statement_match(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.fin_statement_import;
  v_mpesa boolean;
  v_lo timestamptz;
  v_hi timestamptz;
  v_wlo timestamptz;
  v_whi timestamptz;
  v_receipts text[];
  v_counts jsonb;
begin
  select * into v_imp from public.fin_statement_import where id = p_import_id for update;
  if v_imp.id is null or v_imp.status <> 'open' then
    return null;
  end if;

  v_mpesa := v_imp.source like 'mpesa\_%';
  v_lo := v_imp.period_from::timestamp at time zone 'Africa/Nairobi';
  v_hi := (v_imp.period_to + 1)::timestamp at time zone 'Africa/Nairobi';

  /* A statement's lines can run past the period chosen: look a day wider than both. */
  select least(v_lo, min(l.completed_at)) - interval '1 day',
         greatest(v_hi, max(l.completed_at)) + interval '1 day',
         coalesce(array_agg(distinct x.r) filter (where x.r is not null), '{}')
    into v_wlo, v_whi, v_receipts
    from public.fin_statement_line l
    cross join lateral (values (l.receipt), (l.linked_receipt)) as x (r)
   where l.import_id = p_import_id;

  /* Working tables, dropped again at the end; left over only if an earlier
     call in this transaction stopped half-way. */
  if to_regclass('pg_temp.fin_stmt_rec') is not null then
    drop table if exists pg_temp.fin_stmt_rec, pg_temp.fin_stmt_kept, pg_temp.fin_stmt_taken,
      pg_temp.fin_stmt_res;
  end if;

  create temporary table fin_stmt_rec on commit drop as
    select * from public.fn_fin_statement_records(v_imp.source, v_wlo, v_whi, v_receipts);
  create index on pg_temp.fin_stmt_rec (receipt);
  create index on pg_temp.fin_stmt_rec (grp);
  analyze pg_temp.fin_stmt_rec;

  /* What people decided stays decided. */
  create temporary table fin_stmt_kept on commit drop as
    select m.line_id, m.record_type, m.record_id
      from public.fin_statement_match m
     where m.import_id = p_import_id and m.decided_at is not null;
  create index on pg_temp.fin_stmt_kept (line_id);

  /* Money already accounted for, by movement. */
  create temporary table fin_stmt_taken on commit drop as
    select distinct r.grp
      from pg_temp.fin_stmt_rec r
      join pg_temp.fin_stmt_kept k on k.record_type = r.record_type and k.record_id = r.record_id;
  create index on pg_temp.fin_stmt_taken (grp);

  create temporary table fin_stmt_res (
    line_id uuid,
    result text,
    rule text,
    grp text,
    record_type text,
    record_id uuid,
    record_reference text,
    record_label text,
    record_amount_cents bigint,
    record_state text,
    record_at timestamptz,
    expected_ledger boolean,
    ledger_found boolean,
    difference_cents bigint,
    note text
  ) on commit drop;
  create index on pg_temp.fin_stmt_res (line_id);

  -- 1. classify ──────────────────────────────────────────────────────────

  insert into pg_temp.fin_stmt_res (line_id, result, note)
  select l.id, 'ignored',
         'Not completed (' || coalesce(nullif(l.status_text, ''), 'no status') || '): no money moved.'
    from public.fin_statement_line l
   where l.import_id = p_import_id and l.kind = 'failed'
     and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id);

  insert into pg_temp.fin_stmt_res (line_id, result, expected_ledger, note)
  select l.id, 'charge', false,
         case when v_mpesa then 'An M-PESA charge: not posted to the ledger by design.'
              else 'A bank charge: not posted to the ledger by design.' end
    from public.fin_statement_line l
   where l.import_id = p_import_id and l.kind = 'charge'
     and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id);

  /* An M-PESA receipt names one transaction: a second line with the same
     receipt, direction and amount is the same money printed twice. */
  if v_mpesa then
    insert into pg_temp.fin_stmt_res (line_id, result, note)
    select l.id, 'duplicate',
           'The same receipt, direction and amount as row ' || f.first_line || ' of the file.'
      from public.fin_statement_line l
      join lateral (
        select min(e.line_no) as first_line
          from public.fin_statement_line e
         where e.import_id = l.import_id and e.receipt = l.receipt and e.direction = l.direction
           and e.amount_cents = l.amount_cents and e.kind not in ('charge', 'failed')
           and e.line_no < l.line_no) f on f.first_line is not null
     where l.import_id = p_import_id and l.receipt is not null and l.kind not in ('charge', 'failed')
       and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id)
       and not exists (select 1 from pg_temp.fin_stmt_res s where s.line_id = l.id);
  end if;

  /* A reversal points at the receipt it reverses; that record should say so.
     It does not take the record: the original line matches it too. */
  insert into pg_temp.fin_stmt_res (
    line_id, result, rule, record_type, record_id, record_reference, record_label,
    record_amount_cents, record_state, record_at, expected_ledger, ledger_found, difference_cents, note)
  select x.line_id,
         case when x.reversed then 'matched' else 'state_differs' end, 'receipt',
         x.record_type, x.record_id, x.reference, x.label, x.amount_cents, x.state, x.at,
         x.expected_ledger, x.ledger_found, x.line_cents - x.amount_cents,
         'Reverses ' || x.linked_receipt
           || case when x.reversed then '; NexG shows it ' || replace(x.state, '_', ' ') || '.'
                   else ', but NexG still shows it ' || replace(x.state, '_', ' ') || '.' end
    from (
      select distinct on (l.id) l.id as line_id, l.amount_cents as line_cents, l.linked_receipt, r.*,
             (r.record_type = 'payment' and r.state = 'reversed')
               or (r.record_type in ('mpesa_payout', 'refund', 'settlement_line')
                   and r.state in ('failed', 'cancelled')) as reversed
        from public.fin_statement_line l
        join pg_temp.fin_stmt_rec r on r.receipt = l.linked_receipt and r.direction <> l.direction
       where l.import_id = p_import_id and l.kind = 'reversal' and l.linked_receipt is not null
         and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id)
         and not exists (select 1 from pg_temp.fin_stmt_res s where s.line_id = l.id)
       order by l.id, r.priority, r.at
    ) x;

  -- 2. receipt ───────────────────────────────────────────────────────────

  with cand as (
    select distinct on (l.id) l.id as line_id, l.line_no, l.amount_cents as line_cents, r.*,
           coalesce(case when v_mpesa
                         then l.amount_cents in (ceil(r.amount_cents / 100.0)::bigint * 100,
                                                 floor(r.amount_cents / 100.0)::bigint * 100)
                         else l.amount_cents = r.amount_cents end, false) as amount_ok
      from public.fin_statement_line l
      join pg_temp.fin_stmt_rec r on r.receipt = l.receipt and r.direction = l.direction
     where l.import_id = p_import_id and l.receipt is not null
       and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id)
       and not exists (select 1 from pg_temp.fin_stmt_res s where s.line_id = l.id)
       and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = r.grp)
     order by l.id, r.priority, r.at
  ), one_line_each as (
    select c.*, row_number() over (partition by c.grp order by c.line_no) as nth from cand c
  )
  insert into pg_temp.fin_stmt_res (
    line_id, result, rule, grp, record_type, record_id, record_reference, record_label,
    record_amount_cents, record_state, record_at, expected_ledger, ledger_found, difference_cents, note)
  select c.line_id,
         case when not c.amount_ok then 'amount_differs'
              when not c.state_ok then 'state_differs'
              else 'matched' end,
         case when c.record_type = 'paybill_event' then 'paybill_event' else 'receipt' end,
         c.grp, c.record_type, c.record_id, c.reference, c.label, c.amount_cents, c.state, c.at,
         c.expected_ledger, c.ledger_found,
         case when c.amount_ok then 0 else c.line_cents - c.amount_cents end,
         case when not c.amount_ok then 'Same receipt, different amount.'
              when c.state_ok then null
              when c.record_type = 'paybill_event'
                then 'NexG received this Paybill payment but it paid no order: it is waiting to be matched or sent back.'
              else 'On the statement, but NexG shows it ' || replace(c.state, '_', ' ') || '.' end
    from one_line_each c
   where c.nth = 1;

  insert into pg_temp.fin_stmt_taken
  select distinct s.grp from pg_temp.fin_stmt_res s
   where s.grp is not null and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = s.grp);

  -- 3. account + amount + time: an STK payment M-PESA gave no receipt for ───

  if v_mpesa then
    with cand as (
      select l.id as line_id, l.line_no, l.amount_cents as line_cents, r.*
        from public.fin_statement_line l
        join pg_temp.fin_stmt_rec r
          on r.direction = 'in' and r.opened_at is not null and not r.has_receipt
         and (r.account_ref = l.account_ref
              or (length(l.account_ref) >= 8 and r.pay_ref like l.account_ref || '%'))
         and l.amount_cents = ceil(r.amount_cents / 100.0)::bigint * 100
         and l.completed_at between r.opened_at and r.closed_at
       where l.import_id = p_import_id and l.direction = 'in' and l.account_ref is not null
         and l.kind not in ('charge', 'failed', 'transfer', 'reversal')
         and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id)
         and not exists (select 1 from pg_temp.fin_stmt_res s where s.line_id = l.id)
         and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = r.grp)
    ), only_one as (
      /* Exactly one payment (or double payment) fits, or none is chosen. */
      select c.line_id from cand c group by c.line_id having count(distinct c.grp) = 1
    ), picked as (
      select distinct on (c.line_id) c.*
        from cand c join only_one o on o.line_id = c.line_id
       order by c.line_id, c.priority, c.at
    ), one_line_each as (
      select p.*, row_number() over (partition by p.grp order by p.line_no) as nth from picked p
    )
    insert into pg_temp.fin_stmt_res (
      line_id, result, rule, grp, record_type, record_id, record_reference, record_label,
      record_amount_cents, record_state, record_at, expected_ledger, ledger_found, difference_cents, note)
    select c.line_id,
           case when c.state_ok then 'matched' else 'state_differs' end,
           'account_amount_time',
           c.grp, c.record_type, c.record_id, c.reference, c.label, c.amount_cents, c.state, c.at,
           c.expected_ledger, c.ledger_found, 0,
           case when c.state_ok
                then 'NexG has no receipt for this payment (M-PESA sent none): matched by the order number, the amount and the time the prompt was open.'
                else 'Matched by the order number, the amount and the time the prompt was open, but NexG shows the payment '
                     || replace(c.state, '_', ' ') || '.' end
      from one_line_each c
     where c.nth = 1;

    insert into pg_temp.fin_stmt_taken
    select distinct s.grp from pg_temp.fin_stmt_res s
     where s.grp is not null and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = s.grp);

    -- 4. amount + time + the phone's last digits: a suggestion ─────────────

    with cand as (
      select l.id as line_id, l.line_no, l.amount_cents as line_cents, l.phone_tail, r.*,
             abs(extract(epoch from (l.completed_at - r.at))) as gap
        from public.fin_statement_line l
        join pg_temp.fin_stmt_rec r
          on r.direction = l.direction and r.phone3 = l.phone_tail
         and r.at between l.completed_at - interval '10 minutes' and l.completed_at + interval '10 minutes'
         and l.amount_cents in (ceil(r.amount_cents / 100.0)::bigint * 100,
                                floor(r.amount_cents / 100.0)::bigint * 100)
       where l.import_id = p_import_id and l.phone_tail is not null
         and l.kind not in ('charge', 'failed', 'transfer', 'reversal')
         and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id)
         and not exists (select 1 from pg_temp.fin_stmt_res s where s.line_id = l.id)
         and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = r.grp)
    ), options as (
      select c.line_id, count(distinct c.grp) as n from cand c group by c.line_id
    ), picked as (
      select distinct on (c.line_id) c.*, o.n
        from cand c join options o on o.line_id = c.line_id
       order by c.line_id, c.gap, c.priority
    ), one_line_each as (
      select p.*, row_number() over (partition by p.grp order by p.gap, p.line_no) as nth from picked p
    )
    insert into pg_temp.fin_stmt_res (
      line_id, result, rule, grp, record_type, record_id, record_reference, record_label,
      record_amount_cents, record_state, record_at, expected_ledger, ledger_found, difference_cents, note)
    select c.line_id, 'suggested', 'amount_phone_time',
           c.grp, c.record_type, c.record_id, c.reference, c.label, c.amount_cents, c.state, c.at,
           c.expected_ledger, c.ledger_found, c.line_cents - c.amount_cents,
           'Same amount and a phone ending ' || c.phone_tail || ', ' || round(c.gap / 60) || ' min apart'
             || case when c.n > 1 then ' (' || c.n || ' records fit)' else '' end
             || '. Confirm only if it is the same money.'
      from one_line_each c
     where c.nth = 1;

    insert into pg_temp.fin_stmt_taken
    select distinct s.grp from pg_temp.fin_stmt_res s
     where s.grp is not null and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = s.grp);
  end if;

  -- 5. what is left ──────────────────────────────────────────────────────

  insert into pg_temp.fin_stmt_res (line_id, result, note)
  select l.id, 'not_in_nexg',
         case l.kind
           when 'transfer' then 'A transfer between accounts: NexG keeps no record of these. Explain it once it is checked against the other account.'
           when 'reversal' then 'A reversal NexG has no record of.'
           else 'No NexG record has this receipt'
                || case when v_mpesa then ', or this account, amount and time' else '' end || '.' end
    from public.fin_statement_line l
   where l.import_id = p_import_id
     and not exists (select 1 from pg_temp.fin_stmt_kept k where k.line_id = l.id)
     and not exists (select 1 from pg_temp.fin_stmt_res s where s.line_id = l.id);

  insert into pg_temp.fin_stmt_res (
    line_id, result, grp, record_type, record_id, record_reference, record_label,
    record_amount_cents, record_state, record_at, expected_ledger, ledger_found, note)
  select distinct on (r.grp) null::uuid, 'not_on_statement',
         r.grp, r.record_type, r.record_id, r.reference, r.label, r.amount_cents, r.state, r.at,
         r.expected_ledger, r.ledger_found,
         case r.direction when 'in' then 'NexG recorded this money coming in; the statement does not show it.'
                          else 'NexG recorded this money going out; the statement does not show it.' end
    from pg_temp.fin_stmt_rec r
   where r.listable and r.at >= v_lo and r.at < v_hi
     and not exists (select 1 from pg_temp.fin_stmt_taken t where t.grp = r.grp)
   order by r.grp, r.priority, r.at;

  -- 6. keep the rows' ids: change what changed, add what is new ──────────

  delete from public.fin_statement_match m
   where m.import_id = p_import_id
     and m.decided_at is null
     and not exists (
       select 1 from pg_temp.fin_stmt_res s
        where (m.line_id is not null and s.line_id = m.line_id)
           or (m.line_id is null and s.line_id is null
               and s.record_type = m.record_type and s.record_id = m.record_id));

  insert into public.fin_statement_match as m (
    import_id, line_id, result, rule, record_type, record_id, record_reference, record_label,
    record_amount_cents, record_state, record_at, expected_ledger, ledger_found, difference_cents, note)
  select p_import_id, s.line_id, s.result, s.rule, s.record_type, s.record_id, s.record_reference,
         s.record_label, s.record_amount_cents, s.record_state, s.record_at, s.expected_ledger,
         s.ledger_found, s.difference_cents, s.note
    from pg_temp.fin_stmt_res s
   where s.line_id is not null
  on conflict (line_id) where line_id is not null do update
     set result = excluded.result, rule = excluded.rule,
         record_type = excluded.record_type, record_id = excluded.record_id,
         record_reference = excluded.record_reference, record_label = excluded.record_label,
         record_amount_cents = excluded.record_amount_cents, record_state = excluded.record_state,
         record_at = excluded.record_at, expected_ledger = excluded.expected_ledger,
         ledger_found = excluded.ledger_found, difference_cents = excluded.difference_cents,
         note = excluded.note
   where m.decided_at is null;

  insert into public.fin_statement_match as m (
    import_id, line_id, result, rule, record_type, record_id, record_reference, record_label,
    record_amount_cents, record_state, record_at, expected_ledger, ledger_found, difference_cents, note)
  select p_import_id, null, s.result, s.rule, s.record_type, s.record_id, s.record_reference,
         s.record_label, s.record_amount_cents, s.record_state, s.record_at, s.expected_ledger,
         s.ledger_found, s.difference_cents, s.note
    from pg_temp.fin_stmt_res s
   where s.line_id is null
  on conflict (import_id, record_type, record_id) where line_id is null do update
     set result = excluded.result, record_reference = excluded.record_reference,
         record_label = excluded.record_label, record_amount_cents = excluded.record_amount_cents,
         record_state = excluded.record_state, record_at = excluded.record_at,
         expected_ledger = excluded.expected_ledger, ledger_found = excluded.ledger_found,
         note = excluded.note
   where m.decided_at is null;

  update public.fin_statement_import set matched_at = now() where id = p_import_id;

  select coalesce(jsonb_object_agg(g.result, g.n), '{}'::jsonb) into v_counts
    from (select m.result, count(*) as n
            from public.fin_statement_match m
           where m.import_id = p_import_id
           group by m.result) g;

  drop table if exists pg_temp.fin_stmt_rec, pg_temp.fin_stmt_kept, pg_temp.fin_stmt_taken,
    pg_temp.fin_stmt_res;

  return v_counts;
end;
$$;

comment on function public.fn_fin_statement_match(uuid) is
  'Matches an open statement import against NexG records. Re-runnable; keeps what people decided. Internal: called by the rpc_fin_statement_* writers.';

-- ═══════════════════════════════════════════════════════════════ writers

/*
 * Imports a statement the caller uploaded to finance-statements/<their id>/…
 * and matches it. p_lines are the server's own reading of the stored file:
 * one object per line with line_no, receipt, completed_at, initiated_at,
 * details, other_party, phone_tail, account_ref, status_text, reason_type,
 * direction (in|out), amount_cents, balance_cents, linked_receipt, kind and
 * raw (the row's cells). Returns {id, number, counts}.
 */
create or replace function public.rpc_fin_statement_import(
  p_source text,
  p_account_label text,
  p_period_from date,
  p_period_to date,
  p_file_path text,
  p_file_name text,
  p_file_sha256 text,
  p_size_bytes bigint,
  p_format text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_imp public.fin_statement_import;
  v_earlier text;
  v_bad_rows integer;
  v_bad_first integer;
  v_desc boolean;
  v_counts jsonb;
begin
  if p_source is null or p_source not in ('mpesa_paybill', 'mpesa_till', 'mpesa_b2c', 'bank') then
    raise exception 'Choose where the statement comes from.' using errcode = '22023';
  end if;
  if p_format is null or p_format not in ('mpesa', 'bank') or (p_format = 'bank') <> (p_source = 'bank') then
    raise exception 'This file is not laid out like a statement from that source.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_account_label, ''))) not between 2 and 120 then
    raise exception 'Name the account the statement is for.' using errcode = '22023';
  end if;
  if p_period_from is null or p_period_to is null or p_period_to < p_period_from
     or p_period_from > v_today then
    raise exception 'Choose the period the statement covers: a first day and a last day on or after it.'
      using errcode = '22023';
  end if;
  if p_period_to - p_period_from > 400 then
    raise exception 'Choose a period of a year or less.' using errcode = '22023';
  end if;
  if coalesce(p_file_sha256, '') !~ '^[0-9a-f]{64}$' or coalesce(p_size_bytes, 0) <= 0
     or length(btrim(coalesce(p_file_name, ''))) = 0 then
    raise exception 'The file could not be checked. Upload it again.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'The statement has no lines to import.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 20000 then
    raise exception 'Up to 20,000 lines per import: split the statement by date.' using errcode = '22023';
  end if;

  /* The file is one the caller uploaded into their own folder. */
  if p_file_path is null
     or (storage.foldername(p_file_path))[1] is distinct from (select auth.uid())::text
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'finance-statements' and o.name = p_file_path
          and coalesce((o.metadata ->> 'size')::bigint, p_size_bytes) = p_size_bytes) then
    raise exception 'The statement file did not arrive. Upload it again.' using errcode = 'P0002';
  end if;

  select i.number into v_earlier
    from public.fin_statement_import i
   where i.source = p_source and i.file_sha256 = p_file_sha256 and i.status <> 'void';
  if v_earlier is not null then
    raise exception 'This file was already imported as %.', v_earlier using errcode = '23505';
  end if;

  /* Every line readable: a row number, a time, in or out, an amount, a known kind. */
  select count(*), min(x.line_no)
    into v_bad_rows, v_bad_first
    from jsonb_to_recordset(p_lines) as x (
      line_no integer, completed_at timestamptz, direction text, amount_cents bigint, kind text)
   where x.line_no is null or x.line_no <= 0 or x.completed_at is null
      or x.direction is null or x.direction not in ('in', 'out')
      or x.amount_cents is null or x.amount_cents < 0
      or x.kind is null or x.kind not in (
        'collection', 'payout', 'charge', 'transfer', 'reversal', 'failed', 'other');
  if v_bad_rows > 0 then
    raise exception 'Row % of the file could not be read. Check the file and upload it again.',
      coalesce(v_bad_first::text, '?') using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct x.line_no)
        from jsonb_to_recordset(p_lines) as x (line_no integer)) then
    raise exception 'The same row of the file was sent twice. Upload it again.' using errcode = '22023';
  end if;

  insert into public.fin_statement_import (
    source, account_label, period_from, period_to, file_path, file_name, file_sha256,
    size_bytes, format, created_by)
  values (
    p_source, btrim(p_account_label), p_period_from, p_period_to, p_file_path,
    left(btrim(p_file_name), 200), p_file_sha256, p_size_bytes, p_format, v_staff)
  returning * into v_imp;

  insert into public.fin_statement_line (
    import_id, line_no, receipt, completed_at, initiated_at, details, other_party, phone_tail,
    account_ref, status_text, reason_type, direction, amount_cents, balance_cents,
    linked_receipt, kind, raw)
  select v_imp.id, x.line_no,
         left(nullif(regexp_replace(upper(coalesce(x.receipt, '')), '\s', '', 'g'), ''), 80),
         x.completed_at, x.initiated_at,
         left(public.fn_fin_mask_phones(nullif(btrim(x.details), '')), 500),
         left(public.fn_fin_mask_phones(nullif(btrim(x.other_party), '')), 200),
         case when x.phone_tail ~ '^[0-9]{3}$' then x.phone_tail end,
         left(nullif(public.fn_compact_reference(x.account_ref), ''), 80),
         left(nullif(btrim(x.status_text), ''), 40),
         left(nullif(btrim(x.reason_type), ''), 120),
         x.direction, x.amount_cents, x.balance_cents,
         left(nullif(regexp_replace(upper(coalesce(x.linked_receipt, '')), '\s', '', 'g'), ''), 80),
         x.kind,
         coalesce((
           select jsonb_agg(to_jsonb(left(public.fn_fin_mask_phones(c.cell), 500)) order by c.n)
             from jsonb_array_elements_text(
                    case when jsonb_typeof(x.raw) = 'array' then x.raw else '[]'::jsonb end)
                  with ordinality as c (cell, n)), '[]'::jsonb)
    from jsonb_to_recordset(p_lines) as x (
      line_no integer, receipt text, completed_at timestamptz, initiated_at timestamptz,
      details text, other_party text, phone_tail text, account_ref text, status_text text,
      reason_type text, direction text, amount_cents bigint, balance_cents bigint,
      linked_receipt text, kind text, raw jsonb);

  /* M-PESA prints the newest line first, most banks the oldest: the file's
     own order breaks ties between lines completed in the same second. */
  v_desc := coalesce(
    (select l.completed_at from public.fin_statement_line l
      where l.import_id = v_imp.id order by l.line_no limit 1)
    > (select l.completed_at from public.fin_statement_line l
        where l.import_id = v_imp.id order by l.line_no desc limit 1), false);

  update public.fin_statement_import i
     set line_count = t.n,
         paid_in_cents = t.paid_in,
         withdrawn_cents = t.withdrawn,
         opening_balance_cents = (
           select l.balance_cents - case l.direction when 'in' then l.amount_cents else -l.amount_cents end
             from public.fin_statement_line l
            where l.import_id = v_imp.id and l.balance_cents is not null and l.kind <> 'failed'
            order by l.completed_at, case when v_desc then -l.line_no else l.line_no end
            limit 1),
         closing_balance_cents = (
           select l.balance_cents
             from public.fin_statement_line l
            where l.import_id = v_imp.id and l.balance_cents is not null and l.kind <> 'failed'
            order by l.completed_at desc, case when v_desc then l.line_no else -l.line_no end
            limit 1)
    from (select count(*)::integer as n,
                 coalesce(sum(l.amount_cents) filter (where l.direction = 'in' and l.kind <> 'failed'), 0) as paid_in,
                 coalesce(sum(l.amount_cents) filter (where l.direction = 'out' and l.kind <> 'failed'), 0) as withdrawn
            from public.fin_statement_line l
           where l.import_id = v_imp.id) t
   where i.id = v_imp.id
  returning i.* into v_imp;

  v_counts := coalesce(public.fn_fin_statement_match(v_imp.id), '{}'::jsonb);

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.statement_imported',
    p_actor_id => v_staff,
    p_target_type => 'fin_statement_import', p_target_id => v_imp.id,
    p_target_label => v_imp.number || ' · ' || v_imp.account_label,
    p_after => jsonb_build_object(
      'source', v_imp.source, 'account_label', v_imp.account_label,
      'period_from', v_imp.period_from, 'period_to', v_imp.period_to,
      'file_name', v_imp.file_name, 'file_sha256', v_imp.file_sha256,
      'lines', v_imp.line_count, 'paid_in_cents', v_imp.paid_in_cents,
      'withdrawn_cents', v_imp.withdrawn_cents, 'results', v_counts));

  return jsonb_build_object('id', v_imp.id, 'number', v_imp.number, 'counts', v_counts);
end;
$$;

/*
 * Resolves one item of an open reconciliation:
 *   match    a statement line is this NexG record (p_record_type, p_record_id),
 *            with a note saying why
 *   confirm  a suggested match is right
 *   explain  an item that does not match is accounted for, with a note
 * Then the rest is matched again around the decision.
 */
create or replace function public.rpc_fin_statement_resolve(
  p_match_id uuid,
  p_action text,
  p_record_type text default null,
  p_record_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_note text := nullif(btrim(p_note), '');
  v_old public.fin_statement_match;
  v_new public.fin_statement_match;
  v_imp public.fin_statement_import;
  v_line public.fin_statement_line;
  v_rec record;
  v_amount_ok boolean;
begin
  if p_action is null or p_action not in ('match', 'confirm', 'explain') then
    raise exception 'Choose Match, Confirm or Explain.' using errcode = '22023';
  end if;
  if p_action in ('match', 'explain') and v_note is null then
    raise exception 'Add a note saying why.' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  select * into v_old from public.fin_statement_match where id = p_match_id;
  if v_old.id is null then
    raise exception 'That item is no longer on the list. Reload the page.' using errcode = 'P0002';
  end if;
  select * into v_imp from public.fin_statement_import where id = v_old.import_id for update;
  if v_imp.status <> 'open' then
    raise exception 'This reconciliation is % and can no longer change.', v_imp.status
      using errcode = '23514';
  end if;
  select * into v_old from public.fin_statement_match where id = p_match_id for update;
  if v_old.decided_at is not null then
    raise exception 'Someone has already resolved this item.' using errcode = '23514';
  end if;
  if v_old.line_id is not null then
    select * into v_line from public.fin_statement_line where id = v_old.line_id;
  end if;

  if p_action = 'match' then
    if v_line.id is null then
      raise exception 'Match a statement line to a record. A record the statement does not show is explained.'
        using errcode = '22023';
    end if;
    if v_old.result in ('charge', 'ignored') then
      raise exception 'Nothing to match: this line moved no money of NexG''s own.' using errcode = '23514';
    end if;
    if p_record_type is null or p_record_id is null then
      raise exception 'Choose the NexG record.' using errcode = '22023';
    end if;
    select r.* into v_rec
      from public.fn_fin_statement_records(
             v_imp.source, v_line.completed_at - interval '60 days',
             v_line.completed_at + interval '60 days', array[v_line.receipt]) r
     where r.record_type = p_record_type and r.record_id = p_record_id
     order by r.opened_at nulls first
     limit 1;
    if not found then
      raise exception 'That record cannot be matched to this statement.' using errcode = 'P0002';
    end if;
    if v_rec.direction <> v_line.direction then
      raise exception 'That record moved money the other way.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.fin_statement_match m
       where m.import_id = v_imp.id and m.id <> v_old.id and m.line_id is not null
         and m.decided_at is not null
         and m.record_type = p_record_type and m.record_id = p_record_id) then
      raise exception 'That record is already matched to another line.' using errcode = '23505';
    end if;
    v_amount_ok := case when v_imp.source like 'mpesa\_%'
                        then v_line.amount_cents in (ceil(v_rec.amount_cents / 100.0)::bigint * 100,
                                                     floor(v_rec.amount_cents / 100.0)::bigint * 100)
                        else v_line.amount_cents = v_rec.amount_cents end;

    update public.fin_statement_match
       set result = 'matched', rule = 'manual',
           record_type = v_rec.record_type, record_id = v_rec.record_id,
           record_reference = v_rec.reference, record_label = v_rec.label,
           record_amount_cents = v_rec.amount_cents, record_state = v_rec.state,
           record_at = v_rec.at, expected_ledger = v_rec.expected_ledger,
           ledger_found = v_rec.ledger_found,
           difference_cents = case when coalesce(v_amount_ok, false) then 0
                                   else v_line.amount_cents - v_rec.amount_cents end,
           note = v_note, decided_by = v_staff, decided_at = now()
     where id = v_old.id
    returning * into v_new;

    /* The same record may not also be listed as missing from the statement. */
    delete from public.fin_statement_match m
     where m.import_id = v_imp.id and m.line_id is null and m.decided_at is null
       and m.record_type = v_rec.record_type and m.record_id = v_rec.record_id;

  elsif p_action = 'confirm' then
    if v_old.result <> 'suggested' then
      raise exception 'Only a suggested match can be confirmed.' using errcode = '23514';
    end if;
    update public.fin_statement_match
       set result = 'matched', note = coalesce(v_note, note),
           decided_by = v_staff, decided_at = now()
     where id = v_old.id
    returning * into v_new;

  else
    if v_old.result not in ('suggested', 'amount_differs', 'state_differs', 'not_in_nexg',
                            'not_on_statement', 'duplicate') then
      raise exception 'Only an item that does not match is explained.' using errcode = '23514';
    end if;
    /* Explaining a suggestion away lets its record go: it may be another
       line's, or missing from the statement. A record that differs stays. */
    update public.fin_statement_match m
       set result = 'explained', note = v_note, decided_by = v_staff, decided_at = now(),
           rule = case when v_old.result = 'suggested' then null else m.rule end,
           record_type = case when v_old.result = 'suggested' then null else m.record_type end,
           record_id = case when v_old.result = 'suggested' then null else m.record_id end,
           record_reference = case when v_old.result = 'suggested' then null else m.record_reference end,
           record_label = case when v_old.result = 'suggested' then null else m.record_label end,
           record_amount_cents = case when v_old.result = 'suggested' then null else m.record_amount_cents end,
           record_state = case when v_old.result = 'suggested' then null else m.record_state end,
           record_at = case when v_old.result = 'suggested' then null else m.record_at end,
           expected_ledger = case when v_old.result = 'suggested' then null else m.expected_ledger end,
           ledger_found = case when v_old.result = 'suggested' then null else m.ledger_found end,
           difference_cents = case when v_old.result = 'suggested' then null else m.difference_cents end
     where m.id = v_old.id
    returning * into v_new;
  end if;

  perform public.fn_fin_statement_match(v_imp.id);

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => case p_action
                  when 'match' then 'finance.statement_line_matched'
                  when 'confirm' then 'finance.statement_suggestion_confirmed'
                  else 'finance.statement_item_explained' end,
    p_actor_id => v_staff,
    p_target_type => 'fin_statement_match', p_target_id => v_new.id,
    p_target_label => v_imp.number
      || coalesce(' · ' || v_line.receipt, ' · row ' || v_line.line_no, ' · ' || v_new.record_reference, ''),
    p_before => jsonb_build_object('result', v_old.result, 'record_type', v_old.record_type,
                                   'record_id', v_old.record_id),
    p_after => jsonb_build_object('result', v_new.result, 'record_type', v_new.record_type,
                                  'record_id', v_new.record_id,
                                  'difference_cents', v_new.difference_cents,
                                  'import_id', v_imp.id),
    p_reason => v_note);

  return jsonb_build_object('id', v_new.id, 'result', v_new.result);
end;
$$;

/* Closes a reconciliation once nothing on it is left open. */
create or replace function public.rpc_fin_statement_close(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_statement_import;
  v_new public.fin_statement_import;
  v_open integer;
  v_counts jsonb;
begin
  select * into v_old from public.fin_statement_import where id = p_import_id for update;
  if v_old.id is null then
    raise exception 'That reconciliation no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status <> 'open' then
    raise exception 'Only an open reconciliation can be closed.' using errcode = '23514';
  end if;

  /* Against NexG's records as they are now. */
  v_counts := public.fn_fin_statement_match(p_import_id);

  select count(*) into v_open
    from public.fin_statement_match m
   where m.import_id = p_import_id and m.decided_at is null
     and m.result in ('suggested', 'amount_differs', 'state_differs', 'not_in_nexg',
                      'not_on_statement', 'duplicate');
  if v_open > 0 then
    raise exception '% item(s) are still open. Match, confirm or explain each one first.', v_open
      using errcode = '23514';
  end if;

  update public.fin_statement_import
     set status = 'closed', closed_by = v_staff, closed_at = now()
   where id = p_import_id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.statement_closed',
    p_actor_id => v_staff,
    p_target_type => 'fin_statement_import', p_target_id => p_import_id,
    p_target_label => v_new.number || ' · ' || v_new.account_label,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', v_new.status, 'lines', v_new.line_count,
                                  'paid_in_cents', v_new.paid_in_cents,
                                  'withdrawn_cents', v_new.withdrawn_cents, 'results', v_counts));
end;
$$;

/* Voids an import (the wrong file, source or period), with a reason. The
   same file can then be imported again. */
create or replace function public.rpc_fin_statement_void(p_import_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_reason text := nullif(btrim(p_reason), '');
  v_old public.fin_statement_import;
begin
  if v_reason is null then
    raise exception 'Say why it is voided.' using errcode = '22023';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1,000 characters.' using errcode = '22023';
  end if;
  select * into v_old from public.fin_statement_import where id = p_import_id for update;
  if v_old.id is null then
    raise exception 'That reconciliation no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status = 'void' then
    raise exception 'This reconciliation is already void.' using errcode = '23514';
  end if;

  update public.fin_statement_import
     set status = 'void', closed_by = v_staff, closed_at = now(), note = v_reason
   where id = p_import_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.statement_voided',
    p_actor_id => v_staff,
    p_target_type => 'fin_statement_import', p_target_id => p_import_id,
    p_target_label => v_old.number || ' · ' || v_old.account_label,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', 'void', 'file_sha256', v_old.file_sha256),
    p_reason => v_reason);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ readers

/*
 * Imports whose period overlaps p_from..p_to, and every open one whatever
 * its period, newest first, with what their matching came to. JSON so the
 * list is not cut at the API's row limit.
 */
create or replace function public.rpc_fin_statement_imports(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_finance_period_check(p_from, p_to);
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select i.id, i.number, i.source, i.account_label, i.period_from, i.period_to,
               i.file_name, i.format, i.line_count, i.paid_in_cents, i.withdrawn_cents,
               i.opening_balance_cents, i.closing_balance_cents, i.status, i.note,
               i.created_at, i.matched_at, i.closed_at,
               coalesce(cb.display_name, cb.email) as created_by_name,
               coalesce(c.counts, '{}'::jsonb) as counts,
               coalesce(t.open_count, 0) as open_count,
               coalesce(t.unmatched_cents, 0) as unmatched_cents,
               coalesce(t.matched_lines, 0) as matched_lines,
               coalesce(t.countable_lines, 0) as countable_lines
          from public.fin_statement_import i
          left join public.staff_user cb on cb.id = i.created_by
          left join lateral (
            select jsonb_object_agg(g.result, g.n) as counts
              from (select m.result, count(*) as n
                      from public.fin_statement_match m
                     where m.import_id = i.id
                     group by m.result) g
          ) c on true
          left join lateral (
            select count(*) filter (where m.decided_at is null and m.result in (
                     'suggested', 'amount_differs', 'state_differs', 'not_in_nexg',
                     'not_on_statement', 'duplicate')) as open_count,
                   coalesce(sum(case when m.result = 'amount_differs' then abs(coalesce(m.difference_cents, 0))
                                     else coalesce(l.amount_cents, m.record_amount_cents, 0) end)
                              filter (where m.decided_at is null and m.result in (
                                'suggested', 'amount_differs', 'state_differs', 'not_in_nexg',
                                'not_on_statement', 'duplicate')), 0) as unmatched_cents,
                   count(*) filter (where m.line_id is not null and m.result = 'matched') as matched_lines,
                   count(*) filter (where m.line_id is not null and m.result not in ('charge', 'ignored'))
                     as countable_lines
              from public.fin_statement_match m
              left join public.fin_statement_line l on l.id = m.line_id
             where m.import_id = i.id
          ) t on true
         where (i.period_from <= p_to and i.period_to >= p_from) or i.status = 'open'
      ) x), '[]'::jsonb);
end;
$$;

comment on function public.rpc_fin_statement_imports(date, date) is
  'Finance: statement imports overlapping a period, and every open one, with their match counts, as JSON. Reads only.';

/* One import: its header, totals per result, and every line with its match
   (plus the NexG records the statement does not show), as JSON. */
create or replace function public.rpc_fin_statement_detail(p_import_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_imp public.fin_statement_import;
begin
  if not authz.finance_reads() then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  select * into v_imp from public.fin_statement_import where id = p_import_id;
  if v_imp.id is null then
    raise exception 'That reconciliation does not exist.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'import', to_jsonb(v_imp) || jsonb_build_object(
      'created_by_name', (select coalesce(s.display_name, s.email) from public.staff_user s
                           where s.id = v_imp.created_by),
      'closed_by_name', (select coalesce(s.display_name, s.email) from public.staff_user s
                          where s.id = v_imp.closed_by)),
    'totals', coalesce((
      select jsonb_object_agg(g.result, jsonb_build_object('n', g.n, 'cents', g.cents))
        from (select m.result, count(*) as n,
                     coalesce(sum(coalesce(l.amount_cents, m.record_amount_cents, 0)), 0) as cents
                from public.fin_statement_match m
                left join public.fin_statement_line l on l.id = m.line_id
               where m.import_id = p_import_id
               group by m.result) g), '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'match_id', m.id, 'line_id', l.id, 'line_no', l.line_no, 'receipt', l.receipt,
               'completed_at', l.completed_at, 'details', l.details, 'other_party', l.other_party,
               'account_ref', l.account_ref, 'reason_type', l.reason_type,
               'status_text', l.status_text, 'kind', l.kind,
               'direction', coalesce(l.direction,
                 case when m.record_type in ('payment', 'payment_prompt', 'paybill_event',
                                             'cash_deposit', 'rider_kit', 'plan')
                      then 'in' else 'out' end),
               'amount_cents', l.amount_cents, 'balance_cents', l.balance_cents,
               'linked_receipt', l.linked_receipt,
               'result', m.result, 'rule', m.rule, 'record_type', m.record_type,
               'record_id', m.record_id, 'record_reference', m.record_reference,
               'record_label', m.record_label, 'record_amount_cents', m.record_amount_cents,
               'record_state', m.record_state, 'record_at', m.record_at,
               'expected_ledger', m.expected_ledger, 'ledger_found', m.ledger_found,
               'difference_cents', m.difference_cents, 'note', m.note,
               'decided_at', m.decided_at, 'decided_by_name', coalesce(s.display_name, s.email))
             order by l.line_no nulls last, m.record_at, m.id)
        from public.fin_statement_match m
        left join public.fin_statement_line l on l.id = m.line_id
        left join public.staff_user s on s.id = m.decided_by
       where m.import_id = p_import_id), '[]'::jsonb));
end;
$$;

comment on function public.rpc_fin_statement_detail(uuid) is
  'Finance: one statement import with every line and what it matched, as JSON. Reads only.';

/*
 * NexG records a statement line could be matched to by hand: the same
 * direction of money, three days either side ranked by how close the amount
 * and time are, or, with a search, anything within sixty days whose
 * reference, receipt or description contains it. Up to 25.
 */
create or replace function public.rpc_fin_statement_find(p_match_id uuid, p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_match public.fin_statement_match;
  v_line public.fin_statement_line;
  v_imp public.fin_statement_import;
  v_days integer;
begin
  if not authz.finance_reads() then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  select * into v_match from public.fin_statement_match where id = p_match_id;
  if v_match.id is null or v_match.line_id is null then
    raise exception 'Choose a statement line to match.' using errcode = 'P0002';
  end if;
  select * into v_line from public.fin_statement_line where id = v_match.line_id;
  select * into v_imp from public.fin_statement_import where id = v_match.import_id;
  v_days := case when v_q is null then 3 else 60 end;

  return coalesce((
    select jsonb_agg(to_jsonb(c) order by c.amount_gap, c.time_gap)
      from (
        select r.record_type, r.record_id, r.reference, r.label, r.receipt, r.amount_cents,
               r.state, r.at, r.expected_ledger, r.ledger_found,
               abs(v_line.amount_cents - coalesce(r.amount_cents, 0)) as amount_gap,
               abs(extract(epoch from (r.at - v_line.completed_at)))::bigint as time_gap,
               (select l2.line_no
                  from public.fin_statement_match m2
                  join public.fin_statement_line l2 on l2.id = m2.line_id
                 where m2.import_id = v_imp.id and m2.line_id <> v_line.id
                   and m2.record_type = r.record_type and m2.record_id = r.record_id
                 limit 1) as matched_to_row
          from (
            select distinct on (x.record_type, x.record_id) x.*
              from public.fn_fin_statement_records(
                     v_imp.source,
                     v_line.completed_at - make_interval(days => v_days),
                     v_line.completed_at + make_interval(days => v_days), '{}') x
             where x.direction = v_line.direction
               and (v_q is null
                    or strpos(lower(coalesce(x.reference, '') || ' ' || coalesce(x.label, '') || ' '
                                    || coalesce(x.receipt, '')), lower(v_q)) > 0)
             order by x.record_type, x.record_id, x.opened_at nulls first
          ) r
         order by abs(v_line.amount_cents - coalesce(r.amount_cents, 0)),
                  abs(extract(epoch from (r.at - v_line.completed_at)))
         limit 25
      ) c), '[]'::jsonb);
end;
$$;

comment on function public.rpc_fin_statement_find(uuid, text) is
  'Finance: NexG records a statement line could be matched to by hand, as JSON. Reads only.';

-- ═══════════════════════════════════════════════════════════════ grants

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'rpc\_fin\_statement\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

revoke execute on function public.fn_fin_statement_match(uuid) from public, anon, authenticated;
revoke execute on function public.fn_fin_statement_records(text, timestamptz, timestamptz, text[])
  from public, anon, authenticated;
revoke execute on function public.fn_fin_mask_phones(text) from public, anon, authenticated;
grant execute on function public.fn_fin_statement_match(uuid) to service_role;
grant execute on function public.fn_fin_statement_records(text, timestamptz, timestamptz, text[])
  to service_role;
grant execute on function public.fn_fin_mask_phones(text) to service_role;

notify pgrst, 'reload schema';
