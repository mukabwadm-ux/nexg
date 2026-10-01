-- Local development fixtures · featured slots.
--
-- Runs only on `supabase db reset`. Merchant names are bracketed the
-- way the artboards bracket them. The rate-card prices here are
-- invented so the inventory and billing design can be judged; on
-- production every price is still null and the console says so, which
-- is the state the module actually ships in.

-- ── a rate card, so slots can be sold at all ─────────────────────

update public.featured_rate_card
set status = 'current',
    effective_from = date_trunc('week', now())::date,
    prices = jsonb_build_object(
      'homepage', 12000,
      'category_top', jsonb_build_object('default', 8000,
                                         'overrides', jsonb_build_object('restaurant', 9500)),
      'popular_request', 5000),
    vat_pct = 16
where city_id = (select id from public.city where slug = 'nairobi');

update public.featured_slot_week sw
set price = public.fn_featured_price(p.city_id, p.kind, p.category, sw.week_start)
from public.featured_placement p
where p.id = sw.placement_id;

-- ── merchants who could hold a slot ──────────────────────────────

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000',
       ('fa000000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated','authenticated','featured' || n || '@example.test','',now(),now(),now()
from generate_series(1, 8) n
on conflict do nothing;

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id, status, explore_visible, accepting_orders,
                             went_live_at, health_band, health_score, payout_name_lookup)
values
  ('fb000000-0000-4000-8000-000000000001','[Legal] Ltd','[Grill restaurant]','restaurant',
   '[Contact]','+254700000851','f1@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '120 days','green', 91,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000002','[Legal] Ltd','[Sushi place]','restaurant',
   '[Contact]','+254700000852','f2@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '90 days','green', 86,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000003','[Legal] Ltd','[Flower studio]','florist',
   '[Contact]','+254700000853','f3@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '200 days','green', 89,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000004','[Legal] Ltd','[Bakery]','restaurant',
   '[Contact]','+254700000854','f4@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '150 days','amber', 64,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000005','[Legal] Ltd','[Pizza place]','restaurant',
   '[Contact]','+254700000855','f5@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '70 days','green', 84,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000006','[Legal] Ltd','[Florist B]','florist',
   '[Contact]','+254700000856','f6@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '95 days','green', 88,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000007','[Legal] Ltd','[New merchant]','laundry',
   '[Contact]','+254700000857','f7@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '12 days', null, null,'{"matched": true}'::jsonb),
  ('fb000000-0000-4000-8000-000000000008','[Legal] Ltd','[Coffee roaster]','restaurant',
   '[Contact]','+254700000858','f8@example.test',
   (select id from public.city where slug='nairobi'),'live', true, true,
   now() - interval '60 days','red', 48,'{"matched": true}'::jsonb)
on conflict (id) do nothing;

insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
select id, 'Main', '[Address]', true from public.merchant
where id::text like 'fb000000-0000-4000-8000-%'
on conflict do nothing;

/* Health history: the streak is what eligibility actually reads. */
insert into public.merchant_health_snapshot (merchant_id, as_of, band, score)
select m.id, current_date - n,
       case
         when m.trading_name = '[Bakery]' and n < 4 then 'amber'
         when m.trading_name = '[Coffee roaster]' and n < 2 then 'red'
         else 'green'
       end::public.health_band,
       coalesce(m.health_score, 80)
from public.merchant m, generate_series(0, 44) n
where m.id::text like 'fb000000-0000-4000-8000-%'
  and m.trading_name <> '[New merchant]'
on conflict do nothing;

-- ── bookings across the lifecycle ────────────────────────────────

do $$
declare
  v_city uuid := (select id from public.city where slug = 'nairobi');
  v_week date := date_trunc('week', now())::date;
  v_booking uuid;
  v_placement uuid;
  r record;
begin
  /* Three live homepage slots and one auto-paused, so every pill on
     the Inventory tab has something behind it. */
  for r in
    select * from (values
      ('fb000000-0000-4000-8000-000000000001'::uuid, 1, 'live'),
      ('fb000000-0000-4000-8000-000000000002'::uuid, 2, 'live'),
      ('fb000000-0000-4000-8000-000000000003'::uuid, 3, 'live'),
      ('fb000000-0000-4000-8000-000000000004'::uuid, 4, 'auto_paused')
    ) as t(merchant_id, pos, state)
  loop
    select id into v_placement from public.featured_placement
    where city_id = v_city and kind = 'homepage' and position = r.pos;

    insert into public.featured_booking
      (merchant_id, placement_id, placement_kind, city_id, status, requested_via,
       weeks, auto_renew, eligibility, start_date, end_date, quoted_price,
       confirmed_at, paused_at, pause_reason, pause_source)
    values (
      r.merchant_id, v_placement, 'homepage', v_city, r.state::public.booking_status, 'dashboard',
      4, true,
      public.fn_featured_eligibility(r.merchant_id, 'homepage'),
      v_week - 14, v_week + 18, 12000, now() - interval '20 days',
      case when r.state = 'auto_paused' then now() - interval '1 day' end,
      case when r.state = 'auto_paused' then 'health_green_30d' end,
      case when r.state = 'auto_paused' then 'system' end)
    returning id into v_booking;

    insert into public.featured_creative (booking_id, merchant_id, headline, blurb, status)
    select v_booking, r.merchant_id, m.trading_name,
           case when r.pos = 1 then 'Late-night · open till 02:00' end, 'approved'
    from public.merchant m where m.id = r.merchant_id;

    update public.featured_slot_week
    set booking_id = v_booking,
        status = (case when r.state = 'auto_paused' then 'auto_paused' else 'live' end)::public.slot_status
    where placement_id = v_placement and week_start = v_week;

    update public.featured_slot_week
    set booking_id = v_booking, status = 'booked'
    where placement_id = v_placement and week_start in (v_week + 7, v_week + 14);

    perform public.fn_featured_fee_for_week(
      v_booking, v_week, case when r.state = 'auto_paused' then 3 else 7 end);
    perform public.fn_featured_fee_for_week(v_booking, v_week - 7, 7);

    /* A week of traffic, so the Performance tab has shape. */
    insert into public.featured_metrics_daily
      (booking_id, merchant_id, day, views, taps, orders, ctr, conversion)
    select v_booking, r.merchant_id, v_week + d,
           v.views, v.taps, v.orders,
           round(v.taps::numeric / v.views, 4),
           round(v.orders::numeric / v.taps, 4)
    from generate_series(0, 4) d
    cross join lateral (
      select (240 + r.pos * 95 + (d * 37) % 140) as views,
             (14 + r.pos * 4 + (d * 7) % 11) as taps,
             (1 + (r.pos + d) % 4) as orders
    ) v
    on conflict do nothing;
  end loop;

  /* One held category-top slot, quoted and awaiting confirmation. */
  select id into v_placement from public.featured_placement
  where city_id = v_city and kind = 'category_top' and category = 'florist';

  insert into public.featured_booking
    (merchant_id, placement_id, placement_kind, category, city_id, status, requested_via,
     weeks, eligibility, start_date, end_date, quoted_price,
     hold_expires_at, quote_expires_at, requested_at)
  values ('fb000000-0000-4000-8000-000000000006', v_placement, 'category_top', 'florist',
          v_city, 'quoted', 'dashboard', 4,
          public.fn_featured_eligibility('fb000000-0000-4000-8000-000000000006',
                                         'category_top', 'florist'),
          v_week + 7, v_week + 25, 8000,
          now() + interval '31 hours', now() + interval '31 hours',
          now() - interval '2 days')
  returning id into v_booking;

  update public.featured_slot_week set booking_id = v_booking, status = 'held'
  where placement_id = v_placement and week_start between v_week + 7 and v_week + 28;

  /* And a spread of requests: eligible, waitlisted, blocked, too new. */
  insert into public.featured_booking
    (merchant_id, placement_kind, category, city_id, status, requested_via, weeks,
     eligibility, waitlist_rank, requested_at)
  values
    ('fb000000-0000-4000-8000-000000000005','homepage', null, v_city,'waitlisted','dashboard', 2,
     public.fn_featured_eligibility('fb000000-0000-4000-8000-000000000005','homepage'), 1,
     now() - interval '9 days'),
    ('fb000000-0000-4000-8000-000000000004','homepage', null, v_city,'waitlisted','dashboard', 4,
     public.fn_featured_eligibility('fb000000-0000-4000-8000-000000000004','homepage'), 2,
     now() - interval '4 days'),
    ('fb000000-0000-4000-8000-000000000007','category_top','laundry', v_city,'requested',
     'dashboard', 2,
     public.fn_featured_eligibility('fb000000-0000-4000-8000-000000000007',
                                    'category_top','laundry'), null,
     now() - interval '3 days'),
    ('fb000000-0000-4000-8000-000000000008','category_top','restaurant', v_city,'requested',
     'dashboard', 2,
     public.fn_featured_eligibility('fb000000-0000-4000-8000-000000000008',
                                    'category_top','restaurant'), null,
     now() - interval '5 days');
end;
$$;
