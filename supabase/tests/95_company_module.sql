-- Company: NexG's own back office (files, inventory, assets, procurement,
-- vendors, warehouses).
--
-- Who reaches it and how far (full, limited, view, none); stock that only
-- moves through movements and never below zero; equipment handed out and
-- serviced; purchases that need a second person; private files seen only
-- by their owner and the people they are shared with; and an audit entry,
-- registered, for every change.

begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ------------------------------------------------------------------ fixtures

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('95000000-0000-4000-8000-0000000000a1'::uuid, 'co.ops95@test.local'),
  ('95000000-0000-4000-8000-0000000000a2'::uuid, 'co.hr95@test.local'),
  ('95000000-0000-4000-8000-0000000000a3'::uuid, 'co.legal95@test.local'),
  ('95000000-0000-4000-8000-0000000000a4'::uuid, 'co.merchants95@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('95000000-0000-4000-8000-0000000000b1', '95000000-0000-4000-8000-0000000000a1', 'co.ops95@test.local', 'Ops 95'),
  ('95000000-0000-4000-8000-0000000000b2', '95000000-0000-4000-8000-0000000000a2', 'co.hr95@test.local', 'HR 95'),
  ('95000000-0000-4000-8000-0000000000b3', '95000000-0000-4000-8000-0000000000a3', 'co.legal95@test.local', 'Legal 95'),
  ('95000000-0000-4000-8000-0000000000b4', '95000000-0000-4000-8000-0000000000a4', 'co.merchants95@test.local', 'Merchants 95');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a'
from (values
  ('95000000-0000-4000-8000-0000000000b1'::uuid, 'ops_manager'),
  ('95000000-0000-4000-8000-0000000000b2'::uuid, 'hr'),
  ('95000000-0000-4000-8000-0000000000b3'::uuid, 'legal'),
  ('95000000-0000-4000-8000-0000000000b4'::uuid, 'merchant_ops')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

/* The objects storage would hold after the browser uploads them. */
insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
  ('company-files', '95000000-0000-4000-8000-0000000000a2/f1/Leave_Policy.pdf',
   '95000000-0000-4000-8000-0000000000a2', '95000000-0000-4000-8000-0000000000a2',
   '{"size": 248000, "mimetype": "application/pdf"}'),
  ('company-files', '95000000-0000-4000-8000-0000000000a2/f2/Salaries.xlsx',
   '95000000-0000-4000-8000-0000000000a2', '95000000-0000-4000-8000-0000000000a2',
   '{"size": 51200, "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}'),
  ('company-files', '95000000-0000-4000-8000-0000000000a1/f3/Fleet.pdf',
   '95000000-0000-4000-8000-0000000000a1', '95000000-0000-4000-8000-0000000000a1',
   '{"size": 1000, "mimetype": "application/pdf"}');

-- ------------------------------------------------------------------ wiring

select is(
  (select href from public.console_module where key = 'company'),
  '/company/files',
  'Company is a console module that opens on Company files');

select is(
  (select string_agg(role_key || '=' || level, ',' order by role_key)
     from public.role_module_access where module_key = 'company'),
  'finance=full,hr=limited,legal=view,ops_manager=full,read_only=view,super_admin=full,tech=limited',
  'Roles reach Company at full, limited or view, and nobody else at all');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'company\_%' and c.relkind = 'r'
      and not c.relrowsecurity),
  0,
  'Every Company table has row-level security');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%company%'),
  0,
  'The wiring check finds nothing wrong with Company');

select is(
  (select count(*)::int from (
     select distinct m[1] as action
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''(company\.[a-z_]+)''', 'g') as m
     where p.proname like 'rpc\_company\_%') used
   where not exists (select 1 from audit.action_registry r where r.action = used.action)),
  0,
  'Every action a Company function logs is in the audit registry');

select ok(
  not has_function_privilege('anon', 'public.rpc_company_location_save(text, text, uuid, text, uuid, text, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_company_purchase_decide(uuid, boolean, text)', 'execute'),
  'Signed-out visitors cannot call Company functions');

select is(
  (select bool_or(public) from storage.buckets where id in ('company-files', 'company-photos')),
  false,
  'Both Company buckets are private');

-- ------------------------------------------------------------- no access

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.company_category),
  0,
  'Staff whose roles do not reach Company see none of it');

select throws_ok(
  $$select public.rpc_company_location_save('Sneaky store')$$,
  '42501', 'Only NexG staff with access to Company can do this.',
  'and cannot change any of it');

-- ------------------------------------------------------------------- view

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select ok(
  (select count(*) from public.company_category) >= 10,
  'Read-only roles see Company records');

select throws_ok(
  $$select public.rpc_company_location_save('Legal store')$$,
  '42501', 'You can see Company but not change it.',
  'but cannot change them');

-- ---------------------------------------------------------- stock (limited)

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

insert into t values
  ('hq', public.rpc_company_location_save('Test HQ 95', 'office')::text),
  ('store', public.rpc_company_location_save('Test Store 95', 'store')::text),
  ('vendor', public.rpc_company_vendor_save('Test Supplies 95', array['rider_gear', 'office_supplies'],
     p_email => 'Sales@Supplies95.example')::text);

select is(
  (select email from public.company_vendor where id = (select v::uuid from t where k = 'vendor')),
  'sales@supplies95.example',
  'A limited role adds locations and vendors (emails kept lower-case)');

select throws_ok(
  $$select public.rpc_company_location_save('test hq 95')$$,
  '23505', 'There is already a location called "test hq 95".',
  'Location names are unique, whatever the case');

insert into t values ('helmet', public.rpc_company_item_save(
  'Test helmet 95', (select id from public.company_category where name = 'Rider Gear'),
  p_sku => 'HLM-95', p_unit_cost_cents => 450000, p_reorder_level => 4,
  p_vendor_id => (select v::uuid from t where k = 'vendor'),
  p_location_id => (select v::uuid from t where k = 'hq'), p_opening_quantity => 10)::text);

select is(
  (select quantity::text || ' ' || status from public.company_stock_v
    where item_id = (select v::uuid from t where k = 'helmet')),
  '10.00 in_stock',
  'A new item starts with its opening stock at its location');

select is(
  (select kind || '/' || reason from public.company_stock_movement
    where item_id = (select v::uuid from t where k = 'helmet')),
  'in/opening',
  'and the opening stock is a recorded movement');

select lives_ok(
  $$select public.rpc_company_stock_move((select v::uuid from t where k = 'helmet'), 'out', 7,
      p_from_location_id => (select v::uuid from t where k = 'hq'), p_note => 'New riders')$$,
  'Stock is issued');

select is(
  (select status from public.company_stock_v
    where item_id = (select v::uuid from t where k = 'helmet')
      and location_id = (select v::uuid from t where k = 'hq')),
  'low_stock',
  'and 3 left against a reorder level of 4 is low stock');

select throws_ok(
  $$select public.rpc_company_stock_move((select v::uuid from t where k = 'helmet'), 'out', 5,
      p_from_location_id => (select v::uuid from t where k = 'hq'))$$,
  '23514', 'Only 3 pcs on hand there.',
  'Stock never goes below zero');

select lives_ok(
  $$select public.rpc_company_stock_move((select v::uuid from t where k = 'helmet'), 'transfer', 2,
      p_from_location_id => (select v::uuid from t where k = 'hq'),
      p_to_location_id => (select v::uuid from t where k = 'store'))$$,
  'Stock moves between locations');

select lives_ok(
  $$select public.rpc_company_stock_count((select v::uuid from t where k = 'helmet'),
      (select v::uuid from t where k = 'store'), 5, 'Shelf count')$$,
  'A stock count corrects what is on hand');

select is(
  (select string_agg(location_name || '=' || quantity::text, ',' order by location_name)
     from public.company_stock_v where item_id = (select v::uuid from t where k = 'helmet')),
  'Test HQ 95=1.00,Test Store 95=5.00',
  'and every step adds up: 10 in, 7 out, 2 moved, counted 5');

select throws_ok(
  $$select public.rpc_company_item_archive((select v::uuid from t where k = 'helmet'))$$,
  '23514', 'Issue or count out what is left of "Test helmet 95" first.',
  'An item with stock on hand cannot be archived');

-- -------------------------------------------------------------- procurement

insert into t values ('pr', public.rpc_company_purchase_save(
  'Test helmets 95',
  jsonb_build_array(jsonb_build_object(
    'item_id', (select v from t where k = 'helmet'), 'quantity', 10, 'unit_cost_cents', 500000)),
  p_vendor_id => (select v::uuid from t where k = 'vendor'),
  p_location_id => (select v::uuid from t where k = 'store'),
  p_submit => true)::text);

select is(
  (select status || ' ' || total_cents::text || ' ' || (number like 'PR-____-%')::text
     from public.company_purchase_request where id = (select v::uuid from t where k = 'pr')),
  'submitted 5000000 true',
  'A purchase request is numbered, totalled and sent for approval');

select throws_ok(
  $$select public.rpc_company_purchase_decide((select v::uuid from t where k = 'pr'), true)$$,
  '42501', 'Only people with full Company access can do this.',
  'A limited role cannot approve purchases');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_company_purchase_decide((select v::uuid from t where k = 'pr'), false)$$,
  '22023', 'Say why it is turned down, so whoever asked can fix it.',
  'Turning a request down needs a reason');

select lives_ok(
  $$select public.rpc_company_purchase_decide((select v::uuid from t where k = 'pr'), true, 'Riders start Monday')$$,
  'Someone with full access approves another person''s request');

insert into t values ('po', public.rpc_company_po_issue(
  (select v::uuid from t where k = 'pr'), p_expected_on => current_date + 3)::text);

select is(
  (select r.status || ' ' || o.status || ' ' || o.total_cents::text
     from public.company_purchase_order o
     join public.company_purchase_request r on r.id = o.request_id
    where o.id = (select v::uuid from t where k = 'po')),
  'ordered issued 5000000',
  'An approved request becomes a purchase order');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select is(
  public.rpc_company_po_receive((select v::uuid from t where k = 'po'),
    jsonb_build_array(jsonb_build_object(
      'line_id', (select l.id from public.company_purchase_line l
                  where l.request_id = (select v::uuid from t where k = 'pr')),
      'quantity', 4))),
  'partially_received',
  'Part of an order arrives');

select is(
  (select quantity::text from public.company_stock
    where item_id = (select v::uuid from t where k = 'helmet')
      and location_id = (select v::uuid from t where k = 'store')),
  '9.00',
  'and goes straight into stock where it was delivered');

select is(
  (select unit_cost_cents::text from public.company_item where id = (select v::uuid from t where k = 'helmet')),
  '470000',
  'The item is repriced at the weighted average of stock on hand and stock received');

select throws_ok(
  $$select public.rpc_company_po_receive((select v::uuid from t where k = 'po'),
      jsonb_build_array(jsonb_build_object(
        'line_id', (select l.id from public.company_purchase_line l
                    where l.request_id = (select v::uuid from t where k = 'pr')),
        'quantity', 7)))$$,
  '23514', 'More "Test helmet 95" than was ordered.',
  'Nobody receives more than was ordered');

select is(
  public.rpc_company_po_receive((select v::uuid from t where k = 'po'),
    jsonb_build_array(jsonb_build_object(
      'line_id', (select l.id from public.company_purchase_line l
                  where l.request_id = (select v::uuid from t where k = 'pr')),
      'quantity', 6))),
  'received',
  'The rest arrives');

select is(
  (select status from public.company_purchase_request where id = (select v::uuid from t where k = 'pr')),
  'received',
  'and the request is closed as received');

/* Two people: the ops manager asks, and cannot approve their own. */
select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t values ('own', public.rpc_company_purchase_save(
  'Test office chairs 95',
  jsonb_build_array(jsonb_build_object('description', 'Office chair', 'quantity', 2, 'unit_cost_cents', 1800000)),
  p_submit => true)::text);

select throws_ok(
  $$select public.rpc_company_purchase_decide((select v::uuid from t where k = 'own'), true)$$,
  '42501', 'Someone other than whoever asked has to decide this request.',
  'Nobody approves their own purchase');

/* A super admin can, and it is marked for review. */
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into t values ('admin_own', public.rpc_company_purchase_save(
  'Test projector 95',
  jsonb_build_array(jsonb_build_object('description', 'Projector', 'quantity', 1, 'unit_cost_cents', 6500000)),
  p_submit => true)::text);

select lives_ok(
  $$select public.rpc_company_purchase_decide((select v::uuid from t where k = 'admin_own'), true)$$,
  'A super admin may approve their own request');

reset role;

select is(
  (select m.review_state::text from audit.audit_event e
     join audit.event_meta m on m.event_id = e.id
    where e.action = 'company.purchase_request_self_approved'
      and e.target_id = (select v::uuid from t where k = 'admin_own')),
  'needs_review',
  'but that approval waits in the audit log for review');

-- ------------------------------------------------------------------ assets

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

insert into t values ('laptop', public.rpc_company_asset_save(
  'Test laptop 95', (select id from public.company_category where name = 'IT & Electronics'),
  p_brand => 'Apple', p_serial_number => 'SN-95-001',
  p_location_id => (select v::uuid from t where k = 'hq'), p_purchase_cost_cents => 25000000)::text);

select is(
  (select status || ' ' || (tag like 'AST-%')::text from public.company_asset
    where id = (select v::uuid from t where k = 'laptop')),
  'available true',
  'Equipment is registered with its own tag');

select lives_ok(
  $$select public.rpc_company_asset_assign((select v::uuid from t where k = 'laptop'),
      p_assignee_name => 'Rider 442')$$,
  'and handed to someone without a console account');

select lives_ok(
  $$select public.rpc_company_asset_maintenance((select v::uuid from t where k = 'laptop'), 'start',
      p_note => 'Battery swelling')$$,
  'It goes in for maintenance');

select lives_ok(
  $$select public.rpc_company_asset_maintenance((select v::uuid from t where k = 'laptop'), 'complete',
      p_cost_cents => 1200000, p_due_on => current_date + 180)$$,
  'and comes back');

select is(
  (select status || ' ' || assignee_name from public.company_asset
    where id = (select v::uuid from t where k = 'laptop')),
  'in_use Rider 442',
  'still with whoever had it');

select lives_ok(
  $$select public.rpc_company_asset_return((select v::uuid from t where k = 'laptop'), 'fair')$$,
  'It is handed back');

select is(
  (select string_agg(kind, ',' order by id) from public.company_asset_event
    where asset_id = (select v::uuid from t where k = 'laptop')),
  'registered,assigned,maintenance_started,maintenance_done,returned',
  'and its history says so, step by step');

select throws_ok(
  $$select public.rpc_company_asset_set_status((select v::uuid from t where k = 'laptop'), 'retired')$$,
  '22023', 'Say why.',
  'Retiring equipment needs a reason');

-- ------------------------------------------------------------------- files

insert into t values
  ('policy', public.rpc_company_file_add('95000000-0000-4000-8000-0000000000a2/f1/Leave_Policy.pdf',
     'Leave policy.pdf')::text),
  ('salaries', public.rpc_company_file_add('95000000-0000-4000-8000-0000000000a2/f2/Salaries.xlsx',
     p_visibility => 'private')::text);

select is(
  (select size_bytes::text || ' ' || mime_type from public.company_file
    where id = (select v::uuid from t where k = 'policy')),
  '248000 application/pdf',
  'An upload is registered with the size and type storage recorded');

select throws_ok(
  $$select public.rpc_company_file_add('95000000-0000-4000-8000-0000000000a1/f3/Fleet.pdf')$$,
  '42501', 'Upload the file into your own folder first.',
  'Nobody registers somebody else''s upload');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select is(
  (select string_agg(name, ',' order by name) from public.company_file),
  'Leave policy.pdf',
  'Colleagues see company-wide files and not someone else''s private ones');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'company-files'),
  1,
  'and storage will sign links only for the files they can see');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_company_file_share((select v::uuid from t where k = 'salaries'),
      array['95000000-0000-4000-8000-0000000000b4'::uuid])$$,
  '22023', 'Files can only be shared with colleagues who use Company.',
  'A file is shared only with colleagues who reach Company');

select is(
  public.rpc_company_file_share((select v::uuid from t where k = 'salaries'),
    array['95000000-0000-4000-8000-0000000000b3'::uuid]),
  1,
  'The owner shares a private file');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.company_file where id = (select v::uuid from t where k = 'salaries')),
  1,
  'and the colleague it is shared with now sees it');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_company_file_trash((select v::uuid from t where k = 'salaries'))$$,
  'P0002', 'That file is not there any more.',
  'Others cannot reach a private file that is not shared with them');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select public.rpc_company_file_trash((select v::uuid from t where k = 'policy'));

select is(
  public.rpc_company_file_purge((select v::uuid from t where k = 'policy')),
  '95000000-0000-4000-8000-0000000000a2/f1/Leave_Policy.pdf',
  'The owner deletes a file in the trash for good, and the console is told which object to remove');

-- ------------------------------------------------------------------- audit

reset role;

select is(
  (select count(*)::int from audit.audit_event
    where action = 'audit.unknown_action' and after ->> 'module' = 'company'),
  0,
  'Every Company change was logged under a registered action');

select * from finish();
rollback;
