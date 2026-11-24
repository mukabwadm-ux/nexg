-- Guide files in Storage (20270316000100): the host-guide-assets bucket, who
-- may add, read and remove a unit's floor plan and 3D model, the RPC that
-- records an uploaded file, and files stored in the database before this
-- change staying readable.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e2160000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host216@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2160000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other216@example.test',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values
  ('e2161000-0000-4000-8000-00000000000a','multi_unit','[Host 216]','+254700216001',
   (select id from public.city where slug = 'nairobi'),'live', now(), now()),
  ('e2161000-0000-4000-8000-00000000000b','single_unit','[Host 216 other]','+254700216002',
   (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values
  ('e2161000-0000-4000-8000-00000000000a','e2160000-0000-4000-8000-000000000001','owner'),
  ('e2161000-0000-4000-8000-00000000000b','e2160000-0000-4000-8000-000000000002','owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id)
values ('e2162000-0000-4000-8000-00000000000a','e2161000-0000-4000-8000-00000000000a',
        'block-216','Block 216','apartment','Kilimani',(select id from public.city where slug = 'nairobi'));
insert into public.unit (id, host_id, property_id, name, label_public, address_line, city_id, handoff, status)
values ('e2163000-0000-4000-8000-00000000000a','e2161000-0000-4000-8000-00000000000a',
        'e2162000-0000-4000-8000-00000000000a','Studio 216','Studio 216','[Address]',
        (select id from public.city where slug = 'nairobi'),'lockbox','live');

/* A floor plan stored in the database before this change, and one already in
   Storage that the published guide uses. Written by the system. */
insert into public.host_unit_guide (unit_id) values ('e2163000-0000-4000-8000-00000000000a');
insert into public.host_unit_guide_asset (id, unit_id, kind, mime, digest, body)
values ('e2164000-0000-4000-8000-0000000000d1','e2163000-0000-4000-8000-00000000000a','plan','image/png',
        extensions.digest('\x89504e470d0a1a0a'::bytea, 'sha256'), '\x89504e470d0a1a0a'::bytea);
insert into storage.objects (bucket_id, name, metadata) values
  ('host-guide-assets',
   'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/plan/'
     || repeat('c', 64) || '.png',
   '{"mimetype": "image/png", "size": 1000}');
insert into public.host_unit_guide_asset (id, unit_id, kind, mime, digest, storage_path, size_bytes)
values ('e2164000-0000-4000-8000-0000000000c1','e2163000-0000-4000-8000-00000000000a','plan','image/png',
        decode(repeat('c', 64), 'hex'),
        'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/plan/'
          || repeat('c', 64) || '.png', 1000);

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
insert into t values
  ('dir', 'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/'),
  ('model', 'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/model/'
              || repeat('a', 64) || '.glb'),
  ('bad', 'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/plan/'
              || repeat('b', 64) || '.png'),
  ('big', 'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/plan/'
              || repeat('e', 64) || '.png'),
  ('published', 'e2161000-0000-4000-8000-00000000000a/e2163000-0000-4000-8000-00000000000a/plan/'
              || repeat('c', 64) || '.png');

-- ══════════════════════════════════════════ 1. the bucket

select ok(
  exists (select 1 from storage.buckets
           where id = 'host-guide-assets' and not public and file_size_limit = 12582912
             and allowed_mime_types @> array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp']
             and cardinality(allowed_mime_types) = 4),
  'host-guide-assets is private, 12 MB at most, and takes GLB, PNG, JPEG and WebP only.');

-- ══════════════════════════════════════════ 2. the host's own members add files

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2160000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('host-guide-assets', (select v from t where k = 'model'),
            'e2160000-0000-4000-8000-000000000001', '{"mimetype": "model/gltf-binary", "size": 9000000}')$$,
  'The host''s owner can upload a 3D model for their unit.');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('host-guide-assets', (select v from t where k = 'bad'),
            'e2160000-0000-4000-8000-000000000001', '{"mimetype": "image/png", "size": 1000}'),
           ('host-guide-assets', (select v from t where k = 'big'),
            'e2160000-0000-4000-8000-000000000001', '{"mimetype": "image/png", "size": 3000000}')$$,
  'And floor plans.');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('host-guide-assets', (select v from t where k = 'dir') || 'plan/plan.gif',
            'e2160000-0000-4000-8000-000000000001', '{"mimetype": "image/gif", "size": 1000}')$$,
  '42501', null, 'Only <sha256>.<glb|png|jpg|webp> names under plan/ or model/ are accepted.');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('host-guide-assets', (select v from t where k = 'dir') || 'model/' || repeat('f', 64) || '.png',
            'e2160000-0000-4000-8000-000000000001', '{"mimetype": "image/png", "size": 1000}')$$,
  '42501', null, 'A model must be a .glb.');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'host-guide-assets' and name like (select v from t where k = 'dir') || '%'),
  4, 'The owner can read every guide file of their unit.');

-- ══════════════════════════════════════════ 3. another host cannot write or read them

select set_config('request.jwt.claims',
  '{"sub":"e2160000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('host-guide-assets', (select v from t where k = 'dir') || 'model/' || repeat('d', 64) || '.glb',
            'e2160000-0000-4000-8000-000000000002', '{"mimetype": "model/gltf-binary", "size": 1000}')$$,
  '42501', null, 'Another host cannot upload into this unit''s folder.');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('host-guide-assets', 'e2161000-0000-4000-8000-00000000000b/e2163000-0000-4000-8000-00000000000a/model/'
              || repeat('d', 64) || '.glb',
            'e2160000-0000-4000-8000-000000000002', '{"mimetype": "model/gltf-binary", "size": 1000}')$$,
  '42501', null, 'Nor under its own host folder with this unit''s id.');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'host-guide-assets' and name like (select v from t where k = 'dir') || '%'
      and name <> (select v from t where k = 'published')),
  0, 'Another host cannot read this unit''s draft guide files.');
select throws_ok(
  $$select public.rpc_host_workspace_guide_asset_record('e2163000-0000-4000-8000-00000000000a', 0, 'model',
      (select v from t where k = 'model'), repeat('a', 64))$$,
  '42501', null, 'Nor attach one to its guide.');
select ok(
  public.rpc_host_workspace_guide_asset('e2164000-0000-4000-8000-0000000000d1') is null,
  'Nor read the guide''s files through the workspace.');

-- ══════════════════════════════════════════ 4. a signed-out visitor cannot either

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('host-guide-assets', (select v from t where k = 'dir') || 'model/' || repeat('9', 64) || '.glb',
            '{"mimetype": "model/gltf-binary", "size": 1000}')$$,
  '42501', null, 'A visitor cannot upload a guide file.');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'host-guide-assets'),
  0, 'And can read none while the guide is not published.');
reset role;

-- ══════════════════════════════════════════ 5. recording an uploaded file

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2160000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_host_workspace_guide_asset_record('e2163000-0000-4000-8000-00000000000a', 0, 'plan',
      (select v from t where k = 'big'), repeat('e', 64))$$,
  '22023', 'This guide file is too large.', 'A floor plan over 2 MB is refused.');
select throws_ok(
  $$select public.rpc_host_workspace_guide_asset_record('e2163000-0000-4000-8000-00000000000a', 0, 'plan',
      (select v from t where k = 'model'), repeat('a', 64))$$,
  '22023', null, 'A model''s path cannot be recorded as a floor plan.');
select throws_ok(
  $$select public.rpc_host_workspace_guide_asset_record('e2163000-0000-4000-8000-00000000000a', 0, 'model',
      (select v from t where k = 'dir') || 'model/' || repeat('7', 64) || '.glb', repeat('7', 64))$$,
  '22023', 'Upload the file again.', 'A file that never arrived cannot be recorded.');
select throws_ok(
  $$select public.rpc_host_workspace_guide_asset_record('e2163000-0000-4000-8000-00000000000a', 5, 'model',
      (select v from t where k = 'model'), repeat('a', 64))$$,
  '40001', null, 'A stale draft revision is refused, as for the multipart upload.');

select is(
  public.rpc_host_workspace_guide_asset_record('e2163000-0000-4000-8000-00000000000a', 0, 'model',
    (select v from t where k = 'model'), repeat('a', 64)),
  1, 'The owner attaches the uploaded model to the draft.');
insert into t select 'model_id', id::text from public.host_unit_guide_asset
  where storage_path = (select v from t where k = 'model');
reset role;

select is(
  (select (document ->> 'modelId') || ' / ' || revision::text from public.host_unit_guide
    where unit_id = 'e2163000-0000-4000-8000-00000000000a'),
  (select v from t where k = 'model_id') || ' / 1', 'The draft points at the new model.');
select is(
  (select mime || ' / ' || size_bytes::text || ' / ' || (body is null)::text from public.host_unit_guide_asset
    where id = (select v::uuid from t where k = 'model_id')),
  'model/gltf-binary / 9000000 / true', 'The asset keeps its Storage path, size and type, and no bytes.');
select is(
  (select count(*)::int from audit.audit_event
    where action = 'host.guide_asset_added' and target_id = 'e2163000-0000-4000-8000-00000000000a'),
  1, 'The upload is in the audit log.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2160000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  public.rpc_host_workspace_guide_asset((select v::uuid from t where k = 'model_id')),
  jsonb_build_object('mime', 'model/gltf-binary', 'path', (select v from t where k = 'model')),
  'The workspace reads a Storage file as its path.');
select is(
  public.rpc_host_workspace_guide_asset('e2164000-0000-4000-8000-0000000000d1'),
  jsonb_build_object('mime', 'image/png', 'base64', encode('\x89504e470d0a1a0a'::bytea, 'base64')),
  'A floor plan stored in the database before this change still reads as its bytes.');

-- ══════════════════════════════════════════ 6. removing a file

select set_config('storage.allow_delete_query', 'true', true);
with gone as (
  delete from storage.objects where bucket_id = 'host-guide-assets' and name = (select v from t where k = 'bad')
  returning 1)
insert into t select 'deleted_bad', count(*)::text from gone;
with gone as (
  delete from storage.objects where bucket_id = 'host-guide-assets' and name = (select v from t where k = 'model')
  returning 1)
insert into t select 'deleted_model', count(*)::text from gone;
reset role;

select is((select v from t where k = 'deleted_bad'), '1',
  'The owner can remove a file that failed its checks and was never recorded.');
select is((select v from t where k = 'deleted_model'), '0',
  'But not a file a guide asset records.');

-- ══════════════════════════════════════════ 7. a guest of the published guide

/* The guide is published with the Storage floor plan, and its QR card is placed. */
insert into public.host_unit_guide_version (id, unit_id, document)
values ('e2165000-0000-4000-8000-00000000000a','e2163000-0000-4000-8000-00000000000a',
        jsonb_build_object('articles', jsonb_build_array(jsonb_build_object('title', 'Wi-Fi')),
                           'planId', 'e2164000-0000-4000-8000-0000000000c1'));
update public.host_unit_guide set published_id = 'e2165000-0000-4000-8000-00000000000a'
 where unit_id = 'e2163000-0000-4000-8000-00000000000a';
set local session_replication_role = replica;
insert into public.property_qr (owner_type, owner_id, host_id, code, secret_hash, state, placed_confirmed_at)
values ('unit','e2163000-0000-4000-8000-00000000000a','e2161000-0000-4000-8000-00000000000a',
        'NXG-T2K4MW', 'test-216', 'placed', now());
set local session_replication_role = origin;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
/* Storage’s list API reads storage.objects under the caller’s role, so these
   counts are what a list of the bucket would return. */
select is(
  (select count(*)::int from storage.objects where bucket_id = 'host-guide-assets'),
  0, 'Without the QR code, a guest cannot read or list any guide file, even the published floor plan.');
select throws_ok(
  $$select count(*) from public.host_guide_asset_grant$$,
  '42501', null, 'Nor read or write the read grants directly.');
select ok(
  public.rpc_host_workspace_guide_asset_sign('e2164000-0000-4000-8000-0000000000c1', 'NXG-WRONG1') is null,
  'A wrong QR code gets nothing.');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'host-guide-assets'),
  0, 'And grants nothing.');
select is(
  public.rpc_host_workspace_guide_asset_sign('e2164000-0000-4000-8000-0000000000c1', 'NXG-T2K4MW'),
  jsonb_build_object('mime', 'image/png', 'path', (select v from t where k = 'published')),
  'With the QR code, the guest guide gets the published floor plan''s path to sign.');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'host-guide-assets' and name = (select v from t where k = 'published')),
  1, 'Then that file can be signed for the guest.');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'host-guide-assets' and name <> (select v from t where k = 'published')),
  0, 'And no other guide file, such as the draft''s model.');
select ok(
  public.rpc_host_workspace_guide_asset_sign((select v::uuid from t where k = 'model_id'), 'NXG-T2K4MW') is null,
  'The code does not reach the unpublished draft''s model.');
reset role;

select is(
  (select count(*)::int from public.host_guide_asset_grant
    where path = (select v from t where k = 'published')
      and expires_at > now() and expires_at <= now() + interval '60 seconds'),
  1, 'The grant is for that one path and lasts a minute.');
update public.host_guide_asset_grant set expires_at = now() - interval '1 second';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'host-guide-assets'),
  0, 'Once the grant has expired, the file is private again.');
reset role;

-- ══════════════════════════════════════════ 8. the audit registry

select is(
  (select count(*)::int from audit.action_registry
    where action in ('host.guide_asset_added', 'host.guide_draft', 'host.guide_publish',
                     'host.guide_unpublish', 'host.guide_restore')),
  5, 'Every guide action the upload and the draft save log is registered.');

select * from finish();
rollback;
