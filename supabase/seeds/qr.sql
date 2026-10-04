-- Cards on fridges, and a fortnight of people scanning them.
--
-- Local only. Everything goes through the real RPCs, so the scans
-- carry real signed tokens and the funnel is the funnel — a seed that
-- inserted straight into `qr_scan` would produce numbers the
-- attribution rule had never agreed to.
--
-- Shaped to show the one comparison the console exists for: the same
-- flat with a counter card and a fridge card, and the fridge winning.

do $$
declare
  v_unit record;
  v_counter jsonb;
  v_fridge jsonb;
  v_scan jsonb;
  v_session text;
  v_i integer;
  v_n integer;
  v_at timestamptz;
  v_staff uuid;
begin
  select id into v_staff from public.staff_user order by created_at limit 1;
  if v_staff is null then return; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from public.staff_user where id = v_staff),
                      'role', 'authenticated')::text, true);

  delete from public.qr_scan;
  delete from public.qr_miss;
  delete from public.property_qr;
  delete from public.qr_pack;

  for v_unit in
    select id, label_public from public.unit where status = 'live' order by name limit 4
  loop
    v_counter := public.rpc_qr_generate('unit', v_unit.id, 'counter');

    /* Only the first two flats get a second card, so the console has
       both the comparison and the ordinary case. */
    if v_unit.id = (select id from public.unit where status = 'live' order by name limit 1)
       or v_unit.id = (select id from public.unit where status = 'live' order by name offset 1 limit 1)
    then
      v_fridge := public.rpc_qr_generate('unit', v_unit.id, 'fridge');
    else
      v_fridge := null;
    end if;

    update public.property_qr
       set sent_at = now() - interval '21 days', sent_channel = 'whatsapp',
           placed_confirmed_at = now() - interval '19 days', state = 'placed'
     where owner_id = v_unit.id and voided_at is null;

    /* A fortnight of guests. The counter card gets scanned more and
       converts less, which is the thing hosts are surprised by. */
    for v_i in 1..14 loop
      v_at := now() - make_interval(days => v_i);

      for v_n in 1..(1 + (v_i % 3)) loop
        v_session := encode(extensions.gen_random_bytes(16), 'hex');

        v_scan := public.rpc_resolve_qr(
          v_counter ->> 'code', v_session,
          jsonb_build_object('ua_family',
            case v_n % 3 when 0 then 'Chrome' when 1 then 'Safari' else 'Samsung Internet' end,
            'os', case when v_n % 2 = 0 then 'Android' else 'iOS' end,
            'is_mobile', true),
          'camera', 'KE');

        if v_n = 1 then
          perform public.rpc_qr_scan_progress(v_scan ->> 'scan_token', 'browsed', null,
            case v_i % 4 when 0 then 'Groceries' when 1 then 'Food' when 2 then 'Pharmacy'
                         else 'Errands' end);
        end if;
        if v_i % 5 = 0 and v_n = 1 then
          perform public.rpc_qr_scan_progress(v_scan ->> 'scan_token', 'cart');
        end if;

        /*
         * Backdate LAST, never before the token has been used.
         *
         * The scan token is an HMAC over the scan's timestamp, so
         * moving `scanned_at` invalidates the signature and every
         * later call refuses the token. That is the mechanism doing
         * exactly its job — a row that has been altered since the
         * token was issued no longer verifies — and it is why this
         * seed does its work first and moves the clock afterwards.
         */
        update public.qr_scan
           set scanned_at = v_at + make_interval(hours => 8 + v_n * 3)
         where scan_token = v_scan ->> 'scan_token';
      end loop;

      if v_fridge is not null then
        v_session := encode(extensions.gen_random_bytes(16), 'hex');
        v_scan := public.rpc_resolve_qr(
          v_fridge ->> 'code', v_session,
          '{"ua_family":"Safari","os":"iOS","is_mobile":true}'::jsonb, 'camera', 'KE');

        perform public.rpc_qr_scan_progress(v_scan ->> 'scan_token', 'browsed', null, 'Food');

        /* Every other evening somebody actually orders. */
        if v_i % 2 = 0 then
          perform public.fn_qr_attribute_order(
            'NX-' || to_char(v_at, 'MMDD') || '-' || lpad(v_i::text, 3, '0'),
            v_scan ->> 'scan_token', v_session);
        end if;

        /* Again: the clock moves only once the token has done its
           work, for the reason set out above. */
        update public.qr_scan
           set scanned_at = v_at + interval '19 hours',
               ordered_at = case when ordered_at is not null
                                 then v_at + interval '19 hours' + interval '11 minutes' end
         where scan_token = v_scan ->> 'scan_token';
      end if;
    end loop;
  end loop;

  /*
   * One card sent three weeks ago and never scanned — the envelope
   * never opened. This is the row the health view exists for.
   */
  insert into public.property_qr (
    code, owner_type, owner_id, placement, host_id, city_id, label,
    secret_hash, state, sent_at, sent_channel)
  select public.fn_qr_new_code(), 'unit', u.id, 'welcome_book', u.host_id, u.city_id,
         u.label_public, encode(extensions.gen_random_bytes(32), 'hex'),
         'sent', now() - interval '23 days', 'email'
    from public.unit u where u.status = 'live' order by u.name offset 2 limit 1;

  /* And somebody probing the keyspace, so the misses list is not
     empty on a screen whose whole job is to show you that. */
  insert into public.qr_miss (at, code_attempted, session_id, ip_country, reason)
  select now() - make_interval(mins => g * 7),
         'NXG-' || upper(substr(md5(g::text), 1, 6)),
         'probe-session', 'RU', 'not_found'
    from generate_series(1, 6) g;

exception when others then
  raise notice 'QR seed skipped: %', sqlerrm;
end $$;

/* The reports read a materialised view; without this the console
   opens empty on a database that plainly has scans in it. */
select public.cron_qr_refresh_reports();
