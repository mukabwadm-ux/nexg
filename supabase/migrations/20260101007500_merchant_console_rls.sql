-- The Merchants console · row level security.
--
-- The console's 29 tables shipped without RLS. Supabase's default
-- privileges hand `anon` full select, insert, update and delete on every
-- new table in `public`, so until this migration a stranger holding the
-- publishable key could read every merchant statement, payout figure,
-- dispute and private message — and write to them.
--
-- The rule this restores is the one the rest of the schema already
-- follows: reads are a policy, writes are an RPC. No table here gets an
-- insert, update or delete policy, because every legitimate write
-- already goes through a SECURITY DEFINER function that checks who is
-- asking. Revoking the write grants outright means a missing policy can
-- never be mistaken for permission.

-- ───────────────────────────────────────────────────── privileges

do $$
declare
  t text;
begin
  foreach t in array array[
    'acquisition_source_rule', 'auto_message_rule', 'branch_override', 'broadcast',
    'broadcast_recipient', 'campaign_spend', 'catalogue_edit_request', 'catalogue_import',
    'catalogue_photo_task', 'catalogue_price_flag', 'city_hours_exception', 'commission_tier',
    'coverage_gap', 'dispute', 'document_automation_rule', 'health_weight_config',
    'merchant_chain_setting', 'merchant_health_snapshot', 'merchant_hours_override',
    'merchant_message', 'merchant_penalty', 'merchant_review', 'merchant_statement',
    'merchant_status_change', 'merchant_strike', 'merchant_terms_acceptance',
    'merchant_terms_version', 'message_template', 'referral'
  ]
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ──────────────────────────────────────────── staff-only tables
--
-- Commission tiers, spend, templates, scoring weights, coverage gaps and
-- the automation rules are how NexG runs itself. A merchant has no
-- business reading the weights their own score is computed from, and a
-- guest none at all.

create policy acquisition_source_rule_read on public.acquisition_source_rule
  for select to authenticated using (authz.reaches_module('merchants'));
create policy auto_message_rule_read on public.auto_message_rule
  for select to authenticated using (authz.reaches_module('merchants'));
create policy campaign_spend_read on public.campaign_spend
  for select to authenticated using (authz.reaches_module('merchants'));
create policy commission_tier_read on public.commission_tier
  for select to authenticated using (authz.reaches_module('merchants'));
create policy coverage_gap_read on public.coverage_gap
  for select to authenticated using (authz.reaches_module('merchants'));
create policy document_automation_rule_read on public.document_automation_rule
  for select to authenticated using (authz.reaches_module('merchants'));
create policy health_weight_config_read on public.health_weight_config
  for select to authenticated using (authz.reaches_module('merchants'));
create policy message_template_read on public.message_template
  for select to authenticated using (authz.reaches_module('merchants'));
create policy broadcast_read on public.broadcast
  for select to authenticated using (authz.reaches_module('merchants'));
create policy city_hours_exception_read on public.city_hours_exception
  for select to authenticated using (authz.reaches_module('merchants'));

-- ─────────────────────────────── the merchant's own record, and staff
--
-- authz.works_merchant already answers "may this person act on this
-- merchant" for staff. Membership is the other half: an owner reads
-- their own statements, disputes, messages and strikes, and nobody
-- else's.

create policy merchant_statement_read on public.merchant_statement
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_message_read on public.merchant_message
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy dispute_read on public.dispute
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_review_read on public.merchant_review
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_status_change_read on public.merchant_status_change
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_hours_override_read on public.merchant_hours_override
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy catalogue_edit_request_read on public.catalogue_edit_request
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy catalogue_import_read on public.catalogue_import
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy catalogue_photo_task_read on public.catalogue_photo_task
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy catalogue_price_flag_read on public.catalogue_price_flag
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_terms_acceptance_read on public.merchant_terms_acceptance
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy broadcast_recipient_read on public.broadcast_recipient
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy referral_read on public.referral
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

/*
 * A penalty, a strike and a health score are things done to a merchant.
 * They read their own — being disciplined without being told is worse
 * than the discipline.
 */
create policy merchant_penalty_read on public.merchant_penalty
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_strike_read on public.merchant_strike
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

create policy merchant_health_snapshot_read on public.merchant_health_snapshot
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

/* Keyed by branch and by parent rather than by merchant_id. */
create policy branch_override_read on public.branch_override
  for select to authenticated
  using (exists (
    select 1 from public.merchant_branch b
    where b.id = branch_override.branch_id
      and (authz.works_merchant(b.merchant_id) or authz.is_merchant_member(b.merchant_id))
  ));

create policy merchant_chain_setting_read on public.merchant_chain_setting
  for select to authenticated
  using (authz.works_merchant(parent_id) or authz.is_merchant_member(parent_id));

/*
 * The agreement itself, unlike everything else here, is readable by any
 * signed-in merchant: you cannot ask somebody to accept terms they are
 * not allowed to open.
 */
create policy merchant_terms_version_read on public.merchant_terms_version
  for select to authenticated using (true);

comment on table public.merchant_statement is
  'A merchant''s payout statement. Readable by staff who work that merchant and by the merchant''s own members — writes only through the finance RPCs.';
