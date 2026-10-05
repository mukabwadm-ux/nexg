-- The rules view carries the thresholds too.
--
-- Orders needs to know, before a refund is typed, whether it will
-- need a second person. That figure lives in settings next to the
-- dispatch rules, and the console already reads one view for "what
-- is in force here" — so it reads one view, not two.
--
-- Dropped and recreated rather than replaced: `create or replace
-- view` cannot insert a column mid-list, and these belong beside
-- the other money figures rather than tacked on the end.

drop view if exists public.dispatch_rules_v;

create view public.dispatch_rules_v
with (security_invoker = true) as
select
  c.id as city_id,
  c.name as city,
  settings.fn_int('dispatch.accept_window_s', c.id)::int as accept_window_s,
  settings.fn_int('dispatch.rounds_before_boost', c.id)::int as rounds,
  settings.fn_num('dispatch.search_radius_km', c.id) as radius_km,
  settings.fn_num('dispatch.radius_increment_km', c.id) as radius_step_km,
  settings.fn_int('dispatch.boost_fee', c.id) as boost_cents,
  settings.fn_int('dispatch.boost_max', c.id) as boost_max_cents,
  settings.fn_int('dispatch.escalate_min', c.id)::int as escalate_min,
  settings.fn_int('dispatch.rider_cash_cap', c.id) as cash_cap_cents,
  settings.fn_bool('dispatch.stacking', c.id) as stacking,
  settings.fn_int('guest.free_cancel_delay_min', c.id)::int as free_cancel_min,

  /* The money ones. Null means nobody has published it, and the
     screen says so rather than implying no refund is ever held. */
  settings.fn_int('finance.refund_two_person_threshold', c.id) as refund_two_person_cents,
  settings.fn_int('finance.cancel_two_person_threshold', c.id) as cancel_two_person_cents,
  settings.fn_int('fees.cancellation_after_pickup', c.id) as rider_cancel_pay_cents,
  settings.fn_int('fees.merchant_cancel_compensation', c.id) as merchant_cancel_pay_cents,

  /* Printed as-is at the top of the workbench. An unset number
     shows as a dash rather than a default nobody chose. */
  concat_ws(' · ',
    coalesce(settings.fn_int('dispatch.accept_window_s', c.id)::text || ' s accept window', '[—] accept window'),
    coalesce(settings.fn_int('dispatch.rounds_before_boost', c.id)::text || ' rounds', '[—] rounds'),
    coalesce(settings.fn_num('dispatch.search_radius_km', c.id)::text || ' km radius', '[—] km radius')
  ) as reads_as
from public.city c;

comment on view public.dispatch_rules_v is
  'Everything in force in a city that the live and orders screens judge an action against — the cascade''s timings and the money thresholds — read from settings rather than restated.';

grant select on public.dispatch_rules_v to authenticated;
