-- NexG Nairobi Synthetic Merchant Seed Catalog
-- Generated from NEXG_Nairobi_Merchant_Seed_Catalog.xlsx
-- Includes 640 realistic Nairobi merchants and their branches.

do $$
declare
  v_city uuid;
  v_zone uuid;
  v_merchant_id uuid;
begin
  select id into v_city from public.city where name = 'Nairobi' limit 1;
  if v_city is null then
    raise notice 'No Nairobi city found; skipping merchant catalog seed.';
    return;
  end if;

  -- [M0001] Nairobi Adult Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000001') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000001', 'Nairobi Adult Works Ltd', 'Nairobi Adult Works', 'adults_only', 'adult_products',
      'Manager Nairobi Adult Works', '+254700000000', 'm0001@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0002] Kijiji Adult Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000002') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000002', 'Kijiji Adult Atelier Ltd', 'Kijiji Adult Atelier', 'adults_only', 'adult_products',
      'Manager Kijiji Adult Atelier', '+254700000001', 'm0002@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0003] Mara Adult Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000003') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000003', 'Mara Adult Services Ltd', 'Mara Adult Services', 'adults_only', 'adult_products',
      'Manager Mara Adult Services', '+254700000002', 'm0003@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0004] Urban Adult House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000004') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000004', 'Urban Adult House Ltd', 'Urban Adult House', 'adults_only', 'adult_products',
      'Manager Urban Adult House', '+254700000003', 'm0004@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000004', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0005] Soko Adult Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000005') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000005', 'Soko Adult Co. Ltd', 'Soko Adult Co.', 'adults_only', 'adult_products',
      'Manager Soko Adult Co.', '+254700000004', 'm0005@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000005', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0006] Savanna Adult Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000006') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000006', 'Savanna Adult Works Ltd', 'Savanna Adult Works', 'adults_only', 'adult_wellness',
      'Manager Savanna Adult Works', '+254700000005', 'm0006@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000006', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0007] Jua Adult Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000007') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000007', 'Jua Adult Atelier Ltd', 'Jua Adult Atelier', 'adults_only', 'adult_wellness',
      'Manager Jua Adult Atelier', '+254700000006', 'm0007@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000007', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0008] Kipepeo Adult Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000008') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000008', 'Kipepeo Adult Services Ltd', 'Kipepeo Adult Services', 'adults_only', 'adult_wellness',
      'Manager Kipepeo Adult Services', '+254700000007', 'm0008@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000008', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0009] Atlas Adult House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000009') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000009', 'Atlas Adult House Ltd', 'Atlas Adult House', 'adults_only', 'adult_wellness',
      'Manager Atlas Adult House', '+254700000008', 'm0009@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000009', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0010] Gold Adult Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000010') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000010', 'Gold Adult Co. Ltd', 'Gold Adult Co.', 'adults_only', 'adult_wellness',
      'Manager Gold Adult Co.', '+254700000009', 'm0010@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000010', 'c1000000-0000-4000-8000-000000000010', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0011] Mtaa Cigarettes Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000011') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000011', 'Mtaa Cigarettes Works Ltd', 'Mtaa Cigarettes Works', 'adults_only', 'cigarettes',
      'Manager Mtaa Cigarettes Works', '+254700000010', 'm0011@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000011', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0012] Amani Cigarettes Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000012') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000012', 'Amani Cigarettes Atelier Ltd', 'Amani Cigarettes Atelier', 'adults_only', 'cigarettes',
      'Manager Amani Cigarettes Atelier', '+254700000011', 'm0012@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000012', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0013] Rift Cigarettes Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000013') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000013', 'Rift Cigarettes Services Ltd', 'Rift Cigarettes Services', 'adults_only', 'cigarettes',
      'Manager Rift Cigarettes Services', '+254700000012', 'm0013@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000013', 'c1000000-0000-4000-8000-000000000013', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0014] Karibu Cigarettes House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000014') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000014', 'Karibu Cigarettes House Ltd', 'Karibu Cigarettes House', 'adults_only', 'cigarettes',
      'Manager Karibu Cigarettes House', '+254700000013', 'm0014@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000014', 'c1000000-0000-4000-8000-000000000014', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0015] Luxe Cigarettes Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000015') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000015', 'Luxe Cigarettes Co. Ltd', 'Luxe Cigarettes Co.', 'adults_only', 'cigarettes',
      'Manager Luxe Cigarettes Co.', '+254700000014', 'm0015@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000015', 'c1000000-0000-4000-8000-000000000015', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0016] Nairobi Cigars Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000016') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000016', 'Nairobi Cigars Works Ltd', 'Nairobi Cigars Works', 'adults_only', 'cigars',
      'Manager Nairobi Cigars Works', '+254700000015', 'm0016@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000016', 'c1000000-0000-4000-8000-000000000016', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0017] Kijiji Cigars Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000017') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000017', 'Kijiji Cigars Atelier Ltd', 'Kijiji Cigars Atelier', 'adults_only', 'cigars',
      'Manager Kijiji Cigars Atelier', '+254700000016', 'm0017@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000017', 'c1000000-0000-4000-8000-000000000017', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0018] Mara Cigars Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000018') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000018', 'Mara Cigars Services Ltd', 'Mara Cigars Services', 'adults_only', 'cigars',
      'Manager Mara Cigars Services', '+254700000017', 'm0018@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000018', 'c1000000-0000-4000-8000-000000000018', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0019] Urban Cigars House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000019') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000019', 'Urban Cigars House Ltd', 'Urban Cigars House', 'adults_only', 'cigars',
      'Manager Urban Cigars House', '+254700000018', 'm0019@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000019', 'c1000000-0000-4000-8000-000000000019', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0020] Soko Cigars Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000020') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000020', 'Soko Cigars Co. Ltd', 'Soko Cigars Co.', 'adults_only', 'cigars',
      'Manager Soko Cigars Co.', '+254700000019', 'm0020@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000020', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0021] Savanna Vapes Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000021') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000021', 'Savanna Vapes Works Ltd', 'Savanna Vapes Works', 'adults_only', 'vapes',
      'Manager Savanna Vapes Works', '+254700000020', 'm0021@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000021', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0022] Jua Vapes Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000022') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000022', 'Jua Vapes Atelier Ltd', 'Jua Vapes Atelier', 'adults_only', 'vapes',
      'Manager Jua Vapes Atelier', '+254700000021', 'm0022@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000022', 'c1000000-0000-4000-8000-000000000022', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0023] Kipepeo Vapes Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000023') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000023', 'Kipepeo Vapes Services Ltd', 'Kipepeo Vapes Services', 'adults_only', 'vapes',
      'Manager Kipepeo Vapes Services', '+254700000022', 'm0023@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000023', 'c1000000-0000-4000-8000-000000000023', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0024] Atlas Vapes House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000024') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000024', 'Atlas Vapes House Ltd', 'Atlas Vapes House', 'adults_only', 'vapes',
      'Manager Atlas Vapes House', '+254700000023', 'm0024@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000024', 'c1000000-0000-4000-8000-000000000024', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0025] Gold Vapes Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000025') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000025', 'Gold Vapes Co. Ltd', 'Gold Vapes Co.', 'adults_only', 'vapes',
      'Manager Gold Vapes Co.', '+254700000024', 'm0025@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000025', 'c1000000-0000-4000-8000-000000000025', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0026] Mtaa Adult Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000026') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000026', 'Mtaa Adult Works Ltd', 'Mtaa Adult Works', 'adults_only', 'adult_accessories',
      'Manager Mtaa Adult Works', '+254700000025', 'm0026@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000026', 'c1000000-0000-4000-8000-000000000026', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0027] Amani Adult Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000027') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000027', 'Amani Adult Atelier Ltd', 'Amani Adult Atelier', 'adults_only', 'adult_accessories',
      'Manager Amani Adult Atelier', '+254700000026', 'm0027@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000027', 'c1000000-0000-4000-8000-000000000027', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0028] Rift Adult Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000028') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000028', 'Rift Adult Services Ltd', 'Rift Adult Services', 'adults_only', 'adult_accessories',
      'Manager Rift Adult Services', '+254700000027', 'm0028@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000028', 'c1000000-0000-4000-8000-000000000028', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0029] Karibu Adult House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000029') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000029', 'Karibu Adult House Ltd', 'Karibu Adult House', 'adults_only', 'adult_accessories',
      'Manager Karibu Adult House', '+254700000028', 'm0029@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000029', 'c1000000-0000-4000-8000-000000000029', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0030] Luxe Adult Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000030') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000030', 'Luxe Adult Co. Ltd', 'Luxe Adult Co.', 'adults_only', 'adult_accessories',
      'Manager Luxe Adult Co.', '+254700000029', 'm0030@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000030', 'c1000000-0000-4000-8000-000000000030', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0031] Nairobi Airport Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000031') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000031', 'Nairobi Airport Works Ltd', 'Nairobi Airport Works', 'airport_transfers', 'airport_pickup',
      'Manager Nairobi Airport Works', '+254700000030', 'm0031@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000031', 'c1000000-0000-4000-8000-000000000031', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0032] Kijiji Airport Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000032') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000032', 'Kijiji Airport Atelier Ltd', 'Kijiji Airport Atelier', 'airport_transfers', 'airport_pickup',
      'Manager Kijiji Airport Atelier', '+254700000031', 'm0032@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000032', 'c1000000-0000-4000-8000-000000000032', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0033] Mara Airport Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000033') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000033', 'Mara Airport Services Ltd', 'Mara Airport Services', 'airport_transfers', 'airport_pickup',
      'Manager Mara Airport Services', '+254700000032', 'm0033@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000033', 'c1000000-0000-4000-8000-000000000033', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0034] Urban Airport House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000034') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000034', 'Urban Airport House Ltd', 'Urban Airport House', 'airport_transfers', 'airport_pickup',
      'Manager Urban Airport House', '+254700000033', 'm0034@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000034', 'c1000000-0000-4000-8000-000000000034', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0035] Soko Airport Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000035') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000035', 'Soko Airport Co. Ltd', 'Soko Airport Co.', 'airport_transfers', 'airport_pickup',
      'Manager Soko Airport Co.', '+254700000034', 'm0035@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000035', 'c1000000-0000-4000-8000-000000000035', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0036] Savanna Airport Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000036') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000036', 'Savanna Airport Works Ltd', 'Savanna Airport Works', 'airport_transfers', 'airport_drop-off',
      'Manager Savanna Airport Works', '+254700000035', 'm0036@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000036', 'c1000000-0000-4000-8000-000000000036', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0037] Jua Airport Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000037') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000037', 'Jua Airport Atelier Ltd', 'Jua Airport Atelier', 'airport_transfers', 'airport_drop-off',
      'Manager Jua Airport Atelier', '+254700000036', 'm0037@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000037', 'c1000000-0000-4000-8000-000000000037', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0038] Kipepeo Airport Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000038') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000038', 'Kipepeo Airport Services Ltd', 'Kipepeo Airport Services', 'airport_transfers', 'airport_drop-off',
      'Manager Kipepeo Airport Services', '+254700000037', 'm0038@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000038', 'c1000000-0000-4000-8000-000000000038', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0039] Atlas Airport House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000039') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000039', 'Atlas Airport House Ltd', 'Atlas Airport House', 'airport_transfers', 'airport_drop-off',
      'Manager Atlas Airport House', '+254700000038', 'm0039@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000039', 'c1000000-0000-4000-8000-000000000039', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0040] Gold Airport Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000040') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000040', 'Gold Airport Co. Ltd', 'Gold Airport Co.', 'airport_transfers', 'airport_drop-off',
      'Manager Gold Airport Co.', '+254700000039', 'm0040@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000040', 'c1000000-0000-4000-8000-000000000040', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0041] Mtaa Meet Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000041') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000041', 'Mtaa Meet Works Ltd', 'Mtaa Meet Works', 'airport_transfers', 'meet__greet',
      'Manager Mtaa Meet Works', '+254700000040', 'm0041@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000041', 'c1000000-0000-4000-8000-000000000041', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0042] Amani Meet Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000042') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000042', 'Amani Meet Atelier Ltd', 'Amani Meet Atelier', 'airport_transfers', 'meet__greet',
      'Manager Amani Meet Atelier', '+254700000041', 'm0042@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000042', 'c1000000-0000-4000-8000-000000000042', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0043] Rift Meet Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000043') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000043', 'Rift Meet Services Ltd', 'Rift Meet Services', 'airport_transfers', 'meet__greet',
      'Manager Rift Meet Services', '+254700000042', 'm0043@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000043', 'c1000000-0000-4000-8000-000000000043', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0044] Karibu Meet House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000044') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000044', 'Karibu Meet House Ltd', 'Karibu Meet House', 'airport_transfers', 'meet__greet',
      'Manager Karibu Meet House', '+254700000043', 'm0044@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000044', 'c1000000-0000-4000-8000-000000000044', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0045] Luxe Meet Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000045') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000045', 'Luxe Meet Co. Ltd', 'Luxe Meet Co.', 'airport_transfers', 'meet__greet',
      'Manager Luxe Meet Co.', '+254700000044', 'm0045@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000045', 'c1000000-0000-4000-8000-000000000045', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0046] Nairobi Executive Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000046') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000046', 'Nairobi Executive Works Ltd', 'Nairobi Executive Works', 'airport_transfers', 'executive_transfer',
      'Manager Nairobi Executive Works', '+254700000045', 'm0046@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000046', 'c1000000-0000-4000-8000-000000000046', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0047] Kijiji Executive Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000047') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000047', 'Kijiji Executive Atelier Ltd', 'Kijiji Executive Atelier', 'airport_transfers', 'executive_transfer',
      'Manager Kijiji Executive Atelier', '+254700000046', 'm0047@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000047', 'c1000000-0000-4000-8000-000000000047', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0048] Mara Executive Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000048') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000048', 'Mara Executive Services Ltd', 'Mara Executive Services', 'airport_transfers', 'executive_transfer',
      'Manager Mara Executive Services', '+254700000047', 'm0048@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000048', 'c1000000-0000-4000-8000-000000000048', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0049] Urban Executive House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000049') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000049', 'Urban Executive House Ltd', 'Urban Executive House', 'airport_transfers', 'executive_transfer',
      'Manager Urban Executive House', '+254700000048', 'm0049@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000049', 'c1000000-0000-4000-8000-000000000049', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0050] Soko Executive Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000050') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000050', 'Soko Executive Co. Ltd', 'Soko Executive Co.', 'airport_transfers', 'executive_transfer',
      'Manager Soko Executive Co.', '+254700000049', 'm0050@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000050', 'c1000000-0000-4000-8000-000000000050', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0051] Savanna Wine Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000051') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000051', 'Savanna Wine Works Ltd', 'Savanna Wine Works', 'alcohol_beverages', 'wine',
      'Manager Savanna Wine Works', '+254700000050', 'm0051@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000051', 'c1000000-0000-4000-8000-000000000051', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0052] Jua Wine Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000052') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000052', 'Jua Wine Atelier Ltd', 'Jua Wine Atelier', 'alcohol_beverages', 'wine',
      'Manager Jua Wine Atelier', '+254700000051', 'm0052@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000052', 'c1000000-0000-4000-8000-000000000052', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0053] Kipepeo Wine Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000053') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000053', 'Kipepeo Wine Services Ltd', 'Kipepeo Wine Services', 'alcohol_beverages', 'wine',
      'Manager Kipepeo Wine Services', '+254700000052', 'm0053@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000053', 'c1000000-0000-4000-8000-000000000053', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0054] Atlas Wine House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000054') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000054', 'Atlas Wine House Ltd', 'Atlas Wine House', 'alcohol_beverages', 'wine',
      'Manager Atlas Wine House', '+254700000053', 'm0054@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000054', 'c1000000-0000-4000-8000-000000000054', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0055] Gold Wine Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000055') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000055', 'Gold Wine Co. Ltd', 'Gold Wine Co.', 'alcohol_beverages', 'wine',
      'Manager Gold Wine Co.', '+254700000054', 'm0055@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000055', 'c1000000-0000-4000-8000-000000000055', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0056] Mtaa Spirits Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000056') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000056', 'Mtaa Spirits Works Ltd', 'Mtaa Spirits Works', 'alcohol_beverages', 'spirits',
      'Manager Mtaa Spirits Works', '+254700000055', 'm0056@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000056', 'c1000000-0000-4000-8000-000000000056', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0057] Amani Spirits Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000057') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000057', 'Amani Spirits Atelier Ltd', 'Amani Spirits Atelier', 'alcohol_beverages', 'spirits',
      'Manager Amani Spirits Atelier', '+254700000056', 'm0057@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000057', 'c1000000-0000-4000-8000-000000000057', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0058] Rift Spirits Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000058') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000058', 'Rift Spirits Services Ltd', 'Rift Spirits Services', 'alcohol_beverages', 'spirits',
      'Manager Rift Spirits Services', '+254700000057', 'm0058@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000058', 'c1000000-0000-4000-8000-000000000058', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0059] Karibu Spirits House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000059') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000059', 'Karibu Spirits House Ltd', 'Karibu Spirits House', 'alcohol_beverages', 'spirits',
      'Manager Karibu Spirits House', '+254700000058', 'm0059@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000059', 'c1000000-0000-4000-8000-000000000059', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0060] Luxe Spirits Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000060') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000060', 'Luxe Spirits Co. Ltd', 'Luxe Spirits Co.', 'alcohol_beverages', 'spirits',
      'Manager Luxe Spirits Co.', '+254700000059', 'm0060@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000060', 'c1000000-0000-4000-8000-000000000060', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0061] Nairobi Beer Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000061') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000061', 'Nairobi Beer Works Ltd', 'Nairobi Beer Works', 'alcohol_beverages', 'beer',
      'Manager Nairobi Beer Works', '+254700000060', 'm0061@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000061', 'c1000000-0000-4000-8000-000000000061', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0062] Kijiji Beer Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000062') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000062', 'Kijiji Beer Atelier Ltd', 'Kijiji Beer Atelier', 'alcohol_beverages', 'beer',
      'Manager Kijiji Beer Atelier', '+254700000061', 'm0062@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000062', 'c1000000-0000-4000-8000-000000000062', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0063] Mara Beer Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000063') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000063', 'Mara Beer Services Ltd', 'Mara Beer Services', 'alcohol_beverages', 'beer',
      'Manager Mara Beer Services', '+254700000062', 'm0063@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000063', 'c1000000-0000-4000-8000-000000000063', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0064] Urban Beer House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000064') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000064', 'Urban Beer House Ltd', 'Urban Beer House', 'alcohol_beverages', 'beer',
      'Manager Urban Beer House', '+254700000063', 'm0064@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000064', 'c1000000-0000-4000-8000-000000000064', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0065] Soko Beer Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000065') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000065', 'Soko Beer Co. Ltd', 'Soko Beer Co.', 'alcohol_beverages', 'beer',
      'Manager Soko Beer Co.', '+254700000064', 'm0065@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000065', 'c1000000-0000-4000-8000-000000000065', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0066] Savanna Champagne Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000066') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000066', 'Savanna Champagne Works Ltd', 'Savanna Champagne Works', 'alcohol_beverages', 'champagne',
      'Manager Savanna Champagne Works', '+254700000065', 'm0066@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000066', 'c1000000-0000-4000-8000-000000000066', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0067] Jua Champagne Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000067') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000067', 'Jua Champagne Atelier Ltd', 'Jua Champagne Atelier', 'alcohol_beverages', 'champagne',
      'Manager Jua Champagne Atelier', '+254700000066', 'm0067@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000067', 'c1000000-0000-4000-8000-000000000067', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0068] Kipepeo Champagne Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000068') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000068', 'Kipepeo Champagne Services Ltd', 'Kipepeo Champagne Services', 'alcohol_beverages', 'champagne',
      'Manager Kipepeo Champagne Services', '+254700000067', 'm0068@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000068', 'c1000000-0000-4000-8000-000000000068', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0069] Atlas Champagne House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000069') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000069', 'Atlas Champagne House Ltd', 'Atlas Champagne House', 'alcohol_beverages', 'champagne',
      'Manager Atlas Champagne House', '+254700000068', 'm0069@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000069', 'c1000000-0000-4000-8000-000000000069', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0070] Gold Champagne Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000070') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000070', 'Gold Champagne Co. Ltd', 'Gold Champagne Co.', 'alcohol_beverages', 'champagne',
      'Manager Gold Champagne Co.', '+254700000069', 'm0070@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000070', 'c1000000-0000-4000-8000-000000000070', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0071] Mtaa Cocktail Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000071') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000071', 'Mtaa Cocktail Works Ltd', 'Mtaa Cocktail Works', 'alcohol_beverages', 'cocktail_mixers',
      'Manager Mtaa Cocktail Works', '+254700000070', 'm0071@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000071', 'c1000000-0000-4000-8000-000000000071', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0072] Amani Cocktail Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000072') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000072', 'Amani Cocktail Atelier Ltd', 'Amani Cocktail Atelier', 'alcohol_beverages', 'cocktail_mixers',
      'Manager Amani Cocktail Atelier', '+254700000071', 'm0072@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000072', 'c1000000-0000-4000-8000-000000000072', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0073] Rift Cocktail Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000073') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000073', 'Rift Cocktail Services Ltd', 'Rift Cocktail Services', 'alcohol_beverages', 'cocktail_mixers',
      'Manager Rift Cocktail Services', '+254700000072', 'm0073@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000073', 'c1000000-0000-4000-8000-000000000073', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0074] Karibu Cocktail House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000074') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000074', 'Karibu Cocktail House Ltd', 'Karibu Cocktail House', 'alcohol_beverages', 'cocktail_mixers',
      'Manager Karibu Cocktail House', '+254700000073', 'm0074@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000074', 'c1000000-0000-4000-8000-000000000074', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0075] Luxe Cocktail Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000075') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000075', 'Luxe Cocktail Co. Ltd', 'Luxe Cocktail Co.', 'alcohol_beverages', 'cocktail_mixers',
      'Manager Luxe Cocktail Co.', '+254700000074', 'm0075@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000075', 'c1000000-0000-4000-8000-000000000075', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0076] Nairobi Liquor Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000076') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000076', 'Nairobi Liquor Works Ltd', 'Nairobi Liquor Works', 'alcohol_beverages', 'liquor_stores',
      'Manager Nairobi Liquor Works', '+254700000075', 'm0076@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000076', 'c1000000-0000-4000-8000-000000000076', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0077] Kijiji Liquor Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000077') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000077', 'Kijiji Liquor Atelier Ltd', 'Kijiji Liquor Atelier', 'alcohol_beverages', 'liquor_stores',
      'Manager Kijiji Liquor Atelier', '+254700000076', 'm0077@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000077', 'c1000000-0000-4000-8000-000000000077', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0078] Mara Liquor Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000078') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000078', 'Mara Liquor Services Ltd', 'Mara Liquor Services', 'alcohol_beverages', 'liquor_stores',
      'Manager Mara Liquor Services', '+254700000077', 'm0078@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000078', 'c1000000-0000-4000-8000-000000000078', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0079] Urban Liquor House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000079') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000079', 'Urban Liquor House Ltd', 'Urban Liquor House', 'alcohol_beverages', 'liquor_stores',
      'Manager Urban Liquor House', '+254700000078', 'm0079@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000079', 'c1000000-0000-4000-8000-000000000079', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0080] Soko Liquor Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000080') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000080', 'Soko Liquor Co. Ltd', 'Soko Liquor Co.', 'alcohol_beverages', 'liquor_stores',
      'Manager Soko Liquor Co.', '+254700000079', 'm0080@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000080', 'c1000000-0000-4000-8000-000000000080', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0081] Savanna Men Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000081') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000081', 'Savanna Men Works Ltd', 'Savanna Men Works', 'fashion_apparel', 'mens_fashion',
      'Manager Savanna Men Works', '+254700000080', 'm0081@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000081', 'c1000000-0000-4000-8000-000000000081', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0082] Jua Men Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000082') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000082', 'Jua Men Atelier Ltd', 'Jua Men Atelier', 'fashion_apparel', 'mens_fashion',
      'Manager Jua Men Atelier', '+254700000081', 'm0082@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000082', 'c1000000-0000-4000-8000-000000000082', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0083] Kipepeo Men Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000083') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000083', 'Kipepeo Men Services Ltd', 'Kipepeo Men Services', 'fashion_apparel', 'mens_fashion',
      'Manager Kipepeo Men Services', '+254700000082', 'm0083@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000083', 'c1000000-0000-4000-8000-000000000083', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0084] Atlas Men House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000084') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000084', 'Atlas Men House Ltd', 'Atlas Men House', 'fashion_apparel', 'mens_fashion',
      'Manager Atlas Men House', '+254700000083', 'm0084@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000084', 'c1000000-0000-4000-8000-000000000084', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0085] Gold Men Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000085') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000085', 'Gold Men Co. Ltd', 'Gold Men Co.', 'fashion_apparel', 'mens_fashion',
      'Manager Gold Men Co.', '+254700000084', 'm0085@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000085', 'c1000000-0000-4000-8000-000000000085', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0086] Mtaa Women Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000086') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000086', 'Mtaa Women Works Ltd', 'Mtaa Women Works', 'fashion_apparel', 'womens_fashion',
      'Manager Mtaa Women Works', '+254700000085', 'm0086@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000086', 'c1000000-0000-4000-8000-000000000086', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0087] Amani Women Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000087') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000087', 'Amani Women Atelier Ltd', 'Amani Women Atelier', 'fashion_apparel', 'womens_fashion',
      'Manager Amani Women Atelier', '+254700000086', 'm0087@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000087', 'c1000000-0000-4000-8000-000000000087', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0088] Rift Women Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000088') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000088', 'Rift Women Services Ltd', 'Rift Women Services', 'fashion_apparel', 'womens_fashion',
      'Manager Rift Women Services', '+254700000087', 'm0088@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000088', 'c1000000-0000-4000-8000-000000000088', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0089] Karibu Women House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000089') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000089', 'Karibu Women House Ltd', 'Karibu Women House', 'fashion_apparel', 'womens_fashion',
      'Manager Karibu Women House', '+254700000088', 'm0089@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000089', 'c1000000-0000-4000-8000-000000000089', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0090] Luxe Women Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000090') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000090', 'Luxe Women Co. Ltd', 'Luxe Women Co.', 'fashion_apparel', 'womens_fashion',
      'Manager Luxe Women Co.', '+254700000089', 'm0090@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000090', 'c1000000-0000-4000-8000-000000000090', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0091] Nairobi Kids Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000091') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000091', 'Nairobi Kids Works Ltd', 'Nairobi Kids Works', 'fashion_apparel', 'kids_fashion',
      'Manager Nairobi Kids Works', '+254700000090', 'm0091@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000091', 'c1000000-0000-4000-8000-000000000091', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0092] Kijiji Kids Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000092') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000092', 'Kijiji Kids Atelier Ltd', 'Kijiji Kids Atelier', 'fashion_apparel', 'kids_fashion',
      'Manager Kijiji Kids Atelier', '+254700000091', 'm0092@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000092', 'c1000000-0000-4000-8000-000000000092', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0093] Mara Kids Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000093') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000093', 'Mara Kids Services Ltd', 'Mara Kids Services', 'fashion_apparel', 'kids_fashion',
      'Manager Mara Kids Services', '+254700000092', 'm0093@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000093', 'c1000000-0000-4000-8000-000000000093', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0094] Urban Kids House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000094') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000094', 'Urban Kids House Ltd', 'Urban Kids House', 'fashion_apparel', 'kids_fashion',
      'Manager Urban Kids House', '+254700000093', 'm0094@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000094', 'c1000000-0000-4000-8000-000000000094', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0095] Soko Kids Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000095') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000095', 'Soko Kids Co. Ltd', 'Soko Kids Co.', 'fashion_apparel', 'kids_fashion',
      'Manager Soko Kids Co.', '+254700000094', 'm0095@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000095', 'c1000000-0000-4000-8000-000000000095', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0096] Savanna Shoes Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000096') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000096', 'Savanna Shoes Works Ltd', 'Savanna Shoes Works', 'fashion_apparel', 'shoes',
      'Manager Savanna Shoes Works', '+254700000095', 'm0096@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000096', 'c1000000-0000-4000-8000-000000000096', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0097] Jua Shoes Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000097') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000097', 'Jua Shoes Atelier Ltd', 'Jua Shoes Atelier', 'fashion_apparel', 'shoes',
      'Manager Jua Shoes Atelier', '+254700000096', 'm0097@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000097', 'c1000000-0000-4000-8000-000000000097', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0098] Kipepeo Shoes Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000098') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000098', 'Kipepeo Shoes Services Ltd', 'Kipepeo Shoes Services', 'fashion_apparel', 'shoes',
      'Manager Kipepeo Shoes Services', '+254700000097', 'm0098@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000098', 'c1000000-0000-4000-8000-000000000098', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0099] Atlas Shoes House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000099') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000099', 'Atlas Shoes House Ltd', 'Atlas Shoes House', 'fashion_apparel', 'shoes',
      'Manager Atlas Shoes House', '+254700000098', 'm0099@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000099', 'c1000000-0000-4000-8000-000000000099', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0100] Gold Shoes Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000100') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000100', 'Gold Shoes Co. Ltd', 'Gold Shoes Co.', 'fashion_apparel', 'shoes',
      'Manager Gold Shoes Co.', '+254700000099', 'm0100@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000100', 'c1000000-0000-4000-8000-000000000100', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0101] Mtaa Bags Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000101') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000101', 'Mtaa Bags Works Ltd', 'Mtaa Bags Works', 'fashion_apparel', 'bags',
      'Manager Mtaa Bags Works', '+254700000100', 'm0101@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000101', 'c1000000-0000-4000-8000-000000000101', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0102] Amani Bags Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000102') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000102', 'Amani Bags Atelier Ltd', 'Amani Bags Atelier', 'fashion_apparel', 'bags',
      'Manager Amani Bags Atelier', '+254700000101', 'm0102@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000102', 'c1000000-0000-4000-8000-000000000102', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0103] Rift Bags Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000103') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000103', 'Rift Bags Services Ltd', 'Rift Bags Services', 'fashion_apparel', 'bags',
      'Manager Rift Bags Services', '+254700000102', 'm0103@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000103', 'c1000000-0000-4000-8000-000000000103', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0104] Karibu Bags House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000104') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000104', 'Karibu Bags House Ltd', 'Karibu Bags House', 'fashion_apparel', 'bags',
      'Manager Karibu Bags House', '+254700000103', 'm0104@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000104', 'c1000000-0000-4000-8000-000000000104', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0105] Luxe Bags Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000105') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000105', 'Luxe Bags Co. Ltd', 'Luxe Bags Co.', 'fashion_apparel', 'bags',
      'Manager Luxe Bags Co.', '+254700000104', 'm0105@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000105', 'c1000000-0000-4000-8000-000000000105', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0106] Nairobi Watches Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000106') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000106', 'Nairobi Watches Works Ltd', 'Nairobi Watches Works', 'fashion_apparel', 'watches',
      'Manager Nairobi Watches Works', '+254700000105', 'm0106@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000106', 'c1000000-0000-4000-8000-000000000106', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0107] Kijiji Watches Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000107') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000107', 'Kijiji Watches Atelier Ltd', 'Kijiji Watches Atelier', 'fashion_apparel', 'watches',
      'Manager Kijiji Watches Atelier', '+254700000106', 'm0107@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000107', 'c1000000-0000-4000-8000-000000000107', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0108] Mara Watches Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000108') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000108', 'Mara Watches Services Ltd', 'Mara Watches Services', 'fashion_apparel', 'watches',
      'Manager Mara Watches Services', '+254700000107', 'm0108@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000108', 'c1000000-0000-4000-8000-000000000108', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0109] Urban Watches House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000109') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000109', 'Urban Watches House Ltd', 'Urban Watches House', 'fashion_apparel', 'watches',
      'Manager Urban Watches House', '+254700000108', 'm0109@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000109', 'c1000000-0000-4000-8000-000000000109', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0110] Soko Watches Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000110') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000110', 'Soko Watches Co. Ltd', 'Soko Watches Co.', 'fashion_apparel', 'watches',
      'Manager Soko Watches Co.', '+254700000109', 'm0110@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000110', 'c1000000-0000-4000-8000-000000000110', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0111] Savanna Accessories Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000111') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000111', 'Savanna Accessories Works Ltd', 'Savanna Accessories Works', 'fashion_apparel', 'accessories',
      'Manager Savanna Accessories Works', '+254700000110', 'm0111@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000111', 'c1000000-0000-4000-8000-000000000111', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0112] Jua Accessories Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000112') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000112', 'Jua Accessories Atelier Ltd', 'Jua Accessories Atelier', 'fashion_apparel', 'accessories',
      'Manager Jua Accessories Atelier', '+254700000111', 'm0112@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000112', 'c1000000-0000-4000-8000-000000000112', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0113] Kipepeo Accessories Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000113') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000113', 'Kipepeo Accessories Services Ltd', 'Kipepeo Accessories Services', 'fashion_apparel', 'accessories',
      'Manager Kipepeo Accessories Services', '+254700000112', 'm0113@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000113', 'c1000000-0000-4000-8000-000000000113', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0114] Atlas Accessories House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000114') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000114', 'Atlas Accessories House Ltd', 'Atlas Accessories House', 'fashion_apparel', 'accessories',
      'Manager Atlas Accessories House', '+254700000113', 'm0114@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000114', 'c1000000-0000-4000-8000-000000000114', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0115] Gold Accessories Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000115') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000115', 'Gold Accessories Co. Ltd', 'Gold Accessories Co.', 'fashion_apparel', 'accessories',
      'Manager Gold Accessories Co.', '+254700000114', 'm0115@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000115', 'c1000000-0000-4000-8000-000000000115', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0116] Mtaa Makeup Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000116') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000116', 'Mtaa Makeup Works Ltd', 'Mtaa Makeup Works', 'beauty', 'makeup',
      'Manager Mtaa Makeup Works', '+254700000115', 'm0116@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000116', 'c1000000-0000-4000-8000-000000000116', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0117] Amani Makeup Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000117') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000117', 'Amani Makeup Atelier Ltd', 'Amani Makeup Atelier', 'beauty', 'makeup',
      'Manager Amani Makeup Atelier', '+254700000116', 'm0117@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000117', 'c1000000-0000-4000-8000-000000000117', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0118] Rift Makeup Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000118') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000118', 'Rift Makeup Services Ltd', 'Rift Makeup Services', 'beauty', 'makeup',
      'Manager Rift Makeup Services', '+254700000117', 'm0118@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000118', 'c1000000-0000-4000-8000-000000000118', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0119] Karibu Makeup House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000119') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000119', 'Karibu Makeup House Ltd', 'Karibu Makeup House', 'beauty', 'makeup',
      'Manager Karibu Makeup House', '+254700000118', 'm0119@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000119', 'c1000000-0000-4000-8000-000000000119', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0120] Luxe Makeup Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000120') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000120', 'Luxe Makeup Co. Ltd', 'Luxe Makeup Co.', 'beauty', 'makeup',
      'Manager Luxe Makeup Co.', '+254700000119', 'm0120@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000120', 'c1000000-0000-4000-8000-000000000120', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0121] Nairobi Skincare Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000121') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000121', 'Nairobi Skincare Works Ltd', 'Nairobi Skincare Works', 'beauty', 'skincare',
      'Manager Nairobi Skincare Works', '+254700000120', 'm0121@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000121', 'c1000000-0000-4000-8000-000000000121', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0122] Kijiji Skincare Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000122') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000122', 'Kijiji Skincare Atelier Ltd', 'Kijiji Skincare Atelier', 'beauty', 'skincare',
      'Manager Kijiji Skincare Atelier', '+254700000121', 'm0122@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000122', 'c1000000-0000-4000-8000-000000000122', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0123] Mara Skincare Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000123') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000123', 'Mara Skincare Services Ltd', 'Mara Skincare Services', 'beauty', 'skincare',
      'Manager Mara Skincare Services', '+254700000122', 'm0123@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000123', 'c1000000-0000-4000-8000-000000000123', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0124] Urban Skincare House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000124') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000124', 'Urban Skincare House Ltd', 'Urban Skincare House', 'beauty', 'skincare',
      'Manager Urban Skincare House', '+254700000123', 'm0124@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000124', 'c1000000-0000-4000-8000-000000000124', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0125] Soko Skincare Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000125') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000125', 'Soko Skincare Co. Ltd', 'Soko Skincare Co.', 'beauty', 'skincare',
      'Manager Soko Skincare Co.', '+254700000124', 'm0125@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000125', 'c1000000-0000-4000-8000-000000000125', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0126] Savanna Haircare Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000126') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000126', 'Savanna Haircare Works Ltd', 'Savanna Haircare Works', 'beauty', 'haircare',
      'Manager Savanna Haircare Works', '+254700000125', 'm0126@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000126', 'c1000000-0000-4000-8000-000000000126', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0127] Jua Haircare Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000127') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000127', 'Jua Haircare Atelier Ltd', 'Jua Haircare Atelier', 'beauty', 'haircare',
      'Manager Jua Haircare Atelier', '+254700000126', 'm0127@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000127', 'c1000000-0000-4000-8000-000000000127', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0128] Kipepeo Haircare Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000128') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000128', 'Kipepeo Haircare Services Ltd', 'Kipepeo Haircare Services', 'beauty', 'haircare',
      'Manager Kipepeo Haircare Services', '+254700000127', 'm0128@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000128', 'c1000000-0000-4000-8000-000000000128', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0129] Atlas Haircare House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000129') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000129', 'Atlas Haircare House Ltd', 'Atlas Haircare House', 'beauty', 'haircare',
      'Manager Atlas Haircare House', '+254700000128', 'm0129@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000129', 'c1000000-0000-4000-8000-000000000129', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0130] Gold Haircare Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000130') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000130', 'Gold Haircare Co. Ltd', 'Gold Haircare Co.', 'beauty', 'haircare',
      'Manager Gold Haircare Co.', '+254700000129', 'm0130@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000130', 'c1000000-0000-4000-8000-000000000130', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0131] Mtaa Fragrances Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000131') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000131', 'Mtaa Fragrances Works Ltd', 'Mtaa Fragrances Works', 'beauty', 'fragrances',
      'Manager Mtaa Fragrances Works', '+254700000130', 'm0131@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000131', 'c1000000-0000-4000-8000-000000000131', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0132] Amani Fragrances Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000132') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000132', 'Amani Fragrances Atelier Ltd', 'Amani Fragrances Atelier', 'beauty', 'fragrances',
      'Manager Amani Fragrances Atelier', '+254700000131', 'm0132@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000132', 'c1000000-0000-4000-8000-000000000132', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0133] Rift Fragrances Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000133') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000133', 'Rift Fragrances Services Ltd', 'Rift Fragrances Services', 'beauty', 'fragrances',
      'Manager Rift Fragrances Services', '+254700000132', 'm0133@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000133', 'c1000000-0000-4000-8000-000000000133', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0134] Karibu Fragrances House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000134') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000134', 'Karibu Fragrances House Ltd', 'Karibu Fragrances House', 'beauty', 'fragrances',
      'Manager Karibu Fragrances House', '+254700000133', 'm0134@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000134', 'c1000000-0000-4000-8000-000000000134', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0135] Luxe Fragrances Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000135') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000135', 'Luxe Fragrances Co. Ltd', 'Luxe Fragrances Co.', 'beauty', 'fragrances',
      'Manager Luxe Fragrances Co.', '+254700000134', 'm0135@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000135', 'c1000000-0000-4000-8000-000000000135', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0136] Nairobi Cosmetics Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000136') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000136', 'Nairobi Cosmetics Works Ltd', 'Nairobi Cosmetics Works', 'beauty', 'cosmetics_stores',
      'Manager Nairobi Cosmetics Works', '+254700000135', 'm0136@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000136', 'c1000000-0000-4000-8000-000000000136', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0137] Kijiji Cosmetics Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000137') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000137', 'Kijiji Cosmetics Atelier Ltd', 'Kijiji Cosmetics Atelier', 'beauty', 'cosmetics_stores',
      'Manager Kijiji Cosmetics Atelier', '+254700000136', 'm0137@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000137', 'c1000000-0000-4000-8000-000000000137', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0138] Mara Cosmetics Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000138') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000138', 'Mara Cosmetics Services Ltd', 'Mara Cosmetics Services', 'beauty', 'cosmetics_stores',
      'Manager Mara Cosmetics Services', '+254700000137', 'm0138@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000138', 'c1000000-0000-4000-8000-000000000138', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0139] Urban Cosmetics House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000139') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000139', 'Urban Cosmetics House Ltd', 'Urban Cosmetics House', 'beauty', 'cosmetics_stores',
      'Manager Urban Cosmetics House', '+254700000138', 'm0139@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000139', 'c1000000-0000-4000-8000-000000000139', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0140] Soko Cosmetics Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000140') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000140', 'Soko Cosmetics Co. Ltd', 'Soko Cosmetics Co.', 'beauty', 'cosmetics_stores',
      'Manager Soko Cosmetics Co.', '+254700000139', 'm0140@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000140', 'c1000000-0000-4000-8000-000000000140', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0141] Savanna Car Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000141') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000141', 'Savanna Car Works Ltd', 'Savanna Car Works', 'vehicle_rentals', 'car_rental',
      'Manager Savanna Car Works', '+254700000140', 'm0141@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000141', 'c1000000-0000-4000-8000-000000000141', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0142] Jua Car Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000142') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000142', 'Jua Car Atelier Ltd', 'Jua Car Atelier', 'vehicle_rentals', 'car_rental',
      'Manager Jua Car Atelier', '+254700000141', 'm0142@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000142', 'c1000000-0000-4000-8000-000000000142', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0143] Kipepeo Car Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000143') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000143', 'Kipepeo Car Services Ltd', 'Kipepeo Car Services', 'vehicle_rentals', 'car_rental',
      'Manager Kipepeo Car Services', '+254700000142', 'm0143@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000143', 'c1000000-0000-4000-8000-000000000143', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0144] Atlas Car House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000144') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000144', 'Atlas Car House Ltd', 'Atlas Car House', 'vehicle_rentals', 'car_rental',
      'Manager Atlas Car House', '+254700000143', 'm0144@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000144', 'c1000000-0000-4000-8000-000000000144', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0145] Gold Car Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000145') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000145', 'Gold Car Co. Ltd', 'Gold Car Co.', 'vehicle_rentals', 'car_rental',
      'Manager Gold Car Co.', '+254700000144', 'm0145@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000145', 'c1000000-0000-4000-8000-000000000145', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0146] Mtaa Self Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000146') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000146', 'Mtaa Self Works Ltd', 'Mtaa Self Works', 'vehicle_rentals', 'self_drive',
      'Manager Mtaa Self Works', '+254700000145', 'm0146@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000146', 'c1000000-0000-4000-8000-000000000146', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0147] Amani Self Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000147') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000147', 'Amani Self Atelier Ltd', 'Amani Self Atelier', 'vehicle_rentals', 'self_drive',
      'Manager Amani Self Atelier', '+254700000146', 'm0147@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000147', 'c1000000-0000-4000-8000-000000000147', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0148] Rift Self Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000148') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000148', 'Rift Self Services Ltd', 'Rift Self Services', 'vehicle_rentals', 'self_drive',
      'Manager Rift Self Services', '+254700000147', 'm0148@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000148', 'c1000000-0000-4000-8000-000000000148', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0149] Karibu Self House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000149') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000149', 'Karibu Self House Ltd', 'Karibu Self House', 'vehicle_rentals', 'self_drive',
      'Manager Karibu Self House', '+254700000148', 'm0149@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000149', 'c1000000-0000-4000-8000-000000000149', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0150] Luxe Self Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000150') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000150', 'Luxe Self Co. Ltd', 'Luxe Self Co.', 'vehicle_rentals', 'self_drive',
      'Manager Luxe Self Co.', '+254700000149', 'm0150@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000150', 'c1000000-0000-4000-8000-000000000150', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0151] Nairobi Corporate Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000151') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000151', 'Nairobi Corporate Works Ltd', 'Nairobi Corporate Works', 'vehicle_rentals', 'corporate_rental',
      'Manager Nairobi Corporate Works', '+254700000150', 'm0151@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000151', 'c1000000-0000-4000-8000-000000000151', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0152] Kijiji Corporate Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000152') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000152', 'Kijiji Corporate Atelier Ltd', 'Kijiji Corporate Atelier', 'vehicle_rentals', 'corporate_rental',
      'Manager Kijiji Corporate Atelier', '+254700000151', 'm0152@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000152', 'c1000000-0000-4000-8000-000000000152', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0153] Mara Corporate Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000153') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000153', 'Mara Corporate Services Ltd', 'Mara Corporate Services', 'vehicle_rentals', 'corporate_rental',
      'Manager Mara Corporate Services', '+254700000152', 'm0153@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000153', 'c1000000-0000-4000-8000-000000000153', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0154] Urban Corporate House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000154') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000154', 'Urban Corporate House Ltd', 'Urban Corporate House', 'vehicle_rentals', 'corporate_rental',
      'Manager Urban Corporate House', '+254700000153', 'm0154@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000154', 'c1000000-0000-4000-8000-000000000154', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0155] Soko Corporate Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000155') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000155', 'Soko Corporate Co. Ltd', 'Soko Corporate Co.', 'vehicle_rentals', 'corporate_rental',
      'Manager Soko Corporate Co.', '+254700000154', 'm0155@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000155', 'c1000000-0000-4000-8000-000000000155', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0156] Savanna Long Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000156') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000156', 'Savanna Long Works Ltd', 'Savanna Long Works', 'vehicle_rentals', 'long-term_rental',
      'Manager Savanna Long Works', '+254700000155', 'm0156@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000156', 'c1000000-0000-4000-8000-000000000156', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0157] Jua Long Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000157') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000157', 'Jua Long Atelier Ltd', 'Jua Long Atelier', 'vehicle_rentals', 'long-term_rental',
      'Manager Jua Long Atelier', '+254700000156', 'm0157@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000157', 'c1000000-0000-4000-8000-000000000157', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0158] Kipepeo Long Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000158') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000158', 'Kipepeo Long Services Ltd', 'Kipepeo Long Services', 'vehicle_rentals', 'long-term_rental',
      'Manager Kipepeo Long Services', '+254700000157', 'm0158@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000158', 'c1000000-0000-4000-8000-000000000158', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0159] Atlas Long House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000159') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000159', 'Atlas Long House Ltd', 'Atlas Long House', 'vehicle_rentals', 'long-term_rental',
      'Manager Atlas Long House', '+254700000158', 'm0159@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000159', 'c1000000-0000-4000-8000-000000000159', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0160] Gold Long Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000160') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000160', 'Gold Long Co. Ltd', 'Gold Long Co.', 'vehicle_rentals', 'long-term_rental',
      'Manager Gold Long Co.', '+254700000159', 'm0160@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000160', 'c1000000-0000-4000-8000-000000000160', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0161] Mtaa Bike Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000161') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000161', 'Mtaa Bike Works Ltd', 'Mtaa Bike Works', 'vehicle_rentals', 'bike_rental',
      'Manager Mtaa Bike Works', '+254700000160', 'm0161@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000161', 'c1000000-0000-4000-8000-000000000161', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0162] Amani Bike Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000162') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000162', 'Amani Bike Atelier Ltd', 'Amani Bike Atelier', 'vehicle_rentals', 'bike_rental',
      'Manager Amani Bike Atelier', '+254700000161', 'm0162@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000162', 'c1000000-0000-4000-8000-000000000162', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0163] Rift Bike Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000163') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000163', 'Rift Bike Services Ltd', 'Rift Bike Services', 'vehicle_rentals', 'bike_rental',
      'Manager Rift Bike Services', '+254700000162', 'm0163@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000163', 'c1000000-0000-4000-8000-000000000163', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0164] Karibu Bike House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000164') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000164', 'Karibu Bike House Ltd', 'Karibu Bike House', 'vehicle_rentals', 'bike_rental',
      'Manager Karibu Bike House', '+254700000163', 'm0164@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000164', 'c1000000-0000-4000-8000-000000000164', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0165] Luxe Bike Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000165') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000165', 'Luxe Bike Co. Ltd', 'Luxe Bike Co.', 'vehicle_rentals', 'bike_rental',
      'Manager Luxe Bike Co.', '+254700000164', 'm0165@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000165', 'c1000000-0000-4000-8000-000000000165', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0166] Nairobi Concerts Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000166') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000166', 'Nairobi Concerts Works Ltd', 'Nairobi Concerts Works', 'experiences', 'concerts',
      'Manager Nairobi Concerts Works', '+254700000165', 'm0166@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000166', 'c1000000-0000-4000-8000-000000000166', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0167] Kijiji Concerts Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000167') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000167', 'Kijiji Concerts Atelier Ltd', 'Kijiji Concerts Atelier', 'experiences', 'concerts',
      'Manager Kijiji Concerts Atelier', '+254700000166', 'm0167@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000167', 'c1000000-0000-4000-8000-000000000167', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0168] Mara Concerts Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000168') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000168', 'Mara Concerts Services Ltd', 'Mara Concerts Services', 'experiences', 'concerts',
      'Manager Mara Concerts Services', '+254700000167', 'm0168@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000168', 'c1000000-0000-4000-8000-000000000168', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0169] Urban Concerts House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000169') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000169', 'Urban Concerts House Ltd', 'Urban Concerts House', 'experiences', 'concerts',
      'Manager Urban Concerts House', '+254700000168', 'm0169@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000169', 'c1000000-0000-4000-8000-000000000169', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0170] Soko Concerts Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000170') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000170', 'Soko Concerts Co. Ltd', 'Soko Concerts Co.', 'experiences', 'concerts',
      'Manager Soko Concerts Co.', '+254700000169', 'm0170@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000170', 'c1000000-0000-4000-8000-000000000170', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0171] Savanna Festivals Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000171') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000171', 'Savanna Festivals Works Ltd', 'Savanna Festivals Works', 'experiences', 'festivals',
      'Manager Savanna Festivals Works', '+254700000170', 'm0171@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000171', 'c1000000-0000-4000-8000-000000000171', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0172] Jua Festivals Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000172') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000172', 'Jua Festivals Atelier Ltd', 'Jua Festivals Atelier', 'experiences', 'festivals',
      'Manager Jua Festivals Atelier', '+254700000171', 'm0172@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000172', 'c1000000-0000-4000-8000-000000000172', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0173] Kipepeo Festivals Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000173') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000173', 'Kipepeo Festivals Services Ltd', 'Kipepeo Festivals Services', 'experiences', 'festivals',
      'Manager Kipepeo Festivals Services', '+254700000172', 'm0173@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000173', 'c1000000-0000-4000-8000-000000000173', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0174] Atlas Festivals House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000174') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000174', 'Atlas Festivals House Ltd', 'Atlas Festivals House', 'experiences', 'festivals',
      'Manager Atlas Festivals House', '+254700000173', 'm0174@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000174', 'c1000000-0000-4000-8000-000000000174', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0175] Gold Festivals Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000175') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000175', 'Gold Festivals Co. Ltd', 'Gold Festivals Co.', 'experiences', 'festivals',
      'Manager Gold Festivals Co.', '+254700000174', 'm0175@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000175', 'c1000000-0000-4000-8000-000000000175', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0176] Mtaa Conferences Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000176') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000176', 'Mtaa Conferences Works Ltd', 'Mtaa Conferences Works', 'experiences', 'conferences',
      'Manager Mtaa Conferences Works', '+254700000175', 'm0176@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000176', 'c1000000-0000-4000-8000-000000000176', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0177] Amani Conferences Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000177') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000177', 'Amani Conferences Atelier Ltd', 'Amani Conferences Atelier', 'experiences', 'conferences',
      'Manager Amani Conferences Atelier', '+254700000176', 'm0177@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000177', 'c1000000-0000-4000-8000-000000000177', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0178] Rift Conferences Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000178') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000178', 'Rift Conferences Services Ltd', 'Rift Conferences Services', 'experiences', 'conferences',
      'Manager Rift Conferences Services', '+254700000177', 'm0178@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000178', 'c1000000-0000-4000-8000-000000000178', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0179] Karibu Conferences House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000179') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000179', 'Karibu Conferences House Ltd', 'Karibu Conferences House', 'experiences', 'conferences',
      'Manager Karibu Conferences House', '+254700000178', 'm0179@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000179', 'c1000000-0000-4000-8000-000000000179', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0180] Luxe Conferences Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000180') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000180', 'Luxe Conferences Co. Ltd', 'Luxe Conferences Co.', 'experiences', 'conferences',
      'Manager Luxe Conferences Co.', '+254700000179', 'm0180@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000180', 'c1000000-0000-4000-8000-000000000180', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0181] Nairobi Private Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000181') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000181', 'Nairobi Private Works Ltd', 'Nairobi Private Works', 'experiences', 'private_events',
      'Manager Nairobi Private Works', '+254700000180', 'm0181@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000181', 'c1000000-0000-4000-8000-000000000181', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0182] Kijiji Private Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000182') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000182', 'Kijiji Private Atelier Ltd', 'Kijiji Private Atelier', 'experiences', 'private_events',
      'Manager Kijiji Private Atelier', '+254700000181', 'm0182@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000182', 'c1000000-0000-4000-8000-000000000182', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0183] Mara Private Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000183') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000183', 'Mara Private Services Ltd', 'Mara Private Services', 'experiences', 'private_events',
      'Manager Mara Private Services', '+254700000182', 'm0183@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000183', 'c1000000-0000-4000-8000-000000000183', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0184] Urban Private House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000184') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000184', 'Urban Private House Ltd', 'Urban Private House', 'experiences', 'private_events',
      'Manager Urban Private House', '+254700000183', 'm0184@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000184', 'c1000000-0000-4000-8000-000000000184', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0185] Soko Private Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000185') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000185', 'Soko Private Co. Ltd', 'Soko Private Co.', 'experiences', 'private_events',
      'Manager Soko Private Co.', '+254700000184', 'm0185@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000185', 'c1000000-0000-4000-8000-000000000185', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0186] Savanna Photography Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000186') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000186', 'Savanna Photography Works Ltd', 'Savanna Photography Works', 'experiences', 'photography',
      'Manager Savanna Photography Works', '+254700000185', 'm0186@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000186', 'c1000000-0000-4000-8000-000000000186', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0187] Jua Photography Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000187') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000187', 'Jua Photography Atelier Ltd', 'Jua Photography Atelier', 'experiences', 'photography',
      'Manager Jua Photography Atelier', '+254700000186', 'm0187@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000187', 'c1000000-0000-4000-8000-000000000187', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0188] Kipepeo Photography Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000188') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000188', 'Kipepeo Photography Services Ltd', 'Kipepeo Photography Services', 'experiences', 'photography',
      'Manager Kipepeo Photography Services', '+254700000187', 'm0188@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000188', 'c1000000-0000-4000-8000-000000000188', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0189] Atlas Photography House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000189') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000189', 'Atlas Photography House Ltd', 'Atlas Photography House', 'experiences', 'photography',
      'Manager Atlas Photography House', '+254700000188', 'm0189@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000189', 'c1000000-0000-4000-8000-000000000189', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0190] Gold Photography Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000190') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000190', 'Gold Photography Co. Ltd', 'Gold Photography Co.', 'experiences', 'photography',
      'Manager Gold Photography Co.', '+254700000189', 'm0190@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000190', 'c1000000-0000-4000-8000-000000000190', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0191] Mtaa Workshops Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000191') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000191', 'Mtaa Workshops Works Ltd', 'Mtaa Workshops Works', 'experiences', 'workshops',
      'Manager Mtaa Workshops Works', '+254700000190', 'm0191@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000191', 'c1000000-0000-4000-8000-000000000191', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0192] Amani Workshops Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000192') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000192', 'Amani Workshops Atelier Ltd', 'Amani Workshops Atelier', 'experiences', 'workshops',
      'Manager Amani Workshops Atelier', '+254700000191', 'm0192@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000192', 'c1000000-0000-4000-8000-000000000192', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0193] Rift Workshops Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000193') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000193', 'Rift Workshops Services Ltd', 'Rift Workshops Services', 'experiences', 'workshops',
      'Manager Rift Workshops Services', '+254700000192', 'm0193@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000193', 'c1000000-0000-4000-8000-000000000193', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0194] Karibu Workshops House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000194') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000194', 'Karibu Workshops House Ltd', 'Karibu Workshops House', 'experiences', 'workshops',
      'Manager Karibu Workshops House', '+254700000193', 'm0194@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000194', 'c1000000-0000-4000-8000-000000000194', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0195] Luxe Workshops Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000195') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000195', 'Luxe Workshops Co. Ltd', 'Luxe Workshops Co.', 'experiences', 'workshops',
      'Manager Luxe Workshops Co.', '+254700000194', 'm0195@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000195', 'c1000000-0000-4000-8000-000000000195', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0196] Nairobi Classes Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000196') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000196', 'Nairobi Classes Works Ltd', 'Nairobi Classes Works', 'experiences', 'classes',
      'Manager Nairobi Classes Works', '+254700000195', 'm0196@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000196', 'c1000000-0000-4000-8000-000000000196', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0197] Kijiji Classes Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000197') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000197', 'Kijiji Classes Atelier Ltd', 'Kijiji Classes Atelier', 'experiences', 'classes',
      'Manager Kijiji Classes Atelier', '+254700000196', 'm0197@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000197', 'c1000000-0000-4000-8000-000000000197', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0198] Mara Classes Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000198') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000198', 'Mara Classes Services Ltd', 'Mara Classes Services', 'experiences', 'classes',
      'Manager Mara Classes Services', '+254700000197', 'm0198@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000198', 'c1000000-0000-4000-8000-000000000198', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0199] Urban Classes House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000199') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000199', 'Urban Classes House Ltd', 'Urban Classes House', 'experiences', 'classes',
      'Manager Urban Classes House', '+254700000198', 'm0199@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000199', 'c1000000-0000-4000-8000-000000000199', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0200] Soko Classes Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000200') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000200', 'Soko Classes Co. Ltd', 'Soko Classes Co.', 'experiences', 'classes',
      'Manager Soko Classes Co.', '+254700000199', 'm0200@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000200', 'c1000000-0000-4000-8000-000000000200', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0201] Savanna Sports Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000201') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000201', 'Savanna Sports Works Ltd', 'Savanna Sports Works', 'experiences', 'sports_activities',
      'Manager Savanna Sports Works', '+254700000200', 'm0201@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000201', 'c1000000-0000-4000-8000-000000000201', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0202] Jua Sports Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000202') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000202', 'Jua Sports Atelier Ltd', 'Jua Sports Atelier', 'experiences', 'sports_activities',
      'Manager Jua Sports Atelier', '+254700000201', 'm0202@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000202', 'c1000000-0000-4000-8000-000000000202', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0203] Kipepeo Sports Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000203') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000203', 'Kipepeo Sports Services Ltd', 'Kipepeo Sports Services', 'experiences', 'sports_activities',
      'Manager Kipepeo Sports Services', '+254700000202', 'm0203@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000203', 'c1000000-0000-4000-8000-000000000203', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0204] Atlas Sports House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000204') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000204', 'Atlas Sports House Ltd', 'Atlas Sports House', 'experiences', 'sports_activities',
      'Manager Atlas Sports House', '+254700000203', 'm0204@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000204', 'c1000000-0000-4000-8000-000000000204', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0205] Gold Sports Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000205') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000205', 'Gold Sports Co. Ltd', 'Gold Sports Co.', 'experiences', 'sports_activities',
      'Manager Gold Sports Co.', '+254700000204', 'm0205@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000205', 'c1000000-0000-4000-8000-000000000205', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0206] Mtaa Recreation Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000206') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000206', 'Mtaa Recreation Works Ltd', 'Mtaa Recreation Works', 'experiences', 'recreation',
      'Manager Mtaa Recreation Works', '+254700000205', 'm0206@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000206', 'c1000000-0000-4000-8000-000000000206', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0207] Amani Recreation Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000207') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000207', 'Amani Recreation Atelier Ltd', 'Amani Recreation Atelier', 'experiences', 'recreation',
      'Manager Amani Recreation Atelier', '+254700000206', 'm0207@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000207', 'c1000000-0000-4000-8000-000000000207', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0208] Rift Recreation Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000208') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000208', 'Rift Recreation Services Ltd', 'Rift Recreation Services', 'experiences', 'recreation',
      'Manager Rift Recreation Services', '+254700000207', 'm0208@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000208', 'c1000000-0000-4000-8000-000000000208', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0209] Karibu Recreation House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000209') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000209', 'Karibu Recreation House Ltd', 'Karibu Recreation House', 'experiences', 'recreation',
      'Manager Karibu Recreation House', '+254700000208', 'm0209@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000209', 'c1000000-0000-4000-8000-000000000209', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0210] Luxe Recreation Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000210') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000210', 'Luxe Recreation Co. Ltd', 'Luxe Recreation Co.', 'experiences', 'recreation',
      'Manager Luxe Recreation Co.', '+254700000209', 'm0210@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000210', 'c1000000-0000-4000-8000-000000000210', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0211] Nairobi Banking Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000211') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000211', 'Nairobi Banking Works Ltd', 'Nairobi Banking Works', 'financial_services', 'banking',
      'Manager Nairobi Banking Works', '+254700000210', 'm0211@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000211', 'c1000000-0000-4000-8000-000000000211', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0212] Kijiji Banking Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000212') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000212', 'Kijiji Banking Atelier Ltd', 'Kijiji Banking Atelier', 'financial_services', 'banking',
      'Manager Kijiji Banking Atelier', '+254700000211', 'm0212@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000212', 'c1000000-0000-4000-8000-000000000212', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0213] Mara Banking Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000213') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000213', 'Mara Banking Services Ltd', 'Mara Banking Services', 'financial_services', 'banking',
      'Manager Mara Banking Services', '+254700000212', 'm0213@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000213', 'c1000000-0000-4000-8000-000000000213', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0214] Urban Banking House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000214') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000214', 'Urban Banking House Ltd', 'Urban Banking House', 'financial_services', 'banking',
      'Manager Urban Banking House', '+254700000213', 'm0214@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000214', 'c1000000-0000-4000-8000-000000000214', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0215] Soko Banking Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000215') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000215', 'Soko Banking Co. Ltd', 'Soko Banking Co.', 'financial_services', 'banking',
      'Manager Soko Banking Co.', '+254700000214', 'm0215@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000215', 'c1000000-0000-4000-8000-000000000215', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0216] Savanna Forex Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000216') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000216', 'Savanna Forex Works Ltd', 'Savanna Forex Works', 'financial_services', 'forex',
      'Manager Savanna Forex Works', '+254700000215', 'm0216@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000216', 'c1000000-0000-4000-8000-000000000216', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0217] Jua Forex Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000217') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000217', 'Jua Forex Atelier Ltd', 'Jua Forex Atelier', 'financial_services', 'forex',
      'Manager Jua Forex Atelier', '+254700000216', 'm0217@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000217', 'c1000000-0000-4000-8000-000000000217', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0218] Kipepeo Forex Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000218') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000218', 'Kipepeo Forex Services Ltd', 'Kipepeo Forex Services', 'financial_services', 'forex',
      'Manager Kipepeo Forex Services', '+254700000217', 'm0218@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000218', 'c1000000-0000-4000-8000-000000000218', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0219] Atlas Forex House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000219') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000219', 'Atlas Forex House Ltd', 'Atlas Forex House', 'financial_services', 'forex',
      'Manager Atlas Forex House', '+254700000218', 'm0219@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000219', 'c1000000-0000-4000-8000-000000000219', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0220] Gold Forex Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000220') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000220', 'Gold Forex Co. Ltd', 'Gold Forex Co.', 'financial_services', 'forex',
      'Manager Gold Forex Co.', '+254700000219', 'm0220@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000220', 'c1000000-0000-4000-8000-000000000220', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0221] Mtaa Insurance Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000221') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000221', 'Mtaa Insurance Works Ltd', 'Mtaa Insurance Works', 'financial_services', 'insurance',
      'Manager Mtaa Insurance Works', '+254700000220', 'm0221@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000221', 'c1000000-0000-4000-8000-000000000221', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0222] Amani Insurance Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000222') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000222', 'Amani Insurance Atelier Ltd', 'Amani Insurance Atelier', 'financial_services', 'insurance',
      'Manager Amani Insurance Atelier', '+254700000221', 'm0222@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000222', 'c1000000-0000-4000-8000-000000000222', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0223] Rift Insurance Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000223') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000223', 'Rift Insurance Services Ltd', 'Rift Insurance Services', 'financial_services', 'insurance',
      'Manager Rift Insurance Services', '+254700000222', 'm0223@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000223', 'c1000000-0000-4000-8000-000000000223', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0224] Karibu Insurance House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000224') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000224', 'Karibu Insurance House Ltd', 'Karibu Insurance House', 'financial_services', 'insurance',
      'Manager Karibu Insurance House', '+254700000223', 'm0224@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000224', 'c1000000-0000-4000-8000-000000000224', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0225] Luxe Insurance Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000225') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000225', 'Luxe Insurance Co. Ltd', 'Luxe Insurance Co.', 'financial_services', 'insurance',
      'Manager Luxe Insurance Co.', '+254700000224', 'm0225@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000225', 'c1000000-0000-4000-8000-000000000225', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0226] Nairobi Payments Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000226') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000226', 'Nairobi Payments Works Ltd', 'Nairobi Payments Works', 'financial_services', 'payments',
      'Manager Nairobi Payments Works', '+254700000225', 'm0226@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000226', 'c1000000-0000-4000-8000-000000000226', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0227] Kijiji Payments Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000227') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000227', 'Kijiji Payments Atelier Ltd', 'Kijiji Payments Atelier', 'financial_services', 'payments',
      'Manager Kijiji Payments Atelier', '+254700000226', 'm0227@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000227', 'c1000000-0000-4000-8000-000000000227', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0228] Mara Payments Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000228') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000228', 'Mara Payments Services Ltd', 'Mara Payments Services', 'financial_services', 'payments',
      'Manager Mara Payments Services', '+254700000227', 'm0228@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000228', 'c1000000-0000-4000-8000-000000000228', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0229] Urban Payments House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000229') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000229', 'Urban Payments House Ltd', 'Urban Payments House', 'financial_services', 'payments',
      'Manager Urban Payments House', '+254700000228', 'm0229@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000229', 'c1000000-0000-4000-8000-000000000229', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0230] Soko Payments Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000230') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000230', 'Soko Payments Co. Ltd', 'Soko Payments Co.', 'financial_services', 'payments',
      'Manager Soko Payments Co.', '+254700000229', 'm0230@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000230', 'c1000000-0000-4000-8000-000000000230', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0231] Savanna Remittance Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000231') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000231', 'Savanna Remittance Works Ltd', 'Savanna Remittance Works', 'financial_services', 'remittance',
      'Manager Savanna Remittance Works', '+254700000230', 'm0231@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000231', 'c1000000-0000-4000-8000-000000000231', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0232] Jua Remittance Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000232') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000232', 'Jua Remittance Atelier Ltd', 'Jua Remittance Atelier', 'financial_services', 'remittance',
      'Manager Jua Remittance Atelier', '+254700000231', 'm0232@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000232', 'c1000000-0000-4000-8000-000000000232', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0233] Kipepeo Remittance Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000233') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000233', 'Kipepeo Remittance Services Ltd', 'Kipepeo Remittance Services', 'financial_services', 'remittance',
      'Manager Kipepeo Remittance Services', '+254700000232', 'm0233@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000233', 'c1000000-0000-4000-8000-000000000233', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0234] Atlas Remittance House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000234') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000234', 'Atlas Remittance House Ltd', 'Atlas Remittance House', 'financial_services', 'remittance',
      'Manager Atlas Remittance House', '+254700000233', 'm0234@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000234', 'c1000000-0000-4000-8000-000000000234', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0235] Gold Remittance Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000235') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000235', 'Gold Remittance Co. Ltd', 'Gold Remittance Co.', 'financial_services', 'remittance',
      'Manager Gold Remittance Co.', '+254700000234', 'm0235@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000235', 'c1000000-0000-4000-8000-000000000235', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0236] Mtaa Sacco Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000236') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000236', 'Mtaa Sacco Works Ltd', 'Mtaa Sacco Works', 'financial_services', 'sacco_services',
      'Manager Mtaa Sacco Works', '+254700000235', 'm0236@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000236', 'c1000000-0000-4000-8000-000000000236', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0237] Amani Sacco Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000237') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000237', 'Amani Sacco Atelier Ltd', 'Amani Sacco Atelier', 'financial_services', 'sacco_services',
      'Manager Amani Sacco Atelier', '+254700000236', 'm0237@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000237', 'c1000000-0000-4000-8000-000000000237', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0238] Rift Sacco Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000238') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000238', 'Rift Sacco Services Ltd', 'Rift Sacco Services', 'financial_services', 'sacco_services',
      'Manager Rift Sacco Services', '+254700000237', 'm0238@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000238', 'c1000000-0000-4000-8000-000000000238', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0239] Karibu Sacco House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000239') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000239', 'Karibu Sacco House Ltd', 'Karibu Sacco House', 'financial_services', 'sacco_services',
      'Manager Karibu Sacco House', '+254700000238', 'm0239@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000239', 'c1000000-0000-4000-8000-000000000239', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0240] Luxe Sacco Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000240') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000240', 'Luxe Sacco Co. Ltd', 'Luxe Sacco Co.', 'financial_services', 'sacco_services',
      'Manager Luxe Sacco Co.', '+254700000239', 'm0240@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000240', 'c1000000-0000-4000-8000-000000000240', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0241] Nairobi Business Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000241') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000241', 'Nairobi Business Works Ltd', 'Nairobi Business Works', 'financial_services', 'business_services',
      'Manager Nairobi Business Works', '+254700000240', 'm0241@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000241', 'c1000000-0000-4000-8000-000000000241', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0242] Kijiji Business Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000242') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000242', 'Kijiji Business Atelier Ltd', 'Kijiji Business Atelier', 'financial_services', 'business_services',
      'Manager Kijiji Business Atelier', '+254700000241', 'm0242@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000242', 'c1000000-0000-4000-8000-000000000242', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0243] Mara Business Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000243') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000243', 'Mara Business Services Ltd', 'Mara Business Services', 'financial_services', 'business_services',
      'Manager Mara Business Services', '+254700000242', 'm0243@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000243', 'c1000000-0000-4000-8000-000000000243', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0244] Urban Business House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000244') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000244', 'Urban Business House Ltd', 'Urban Business House', 'financial_services', 'business_services',
      'Manager Urban Business House', '+254700000243', 'm0244@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000244', 'c1000000-0000-4000-8000-000000000244', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0245] Soko Business Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000245') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000245', 'Soko Business Co. Ltd', 'Soko Business Co.', 'financial_services', 'business_services',
      'Manager Soko Business Co.', '+254700000244', 'm0245@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000245', 'c1000000-0000-4000-8000-000000000245', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0246] Savanna Flowers Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000246') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000246', 'Savanna Flowers Works Ltd', 'Savanna Flowers Works', 'flowers_gifts', 'flowers',
      'Manager Savanna Flowers Works', '+254700000245', 'm0246@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000246', 'c1000000-0000-4000-8000-000000000246', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0247] Jua Flowers Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000247') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000247', 'Jua Flowers Atelier Ltd', 'Jua Flowers Atelier', 'flowers_gifts', 'flowers',
      'Manager Jua Flowers Atelier', '+254700000246', 'm0247@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000247', 'c1000000-0000-4000-8000-000000000247', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0248] Kipepeo Flowers Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000248') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000248', 'Kipepeo Flowers Services Ltd', 'Kipepeo Flowers Services', 'flowers_gifts', 'flowers',
      'Manager Kipepeo Flowers Services', '+254700000247', 'm0248@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000248', 'c1000000-0000-4000-8000-000000000248', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0249] Atlas Flowers House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000249') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000249', 'Atlas Flowers House Ltd', 'Atlas Flowers House', 'flowers_gifts', 'flowers',
      'Manager Atlas Flowers House', '+254700000248', 'm0249@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000249', 'c1000000-0000-4000-8000-000000000249', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0250] Gold Flowers Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000250') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000250', 'Gold Flowers Co. Ltd', 'Gold Flowers Co.', 'flowers_gifts', 'flowers',
      'Manager Gold Flowers Co.', '+254700000249', 'm0250@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000250', 'c1000000-0000-4000-8000-000000000250', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0251] Mtaa Gift Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000251') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000251', 'Mtaa Gift Works Ltd', 'Mtaa Gift Works', 'flowers_gifts', 'gift_hampers',
      'Manager Mtaa Gift Works', '+254700000250', 'm0251@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000251', 'c1000000-0000-4000-8000-000000000251', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0252] Amani Gift Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000252') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000252', 'Amani Gift Atelier Ltd', 'Amani Gift Atelier', 'flowers_gifts', 'gift_hampers',
      'Manager Amani Gift Atelier', '+254700000251', 'm0252@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000252', 'c1000000-0000-4000-8000-000000000252', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0253] Rift Gift Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000253') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000253', 'Rift Gift Services Ltd', 'Rift Gift Services', 'flowers_gifts', 'gift_hampers',
      'Manager Rift Gift Services', '+254700000252', 'm0253@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000253', 'c1000000-0000-4000-8000-000000000253', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0254] Karibu Gift House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000254') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000254', 'Karibu Gift House Ltd', 'Karibu Gift House', 'flowers_gifts', 'gift_hampers',
      'Manager Karibu Gift House', '+254700000253', 'm0254@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000254', 'c1000000-0000-4000-8000-000000000254', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0255] Luxe Gift Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000255') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000255', 'Luxe Gift Co. Ltd', 'Luxe Gift Co.', 'flowers_gifts', 'gift_hampers',
      'Manager Luxe Gift Co.', '+254700000254', 'm0255@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000255', 'c1000000-0000-4000-8000-000000000255', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0256] Nairobi Cakes Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000256') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000256', 'Nairobi Cakes Works Ltd', 'Nairobi Cakes Works', 'flowers_gifts', 'cakes',
      'Manager Nairobi Cakes Works', '+254700000255', 'm0256@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000256', 'c1000000-0000-4000-8000-000000000256', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0257] Kijiji Cakes Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000257') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000257', 'Kijiji Cakes Atelier Ltd', 'Kijiji Cakes Atelier', 'flowers_gifts', 'cakes',
      'Manager Kijiji Cakes Atelier', '+254700000256', 'm0257@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000257', 'c1000000-0000-4000-8000-000000000257', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0258] Mara Cakes Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000258') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000258', 'Mara Cakes Services Ltd', 'Mara Cakes Services', 'flowers_gifts', 'cakes',
      'Manager Mara Cakes Services', '+254700000257', 'm0258@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000258', 'c1000000-0000-4000-8000-000000000258', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0259] Urban Cakes House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000259') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000259', 'Urban Cakes House Ltd', 'Urban Cakes House', 'flowers_gifts', 'cakes',
      'Manager Urban Cakes House', '+254700000258', 'm0259@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000259', 'c1000000-0000-4000-8000-000000000259', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0260] Soko Cakes Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000260') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000260', 'Soko Cakes Co. Ltd', 'Soko Cakes Co.', 'flowers_gifts', 'cakes',
      'Manager Soko Cakes Co.', '+254700000259', 'm0260@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000260', 'c1000000-0000-4000-8000-000000000260', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0261] Savanna Chocolates Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000261') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000261', 'Savanna Chocolates Works Ltd', 'Savanna Chocolates Works', 'flowers_gifts', 'chocolates',
      'Manager Savanna Chocolates Works', '+254700000260', 'm0261@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000261', 'c1000000-0000-4000-8000-000000000261', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0262] Jua Chocolates Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000262') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000262', 'Jua Chocolates Atelier Ltd', 'Jua Chocolates Atelier', 'flowers_gifts', 'chocolates',
      'Manager Jua Chocolates Atelier', '+254700000261', 'm0262@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000262', 'c1000000-0000-4000-8000-000000000262', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0263] Kipepeo Chocolates Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000263') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000263', 'Kipepeo Chocolates Services Ltd', 'Kipepeo Chocolates Services', 'flowers_gifts', 'chocolates',
      'Manager Kipepeo Chocolates Services', '+254700000262', 'm0263@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000263', 'c1000000-0000-4000-8000-000000000263', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0264] Atlas Chocolates House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000264') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000264', 'Atlas Chocolates House Ltd', 'Atlas Chocolates House', 'flowers_gifts', 'chocolates',
      'Manager Atlas Chocolates House', '+254700000263', 'm0264@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000264', 'c1000000-0000-4000-8000-000000000264', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0265] Gold Chocolates Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000265') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000265', 'Gold Chocolates Co. Ltd', 'Gold Chocolates Co.', 'flowers_gifts', 'chocolates',
      'Manager Gold Chocolates Co.', '+254700000264', 'm0265@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000265', 'c1000000-0000-4000-8000-000000000265', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0266] Mtaa Personalized Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000266') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000266', 'Mtaa Personalized Works Ltd', 'Mtaa Personalized Works', 'flowers_gifts', 'personalized_gifts',
      'Manager Mtaa Personalized Works', '+254700000265', 'm0266@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000266', 'c1000000-0000-4000-8000-000000000266', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0267] Amani Personalized Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000267') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000267', 'Amani Personalized Atelier Ltd', 'Amani Personalized Atelier', 'flowers_gifts', 'personalized_gifts',
      'Manager Amani Personalized Atelier', '+254700000266', 'm0267@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000267', 'c1000000-0000-4000-8000-000000000267', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0268] Rift Personalized Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000268') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000268', 'Rift Personalized Services Ltd', 'Rift Personalized Services', 'flowers_gifts', 'personalized_gifts',
      'Manager Rift Personalized Services', '+254700000267', 'm0268@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000268', 'c1000000-0000-4000-8000-000000000268', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0269] Karibu Personalized House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000269') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000269', 'Karibu Personalized House Ltd', 'Karibu Personalized House', 'flowers_gifts', 'personalized_gifts',
      'Manager Karibu Personalized House', '+254700000268', 'm0269@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000269', 'c1000000-0000-4000-8000-000000000269', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0270] Luxe Personalized Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000270') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000270', 'Luxe Personalized Co. Ltd', 'Luxe Personalized Co.', 'flowers_gifts', 'personalized_gifts',
      'Manager Luxe Personalized Co.', '+254700000269', 'm0270@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000270', 'c1000000-0000-4000-8000-000000000270', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0271] Nairobi Occasion Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000271') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000271', 'Nairobi Occasion Works Ltd', 'Nairobi Occasion Works', 'flowers_gifts', 'occasion_gifts',
      'Manager Nairobi Occasion Works', '+254700000270', 'm0271@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000271', 'c1000000-0000-4000-8000-000000000271', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0272] Kijiji Occasion Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000272') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000272', 'Kijiji Occasion Atelier Ltd', 'Kijiji Occasion Atelier', 'flowers_gifts', 'occasion_gifts',
      'Manager Kijiji Occasion Atelier', '+254700000271', 'm0272@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000272', 'c1000000-0000-4000-8000-000000000272', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0273] Mara Occasion Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000273') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000273', 'Mara Occasion Services Ltd', 'Mara Occasion Services', 'flowers_gifts', 'occasion_gifts',
      'Manager Mara Occasion Services', '+254700000272', 'm0273@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000273', 'c1000000-0000-4000-8000-000000000273', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0274] Urban Occasion House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000274') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000274', 'Urban Occasion House Ltd', 'Urban Occasion House', 'flowers_gifts', 'occasion_gifts',
      'Manager Urban Occasion House', '+254700000273', 'm0274@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000274', 'c1000000-0000-4000-8000-000000000274', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0275] Soko Occasion Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000275') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000275', 'Soko Occasion Co. Ltd', 'Soko Occasion Co.', 'flowers_gifts', 'occasion_gifts',
      'Manager Soko Occasion Co.', '+254700000274', 'm0275@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000275', 'c1000000-0000-4000-8000-000000000275', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0276] Savanna Restaurant Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000276') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000276', 'Savanna Restaurant Works Ltd', 'Savanna Restaurant Works', 'restaurants_food', 'restaurant',
      'Manager Savanna Restaurant Works', '+254700000275', 'm0276@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000276', 'c1000000-0000-4000-8000-000000000276', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0277] Jua Restaurant Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000277') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000277', 'Jua Restaurant Atelier Ltd', 'Jua Restaurant Atelier', 'restaurants_food', 'restaurant',
      'Manager Jua Restaurant Atelier', '+254700000276', 'm0277@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000277', 'c1000000-0000-4000-8000-000000000277', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0278] Kipepeo Restaurant Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000278') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000278', 'Kipepeo Restaurant Services Ltd', 'Kipepeo Restaurant Services', 'restaurants_food', 'restaurant',
      'Manager Kipepeo Restaurant Services', '+254700000277', 'm0278@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000278', 'c1000000-0000-4000-8000-000000000278', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0279] Atlas Restaurant House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000279') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000279', 'Atlas Restaurant House Ltd', 'Atlas Restaurant House', 'restaurants_food', 'restaurant',
      'Manager Atlas Restaurant House', '+254700000278', 'm0279@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000279', 'c1000000-0000-4000-8000-000000000279', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0280] Gold Restaurant Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000280') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000280', 'Gold Restaurant Co. Ltd', 'Gold Restaurant Co.', 'restaurants_food', 'restaurant',
      'Manager Gold Restaurant Co.', '+254700000279', 'm0280@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000280', 'c1000000-0000-4000-8000-000000000280', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0281] Mtaa Fast Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000281') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000281', 'Mtaa Fast Works Ltd', 'Mtaa Fast Works', 'restaurants_food', 'fast_food',
      'Manager Mtaa Fast Works', '+254700000280', 'm0281@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000281', 'c1000000-0000-4000-8000-000000000281', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0282] Amani Fast Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000282') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000282', 'Amani Fast Atelier Ltd', 'Amani Fast Atelier', 'restaurants_food', 'fast_food',
      'Manager Amani Fast Atelier', '+254700000281', 'm0282@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000282', 'c1000000-0000-4000-8000-000000000282', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0283] Rift Fast Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000283') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000283', 'Rift Fast Services Ltd', 'Rift Fast Services', 'restaurants_food', 'fast_food',
      'Manager Rift Fast Services', '+254700000282', 'm0283@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000283', 'c1000000-0000-4000-8000-000000000283', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0284] Karibu Fast House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000284') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000284', 'Karibu Fast House Ltd', 'Karibu Fast House', 'restaurants_food', 'fast_food',
      'Manager Karibu Fast House', '+254700000283', 'm0284@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000284', 'c1000000-0000-4000-8000-000000000284', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0285] Luxe Fast Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000285') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000285', 'Luxe Fast Co. Ltd', 'Luxe Fast Co.', 'restaurants_food', 'fast_food',
      'Manager Luxe Fast Co.', '+254700000284', 'm0285@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000285', 'c1000000-0000-4000-8000-000000000285', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0286] Nairobi Caf Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000286') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000286', 'Nairobi Caf Works Ltd', 'Nairobi Caf Works', 'restaurants_food', 'caf',
      'Manager Nairobi Caf Works', '+254700000285', 'm0286@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000286', 'c1000000-0000-4000-8000-000000000286', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0287] Kijiji Caf Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000287') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000287', 'Kijiji Caf Atelier Ltd', 'Kijiji Caf Atelier', 'restaurants_food', 'caf',
      'Manager Kijiji Caf Atelier', '+254700000286', 'm0287@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000287', 'c1000000-0000-4000-8000-000000000287', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0288] Mara Caf Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000288') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000288', 'Mara Caf Services Ltd', 'Mara Caf Services', 'restaurants_food', 'caf',
      'Manager Mara Caf Services', '+254700000287', 'm0288@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000288', 'c1000000-0000-4000-8000-000000000288', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0289] Urban Caf House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000289') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000289', 'Urban Caf House Ltd', 'Urban Caf House', 'restaurants_food', 'caf',
      'Manager Urban Caf House', '+254700000288', 'm0289@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000289', 'c1000000-0000-4000-8000-000000000289', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0290] Soko Caf Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000290') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000290', 'Soko Caf Co. Ltd', 'Soko Caf Co.', 'restaurants_food', 'caf',
      'Manager Soko Caf Co.', '+254700000289', 'm0290@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000290', 'c1000000-0000-4000-8000-000000000290', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0291] Savanna Bakery Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000291') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000291', 'Savanna Bakery Works Ltd', 'Savanna Bakery Works', 'restaurants_food', 'bakery',
      'Manager Savanna Bakery Works', '+254700000290', 'm0291@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000291', 'c1000000-0000-4000-8000-000000000291', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0292] Jua Bakery Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000292') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000292', 'Jua Bakery Atelier Ltd', 'Jua Bakery Atelier', 'restaurants_food', 'bakery',
      'Manager Jua Bakery Atelier', '+254700000291', 'm0292@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000292', 'c1000000-0000-4000-8000-000000000292', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0293] Kipepeo Bakery Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000293') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000293', 'Kipepeo Bakery Services Ltd', 'Kipepeo Bakery Services', 'restaurants_food', 'bakery',
      'Manager Kipepeo Bakery Services', '+254700000292', 'm0293@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000293', 'c1000000-0000-4000-8000-000000000293', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0294] Atlas Bakery House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000294') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000294', 'Atlas Bakery House Ltd', 'Atlas Bakery House', 'restaurants_food', 'bakery',
      'Manager Atlas Bakery House', '+254700000293', 'm0294@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000294', 'c1000000-0000-4000-8000-000000000294', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0295] Gold Bakery Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000295') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000295', 'Gold Bakery Co. Ltd', 'Gold Bakery Co.', 'restaurants_food', 'bakery',
      'Manager Gold Bakery Co.', '+254700000294', 'm0295@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000295', 'c1000000-0000-4000-8000-000000000295', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0296] Mtaa Desserts Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000296') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000296', 'Mtaa Desserts Works Ltd', 'Mtaa Desserts Works', 'restaurants_food', 'desserts',
      'Manager Mtaa Desserts Works', '+254700000295', 'm0296@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000296', 'c1000000-0000-4000-8000-000000000296', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0297] Amani Desserts Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000297') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000297', 'Amani Desserts Atelier Ltd', 'Amani Desserts Atelier', 'restaurants_food', 'desserts',
      'Manager Amani Desserts Atelier', '+254700000296', 'm0297@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000297', 'c1000000-0000-4000-8000-000000000297', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0298] Rift Desserts Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000298') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000298', 'Rift Desserts Services Ltd', 'Rift Desserts Services', 'restaurants_food', 'desserts',
      'Manager Rift Desserts Services', '+254700000297', 'm0298@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000298', 'c1000000-0000-4000-8000-000000000298', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0299] Karibu Desserts House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000299') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000299', 'Karibu Desserts House Ltd', 'Karibu Desserts House', 'restaurants_food', 'desserts',
      'Manager Karibu Desserts House', '+254700000298', 'm0299@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000299', 'c1000000-0000-4000-8000-000000000299', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0300] Luxe Desserts Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000300') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000300', 'Luxe Desserts Co. Ltd', 'Luxe Desserts Co.', 'restaurants_food', 'desserts',
      'Manager Luxe Desserts Co.', '+254700000299', 'm0300@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000300', 'c1000000-0000-4000-8000-000000000300', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0301] Nairobi Juice Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000301') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000301', 'Nairobi Juice Works Ltd', 'Nairobi Juice Works', 'restaurants_food', 'juice_bar',
      'Manager Nairobi Juice Works', '+254700000300', 'm0301@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000301', 'c1000000-0000-4000-8000-000000000301', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0302] Kijiji Juice Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000302') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000302', 'Kijiji Juice Atelier Ltd', 'Kijiji Juice Atelier', 'restaurants_food', 'juice_bar',
      'Manager Kijiji Juice Atelier', '+254700000301', 'm0302@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000302', 'c1000000-0000-4000-8000-000000000302', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0303] Mara Juice Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000303') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000303', 'Mara Juice Services Ltd', 'Mara Juice Services', 'restaurants_food', 'juice_bar',
      'Manager Mara Juice Services', '+254700000302', 'm0303@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000303', 'c1000000-0000-4000-8000-000000000303', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0304] Urban Juice House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000304') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000304', 'Urban Juice House Ltd', 'Urban Juice House', 'restaurants_food', 'juice_bar',
      'Manager Urban Juice House', '+254700000303', 'm0304@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000304', 'c1000000-0000-4000-8000-000000000304', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0305] Soko Juice Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000305') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000305', 'Soko Juice Co. Ltd', 'Soko Juice Co.', 'restaurants_food', 'juice_bar',
      'Manager Soko Juice Co.', '+254700000304', 'm0305@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000305', 'c1000000-0000-4000-8000-000000000305', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0306] Savanna Cloud Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000306') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000306', 'Savanna Cloud Works Ltd', 'Savanna Cloud Works', 'restaurants_food', 'cloud_kitchen',
      'Manager Savanna Cloud Works', '+254700000305', 'm0306@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000306', 'c1000000-0000-4000-8000-000000000306', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0307] Jua Cloud Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000307') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000307', 'Jua Cloud Atelier Ltd', 'Jua Cloud Atelier', 'restaurants_food', 'cloud_kitchen',
      'Manager Jua Cloud Atelier', '+254700000306', 'm0307@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000307', 'c1000000-0000-4000-8000-000000000307', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0308] Kipepeo Cloud Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000308') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000308', 'Kipepeo Cloud Services Ltd', 'Kipepeo Cloud Services', 'restaurants_food', 'cloud_kitchen',
      'Manager Kipepeo Cloud Services', '+254700000307', 'm0308@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000308', 'c1000000-0000-4000-8000-000000000308', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0309] Atlas Cloud House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000309') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000309', 'Atlas Cloud House Ltd', 'Atlas Cloud House', 'restaurants_food', 'cloud_kitchen',
      'Manager Atlas Cloud House', '+254700000308', 'm0309@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000309', 'c1000000-0000-4000-8000-000000000309', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0310] Gold Cloud Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000310') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000310', 'Gold Cloud Co. Ltd', 'Gold Cloud Co.', 'restaurants_food', 'cloud_kitchen',
      'Manager Gold Cloud Co.', '+254700000309', 'm0310@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000310', 'c1000000-0000-4000-8000-000000000310', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0311] Mtaa Catering Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000311') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000311', 'Mtaa Catering Works Ltd', 'Mtaa Catering Works', 'restaurants_food', 'catering',
      'Manager Mtaa Catering Works', '+254700000310', 'm0311@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000311', 'c1000000-0000-4000-8000-000000000311', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0312] Amani Catering Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000312') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000312', 'Amani Catering Atelier Ltd', 'Amani Catering Atelier', 'restaurants_food', 'catering',
      'Manager Amani Catering Atelier', '+254700000311', 'm0312@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000312', 'c1000000-0000-4000-8000-000000000312', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0313] Rift Catering Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000313') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000313', 'Rift Catering Services Ltd', 'Rift Catering Services', 'restaurants_food', 'catering',
      'Manager Rift Catering Services', '+254700000312', 'm0313@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000313', 'c1000000-0000-4000-8000-000000000313', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0314] Karibu Catering House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000314') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000314', 'Karibu Catering House Ltd', 'Karibu Catering House', 'restaurants_food', 'catering',
      'Manager Karibu Catering House', '+254700000313', 'm0314@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000314', 'c1000000-0000-4000-8000-000000000314', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0315] Luxe Catering Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000315') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000315', 'Luxe Catering Co. Ltd', 'Luxe Catering Co.', 'restaurants_food', 'catering',
      'Manager Luxe Catering Co.', '+254700000314', 'm0315@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000315', 'c1000000-0000-4000-8000-000000000315', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0316] Nairobi Supermarket Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000316') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000316', 'Nairobi Supermarket Works Ltd', 'Nairobi Supermarket Works', 'groceries_essentials', 'supermarket',
      'Manager Nairobi Supermarket Works', '+254700000315', 'm0316@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000316', 'c1000000-0000-4000-8000-000000000316', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0317] Kijiji Supermarket Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000317') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000317', 'Kijiji Supermarket Atelier Ltd', 'Kijiji Supermarket Atelier', 'groceries_essentials', 'supermarket',
      'Manager Kijiji Supermarket Atelier', '+254700000316', 'm0317@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000317', 'c1000000-0000-4000-8000-000000000317', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0318] Mara Supermarket Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000318') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000318', 'Mara Supermarket Services Ltd', 'Mara Supermarket Services', 'groceries_essentials', 'supermarket',
      'Manager Mara Supermarket Services', '+254700000317', 'm0318@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000318', 'c1000000-0000-4000-8000-000000000318', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0319] Urban Supermarket House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000319') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000319', 'Urban Supermarket House Ltd', 'Urban Supermarket House', 'groceries_essentials', 'supermarket',
      'Manager Urban Supermarket House', '+254700000318', 'm0319@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000319', 'c1000000-0000-4000-8000-000000000319', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0320] Soko Supermarket Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000320') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000320', 'Soko Supermarket Co. Ltd', 'Soko Supermarket Co.', 'groceries_essentials', 'supermarket',
      'Manager Soko Supermarket Co.', '+254700000319', 'm0320@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000320', 'c1000000-0000-4000-8000-000000000320', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0321] Savanna Convenience Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000321') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000321', 'Savanna Convenience Works Ltd', 'Savanna Convenience Works', 'groceries_essentials', 'convenience_store',
      'Manager Savanna Convenience Works', '+254700000320', 'm0321@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000321', 'c1000000-0000-4000-8000-000000000321', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0322] Jua Convenience Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000322') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000322', 'Jua Convenience Atelier Ltd', 'Jua Convenience Atelier', 'groceries_essentials', 'convenience_store',
      'Manager Jua Convenience Atelier', '+254700000321', 'm0322@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000322', 'c1000000-0000-4000-8000-000000000322', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0323] Kipepeo Convenience Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000323') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000323', 'Kipepeo Convenience Services Ltd', 'Kipepeo Convenience Services', 'groceries_essentials', 'convenience_store',
      'Manager Kipepeo Convenience Services', '+254700000322', 'm0323@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000323', 'c1000000-0000-4000-8000-000000000323', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0324] Atlas Convenience House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000324') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000324', 'Atlas Convenience House Ltd', 'Atlas Convenience House', 'groceries_essentials', 'convenience_store',
      'Manager Atlas Convenience House', '+254700000323', 'm0324@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000324', 'c1000000-0000-4000-8000-000000000324', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0325] Gold Convenience Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000325') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000325', 'Gold Convenience Co. Ltd', 'Gold Convenience Co.', 'groceries_essentials', 'convenience_store',
      'Manager Gold Convenience Co.', '+254700000324', 'm0325@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000325', 'c1000000-0000-4000-8000-000000000325', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0326] Mtaa Fresh Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000326') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000326', 'Mtaa Fresh Works Ltd', 'Mtaa Fresh Works', 'groceries_essentials', 'fresh_produce',
      'Manager Mtaa Fresh Works', '+254700000325', 'm0326@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000326', 'c1000000-0000-4000-8000-000000000326', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0327] Amani Fresh Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000327') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000327', 'Amani Fresh Atelier Ltd', 'Amani Fresh Atelier', 'groceries_essentials', 'fresh_produce',
      'Manager Amani Fresh Atelier', '+254700000326', 'm0327@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000327', 'c1000000-0000-4000-8000-000000000327', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0328] Rift Fresh Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000328') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000328', 'Rift Fresh Services Ltd', 'Rift Fresh Services', 'groceries_essentials', 'fresh_produce',
      'Manager Rift Fresh Services', '+254700000327', 'm0328@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000328', 'c1000000-0000-4000-8000-000000000328', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0329] Karibu Fresh House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000329') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000329', 'Karibu Fresh House Ltd', 'Karibu Fresh House', 'groceries_essentials', 'fresh_produce',
      'Manager Karibu Fresh House', '+254700000328', 'm0329@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000329', 'c1000000-0000-4000-8000-000000000329', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0330] Luxe Fresh Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000330') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000330', 'Luxe Fresh Co. Ltd', 'Luxe Fresh Co.', 'groceries_essentials', 'fresh_produce',
      'Manager Luxe Fresh Co.', '+254700000329', 'm0330@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000330', 'c1000000-0000-4000-8000-000000000330', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0331] Nairobi Butchery Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000331') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000331', 'Nairobi Butchery Works Ltd', 'Nairobi Butchery Works', 'groceries_essentials', 'butchery',
      'Manager Nairobi Butchery Works', '+254700000330', 'm0331@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000331', 'c1000000-0000-4000-8000-000000000331', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0332] Kijiji Butchery Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000332') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000332', 'Kijiji Butchery Atelier Ltd', 'Kijiji Butchery Atelier', 'groceries_essentials', 'butchery',
      'Manager Kijiji Butchery Atelier', '+254700000331', 'm0332@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000332', 'c1000000-0000-4000-8000-000000000332', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0333] Mara Butchery Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000333') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000333', 'Mara Butchery Services Ltd', 'Mara Butchery Services', 'groceries_essentials', 'butchery',
      'Manager Mara Butchery Services', '+254700000332', 'm0333@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000333', 'c1000000-0000-4000-8000-000000000333', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0334] Urban Butchery House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000334') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000334', 'Urban Butchery House Ltd', 'Urban Butchery House', 'groceries_essentials', 'butchery',
      'Manager Urban Butchery House', '+254700000333', 'm0334@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000334', 'c1000000-0000-4000-8000-000000000334', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0335] Soko Butchery Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000335') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000335', 'Soko Butchery Co. Ltd', 'Soko Butchery Co.', 'groceries_essentials', 'butchery',
      'Manager Soko Butchery Co.', '+254700000334', 'm0335@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000335', 'c1000000-0000-4000-8000-000000000335', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0336] Savanna Seafood Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000336') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000336', 'Savanna Seafood Works Ltd', 'Savanna Seafood Works', 'groceries_essentials', 'seafood',
      'Manager Savanna Seafood Works', '+254700000335', 'm0336@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000336', 'c1000000-0000-4000-8000-000000000336', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0337] Jua Seafood Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000337') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000337', 'Jua Seafood Atelier Ltd', 'Jua Seafood Atelier', 'groceries_essentials', 'seafood',
      'Manager Jua Seafood Atelier', '+254700000336', 'm0337@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000337', 'c1000000-0000-4000-8000-000000000337', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0338] Kipepeo Seafood Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000338') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000338', 'Kipepeo Seafood Services Ltd', 'Kipepeo Seafood Services', 'groceries_essentials', 'seafood',
      'Manager Kipepeo Seafood Services', '+254700000337', 'm0338@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000338', 'c1000000-0000-4000-8000-000000000338', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0339] Atlas Seafood House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000339') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000339', 'Atlas Seafood House Ltd', 'Atlas Seafood House', 'groceries_essentials', 'seafood',
      'Manager Atlas Seafood House', '+254700000338', 'm0339@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000339', 'c1000000-0000-4000-8000-000000000339', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0340] Gold Seafood Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000340') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000340', 'Gold Seafood Co. Ltd', 'Gold Seafood Co.', 'groceries_essentials', 'seafood',
      'Manager Gold Seafood Co.', '+254700000339', 'm0340@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000340', 'c1000000-0000-4000-8000-000000000340', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0341] Mtaa Organic Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000341') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000341', 'Mtaa Organic Works Ltd', 'Mtaa Organic Works', 'groceries_essentials', 'organic_store',
      'Manager Mtaa Organic Works', '+254700000340', 'm0341@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000341', 'c1000000-0000-4000-8000-000000000341', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0342] Amani Organic Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000342') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000342', 'Amani Organic Atelier Ltd', 'Amani Organic Atelier', 'groceries_essentials', 'organic_store',
      'Manager Amani Organic Atelier', '+254700000341', 'm0342@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000342', 'c1000000-0000-4000-8000-000000000342', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0343] Rift Organic Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000343') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000343', 'Rift Organic Services Ltd', 'Rift Organic Services', 'groceries_essentials', 'organic_store',
      'Manager Rift Organic Services', '+254700000342', 'm0343@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000343', 'c1000000-0000-4000-8000-000000000343', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0344] Karibu Organic House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000344') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000344', 'Karibu Organic House Ltd', 'Karibu Organic House', 'groceries_essentials', 'organic_store',
      'Manager Karibu Organic House', '+254700000343', 'm0344@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000344', 'c1000000-0000-4000-8000-000000000344', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0345] Luxe Organic Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000345') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000345', 'Luxe Organic Co. Ltd', 'Luxe Organic Co.', 'groceries_essentials', 'organic_store',
      'Manager Luxe Organic Co.', '+254700000344', 'm0345@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000345', 'c1000000-0000-4000-8000-000000000345', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0346] Nairobi Laundry Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000346') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000346', 'Nairobi Laundry Works Ltd', 'Nairobi Laundry Works', 'laundry_cleaning', 'laundry',
      'Manager Nairobi Laundry Works', '+254700000345', 'm0346@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000346', 'c1000000-0000-4000-8000-000000000346', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0347] Kijiji Laundry Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000347') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000347', 'Kijiji Laundry Atelier Ltd', 'Kijiji Laundry Atelier', 'laundry_cleaning', 'laundry',
      'Manager Kijiji Laundry Atelier', '+254700000346', 'm0347@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000347', 'c1000000-0000-4000-8000-000000000347', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0348] Mara Laundry Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000348') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000348', 'Mara Laundry Services Ltd', 'Mara Laundry Services', 'laundry_cleaning', 'laundry',
      'Manager Mara Laundry Services', '+254700000347', 'm0348@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000348', 'c1000000-0000-4000-8000-000000000348', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0349] Urban Laundry House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000349') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000349', 'Urban Laundry House Ltd', 'Urban Laundry House', 'laundry_cleaning', 'laundry',
      'Manager Urban Laundry House', '+254700000348', 'm0349@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000349', 'c1000000-0000-4000-8000-000000000349', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0350] Soko Laundry Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000350') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000350', 'Soko Laundry Co. Ltd', 'Soko Laundry Co.', 'laundry_cleaning', 'laundry',
      'Manager Soko Laundry Co.', '+254700000349', 'm0350@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000350', 'c1000000-0000-4000-8000-000000000350', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0351] Savanna Dry Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000351') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000351', 'Savanna Dry Works Ltd', 'Savanna Dry Works', 'laundry_cleaning', 'dry_cleaning',
      'Manager Savanna Dry Works', '+254700000350', 'm0351@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000351', 'c1000000-0000-4000-8000-000000000351', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0352] Jua Dry Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000352') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000352', 'Jua Dry Atelier Ltd', 'Jua Dry Atelier', 'laundry_cleaning', 'dry_cleaning',
      'Manager Jua Dry Atelier', '+254700000351', 'm0352@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000352', 'c1000000-0000-4000-8000-000000000352', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0353] Kipepeo Dry Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000353') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000353', 'Kipepeo Dry Services Ltd', 'Kipepeo Dry Services', 'laundry_cleaning', 'dry_cleaning',
      'Manager Kipepeo Dry Services', '+254700000352', 'm0353@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000353', 'c1000000-0000-4000-8000-000000000353', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0354] Atlas Dry House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000354') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000354', 'Atlas Dry House Ltd', 'Atlas Dry House', 'laundry_cleaning', 'dry_cleaning',
      'Manager Atlas Dry House', '+254700000353', 'm0354@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000354', 'c1000000-0000-4000-8000-000000000354', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0355] Gold Dry Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000355') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000355', 'Gold Dry Co. Ltd', 'Gold Dry Co.', 'laundry_cleaning', 'dry_cleaning',
      'Manager Gold Dry Co.', '+254700000354', 'm0355@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000355', 'c1000000-0000-4000-8000-000000000355', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0356] Mtaa Ironing Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000356') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000356', 'Mtaa Ironing Works Ltd', 'Mtaa Ironing Works', 'laundry_cleaning', 'ironing',
      'Manager Mtaa Ironing Works', '+254700000355', 'm0356@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000356', 'c1000000-0000-4000-8000-000000000356', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0357] Amani Ironing Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000357') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000357', 'Amani Ironing Atelier Ltd', 'Amani Ironing Atelier', 'laundry_cleaning', 'ironing',
      'Manager Amani Ironing Atelier', '+254700000356', 'm0357@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000357', 'c1000000-0000-4000-8000-000000000357', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0358] Rift Ironing Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000358') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000358', 'Rift Ironing Services Ltd', 'Rift Ironing Services', 'laundry_cleaning', 'ironing',
      'Manager Rift Ironing Services', '+254700000357', 'm0358@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000358', 'c1000000-0000-4000-8000-000000000358', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0359] Karibu Ironing House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000359') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000359', 'Karibu Ironing House Ltd', 'Karibu Ironing House', 'laundry_cleaning', 'ironing',
      'Manager Karibu Ironing House', '+254700000358', 'm0359@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000359', 'c1000000-0000-4000-8000-000000000359', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0360] Luxe Ironing Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000360') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000360', 'Luxe Ironing Co. Ltd', 'Luxe Ironing Co.', 'laundry_cleaning', 'ironing',
      'Manager Luxe Ironing Co.', '+254700000359', 'm0360@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000360', 'c1000000-0000-4000-8000-000000000360', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0361] Nairobi Home Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000361') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000361', 'Nairobi Home Works Ltd', 'Nairobi Home Works', 'laundry_cleaning', 'home_cleaning',
      'Manager Nairobi Home Works', '+254700000360', 'm0361@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000361', 'c1000000-0000-4000-8000-000000000361', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0362] Kijiji Home Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000362') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000362', 'Kijiji Home Atelier Ltd', 'Kijiji Home Atelier', 'laundry_cleaning', 'home_cleaning',
      'Manager Kijiji Home Atelier', '+254700000361', 'm0362@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000362', 'c1000000-0000-4000-8000-000000000362', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0363] Mara Home Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000363') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000363', 'Mara Home Services Ltd', 'Mara Home Services', 'laundry_cleaning', 'home_cleaning',
      'Manager Mara Home Services', '+254700000362', 'm0363@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000363', 'c1000000-0000-4000-8000-000000000363', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0364] Urban Home House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000364') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000364', 'Urban Home House Ltd', 'Urban Home House', 'laundry_cleaning', 'home_cleaning',
      'Manager Urban Home House', '+254700000363', 'm0364@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000364', 'c1000000-0000-4000-8000-000000000364', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0365] Soko Home Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000365') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000365', 'Soko Home Co. Ltd', 'Soko Home Co.', 'laundry_cleaning', 'home_cleaning',
      'Manager Soko Home Co.', '+254700000364', 'm0365@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000365', 'c1000000-0000-4000-8000-000000000365', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0366] Savanna Office Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000366') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000366', 'Savanna Office Works Ltd', 'Savanna Office Works', 'laundry_cleaning', 'office_cleaning',
      'Manager Savanna Office Works', '+254700000365', 'm0366@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000366', 'c1000000-0000-4000-8000-000000000366', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0367] Jua Office Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000367') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000367', 'Jua Office Atelier Ltd', 'Jua Office Atelier', 'laundry_cleaning', 'office_cleaning',
      'Manager Jua Office Atelier', '+254700000366', 'm0367@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000367', 'c1000000-0000-4000-8000-000000000367', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0368] Kipepeo Office Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000368') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000368', 'Kipepeo Office Services Ltd', 'Kipepeo Office Services', 'laundry_cleaning', 'office_cleaning',
      'Manager Kipepeo Office Services', '+254700000367', 'm0368@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000368', 'c1000000-0000-4000-8000-000000000368', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0369] Atlas Office House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000369') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000369', 'Atlas Office House Ltd', 'Atlas Office House', 'laundry_cleaning', 'office_cleaning',
      'Manager Atlas Office House', '+254700000368', 'm0369@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000369', 'c1000000-0000-4000-8000-000000000369', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0370] Gold Office Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000370') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000370', 'Gold Office Co. Ltd', 'Gold Office Co.', 'laundry_cleaning', 'office_cleaning',
      'Manager Gold Office Co.', '+254700000369', 'm0370@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000370', 'c1000000-0000-4000-8000-000000000370', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0371] Mtaa Home Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000371') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000371', 'Mtaa Home Works Ltd', 'Mtaa Home Works', 'marketplace', 'home__living',
      'Manager Mtaa Home Works', '+254700000370', 'm0371@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000371', 'c1000000-0000-4000-8000-000000000371', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0372] Amani Home Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000372') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000372', 'Amani Home Atelier Ltd', 'Amani Home Atelier', 'marketplace', 'home__living',
      'Manager Amani Home Atelier', '+254700000371', 'm0372@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000372', 'c1000000-0000-4000-8000-000000000372', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0373] Rift Home Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000373') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000373', 'Rift Home Services Ltd', 'Rift Home Services', 'marketplace', 'home__living',
      'Manager Rift Home Services', '+254700000372', 'm0373@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000373', 'c1000000-0000-4000-8000-000000000373', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0374] Karibu Home House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000374') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000374', 'Karibu Home House Ltd', 'Karibu Home House', 'marketplace', 'home__living',
      'Manager Karibu Home House', '+254700000373', 'm0374@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000374', 'c1000000-0000-4000-8000-000000000374', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0375] Luxe Home Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000375') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000375', 'Luxe Home Co. Ltd', 'Luxe Home Co.', 'marketplace', 'home__living',
      'Manager Luxe Home Co.', '+254700000374', 'm0375@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000375', 'c1000000-0000-4000-8000-000000000375', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0376] Nairobi Furniture Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000376') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000376', 'Nairobi Furniture Works Ltd', 'Nairobi Furniture Works', 'marketplace', 'furniture',
      'Manager Nairobi Furniture Works', '+254700000375', 'm0376@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000376', 'c1000000-0000-4000-8000-000000000376', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0377] Kijiji Furniture Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000377') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000377', 'Kijiji Furniture Atelier Ltd', 'Kijiji Furniture Atelier', 'marketplace', 'furniture',
      'Manager Kijiji Furniture Atelier', '+254700000376', 'm0377@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000377', 'c1000000-0000-4000-8000-000000000377', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0378] Mara Furniture Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000378') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000378', 'Mara Furniture Services Ltd', 'Mara Furniture Services', 'marketplace', 'furniture',
      'Manager Mara Furniture Services', '+254700000377', 'm0378@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000378', 'c1000000-0000-4000-8000-000000000378', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0379] Urban Furniture House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000379') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000379', 'Urban Furniture House Ltd', 'Urban Furniture House', 'marketplace', 'furniture',
      'Manager Urban Furniture House', '+254700000378', 'm0379@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000379', 'c1000000-0000-4000-8000-000000000379', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0380] Soko Furniture Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000380') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000380', 'Soko Furniture Co. Ltd', 'Soko Furniture Co.', 'marketplace', 'furniture',
      'Manager Soko Furniture Co.', '+254700000379', 'm0380@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000380', 'c1000000-0000-4000-8000-000000000380', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0381] Savanna Appliances Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000381') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000381', 'Savanna Appliances Works Ltd', 'Savanna Appliances Works', 'marketplace', 'appliances',
      'Manager Savanna Appliances Works', '+254700000380', 'm0381@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000381', 'c1000000-0000-4000-8000-000000000381', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0382] Jua Appliances Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000382') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000382', 'Jua Appliances Atelier Ltd', 'Jua Appliances Atelier', 'marketplace', 'appliances',
      'Manager Jua Appliances Atelier', '+254700000381', 'm0382@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000382', 'c1000000-0000-4000-8000-000000000382', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0383] Kipepeo Appliances Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000383') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000383', 'Kipepeo Appliances Services Ltd', 'Kipepeo Appliances Services', 'marketplace', 'appliances',
      'Manager Kipepeo Appliances Services', '+254700000382', 'm0383@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000383', 'c1000000-0000-4000-8000-000000000383', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0384] Atlas Appliances House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000384') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000384', 'Atlas Appliances House Ltd', 'Atlas Appliances House', 'marketplace', 'appliances',
      'Manager Atlas Appliances House', '+254700000383', 'm0384@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000384', 'c1000000-0000-4000-8000-000000000384', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0385] Gold Appliances Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000385') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000385', 'Gold Appliances Co. Ltd', 'Gold Appliances Co.', 'marketplace', 'appliances',
      'Manager Gold Appliances Co.', '+254700000384', 'm0385@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000385', 'c1000000-0000-4000-8000-000000000385', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0386] Mtaa Decor Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000386') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000386', 'Mtaa Decor Works Ltd', 'Mtaa Decor Works', 'marketplace', 'decor',
      'Manager Mtaa Decor Works', '+254700000385', 'm0386@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000386', 'c1000000-0000-4000-8000-000000000386', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0387] Amani Decor Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000387') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000387', 'Amani Decor Atelier Ltd', 'Amani Decor Atelier', 'marketplace', 'decor',
      'Manager Amani Decor Atelier', '+254700000386', 'm0387@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000387', 'c1000000-0000-4000-8000-000000000387', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0388] Rift Decor Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000388') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000388', 'Rift Decor Services Ltd', 'Rift Decor Services', 'marketplace', 'decor',
      'Manager Rift Decor Services', '+254700000387', 'm0388@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000388', 'c1000000-0000-4000-8000-000000000388', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0389] Karibu Decor House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000389') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000389', 'Karibu Decor House Ltd', 'Karibu Decor House', 'marketplace', 'decor',
      'Manager Karibu Decor House', '+254700000388', 'm0389@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000389', 'c1000000-0000-4000-8000-000000000389', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0390] Luxe Decor Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000390') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000390', 'Luxe Decor Co. Ltd', 'Luxe Decor Co.', 'marketplace', 'decor',
      'Manager Luxe Decor Co.', '+254700000389', 'm0390@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000390', 'c1000000-0000-4000-8000-000000000390', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0391] Nairobi Kitchenware Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000391') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000391', 'Nairobi Kitchenware Works Ltd', 'Nairobi Kitchenware Works', 'marketplace', 'kitchenware',
      'Manager Nairobi Kitchenware Works', '+254700000390', 'm0391@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000391', 'c1000000-0000-4000-8000-000000000391', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0392] Kijiji Kitchenware Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000392') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000392', 'Kijiji Kitchenware Atelier Ltd', 'Kijiji Kitchenware Atelier', 'marketplace', 'kitchenware',
      'Manager Kijiji Kitchenware Atelier', '+254700000391', 'm0392@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000392', 'c1000000-0000-4000-8000-000000000392', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0393] Mara Kitchenware Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000393') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000393', 'Mara Kitchenware Services Ltd', 'Mara Kitchenware Services', 'marketplace', 'kitchenware',
      'Manager Mara Kitchenware Services', '+254700000392', 'm0393@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000393', 'c1000000-0000-4000-8000-000000000393', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0394] Urban Kitchenware House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000394') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000394', 'Urban Kitchenware House Ltd', 'Urban Kitchenware House', 'marketplace', 'kitchenware',
      'Manager Urban Kitchenware House', '+254700000393', 'm0394@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000394', 'c1000000-0000-4000-8000-000000000394', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0395] Soko Kitchenware Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000395') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000395', 'Soko Kitchenware Co. Ltd', 'Soko Kitchenware Co.', 'marketplace', 'kitchenware',
      'Manager Soko Kitchenware Co.', '+254700000394', 'm0395@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000395', 'c1000000-0000-4000-8000-000000000395', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0396] Savanna Books Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000396') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000396', 'Savanna Books Works Ltd', 'Savanna Books Works', 'marketplace', 'books',
      'Manager Savanna Books Works', '+254700000395', 'm0396@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000396', 'c1000000-0000-4000-8000-000000000396', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0397] Jua Books Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000397') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000397', 'Jua Books Atelier Ltd', 'Jua Books Atelier', 'marketplace', 'books',
      'Manager Jua Books Atelier', '+254700000396', 'm0397@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000397', 'c1000000-0000-4000-8000-000000000397', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0398] Kipepeo Books Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000398') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000398', 'Kipepeo Books Services Ltd', 'Kipepeo Books Services', 'marketplace', 'books',
      'Manager Kipepeo Books Services', '+254700000397', 'm0398@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000398', 'c1000000-0000-4000-8000-000000000398', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0399] Atlas Books House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000399') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000399', 'Atlas Books House Ltd', 'Atlas Books House', 'marketplace', 'books',
      'Manager Atlas Books House', '+254700000398', 'm0399@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000399', 'c1000000-0000-4000-8000-000000000399', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0400] Gold Books Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000400') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000400', 'Gold Books Co. Ltd', 'Gold Books Co.', 'marketplace', 'books',
      'Manager Gold Books Co.', '+254700000399', 'm0400@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000400', 'c1000000-0000-4000-8000-000000000400', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0401] Mtaa Stationery Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000401') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000401', 'Mtaa Stationery Works Ltd', 'Mtaa Stationery Works', 'marketplace', 'stationery',
      'Manager Mtaa Stationery Works', '+254700000400', 'm0401@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000401', 'c1000000-0000-4000-8000-000000000401', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0402] Amani Stationery Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000402') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000402', 'Amani Stationery Atelier Ltd', 'Amani Stationery Atelier', 'marketplace', 'stationery',
      'Manager Amani Stationery Atelier', '+254700000401', 'm0402@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000402', 'c1000000-0000-4000-8000-000000000402', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0403] Rift Stationery Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000403') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000403', 'Rift Stationery Services Ltd', 'Rift Stationery Services', 'marketplace', 'stationery',
      'Manager Rift Stationery Services', '+254700000402', 'm0403@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000403', 'c1000000-0000-4000-8000-000000000403', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0404] Karibu Stationery House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000404') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000404', 'Karibu Stationery House Ltd', 'Karibu Stationery House', 'marketplace', 'stationery',
      'Manager Karibu Stationery House', '+254700000403', 'm0404@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000404', 'c1000000-0000-4000-8000-000000000404', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0405] Luxe Stationery Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000405') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000405', 'Luxe Stationery Co. Ltd', 'Luxe Stationery Co.', 'marketplace', 'stationery',
      'Manager Luxe Stationery Co.', '+254700000404', 'm0405@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000405', 'c1000000-0000-4000-8000-000000000405', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0406] Nairobi Office Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000406') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000406', 'Nairobi Office Works Ltd', 'Nairobi Office Works', 'marketplace', 'office_supplies',
      'Manager Nairobi Office Works', '+254700000405', 'm0406@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000406', 'c1000000-0000-4000-8000-000000000406', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0407] Kijiji Office Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000407') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000407', 'Kijiji Office Atelier Ltd', 'Kijiji Office Atelier', 'marketplace', 'office_supplies',
      'Manager Kijiji Office Atelier', '+254700000406', 'm0407@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000407', 'c1000000-0000-4000-8000-000000000407', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0408] Mara Office Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000408') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000408', 'Mara Office Services Ltd', 'Mara Office Services', 'marketplace', 'office_supplies',
      'Manager Mara Office Services', '+254700000407', 'm0408@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000408', 'c1000000-0000-4000-8000-000000000408', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0409] Urban Office House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000409') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000409', 'Urban Office House Ltd', 'Urban Office House', 'marketplace', 'office_supplies',
      'Manager Urban Office House', '+254700000408', 'm0409@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000409', 'c1000000-0000-4000-8000-000000000409', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0410] Soko Office Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000410') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000410', 'Soko Office Co. Ltd', 'Soko Office Co.', 'marketplace', 'office_supplies',
      'Manager Soko Office Co.', '+254700000409', 'm0410@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000410', 'c1000000-0000-4000-8000-000000000410', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0411] Savanna General Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000411') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000411', 'Savanna General Works Ltd', 'Savanna General Works', 'marketplace', 'general_retail',
      'Manager Savanna General Works', '+254700000410', 'm0411@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000411', 'c1000000-0000-4000-8000-000000000411', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0412] Jua General Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000412') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000412', 'Jua General Atelier Ltd', 'Jua General Atelier', 'marketplace', 'general_retail',
      'Manager Jua General Atelier', '+254700000411', 'm0412@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000412', 'c1000000-0000-4000-8000-000000000412', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0413] Kipepeo General Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000413') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000413', 'Kipepeo General Services Ltd', 'Kipepeo General Services', 'marketplace', 'general_retail',
      'Manager Kipepeo General Services', '+254700000412', 'm0413@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000413', 'c1000000-0000-4000-8000-000000000413', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0414] Atlas General House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000414') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000414', 'Atlas General House Ltd', 'Atlas General House', 'marketplace', 'general_retail',
      'Manager Atlas General House', '+254700000413', 'm0414@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000414', 'c1000000-0000-4000-8000-000000000414', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0415] Gold General Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000415') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000415', 'Gold General Co. Ltd', 'Gold General Co.', 'marketplace', 'general_retail',
      'Manager Gold General Co.', '+254700000414', 'm0415@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000415', 'c1000000-0000-4000-8000-000000000415', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0416] Mtaa Pharmacy Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000416') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000416', 'Mtaa Pharmacy Works Ltd', 'Mtaa Pharmacy Works', 'pharmacy', 'pharmacy',
      'Manager Mtaa Pharmacy Works', '+254700000415', 'm0416@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000416', 'c1000000-0000-4000-8000-000000000416', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0417] Amani Pharmacy Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000417') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000417', 'Amani Pharmacy Atelier Ltd', 'Amani Pharmacy Atelier', 'pharmacy', 'pharmacy',
      'Manager Amani Pharmacy Atelier', '+254700000416', 'm0417@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000417', 'c1000000-0000-4000-8000-000000000417', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0418] Rift Pharmacy Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000418') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000418', 'Rift Pharmacy Services Ltd', 'Rift Pharmacy Services', 'pharmacy', 'pharmacy',
      'Manager Rift Pharmacy Services', '+254700000417', 'm0418@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000418', 'c1000000-0000-4000-8000-000000000418', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0419] Karibu Pharmacy House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000419') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000419', 'Karibu Pharmacy House Ltd', 'Karibu Pharmacy House', 'pharmacy', 'pharmacy',
      'Manager Karibu Pharmacy House', '+254700000418', 'm0419@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000419', 'c1000000-0000-4000-8000-000000000419', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0420] Luxe Pharmacy Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000420') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000420', 'Luxe Pharmacy Co. Ltd', 'Luxe Pharmacy Co.', 'pharmacy', 'pharmacy',
      'Manager Luxe Pharmacy Co.', '+254700000419', 'm0420@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000420', 'c1000000-0000-4000-8000-000000000420', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0421] Nairobi Medical Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000421') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000421', 'Nairobi Medical Works Ltd', 'Nairobi Medical Works', 'pharmacy', 'medical_supplies',
      'Manager Nairobi Medical Works', '+254700000420', 'm0421@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000421', 'c1000000-0000-4000-8000-000000000421', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0422] Kijiji Medical Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000422') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000422', 'Kijiji Medical Atelier Ltd', 'Kijiji Medical Atelier', 'pharmacy', 'medical_supplies',
      'Manager Kijiji Medical Atelier', '+254700000421', 'm0422@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000422', 'c1000000-0000-4000-8000-000000000422', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0423] Mara Medical Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000423') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000423', 'Mara Medical Services Ltd', 'Mara Medical Services', 'pharmacy', 'medical_supplies',
      'Manager Mara Medical Services', '+254700000422', 'm0423@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000423', 'c1000000-0000-4000-8000-000000000423', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0424] Urban Medical House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000424') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000424', 'Urban Medical House Ltd', 'Urban Medical House', 'pharmacy', 'medical_supplies',
      'Manager Urban Medical House', '+254700000423', 'm0424@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000424', 'c1000000-0000-4000-8000-000000000424', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0425] Soko Medical Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000425') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000425', 'Soko Medical Co. Ltd', 'Soko Medical Co.', 'pharmacy', 'medical_supplies',
      'Manager Soko Medical Co.', '+254700000424', 'm0425@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000425', 'c1000000-0000-4000-8000-000000000425', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0426] Savanna Baby Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000426') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000426', 'Savanna Baby Works Ltd', 'Savanna Baby Works', 'pharmacy', 'baby_products',
      'Manager Savanna Baby Works', '+254700000425', 'm0426@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000426', 'c1000000-0000-4000-8000-000000000426', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0427] Jua Baby Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000427') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000427', 'Jua Baby Atelier Ltd', 'Jua Baby Atelier', 'pharmacy', 'baby_products',
      'Manager Jua Baby Atelier', '+254700000426', 'm0427@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000427', 'c1000000-0000-4000-8000-000000000427', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0428] Kipepeo Baby Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000428') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000428', 'Kipepeo Baby Services Ltd', 'Kipepeo Baby Services', 'pharmacy', 'baby_products',
      'Manager Kipepeo Baby Services', '+254700000427', 'm0428@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000428', 'c1000000-0000-4000-8000-000000000428', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0429] Atlas Baby House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000429') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000429', 'Atlas Baby House Ltd', 'Atlas Baby House', 'pharmacy', 'baby_products',
      'Manager Atlas Baby House', '+254700000428', 'm0429@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000429', 'c1000000-0000-4000-8000-000000000429', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0430] Gold Baby Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000430') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000430', 'Gold Baby Co. Ltd', 'Gold Baby Co.', 'pharmacy', 'baby_products',
      'Manager Gold Baby Co.', '+254700000429', 'm0430@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000430', 'c1000000-0000-4000-8000-000000000430', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0431] Mtaa Supplements Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000431') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000431', 'Mtaa Supplements Works Ltd', 'Mtaa Supplements Works', 'pharmacy', 'supplements',
      'Manager Mtaa Supplements Works', '+254700000430', 'm0431@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000431', 'c1000000-0000-4000-8000-000000000431', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0432] Amani Supplements Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000432') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000432', 'Amani Supplements Atelier Ltd', 'Amani Supplements Atelier', 'pharmacy', 'supplements',
      'Manager Amani Supplements Atelier', '+254700000431', 'm0432@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000432', 'c1000000-0000-4000-8000-000000000432', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0433] Rift Supplements Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000433') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000433', 'Rift Supplements Services Ltd', 'Rift Supplements Services', 'pharmacy', 'supplements',
      'Manager Rift Supplements Services', '+254700000432', 'm0433@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000433', 'c1000000-0000-4000-8000-000000000433', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0434] Karibu Supplements House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000434') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000434', 'Karibu Supplements House Ltd', 'Karibu Supplements House', 'pharmacy', 'supplements',
      'Manager Karibu Supplements House', '+254700000433', 'm0434@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000434', 'c1000000-0000-4000-8000-000000000434', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0435] Luxe Supplements Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000435') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000435', 'Luxe Supplements Co. Ltd', 'Luxe Supplements Co.', 'pharmacy', 'supplements',
      'Manager Luxe Supplements Co.', '+254700000434', 'm0435@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000435', 'c1000000-0000-4000-8000-000000000435', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0436] Nairobi Clinics Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000436') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000436', 'Nairobi Clinics Works Ltd', 'Nairobi Clinics Works', 'health', 'clinics',
      'Manager Nairobi Clinics Works', '+254700000435', 'm0436@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000436', 'c1000000-0000-4000-8000-000000000436', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0437] Kijiji Clinics Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000437') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000437', 'Kijiji Clinics Atelier Ltd', 'Kijiji Clinics Atelier', 'health', 'clinics',
      'Manager Kijiji Clinics Atelier', '+254700000436', 'm0437@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000437', 'c1000000-0000-4000-8000-000000000437', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0438] Mara Clinics Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000438') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000438', 'Mara Clinics Services Ltd', 'Mara Clinics Services', 'health', 'clinics',
      'Manager Mara Clinics Services', '+254700000437', 'm0438@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000438', 'c1000000-0000-4000-8000-000000000438', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0439] Urban Clinics House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000439') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000439', 'Urban Clinics House Ltd', 'Urban Clinics House', 'health', 'clinics',
      'Manager Urban Clinics House', '+254700000438', 'm0439@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000439', 'c1000000-0000-4000-8000-000000000439', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0440] Soko Clinics Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000440') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000440', 'Soko Clinics Co. Ltd', 'Soko Clinics Co.', 'health', 'clinics',
      'Manager Soko Clinics Co.', '+254700000439', 'm0440@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000440', 'c1000000-0000-4000-8000-000000000440', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0441] Savanna Telemedicine Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000441') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000441', 'Savanna Telemedicine Works Ltd', 'Savanna Telemedicine Works', 'health', 'telemedicine',
      'Manager Savanna Telemedicine Works', '+254700000440', 'm0441@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000441', 'c1000000-0000-4000-8000-000000000441', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0442] Jua Telemedicine Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000442') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000442', 'Jua Telemedicine Atelier Ltd', 'Jua Telemedicine Atelier', 'health', 'telemedicine',
      'Manager Jua Telemedicine Atelier', '+254700000441', 'm0442@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000442', 'c1000000-0000-4000-8000-000000000442', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0443] Kipepeo Telemedicine Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000443') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000443', 'Kipepeo Telemedicine Services Ltd', 'Kipepeo Telemedicine Services', 'health', 'telemedicine',
      'Manager Kipepeo Telemedicine Services', '+254700000442', 'm0443@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000443', 'c1000000-0000-4000-8000-000000000443', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0444] Atlas Telemedicine House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000444') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000444', 'Atlas Telemedicine House Ltd', 'Atlas Telemedicine House', 'health', 'telemedicine',
      'Manager Atlas Telemedicine House', '+254700000443', 'm0444@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000444', 'c1000000-0000-4000-8000-000000000444', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0445] Gold Telemedicine Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000445') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000445', 'Gold Telemedicine Co. Ltd', 'Gold Telemedicine Co.', 'health', 'telemedicine',
      'Manager Gold Telemedicine Co.', '+254700000444', 'm0445@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000445', 'c1000000-0000-4000-8000-000000000445', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0446] Mtaa Labs Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000446') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000446', 'Mtaa Labs Works Ltd', 'Mtaa Labs Works', 'health', 'labs',
      'Manager Mtaa Labs Works', '+254700000445', 'm0446@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000446', 'c1000000-0000-4000-8000-000000000446', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0447] Amani Labs Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000447') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000447', 'Amani Labs Atelier Ltd', 'Amani Labs Atelier', 'health', 'labs',
      'Manager Amani Labs Atelier', '+254700000446', 'm0447@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000447', 'c1000000-0000-4000-8000-000000000447', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0448] Rift Labs Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000448') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000448', 'Rift Labs Services Ltd', 'Rift Labs Services', 'health', 'labs',
      'Manager Rift Labs Services', '+254700000447', 'm0448@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000448', 'c1000000-0000-4000-8000-000000000448', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0449] Karibu Labs House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000449') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000449', 'Karibu Labs House Ltd', 'Karibu Labs House', 'health', 'labs',
      'Manager Karibu Labs House', '+254700000448', 'm0449@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000449', 'c1000000-0000-4000-8000-000000000449', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0450] Luxe Labs Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000450') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000450', 'Luxe Labs Co. Ltd', 'Luxe Labs Co.', 'health', 'labs',
      'Manager Luxe Labs Co.', '+254700000449', 'm0450@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000450', 'c1000000-0000-4000-8000-000000000450', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0451] Nairobi Mental Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000451') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000451', 'Nairobi Mental Works Ltd', 'Nairobi Mental Works', 'health', 'mental_health_therapy',
      'Manager Nairobi Mental Works', '+254700000450', 'm0451@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000451', 'c1000000-0000-4000-8000-000000000451', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0452] Kijiji Mental Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000452') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000452', 'Kijiji Mental Atelier Ltd', 'Kijiji Mental Atelier', 'health', 'mental_health_therapy',
      'Manager Kijiji Mental Atelier', '+254700000451', 'm0452@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000452', 'c1000000-0000-4000-8000-000000000452', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0453] Mara Mental Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000453') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000453', 'Mara Mental Services Ltd', 'Mara Mental Services', 'health', 'mental_health_therapy',
      'Manager Mara Mental Services', '+254700000452', 'm0453@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000453', 'c1000000-0000-4000-8000-000000000453', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0454] Urban Mental House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000454') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000454', 'Urban Mental House Ltd', 'Urban Mental House', 'health', 'mental_health_therapy',
      'Manager Urban Mental House', '+254700000453', 'm0454@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000454', 'c1000000-0000-4000-8000-000000000454', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0455] Soko Mental Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000455') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000455', 'Soko Mental Co. Ltd', 'Soko Mental Co.', 'health', 'mental_health_therapy',
      'Manager Soko Mental Co.', '+254700000454', 'm0455@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000455', 'c1000000-0000-4000-8000-000000000455', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0456] Savanna Coaching Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000456') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000456', 'Savanna Coaching Works Ltd', 'Savanna Coaching Works', 'health', 'coaching',
      'Manager Savanna Coaching Works', '+254700000455', 'm0456@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000456', 'c1000000-0000-4000-8000-000000000456', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0457] Jua Coaching Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000457') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000457', 'Jua Coaching Atelier Ltd', 'Jua Coaching Atelier', 'health', 'coaching',
      'Manager Jua Coaching Atelier', '+254700000456', 'm0457@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000457', 'c1000000-0000-4000-8000-000000000457', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0458] Kipepeo Coaching Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000458') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000458', 'Kipepeo Coaching Services Ltd', 'Kipepeo Coaching Services', 'health', 'coaching',
      'Manager Kipepeo Coaching Services', '+254700000457', 'm0458@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000458', 'c1000000-0000-4000-8000-000000000458', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0459] Atlas Coaching House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000459') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000459', 'Atlas Coaching House Ltd', 'Atlas Coaching House', 'health', 'coaching',
      'Manager Atlas Coaching House', '+254700000458', 'm0459@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000459', 'c1000000-0000-4000-8000-000000000459', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0460] Gold Coaching Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000460') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000460', 'Gold Coaching Co. Ltd', 'Gold Coaching Co.', 'health', 'coaching',
      'Manager Gold Coaching Co.', '+254700000459', 'm0460@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000460', 'c1000000-0000-4000-8000-000000000460', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0461] Mtaa Smartphones Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000461') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000461', 'Mtaa Smartphones Works Ltd', 'Mtaa Smartphones Works', 'tech_electronics', 'smartphones',
      'Manager Mtaa Smartphones Works', '+254700000460', 'm0461@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000461', 'c1000000-0000-4000-8000-000000000461', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0462] Amani Smartphones Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000462') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000462', 'Amani Smartphones Atelier Ltd', 'Amani Smartphones Atelier', 'tech_electronics', 'smartphones',
      'Manager Amani Smartphones Atelier', '+254700000461', 'm0462@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000462', 'c1000000-0000-4000-8000-000000000462', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0463] Rift Smartphones Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000463') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000463', 'Rift Smartphones Services Ltd', 'Rift Smartphones Services', 'tech_electronics', 'smartphones',
      'Manager Rift Smartphones Services', '+254700000462', 'm0463@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000463', 'c1000000-0000-4000-8000-000000000463', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0464] Karibu Smartphones House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000464') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000464', 'Karibu Smartphones House Ltd', 'Karibu Smartphones House', 'tech_electronics', 'smartphones',
      'Manager Karibu Smartphones House', '+254700000463', 'm0464@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000464', 'c1000000-0000-4000-8000-000000000464', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0465] Luxe Smartphones Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000465') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000465', 'Luxe Smartphones Co. Ltd', 'Luxe Smartphones Co.', 'tech_electronics', 'smartphones',
      'Manager Luxe Smartphones Co.', '+254700000464', 'm0465@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000465', 'c1000000-0000-4000-8000-000000000465', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0466] Nairobi Accessories Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000466') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000466', 'Nairobi Accessories Works Ltd', 'Nairobi Accessories Works', 'tech_electronics', 'accessories',
      'Manager Nairobi Accessories Works', '+254700000465', 'm0466@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000466', 'c1000000-0000-4000-8000-000000000466', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0467] Kijiji Accessories Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000467') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000467', 'Kijiji Accessories Atelier Ltd', 'Kijiji Accessories Atelier', 'tech_electronics', 'accessories',
      'Manager Kijiji Accessories Atelier', '+254700000466', 'm0467@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000467', 'c1000000-0000-4000-8000-000000000467', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0468] Mara Accessories Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000468') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000468', 'Mara Accessories Services Ltd', 'Mara Accessories Services', 'tech_electronics', 'accessories',
      'Manager Mara Accessories Services', '+254700000467', 'm0468@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000468', 'c1000000-0000-4000-8000-000000000468', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0469] Urban Accessories House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000469') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000469', 'Urban Accessories House Ltd', 'Urban Accessories House', 'tech_electronics', 'accessories',
      'Manager Urban Accessories House', '+254700000468', 'm0469@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000469', 'c1000000-0000-4000-8000-000000000469', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0470] Soko Accessories Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000470') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000470', 'Soko Accessories Co. Ltd', 'Soko Accessories Co.', 'tech_electronics', 'accessories',
      'Manager Soko Accessories Co.', '+254700000469', 'm0470@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000470', 'c1000000-0000-4000-8000-000000000470', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0471] Savanna Computers Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000471') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000471', 'Savanna Computers Works Ltd', 'Savanna Computers Works', 'tech_electronics', 'computers',
      'Manager Savanna Computers Works', '+254700000470', 'm0471@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000471', 'c1000000-0000-4000-8000-000000000471', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0472] Jua Computers Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000472') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000472', 'Jua Computers Atelier Ltd', 'Jua Computers Atelier', 'tech_electronics', 'computers',
      'Manager Jua Computers Atelier', '+254700000471', 'm0472@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000472', 'c1000000-0000-4000-8000-000000000472', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0473] Kipepeo Computers Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000473') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000473', 'Kipepeo Computers Services Ltd', 'Kipepeo Computers Services', 'tech_electronics', 'computers',
      'Manager Kipepeo Computers Services', '+254700000472', 'm0473@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000473', 'c1000000-0000-4000-8000-000000000473', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0474] Atlas Computers House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000474') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000474', 'Atlas Computers House Ltd', 'Atlas Computers House', 'tech_electronics', 'computers',
      'Manager Atlas Computers House', '+254700000473', 'm0474@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000474', 'c1000000-0000-4000-8000-000000000474', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0475] Gold Computers Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000475') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000475', 'Gold Computers Co. Ltd', 'Gold Computers Co.', 'tech_electronics', 'computers',
      'Manager Gold Computers Co.', '+254700000474', 'm0475@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000475', 'c1000000-0000-4000-8000-000000000475', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0476] Mtaa Gaming Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000476') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000476', 'Mtaa Gaming Works Ltd', 'Mtaa Gaming Works', 'tech_electronics', 'gaming',
      'Manager Mtaa Gaming Works', '+254700000475', 'm0476@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000476', 'c1000000-0000-4000-8000-000000000476', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0477] Amani Gaming Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000477') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000477', 'Amani Gaming Atelier Ltd', 'Amani Gaming Atelier', 'tech_electronics', 'gaming',
      'Manager Amani Gaming Atelier', '+254700000476', 'm0477@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000477', 'c1000000-0000-4000-8000-000000000477', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0478] Rift Gaming Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000478') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000478', 'Rift Gaming Services Ltd', 'Rift Gaming Services', 'tech_electronics', 'gaming',
      'Manager Rift Gaming Services', '+254700000477', 'm0478@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000478', 'c1000000-0000-4000-8000-000000000478', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0479] Karibu Gaming House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000479') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000479', 'Karibu Gaming House Ltd', 'Karibu Gaming House', 'tech_electronics', 'gaming',
      'Manager Karibu Gaming House', '+254700000478', 'm0479@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000479', 'c1000000-0000-4000-8000-000000000479', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0480] Luxe Gaming Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000480') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000480', 'Luxe Gaming Co. Ltd', 'Luxe Gaming Co.', 'tech_electronics', 'gaming',
      'Manager Luxe Gaming Co.', '+254700000479', 'm0480@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000480', 'c1000000-0000-4000-8000-000000000480', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0481] Nairobi Audio Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000481') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000481', 'Nairobi Audio Works Ltd', 'Nairobi Audio Works', 'tech_electronics', 'audio',
      'Manager Nairobi Audio Works', '+254700000480', 'm0481@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000481', 'c1000000-0000-4000-8000-000000000481', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0482] Kijiji Audio Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000482') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000482', 'Kijiji Audio Atelier Ltd', 'Kijiji Audio Atelier', 'tech_electronics', 'audio',
      'Manager Kijiji Audio Atelier', '+254700000481', 'm0482@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000482', 'c1000000-0000-4000-8000-000000000482', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0483] Mara Audio Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000483') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000483', 'Mara Audio Services Ltd', 'Mara Audio Services', 'tech_electronics', 'audio',
      'Manager Mara Audio Services', '+254700000482', 'm0483@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000483', 'c1000000-0000-4000-8000-000000000483', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0484] Urban Audio House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000484') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000484', 'Urban Audio House Ltd', 'Urban Audio House', 'tech_electronics', 'audio',
      'Manager Urban Audio House', '+254700000483', 'm0484@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000484', 'c1000000-0000-4000-8000-000000000484', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0485] Soko Audio Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000485') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000485', 'Soko Audio Co. Ltd', 'Soko Audio Co.', 'tech_electronics', 'audio',
      'Manager Soko Audio Co.', '+254700000484', 'm0485@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000485', 'c1000000-0000-4000-8000-000000000485', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0486] Savanna Telecom Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000486') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000486', 'Savanna Telecom Works Ltd', 'Savanna Telecom Works', 'tech_electronics', 'telecom_services',
      'Manager Savanna Telecom Works', '+254700000485', 'm0486@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000486', 'c1000000-0000-4000-8000-000000000486', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0487] Jua Telecom Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000487') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000487', 'Jua Telecom Atelier Ltd', 'Jua Telecom Atelier', 'tech_electronics', 'telecom_services',
      'Manager Jua Telecom Atelier', '+254700000486', 'm0487@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000487', 'c1000000-0000-4000-8000-000000000487', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0488] Kipepeo Telecom Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000488') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000488', 'Kipepeo Telecom Services Ltd', 'Kipepeo Telecom Services', 'tech_electronics', 'telecom_services',
      'Manager Kipepeo Telecom Services', '+254700000487', 'm0488@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000488', 'c1000000-0000-4000-8000-000000000488', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0489] Atlas Telecom House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000489') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000489', 'Atlas Telecom House Ltd', 'Atlas Telecom House', 'tech_electronics', 'telecom_services',
      'Manager Atlas Telecom House', '+254700000488', 'm0489@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000489', 'c1000000-0000-4000-8000-000000000489', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0490] Gold Telecom Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000490') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000490', 'Gold Telecom Co. Ltd', 'Gold Telecom Co.', 'tech_electronics', 'telecom_services',
      'Manager Gold Telecom Co.', '+254700000489', 'm0490@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000490', 'c1000000-0000-4000-8000-000000000490', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0491] Mtaa Smart Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000491') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000491', 'Mtaa Smart Works Ltd', 'Mtaa Smart Works', 'tech_electronics', 'smart_devices',
      'Manager Mtaa Smart Works', '+254700000490', 'm0491@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000491', 'c1000000-0000-4000-8000-000000000491', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0492] Amani Smart Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000492') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000492', 'Amani Smart Atelier Ltd', 'Amani Smart Atelier', 'tech_electronics', 'smart_devices',
      'Manager Amani Smart Atelier', '+254700000491', 'm0492@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000492', 'c1000000-0000-4000-8000-000000000492', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0493] Rift Smart Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000493') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000493', 'Rift Smart Services Ltd', 'Rift Smart Services', 'tech_electronics', 'smart_devices',
      'Manager Rift Smart Services', '+254700000492', 'm0493@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000493', 'c1000000-0000-4000-8000-000000000493', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0494] Karibu Smart House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000494') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000494', 'Karibu Smart House Ltd', 'Karibu Smart House', 'tech_electronics', 'smart_devices',
      'Manager Karibu Smart House', '+254700000493', 'm0494@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000494', 'c1000000-0000-4000-8000-000000000494', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0495] Luxe Smart Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000495') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000495', 'Luxe Smart Co. Ltd', 'Luxe Smart Co.', 'tech_electronics', 'smart_devices',
      'Manager Luxe Smart Co.', '+254700000494', 'm0495@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000495', 'c1000000-0000-4000-8000-000000000495', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0496] Nairobi Safaris Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000496') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000496', 'Nairobi Safaris Works Ltd', 'Nairobi Safaris Works', 'travel_tours', 'safaris',
      'Manager Nairobi Safaris Works', '+254700000495', 'm0496@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000496', 'c1000000-0000-4000-8000-000000000496', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0497] Kijiji Safaris Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000497') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000497', 'Kijiji Safaris Atelier Ltd', 'Kijiji Safaris Atelier', 'travel_tours', 'safaris',
      'Manager Kijiji Safaris Atelier', '+254700000496', 'm0497@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000497', 'c1000000-0000-4000-8000-000000000497', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0498] Mara Safaris Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000498') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000498', 'Mara Safaris Services Ltd', 'Mara Safaris Services', 'travel_tours', 'safaris',
      'Manager Mara Safaris Services', '+254700000497', 'm0498@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000498', 'c1000000-0000-4000-8000-000000000498', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0499] Urban Safaris House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000499') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000499', 'Urban Safaris House Ltd', 'Urban Safaris House', 'travel_tours', 'safaris',
      'Manager Urban Safaris House', '+254700000498', 'm0499@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000499', 'c1000000-0000-4000-8000-000000000499', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0500] Soko Safaris Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000500') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000500', 'Soko Safaris Co. Ltd', 'Soko Safaris Co.', 'travel_tours', 'safaris',
      'Manager Soko Safaris Co.', '+254700000499', 'm0500@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000500', 'c1000000-0000-4000-8000-000000000500', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0501] Savanna Game Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000501') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000501', 'Savanna Game Works Ltd', 'Savanna Game Works', 'travel_tours', 'game_drives',
      'Manager Savanna Game Works', '+254700000500', 'm0501@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000501', 'c1000000-0000-4000-8000-000000000501', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0502] Jua Game Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000502') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000502', 'Jua Game Atelier Ltd', 'Jua Game Atelier', 'travel_tours', 'game_drives',
      'Manager Jua Game Atelier', '+254700000501', 'm0502@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000502', 'c1000000-0000-4000-8000-000000000502', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0503] Kipepeo Game Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000503') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000503', 'Kipepeo Game Services Ltd', 'Kipepeo Game Services', 'travel_tours', 'game_drives',
      'Manager Kipepeo Game Services', '+254700000502', 'm0503@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000503', 'c1000000-0000-4000-8000-000000000503', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0504] Atlas Game House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000504') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000504', 'Atlas Game House Ltd', 'Atlas Game House', 'travel_tours', 'game_drives',
      'Manager Atlas Game House', '+254700000503', 'm0504@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000504', 'c1000000-0000-4000-8000-000000000504', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0505] Gold Game Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000505') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000505', 'Gold Game Co. Ltd', 'Gold Game Co.', 'travel_tours', 'game_drives',
      'Manager Gold Game Co.', '+254700000504', 'm0505@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000505', 'c1000000-0000-4000-8000-000000000505', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0506] Mtaa Luxury Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000506') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000506', 'Mtaa Luxury Works Ltd', 'Mtaa Luxury Works', 'travel_tours', 'luxury_safaris',
      'Manager Mtaa Luxury Works', '+254700000505', 'm0506@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000506', 'c1000000-0000-4000-8000-000000000506', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0507] Amani Luxury Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000507') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000507', 'Amani Luxury Atelier Ltd', 'Amani Luxury Atelier', 'travel_tours', 'luxury_safaris',
      'Manager Amani Luxury Atelier', '+254700000506', 'm0507@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000507', 'c1000000-0000-4000-8000-000000000507', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0508] Rift Luxury Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000508') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000508', 'Rift Luxury Services Ltd', 'Rift Luxury Services', 'travel_tours', 'luxury_safaris',
      'Manager Rift Luxury Services', '+254700000507', 'm0508@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000508', 'c1000000-0000-4000-8000-000000000508', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0509] Karibu Luxury House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000509') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000509', 'Karibu Luxury House Ltd', 'Karibu Luxury House', 'travel_tours', 'luxury_safaris',
      'Manager Karibu Luxury House', '+254700000508', 'm0509@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000509', 'c1000000-0000-4000-8000-000000000509', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0510] Luxe Luxury Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000510') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000510', 'Luxe Luxury Co. Ltd', 'Luxe Luxury Co.', 'travel_tours', 'luxury_safaris',
      'Manager Luxe Luxury Co.', '+254700000509', 'm0510@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000510', 'c1000000-0000-4000-8000-000000000510', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0511] Nairobi City Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000511') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000511', 'Nairobi City Works Ltd', 'Nairobi City Works', 'travel_tours', 'city_tours',
      'Manager Nairobi City Works', '+254700000510', 'm0511@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000511', 'c1000000-0000-4000-8000-000000000511', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0512] Kijiji City Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000512') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000512', 'Kijiji City Atelier Ltd', 'Kijiji City Atelier', 'travel_tours', 'city_tours',
      'Manager Kijiji City Atelier', '+254700000511', 'm0512@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000512', 'c1000000-0000-4000-8000-000000000512', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0513] Mara City Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000513') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000513', 'Mara City Services Ltd', 'Mara City Services', 'travel_tours', 'city_tours',
      'Manager Mara City Services', '+254700000512', 'm0513@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000513', 'c1000000-0000-4000-8000-000000000513', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0514] Urban City House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000514') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000514', 'Urban City House Ltd', 'Urban City House', 'travel_tours', 'city_tours',
      'Manager Urban City House', '+254700000513', 'm0514@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000514', 'c1000000-0000-4000-8000-000000000514', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0515] Soko City Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000515') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000515', 'Soko City Co. Ltd', 'Soko City Co.', 'travel_tours', 'city_tours',
      'Manager Soko City Co.', '+254700000514', 'm0515@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000515', 'c1000000-0000-4000-8000-000000000515', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0516] Savanna Cultural Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000516') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000516', 'Savanna Cultural Works Ltd', 'Savanna Cultural Works', 'travel_tours', 'cultural_tours',
      'Manager Savanna Cultural Works', '+254700000515', 'm0516@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000516', 'c1000000-0000-4000-8000-000000000516', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0517] Jua Cultural Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000517') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000517', 'Jua Cultural Atelier Ltd', 'Jua Cultural Atelier', 'travel_tours', 'cultural_tours',
      'Manager Jua Cultural Atelier', '+254700000516', 'm0517@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000517', 'c1000000-0000-4000-8000-000000000517', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0518] Kipepeo Cultural Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000518') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000518', 'Kipepeo Cultural Services Ltd', 'Kipepeo Cultural Services', 'travel_tours', 'cultural_tours',
      'Manager Kipepeo Cultural Services', '+254700000517', 'm0518@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000518', 'c1000000-0000-4000-8000-000000000518', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0519] Atlas Cultural House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000519') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000519', 'Atlas Cultural House Ltd', 'Atlas Cultural House', 'travel_tours', 'cultural_tours',
      'Manager Atlas Cultural House', '+254700000518', 'm0519@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000519', 'c1000000-0000-4000-8000-000000000519', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0520] Gold Cultural Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000520') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000520', 'Gold Cultural Co. Ltd', 'Gold Cultural Co.', 'travel_tours', 'cultural_tours',
      'Manager Gold Cultural Co.', '+254700000519', 'm0520@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000520', 'c1000000-0000-4000-8000-000000000520', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0521] Mtaa Adventure Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000521') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000521', 'Mtaa Adventure Works Ltd', 'Mtaa Adventure Works', 'travel_tours', 'adventure_tours',
      'Manager Mtaa Adventure Works', '+254700000520', 'm0521@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000521', 'c1000000-0000-4000-8000-000000000521', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0522] Amani Adventure Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000522') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000522', 'Amani Adventure Atelier Ltd', 'Amani Adventure Atelier', 'travel_tours', 'adventure_tours',
      'Manager Amani Adventure Atelier', '+254700000521', 'm0522@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000522', 'c1000000-0000-4000-8000-000000000522', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0523] Rift Adventure Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000523') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000523', 'Rift Adventure Services Ltd', 'Rift Adventure Services', 'travel_tours', 'adventure_tours',
      'Manager Rift Adventure Services', '+254700000522', 'm0523@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000523', 'c1000000-0000-4000-8000-000000000523', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0524] Karibu Adventure House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000524') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000524', 'Karibu Adventure House Ltd', 'Karibu Adventure House', 'travel_tours', 'adventure_tours',
      'Manager Karibu Adventure House', '+254700000523', 'm0524@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000524', 'c1000000-0000-4000-8000-000000000524', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0525] Luxe Adventure Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000525') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000525', 'Luxe Adventure Co. Ltd', 'Luxe Adventure Co.', 'travel_tours', 'adventure_tours',
      'Manager Luxe Adventure Co.', '+254700000524', 'm0525@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000525', 'c1000000-0000-4000-8000-000000000525', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0526] Nairobi Travel Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000526') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000526', 'Nairobi Travel Works Ltd', 'Nairobi Travel Works', 'travel_tours', 'travel_packages',
      'Manager Nairobi Travel Works', '+254700000525', 'm0526@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000526', 'c1000000-0000-4000-8000-000000000526', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0527] Kijiji Travel Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000527') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000527', 'Kijiji Travel Atelier Ltd', 'Kijiji Travel Atelier', 'travel_tours', 'travel_packages',
      'Manager Kijiji Travel Atelier', '+254700000526', 'm0527@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000527', 'c1000000-0000-4000-8000-000000000527', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0528] Mara Travel Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000528') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000528', 'Mara Travel Services Ltd', 'Mara Travel Services', 'travel_tours', 'travel_packages',
      'Manager Mara Travel Services', '+254700000527', 'm0528@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000528', 'c1000000-0000-4000-8000-000000000528', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0529] Urban Travel House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000529') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000529', 'Urban Travel House Ltd', 'Urban Travel House', 'travel_tours', 'travel_packages',
      'Manager Urban Travel House', '+254700000528', 'm0529@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000529', 'c1000000-0000-4000-8000-000000000529', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0530] Soko Travel Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000530') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000530', 'Soko Travel Co. Ltd', 'Soko Travel Co.', 'travel_tours', 'travel_packages',
      'Manager Soko Travel Co.', '+254700000529', 'm0530@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000530', 'c1000000-0000-4000-8000-000000000530', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0531] Savanna Car Works Upper Hill (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000531') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000531', 'Savanna Car Works Upper Hill Ltd', 'Savanna Car Works Upper Hill', 'vehicle_services', 'car_wash',
      'Manager Savanna Car Works Upper Hill', '+254700000530', 'm0531@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000531', 'c1000000-0000-4000-8000-000000000531', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0532] Jua Car Atelier CBD (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000532') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000532', 'Jua Car Atelier CBD Ltd', 'Jua Car Atelier CBD', 'vehicle_services', 'car_wash',
      'Manager Jua Car Atelier CBD', '+254700000531', 'm0532@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000532', 'c1000000-0000-4000-8000-000000000532', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0533] Kipepeo Car Services South C (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000533') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000533', 'Kipepeo Car Services South C Ltd', 'Kipepeo Car Services South C', 'vehicle_services', 'car_wash',
      'Manager Kipepeo Car Services South C', '+254700000532', 'm0533@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000533', 'c1000000-0000-4000-8000-000000000533', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0534] Atlas Car House South B (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000534') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000534', 'Atlas Car House South B Ltd', 'Atlas Car House South B', 'vehicle_services', 'car_wash',
      'Manager Atlas Car House South B', '+254700000533', 'm0534@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000534', 'c1000000-0000-4000-8000-000000000534', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0535] Gold Car Co. Ngong Road (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000535') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000535', 'Gold Car Co. Ngong Road Ltd', 'Gold Car Co. Ngong Road', 'vehicle_services', 'car_wash',
      'Manager Gold Car Co. Ngong Road', '+254700000534', 'm0535@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000535', 'c1000000-0000-4000-8000-000000000535', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0536] Mtaa Tire Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000536') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000536', 'Mtaa Tire Works Ltd', 'Mtaa Tire Works', 'vehicle_services', 'tire_service',
      'Manager Mtaa Tire Works', '+254700000535', 'm0536@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000536', 'c1000000-0000-4000-8000-000000000536', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0537] Amani Tire Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000537') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000537', 'Amani Tire Atelier Ltd', 'Amani Tire Atelier', 'vehicle_services', 'tire_service',
      'Manager Amani Tire Atelier', '+254700000536', 'm0537@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000537', 'c1000000-0000-4000-8000-000000000537', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0538] Rift Tire Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000538') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000538', 'Rift Tire Services Ltd', 'Rift Tire Services', 'vehicle_services', 'tire_service',
      'Manager Rift Tire Services', '+254700000537', 'm0538@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000538', 'c1000000-0000-4000-8000-000000000538', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0539] Karibu Tire House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000539') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000539', 'Karibu Tire House Ltd', 'Karibu Tire House', 'vehicle_services', 'tire_service',
      'Manager Karibu Tire House', '+254700000538', 'm0539@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000539', 'c1000000-0000-4000-8000-000000000539', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0540] Luxe Tire Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000540') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000540', 'Luxe Tire Co. Ltd', 'Luxe Tire Co.', 'vehicle_services', 'tire_service',
      'Manager Luxe Tire Co.', '+254700000539', 'm0540@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000540', 'c1000000-0000-4000-8000-000000000540', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0541] Nairobi Battery Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000541') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000541', 'Nairobi Battery Works Ltd', 'Nairobi Battery Works', 'vehicle_services', 'battery_service',
      'Manager Nairobi Battery Works', '+254700000540', 'm0541@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000541', 'c1000000-0000-4000-8000-000000000541', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0542] Kijiji Battery Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000542') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000542', 'Kijiji Battery Atelier Ltd', 'Kijiji Battery Atelier', 'vehicle_services', 'battery_service',
      'Manager Kijiji Battery Atelier', '+254700000541', 'm0542@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000542', 'c1000000-0000-4000-8000-000000000542', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0543] Mara Battery Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000543') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000543', 'Mara Battery Services Ltd', 'Mara Battery Services', 'vehicle_services', 'battery_service',
      'Manager Mara Battery Services', '+254700000542', 'm0543@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000543', 'c1000000-0000-4000-8000-000000000543', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0544] Urban Battery House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000544') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000544', 'Urban Battery House Ltd', 'Urban Battery House', 'vehicle_services', 'battery_service',
      'Manager Urban Battery House', '+254700000543', 'm0544@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000544', 'c1000000-0000-4000-8000-000000000544', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0545] Soko Battery Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000545') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000545', 'Soko Battery Co. Ltd', 'Soko Battery Co.', 'vehicle_services', 'battery_service',
      'Manager Soko Battery Co.', '+254700000544', 'm0545@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000545', 'c1000000-0000-4000-8000-000000000545', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0546] Savanna Vehicle Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000546') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000546', 'Savanna Vehicle Works Ltd', 'Savanna Vehicle Works', 'vehicle_services', 'vehicle_assistance',
      'Manager Savanna Vehicle Works', '+254700000545', 'm0546@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000546', 'c1000000-0000-4000-8000-000000000546', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0547] Jua Vehicle Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000547') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000547', 'Jua Vehicle Atelier Ltd', 'Jua Vehicle Atelier', 'vehicle_services', 'vehicle_assistance',
      'Manager Jua Vehicle Atelier', '+254700000546', 'm0547@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000547', 'c1000000-0000-4000-8000-000000000547', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0548] Kipepeo Vehicle Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000548') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000548', 'Kipepeo Vehicle Services Ltd', 'Kipepeo Vehicle Services', 'vehicle_services', 'vehicle_assistance',
      'Manager Kipepeo Vehicle Services', '+254700000547', 'm0548@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000548', 'c1000000-0000-4000-8000-000000000548', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0549] Atlas Vehicle House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000549') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000549', 'Atlas Vehicle House Ltd', 'Atlas Vehicle House', 'vehicle_services', 'vehicle_assistance',
      'Manager Atlas Vehicle House', '+254700000548', 'm0549@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000549', 'c1000000-0000-4000-8000-000000000549', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0550] Gold Vehicle Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000550') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000550', 'Gold Vehicle Co. Ltd', 'Gold Vehicle Co.', 'vehicle_services', 'vehicle_assistance',
      'Manager Gold Vehicle Co.', '+254700000549', 'm0550@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000550', 'c1000000-0000-4000-8000-000000000550', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0551] Mtaa Vehicle Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000551') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000551', 'Mtaa Vehicle Works Ltd', 'Mtaa Vehicle Works', 'vehicle_services', 'vehicle_inspection',
      'Manager Mtaa Vehicle Works', '+254700000550', 'm0551@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000551', 'c1000000-0000-4000-8000-000000000551', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0552] Amani Vehicle Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000552') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000552', 'Amani Vehicle Atelier Ltd', 'Amani Vehicle Atelier', 'vehicle_services', 'vehicle_inspection',
      'Manager Amani Vehicle Atelier', '+254700000551', 'm0552@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000552', 'c1000000-0000-4000-8000-000000000552', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0553] Rift Vehicle Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000553') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000553', 'Rift Vehicle Services Ltd', 'Rift Vehicle Services', 'vehicle_services', 'vehicle_inspection',
      'Manager Rift Vehicle Services', '+254700000552', 'm0553@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000553', 'c1000000-0000-4000-8000-000000000553', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0554] Karibu Vehicle House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000554') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000554', 'Karibu Vehicle House Ltd', 'Karibu Vehicle House', 'vehicle_services', 'vehicle_inspection',
      'Manager Karibu Vehicle House', '+254700000553', 'm0554@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000554', 'c1000000-0000-4000-8000-000000000554', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0555] Luxe Vehicle Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000555') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000555', 'Luxe Vehicle Co. Ltd', 'Luxe Vehicle Co.', 'vehicle_services', 'vehicle_inspection',
      'Manager Luxe Vehicle Co.', '+254700000554', 'm0555@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000555', 'c1000000-0000-4000-8000-000000000555', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0556] Nairobi Spa Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000556') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000556', 'Nairobi Spa Works Ltd', 'Nairobi Spa Works', 'wellness', 'spa',
      'Manager Nairobi Spa Works', '+254700000555', 'm0556@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000556', 'c1000000-0000-4000-8000-000000000556', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0557] Kijiji Spa Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000557') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000557', 'Kijiji Spa Atelier Ltd', 'Kijiji Spa Atelier', 'wellness', 'spa',
      'Manager Kijiji Spa Atelier', '+254700000556', 'm0557@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000557', 'c1000000-0000-4000-8000-000000000557', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0558] Mara Spa Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000558') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000558', 'Mara Spa Services Ltd', 'Mara Spa Services', 'wellness', 'spa',
      'Manager Mara Spa Services', '+254700000557', 'm0558@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000558', 'c1000000-0000-4000-8000-000000000558', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0559] Urban Spa House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000559') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000559', 'Urban Spa House Ltd', 'Urban Spa House', 'wellness', 'spa',
      'Manager Urban Spa House', '+254700000558', 'm0559@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000559', 'c1000000-0000-4000-8000-000000000559', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0560] Soko Spa Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000560') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000560', 'Soko Spa Co. Ltd', 'Soko Spa Co.', 'wellness', 'spa',
      'Manager Soko Spa Co.', '+254700000559', 'm0560@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000560', 'c1000000-0000-4000-8000-000000000560', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0561] Savanna Massage Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000561') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000561', 'Savanna Massage Works Ltd', 'Savanna Massage Works', 'wellness', 'massage',
      'Manager Savanna Massage Works', '+254700000560', 'm0561@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000561', 'c1000000-0000-4000-8000-000000000561', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0562] Jua Massage Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000562') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000562', 'Jua Massage Atelier Ltd', 'Jua Massage Atelier', 'wellness', 'massage',
      'Manager Jua Massage Atelier', '+254700000561', 'm0562@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000562', 'c1000000-0000-4000-8000-000000000562', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0563] Kipepeo Massage Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000563') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000563', 'Kipepeo Massage Services Ltd', 'Kipepeo Massage Services', 'wellness', 'massage',
      'Manager Kipepeo Massage Services', '+254700000562', 'm0563@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000563', 'c1000000-0000-4000-8000-000000000563', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0564] Atlas Massage House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000564') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000564', 'Atlas Massage House Ltd', 'Atlas Massage House', 'wellness', 'massage',
      'Manager Atlas Massage House', '+254700000563', 'm0564@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000564', 'c1000000-0000-4000-8000-000000000564', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0565] Gold Massage Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000565') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000565', 'Gold Massage Co. Ltd', 'Gold Massage Co.', 'wellness', 'massage',
      'Manager Gold Massage Co.', '+254700000564', 'm0565@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000565', 'c1000000-0000-4000-8000-000000000565', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0566] Mtaa Gym Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000566') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000566', 'Mtaa Gym Works Ltd', 'Mtaa Gym Works', 'wellness', 'gym',
      'Manager Mtaa Gym Works', '+254700000565', 'm0566@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000566', 'c1000000-0000-4000-8000-000000000566', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0567] Amani Gym Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000567') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000567', 'Amani Gym Atelier Ltd', 'Amani Gym Atelier', 'wellness', 'gym',
      'Manager Amani Gym Atelier', '+254700000566', 'm0567@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000567', 'c1000000-0000-4000-8000-000000000567', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0568] Rift Gym Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000568') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000568', 'Rift Gym Services Ltd', 'Rift Gym Services', 'wellness', 'gym',
      'Manager Rift Gym Services', '+254700000567', 'm0568@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000568', 'c1000000-0000-4000-8000-000000000568', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0569] Karibu Gym House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000569') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000569', 'Karibu Gym House Ltd', 'Karibu Gym House', 'wellness', 'gym',
      'Manager Karibu Gym House', '+254700000568', 'm0569@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000569', 'c1000000-0000-4000-8000-000000000569', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0570] Luxe Gym Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000570') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000570', 'Luxe Gym Co. Ltd', 'Luxe Gym Co.', 'wellness', 'gym',
      'Manager Luxe Gym Co.', '+254700000569', 'm0570@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000570', 'c1000000-0000-4000-8000-000000000570', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0571] Nairobi Personal Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000571') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000571', 'Nairobi Personal Works Ltd', 'Nairobi Personal Works', 'wellness', 'personal_training',
      'Manager Nairobi Personal Works', '+254700000570', 'm0571@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000571', 'c1000000-0000-4000-8000-000000000571', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0572] Kijiji Personal Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000572') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000572', 'Kijiji Personal Atelier Ltd', 'Kijiji Personal Atelier', 'wellness', 'personal_training',
      'Manager Kijiji Personal Atelier', '+254700000571', 'm0572@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000572', 'c1000000-0000-4000-8000-000000000572', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0573] Mara Personal Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000573') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000573', 'Mara Personal Services Ltd', 'Mara Personal Services', 'wellness', 'personal_training',
      'Manager Mara Personal Services', '+254700000572', 'm0573@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000573', 'c1000000-0000-4000-8000-000000000573', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0574] Urban Personal House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000574') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000574', 'Urban Personal House Ltd', 'Urban Personal House', 'wellness', 'personal_training',
      'Manager Urban Personal House', '+254700000573', 'm0574@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000574', 'c1000000-0000-4000-8000-000000000574', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0575] Soko Personal Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000575') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000575', 'Soko Personal Co. Ltd', 'Soko Personal Co.', 'wellness', 'personal_training',
      'Manager Soko Personal Co.', '+254700000574', 'm0575@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000575', 'c1000000-0000-4000-8000-000000000575', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0576] Savanna Reservations Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000576') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000576', 'Savanna Reservations Works Ltd', 'Savanna Reservations Works', 'concierge_services', 'reservations',
      'Manager Savanna Reservations Works', '+254700000575', 'm0576@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000576', 'c1000000-0000-4000-8000-000000000576', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0577] Jua Reservations Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000577') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000577', 'Jua Reservations Atelier Ltd', 'Jua Reservations Atelier', 'concierge_services', 'reservations',
      'Manager Jua Reservations Atelier', '+254700000576', 'm0577@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000577', 'c1000000-0000-4000-8000-000000000577', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0578] Kipepeo Reservations Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000578') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000578', 'Kipepeo Reservations Services Ltd', 'Kipepeo Reservations Services', 'concierge_services', 'reservations',
      'Manager Kipepeo Reservations Services', '+254700000577', 'm0578@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000578', 'c1000000-0000-4000-8000-000000000578', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0579] Atlas Reservations House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000579') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000579', 'Atlas Reservations House Ltd', 'Atlas Reservations House', 'concierge_services', 'reservations',
      'Manager Atlas Reservations House', '+254700000578', 'm0579@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000579', 'c1000000-0000-4000-8000-000000000579', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0580] Gold Reservations Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000580') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000580', 'Gold Reservations Co. Ltd', 'Gold Reservations Co.', 'concierge_services', 'reservations',
      'Manager Gold Reservations Co.', '+254700000579', 'm0580@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000580', 'c1000000-0000-4000-8000-000000000580', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0581] Mtaa Personal Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000581') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000581', 'Mtaa Personal Works Ltd', 'Mtaa Personal Works', 'concierge_services', 'personal_assistance',
      'Manager Mtaa Personal Works', '+254700000580', 'm0581@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000581', 'c1000000-0000-4000-8000-000000000581', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0582] Amani Personal Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000582') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000582', 'Amani Personal Atelier Ltd', 'Amani Personal Atelier', 'concierge_services', 'personal_assistance',
      'Manager Amani Personal Atelier', '+254700000581', 'm0582@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000582', 'c1000000-0000-4000-8000-000000000582', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0583] Rift Personal Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000583') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000583', 'Rift Personal Services Ltd', 'Rift Personal Services', 'concierge_services', 'personal_assistance',
      'Manager Rift Personal Services', '+254700000582', 'm0583@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000583', 'c1000000-0000-4000-8000-000000000583', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0584] Karibu Personal House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000584') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000584', 'Karibu Personal House Ltd', 'Karibu Personal House', 'concierge_services', 'personal_assistance',
      'Manager Karibu Personal House', '+254700000583', 'm0584@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000584', 'c1000000-0000-4000-8000-000000000584', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0585] Luxe Personal Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000585') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000585', 'Luxe Personal Co. Ltd', 'Luxe Personal Co.', 'concierge_services', 'personal_assistance',
      'Manager Luxe Personal Co.', '+254700000584', 'm0585@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000585', 'c1000000-0000-4000-8000-000000000585', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0586] Nairobi Shopping Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000586') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000586', 'Nairobi Shopping Works Ltd', 'Nairobi Shopping Works', 'concierge_services', 'shopping_assistance',
      'Manager Nairobi Shopping Works', '+254700000585', 'm0586@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000586', 'c1000000-0000-4000-8000-000000000586', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0587] Kijiji Shopping Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000587') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000587', 'Kijiji Shopping Atelier Ltd', 'Kijiji Shopping Atelier', 'concierge_services', 'shopping_assistance',
      'Manager Kijiji Shopping Atelier', '+254700000586', 'm0587@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000587', 'c1000000-0000-4000-8000-000000000587', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0588] Mara Shopping Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000588') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000588', 'Mara Shopping Services Ltd', 'Mara Shopping Services', 'concierge_services', 'shopping_assistance',
      'Manager Mara Shopping Services', '+254700000587', 'm0588@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000588', 'c1000000-0000-4000-8000-000000000588', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0589] Urban Shopping House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000589') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000589', 'Urban Shopping House Ltd', 'Urban Shopping House', 'concierge_services', 'shopping_assistance',
      'Manager Urban Shopping House', '+254700000588', 'm0589@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000589', 'c1000000-0000-4000-8000-000000000589', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0590] Soko Shopping Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000590') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000590', 'Soko Shopping Co. Ltd', 'Soko Shopping Co.', 'concierge_services', 'shopping_assistance',
      'Manager Soko Shopping Co.', '+254700000589', 'm0590@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000590', 'c1000000-0000-4000-8000-000000000590', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0591] Savanna Gift Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000591') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000591', 'Savanna Gift Works Ltd', 'Savanna Gift Works', 'concierge_services', 'gift_sourcing',
      'Manager Savanna Gift Works', '+254700000590', 'm0591@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000591', 'c1000000-0000-4000-8000-000000000591', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0592] Jua Gift Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000592') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000592', 'Jua Gift Atelier Ltd', 'Jua Gift Atelier', 'concierge_services', 'gift_sourcing',
      'Manager Jua Gift Atelier', '+254700000591', 'm0592@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000592', 'c1000000-0000-4000-8000-000000000592', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0593] Kipepeo Gift Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000593') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000593', 'Kipepeo Gift Services Ltd', 'Kipepeo Gift Services', 'concierge_services', 'gift_sourcing',
      'Manager Kipepeo Gift Services', '+254700000592', 'm0593@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000593', 'c1000000-0000-4000-8000-000000000593', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0594] Atlas Gift House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000594') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000594', 'Atlas Gift House Ltd', 'Atlas Gift House', 'concierge_services', 'gift_sourcing',
      'Manager Atlas Gift House', '+254700000593', 'm0594@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000594', 'c1000000-0000-4000-8000-000000000594', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0595] Gold Gift Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000595') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000595', 'Gold Gift Co. Ltd', 'Gold Gift Co.', 'concierge_services', 'gift_sourcing',
      'Manager Gold Gift Co.', '+254700000594', 'm0595@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000595', 'c1000000-0000-4000-8000-000000000595', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0596] Mtaa Travel Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000596') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000596', 'Mtaa Travel Works Ltd', 'Mtaa Travel Works', 'concierge_services', 'travel_planning',
      'Manager Mtaa Travel Works', '+254700000595', 'm0596@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000596', 'c1000000-0000-4000-8000-000000000596', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0597] Amani Travel Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000597') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000597', 'Amani Travel Atelier Ltd', 'Amani Travel Atelier', 'concierge_services', 'travel_planning',
      'Manager Amani Travel Atelier', '+254700000596', 'm0597@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000597', 'c1000000-0000-4000-8000-000000000597', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0598] Rift Travel Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000598') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000598', 'Rift Travel Services Ltd', 'Rift Travel Services', 'concierge_services', 'travel_planning',
      'Manager Rift Travel Services', '+254700000597', 'm0598@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000598', 'c1000000-0000-4000-8000-000000000598', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0599] Karibu Travel House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000599') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000599', 'Karibu Travel House Ltd', 'Karibu Travel House', 'concierge_services', 'travel_planning',
      'Manager Karibu Travel House', '+254700000598', 'm0599@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000599', 'c1000000-0000-4000-8000-000000000599', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0600] Luxe Travel Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000600') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000600', 'Luxe Travel Co. Ltd', 'Luxe Travel Co.', 'concierge_services', 'travel_planning',
      'Manager Luxe Travel Co.', '+254700000599', 'm0600@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000600', 'c1000000-0000-4000-8000-000000000600', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0601] Nairobi Property Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000601') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000601', 'Nairobi Property Works Ltd', 'Nairobi Property Works', 'concierge_services', 'property_coordination',
      'Manager Nairobi Property Works', '+254700000600', 'm0601@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000601', 'c1000000-0000-4000-8000-000000000601', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0602] Kijiji Property Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000602') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000602', 'Kijiji Property Atelier Ltd', 'Kijiji Property Atelier', 'concierge_services', 'property_coordination',
      'Manager Kijiji Property Atelier', '+254700000601', 'm0602@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000602', 'c1000000-0000-4000-8000-000000000602', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0603] Mara Property Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000603') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000603', 'Mara Property Services Ltd', 'Mara Property Services', 'concierge_services', 'property_coordination',
      'Manager Mara Property Services', '+254700000602', 'm0603@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000603', 'c1000000-0000-4000-8000-000000000603', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0604] Urban Property House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000604') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000604', 'Urban Property House Ltd', 'Urban Property House', 'concierge_services', 'property_coordination',
      'Manager Urban Property House', '+254700000603', 'm0604@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000604', 'c1000000-0000-4000-8000-000000000604', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0605] Soko Property Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000605') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000605', 'Soko Property Co. Ltd', 'Soko Property Co.', 'concierge_services', 'property_coordination',
      'Manager Soko Property Co.', '+254700000604', 'm0605@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000605', 'c1000000-0000-4000-8000-000000000605', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0606] Savanna Moving Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000606') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000606', 'Savanna Moving Works Ltd', 'Savanna Moving Works', 'concierge_services', 'moving_assistance',
      'Manager Savanna Moving Works', '+254700000605', 'm0606@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000606', 'c1000000-0000-4000-8000-000000000606', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0607] Jua Moving Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000607') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000607', 'Jua Moving Atelier Ltd', 'Jua Moving Atelier', 'concierge_services', 'moving_assistance',
      'Manager Jua Moving Atelier', '+254700000606', 'm0607@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000607', 'c1000000-0000-4000-8000-000000000607', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0608] Kipepeo Moving Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000608') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000608', 'Kipepeo Moving Services Ltd', 'Kipepeo Moving Services', 'concierge_services', 'moving_assistance',
      'Manager Kipepeo Moving Services', '+254700000607', 'm0608@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000608', 'c1000000-0000-4000-8000-000000000608', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0609] Atlas Moving House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000609') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000609', 'Atlas Moving House Ltd', 'Atlas Moving House', 'concierge_services', 'moving_assistance',
      'Manager Atlas Moving House', '+254700000608', 'm0609@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000609', 'c1000000-0000-4000-8000-000000000609', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0610] Gold Moving Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000610') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000610', 'Gold Moving Co. Ltd', 'Gold Moving Co.', 'concierge_services', 'moving_assistance',
      'Manager Gold Moving Co.', '+254700000609', 'm0610@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000610', 'c1000000-0000-4000-8000-000000000610', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0611] Mtaa Cleaning Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000611') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000611', 'Mtaa Cleaning Works Ltd', 'Mtaa Cleaning Works', 'concierge_services', 'cleaning_coordination',
      'Manager Mtaa Cleaning Works', '+254700000610', 'm0611@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000611', 'c1000000-0000-4000-8000-000000000611', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0612] Amani Cleaning Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000612') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000612', 'Amani Cleaning Atelier Ltd', 'Amani Cleaning Atelier', 'concierge_services', 'cleaning_coordination',
      'Manager Amani Cleaning Atelier', '+254700000611', 'm0612@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000612', 'c1000000-0000-4000-8000-000000000612', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0613] Rift Cleaning Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000613') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000613', 'Rift Cleaning Services Ltd', 'Rift Cleaning Services', 'concierge_services', 'cleaning_coordination',
      'Manager Rift Cleaning Services', '+254700000612', 'm0613@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000613', 'c1000000-0000-4000-8000-000000000613', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0614] Karibu Cleaning House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000614') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000614', 'Karibu Cleaning House Ltd', 'Karibu Cleaning House', 'concierge_services', 'cleaning_coordination',
      'Manager Karibu Cleaning House', '+254700000613', 'm0614@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000614', 'c1000000-0000-4000-8000-000000000614', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0615] Luxe Cleaning Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000615') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000615', 'Luxe Cleaning Co. Ltd', 'Luxe Cleaning Co.', 'concierge_services', 'cleaning_coordination',
      'Manager Luxe Cleaning Co.', '+254700000614', 'm0615@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000615', 'c1000000-0000-4000-8000-000000000615', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0616] Nairobi VIP Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000616') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000616', 'Nairobi VIP Works Ltd', 'Nairobi VIP Works', 'concierge_services', 'vip_assistance',
      'Manager Nairobi VIP Works', '+254700000615', 'm0616@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000616', 'c1000000-0000-4000-8000-000000000616', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0617] Kijiji VIP Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000617') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000617', 'Kijiji VIP Atelier Ltd', 'Kijiji VIP Atelier', 'concierge_services', 'vip_assistance',
      'Manager Kijiji VIP Atelier', '+254700000616', 'm0617@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000617', 'c1000000-0000-4000-8000-000000000617', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0618] Mara VIP Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000618') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000618', 'Mara VIP Services Ltd', 'Mara VIP Services', 'concierge_services', 'vip_assistance',
      'Manager Mara VIP Services', '+254700000617', 'm0618@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000618', 'c1000000-0000-4000-8000-000000000618', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0619] Urban VIP House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000619') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000619', 'Urban VIP House Ltd', 'Urban VIP House', 'concierge_services', 'vip_assistance',
      'Manager Urban VIP House', '+254700000618', 'm0619@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000619', 'c1000000-0000-4000-8000-000000000619', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0620] Soko VIP Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000620') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000620', 'Soko VIP Co. Ltd', 'Soko VIP Co.', 'concierge_services', 'vip_assistance',
      'Manager Soko VIP Co.', '+254700000619', 'm0620@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000620', 'c1000000-0000-4000-8000-000000000620', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;
  -- [M0621] Savanna Sea Works (Kilimani)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000621') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000621', 'Savanna Sea Works Ltd', 'Savanna Sea Works', 'logistics_shipping', 'sea_freight',
      'Manager Savanna Sea Works', '+254700000620', 'm0621@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000621', 'c1000000-0000-4000-8000-000000000621', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856
    );
  end if;
  -- [M0622] Jua Sea Atelier (Westlands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000622') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000622', 'Jua Sea Atelier Ltd', 'Jua Sea Atelier', 'logistics_shipping', 'sea_freight',
      'Manager Jua Sea Atelier', '+254700000621', 'm0622@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000622', 'c1000000-0000-4000-8000-000000000622', 'Westlands Branch', 'Westlands, Nairobi', true, -1.2674, 36.811
    );
  end if;
  -- [M0623] Kipepeo Sea Services (Kileleshwa)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000623') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000623', 'Kipepeo Sea Services Ltd', 'Kipepeo Sea Services', 'logistics_shipping', 'sea_freight',
      'Manager Kipepeo Sea Services', '+254700000622', 'm0623@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000623', 'c1000000-0000-4000-8000-000000000623', 'Kileleshwa Branch', 'Kileleshwa, Nairobi', true, -1.2789, 36.7904
    );
  end if;
  -- [M0624] Atlas Sea House (Lavington)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000624') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000624', 'Atlas Sea House Ltd', 'Atlas Sea House', 'logistics_shipping', 'sea_freight',
      'Manager Atlas Sea House', '+254700000623', 'm0624@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000624', 'c1000000-0000-4000-8000-000000000624', 'Lavington Branch', 'Lavington, Nairobi', true, -1.2854, 36.7688
    );
  end if;
  -- [M0625] Gold Sea Co. (Karen)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000625') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000625', 'Gold Sea Co. Ltd', 'Gold Sea Co.', 'logistics_shipping', 'sea_freight',
      'Manager Gold Sea Co.', '+254700000624', 'm0625@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000625', 'c1000000-0000-4000-8000-000000000625', 'Karen Branch', 'Karen, Nairobi', true, -1.3197, 36.7065
    );
  end if;
  -- [M0626] Mtaa Air Works (Parklands)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000626') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000626', 'Mtaa Air Works Ltd', 'Mtaa Air Works', 'logistics_shipping', 'air_freight',
      'Manager Mtaa Air Works', '+254700000625', 'm0626@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000626', 'c1000000-0000-4000-8000-000000000626', 'Parklands Branch', 'Parklands, Nairobi', true, -1.2625, 36.8241
    );
  end if;
  -- [M0627] Amani Air Atelier (Riverside)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000627') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000627', 'Amani Air Atelier Ltd', 'Amani Air Atelier', 'logistics_shipping', 'air_freight',
      'Manager Amani Air Atelier', '+254700000626', 'm0627@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000627', 'c1000000-0000-4000-8000-000000000627', 'Riverside Branch', 'Riverside, Nairobi', true, -1.2715, 36.7963
    );
  end if;
  -- [M0628] Rift Air Services (Gigiri)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000628') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000628', 'Rift Air Services Ltd', 'Rift Air Services', 'logistics_shipping', 'air_freight',
      'Manager Rift Air Services', '+254700000627', 'm0628@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000628', 'c1000000-0000-4000-8000-000000000628', 'Gigiri Branch', 'Gigiri, Nairobi', true, -1.233, 36.8124
    );
  end if;
  -- [M0629] Karibu Air House (Runda)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000629') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000629', 'Karibu Air House Ltd', 'Karibu Air House', 'logistics_shipping', 'air_freight',
      'Manager Karibu Air House', '+254700000628', 'm0629@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000629', 'c1000000-0000-4000-8000-000000000629', 'Runda Branch', 'Runda, Nairobi', true, -1.2144, 36.8198
    );
  end if;
  -- [M0630] Luxe Air Co. (Hurlingham)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000630') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000630', 'Luxe Air Co. Ltd', 'Luxe Air Co.', 'logistics_shipping', 'air_freight',
      'Manager Luxe Air Co.', '+254700000629', 'm0630@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000630', 'c1000000-0000-4000-8000-000000000630', 'Hurlingham Branch', 'Hurlingham, Nairobi', true, -1.2971, 36.7915
    );
  end if;
  -- [M0631] Nairobi Road Works (Upper Hill)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000631') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000631', 'Nairobi Road Works Ltd', 'Nairobi Road Works', 'logistics_shipping', 'road_freight__trucking',
      'Manager Nairobi Road Works', '+254700000630', 'm0631@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000631', 'c1000000-0000-4000-8000-000000000631', 'Upper Hill Branch', 'Upper Hill, Nairobi', true, -1.2988, 36.8172
    );
  end if;
  -- [M0632] Kijiji Road Atelier (CBD)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000632') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000632', 'Kijiji Road Atelier Ltd', 'Kijiji Road Atelier', 'logistics_shipping', 'road_freight__trucking',
      'Manager Kijiji Road Atelier', '+254700000631', 'm0632@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000632', 'c1000000-0000-4000-8000-000000000632', 'CBD Branch', 'CBD, Nairobi', true, -1.2864, 36.8172
    );
  end if;
  -- [M0633] Mara Road Services (South C)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000633') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000633', 'Mara Road Services Ltd', 'Mara Road Services', 'logistics_shipping', 'road_freight__trucking',
      'Manager Mara Road Services', '+254700000632', 'm0633@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000633', 'c1000000-0000-4000-8000-000000000633', 'South C Branch', 'South C, Nairobi', true, -1.3211, 36.8285
    );
  end if;
  -- [M0634] Urban Road House (South B)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000634') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000634', 'Urban Road House Ltd', 'Urban Road House', 'logistics_shipping', 'road_freight__trucking',
      'Manager Urban Road House', '+254700000633', 'm0634@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000634', 'c1000000-0000-4000-8000-000000000634', 'South B Branch', 'South B, Nairobi', true, -1.3125, 36.8402
    );
  end if;
  -- [M0635] Soko Road Co. (Ngong Road)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000635') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000635', 'Soko Road Co. Ltd', 'Soko Road Co.', 'logistics_shipping', 'road_freight__trucking',
      'Manager Soko Road Co.', '+254700000634', 'm0635@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000635', 'c1000000-0000-4000-8000-000000000635', 'Ngong Road Branch', 'Ngong Road, Nairobi', true, -1.2995, 36.7761
    );
  end if;
  -- [M0636] Savanna Warehousing Works (Spring Valley)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000636') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000636', 'Savanna Warehousing Works Ltd', 'Savanna Warehousing Works', 'logistics_shipping', 'warehousing__storage',
      'Manager Savanna Warehousing Works', '+254700000635', 'm0636@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000636', 'c1000000-0000-4000-8000-000000000636', 'Spring Valley Branch', 'Spring Valley, Nairobi', true, -1.2541, 36.7925
    );
  end if;
  -- [M0637] Jua Warehousing Atelier (Loresho)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000637') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000637', 'Jua Warehousing Atelier Ltd', 'Jua Warehousing Atelier', 'logistics_shipping', 'warehousing__storage',
      'Manager Jua Warehousing Atelier', '+254700000636', 'm0637@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000637', 'c1000000-0000-4000-8000-000000000637', 'Loresho Branch', 'Loresho, Nairobi', true, -1.252, 36.7588
    );
  end if;
  -- [M0638] Kipepeo Warehousing Services (Muthaiga)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000638') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000638', 'Kipepeo Warehousing Services Ltd', 'Kipepeo Warehousing Services', 'logistics_shipping', 'warehousing__storage',
      'Manager Kipepeo Warehousing Services', '+254700000637', 'm0638@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000638', 'c1000000-0000-4000-8000-000000000638', 'Muthaiga Branch', 'Muthaiga, Nairobi', true, -1.2562, 36.8375
    );
  end if;
  -- [M0639] Atlas Warehousing House (Eastleigh)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000639') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000639', 'Atlas Warehousing House Ltd', 'Atlas Warehousing House', 'logistics_shipping', 'warehousing__storage',
      'Manager Atlas Warehousing House', '+254700000638', 'm0639@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000639', 'c1000000-0000-4000-8000-000000000639', 'Eastleigh Branch', 'Eastleigh, Nairobi', true, -1.2783, 36.8524
    );
  end if;
  -- [M0640] Gold Warehousing Co. (Nairobi West)
  if not exists (select 1 from public.merchant where id = 'c1000000-0000-4000-8000-000000000640') then
    insert into public.merchant (
      id, legal_name, trading_name, category, subcategory,
      contact_name, contact_phone, contact_email, city_id,
      status, explore_visible, went_live_at, accepting_orders
    ) values (
      'c1000000-0000-4000-8000-000000000640', 'Gold Warehousing Co. Ltd', 'Gold Warehousing Co.', 'logistics_shipping', 'warehousing__storage',
      'Manager Gold Warehousing Co.', '+254700000639', 'm0640@nexgpartners.com', v_city,
      'live', true, now(), true
    );

    insert into public.merchant_branch (
      id, merchant_id, name, address_text, is_primary, latitude, longitude
    ) values (
      'd1000000-0000-4000-8000-000000000640', 'c1000000-0000-4000-8000-000000000640', 'Nairobi West Branch', 'Nairobi West, Nairobi', true, -1.3105, 36.821
    );
  end if;

  raise notice 'Successfully seeded 640 Nairobi merchants and branches.';
end $$;
