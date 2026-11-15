begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users(instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('c0740000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'authenticated', 'authenticated', case when n <> 3 then 'saved74-' || n || '@example.test' end,
  case when n <> 3 then now() end, n=3, now(), now()
from generate_series(1,3) n;
insert into public.merchant(id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
  city_id, status, explore_visible, accepting_orders, went_live_at)
select ('c0741000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '[Legal 74]',
  case n when 1 then 'Alpha 74' when 2 then 'Bravo 74' else '[Unavailable 74]' end,
  'restaurant', '[Contact]', '+25470007400' || n, 'merchant74-' || n || '@example.test',
  (select id from public.city where slug='nairobi'), 'live', n<>3, true, now()
from generate_series(1,3) n;
insert into public.merchant_branch(id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c0742000-0000-4000-8000-000000000001', 'c0741000-0000-4000-8000-000000000001',
  '[Branch]', '[Address]', true, 0, 36);
insert into public.customer_saved(id,user_id,kind,merchant_id,created_at)
select ('c0743000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'c0740000-0000-4000-8000-000000000001', 'merchant',
  ('c0741000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '2026-11-15T00:00:00Z'::timestamptz+n*interval '1 minute'
from generate_series(1,3) n;
insert into public.customer_saved(id,user_id,kind,merchant_id)
values ('c0743000-0000-4000-8000-000000000004','c0740000-0000-4000-8000-000000000002',
  'merchant','c0741000-0000-4000-8000-000000000001');

select ok(not has_function_privilege('anon','public.rpc_my_saved_places(uuid,text,text,jsonb,integer)','EXECUTE'), 'Anonymous role cannot read Saved.');
select ok(not has_function_privilege('service_role','public.rpc_my_saved_places(uuid,text,text,jsonb,integer)','EXECUTE')
  and not has_function_privilege('service_role','public.rpc_saved_add(uuid,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.rpc_saved_remove(uuid)','EXECUTE'),
  'Saved uses the authenticated account RPCs.');
select ok(not has_table_privilege('authenticated','public.customer_saved','INSERT'), 'Direct insert cannot bypass account capacity.');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.rpc_my_saved_places()$$,'42501','Sign in to view Saved.','A bearer subject is required.');
select set_config('request.jwt.claims','{"sub":"c0740000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select public.rpc_saved_add('c0741000-0000-4000-8000-000000000001')$$,
  '42501','Sign in to save places.','Auth anonymous state cannot be forged by a claim.');
select set_config('request.jwt.claims','{"sub":"c0740000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.rpc_my_saved_places()->>'totalCount','3','Only the account merchant saves are counted.');
select is(public.rpc_my_saved_places()->'rows'->0->>'id','c0743000-0000-4000-8000-000000000003','Recent ordering is stable.');
select is(public.rpc_my_saved_places('c0743000-0000-4000-8000-000000000001')->'rows'->0->'merchant'->>'latitude','0','Original public zero latitude is preserved.');
select is(public.rpc_my_saved_places('c0743000-0000-4000-8000-000000000003')->'rows'->0->'merchant','null'::jsonb,'A hidden merchant stays saved but exposes no public facts.');
select is(public.rpc_my_saved_places('c0743000-0000-4000-8000-000000000004')->'rows','[]'::jsonb,'Foreign record lookup is empty.');
select is(public.rpc_saved_add('c0741000-0000-4000-8000-000000000001')->>'id','c0743000-0000-4000-8000-000000000001','Repeated save preserves identity.');
select is(public.rpc_saved_add('c0741000-0000-4000-8000-000000000003')->>'id','c0743000-0000-4000-8000-000000000003',
  'Repeating an existing save preserves its identity after the listing becomes hidden.');
select is(public.rpc_my_saved_places(p_search=>'lph')->>'totalCount','1','Search is applied before pagination.');
select is(public.rpc_my_saved_places(p_search=>'74',p_sort=>'name')->'rows'->0->>'merchantId',
  'c0741000-0000-4000-8000-000000000001','Name sort uses the current public name.');
select is(public.rpc_my_saved_places(p_limit=>1,p_cursor=>public.rpc_my_saved_places(p_limit=>1)->'nextCursor')->'rows'->0->>'id',
  'c0743000-0000-4000-8000-000000000002','Keyset paging advances without repeating the first row.');
select throws_ok($$select public.rpc_my_saved_places(p_sort=>'name',p_cursor=>public.rpc_my_saved_places(p_limit=>1)->'nextCursor')$$,
  '22023','Unsupported Saved cursor.','A cursor cannot change sort.');
select throws_ok($$select public.rpc_my_saved_places(
  p_cursor => (public.rpc_my_saved_places(p_limit=>1)->'nextCursor') || '{"key":"invalid-date"}'::jsonb)$$,
  '22023','Unsupported Saved cursor.','An invalid timestamp has the same typed cursor failure.');
select throws_ok($$select public.rpc_my_saved_places(p_limit=>101)$$,'22023','Unsupported Saved query.','Read sizes are bounded.');
select is(public.rpc_saved_remove('c0743000-0000-4000-8000-000000000004'),' {"ok":true}'::jsonb,'Foreign delete is indistinguishable and has no effect.');
select is(public.rpc_saved_remove('c0743000-0000-4000-8000-000000000002'),' {"ok":true}'::jsonb,'An owned save can be removed.');
select is(public.rpc_my_saved_places('c0743000-0000-4000-8000-000000000002')->'rows','[]'::jsonb,'Removed save is absent on a fresh read.');
select set_config('request.jwt.claims','{"sub":"c0740000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.rpc_my_saved_places()->>'totalCount','1','Another account cannot remove this account save.');
select throws_ok($$select public.rpc_saved_add('c0741000-0000-4000-8000-000000000003')$$,
  'P0002','This place or item is unavailable.','A hidden listing cannot create a new save.');
select throws_ok($$select public.rpc_my_saved_places(p_cursor=>' {"version":"1","accountId":"c0740000-0000-4000-8000-000000000001","sort":"recently-saved","search":"","id":"c0743000-0000-4000-8000-000000000001","key":"2026-11-15T00:01:00Z"}'::jsonb)$$,
  '22023','Unsupported Saved cursor.','Pagination is bound to its account.');
reset role;
-- Capacity fixtures are isolated in this rolled-back transaction.
insert into public.merchant(id,legal_name,trading_name,category,contact_name,contact_phone,contact_email,
  city_id,status,explore_visible,accepting_orders,went_live_at)
select ('c0744000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '[Capacity legal]', '[Capacity place]',
  'restaurant','[Contact]','+25474' || lpad(n::text,7,'0'),'capacity74-' || n || '@example.test',
  (select id from public.city where slug='nairobi'),'live',true,true,now()
from generate_series(1,500) n;
insert into public.customer_saved(user_id,kind,merchant_id)
select 'c0740000-0000-4000-8000-000000000002','merchant',
  ('c0744000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,499) n;
set local role authenticated;
select throws_ok($$select public.rpc_saved_add('c0744000-0000-4000-8000-000000000500')$$,
  '54000','Saved is full. Remove a saved item first.','A new save cannot exceed account capacity.');
select is(public.rpc_saved_add('c0744000-0000-4000-8000-000000000001')->>'ok','true',
  'An idempotent existing save still succeeds at capacity.');
reset role;

update public.merchant set trading_name = repeat('x', 4097)
where id = 'c0741000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0740000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_build_object(
  'merchant', first_page.page->'rows'->0->'merchant',
  'key', first_page.page->'nextCursor'->>'key',
  'nextId', public.rpc_my_saved_places(p_sort=>'name',p_limit=>1,p_cursor=>first_page.page->'nextCursor')->'rows'->0->>'id'
), '{"merchant":null,"key":"","nextId":"c0743000-0000-4000-8000-000000000003"}'::jsonb,
  'An unusable public name keeps the saved identity and emits a reusable name cursor.')
from (select public.rpc_my_saved_places(p_sort=>'name',p_limit=>1) as page) first_page;
select throws_ok($$select public.rpc_my_saved_places(p_sort=>'name',p_limit=>1,
  p_cursor => (public.rpc_my_saved_places(p_sort=>'name',p_limit=>1)->'nextCursor') || jsonb_build_object('key', chr(133)))$$,
  '22023','Unsupported Saved cursor.','Name cursor keys exclude Unicode control characters.');
reset role;
select * from finish();
rollback;
