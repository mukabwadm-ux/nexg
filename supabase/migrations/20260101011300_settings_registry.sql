-- The registry: every field on the Settings screens, as a key.
--
-- A key absent from here cannot be written, which is what keeps the
-- registry and reality from drifting apart the way the audit action
-- vocabulary had. It is also what lets the console render a control
-- for a setting nobody has coded a form for — the value type, the
-- constraints and the help text all come from this table.
--
-- Every money figure is seeded NULL on purpose. The design shows
-- `[—]` for commissions, fee bands, caps and boost pay because
-- nobody at NexG has agreed them yet, and a plausible-looking
-- default here is the one that gets invoiced. The defaults that ARE
-- set are the ones visible in the design: 30-minute cut-off, 20-second
-- accept window, 3 rounds, 3 km radius, 4-minute escalation, 22:00
-- late night, Thursday 23:59 cut-off, weekly Friday settlement.

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  -- ═══════════════════════════════════════════════ cities
  ('city.order_cutoff_min', 'cities', 'city', 'int', 'min',
   'Order cut-off before close',
   'Last order accepted this many minutes before the city closing time.',
   false, false, 'single:ops_manager', '{orders,web}', '30'::jsonb, 10),

  ('city.outside_zone_behaviour', 'cities', 'city', 'enum', null,
   'Outside-zone behaviour',
   'What a guest sees when their stay is outside every zone.',
   false, true, 'single:ops_manager', '{web}', '"show_waitlist_form"'::jsonb, 20),

  ('city.languages', 'cities', 'global', 'json', null,
   'Guest-facing languages',
   'English first · Kiswahili toggle on the website and receipts.',
   false, true, 'single:growth', '{web,notifications}', '["en","sw"]'::jsonb, 30),

  ('city.holiday_calendar', 'cities', 'city', 'text', null,
   'Public holidays',
   'Merchants get a prompt to confirm hours this many days ahead.',
   false, true, 'single:ops_manager', '{merchants,notifications}', '"KE-2026"'::jsonb, 40),

  ('city.new_city_template', 'cities', 'global', 'text', null,
   'New-city template',
   'Zones, fee bands and rules copied when a city goes from waitlist to soft launch.',
   false, false, 'single:ops_manager', '{}', null, 50),

  ('city.golive_min_merchants', 'cities', 'global', 'int', 'merchants',
   'Live cities need at least this many merchants',
   'Part of the readiness checklist. Not set — Ops decides what a city needs before guests see it.',
   false, false, 'single:ops_manager', '{}', null, 60),

  ('city.golive_min_riders', 'cities', 'global', 'int', 'riders',
   'Live cities need at least this many riders',
   'Part of the readiness checklist. Not set.',
   false, false, 'single:ops_manager', '{}', null, 61),

  ('city.waitlist_open_at', 'cities', 'global', 'int', 'sign-ups',
   'Waitlist city opens at',
   'How many sign-ups before a waitlist city is worth launching. Not set.',
   false, false, 'single:ops_manager', '{}', null, 62),

  -- ════════════════════════════════════════════════ fees
  ('fees.categories', 'fees', 'global', 'json', null,
   'Merchant categories',
   'The categories commission is set against. Adding one is a settings change, not a migration.',
   false, false, 'finance+ops_manager', '{orders,merchants}',
   '["food_drinks","laundry_cleaning","flowers_gifts","pharmacy","beauty_fashion","concierge_offplatform"]'::jsonb, 90),

  ('fees.commission', 'fees', 'city_category', 'pct', '%',
   'Commission',
   'What NexG takes from the merchant on each order in this category.',
   true, false, 'finance+ops_manager', '{orders,finance,merchants}', null, 100),

  ('fees.min_order', 'fees', 'city_category', 'money', 'KES',
   'Minimum per order',
   'The smallest basket this category will accept.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 101),

  ('fees.featured_eligible', 'fees', 'city_category', 'bool', null,
   'Featured eligible',
   'Whether merchants in this category may buy a paid placement.',
   false, false, 'finance+ops_manager', '{featured}', 'true'::jsonb, 102),

  ('fees.category_note', 'fees', 'city_category', 'text', null,
   'Note',
   'Why this number is what it is — read by whoever changes it next.',
   false, true, 'single:finance', '{}', null, 103),

  ('fees.delivery.band_1', 'fees', 'city', 'money', 'KES',
   'Delivery · Band 1 · Core',
   'Up to 3 km, inside a Core zone.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 110),
  ('fees.delivery.band_2', 'fees', 'city', 'money', 'KES',
   'Delivery · Band 2 · Extended', '3–6 km.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 111),
  ('fees.delivery.band_3', 'fees', 'city', 'money', 'KES',
   'Delivery · Band 3 · edge', '6–8 km.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 112),
  ('fees.night_surcharge', 'fees', 'city', 'money', 'KES',
   'Night surcharge', 'Flat, added after the late-night hour.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 113),

  ('fees.service_pct', 'fees', 'city', 'pct', '%',
   'Service fee', 'Percentage of basket, shown to the guest as its own line.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 120),
  ('fees.concierge_flat', 'fees', 'city', 'money', 'KES',
   'Concierge request', 'Flat fee for an off-platform purchase request.',
   true, false, 'finance+ops_manager', '{orders,experiences}', null, 121),
  ('fees.small_basket_threshold', 'fees', 'city', 'money', 'KES',
   'Small-basket threshold', 'Baskets below this attract the small-basket fee.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 122),
  ('fees.small_basket_fee', 'fees', 'city', 'money', 'KES',
   'Small-basket fee', 'Charged when the basket is under the threshold.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 123),
  ('fees.cash_handling', 'fees', 'city', 'money', 'KES',
   'Cash-on-delivery handling',
   'Zero today. Charging for cash would fall hardest on the guests who have least choice about using it.',
   true, false, 'finance+ops_manager', '{orders,web}', '0'::jsonb, 124),
  ('fees.host_credit_rule', 'fees', 'city', 'text', null,
   'Airbnb host credit · welcome pack',
   'Host-billed: the welcome pack is charged to the host, not the guest.',
   false, false, 'finance+ops_manager', '{hotels,finance}', '"host_billed"'::jsonb, 125),

  -- ════════════════════════════════════════════ dispatch
  ('dispatch.selection', 'dispatch', 'city', 'enum', null,
   'Rider selection',
   'Nearest ETA to the merchant first, like ride-hailing — not nearest to the guest.',
   true, false, 'finance+ops_manager', '{dispatch}', '"nearest_eta_to_merchant"'::jsonb, 200),
  ('dispatch.accept_window_s', 'dispatch', 'city', 'int', 's',
   'Accept window', 'Seconds a rider has before the request moves to the next one.',
   false, true, 'single:ops_manager', '{dispatch}', '20'::jsonb, 201),
  ('dispatch.rounds_before_boost', 'dispatch', 'city', 'int', 'rounds',
   'Rounds before boost', 'How many riders are tried before the boost fee kicks in.',
   true, false, 'finance+ops_manager', '{dispatch}', '3'::jsonb, 202),
  ('dispatch.search_radius_km', 'dispatch', 'city', 'int', 'km',
   'Search radius', 'From the merchant.',
   false, true, 'single:ops_manager', '{dispatch}', '3'::jsonb, 203),
  ('dispatch.radius_increment_km', 'dispatch', 'city', 'int', 'km',
   'Radius widens by', 'Added to the search radius each round.',
   false, true, 'single:ops_manager', '{dispatch}', '1'::jsonb, 204),
  ('dispatch.boost_fee', 'dispatch', 'city', 'money', 'KES',
   'Boost fee',
   'Added to rider pay, not to the guest, after the rounds above.',
   true, false, 'finance+ops_manager', '{dispatch,finance}', null, 205),
  ('dispatch.escalate_min', 'dispatch', 'city', 'int', 'min',
   'Escalate to Concierge desk after',
   'No rider found — the desk sees it with a one-tap phone dispatch.',
   false, true, 'single:ops_manager', '{dispatch,live_ops}', '4'::jsonb, 206),
  ('dispatch.rider_cash_cap', 'dispatch', 'city', 'money', 'KES',
   'Rider cash cap',
   'Max cash a rider may hold before cash-on-delivery is disabled for them.',
   true, false, 'finance+ops_manager', '{dispatch,riders,orders}', null, 207),
  ('dispatch.stacking', 'dispatch', 'city', 'bool', null,
   'Stacking', 'Allow a rider to carry two orders when both are on the way.',
   true, false, 'finance+ops_manager', '{dispatch}', 'true'::jsonb, 208),

  -- ══════════════════════════════════════════ settlement
  ('settlement.cycle', 'settlement', 'city', 'enum', null,
   'Settlement cycle', 'Merchants, riders and host credits settle in one run.',
   true, false, 'finance+ops_manager', '{finance}', '"weekly_friday"'::jsonb, 300),
  ('settlement.cutoff', 'settlement', 'city', 'text', null,
   'Cut-off', 'Orders and cash up to this point are in the run.',
   true, false, 'finance+ops_manager', '{finance}', '"thu_2359"'::jsonb, 301),
  ('settlement.approvals', 'settlement', 'city', 'text', null,
   'Approvals', 'Two people before money moves.',
   true, false, 'super_admin+super_admin', '{finance}', '"finance+ops_manager"'::jsonb, 302),
  ('settlement.instant_cashout', 'settlement', 'city', 'bool', null,
   'Instant cash-out', 'Riders asked — not offered in v1.',
   true, false, 'finance+ops_manager', '{finance,riders}', 'false'::jsonb, 303),

  -- ══════════════════════════════════════════ payouts
  ('payouts.float_alert', 'payouts', 'global', 'money', 'KES',
   'Payout float alert',
   'Warn Finance when the B2C wallet is below one week of payouts. Not set.',
   true, true, 'finance+tech', '{finance}', null, 400),
  ('payouts.host_cashout_min', 'payouts', 'global', 'money', 'KES',
   'Host cash-out minimum',
   'Host credits are a credit note below this; cash-out only above it. Not set.',
   true, false, 'finance+tech', '{finance,hotels}', null, 401),

  -- ══════════════════════════════════════ integrations
  ('integrations.rotation_days', 'integrations', 'global', 'int', 'days',
   'Key rotation period', 'How long a provider key may live before the console asks for a new one.',
   true, false, 'tech+super_admin', '{}', '90'::jsonb, 500),
  ('integrations.etims_gates_hotel_invoicing', 'integrations', 'global', 'bool', null,
   'eTIMS required before invoicing hotels',
   'Electronic invoicing is a legal requirement, not a nicety — this blocks hotel statements until it is connected.',
   true, false, 'tech+super_admin', '{hotels,finance}', 'true'::jsonb, 501),

  -- ═══════════════════════════════════════════ branding
  ('brand.support_phone', 'branding', 'global', 'text', null,
   'Support phone', 'Printed on receipts and the help page. Not set.',
   false, true, 'single:growth', '{web,notifications}', null, 600),
  ('brand.support_whatsapp', 'branding', 'global', 'text', null,
   'Support WhatsApp', 'Not set.', false, true, 'single:growth', '{web}', null, 601),
  ('brand.support_email', 'branding', 'global', 'text', null,
   'Support email', 'Not set.', false, true, 'single:growth', '{web,notifications}', null, 602),
  ('brand.tone_lines', 'branding', 'global', 'json', null,
   'Tone lines',
   'The honesty sentences reused across pages. Changing one changes every page that quotes it.',
   false, true, 'single:growth', '{web}', null, 603),

  -- ═══════════════════════════════════════════ retention
  ('retention.run_at', 'retention', 'global', 'time', null,
   'Nightly retention run', 'When the anonymisation job runs.',
   true, false, 'super_admin+dpo', '{audit}', '"02:00"'::jsonb, 700)

on conflict (key) do update set
  "group" = excluded."group",
  scope_kind = excluded.scope_kind,
  value_type = excluded.value_type,
  unit = excluded.unit,
  label = excluded.label,
  help = excluded.help,
  sensitive = excluded.sensitive,
  can_be_immediate = excluded.can_be_immediate,
  approval_pair = excluded.approval_pair,
  reader_modules = excluded.reader_modules,
  /* The default is NOT overwritten: a value somebody agreed must
     survive a redeploy of this file. */
  sort = excluded.sort;

-- ═══════════════════════════════════════ who must agree

insert into settings.approval_policy ("group", pair, threshold, notify_roles)
values
  ('fees', 'finance+ops_manager',
   /* A point of commission across a city is real money. Beyond
      that, a founder signs. */
   '{"commission_delta_pts": 1, "escalate_to": "super_admin"}'::jsonb,
   '{finance,ops_manager}'),
  ('dispatch', 'finance+ops_manager', '{}'::jsonb, '{ops_manager,finance}'),
  ('settlement', 'finance+ops_manager', '{}'::jsonb, '{finance}'),
  ('payments', 'finance+tech', '{}'::jsonb, '{finance,tech}'),
  ('payouts', 'finance+tech', '{}'::jsonb, '{finance}'),
  ('integrations', 'tech+super_admin', '{}'::jsonb, '{tech}'),
  ('legal', 'legal+super_admin', '{}'::jsonb, '{legal}'),
  ('retention', 'super_admin+dpo', '{}'::jsonb, '{dpo}'),
  ('cities', 'single:ops_manager', '{}'::jsonb, '{ops_manager}'),
  ('notifications', 'single:growth', '{}'::jsonb, '{growth}'),
  ('branding', 'single:growth', '{}'::jsonb, '{growth}')
on conflict ("group") where "group" is not null do update
  set pair = excluded.pair, threshold = excluded.threshold,
      notify_roles = excluded.notify_roles;

-- ═══════════════════ the defaults the design actually shows

/*
 * Seeded as active global versions, because they are the numbers
 * printed on the screens and nobody has to agree them again. Every
 * money figure stays absent.
 */
do $$
declare d record;
begin
  for d in
    select key, default_value from settings.definition
    where default_value is not null
      and scope_kind = 'global'
      and not exists (
        select 1 from settings.version v
        where v.key = settings.definition.key and v.scope_kind = 'global')
  loop
    insert into settings.version (key, scope_kind, value, status, effective_from, reason, activated_at)
    values (d.key, 'global', d.default_value, 'active', now(),
            'Seeded from the registry default.', now());
  end loop;
end $$;

-- ══════════════════════════════ the integrations themselves

insert into public.integration (key, label, provider, status, enabled, config, blocks, notes, sort)
values
  ('google_workspace', 'Google Workspace', null, 'connected', true,
   '{"domain_only": true, "mfa": "enforced_by_google"}'::jsonb, '{}',
   'Staff sign-in · nexg domain only · roles assigned in Staff & roles.', 10),
  ('maps', 'Maps & routing', null, 'connected', true,
   '{"uses": ["eta", "zones", "rider_tracking"]}'::jsonb, '{}',
   'ETA, zones, rider tracking.', 20),
  ('sms', 'SMS', null, 'connected', true,
   '{"sender_id": "NEXG", "uses": ["otp", "order_updates", "rider_handoff_code"]}'::jsonb, '{}',
   'OTP, order updates, rider hand-off code.', 30),
  ('whatsapp_business', 'WhatsApp Business', null, 'pending', true,
   '{"templates_approved": 6, "templates_total": 8}'::jsonb, '{}',
   'Templates awaiting provider approval · Concierge desk inbox.', 40),
  ('email', 'Email', null, 'connected', true,
   '{"spf": true, "dkim": true, "uses": ["receipts", "statements", "ats"]}'::jsonb, '{}',
   'Receipts, statements, ATS.', 50),
  ('accounting_export', 'Accounting export', null, 'connected', true,
   '{"format": "csv", "schedule": "friday_after_settlement"}'::jsonb, '{}',
   'CSV every Friday after settlement. No direct integration yet.', 60),
  ('kra_etims', 'KRA eTIMS', 'KRA', 'to_do', false,
   '{}'::jsonb, '{hotel_invoicing}',
   'Electronic invoicing. Required before invoicing hotels — this is a legal obligation, not a feature.', 70)
on conflict (key) do nothing;

insert into public.payment_method (key, label, provider, status, enabled, checkout_order, limits, note)
values
  ('mpesa_stk', 'M-Pesa · STK push', 'Safaricom Daraja', 'connected', true, 10,
   '{}'::jsonb, 'Paybill not set.'),
  ('card', 'Card · Visa / Mastercard', null, 'connected', true, 20,
   '{"3ds": true}'::jsonb, 'Settlement term not set.'),
  ('charge_to_room', 'Charge to room', null, 'live_hotels', true, 30,
   '{}'::jsonb, 'Hotel PMS or manual folio post · per hotel in Hotels & Airbnb.'),
  ('cash_on_delivery', 'Cash on delivery', null, 'limited', true, 40,
   '{}'::jsonb, 'Rider cash cap applies · disabled in Extended zones above the cap.'),
  ('airtel_money', 'Airtel Money', 'Airtel', 'not_set_up', false, 50,
   '{}'::jsonb, 'Not integrated.')
on conflict (key) do nothing;

insert into public.payout_rail (party, rail, note)
values
  ('merchants', 'mpesa_b2b_bank', 'M-Pesa till / paybill B2B or bank EFT · chosen per merchant in Documents.'),
  ('riders', 'mpesa_b2c', 'To the verified number on the rider profile · cash netted first.'),
  ('host_credits', 'credit_note', 'Credit note against the next host invoice.')
on conflict (party) do nothing;

insert into public.legal_document (key, version, status, changelog)
values
  ('guest_terms', 1, 'draft', 'Not yet written.'),
  ('privacy', 1, 'draft', 'Not yet written.'),
  ('merchant_terms', 1, 'draft', 'Not yet written.'),
  ('rider_agreement', 1, 'draft', 'Not yet written.'),
  ('host_terms', 1, 'draft', 'Not yet written.'),
  ('kdpa_notice', 1, 'draft', 'Not yet written.')
on conflict (key, version) do nothing;

-- ════════════ the two policy facts the design actually states

/*
 * Not invented numbers — these are written on the artboard, with
 * their reasons, and they are policy rather than pricing: pharmacy
 * cannot buy placement because the category is regulated, and a
 * concierge off-platform purchase is a service fee to the guest
 * rather than commission from a merchant, so there is no merchant to
 * place.
 *
 * Category-scoped, so every city inherits them and a city that
 * genuinely differs can still override.
 */
insert into settings.version (key, scope_kind, scope_category, value, status, effective_from, reason, activated_at)
select * from (values
  ('fees.featured_eligible', 'category'::settings.scope_kind, 'pharmacy', 'false'::jsonb, 'active'::settings.version_status,
   now(), 'Regulated category — no featured placement.', now()),
  ('fees.featured_eligible', 'category', 'concierge_offplatform', 'false'::jsonb, 'active',
   now(), 'Service fee to the guest, not commission from a merchant — there is no merchant to place.', now()),
  ('fees.category_note', 'category', 'food_drinks', '"largest volume · benchmark before setting"'::jsonb, 'active',
   now(), 'From the rate card sheet.', now()),
  ('fees.category_note', 'category', 'laundry_cleaning', '"per-bag pricing · merchant sets"'::jsonb, 'active',
   now(), 'From the rate card sheet.', now()),
  ('fees.category_note', 'category', 'pharmacy', '"no featured placement · regulated"'::jsonb, 'active',
   now(), 'From the rate card sheet.', now()),
  ('fees.category_note', 'category', 'concierge_offplatform',
   '"service fee to guest, not commission · VAT question open"'::jsonb, 'active',
   now(), 'From the rate card sheet. The VAT question is genuinely open.', now())
) as v(key, scope_kind, scope_category, value, status, effective_from, reason, activated_at)
where not exists (
  select 1 from settings.version x
  where x.key = v.key and x.scope_kind = 'category' and x.scope_category = v.scope_category);
