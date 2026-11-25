-- Removes ALL remaining demo, sample and seed data from production
-- (owner, 25 Nov 2026: "remove all the demo data that we have on the
-- database, all of it"). Inventory and reasons: supabase/demo-data-remove-all.md
--
-- PERMANENT. There is no undo once step 2 commits.
--
-- Production runs only through the release-gate session, after the owner's
-- own yes typed in that session. Never run it anywhere else by hand.
--
--   1. Step 1 only reads: what will go, with counts.
--   2. Step 2 is ONE do block (one transaction, all or nothing). Every row is
--      found by an explicit id list taken from the inventory, never by a
--      name pattern. Before deleting it checks, for each list, that exactly
--      the expected rows exist (count and md5 of the sorted ids), and for
--      each child table the expected count. Every delete then checks its own
--      row count. Any difference raises and nothing is deleted: re-run the
--      inventory instead of editing a number.
--   3. Step 3 only reads: every count should be 0, and it lists the 4 stored
--      files to delete in the Storage dashboard (Supabase refuses direct
--      deletes from storage.objects, because the file itself would be left
--      behind).
--
-- Where the demo rows came from:
--   * supabase/demo-data.sql (28 Sep 2026): 9 invented shops on the
--     nexg.invalid domain and 7 invented riders on +2547000002xx.
--   * scripts/demo-partners.sql and demo-partners-setup.sql (8 Oct 2026):
--     the dddddddd-/eeeeeeee- fixed ids: Demo Kitchen, Demo Kitchen (setting
--     up), Demo Stays, Demo Stays (setting up), Demo Rider, Demo Applicant
--     and their 7 sign-ins.
--   * supabase/demo-accounts.sql (10 Nov 2026): the two riders with
--     md5('demo-rider-live'/'demo-rider-new') ids, their 2 sign-ins and the
--     demo customer sign-in (flagged demo=true). Its merchants and hosts were
--     already removed on 19 Nov (demo-merchants-remove.sql).
--   * supabase/seeds/stays-demo-production.sql (1 Oct 2026): the two sample
--     hosts 11000000-…, their 6 properties 12000000-… and 9 units, and the 3
--     "[Requester]" stay requests.
--   * Rows people made later while testing on those demo accounts and shops
--     (9 unpaid test orders, 1 test stay, 2 extra properties, a task, QR
--     scans, notifications).
--
-- Kept on purpose (see the .md): the audit log (tamper-proof chain), the one
-- support chat with Demo Stays (chat messages are append-only), the
-- backup_20261103_premigration schema, sent-message logs, and every real or
-- owner test account.

-- ------------------------------------------------------------- 1. preview

select 'merchants (shops)' as what, count(*) as n,
       string_agg(coalesce(trading_name, legal_name), ', ' order by trading_name) as names
  from public.merchant
 where id = any ('{0f593f6f-18d5-457e-abe0-9cb3390eaf47,44c2b280-5c93-4aae-aed0-31716b23a466,626929b8-2461-4ea2-b991-60c28905a6b7,65826856-a316-4d78-a676-4929b7adfc54,6a9a3fa7-206c-4dc6-b997-91a05d783238,94782028-7e7d-42fb-873e-c81139cd4d08,afb8ba00-6f22-4275-ba6b-a8d82c215b31,b2bec944-4d02-4c56-947b-0a5b405ae9b2,c6ca5e03-5c7c-4a19-ac51-6c5de40b14c9,dddddddd-1111-4000-8000-000000000001,eeeeeeee-1111-4000-8000-000000000001}'::uuid[])
union all
select 'hosts', count(*), string_agg(display_name, ', ' order by display_name)
  from public.host
 where id = any ('{11000000-0000-4000-8000-000000000001,11000000-0000-4000-8000-000000000002,dddddddd-6666-4000-8000-000000000001,eeeeeeee-5555-4000-8000-000000000001}'::uuid[])
union all
select 'properties', count(*), string_agg(name, ', ' order by name)
  from public.property
 where host_id = any ('{11000000-0000-4000-8000-000000000001,11000000-0000-4000-8000-000000000002,dddddddd-6666-4000-8000-000000000001,eeeeeeee-5555-4000-8000-000000000001}'::uuid[])
union all
select 'riders', count(*), string_agg(coalesce(first_name, '') || ' ' || coalesce(last_name, ''), ', ' order by first_name)
  from public.rider
 where id = any ('{0cdf01b7-f673-4494-8287-7c6fed8ec26a,1117022a-4c5a-4f73-8164-9129e04d7e00,13567c44-723c-490f-b79f-176839802bf5,2f230881-f3ae-4816-9da8-45dd92ff50aa,667c5984-fd95-440a-ace4-35090226fdad,6eb1b1ae-a2cd-3fcf-3afe-9763eb1d3709,6fbc16f5-86cc-d85b-4f30-dd5a5acab584,99c93977-26e2-4fb0-bb9e-57d6f68fe570,9e7849cc-5190-4d60-ad2a-dc9c1ef0fd1a,dddddddd-3333-4000-8000-000000000001,eeeeeeee-3333-4000-8000-000000000001}'::uuid[])
union all
select 'sign-ins', count(*), null
  from auth.users
 where id = any ('{308cb308-e650-4fb5-9491-a0e9ed3b137c,5f046217-836d-41d0-8c4e-4f956cc5e261,89ae9893-fea4-4aee-8738-fbfee2168274,dddddddd-0000-4000-8000-000000000001,dddddddd-0000-4000-8000-000000000002,dddddddd-0000-4000-8000-000000000003,eeeeeeee-0000-4000-8000-000000000001,eeeeeeee-0000-4000-8000-000000000002,eeeeeeee-0000-4000-8000-000000000003,eeeeeeee-0000-4000-8000-000000000004}'::uuid[])
union all
select 'test orders at demo shops', count(*), string_agg(reference, ', ' order by reference)
  from public."order"
 where id = any ('{1bae8f30-75a4-4547-9260-86dfd786c88c,1bf095fe-7b8a-49ea-b976-aea40eecb4d4,374bf18c-ec26-4b90-8ee7-ac257badb070,5597fa44-6816-4c27-b97c-9ed058f7685a,7971d8dd-52d0-4b67-aaf5-2d4174a4e3c3,95ec7c05-a3db-4b0f-9747-6d0291095508,9b6c647c-9af1-46df-a674-ec1ca04193ad,a12ff91d-8c09-4539-aedd-e9142a32c858,bc5561dd-679b-4265-9df2-ee180e35dcd4}'::uuid[])
order by 1;

-- --------------------------------------------------------- 2. remove (one block)

do $remove$
declare
  c_merchants uuid[] := '{0f593f6f-18d5-457e-abe0-9cb3390eaf47,44c2b280-5c93-4aae-aed0-31716b23a466,626929b8-2461-4ea2-b991-60c28905a6b7,65826856-a316-4d78-a676-4929b7adfc54,6a9a3fa7-206c-4dc6-b997-91a05d783238,94782028-7e7d-42fb-873e-c81139cd4d08,afb8ba00-6f22-4275-ba6b-a8d82c215b31,b2bec944-4d02-4c56-947b-0a5b405ae9b2,c6ca5e03-5c7c-4a19-ac51-6c5de40b14c9,dddddddd-1111-4000-8000-000000000001,eeeeeeee-1111-4000-8000-000000000001}';
  c_hosts uuid[] := '{11000000-0000-4000-8000-000000000001,11000000-0000-4000-8000-000000000002,dddddddd-6666-4000-8000-000000000001,eeeeeeee-5555-4000-8000-000000000001}';
  c_properties uuid[] := '{12000000-0000-4000-8000-000000000001,12000000-0000-4000-8000-000000000002,12000000-0000-4000-8000-000000000003,12000000-0000-4000-8000-000000000004,12000000-0000-4000-8000-000000000005,12000000-0000-4000-8000-000000000006,d1c675c9-18e9-41b8-8e0e-cfe1192fc49d,dddddddd-7777-4000-8000-000000000001,eeeeeeee-6666-4000-8000-000000000001,f570a833-25c3-4429-83ed-186dd0ab1873}';
  c_units uuid[] := '{05685eac-e445-447b-8d8f-f3ee53977d68,1fc9e3a3-162a-4be0-9a42-8e9661eab417,5004b3eb-1d9d-4464-902c-f5da1a8630bb,721f9ab3-947a-4721-8c43-f1e1350c51bd,821de337-2402-4f26-a03e-2bc1ace6595f,8cf14a96-eddd-4935-944a-1bf0fbf0588a,9d6aaa15-acc4-475b-94ce-6eae214c18da,a687b77b-c9e6-4601-92b0-7209776359f9,d3fbdfc7-01b0-44f6-aab5-6486e84e5c5b,db39ef31-2d34-465e-b251-862f5c9b4369,dddddddd-8888-4000-8000-000000000001,dddddddd-8888-4000-8000-000000000002,eeeeeeee-7777-4000-8000-000000000001}';
  c_riders uuid[] := '{0cdf01b7-f673-4494-8287-7c6fed8ec26a,1117022a-4c5a-4f73-8164-9129e04d7e00,13567c44-723c-490f-b79f-176839802bf5,2f230881-f3ae-4816-9da8-45dd92ff50aa,667c5984-fd95-440a-ace4-35090226fdad,6eb1b1ae-a2cd-3fcf-3afe-9763eb1d3709,6fbc16f5-86cc-d85b-4f30-dd5a5acab584,99c93977-26e2-4fb0-bb9e-57d6f68fe570,9e7849cc-5190-4d60-ad2a-dc9c1ef0fd1a,dddddddd-3333-4000-8000-000000000001,eeeeeeee-3333-4000-8000-000000000001}';
  c_users uuid[] := '{308cb308-e650-4fb5-9491-a0e9ed3b137c,5f046217-836d-41d0-8c4e-4f956cc5e261,89ae9893-fea4-4aee-8738-fbfee2168274,dddddddd-0000-4000-8000-000000000001,dddddddd-0000-4000-8000-000000000002,dddddddd-0000-4000-8000-000000000003,eeeeeeee-0000-4000-8000-000000000001,eeeeeeee-0000-4000-8000-000000000002,eeeeeeee-0000-4000-8000-000000000003,eeeeeeee-0000-4000-8000-000000000004}';
  c_orders uuid[] := '{1bae8f30-75a4-4547-9260-86dfd786c88c,1bf095fe-7b8a-49ea-b976-aea40eecb4d4,374bf18c-ec26-4b90-8ee7-ac257badb070,5597fa44-6816-4c27-b97c-9ed058f7685a,7971d8dd-52d0-4b67-aaf5-2d4174a4e3c3,95ec7c05-a3db-4b0f-9747-6d0291095508,9b6c647c-9af1-46df-a674-ec1ca04193ad,a12ff91d-8c09-4539-aedd-e9142a32c858,bc5561dd-679b-4265-9df2-ee180e35dcd4}';
  c_payments uuid[] := '{1e236ad9-04cf-413b-809c-b1921aaf890a,5345db8c-9745-471c-92ab-00ffcebe00f0,695b89c6-ccc1-4df0-b97f-54db301bfa97,8074a1e8-f909-4e82-baea-7e958ef1b95c,8ec94e36-70d8-432e-bea9-9bc601a79e4c,bc0d9789-a8a1-4924-a356-707aa6e53cf7,ceb13c99-be7c-447d-b2a9-27497be49535,edebb502-319c-4256-b2a4-9faab3f0cdb7,f0865e53-8fdf-40bb-b1f5-deb21dc3aee8}';
  c_stays uuid[] := '{69584307-aed2-4012-a49b-1039a73d45fe}';
  c_stay_requests uuid[] := '{124be820-9b68-4b6e-835b-af30aad2bb59,8701ac39-7615-4d75-859e-50f59cdbcd42,e46bca9e-1e86-4140-bc2a-bf5261976827}';
  c_guests uuid[] := '{225d719a-308f-4dfe-ad63-9d32d3eca478}';
  c_plans uuid[] := '{f2ca22e8-1693-4ab9-bbbf-2a18a2b0a26e}';
  c_documents uuid[] := '{1d568445-89c3-44dc-9842-fa1d1a5169a7,394d62a4-7016-4669-99d5-0451447f137a,913f6147-c8ca-4368-a79b-db10bb0f5557,a0fc4aa5-3f0a-4425-895d-8081862fcee3,b3b9f090-b69e-4795-9ee7-70d02aaa1e97,d4ce6d86-0924-4b30-baf5-63e5557578a6,d6b0af08-c1a4-4d4f-aee5-4023c52d763b,f546e39f-b10a-4460-a2b6-0c7a916544dc}';
  v_objects uuid[];
  v_n bigint;
  v_md5 text;
  v_check record;
begin
  -- ---- a. every list is exactly what the inventory found -------------------
  for v_check in
    select * from (values
      ('merchant', 'public.merchant', c_merchants, 11, 'f567d693340f8fcc248adcc852323f6d'),
      ('host', 'public.host', c_hosts, 4, 'a5cea661b48de13ab8e1a1f926c039c2'),
      ('property', 'public.property', c_properties, 10, 'd9ac4404af927073605ba6bf1408318d'),
      ('unit', 'public.unit', c_units, 13, 'a308eed66987dd40454ac8d28373cea1'),
      ('rider', 'public.rider', c_riders, 11, 'ef8754c6737e616458714156961290eb'),
      ('sign-in', 'auth.users', c_users, 10, 'fa65cfa94988b1e1bb497591003b475a'),
      ('order', 'public."order"', c_orders, 9, '8d247c1c5417c03b157749f87bbd086c'),
      ('payment', 'public.payment', c_payments, 9, '6f163a565413e19afcc5a6debc35ed03'),
      ('stay', 'public.stay', c_stays, 1, '0a6135a92c8f9215016303424214faa2'),
      ('stay request', 'public.stay_request', c_stay_requests, 3, '04fd773502fc6e79c8d006c6f64a04d8'),
      ('guest', 'public.guest', c_guests, 1, '4c73ea8d75b665d7418edbbe913a70c1'),
      ('plan', 'public.plan', c_plans, 1, '243f05f99b1c52433c9d310d82bffc94'),
      ('document', 'public.document', c_documents, 8, '0a45e7a53453a8a58f91edb8a2016242')
    ) t(label, tbl, ids, expected, expected_md5)
  loop
    execute format('select count(*), md5(coalesce(string_agg(id::text, '','' order by id), '''')) from %s where id = any ($1)', v_check.tbl)
      into v_n, v_md5 using v_check.ids;
    if v_n <> v_check.expected or v_md5 <> v_check.expected_md5 then
      raise exception 'Stopped, nothing deleted: % rows found % (expected %), md5 % (expected %).',
        v_check.label, v_n, v_check.expected, v_md5, v_check.expected_md5;
    end if;
  end loop;

  -- ---- b. the rows found by those lists belong together ---------------------
  -- Orders and payments are all at demo shops; units, properties, stays and
  -- QR codes all at demo hosts; no sign-in is staff.
  if exists (select 1 from public."order" where id = any (c_orders) and not (merchant_id = any (c_merchants)))
     or exists (select 1 from public.payment where id = any (c_payments) and not (merchant_id = any (c_merchants)))
     or exists (select 1 from public.payment where merchant_id = any (c_merchants) and not (id = any (c_payments)))
     or exists (select 1 from public."order" where merchant_id = any (c_merchants) and not (id = any (c_orders)))
     or exists (select 1 from public.property where id = any (c_properties) and not (host_id = any (c_hosts)))
     or exists (select 1 from public.property where host_id = any (c_hosts) and not (id = any (c_properties)))
     or exists (select 1 from public.unit where id = any (c_units) and not (host_id = any (c_hosts)))
     or exists (select 1 from public.unit where (host_id = any (c_hosts) or property_id = any (c_properties)) and not (id = any (c_units)))
     or exists (select 1 from public.stay where (host_id = any (c_hosts) or unit_id = any (c_units)) and not (id = any (c_stays)))
     or exists (select 1 from public.staff_user where user_id = any (c_users)) then
    raise exception 'Stopped, nothing deleted: the demo rows no longer match the inventory (new orders, payments, units or stays, or a staff sign-in).';
  end if;

  -- No money ever moved: no ledger account, settlement line or host invoice,
  -- and no payment that succeeded.
  if exists (select 1 from ledger.account where party_id = any (c_merchants || c_hosts || c_riders))
     or exists (select 1 from public.fin_settlement_line where party_id = any (c_merchants || c_hosts || c_riders))
     or exists (select 1 from public.host_invoice where host_id = any (c_hosts))
     or exists (select 1 from public.payment where id = any (c_payments)
                 and state::text in ('paid', 'reversed')) then
    raise exception 'Stopped, nothing deleted: a demo shop, host or rider has ledger rows, invoices or a completed payment.';
  end if;

  -- ---- c. child rows: the counts the inventory found ------------------------
  for v_check in
    select * from (values
      ('payment events', (select count(*) from public.payment_event where payment_id = any (c_payments)), 11),
      ('payment prompts', (select count(*) from public.payment_prompt where payment_id = any (c_payments)), 8),
      ('order events', (select count(*) from public.order_event where order_id = any (c_orders)), 16),
      ('order items', (select count(*) from public.order_item where order_id = any (c_orders)), 9),
      ('order handoff codes', (select count(*) from public.order_handoff_code where order_id = any (c_orders)), 1),
      ('shop branches', (select count(*) from public.merchant_branch where merchant_id = any (c_merchants)), 11),
      ('shop opening hours', (select count(*) from public.merchant_hours where merchant_id = any (c_merchants)), 63),
      ('menu sections', (select count(*) from public.catalogue_section where merchant_id = any (c_merchants)), 23),
      ('menu items', (select count(*) from public.catalogue_item where merchant_id = any (c_merchants)), 42),
      ('baskets', (select count(*) from public.basket where merchant_id = any (c_merchants)), 3),
      ('basket lines', (select count(*) from public.basket_line bl join public.catalogue_item ci on ci.id = bl.catalogue_item_id where ci.merchant_id = any (c_merchants)), 3),
      ('shop commission terms', (select count(*) from public.merchant_commission_term where merchant_id = any (c_merchants)), 2),
      ('shop status changes', (select count(*) from public.merchant_status_change where merchant_id = any (c_merchants)), 2),
      ('shop members (by shop)', (select count(*) from public.merchant_user where merchant_id = any (c_merchants)), 1),
      ('shop members (by sign-in)', (select count(*) from public.merchant_user where user_id = any (c_users)), 3),
      ('host members', (select count(*) from public.host_user where host_id = any (c_hosts) or user_id = any (c_users)), 2),
      ('host QR codes', (select count(*) from public.property_qr where host_id = any (c_hosts)), 8),
      ('QR scans', (select count(*) from public.qr_scan where host_id = any (c_hosts)), 89),
      ('package orders', (select count(*) from public.package_order where host_id = any (c_hosts) or unit_id = any (c_units)), 1),
      ('host tasks', (select count(*) from public.host_workspace_task where unit_id = any (c_units)), 1),
      ('unit guides', (select count(*) from public.host_unit_guide where unit_id = any (c_units)), 1),
      ('unit guide versions', (select count(*) from public.host_unit_guide_version where unit_id = any (c_units)), 1),
      ('stay request matches', (select count(*) from public.stay_request_match where request_id = any (c_stay_requests) or unit_id = any (c_units)), 1),
      ('rider devices', (select count(*) from public.rider_device where rider_id = any (c_riders)), 1),
      ('in-app notifications about demo rows', (select count(*) from public.user_notification
          where object_id = any (c_merchants || c_hosts || c_riders || c_orders || c_payments)), 68),
      ('sign-in identities', (select count(*) from auth.identities where user_id = any (c_users)), 10),
      ('push installations', (select count(*) from native_push.installation where owner_id = any (c_users)), 2),
      ('user preferences', (select count(*) from public.user_preference where user_id = any (c_users)), 1)
    ) t(label, found, expected)
  loop
    if v_check.found <> v_check.expected then
      raise exception 'Stopped, nothing deleted: % found % (expected %).', v_check.label, v_check.found, v_check.expected;
    end if;
  end loop;

  -- ---- d. delete, children first, each with its own count -------------------
  delete from public.user_notification
   where object_id = any (c_merchants || c_hosts || c_riders || c_orders || c_payments);
  get diagnostics v_n = row_count;
  if v_n <> 68 then raise exception 'notifications: deleted %, expected 68', v_n; end if;

  -- Documents point at their owner without a foreign key.
  delete from public.document where id = any (c_documents);
  get diagnostics v_n = row_count;
  if v_n <> 8 then raise exception 'documents: deleted %, expected 8', v_n; end if;

  -- Payment events and prompts cascade.
  delete from public.payment where id = any (c_payments);
  get diagnostics v_n = row_count;
  if v_n <> 9 then raise exception 'payments: deleted %, expected 9', v_n; end if;

  -- Order events, items and handoff codes cascade.
  delete from public."order" where id = any (c_orders);
  get diagnostics v_n = row_count;
  if v_n <> 9 then raise exception 'orders: deleted %, expected 9', v_n; end if;

  -- Branches, hours, menus, baskets, members, terms and status history cascade.
  delete from public.merchant where id = any (c_merchants);
  get diagnostics v_n = row_count;
  if v_n <> 11 then raise exception 'shops: deleted %, expected 11', v_n; end if;

  delete from public.stay where id = any (c_stays);
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'stays: deleted %, expected 1', v_n; end if;

  -- Their one match cascades.
  delete from public.stay_request where id = any (c_stay_requests);
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'stay requests: deleted %, expected 3', v_n; end if;

  -- No foreign key on these two.
  delete from public.host_unit_guide_version where unit_id = any (c_units);
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'unit guide versions: deleted %, expected 1', v_n; end if;
  delete from public.qr_scan where host_id = any (c_hosts);
  get diagnostics v_n = row_count;
  if v_n <> 89 then raise exception 'QR scans: deleted %, expected 89', v_n; end if;

  -- Guides, tasks and package orders cascade.
  delete from public.unit where id = any (c_units);
  get diagnostics v_n = row_count;
  if v_n <> 13 then raise exception 'units: deleted %, expected 13', v_n; end if;

  delete from public.property where id = any (c_properties);
  get diagnostics v_n = row_count;
  if v_n <> 10 then raise exception 'properties: deleted %, expected 10', v_n; end if;

  -- Host members and QR codes cascade.
  delete from public.host where id = any (c_hosts);
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'hosts: deleted %, expected 4', v_n; end if;

  -- Rider devices cascade.
  delete from public.rider where id = any (c_riders);
  get diagnostics v_n = row_count;
  if v_n <> 11 then raise exception 'riders: deleted %, expected 11', v_n; end if;

  delete from public.guest where id = any (c_guests);
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'guests: deleted %, expected 1', v_n; end if;

  delete from public.plan where id = any (c_plans);
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'plans: deleted %, expected 1', v_n; end if;

  -- Identities, sessions, push installations, preferences, their own
  -- notifications and their memberships of the two kept businesses cascade.
  delete from auth.users where id = any (c_users);
  get diagnostics v_n = row_count;
  if v_n <> 10 then raise exception 'sign-ins: deleted %, expected 10', v_n; end if;

  -- ---- e. nothing is left -----------------------------------------------------
  if exists (select 1 from public.merchant where id = any (c_merchants))
     or exists (select 1 from public.merchant_branch where merchant_id = any (c_merchants))
     or exists (select 1 from public.catalogue_item where merchant_id = any (c_merchants))
     or exists (select 1 from public.host where id = any (c_hosts))
     or exists (select 1 from public.property where id = any (c_properties))
     or exists (select 1 from public.unit where id = any (c_units))
     or exists (select 1 from public.property_qr where host_id = any (c_hosts))
     or exists (select 1 from public.rider where id = any (c_riders))
     or exists (select 1 from public.rider_device where rider_id = any (c_riders))
     or exists (select 1 from auth.users where id = any (c_users))
     or exists (select 1 from auth.identities where user_id = any (c_users))
     or exists (select 1 from auth.sessions where user_id = any (c_users))
     or exists (select 1 from public.merchant_user where user_id = any (c_users))
     or exists (select 1 from public.host_user where user_id = any (c_users))
     or exists (select 1 from public."order" where id = any (c_orders))
     or exists (select 1 from public.order_item where order_id = any (c_orders))
     or exists (select 1 from public.payment where id = any (c_payments))
     or exists (select 1 from public.payment_event where payment_id = any (c_payments))
     or exists (select 1 from public.stay where id = any (c_stays))
     or exists (select 1 from public.stay_request where id = any (c_stay_requests))
     or exists (select 1 from public.merchant where contact_email like '%@nexg.invalid')
     or exists (select 1 from public.rider where phone like '+2547000002%')
     or exists (select 1 from public.property where is_sample) then
    raise exception 'Demo rows are still there after the deletes; nothing was deleted.';
  end if;

  raise notice 'Removed 11 shops, 4 hosts, 10 properties, 13 units, 11 riders, 10 sign-ins, 9 test orders, 9 payments, 1 stay, 3 stay requests, 1 guest, 1 plan, 8 documents, 89 QR scans, 68 notifications.';
end
$remove$;

-- ------------------------------------------------------------- 3. check

select 'demo shops left' as what, count(*) as n from public.merchant
 where contact_email like '%@nexg.invalid' or id::text like 'dddddddd-%' or id::text like 'eeeeeeee-%'
union all
select 'demo and sample hosts left', count(*) from public.host
 where id::text like '11000000-0000-4000-8000-%' or id::text like 'dddddddd-%' or id::text like 'eeeeeeee-%'
union all
select 'sample properties left', count(*) from public.property where is_sample
union all
select 'demo riders left', count(*) from public.rider
 where phone like '+2547000002%' or id::text like 'dddddddd-%' or id::text like 'eeeeeeee-%'
    or id in ('6eb1b1ae-a2cd-3fcf-3afe-9763eb1d3709', '6fbc16f5-86cc-d85b-4f30-dd5a5acab584')
union all
select 'demo sign-ins left', count(*) from auth.users
 where id::text like 'dddddddd-0000-%' or id::text like 'eeeeeeee-0000-%' or raw_user_meta_data ->> 'demo' = 'true'
union all
select 'seeded stay requests left', count(*) from public.stay_request where requester_name like '[%'
union all
-- These 4 stored files are deleted in the Storage dashboard after step 2
-- (host-photos: folder dddddddd-6666-4000-8000-000000000001; partner-documents:
-- folder merchant/dddddddd-1111-4000-8000-000000000001). 4 before, 0 after.
select 'demo files left in storage', count(*) from storage.objects
 where (bucket_id = 'host-photos' and name like 'dddddddd-6666-4000-8000-000000000001/%')
    or (bucket_id = 'partner-documents' and name like 'merchant/dddddddd-1111-4000-8000-000000000001/%');
