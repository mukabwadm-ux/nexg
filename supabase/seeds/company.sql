-- Company (the console's back office): sample records for local development.
--
-- Local only, like the other seeds: production starts empty and fills from
-- the console. Written straight into the tables because seeds run as the
-- database owner, with no signed-in staff member for the rpc_company_*
-- functions to check. Every figure the Company pages show is computed from
-- these rows; nothing here is a total.

do $$
declare
  v_admin uuid := '00000000-0000-4000-8000-00000000000a';
  v_ops uuid := '00000000-0000-4000-8000-00000000000b';
  v_nbo uuid := (select id from public.city where slug = 'nairobi');
  v_mba uuid := (select id from public.city where slug = 'mombasa');
  v_ksm uuid := (select id from public.city where slug = 'kisumu');
  v_cat_it uuid := (select id from public.company_category where name = 'IT & Electronics');
  v_cat_furn uuid := (select id from public.company_category where name = 'Furniture');
  v_cat_eq uuid := (select id from public.company_category where name = 'Equipment');
  v_cat_gear uuid := (select id from public.company_category where name = 'Rider Gear');
  v_cat_sup uuid := (select id from public.company_category where name = 'Supplies');
  v_cat_off uuid := (select id from public.company_category where name = 'Office Supplies');
  v_cat_veh uuid := (select id from public.company_category where name = 'Vehicles');
  v_pr uuid;
  v_po uuid;
begin
  if v_admin is null or not exists (select 1 from public.staff_user where id = v_admin) then
    raise notice 'company seed: no dev admin, skipped';
    return;
  end if;

  insert into public.company_location (id, name, kind, city_id, address, manager_id, phone, created_by, created_at) values
    ('c0a00000-0000-4000-8000-000000000001', 'Nairobi HQ', 'office', v_nbo, 'Westlands, Nairobi', v_admin, '+254700100200', v_admin, now() - interval '120 days'),
    ('c0a00000-0000-4000-8000-000000000002', 'Central Store', 'warehouse', v_nbo, 'Industrial Area, Nairobi', v_admin, null, v_admin, now() - interval '110 days'),
    ('c0a00000-0000-4000-8000-000000000003', 'Mombasa Office', 'office', v_mba, 'Nyali, Mombasa', null, null, v_admin, now() - interval '90 days'),
    ('c0a00000-0000-4000-8000-000000000004', 'Kisumu Office', 'office', v_ksm, 'Milimani, Kisumu', null, null, v_admin, now() - interval '60 days'),
    ('c0a00000-0000-4000-8000-000000000005', 'Westlands Rider Hub', 'hub', v_nbo, 'Woodvale Grove, Westlands', v_ops, null, v_admin, now() - interval '45 days')
  on conflict (id) do nothing;

  insert into public.company_vendor (id, name, categories, contact_name, email, phone, website, city_id, tax_pin, payment_terms, rating, status, created_by, created_at) values
    ('c0b00000-0000-4000-8000-000000000001', 'Tech Hub Kenya Ltd', array['it_electronics'], 'Faith Wanjiru', 'sales@techhub.example', '+254711000001', 'https://techhub.example', v_nbo, 'P051234567A', 'net_30', 5, 'active', v_admin, now() - interval '118 days'),
    ('c0b00000-0000-4000-8000-000000000002', 'Furniture Palace', array['furniture'], 'Peter Kamau', 'orders@furniturepalace.example', '+254711000002', null, v_nbo, null, 'on_delivery', 4, 'active', v_admin, now() - interval '115 days'),
    ('c0b00000-0000-4000-8000-000000000003', 'Rider Gear Africa', array['rider_gear', 'logistics'], 'Brian Otieno', 'hello@ridergear.example', '+254711000003', null, v_nbo, 'P051234567C', 'net_15', 4, 'active', v_admin, now() - interval '100 days'),
    ('c0b00000-0000-4000-8000-000000000004', 'OfficeMart Supplies', array['office_supplies', 'printing', 'cleaning'], 'Grace Achieng', 'accounts@officemart.example', '+254711000004', null, v_nbo, null, 'net_30', 3, 'active', v_admin, now() - interval '95 days'),
    ('c0b00000-0000-4000-8000-000000000005', 'Westlands Fuel Depot', array['fuel_energy'], null, null, '+254711000005', null, v_nbo, null, 'prepaid', null, 'on_hold', v_admin, now() - interval '80 days')
  on conflict (id) do nothing;

  insert into public.company_item (id, name, sku, category_id, unit, unit_cost_cents, reorder_level, vendor_id, created_by, created_at) values
    ('c0c00000-0000-4000-8000-000000000001', 'Office Chair – Ergonomic', 'FUR-CHR-01', v_cat_furn, 'pcs', 1800000, 5, 'c0b00000-0000-4000-8000-000000000002', v_admin, now() - interval '100 days'),
    ('c0c00000-0000-4000-8000-000000000002', 'Printer – Laser, A4', 'EQP-PRN-01', v_cat_eq, 'pcs', 6500000, 2, 'c0b00000-0000-4000-8000-000000000001', v_admin, now() - interval '98 days'),
    ('c0c00000-0000-4000-8000-000000000003', 'Rider Safety Vest', 'RG-VST-01', v_cat_gear, 'pcs', 120000, 40, 'c0b00000-0000-4000-8000-000000000003', v_admin, now() - interval '90 days'),
    ('c0c00000-0000-4000-8000-000000000004', 'Rider Helmet – Full Face', 'RG-HLM-01', v_cat_gear, 'pcs', 450000, 100, 'c0b00000-0000-4000-8000-000000000003', v_admin, now() - interval '90 days'),
    ('c0c00000-0000-4000-8000-000000000005', 'Wi-Fi Router – 4G', 'IT-RTR-01', v_cat_it, 'pcs', 1200000, 3, 'c0b00000-0000-4000-8000-000000000001', v_admin, now() - interval '70 days'),
    ('c0c00000-0000-4000-8000-000000000006', 'Generator Fuel (Diesel)', 'SUP-DSL', v_cat_sup, 'L', 18000, 50, 'c0b00000-0000-4000-8000-000000000005', v_admin, now() - interval '60 days'),
    ('c0c00000-0000-4000-8000-000000000007', 'A4 Paper', 'OFF-A4', v_cat_off, 'ream', 65000, 30, 'c0b00000-0000-4000-8000-000000000004', v_admin, now() - interval '50 days'),
    ('c0c00000-0000-4000-8000-000000000008', 'Toner Cartridge', 'OFF-TNR', v_cat_off, 'pcs', 950000, 2, 'c0b00000-0000-4000-8000-000000000004', v_admin, now() - interval '40 days')
  on conflict (id) do nothing;

  insert into public.company_stock (item_id, location_id, quantity, created_at, updated_at) values
    ('c0c00000-0000-4000-8000-000000000001', 'c0a00000-0000-4000-8000-000000000001', 60, now() - interval '100 days', now() - interval '20 days'),
    ('c0c00000-0000-4000-8000-000000000002', 'c0a00000-0000-4000-8000-000000000001', 8, now() - interval '98 days', now() - interval '30 days'),
    ('c0c00000-0000-4000-8000-000000000003', 'c0a00000-0000-4000-8000-000000000002', 150, now() - interval '90 days', now() - interval '6 days'),
    ('c0c00000-0000-4000-8000-000000000004', 'c0a00000-0000-4000-8000-000000000002', 95, now() - interval '90 days', now() - interval '2 days'),
    ('c0c00000-0000-4000-8000-000000000005', 'c0a00000-0000-4000-8000-000000000003', 12, now() - interval '70 days', now() - interval '5 days'),
    ('c0c00000-0000-4000-8000-000000000005', 'c0a00000-0000-4000-8000-000000000001', 4, now() - interval '70 days', now() - interval '5 days'),
    ('c0c00000-0000-4000-8000-000000000006', 'c0a00000-0000-4000-8000-000000000001', 200, now() - interval '60 days', now() - interval '9 days'),
    ('c0c00000-0000-4000-8000-000000000007', 'c0a00000-0000-4000-8000-000000000004', 25, now() - interval '50 days', now() - interval '3 days'),
    ('c0c00000-0000-4000-8000-000000000008', 'c0a00000-0000-4000-8000-000000000001', 0, now() - interval '40 days', now() - interval '12 days')
  on conflict (item_id, location_id) do nothing;

  if not exists (select 1 from public.company_stock_movement where item_id = 'c0c00000-0000-4000-8000-000000000001') then
    insert into public.company_stock_movement (item_id, kind, quantity, from_location_id, to_location_id, unit_cost_cents, reason, note, created_by, created_at) values
      ('c0c00000-0000-4000-8000-000000000001', 'in', 60, null, 'c0a00000-0000-4000-8000-000000000001', 1800000, 'opening', null, v_admin, now() - interval '100 days'),
      ('c0c00000-0000-4000-8000-000000000002', 'in', 8, null, 'c0a00000-0000-4000-8000-000000000001', 6500000, 'opening', null, v_admin, now() - interval '98 days'),
      ('c0c00000-0000-4000-8000-000000000003', 'in', 150, null, 'c0a00000-0000-4000-8000-000000000002', 120000, 'opening', null, v_admin, now() - interval '90 days'),
      ('c0c00000-0000-4000-8000-000000000004', 'in', 45, null, 'c0a00000-0000-4000-8000-000000000002', 450000, 'opening', null, v_admin, now() - interval '90 days'),
      ('c0c00000-0000-4000-8000-000000000005', 'in', 16, null, 'c0a00000-0000-4000-8000-000000000001', 1200000, 'opening', null, v_admin, now() - interval '70 days'),
      ('c0c00000-0000-4000-8000-000000000006', 'in', 200, null, 'c0a00000-0000-4000-8000-000000000001', 18000, 'opening', null, v_admin, now() - interval '60 days'),
      ('c0c00000-0000-4000-8000-000000000007', 'in', 35, null, 'c0a00000-0000-4000-8000-000000000004', 65000, 'opening', null, v_admin, now() - interval '50 days'),
      ('c0c00000-0000-4000-8000-000000000008', 'in', 3, null, 'c0a00000-0000-4000-8000-000000000001', 950000, 'opening', null, v_admin, now() - interval '40 days'),
      ('c0c00000-0000-4000-8000-000000000008', 'out', 3, 'c0a00000-0000-4000-8000-000000000001', null, null, 'used', 'Printers on the second floor', v_admin, now() - interval '12 days'),
      ('c0c00000-0000-4000-8000-000000000005', 'transfer', 12, 'c0a00000-0000-4000-8000-000000000001', 'c0a00000-0000-4000-8000-000000000003', null, 'move', 'Mombasa office opening', v_admin, now() - interval '5 days'),
      ('c0c00000-0000-4000-8000-000000000007', 'out', 10, 'c0a00000-0000-4000-8000-000000000004', null, null, 'used', 'Monthly office use', v_admin, now() - interval '3 days'),
      ('c0c00000-0000-4000-8000-000000000004', 'in', 50, null, 'c0a00000-0000-4000-8000-000000000002', 450000, 'purchase', 'Delivery from Rider Gear Africa', v_admin, now() - interval '2 days');
  end if;

  if not exists (select 1 from public.company_asset where serial_number = 'SAMPLE-MBP-78421') then
    insert into public.company_asset (name, category_id, brand, model, serial_number, location_id, assigned_to, assignee_name, assigned_at, condition, status, purchase_date, purchase_cost_cents, vendor_id, warranty_until, next_service_on, created_by, created_at) values
      ('MacBook Pro 14"', v_cat_it, 'Apple', 'M3 Pro', 'SAMPLE-MBP-78421', 'c0a00000-0000-4000-8000-000000000001', v_admin, null, now() - interval '40 days', 'good', 'in_use', current_date - 140, 25000000, 'c0b00000-0000-4000-8000-000000000001', current_date + 225, null, v_admin, now() - interval '140 days'),
      ('Delivery Motorbike', v_cat_veh, 'Honda', 'Ace 125', 'SAMPLE-KMFX-412', 'c0a00000-0000-4000-8000-000000000005', null, 'Rider #442 – Brian O.', now() - interval '30 days', 'good', 'in_use', current_date - 200, 18500000, null, null, current_date + 6, v_admin, now() - interval '200 days'),
      ('Standby Generator 20kVA', v_cat_eq, 'Perkins', '20kVA', 'SAMPLE-GEN-2207', 'c0a00000-0000-4000-8000-000000000001', null, null, null, 'fair', 'maintenance', current_date - 400, 95000000, null, null, current_date + 40, v_admin, now() - interval '400 days'),
      ('Projector – Boardroom', v_cat_eq, 'Epson', 'EB-X51', 'SAMPLE-PRJ-551', 'c0a00000-0000-4000-8000-000000000001', null, null, null, 'good', 'available', current_date - 90, 6500000, 'c0b00000-0000-4000-8000-000000000001', current_date + 275, current_date - 3, v_admin, now() - interval '90 days'),
      ('Android phone – Dispatch', v_cat_it, 'Samsung', 'Galaxy A35', 'SAMPLE-SMA-3501', 'c0a00000-0000-4000-8000-000000000003', v_ops, null, now() - interval '20 days', 'new', 'in_use', current_date - 25, 4200000, 'c0b00000-0000-4000-8000-000000000001', current_date + 340, null, v_admin, now() - interval '25 days'),
      ('Old reception desktop', v_cat_it, null, null, 'SAMPLE-DT-0091', 'c0a00000-0000-4000-8000-000000000001', null, null, null, 'broken', 'retired', current_date - 1500, 7000000, null, null, null, v_admin, now() - interval '700 days');

    insert into public.company_asset_event (asset_id, kind, detail, cost_cents, due_on, staff_id, at)
    select a.id, e.kind, e.detail, e.cost, e.due, v_admin, e.at
    from public.company_asset a
    join (values
      ('SAMPLE-MBP-78421', 'registered', null::text, 25000000::bigint, null::date, now() - interval '140 days'),
      ('SAMPLE-MBP-78421', 'assigned', 'To [Dev Admin]', null, null, now() - interval '40 days'),
      ('SAMPLE-KMFX-412', 'registered', null, 18500000, null, now() - interval '200 days'),
      ('SAMPLE-KMFX-412', 'assigned', 'To Rider #442 – Brian O.', null, null, now() - interval '30 days'),
      ('SAMPLE-KMFX-412', 'maintenance_scheduled', 'Oil change and chain', null, current_date + 6, now() - interval '4 days'),
      ('SAMPLE-GEN-2207', 'registered', null, 95000000, null, now() - interval '400 days'),
      ('SAMPLE-GEN-2207', 'maintenance_started', 'Service scheduled – injector cleaning', null, null, now() - interval '6 days'),
      ('SAMPLE-PRJ-551', 'registered', null, 6500000, null, now() - interval '90 days'),
      ('SAMPLE-SMA-3501', 'registered', null, 4200000, null, now() - interval '25 days'),
      ('SAMPLE-SMA-3501', 'assigned', 'To [Dev Ops]', null, null, now() - interval '20 days'),
      ('SAMPLE-DT-0091', 'registered', null, 7000000, null, now() - interval '700 days'),
      ('SAMPLE-DT-0091', 'retired', 'Power supply failed; not worth repairing', null, null, now() - interval '30 days')
    ) as e (serial, kind, detail, cost, due, at) on e.serial = a.serial_number;
  end if;

  if not exists (select 1 from public.company_purchase_request where title like 'Sample:%') then
    /* Waiting for a decision, asked by Dev Ops so the dev admin can approve it. */
    insert into public.company_purchase_request (title, justification, department, priority, needed_by, vendor_id, location_id, status, total_cents, requested_by, submitted_at, created_at)
    values ('Sample: helmets for the new Westlands riders', 'Thirty riders start on the 1st and the store is under its reorder level.', 'riders', 'high', current_date + 10, 'c0b00000-0000-4000-8000-000000000003', 'c0a00000-0000-4000-8000-000000000002', 'submitted', 13500000, v_ops, now() - interval '1 day', now() - interval '1 day')
    returning id into v_pr;
    insert into public.company_purchase_line (request_id, item_id, description, quantity, unit_cost_cents, sort)
    values (v_pr, 'c0c00000-0000-4000-8000-000000000004', 'Rider Helmet – Full Face', 30, 450000, 1);

    /* Ordered and on its way. */
    insert into public.company_purchase_request (title, department, priority, vendor_id, location_id, status, total_cents, requested_by, submitted_at, decided_by, decided_at, created_at)
    values ('Sample: toner and paper for HQ', 'office', 'normal', 'c0b00000-0000-4000-8000-000000000004', 'c0a00000-0000-4000-8000-000000000001', 'ordered', 4400000, v_ops, now() - interval '6 days', v_admin, now() - interval '5 days', now() - interval '6 days')
    returning id into v_pr;
    insert into public.company_purchase_line (request_id, item_id, description, quantity, unit_cost_cents, sort) values
      (v_pr, 'c0c00000-0000-4000-8000-000000000008', 'Toner Cartridge', 4, 950000, 1),
      (v_pr, 'c0c00000-0000-4000-8000-000000000007', 'A4 Paper', 10, 60000, 2);
    insert into public.company_purchase_order (request_id, vendor_id, location_id, status, total_cents, expected_on, issued_by, issued_at)
    values (v_pr, 'c0b00000-0000-4000-8000-000000000004', 'c0a00000-0000-4000-8000-000000000001', 'issued', 4400000, current_date + 2, v_admin, now() - interval '4 days');

    /* Delivered earlier this month. */
    insert into public.company_purchase_request (title, department, priority, vendor_id, location_id, status, total_cents, requested_by, submitted_at, decided_by, decided_at, created_at)
    values ('Sample: helmet restock', 'riders', 'normal', 'c0b00000-0000-4000-8000-000000000003', 'c0a00000-0000-4000-8000-000000000002', 'received', 22500000, v_ops, now() - interval '9 days', v_admin, now() - interval '8 days', now() - interval '9 days')
    returning id into v_pr;
    insert into public.company_purchase_line (request_id, item_id, description, quantity, unit_cost_cents, received_quantity, sort)
    values (v_pr, 'c0c00000-0000-4000-8000-000000000004', 'Rider Helmet – Full Face', 50, 450000, 50, 1);
    insert into public.company_purchase_order (request_id, vendor_id, location_id, status, total_cents, issued_by, issued_at, received_at)
    values (v_pr, 'c0b00000-0000-4000-8000-000000000003', 'c0a00000-0000-4000-8000-000000000002', 'received', 22500000, v_admin, now() - interval '7 days', now() - interval '2 days')
    returning id into v_po;
    update public.company_stock_movement set purchase_order_id = v_po
    where item_id = 'c0c00000-0000-4000-8000-000000000004' and reason = 'purchase';

    /* A draft nobody has sent yet. */
    insert into public.company_purchase_request (title, department, priority, status, total_cents, requested_by, created_at)
    values ('Sample: standing desks for the product team', 'technology', 'low', 'draft', 9000000, v_admin, now() - interval '2 days')
    returning id into v_pr;
    insert into public.company_purchase_line (request_id, description, quantity, unit_cost_cents, sort)
    values (v_pr, 'Standing desk, electric', 3, 3000000, 1);
  end if;

  insert into public.company_folder (name, color, created_by) values
    ('Contracts', 'gold', v_admin),
    ('Policies', 'gold', v_admin),
    ('Finance', 'green', v_admin),
    ('Operations', 'gold', v_admin),
    ('Compliance', 'blue', v_admin),
    ('Marketing', 'purple', v_admin),
    ('HR & People', 'gold', v_admin),
    ('Legal', 'ink', v_admin)
  on conflict do nothing;
end;
$$;
