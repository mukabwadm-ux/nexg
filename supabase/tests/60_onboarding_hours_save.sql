-- Onboarding step 4 saves the opening hours.
--
-- `rpc_merchant_save_step` publishes the week as `merchant_hours` rows. Its
-- insert named `on conflict (merchant_id, day_of_week)`, and that key was
-- dropped when hours gained services and branches (20260101020300). From
-- then on every save that carried `hours` failed with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification", so no
-- applicant could get past the hours step.
--
-- The merchant saves twice because that is what the step does: the browser
-- saves as they go, and the second save has to replace the first week.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'hours.owner@shop.example', '', now(), now(), now());

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id
)
values (
  '60000000-0000-0000-0000-000000000002',
  'Saa Kumi Limited', 'Saa Kumi', 'restaurant', 'Achieng Otieno',
  '+254700000060', 'hours.owner@shop.example',
  (select id from public.city where slug = 'nairobi')
);

insert into public.merchant_user (merchant_id, user_id, role)
values ('60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'owner');

-- ------------------------------------------------- the first save, as the owner

set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';

/* The shape step-hours.tsx sends when "Same every day" is chosen. */
select lives_ok(
  $$select public.rpc_merchant_save_step(
      '60000000-0000-0000-0000-000000000002', 4::smallint,
      '{"hours_pattern": "same_daily",
        "hours": {"mon": {"open": "10:00", "close": "23:00"},
                  "tue": {"open": "10:00", "close": "23:00"},
                  "wed": {"open": "10:00", "close": "23:00"},
                  "thu": {"open": "10:00", "close": "23:00"},
                  "fri": {"open": "10:00", "close": "23:00"},
                  "sat": {"open": "10:00", "close": "23:00"},
                  "sun": {"open": "10:00", "close": "23:00"}}}'::jsonb)$$,
  'the owner can save a week of opening hours'
);

set local role postgres;

select results_eq(
  $$select day_of_week, opens, closes, closed
      from public.merchant_hours
     where merchant_id = '60000000-0000-0000-0000-000000000002'
     order by day_of_week$$,
  $$values (0::smallint, '10:00'::time, '23:00'::time, false),
           (1::smallint, '10:00'::time, '23:00'::time, false),
           (2::smallint, '10:00'::time, '23:00'::time, false),
           (3::smallint, '10:00'::time, '23:00'::time, false),
           (4::smallint, '10:00'::time, '23:00'::time, false),
           (5::smallint, '10:00'::time, '23:00'::time, false),
           (6::smallint, '10:00'::time, '23:00'::time, false)$$,
  'and it is published as one row per day, Sunday as 0'
);

-- ---------------------------------------------- the second save replaces it

set local role authenticated;

select lives_ok(
  $$select public.rpc_merchant_save_step(
      '60000000-0000-0000-0000-000000000002', 4::smallint,
      '{"hours_pattern": "custom",
        "hours": {"mon": {"open": "08:00", "close": "17:00"},
                  "sat": {"open": "09:00", "close": "14:00"},
                  "sun": {"closed": true}}}'::jsonb)$$,
  'saving the hours again works too'
);

set local role postgres;

select results_eq(
  $$select day_of_week, opens, closes, closed
      from public.merchant_hours
     where merchant_id = '60000000-0000-0000-0000-000000000002'
     order by day_of_week$$,
  $$values (0::smallint, null::time, null::time, true),
           (1::smallint, '08:00'::time, '17:00'::time, false),
           (6::smallint, '09:00'::time, '14:00'::time, false)$$,
  'and the new week replaces the old one rather than adding to it'
);

/* Reaching step 4 is a state change; saving step 4 again is not. */
select is(
  (select count(*)::int from audit.audit_event
    where action = 'merchant.step_saved'
      and target_id = '60000000-0000-0000-0000-000000000002'),
  1,
  'reaching the hours step is audited once, not once per save'
);

select * from finish();
rollback;
