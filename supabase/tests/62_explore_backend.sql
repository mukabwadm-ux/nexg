-- Local-only pgTAP coverage for Explore. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- A deterministic local-only quote fee; rolled back with every fixture.
update public.setting set value = '{"flat_kes":100}'::jsonb
where key = 'experience_fee_rule' and scope = 'global';

create function pg_temp.xid(label text) returns uuid language sql immutable
as $$ select md5('explore-backend-62:' || label)::uuid $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', pg_temp.xid(n), 'authenticated', 'authenticated',
       'explore62.' || n || '@example.test', '', now(), now(), now()
from unnest(array['owner','other','merchant','staff']) n;
insert into public.guest(id,user_id,name)
values (pg_temp.xid('guest'),pg_temp.xid('owner'),'Invented Explore guest'),
       (pg_temp.xid('other-guest'),pg_temp.xid('other'),'Invented other guest');
insert into public.merchant(id,legal_name,trading_name,category,contact_name,contact_phone,contact_email,city_id,answers)
select pg_temp.xid('m' || n), 'Invented Explore ' || n, 'Invented Explore ' || n,
       'restaurant', 'Test owner', '+254700000062', 'explore62.m' || n || '@example.test',
       (select id from public.city where slug='nairobi'), '{}'
from generate_series(1,4) n;
set local session_replication_role = replica;
update public.merchant set status='live',went_live_at=now(),explore_visible=true
where id in (pg_temp.xid('m1'),pg_temp.xid('m2'),pg_temp.xid('m3'));
set local session_replication_role = origin;
insert into public.merchant_branch(id,merchant_id,name,address_text,is_primary)
values (pg_temp.xid('branch'),pg_temp.xid('m1'),'Invented branch','Invented address',true);
insert into public.merchant_user(merchant_id,user_id,role)
values (pg_temp.xid('m1'),pg_temp.xid('merchant'),'owner');
insert into public.staff_user(id,user_id,email,display_name)
values (pg_temp.xid('staff-record'),pg_temp.xid('staff'),'explore62.staff@example.test','Invented Explore staff');
insert into public.role_grant(staff_user_id,role_id,city_id,granted_by)
select pg_temp.xid('staff-record'),r.id,(select id from public.city where slug='nairobi'),pg_temp.xid('staff-record')
from public.role r where r.key in ('merchant_ops','concierge_agent');
insert into public.concierge_shift(staff_user_id,city_id,online,capacity,since)
values (pg_temp.xid('staff-record'),(select id from public.city where slug='nairobi'),true,50,now()-interval '10 years');

insert into public."order"(id,reference,guest_id,merchant_id,branch_id,city_id,dropoff_label,
                         payment_method,stage,handed_to,delivered_at,placed_at)
select pg_temp.xid('o' || n), 'TEST-EXPLORE-62-' || n,
       case when n=9 then pg_temp.xid('other-guest') else pg_temp.xid('guest') end,
       pg_temp.xid('m1'),pg_temp.xid('branch'),(select id from public.city where slug='nairobi'),
       'Invented address','cash_on_delivery',
       case when n=8 then 'placed'::public.order_stage else 'delivered'::public.order_stage end,
       'guest', case when n=7 then now()-interval '15 days' else now()-interval '1 day' end,
       case when n=10 then now()-interval '91 days' else now()-interval '2 days' end
from generate_series(1,10) n;
insert into public.order_rating(order_id,merchant_id,stars,about)
select pg_temp.xid('o' || n),pg_temp.xid('m1'),case when n=4 then 5 else 4 end,'food'
from generate_series(1,4) n;

set local role anon;
select is((select count(*) from public.merchant_rating_public where merchant_id=pg_temp.xid('m1')),0::bigint,'four ratings remain unknown');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o5'),5)$$,'42501',null,'signed-out rating refused');
select throws_ok($$select public.rpc_my_recent_categories()$$,'42501',null,'anonymous recent history unavailable');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('owner'),'role','authenticated')::text,true);
set local role authenticated;
select lives_ok($$select public.rpc_order_rate(pg_temp.xid('o5'),5,'  Lovely  ')$$,'owner rates once');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o5'),5)$$,'23505','This order has already been rated.','duplicate rating is clear');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o9'),5)$$,'42501',null,'another customer cannot rate');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o8'),5)$$,'22023',null,'undelivered order refused');
select lives_ok($$select public.rpc_order_rate(pg_temp.xid('o7'),5)$$,'completed orders stay eligible beyond fourteen days');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o6'),0)$$,'22023',null,'zero stars refused');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o6'),6)$$,'22023',null,'six stars refused');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o6'),null)$$,'22023',null,'null stars refused');
select throws_ok($$select public.rpc_order_rate(pg_temp.xid('o6'),4,repeat('x',501))$$,'22023',null,'long comment refused');
reset role;
select is((select comment from public.order_rating where order_id=pg_temp.xid('o5')),'Lovely','comment trimmed');
select is((select branch_id from public.order_rating where order_id=pg_temp.xid('o5')),pg_temp.xid('branch'),'branch copied from order');
select is((select about from public.order_rating where order_id=pg_temp.xid('o5')),'order','rating targets order');
insert into public.order_rating(order_id,merchant_id,stars,about)
values(pg_temp.xid('o6'),pg_temp.xid('m1'),1,'rider');
set local role anon;
select is((select rating_count from public.merchant_rating_public where merchant_id=pg_temp.xid('m1')),6::bigint,'rider rating excluded');
select is((select rating_avg from public.merchant_rating_public where merchant_id=pg_temp.xid('m1')),4.5::numeric,'eligible ratings averaged to one decimal');
select is((select count(*) from public.merchant_traits_public where merchant_id=pg_temp.xid('m4')),0::bigint,'hidden merchant traits absent');
select is((select count(*) from public.merchant_popularity_public where merchant_id=pg_temp.xid('m4')),0::bigint,'hidden popularity absent');
select is((select band from public.merchant_popularity_public where merchant_id=pg_temp.xid('m2')),0,'no completed work means band zero');
select ok((select band between 1 and 3 from public.merchant_popularity_public where merchant_id=pg_temp.xid('m1')),'completed work receives positive band');
reset role;
update public.merchant set explore_visible=false where id=pg_temp.xid('m1');
set local role anon;
select is((select count(*) from public.merchant_rating_public where merchant_id=pg_temp.xid('m1')),0::bigint,'hidden merchant ratings absent');
reset role;
update public.merchant set explore_visible=true where id=pg_temp.xid('m1');

-- Every allowlisted trait is checked in each representation, not just a sample.
update public.merchant set answers='{"has_physical_seating":true,"table_service":true,"reservation_system":true,"with_driver":true,"family_meals":true,"wifi_available":true,"vegan_menu":true,"private_note":"never publish"}'
where id=pg_temp.xid('m1');
set local role anon;
select ok((to_jsonb(t)->k)='true'::jsonb,'boolean true: '||k)
from public.merchant_traits_public t cross join unnest(array['has_physical_seating','table_service','reservation_system','with_driver','family_meals','wifi_available','vegan_menu']) k
where merchant_id=pg_temp.xid('m1');
select ok(not (to_jsonb(t) ? 'private_note') and not (to_jsonb(t) ? 'answers'),'private answers never published')
from public.merchant_traits_public t where merchant_id=pg_temp.xid('m1');
reset role;
update public.merchant set answers=(select jsonb_object_agg(k,'yes'::text) from jsonb_object_keys(answers) k) where id=pg_temp.xid('m1');
set local role anon;
select ok((to_jsonb(t)->k)='true'::jsonb,'yes string: '||k)
from public.merchant_traits_public t cross join unnest(array['has_physical_seating','table_service','reservation_system','with_driver','family_meals','wifi_available','vegan_menu']) k where merchant_id=pg_temp.xid('m1');
reset role;
update public.merchant set answers=(select jsonb_object_agg(k,false) from jsonb_object_keys(answers) k) where id=pg_temp.xid('m1');
set local role anon;
select ok((to_jsonb(t)->k)='false'::jsonb,'boolean false: '||k)
from public.merchant_traits_public t cross join unnest(array['has_physical_seating','table_service','reservation_system','with_driver','family_meals','wifi_available','vegan_menu']) k where merchant_id=pg_temp.xid('m1');
reset role;
update public.merchant set answers=(select jsonb_object_agg(k,'no'::text) from jsonb_object_keys(answers) k) where id=pg_temp.xid('m1');
set local role anon;
select ok((to_jsonb(t)->k)='false'::jsonb,'no string: '||k)
from public.merchant_traits_public t cross join unnest(array['has_physical_seating','table_service','reservation_system','with_driver','family_meals','wifi_available','vegan_menu']) k where merchant_id=pg_temp.xid('m1');
reset role;
update public.merchant set answers=(select jsonb_object_agg(k,'maybe'::text) from jsonb_object_keys(answers) k) where id=pg_temp.xid('m1');
set local role anon;
select ok((to_jsonb(t)->k)='null'::jsonb,'other answer unknown: '||k)
from public.merchant_traits_public t cross join unnest(array['has_physical_seating','table_service','reservation_system','with_driver','family_meals','wifi_available','vegan_menu']) k where merchant_id=pg_temp.xid('m1');
reset role;
update public.merchant set answers='{}' where id=pg_temp.xid('m1');
set local role anon;
select ok((to_jsonb(t)->k)='null'::jsonb,'missing answer unknown: '||k)
from public.merchant_traits_public t cross join unnest(array['has_physical_seating','table_service','reservation_system','with_driver','family_meals','wifi_available','vegan_menu']) k where merchant_id=pg_temp.xid('m1');
select is((select google_place_id from public.merchant_traits_public where merchant_id=pg_temp.xid('m1')),null::text,'place ID null by default');
select columns_are('public','merchant_popularity_public',array['merchant_id','band'],'only band and identity published');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('merchant'),'role','authenticated')::text,true);
set local role authenticated;
select throws_ok($$update public.merchant_branch set google_place_id='test-place' where id=pg_temp.xid('branch')$$,'42501',null,'merchant cannot set place ID');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('staff'),'role','authenticated')::text,true);
set local role authenticated;
select lives_ok($$update public.merchant_branch set google_place_id='test-place' where id=pg_temp.xid('branch')$$,'staff can set place ID');
select throws_ok($$update public.merchant_branch set google_place_id=repeat('x',256) where id=pg_temp.xid('branch')$$,'23514',null,'place ID length enforced');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('owner'),'role','authenticated')::text,true);
set local role authenticated;
update public.merchant_branch set google_place_id='customer-write' where id=pg_temp.xid('branch');
select is((select google_place_id from public.merchant_traits_public where merchant_id=pg_temp.xid('m1')),'test-place','customer cannot change place ID');
select is((select sum(times) from public.rpc_my_recent_categories()),8::numeric,'recent categories exclude other owner and ninety-one-day order');
select ok((select count(*)<=10 from public.rpc_my_recent_categories()),'recent categories capped at ten');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('other'),'role','authenticated')::text,true);
set local role authenticated;
select is((select sum(times) from public.rpc_my_recent_categories()),1::numeric,'other owner sees only one own order');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.rpc_my_recent_categories()),0::bigint,'null user sees no history');
reset role;

-- Completed bookings affect popularity without exposing any volume.
insert into public.bookable_resource(id,merchant_id,model,name)
values(pg_temp.xid('resource'),pg_temp.xid('m2'),'exclusive','Invented Explore resource');
insert into public.booking(id,merchant_id,resource_id,starts_at,ends_at,held_during,status,guest_user_id,created_at)
values(pg_temp.xid('booking'),pg_temp.xid('m2'),pg_temp.xid('resource'),now()-interval '2 days',now()-interval '1 day',
       tstzrange(now()-interval '2 days',now()-interval '1 day'),'completed',pg_temp.xid('owner'),now()-interval '2 days');
set local role anon;
select ok((select band>0 from public.merchant_popularity_public where merchant_id=pg_temp.xid('m2')),'completed booking changes band');
select throws_ok($$select count(*) from public.booking$$,'42501',null,'anonymous cannot read booking counts');
select throws_ok($$select count(*) from public."order"$$,'42501',null,'anonymous cannot read order counts');
reset role;
update public.booking set ends_at=now()-interval '31 days',starts_at=now()-interval '32 days' where id=pg_temp.xid('booking');
set local role anon;
select is((select band from public.merchant_popularity_public where merchant_id=pg_temp.xid('m2')),0,'old completed booking drops out');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('owner'),'role','authenticated')::text,true);
set local role authenticated;
select is((select sum(times) from public.rpc_my_recent_categories()),9::numeric,'own booking included in recent categories');

-- Explore writes a normal draft, then the existing concierge workflow owns it.
insert into public.plan(id,user_id,city_id,status,budget_kes,moods,answers)
values(pg_temp.xid('plan'),pg_temp.xid('owner'),(select id from public.city where slug='nairobi'),
       'draft',10000,'{taste}','{"origin":"app-explore","brief":{"feature":"day"}}');
insert into public.plan_block(id,plan_id,slot,kind,title_snapshot,merchant_id)
values(pg_temp.xid('block1'),pg_temp.xid('plan'),'midday','meal','Invented stop one',pg_temp.xid('m1')),
      (pg_temp.xid('block2'),pg_temp.xid('plan'),'evening','meal','Invented stop two',pg_temp.xid('m2'));
select throws_ok($$insert into public.plan_block(plan_id,slot,kind,title_snapshot,merchant_id)
values(pg_temp.xid('plan'),'midday','meal','Hidden stop',pg_temp.xid('m4'))$$,'42501',null,'hidden merchant refused');
select lives_ok($$select public.fn_build_plan(pg_temp.xid('plan'))$$,'rebuild with merchant stops is safe');
select is((select count(*) from public.plan_block where plan_id=pg_temp.xid('plan')),2::bigint,'rebuild neither deletes nor supplements chosen day');
select is((select title_snapshot from public.plan_block where id=pg_temp.xid('block1')),'Invented stop one','rebuild preserves title');
select is((select count(*) from public.plan_block where plan_id=pg_temp.xid('plan') and component_id is null),2::bigint,'merchant stops need no catalogue component');
select lives_ok($$select public.rpc_send_plan(pg_temp.xid('plan'),'Invented guest','+254700000062')$$,'send through unchanged plan RPC');
select is((select status::text from public.plan where id=pg_temp.xid('plan')),'sent','plan reaches sent');
select ok((select concierge_id is not null from public.plan where id=pg_temp.xid('plan')),'plan assigned to a concierge');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('staff'),'role','authenticated')::text,true);
set local role authenticated;
select lives_ok($$select public.rpc_claim_plan(pg_temp.xid('plan'))$$,'concierge claims plan');
select lives_ok($$select public.rpc_confirm_block(pg_temp.xid('block1'),1000)$$,'concierge confirms merchant block');
select lives_ok($$select public.rpc_confirm_block(pg_temp.xid('block2'),2000)$$,'concierge confirms second merchant block');
select lives_ok($$select public.rpc_quote_plan(pg_temp.xid('plan'))$$,'unchanged quote flow accepts merchant plan');
select is((select status::text from public.plan where id=pg_temp.xid('plan')),'quoted','plan reaches quote');
reset role;
-- Complete service contract: owner scoping, retry safety, and separate targets.
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('owner'),'role','authenticated')::text,true);
set local role authenticated;
select is(public.rpc_my_rating_context('booking',pg_temp.xid('booking'))->>'eligible','true','completed booking stays eligible without expiry');
select is(public.rpc_service_rate('booking',pg_temp.xid('booking'),4,'  Good service  ')->'rating'->>'comment','Good service','booking rating stored and trimmed');
select is(public.rpc_service_rate('booking',pg_temp.xid('booking'),4,'Good service')->'rating'->>'stars','4','same booking submission is retry safe');
select throws_ok($$select public.rpc_service_rate('booking',pg_temp.xid('booking'),2,'Changed')$$,'23505',null,'different duplicate refused');
select is(public.rpc_my_rating_context('booking',pg_temp.xid('booking'))->>'eligible','false','rated booking no longer prompts');
select is(public.rpc_my_rating_context('order',pg_temp.xid('o8'))->>'eligible','false','uncompleted order has no rating action');
select throws_ok($$select public.rpc_service_rate('order',pg_temp.xid('o8'),5)$$,'22023',null,'backend also refuses premature rating');
select is(public.rpc_service_rate('order',pg_temp.xid('o6'),3,'Meal only')->'rating'->>'stars','3','legacy rider score does not block merchant rating');
select is(public.rpc_my_rating_context('order',pg_temp.xid('o6'))->'rider'->>'eligible','false','rider milestone stays gated until confirmed');
select throws_ok($$select public.rpc_service_rate('booking',pg_temp.xid('booking'),0)$$,'22023',null,'service stars validated');
select throws_ok($$select public.rpc_service_rate('booking',pg_temp.xid('booking'),4,repeat('x',501))$$,'22023',null,'service comment length validated');
select throws_ok($$select public.rpc_my_rating_context('stay',pg_temp.xid('booking'))$$,'22023',null,'unverified stay ownership cannot be guessed');
select is(public.rpc_my_rating_context('plan_block',pg_temp.xid('block1'))->>'eligible','false','quoted stop is not a completed service');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('other'),'role','authenticated')::text,true);
set local role authenticated;
select throws_ok($$select public.rpc_my_rating_context('booking',pg_temp.xid('booking'))$$,'42501',null,'other customer cannot read booking rating');
select throws_ok($$select public.rpc_service_rate('booking',pg_temp.xid('booking'),5)$$,'42501',null,'other customer cannot submit booking rating');
select is((select count(*) from public.service_rating),0::bigint,'direct service rating reads are owner scoped');
reset role;
set local session_replication_role = replica;
update public.plan set status='completed',completed_at=now(),paid_at=now(),payment_reference='TEST-ONLY-62' where id=pg_temp.xid('plan');
set local session_replication_role = origin;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('owner'),'role','authenticated')::text,true);
set local role authenticated;
select is(public.rpc_service_rate('plan_block',pg_temp.xid('block1'),5,'First meal')->'rating'->>'stars','5','first completed plan stop can be rated');
select is(public.rpc_service_rate('plan_block',pg_temp.xid('block2'),4,'Second meal')->'rating'->>'stars','4','each completed plan stop has its own rating');
reset role;
set local role anon;
select throws_ok($$select public.rpc_my_rating_context('booking',pg_temp.xid('booking'))$$,'42501',null,'anonymous context refused');
select throws_ok($$select public.rpc_service_rate('booking',pg_temp.xid('booking'),5)$$,'42501',null,'anonymous submission refused');
select throws_ok($$select * from public.service_rating$$,'42501',null,'private service rows not public');
select is((select rating_count from public.merchant_rating_public where merchant_id=pg_temp.xid('m1')),8::bigint,'merchant quality includes service scores but not rider score');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('owner'),'role','authenticated')::text,true);
set local role authenticated;
select is((select count(*) from public.rpc_my_completed_rating_stops()),2::bigint,'completed feed includes each owned merchant stop');
select is((select count(*) from public.rpc_my_completed_rating_stops(null,null,1)),1::bigint,'completed feed page limit enforced');
select is((select count(*) from public.rpc_my_completed_rating_stops(
  (select completed_at from public.rpc_my_completed_rating_stops(null,null,1)),
  (select id from public.rpc_my_completed_rating_stops(null,null,1)),100)),1::bigint,'keyset cursor does not repeat first stop');
select throws_ok($$select public.rpc_my_completed_rating_stops(now(),null,100)$$,'22023',null,'partial cursor refused');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.xid('other'),'role','authenticated')::text,true);
set local role authenticated;
select is((select count(*) from public.rpc_my_completed_rating_stops()),0::bigint,'completed feed excludes another customer stops');
reset role;
set local role anon;
select throws_ok($$select public.rpc_my_completed_rating_stops()$$,'42501',null,'completed feed rejects anonymous callers');
reset role;
select * from finish();
rollback;
