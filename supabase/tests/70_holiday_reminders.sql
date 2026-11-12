-- Merchants are reminded to answer an upcoming public holiday.
--
-- `cron_holiday_reminders` rings the team of each live merchant that has not
-- answered a holiday inside its `prompt_merchants_days_before` window, once per
-- merchant and holiday. Merchants that answered, are not live, are demo
-- workspaces or are in another country are left alone; a second run sends
-- nothing; a holiday added late is picked up by the next run.
--
-- A test country with its own holidays, dated from today, keeps the seeded
-- Kenyan calendar and the day the suite runs out of the counts.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ------------------------------------------------------------------ fixtures

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values
  ('70000000-0000-0000-0000-0000000000c1', 'remindville', 'Remindville', 'Remindland',
   'KES', 'Africa/Nairobi', 'live', 995),
  ('70000000-0000-0000-0000-0000000000c2', 'otherton', 'Otherton', 'Otherland',
   'KES', 'Africa/Nairobi', 'live', 996);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('70000000-0000-0000-0000-0000000000a1'::uuid, 'a.owner@remind.example'),
  ('70000000-0000-0000-0000-0000000000a2'::uuid, 'a.manager@remind.example'),
  ('70000000-0000-0000-0000-0000000000b1'::uuid, 'b.owner@remind.example'),
  ('70000000-0000-0000-0000-0000000000c3'::uuid, 'c.owner@remind.example'),
  ('70000000-0000-0000-0000-0000000000d1'::uuid, 'd.owner@remind.example'),
  ('70000000-0000-0000-0000-0000000000e1'::uuid, 'e.owner@remind.example'),
  ('70000000-0000-0000-0000-0000000000f1'::uuid, 'f.owner@remind.example'),
  ('70000000-0000-0000-0000-0000000000f2'::uuid, 'g.owner@remind.example')
) as u (id, email);

/* A: live, two people. B: live, answers Founders Day. C: not live yet.
   D: live, on the new workspace. E: live, in another country. */
insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id
)
values
  ('70000000-0000-0000-0000-00000000000a', 'Alpha Limited', 'Alpha', 'restaurant', 'Amina A',
   '+254700000701', 'alpha@remind.example', '70000000-0000-0000-0000-0000000000c1'),
  ('70000000-0000-0000-0000-00000000000b', 'Beta Limited', 'Beta', 'restaurant', 'Baraka B',
   '+254700000702', 'beta@remind.example', '70000000-0000-0000-0000-0000000000c1'),
  ('70000000-0000-0000-0000-00000000000c', 'Gamma Limited', 'Gamma', 'restaurant', 'Chebet C',
   '+254700000703', 'gamma@remind.example', '70000000-0000-0000-0000-0000000000c1'),
  ('70000000-0000-0000-0000-00000000000d', 'Delta Limited', 'Delta', 'restaurant', 'Dalmas D',
   '+254700000704', 'delta@remind.example', '70000000-0000-0000-0000-0000000000c1'),
  ('70000000-0000-0000-0000-00000000000e', 'Epsilon Limited', 'Epsilon', 'restaurant', 'Esther E',
   '+254700000705', 'epsilon@remind.example', '70000000-0000-0000-0000-0000000000c2');

/* Two demo workspaces, both live. F has the fixed id supabase/demo-accounts.sql
   gives its restaurant demo, and was renamed during a demo. G is named
   "[Demo] …". Where the demo accounts are loaded, F already exists and is
   moved in. */
insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id
)
values
  (md5('demo-merchant-live-restaurants_food')::uuid, 'Fresh Name Limited', 'Fresh Name',
   'restaurants_food', 'Demo Owner', '+254700000706', 'f.demo@remind.example',
   '70000000-0000-0000-0000-0000000000c1'),
  ('70000000-0000-0000-0000-00000000000f', '[Demo] Showroom Limited', '[Demo] Showroom',
   'restaurant', 'Demo Owner', '+254700000707', 'g.demo@remind.example',
   '70000000-0000-0000-0000-0000000000c1')
on conflict (id) do update set city_id = excluded.city_id, trading_name = excluded.trading_name;

update public.merchant set status = 'live', went_live_at = now()
where id in ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000b',
             '70000000-0000-0000-0000-00000000000d', '70000000-0000-0000-0000-00000000000e',
             '70000000-0000-0000-0000-00000000000f', md5('demo-merchant-live-restaurants_food')::uuid);

insert into public.merchant_user (merchant_id, user_id, role) values
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'owner'),
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'manager'),
  ('70000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'owner'),
  ('70000000-0000-0000-0000-00000000000c', '70000000-0000-0000-0000-0000000000c3', 'owner'),
  ('70000000-0000-0000-0000-00000000000d', '70000000-0000-0000-0000-0000000000d1', 'owner'),
  ('70000000-0000-0000-0000-00000000000e', '70000000-0000-0000-0000-0000000000e1', 'owner'),
  (md5('demo-merchant-live-restaurants_food')::uuid, '70000000-0000-0000-0000-0000000000f1', 'owner'),
  ('70000000-0000-0000-0000-00000000000f', '70000000-0000-0000-0000-0000000000f2', 'owner')
on conflict do nothing;

/* What decides the workspace: an application row. */
insert into public.merchant_application (merchant_id, payload)
values ('70000000-0000-0000-0000-00000000000d', '{}'::jsonb);

insert into public.holiday_calendar (id, country, date, label, source, estimated, prompt_merchants_days_before)
values
  ('70000000-0000-0000-0000-000000000f01', 'Remindland', current_date + 2, 'Founders Day', 'manual', false, 3),
  ('70000000-0000-0000-0000-000000000f02', 'Remindland', current_date + 10, 'Far Day', 'manual', false, 3),
  ('70000000-0000-0000-0000-000000000f03', 'Remindland', current_date - 1, 'Gone Day', 'manual', false, 3),
  ('70000000-0000-0000-0000-000000000f04', 'Remindland', current_date + 5, 'Long Notice Day', 'manual', true, 7),
  ('70000000-0000-0000-0000-000000000f05', 'Otherland', current_date + 2, 'Other Day', 'manual', false, 3);

/* E's own country has a holiday too; the run must not cross borders, so
   Otherland's is answered and E has nothing pending. */
insert into public.merchant_holiday_hours (merchant_id, holiday_id, closed) values
  ('70000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-000000000f01', true),
  ('70000000-0000-0000-0000-00000000000e', '70000000-0000-0000-0000-000000000f05', false);

/* The seeded merchants and the real calendar sit outside this test: count
   them as already reminded, so the runs below give the same numbers on any
   day of the year, Jamhuri week included. */
insert into public.merchant_holiday_reminder (merchant_id, holiday_id)
select m.id, h.id
from public.merchant m
join public.city c on c.id = m.city_id
join public.holiday_calendar h
  on h.city_id = c.id or (h.city_id is null and h.country = c.country)
where c.country not in ('Remindland', 'Otherland')
on conflict do nothing;

-- ------------------------------------------------------------- first run

select is(
  public.cron_holiday_reminders(),
  '{"ok": true, "reminders": 5, "bells": 7, "failed": 0}'::jsonb,
  'the first run reminds five merchant-holiday pairs, ringing seven bells'
);

select results_eq(
  $$select m.trading_name, h.label, r.recipients
    from public.merchant_holiday_reminder r
    join public.merchant m on m.id = r.merchant_id
    join public.holiday_calendar h on h.id = r.holiday_id
    where h.country = 'Remindland'
    order by m.trading_name, h.label$$,
  $$values ('Alpha'::text, 'Founders Day'::text, 2),
           ('Alpha', 'Long Notice Day', 2),
           ('Beta', 'Long Notice Day', 1),
           ('Delta', 'Founders Day', 1),
           ('Delta', 'Long Notice Day', 1)$$,
  'live merchants are reminded of holidays inside each one''s window; an answered one, a far one and a past one are not'
);

select results_eq(
  $$select n.kind, n.title, n.href, n.tone::text
    from public.user_notification n
    where n.user_id = '70000000-0000-0000-0000-0000000000a2'
      and n.object_id = '70000000-0000-0000-0000-000000000f01'$$,
  $$values ('merchant.holiday_reminder'::text, 'Are you open on Founders Day?'::text,
            '/merchant/hours'::text, 'warning'::text)$$,
  'a manager is rung too, and a legacy account is sent to the Hours board'
);

select is(
  (select n.href from public.user_notification n
    where n.user_id = '70000000-0000-0000-0000-0000000000d1'
      and n.object_id = '70000000-0000-0000-0000-000000000f01'),
  '/merchant/availability',
  'a workspace account is sent to Availability'
);

select ok(
  (select n.body like '%still to be confirmed.' from public.user_notification n
    where n.user_id = '70000000-0000-0000-0000-0000000000a1'
      and n.object_id = '70000000-0000-0000-0000-000000000f04'),
  'an estimated date says it is still to be confirmed'
);

select is(
  (select count(*)::integer from public.user_notification n
    where n.kind = 'merchant.holiday_reminder'
      and n.user_id in ('70000000-0000-0000-0000-0000000000c3',
                        '70000000-0000-0000-0000-0000000000e1')),
  0,
  'nobody is rung for a merchant that is not live or for another country''s merchant'
);

select is(
  (select count(*)::integer from public.user_notification n
    where n.user_id = '70000000-0000-0000-0000-0000000000b1'
      and n.object_id = '70000000-0000-0000-0000-000000000f01'),
  0,
  'a merchant that answered is not rung about that holiday'
);

select is(
  (select count(*)::integer from public.merchant_holiday_reminder r
    where r.holiday_id::text like '70000000-%'
      and r.merchant_id in (md5('demo-merchant-live-restaurants_food')::uuid,
                            '70000000-0000-0000-0000-00000000000f')),
  0,
  'demo workspaces are left out: the demo script''s, even renamed, and any named [Demo]'
);

-- ----------------------------------------------------------- the next run

update public.user_notification set read_at = now()
where user_id = '70000000-0000-0000-0000-0000000000a1'
  and object_id = '70000000-0000-0000-0000-000000000f01';

select is(
  public.cron_holiday_reminders(),
  '{"ok": true, "reminders": 0, "bells": 0, "failed": 0}'::jsonb,
  'a second run reminds nobody again'
);

select ok(
  (select read_at is not null from public.user_notification
    where user_id = '70000000-0000-0000-0000-0000000000a1'
      and object_id = '70000000-0000-0000-0000-000000000f01'),
  'and a reminder already read stays read'
);

select is(
  (select count(*)::integer from public.user_notification where kind = 'merchant.holiday_reminder'
     and user_id::text like '70000000-%'),
  7,
  'no bell was added or doubled'
);

insert into public.holiday_calendar (id, country, date, label, source, estimated)
values ('70000000-0000-0000-0000-000000000f06', 'Remindland', current_date + 1, 'Short Notice Day',
        'manual', false);

select is(
  public.cron_holiday_reminders() ->> 'reminders',
  '3',
  'a holiday added late is picked up by the next run, for the three live merchants that are not demos'
);

-- ----------------------------------------------------------- who may run it

select ok(
  not has_function_privilege('anon', 'public.cron_holiday_reminders()', 'execute')
    and not has_function_privilege('authenticated', 'public.cron_holiday_reminders()', 'execute'),
  'neither the anonymous key nor a signed-in user can run the reminders'
);

select ok(
  exists (select 1 from public.notification_email_kind
          where kind = 'merchant.holiday_reminder' and enabled),
  'the reminder is emailed as well as rung'
);

select is(
  (select count(*)::integer from cron.job where jobname = 'holiday-reminders'
     and schedule = '0 4 * * *'),
  1,
  'it runs every morning at 07:00 Nairobi time'
);

select * from finish();
rollback;
