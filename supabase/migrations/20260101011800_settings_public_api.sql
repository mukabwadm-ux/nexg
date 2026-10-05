-- The console stops depending on a dashboard setting.
--
-- `settings` and `audit` are separate schemas on purpose, and
-- PostgREST will not serve a schema that is not in the project's
-- exposed list — which is a dashboard field, not something a
-- migration can set. So shipping either console left a manual step
-- that, until somebody does it, makes the module look broken in a
-- particular and nasty way: every read returns nothing rather than
-- an error, so the Settings page renders with every control locked
-- and no explanation, and the Audit page shows an empty log.
--
-- Two modules have now needed that step. Rather than ask a third
-- time, the surface moves into `public`, which is served by default:
-- named views and named functions, one per thing the console
-- actually uses. The schemas themselves stay closed.
--
-- This is the same answer the careers build arrived at for `hr`, and
-- for the same reason — enumerating what may be reached is a much
-- easier property to check than a pile of grants plus a dashboard
-- field somebody has to remember.

-- ═══════════════════════════════════ settings, through public

create or replace view public.settings_city_v
with (security_invoker = true) as select * from settings.city_v;

create or replace view public.settings_zone_v
with (security_invoker = true) as select * from settings.zone_v;

create or replace view public.settings_pricing_v
with (security_invoker = true) as select * from settings.pricing_v;

create or replace view public.settings_dispatch_v
with (security_invoker = true) as select * from settings.dispatch_v;

create or replace view public.settings_settlement_v
with (security_invoker = true) as select * from settings.settlement_v;

create or replace view public.settings_legal_v
with (security_invoker = true) as select * from settings.legal_v;

create or replace view public.settings_definition_v
with (security_invoker = true) as select * from settings.console_definition_v;

create or replace view public.settings_scheduled_v
with (security_invoker = true) as select * from settings.console_scheduled_v;

grant select on
  public.settings_city_v, public.settings_zone_v, public.settings_pricing_v,
  public.settings_dispatch_v, public.settings_settlement_v, public.settings_legal_v,
  public.settings_definition_v, public.settings_scheduled_v
  to authenticated;

/*
 * The write path. Each one is a pass-through: the rule — who may
 * edit, which keys can never be immediate, that the approver is a
 * different person — stays in the `settings` function, so these add
 * a name and nothing else.
 */
create or replace function public.rpc_settings_may_edit(p_group text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select settings.fn_may_edit(p_group) $$;

create or replace function public.rpc_settings_open(p_group text, p_city_id uuid default null)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_change_set_open(p_group, p_city_id) $$;

create or replace function public.rpc_settings_put(
  p_change_set uuid, p_key text, p_value jsonb,
  p_city_id uuid default null, p_zone_id uuid default null, p_category text default null)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_change_set_put(p_change_set, p_key, p_value, p_city_id, p_zone_id, p_category) $$;

create or replace function public.rpc_settings_discard(p_change_set uuid)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_change_set_discard(p_change_set) $$;

create or replace function public.rpc_settings_submit(
  p_change_set uuid, p_effective_from timestamptz default null,
  p_immediate boolean default false, p_reason text default null)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_change_set_submit(p_change_set, p_effective_from, p_immediate, p_reason) $$;

create or replace function public.rpc_settings_approve(p_change_set uuid)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_change_set_approve(p_change_set) $$;

create or replace function public.rpc_settings_reject(p_change_set uuid, p_reason text)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_change_set_reject(p_change_set, p_reason) $$;

create or replace function public.rpc_settings_rollback(p_version_id uuid, p_reason text)
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.rpc_rollback(p_version_id, p_reason) $$;

create or replace function public.rpc_settings_activate()
returns jsonb
language sql security definer set search_path = ''
as $$ select settings.cron_activate() $$;

create or replace function public.rpc_settings_compare(
  p_city_a uuid, p_city_b uuid, p_group text default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select settings.rpc_compare(p_city_a, p_city_b, p_group) $$;

grant execute on function public.rpc_settings_may_edit(text) to authenticated;
grant execute on function public.rpc_settings_open(text, uuid) to authenticated;
grant execute on function public.rpc_settings_put(uuid, text, jsonb, uuid, uuid, text) to authenticated;
grant execute on function public.rpc_settings_discard(uuid) to authenticated;
grant execute on function public.rpc_settings_submit(uuid, timestamptz, boolean, text) to authenticated;
grant execute on function public.rpc_settings_approve(uuid) to authenticated;
grant execute on function public.rpc_settings_reject(uuid, text) to authenticated;
grant execute on function public.rpc_settings_rollback(uuid, text) to authenticated;
grant execute on function public.rpc_settings_activate() to authenticated;
grant execute on function public.rpc_settings_compare(uuid, uuid, text) to authenticated;

-- ══════════════════════════════════════ audit, through public

create or replace view public.audit_activity_v
with (security_invoker = true) as select * from audit.console_activity_v;

create or replace view public.audit_health_v
with (security_invoker = true) as select * from audit.console_health_v;

create or replace view public.audit_module_v
with (security_invoker = true) as select * from audit.console_module_v;

create or replace view public.audit_sign_in_v
with (security_invoker = true) as select * from audit.console_sign_in_v;

create or replace view public.audit_alert_v
with (security_invoker = true) as select * from audit.console_alert_v;

create or replace view public.audit_break_glass_v
with (security_invoker = true) as select * from audit.console_break_glass_v;

create or replace view public.audit_money_v
with (security_invoker = true) as select * from audit.console_money_v;

create or replace view public.audit_data_access_v
with (security_invoker = true) as select * from audit.console_data_access_v;

create or replace view public.audit_export_v
with (security_invoker = true) as select * from audit.console_export_v;

create or replace view public.audit_evidence_v
with (security_invoker = true) as select * from audit.console_evidence_v;

create or replace view public.audit_retention_v
with (security_invoker = true) as select * from audit.console_retention_v;

create or replace view public.audit_legal_hold_v
with (security_invoker = true) as select * from audit.console_legal_hold_v;

grant select on
  public.audit_activity_v, public.audit_health_v, public.audit_module_v,
  public.audit_sign_in_v, public.audit_alert_v, public.audit_break_glass_v,
  public.audit_money_v, public.audit_data_access_v, public.audit_export_v,
  public.audit_evidence_v, public.audit_retention_v, public.audit_legal_hold_v
  to authenticated;

create or replace function public.rpc_audit_review_event(
  p_event_id bigint, p_state text, p_note text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_review_event(p_event_id, p_state, p_note) $$;

create or replace function public.rpc_audit_alert_act(
  p_alert_id uuid, p_action text, p_note text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_alert_act(p_alert_id, p_action, p_note) $$;

create or replace function public.rpc_audit_revoke_sessions(p_staff_user_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_revoke_sessions(p_staff_user_id, p_reason) $$;

create or replace function public.rpc_audit_break_glass_open(
  p_reason text, p_scope text, p_minutes integer default 60,
  p_module_key text default null, p_city_id uuid default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_break_glass_open(p_reason, p_scope, p_minutes, p_module_key, p_city_id) $$;

create or replace function public.rpc_audit_break_glass_close(p_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_break_glass_close(p_id) $$;

create or replace function public.rpc_audit_break_glass_review(p_id uuid, p_outcome text, p_note text)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_break_glass_review(p_id, p_outcome, p_note) $$;

create or replace function public.rpc_audit_legal_hold_place(
  p_reference text, p_title text, p_reason text, p_subject_type text,
  p_instructed_by text, p_subject_id uuid default null,
  p_city_id uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_legal_hold_place(p_reference, p_title, p_reason, p_subject_type,
       p_instructed_by, p_subject_id, p_city_id, p_from, p_to) $$;

create or replace function public.rpc_audit_legal_hold_release(p_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_legal_hold_release(p_id, p_reason) $$;

create or replace function public.rpc_audit_pack_create(
  p_reference text, p_title text, p_purpose text, p_requested_by text,
  p_reason text, p_filter jsonb, p_from timestamptz default null,
  p_to timestamptz default null, p_legal_hold_id uuid default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_pack_create(p_reference, p_title, p_purpose, p_requested_by,
       p_reason, p_filter, p_from, p_to, p_legal_hold_id) $$;

create or replace function public.rpc_audit_pack_freeze(p_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_pack_freeze(p_id) $$;

create or replace function public.rpc_audit_pack_share(p_id uuid, p_shared_with text, p_how text)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_pack_share(p_id, p_shared_with, p_how) $$;

create or replace function public.rpc_audit_verify_chain()
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_verify_chain() $$;

create or replace function public.rpc_audit_record_export(
  p_module text, p_what text, p_reason text, p_row_count integer default null,
  p_format text default 'csv', p_contains_pii boolean default false,
  p_filter jsonb default null, p_destination text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_record_export(p_module, p_what, p_reason, p_row_count,
       p_format, p_contains_pii, p_filter, p_destination) $$;

create or replace function public.rpc_audit_retention_set(
  p_key text, p_retain_for interval, p_basis text,
  p_anonymise boolean default true, p_module text default null,
  p_description text default null, p_subject text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_retention_set(p_key, p_retain_for, p_basis, p_anonymise,
       p_module, p_description, p_subject) $$;

create or replace function public.rpc_audit_retention_approve(p_key text)
returns jsonb language sql security definer set search_path = ''
as $$ select audit.rpc_retention_approve(p_key) $$;

grant execute on function public.rpc_audit_review_event(bigint, text, text) to authenticated;
grant execute on function public.rpc_audit_alert_act(uuid, text, text) to authenticated;
grant execute on function public.rpc_audit_revoke_sessions(uuid, text) to authenticated;
grant execute on function public.rpc_audit_break_glass_open(text, text, integer, text, uuid) to authenticated;
grant execute on function public.rpc_audit_break_glass_close(uuid) to authenticated;
grant execute on function public.rpc_audit_break_glass_review(uuid, text, text) to authenticated;
grant execute on function public.rpc_audit_legal_hold_place(text, text, text, text, text, uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.rpc_audit_legal_hold_release(uuid, text) to authenticated;
grant execute on function public.rpc_audit_pack_create(text, text, text, text, text, jsonb, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.rpc_audit_pack_freeze(uuid) to authenticated;
grant execute on function public.rpc_audit_pack_share(uuid, text, text) to authenticated;
grant execute on function public.rpc_audit_verify_chain() to authenticated;
grant execute on function public.rpc_audit_record_export(text, text, text, integer, text, boolean, jsonb, text) to authenticated;
grant execute on function public.rpc_audit_retention_set(text, interval, text, boolean, text, text, text) to authenticated;
grant execute on function public.rpc_audit_retention_approve(text) to authenticated;

/*
 * `anon` gets none of this. Every wrapper is granted to
 * `authenticated` only, and the RLS underneath still applies — a
 * wrapper changes where a thing is named, never who may see it.
 */
