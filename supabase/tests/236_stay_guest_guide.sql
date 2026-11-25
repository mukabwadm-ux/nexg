-- A signed-in guest lists their own stays and reads their stay's published guide, floor plan and 3D model in the
-- Stays app (20270320000300). Nobody else can, a cancelled or held stay cannot, and an unpublished guide is nothing.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e2320000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest232@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2320000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other232@example.test',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('e2321000-0000-4000-8000-00000000000a','multi_unit','[Host 232]','+254700232001',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id, house_rules, cancellation_policy,
                             check_in_from, check_out_by)
values ('e2322000-0000-4000-8000-00000000000a','e2321000-0000-4000-8000-00000000000a',
        'block-232','Block 232','apartment','Kilimani',(select id from public.city where slug = 'nairobi'),
        'No parties.','Free cancellation up to 3 days before.','14:00','10:00');

/* a: live with a published guide. b: live, guide never published. c: paused, with a published guide. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, city_id, handoff, status,
                         wifi_name, handoff_note, checkin_time)
values
  ('e2323000-0000-4000-8000-00000000000a','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','A-host-shorthand','Studio A','[Address]',
   (select id from public.city where slug = 'nairobi'),'lockbox','live','Block232-Guest','[Rider note]','15:00'),
  ('e2323000-0000-4000-8000-00000000000b','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','B','Studio B','[Address]',
   (select id from public.city where slug = 'nairobi'),'reception','live',null,null,null),
  ('e2323000-0000-4000-8000-00000000000c','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','C','Studio C','[Address]',
   (select id from public.city where slug = 'nairobi'),'reception','paused',null,null,null);

insert into public.host_unit_guide (unit_id) values
  ('e2323000-0000-4000-8000-00000000000a'), ('e2323000-0000-4000-8000-00000000000b'),
  ('e2323000-0000-4000-8000-00000000000c');

/* Unit a: a floor plan in Storage and a 3D model kept in the database, both published; a draft-only model. */
insert into storage.objects (bucket_id, name, metadata) values
  ('host-guide-assets',
   'e2321000-0000-4000-8000-00000000000a/e2323000-0000-4000-8000-00000000000a/plan/' || repeat('c', 64) || '.png',
   '{"mimetype": "image/png", "size": 1000}');
insert into public.host_unit_guide_asset (id, unit_id, kind, mime, digest, storage_path, size_bytes)
values ('e2324000-0000-4000-8000-0000000000c1','e2323000-0000-4000-8000-00000000000a','plan','image/png',
        decode(repeat('c', 64), 'hex'),
        'e2321000-0000-4000-8000-00000000000a/e2323000-0000-4000-8000-00000000000a/plan/'
          || repeat('c', 64) || '.png', 1000);
insert into public.host_unit_guide_asset (id, unit_id, kind, mime, digest, body)
values
  ('e2324000-0000-4000-8000-0000000000d1','e2323000-0000-4000-8000-00000000000a','model','model/gltf-binary',
   extensions.digest('\x676c5446'::bytea, 'sha256'), '\x676c5446'::bytea),
  ('e2324000-0000-4000-8000-0000000000d2','e2323000-0000-4000-8000-00000000000a','model','model/gltf-binary',
   extensions.digest('\x676c544602'::bytea, 'sha256'), '\x676c544602'::bytea);

insert into public.host_unit_guide_version (id, unit_id, document)
values
  ('e2325000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a',
   jsonb_build_object('articles', jsonb_build_array(jsonb_build_object('id', 'wifi', 'title', 'Wi-Fi')),
                      'planId', 'e2324000-0000-4000-8000-0000000000c1',
                      'modelId', 'e2324000-0000-4000-8000-0000000000d1',
                      'house', jsonb_build_object('rooms', '[]'::jsonb))),
  ('e2325000-0000-4000-8000-00000000000c','e2323000-0000-4000-8000-00000000000c',
   jsonb_build_object('articles', '[]'::jsonb));
update public.host_unit_guide set published_id = 'e2325000-0000-4000-8000-00000000000a'
 where unit_id = 'e2323000-0000-4000-8000-00000000000a';
update public.host_unit_guide set published_id = 'e2325000-0000-4000-8000-00000000000c'
 where unit_id = 'e2323000-0000-4000-8000-00000000000c';

/*
 * The guest's stays. s1 booked (a). s2 departed 8 days ago (a). s3 departed 30 days ago (a). s4 cancelled after it
 * was confirmed (a). s5 a hold (a). s6 a hold that lapsed unpaid (a). s7 booked, unit b (unpublished guide).
 * s8 booked, unit c (paused). s9 booked with no unit. s10 still booked, but check-out passed yesterday (a).
 * And the other user's booked stay in unit a.
 */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, guest_user_id,
                         check_in, check_out, source, status, hold_expires_at, confirmed_at,
                         party_adults, party_children)
values
  ('e2326000-0000-4000-8000-0000000000a1','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '5 days', now() + interval '7 days',
   'nexg','booked', null, now(), 2, 1),
  ('e2326000-0000-4000-8000-0000000000a2','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() - interval '10 days', now() - interval '8 days',
   'nexg','departed', null, now() - interval '20 days', 1, 0),
  ('e2326000-0000-4000-8000-0000000000a3','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() - interval '32 days', now() - interval '30 days',
   'nexg','departed', null, now() - interval '40 days', 1, 0),
  ('e2326000-0000-4000-8000-0000000000a4','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '20 days', now() + interval '22 days',
   'nexg','cancelled', null, now() - interval '2 days', 1, 0),
  ('e2326000-0000-4000-8000-0000000000a5','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '30 days', now() + interval '32 days',
   'nexg','held', now() + interval '15 minutes', null, 1, 0),
  ('e2326000-0000-4000-8000-0000000000a6','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '40 days', now() + interval '42 days',
   'nexg','cancelled', now() - interval '1 hour', null, 1, 0),
  ('e2326000-0000-4000-8000-0000000000a7','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000b','Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '5 days', now() + interval '7 days',
   'nexg','booked', null, now(), 1, 0),
  ('e2326000-0000-4000-8000-0000000000a8','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000c','Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '5 days', now() + interval '7 days',
   'nexg','booked', null, now(), 1, 0),
  ('e2326000-0000-4000-8000-0000000000a9','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a', null,'Amina',
   'e2320000-0000-4000-8000-000000000001', now() + interval '50 days', now() + interval '52 days',
   'nexg','booked', null, now(), 1, 0),
  ('e2326000-0000-4000-8000-0000000000aa','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Amina',
   'e2320000-0000-4000-8000-000000000001', now() - interval '3 days', now() - interval '1 day',
   'nexg','booked', null, now() - interval '10 days', 1, 0),
  ('e2326000-0000-4000-8000-0000000000b1','e2321000-0000-4000-8000-00000000000a',
   'e2322000-0000-4000-8000-00000000000a','e2323000-0000-4000-8000-00000000000a','Brian',
   'e2320000-0000-4000-8000-000000000002', now() + interval '60 days', now() + interval '62 days',
   'nexg','booked', null, now(), 1, 0);

/* What the QR guide shape looks like for unit a, read here because the guest cannot read the version table. */
select set_config('t.published_guide', (
  select jsonb_build_object('unitName', 'Studio A', 'document', document, 'publishedAt', published_at)::text
    from public.host_unit_guide_version where id = 'e2325000-0000-4000-8000-00000000000a'), true);

-- ══════════════════════════════════════════ 1. the guest's own stays

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2320000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select array_agg(x ->> 'id' order by x ->> 'id')
     from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x),
  array['e2326000-0000-4000-8000-0000000000a1','e2326000-0000-4000-8000-0000000000a2',
        'e2326000-0000-4000-8000-0000000000a3','e2326000-0000-4000-8000-0000000000a4',
        'e2326000-0000-4000-8000-0000000000a7','e2326000-0000-4000-8000-0000000000a8',
        'e2326000-0000-4000-8000-0000000000a9','e2326000-0000-4000-8000-0000000000aa'],
  'The guest lists their booked, departed and confirmed-then-cancelled stays; never a hold, a lapsed hold, or another guest''s stay.');
select is(
  public.rpc_stay_guest_stays() -> 'stays' -> 0 ->> 'id', 'e2326000-0000-4000-8000-0000000000a9',
  'Newest check-in first.');

select is(
  (select jsonb_build_object('property_name', x ->> 'property_name', 'unit_name', x ->> 'unit_name',
     'area', x ->> 'area', 'check_in_time', x ->> 'check_in_time', 'check_out_time', x ->> 'check_out_time',
     'house_rules', x ->> 'house_rules', 'handoff', x ->> 'handoff', 'wifi_name', x ->> 'wifi_name',
     'party', (x ->> 'party_adults') || '+' || (x ->> 'party_children'), 'time_zone', x ->> 'time_zone',
     'guide_available', x -> 'guide_available', 'can_chat', x -> 'can_chat')
     from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
    where x ->> 'id' = 'e2326000-0000-4000-8000-0000000000a1'),
  jsonb_build_object('property_name', 'Block 232', 'unit_name', 'Studio A', 'area', 'Kilimani',
     'check_in_time', '15:00', 'check_out_time', '10:00', 'house_rules', 'No parties.', 'handoff', 'lockbox',
     'wifi_name', 'Block232-Guest', 'party', '2+1', 'time_zone', 'Africa/Nairobi',
     'guide_available', true, 'can_chat', true),
  'A stay row carries the public unit label, the unit''s own check-in time (else the property''s), the rules, and whether its guide and chat are open.');
select ok(
  not exists (select 1 from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
               where x::text like '%A-host-shorthand%' or x::text like '%Rider note%'),
  'Neither the host''s own unit name nor the rider handoff note reaches the guest.');
select is(
  (select array_agg(x ->> 'id' order by x ->> 'id')
     from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
    where (x -> 'guide_available')::boolean),
  array['e2326000-0000-4000-8000-0000000000a1'],
  'A guide is available for the booked stay that has not ended, and no other.');

-- ══════════════════════════════════════════ 2. the guest reads their stay's guide

select is(
  public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a1'),
  current_setting('t.published_guide')::jsonb,
  'The guest reads their booked stay''s published guide, with the 3D house, in the QR guide''s shape.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a2'), null,
  'The guide closes when the host checks the guest out: not a stay that departed 8 days ago.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000aa'), null,
  'Nor a stay still marked booked whose check-out has passed.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a3'), null,
  'Not one that ended 30 days ago.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a4'), null,
  'A cancelled stay gets no guide, even one that was confirmed.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a5'), null, 'Nor a hold.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a6'), null, 'Nor a hold that lapsed.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a7'), null,
  'An unpublished guide returns nothing.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a8'), null,
  'A unit that is not live returns nothing.');
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a9'), null,
  'A stay with no unit returns nothing.');
select throws_ok(
  $$select public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000b1')$$,
  '42501', 'This stay is not yours.', 'The guest cannot read another guest''s stay guide.');
select throws_ok(
  $$select public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000ff')$$,
  '42501', 'This stay is not yours.', 'A stay that does not exist reads the same.');

-- ══════════════════════════════════════════ 3. the guide's files

select is(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a1', 'e2324000-0000-4000-8000-0000000000c1'),
  jsonb_build_object('mime', 'image/png', 'path',
    'e2321000-0000-4000-8000-00000000000a/e2323000-0000-4000-8000-00000000000a/plan/' || repeat('c', 64) || '.png'),
  'The guest gets the published floor plan''s Storage path to sign.');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'host-guide-assets'),
  1, 'And can now read that one file for the minute the grant lasts.');
select ok(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a1', 'e2324000-0000-4000-8000-0000000000c1')
    is not null,
  'A refresh straight after gets it again.');
select is(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a1', 'e2324000-0000-4000-8000-0000000000d1'),
  jsonb_build_object('mime', 'model/gltf-binary', 'base64', encode('\x676c5446'::bytea, 'base64')),
  'A 3D model kept in the database comes back as its bytes.');
select is(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a1', 'e2324000-0000-4000-8000-0000000000d2'),
  null, 'A draft file that is not in the published guide is refused.');
select is(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a4', 'e2324000-0000-4000-8000-0000000000c1'),
  null, 'A cancelled stay gets no file.');
select is(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a2', 'e2324000-0000-4000-8000-0000000000c1'),
  null, 'Nor a stay that has departed.');
select is(
  public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a7', 'e2324000-0000-4000-8000-0000000000c1'),
  null, 'Nor does a stay in another unit, even of the same host.');
select throws_ok(
  $$select public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000b1',
      'e2324000-0000-4000-8000-0000000000c1')$$,
  '42501', 'This stay is not yours.', 'Nor through another guest''s stay.');
reset role;

select is(
  (select count(*)::int from audit.audit_event where action = 'stay.guide_file_opened_by_guest'),
  1, 'The floor plan read is logged once; the refresh, the database model and the refusals add no row.');
select is(
  (select actor_type::text || ' / ' || actor_id::text || ' / ' || target_type || ' / ' || target_id::text
          || ' / ' || (after ->> 'kind') || ' / ' || (after ->> 'unit_id')
     from audit.audit_event where action = 'stay.guide_file_opened_by_guest'),
  'guest / e2320000-0000-4000-8000-000000000001 / stay / e2326000-0000-4000-8000-0000000000a1 / plan / '
    || 'e2323000-0000-4000-8000-00000000000a',
  'It names the guest, the stay, the file''s kind and the unit.');
select is(
  (select count(*)::int from audit.action_registry where action = 'stay.guide_file_opened_by_guest'),
  1, 'The action is registered.');

-- ══════════════════════════════════════════ 4. another user, and a paused host

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2320000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select array_agg(x ->> 'id') from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x),
  array['e2326000-0000-4000-8000-0000000000b1'], 'Another user lists only their own stay.');
select throws_ok(
  $$select public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a1')$$,
  '42501', 'This stay is not yours.', 'And cannot read the first guest''s stay guide.');
select throws_ok(
  $$select public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a1',
      'e2324000-0000-4000-8000-0000000000c1')$$,
  '42501', 'This stay is not yours.', 'Nor its files.');
reset role;

set local session_replication_role = replica;
update public.host set status = 'paused' where id = 'e2321000-0000-4000-8000-00000000000a';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2320000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a1'), null,
  'A paused host''s guide is not shown.');
reset role;
set local session_replication_role = replica;
update public.host set status = 'live' where id = 'e2321000-0000-4000-8000-00000000000a';
set local session_replication_role = origin;

-- ══════════════════════════════════════════ 5. a signed-out visitor

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.rpc_stay_guest_stays()$$, '42501', null, 'A visitor cannot list stays.');
select throws_ok(
  $$select public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'Nor read a stay guide.');
select throws_ok(
  $$select public.rpc_stay_guest_guide_asset_sign('e2326000-0000-4000-8000-0000000000a1',
      'e2324000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'Nor its files.');
reset role;

/* Signed in, but no user id in the token: refused, as anon is. */
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_stay_guest_guide('e2326000-0000-4000-8000-0000000000a1')$$,
  '42501', 'This stay is not yours.', 'A token with no user reads no stay guide.');
select is(public.rpc_stay_guest_stays() -> 'stays', '[]'::jsonb, 'And lists no stays.');
reset role;

-- ══════════════════════════════════════════ 6. the wiring gate

select ok(
  not exists (select 1 from public.wiring_anon_allow
               where function_name in ('rpc_stay_guest_stays', 'rpc_stay_guest_guide',
                                       'rpc_stay_guest_guide_asset_sign')),
  'None of the three is on the anon allowlist.');
select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
