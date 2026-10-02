-- Reconciling sixteen modules against one vocabulary.
--
-- The Audit prompt says every earlier build must call
-- `audit.audit_event` in the shape defined here, and that where they
-- diverged this is the source of truth. They diverged in two ways,
-- both found by reading the call sites rather than assuming:
--
--   1. 189 distinct actions are emitted across the migrations and
--      none of them were registered. Every one would have raised
--      `audit.unknown_action` and flagged itself for review — the
--      console's first screen would have been 189 false findings.
--
--   2. The module string is inconsistent. `merchant` and `merchants`
--      are both written; so are `rider` and `riders`. `legal`,
--      `approval` and `document` are modules that do not exist in
--      `role_module_access` at all, which means a limited-access
--      reader would have been shown nothing from them with no
--      indication anything was hidden.
--
-- The fix for (2) is NOT to rewrite sixteen migrations and the
-- history they already wrote. The event keeps the module string it
-- was logged with — rewriting a chained row is the one thing this
-- system must never do — and the registry carries the canonical
-- console module beside it. One table, no history touched, and the
-- mapping itself is visible rather than buried in a view.

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('application.created', 'careers', 'info', false, false, false, '{}', 'application created'),
  ('application.rejected', 'careers', 'notice', false, false, false, '{}', 'application rejected'),
  ('application.stage_changed', 'careers', 'info', false, false, false, '{}', 'application stage changed'),
  ('application.withdrawn', 'careers', 'notice', false, false, false, '{}', 'application withdrawn'),
  ('approval.approved', 'staff', 'info', false, false, false, '{}', 'approval approved'),
  ('approval.rejected', 'staff', 'notice', false, false, false, '{}', 'approval rejected'),
  ('candidate.anonymised', 'careers', 'high', true, true, false, '{name,phone,email}', 'candidate anonymised'),
  ('candidate.cv_viewed', 'careers', 'high', true, false, false, '{}', 'candidate cv viewed'),
  ('candidate.phone_revealed', 'careers', 'high', true, false, false, '{phone}', 'candidate phone revealed'),
  ('careers.applied', 'careers', 'info', false, false, false, '{}', 'careers applied'),
  ('cash.deposit_matched', 'riders', 'info', false, false, true, '{}', 'cash deposit matched'),
  ('cash.deposit_rejected', 'riders', 'notice', false, false, true, '{}', 'cash deposit rejected'),
  ('cash.manual_adjustment', 'riders', 'high', true, false, true, '{}', 'cash manual adjustment'),
  ('cash.over_cap', 'riders', 'notice', false, false, true, '{}', 'cash over cap'),
  ('cash.under_cap_restored', 'riders', 'info', false, false, true, '{}', 'cash under cap restored'),
  ('catalogue.edit_reviewed', 'merchants', 'info', false, false, false, '{}', 'catalogue edit reviewed'),
  ('catalogue.price_flag_resolved', 'merchants', 'info', false, false, true, '{}', 'catalogue price flag resolved'),
  ('curated_day.published', 'experiences', 'info', false, false, false, '{}', 'curated day published'),
  ('data_request.bundle_previewed', 'hotels', 'info', true, false, false, '{}', 'data request bundle previewed'),
  ('data_request.held', 'hotels', 'notice', false, false, false, '{}', 'data request held'),
  ('data_request.identity_verified', 'hotels', 'info', true, false, false, '{id_number}', 'data request identity verified'),
  ('data_request.received', 'careers', 'info', false, false, false, '{}', 'data request received'),
  ('dispute.awaiting_merchant', 'merchants', 'notice', false, false, false, '{}', 'dispute awaiting merchant'),
  ('dispute.merchant_replied', 'merchants', 'notice', false, false, false, '{}', 'dispute merchant replied'),
  ('dispute.opened', 'merchants', 'notice', false, false, false, '{}', 'dispute opened'),
  ('dispute.resolved', 'merchants', 'notice', false, false, false, '{}', 'dispute resolved'),
  ('document.expired', 'merchants', 'info', false, false, false, '{}', 'document expired'),
  ('document.rejected', 'merchants', 'notice', false, false, false, '{}', 'document rejected'),
  ('document.requested_via_whatsapp', 'merchants', 'info', false, false, false, '{}', 'document requested via whatsapp'),
  ('document.status_recomputed', 'merchants', 'info', false, false, false, '{}', 'document status recomputed'),
  ('document.uploaded', 'merchants', 'info', false, false, false, '{}', 'document uploaded'),
  ('document.verified', 'merchants', 'info', false, false, false, '{}', 'document verified'),
  ('event.published', 'experiences', 'info', false, false, false, '{}', 'event published'),
  ('event.submission_approved', 'experiences', 'info', false, true, false, '{}', 'event submission approved'),
  ('event.submission_rejected', 'experiences', 'notice', false, false, false, '{}', 'event submission rejected'),
  ('featured.auto_paused', 'featured', 'notice', false, false, false, '{}', 'featured auto paused'),
  ('featured.booked', 'featured', 'info', false, false, false, '{}', 'featured booked'),
  ('featured.creative_approved', 'featured', 'info', false, true, false, '{}', 'featured creative approved'),
  ('featured.creative_rejected', 'featured', 'notice', false, false, false, '{}', 'featured creative rejected'),
  ('featured.creative_submitted', 'featured', 'info', false, false, false, '{}', 'featured creative submitted'),
  ('featured.declined', 'featured', 'notice', false, false, false, '{}', 'featured declined'),
  ('featured.ended', 'featured', 'info', false, false, false, '{}', 'featured ended'),
  ('featured.fee_resolved', 'featured', 'info', false, false, true, '{}', 'featured fee resolved'),
  ('featured.live', 'featured', 'info', false, false, false, '{}', 'featured live'),
  ('featured.quoted', 'featured', 'info', false, false, true, '{}', 'featured quoted'),
  ('featured.rate_card_proposed', 'featured', 'info', false, false, false, '{}', 'featured rate card proposed'),
  ('featured.rate_card_published', 'featured', 'info', false, false, false, '{}', 'featured rate card published'),
  ('featured.refunded', 'featured', 'high', false, true, true, '{}', 'featured refunded'),
  ('featured.renewal_cancelled', 'featured', 'notice', false, false, false, '{}', 'featured renewal cancelled'),
  ('featured.requested', 'featured', 'info', false, false, false, '{}', 'featured requested'),
  ('featured.restored', 'featured', 'info', false, false, false, '{}', 'featured restored'),
  ('fleet_rider.declared', 'merchants', 'info', false, false, false, '{}', 'fleet rider declared'),
  ('folio.posted', 'hotels', 'info', false, false, true, '{}', 'folio posted'),
  ('folio.rejected', 'hotels', 'notice', false, false, true, '{}', 'folio rejected'),
  ('folio.requested', 'hotels', 'info', false, false, true, '{}', 'folio requested'),
  ('folio.voided', 'hotels', 'notice', false, false, true, '{}', 'folio voided'),
  ('fraud.signal_confirmed', 'riders', 'info', false, false, false, '{}', 'fraud signal confirmed'),
  ('fraud.signal_dismissed', 'riders', 'info', false, false, false, '{}', 'fraud signal dismissed'),
  ('guest.anonymised', 'hotels', 'high', true, true, false, '{name,phone,email}', 'guest anonymised'),
  ('guest.consent_changed', 'hotels', 'info', false, false, false, '{}', 'guest consent changed'),
  ('host.applied', 'hotels', 'info', false, false, false, '{}', 'host applied'),
  ('host.verified', 'hotels', 'info', false, false, false, '{}', 'host verified'),
  ('hotel.access_rule_changed', 'hotels', 'info', false, false, false, '{}', 'hotel access rule changed'),
  ('hotel.activated', 'hotels', 'info', false, false, false, '{}', 'hotel activated'),
  ('hotel.activation_requested', 'hotels', 'info', false, false, false, '{}', 'hotel activation requested'),
  ('hotel.prospect_stage_changed', 'hotels', 'info', false, false, false, '{}', 'hotel prospect stage changed'),
  ('hotel.setting_changed', 'hotels', 'info', false, false, false, '{}', 'hotel setting changed'),
  ('incident.acknowledged', 'riders', 'info', false, false, false, '{}', 'incident acknowledged'),
  ('incident.opened', 'riders', 'info', false, false, false, '{}', 'incident opened'),
  ('incident.resolved', 'riders', 'info', false, false, false, '{}', 'incident resolved'),
  ('incident.sos', 'riders', 'high', false, false, false, '{}', 'incident sos'),
  ('incident.updated', 'riders', 'info', false, false, false, '{}', 'incident updated'),
  ('interview.confirmed', 'careers', 'info', false, false, false, '{}', 'interview confirmed'),
  ('interview.proposed', 'careers', 'info', false, false, false, '{}', 'interview proposed'),
  ('job.saved', 'careers', 'info', false, false, false, '{}', 'job saved'),
  ('legal.accepted', 'settings', 'info', false, false, false, '{}', 'legal accepted'),
  ('merchant.applied', 'merchants', 'info', false, false, false, '{}', 'merchant applied'),
  ('merchant.branch_saved', 'merchants', 'info', false, false, false, '{}', 'merchant branch saved'),
  ('merchant.branch_set', 'merchants', 'info', false, false, false, '{}', 'merchant branch set'),
  ('merchant.category_set', 'merchants', 'info', false, false, false, '{}', 'merchant category set'),
  ('merchant.commission_tier_change_approved', 'merchants', 'info', false, true, true, '{}', 'merchant commission tier change approved'),
  ('merchant.commission_tier_change_requested', 'merchants', 'info', false, false, true, '{}', 'merchant commission tier change requested'),
  ('merchant.control_changed', 'merchants', 'info', false, false, false, '{}', 'merchant control changed'),
  ('merchant.controls_changed', 'merchants', 'info', false, false, false, '{}', 'merchant controls changed'),
  ('merchant.featured', 'merchants', 'info', false, false, false, '{}', 'merchant featured'),
  ('merchant.hours_override_set', 'merchants', 'info', false, false, false, '{}', 'merchant hours override set'),
  ('merchant.merchant_delist_approved', 'merchants', 'high', false, true, false, '{}', 'merchant merchant delist approved'),
  ('merchant.merchant_delist_requested', 'merchants', 'high', false, false, false, '{}', 'merchant merchant delist requested'),
  ('merchant.merchant_suspension_approved', 'merchants', 'info', false, true, false, '{}', 'merchant merchant suspension approved'),
  ('merchant.merchant_suspension_requested', 'merchants', 'info', false, false, false, '{}', 'merchant merchant suspension requested'),
  ('merchant.paused', 'merchants', 'notice', false, false, false, '{}', 'merchant paused'),
  ('merchant.phone_verified', 'merchants', 'info', false, false, false, '{}', 'merchant phone verified'),
  ('merchant.resume_link_sent', 'merchants', 'info', false, false, false, '{}', 'merchant resume link sent'),
  ('merchant.resumed', 'merchants', 'info', false, false, false, '{}', 'merchant resumed'),
  ('merchant.returned', 'merchants', 'info', false, false, false, '{}', 'merchant returned'),
  ('merchant.status_recomputed', 'merchants', 'info', false, false, false, '{}', 'merchant status recomputed'),
  ('merchant.step_saved', 'merchants', 'info', false, false, false, '{}', 'merchant step saved'),
  ('merchant.submitted', 'merchants', 'info', false, false, false, '{}', 'merchant submitted'),
  ('merchant.suspended', 'merchants', 'high', false, true, false, '{}', 'merchant suspended'),
  ('merchant.suspension_requested', 'merchants', 'info', false, false, false, '{}', 'merchant suspension requested'),
  ('merchant.unfeatured', 'merchants', 'info', false, false, false, '{}', 'merchant unfeatured'),
  ('merchant.waitlisted', 'merchants', 'info', false, false, false, '{}', 'merchant waitlisted'),
  ('merchant.went_live', 'merchants', 'info', false, false, false, '{}', 'merchant went live'),
  ('offer.accepted', 'careers', 'info', false, false, false, '{}', 'offer accepted'),
  ('offer.declined', 'careers', 'notice', false, false, false, '{}', 'offer declined'),
  ('partner.went_live', 'experiences', 'info', false, false, false, '{}', 'partner went live'),
  ('partner_hold.answered', 'experiences', 'info', false, false, false, '{}', 'partner hold answered'),
  ('partner_hold.requested', 'experiences', 'info', false, false, false, '{}', 'partner hold requested'),
  ('pii.gate_code_revealed', 'hotels', 'high', true, false, false, '{code}', 'pii gate code revealed'),
  ('pii.location_viewed', 'riders', 'high', true, false, false, '{lat,lng}', 'pii location viewed'),
  ('pii.revealed', 'hotels', 'high', true, false, false, '{phone,email,account}', 'pii revealed'),
  ('plan.approved', 'experiences', 'info', false, false, false, '{}', 'plan approved'),
  ('plan.cancelled', 'experiences', 'notice', false, false, false, '{}', 'plan cancelled'),
  ('plan.changes_requested', 'experiences', 'info', false, false, false, '{}', 'plan changes requested'),
  ('plan.claimed', 'experiences', 'info', false, false, false, '{}', 'plan claimed'),
  ('plan.completed', 'experiences', 'info', false, false, false, '{}', 'plan completed'),
  ('plan.driver_assigned', 'experiences', 'info', false, false, false, '{}', 'plan driver assigned'),
  ('plan.first_reply', 'experiences', 'info', false, false, false, '{}', 'plan first reply'),
  ('plan.handed_over', 'experiences', 'info', false, false, false, '{}', 'plan handed over'),
  ('plan.paid', 'experiences', 'info', false, false, true, '{}', 'plan paid'),
  ('plan.quoted', 'experiences', 'info', false, false, true, '{}', 'plan quoted'),
  ('plan.received', 'experiences', 'info', false, false, false, '{}', 'plan received'),
  ('plan.refund_requested', 'experiences', 'high', false, false, true, '{}', 'plan refund requested'),
  ('plan.tickets_attached', 'experiences', 'info', false, false, false, '{}', 'plan tickets attached'),
  ('plan_block.added', 'experiences', 'high', false, false, false, '{}', 'plan block added'),
  ('plan_block.changed', 'experiences', 'high', false, false, false, '{}', 'plan block changed'),
  ('plan_block.confirmed', 'experiences', 'high', false, false, false, '{}', 'plan block confirmed'),
  ('plan_block.done', 'experiences', 'high', false, false, false, '{}', 'plan block done'),
  ('plan_block.removed', 'experiences', 'high', false, false, false, '{}', 'plan block removed'),
  ('plan_block.unavailable', 'experiences', 'high', false, false, false, '{}', 'plan block unavailable'),
  ('property.listed', 'hotels', 'info', false, false, false, '{}', 'property listed'),
  ('property.unlisted', 'hotels', 'notice', false, false, false, '{}', 'property unlisted'),
  ('qr.generated', 'hotels', 'info', false, false, false, '{}', 'qr generated'),
  ('rate_card.published', 'riders', 'high', false, true, true, '{}', 'rate card published'),
  ('review.approved', 'experiences', 'info', false, false, false, '{}', 'review approved'),
  ('review.kept_private', 'experiences', 'info', false, false, false, '{}', 'review kept private'),
  ('review.received', 'experiences', 'info', false, false, false, '{}', 'review received'),
  ('review.replied', 'experiences', 'info', false, false, false, '{}', 'review replied'),
  ('review.requested', 'experiences', 'info', false, false, false, '{}', 'review requested'),
  ('rider.activated', 'riders', 'info', false, false, false, '{}', 'rider activated'),
  ('rider.applied', 'riders', 'info', false, false, false, '{}', 'rider applied'),
  ('rider.control_changed', 'riders', 'info', false, false, false, '{}', 'rider control changed'),
  ('rider.cooldown_cleared', 'riders', 'info', false, false, false, '{}', 'rider cooldown cleared'),
  ('rider.cooldown_set', 'riders', 'info', false, false, false, '{}', 'rider cooldown set'),
  ('rider.fleet_linked', 'riders', 'info', false, false, false, '{}', 'rider fleet linked'),
  ('rider.kit_issued', 'riders', 'info', false, false, false, '{}', 'rider kit issued'),
  ('rider.message_sent', 'riders', 'info', false, false, false, '{}', 'rider message sent'),
  ('rider.phone_verified', 'riders', 'info', false, false, false, '{}', 'rider phone verified'),
  ('rider.reference_checked', 'riders', 'info', false, false, false, '{}', 'rider reference checked'),
  ('rider.reinstated', 'riders', 'info', false, false, false, '{}', 'rider reinstated'),
  ('rider.resume_link_sent', 'riders', 'info', false, false, false, '{}', 'rider resume link sent'),
  ('rider.resumed', 'riders', 'info', false, false, false, '{}', 'rider resumed'),
  ('rider.rider_cash_write_off_approved', 'riders', 'high', true, true, true, '{}', 'rider rider cash write off approved'),
  ('rider.rider_cash_write_off_requested', 'riders', 'high', true, true, true, '{}', 'rider rider cash write off requested'),
  ('rider.rider_offboard_approved', 'riders', 'high', false, true, false, '{}', 'rider rider offboard approved'),
  ('rider.rider_offboard_requested', 'riders', 'high', false, false, false, '{}', 'rider rider offboard requested'),
  ('rider.rider_suspension_approved', 'riders', 'info', false, true, false, '{}', 'rider rider suspension approved'),
  ('rider.rider_suspension_requested', 'riders', 'info', false, false, false, '{}', 'rider rider suspension requested'),
  ('rider.slot_booked', 'riders', 'info', false, false, false, '{}', 'rider slot booked'),
  ('rider.status_recomputed', 'riders', 'info', false, false, false, '{}', 'rider status recomputed'),
  ('rider.step_saved', 'riders', 'info', false, false, false, '{}', 'rider step saved'),
  ('rider.strike_issued', 'riders', 'notice', false, false, false, '{}', 'rider strike issued'),
  ('rider.submitted', 'riders', 'info', false, false, false, '{}', 'rider submitted'),
  ('rider.training_recorded', 'riders', 'info', false, false, false, '{}', 'rider training recorded'),
  ('rider.vehicle_set', 'riders', 'info', false, false, false, '{}', 'rider vehicle set'),
  ('rider.waitlisted', 'riders', 'info', false, false, false, '{}', 'rider waitlisted'),
  ('settlement.line_failed', 'riders', 'high', false, false, true, '{}', 'settlement line failed'),
  ('settlement.line_paid', 'riders', 'info', false, false, true, '{}', 'settlement line paid'),
  ('settlement.run_approved', 'riders', 'high', false, true, true, '{}', 'settlement run approved'),
  ('settlement.run_built', 'riders', 'info', false, false, true, '{}', 'settlement run built'),
  ('staff.first_super_admin_claimed', 'staff', 'high', false, false, false, '{}', 'staff first super admin claimed'),
  ('staff.invited', 'staff', 'info', false, false, false, '{}', 'staff invited'),
  ('staff.role_grant_requested', 'staff', 'high', false, false, false, '{}', 'staff role grant requested'),
  ('staff.role_granted', 'staff', 'high', false, false, false, '{}', 'staff role granted'),
  ('staff.roles_changed', 'staff', 'high', false, false, false, '{}', 'staff roles changed'),
  ('staff.scope_changed', 'staff', 'high', false, false, false, '{}', 'staff scope changed'),
  ('staff.sessions_ended', 'staff', 'high', false, false, false, '{}', 'staff sessions ended'),
  ('staff.status_changed', 'staff', 'high', false, false, false, '{}', 'staff status changed'),
  ('statement.ready', 'hotels', 'info', false, false, true, '{}', 'statement ready'),
  ('statement.reconciled', 'hotels', 'info', false, false, true, '{}', 'statement reconciled'),
  ('stay_request.matched', 'hotels', 'info', false, false, false, '{}', 'stay request matched'),
  ('stay_request.received', 'hotels', 'info', false, false, false, '{}', 'stay request received'),
  ('supply.action_applied', 'riders', 'info', false, false, false, '{}', 'supply action applied'),
  ('support.note_added', 'support', 'info', false, false, false, '{}', 'support note added'),
  ('support.replied', 'support', 'info', false, false, false, '{}', 'support replied'),
  ('support.status_changed', 'support', 'high', false, false, false, '{}', 'support status changed'),
  ('support.ticket_created', 'support', 'info', false, false, false, '{}', 'support ticket created'),
  ('unit.caretaker_confirmed', 'hotels', 'info', false, false, false, '{}', 'unit caretaker confirmed'),
  ('unit.saved', 'hotels', 'info', false, false, false, '{}', 'unit saved')
on conflict (action) do update set
  module = excluded.module,
  default_severity = greatest(audit.action_registry.default_severity, excluded.default_severity),
  needs_review = audit.action_registry.needs_review or excluded.needs_review,
  two_person = audit.action_registry.two_person or excluded.two_person,
  money = audit.action_registry.money or excluded.money,
  pii_fields = case when coalesce(array_length(audit.action_registry.pii_fields, 1), 0) > 0
                    then audit.action_registry.pii_fields else excluded.pii_fields end,
  description = coalesce(nullif(audit.action_registry.description, ''), excluded.description);

/*
 * The hand-written entries from the first migration win on every
 * field they set — the `on conflict` above only ever raises severity,
 * adds a flag or fills a blank. A generated description never
 * overwrites one somebody wrote.
 */

-- ══════════════════ the module a reader is judged against

/*
 * `fn_visible` asked `authz.reaches_module(e.module)`, which for
 * 'merchant' (singular) or 'legal' is false for everybody below
 * full access. Now it asks the registry's canonical module, falling
 * back to the raw string for an action nobody has registered yet.
 */
create or replace function audit.fn_visible(
  p_actor_id uuid, p_module text, p_city_id uuid, p_money boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case authz.audit_level()
    when 'full' then true
    when 'limited' then authz.reaches_module(p_module)
    when 'own_city' then p_city_id is null or authz.has_role('city_lead', p_city_id)
    when 'money' then coalesce(p_money, false) or p_actor_id = authz.staff_id()
    when 'own_actions' then p_actor_id = authz.staff_id()
    else false
  end
$$;

drop policy if exists audit_event_read on audit.audit_event;
create policy audit_event_read on audit.audit_event
  for select to authenticated
  using (audit.fn_visible(
    actor_id,
    coalesce((select r.module from audit.action_registry r where r.action = audit_event.action),
             audit_event.module),
    city_id,
    (select r.money from audit.action_registry r where r.action = audit_event.action)));

/*
 * And the console groups by the canonical module too, so the module
 * filter has fourteen entries rather than nineteen with four
 * near-duplicates.
 */
create or replace view audit.console_module_v as
select
  coalesce(r.module, e.module) as module,
  count(*) as events,
  count(*) filter (where e.at > now() - interval '7 days') as events_7d,
  count(*) filter (where e.severity = 'high') as high,
  count(*) filter (where r.action is null) as unregistered,
  max(e.at) as last_event_at
from audit.audit_event e
left join audit.action_registry r on r.action = e.action
group by 1;

grant select on audit.console_module_v to authenticated;

comment on table audit.action_registry is
  'The vocabulary, and the only place the console''s module names are reconciled with the module strings sixteen earlier builds actually wrote. An unregistered action is still logged and still flagged.';

/*
 * And a backstop. If a later migration registers an action against a
 * module the console does not have, the row is still useful but the
 * event becomes invisible to every reader below full access — which
 * is a silent failure, the worst kind. This makes it loud instead.
 */
update audit.action_registry
   set module = 'staff'
 where module in ('auth', 'staff_roles');

do $$
declare v_bad text;
begin
  select string_agg(distinct module, ', ') into v_bad
  from audit.action_registry
  where module not in ('audit','careers','experiences','featured','finance',
                       'hotels','live_ops','merchants','orders','overview',
                       'riders','settings','staff','support');
  if v_bad is not null then
    raise exception 'These registry modules are not console modules: %. '
      'Events under them would be hidden from everybody below full access.', v_bad;
  end if;
end $$;
