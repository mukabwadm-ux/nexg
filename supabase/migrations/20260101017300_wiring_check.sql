-- The wiring check.
--
-- The integration prompt's first rule is that every cross-module
-- effect goes through exactly one registered contract, and that
-- CI fails when something is not in the registry. Most of that
-- prompt describes infrastructure this repository does not have
-- — NATS, four extracted services, Redis, Temporal — and a
-- registry of things that do not exist is a document, not a
-- check.
--
-- What it can have today is the enforcement half: a set of
-- questions asked of the live schema, each of which fails CI,
-- each of which is about a way this system could quietly stop
-- being safe. The schema is the integration layer here, so the
-- schema is what gets checked.
--
-- It found five real holes on the first run. They are fixed in
-- the migration after this one; this is the thing that found
-- them and will find the next ones.

-- ═══════════════════════════════════════ what anon may call
--
-- Supabase grants EXECUTE on every new function in `public` to
-- `anon`, and `security definer` means the function runs as its
-- owner with RLS bypassed. The two together mean the anon key —
-- which ships inside the browser bundle, by design — can invoke
-- 198 functions that write.
--
-- Most have their own `authz` guard and refuse. That is not the
-- same as being unreachable, and "most" is not a security
-- property. This table makes the exception list explicit: a
-- function anon may call is a decision somebody made, with a
-- reason, not a default nobody noticed.

create table if not exists wiring_anon_allow (
  function_name text primary key,
  reason text not null,
  /* How the call is authorised *inside* the function, since the
     grant no longer does it. A blank here is the finding. */
  guarded_by text not null,
  added_at timestamptz not null default now(),

  constraint allow_says_why check (coalesce(trim(reason), '') <> ''),
  constraint allow_says_how check (coalesce(trim(guarded_by), '') <> '')
);

comment on table wiring_anon_allow is
  'Functions the anonymous key may execute, each with why and with what guards the call instead of the grant. Anything anon can execute and is not listed here is a finding.';

alter table wiring_anon_allow enable row level security;
create policy wiring_anon_allow_read on wiring_anon_allow
  for select to authenticated using (authz.staff_id() is not null);

insert into wiring_anon_allow (function_name, reason, guarded_by) values
  -- Onboarding, before anybody has an account.
  ('rpc_merchant_start',            'Begins a merchant application from the public site', 'resume token issued to the applicant'),
  ('rpc_merchant_save_step',        'Applicant saves their own draft',                    'resume token'),
  ('rpc_merchant_resume_token',     'Applicant asks for a link back to their draft',      'sent to the phone on the draft'),
  ('rpc_merchant_resume_claim',     'Applicant returns via that link',                    'single-use token'),
  ('rpc_merchant_request_phone_code','Applicant verifies their own phone',                'rate-limited code to that number'),
  ('rpc_merchant_verify_phone_code','Applicant enters the code',                          'code matches the draft'),
  ('rpc_merchant_set_category',     'Applicant fills their own draft',                    'resume token'),
  ('rpc_merchant_set_branches',     'Applicant fills their own draft',                    'resume token'),
  ('rpc_merchant_declare_fleet',    'Applicant fills their own draft',                    'resume token'),
  ('rpc_merchant_submit',           'Applicant submits their own draft',                  'resume token'),
  ('rpc_merchant_waitlist',         'Somebody in a city we have not launched leaves a note', 'writes only a waitlist row'),
  ('rpc_rider_start',               'Begins a rider application from the public site',    'resume token issued to the applicant'),
  ('rpc_rider_save_step',           'Applicant saves their own draft',                    'resume token'),
  ('rpc_rider_resume_token',        'Applicant asks for a link back to their draft',      'sent to the phone on the draft'),
  ('rpc_rider_resume_claim',        'Applicant returns via that link',                    'single-use token'),
  ('rpc_rider_request_phone_code',  'Applicant verifies their own phone',                 'rate-limited code to that number'),
  ('rpc_rider_verify_phone_code',   'Applicant enters the code',                          'code matches the draft'),
  ('rpc_rider_set_vehicle',         'Applicant fills their own draft',                    'resume token'),
  ('rpc_rider_submit',              'Applicant submits their own draft',                  'resume token'),
  ('rpc_rider_waitlist',            'Somebody in a city we have not launched leaves a note', 'writes only a waitlist row'),
  ('rpc_rider_apply',               'Short public application form',                      'writes only an application row'),
  ('rpc_document_submit',           'Applicant uploads their own document',               'resume token and a path owned by the draft'),
  ('rpc_document_request_via_whatsapp','Applicant asks for the upload link again',        'sent to the number on the draft'),

  -- Careers, which is a public job board.
  ('rpc_careers_apply',  'Public job application',                       'writes only an application row'),
  ('rpc_job_apply',      'Public job application',                       'writes only an application row'),
  ('rpc_careers_status', 'Candidate checks their own application',       'single-use status token'),
  ('rpc_careers_notice', 'Candidate reads the privacy notice',           'reads published text only'),

  -- Hosts and stays.
  ('rpc_host_apply',          'Public host application',                 'writes only an application row'),
  ('rpc_stay_request_create', 'Public enquiry about a stay',             'writes only an enquiry row'),

  -- The guest surfaces.
  ('rpc_msg_contact',       'The website contact form',                  'writes one conversation, reads nothing back'),
  ('rpc_resolve_location',  'Works out where to deliver on page load',   'reads only; no caller identity needed'),
  ('rpc_coverage_lookup',   'Answers whether we deliver to a point',     'reads only'),
  ('rpc_location_event',    'Records that we asked for a location',      'writes an analytics row with no coordinates'),
  ('rpc_note_locale',       'Counts which languages people arrive in',   'writes a counter'),
  ('rpc_resolve_qr',        'Resolves a QR card to a property',          'the code is the credential'),
  ('rpc_qr_card',           'Renders a QR card',                         'the code is the credential'),

  -- Payments, called by our own route handlers.
  ('rpc_payment_webhook',   'Paystack calls this',                       'provider signature checked inside'),
  ('rpc_payment_authorised','Our checkout confirms an authorisation',    'caller must own the order'),
  ('rpc_payment_begin_order','Our checkout starts a payment',            'caller must own the order'),
  ('rpc_payment_begin_featured','A merchant pays for a placement',       'caller must own the booking')
on conflict (function_name) do nothing;

-- ═════════════════════════════════════════════ the check itself

create or replace function fn_wiring_check()
returns table (
  rule text,
  severity text,
  finding text,
  detail text
)
language sql
stable
security definer
set search_path = ''
as $$
  /*
   * Every public table has row-level security.
   *
   * Not every table needs a policy — a reference table that
   * everybody may read is fine — but RLS off means the policies
   * that do exist are not consulted at all, which is the
   * failure that looks like working software.
   */
  select
    'rls_enabled', 'critical',
    'Row-level security is off on public.' || t.tablename,
    'Policies on this table are not consulted. Enable RLS, then decide the policy.'
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where t.schemaname = 'public' and not c.relrowsecurity

  union all

  /*
   * Anything the anonymous key can execute, that writes, and
   * that nobody decided should be public.
   */
  select
    'anon_execute', 'critical',
    'anon may execute public.' || p.proname,
    'It is security definer and it writes. Either revoke it from anon, or add it to wiring_anon_allow with a reason.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.prosrc ~* '(insert into|update |delete from)'
    and p.proname not like 'tg\_%'
    and not exists (
      select 1 from public.wiring_anon_allow a where a.function_name = p.proname)

  union all

  /*
   * A state change nobody can account for.
   *
   * The audit prompt's rule is that every RPC that changes
   * something calls `audit.log` in the same transaction. The
   * ones that do not are not a logging gap — they are actions
   * that happened and cannot be attributed to anybody.
   */
  select
    'audit_log', 'warning',
    'public.' || p.proname || ' changes state without calling audit.log',
    'An action nobody can be shown to have taken. Add audit.log in the same transaction.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname like 'rpc\_%'
    and p.prosrc ~* '(insert into|update |delete from)'
    and p.prosrc !~* 'audit\.log'
    /* Reads dressed as writes: these touch a cache or a counter
       and are not decisions anybody audits. */
    and p.proname not in ('rpc_note_locale', 'rpc_translations_put', 'rpc_location_event')

  union all

  /*
   * Money as a float.
   *
   * Zero today, and the check exists so it stays zero. A
   * `double precision` column holding shillings is a rounding
   * error that compounds silently and shows up as a settlement
   * that will not balance.
   */
  select
    'money_float', 'critical',
    c.table_name || '.' || c.column_name || ' holds money as ' || c.data_type,
    'Money is integer minor units everywhere. A float here will not reconcile.'
  from information_schema.columns c
  where c.table_schema = 'public'
    and (c.column_name like '%\_cents' or c.column_name like '%\_kes'
         or c.column_name like '%amount%' or c.column_name like '%price%')
    and c.data_type in ('double precision', 'real')

  union all

  /*
   * A definer function with no search_path.
   *
   * Without `set search_path = ''` a definer function resolves
   * unqualified names against the caller's path, so a caller
   * who can create a table in a schema earlier on that path
   * decides what the function actually touches.
   */
  select
    'definer_search_path', 'critical',
    'public.' || p.proname || ' is security definer with no fixed search_path',
    'Qualify everything and add: set search_path = ''''.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
       where cfg like 'search_path=%')
$$;

comment on function fn_wiring_check is
  'Asks the live schema the questions CI should fail on. Each rule is a way this system could quietly stop being safe; the schema is the integration layer here, so the schema is what gets checked.';

revoke execute on function fn_wiring_check() from public, anon;
grant execute on function fn_wiring_check() to authenticated;

create or replace view wiring_health_v
with (security_invoker = true) as
select
  rule,
  severity,
  count(*)::integer as findings
from public.fn_wiring_check()
group by rule, severity;

grant select on wiring_health_v to authenticated;
