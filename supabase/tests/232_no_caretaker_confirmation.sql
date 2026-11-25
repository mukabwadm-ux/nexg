-- No caretaker confirmation (20270320000100): the host using the app is the
-- caretaker, so a unit whose handoff is "caretaker" or "leave with the askari"
-- is ready, goes live and can be published without caretaker_confirmed_at.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','e2320000-0000-4000-8000-000000000001',
        'authenticated','authenticated','host232@example.test',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('e2321000-0000-4000-8000-00000000000a','multi_unit','[Host 232]','+254700232001',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values ('e2321000-0000-4000-8000-00000000000a','e2320000-0000-4000-8000-000000000001','owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id, photos)
values ('e2322000-0000-4000-8000-00000000000a','e2321000-0000-4000-8000-00000000000a',
        'block-232','Block 232','apartment_block','Kilimani',(select id from public.city where slug = 'nairobi'),
        '[{"path":"e2321000-0000-4000-8000-00000000000a/e2322000-0000-4000-8000-00000000000a/front.jpg"}]'::jsonb);

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;

-- ══════════════════════════════════════════ 1. a caretaker unit, saved by its host

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2320000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into t (k, v) select 'unit', (public.rpc_unit_upsert_guarded(
    'e2321000-0000-4000-8000-00000000000a',
    jsonb_build_object('name', 'Studio 232', 'label_public', 'Studio 232',
                       'address_line', '[Address], Kilimani', 'handoff', 'caretaker',
                       'caretaker_name', '[Caretaker]',
                       'property_id', 'e2322000-0000-4000-8000-00000000000a',
                       'bedrooms', 1, 'max_guests', 2, 'nightly_rate_kes', 5000))).id::text
$$, 'A host saves a unit whose handoff is the caretaker.');

reset role;
select set_config('request.jwt.claims', '{}', true);

select is((select status::text || ' / ' || (caretaker_confirmed_at is null)::text
             from public.unit where id = (select v::uuid from t where k = 'unit')),
  'live / true',
  'It goes live on save with no caretaker confirmation.');

select ok(
  not ((select readiness from public.unit where id = (select v::uuid from t where k = 'unit'))
       ? 'contact_confirmed'),
  'Its readiness has no caretaker confirmation to wait on.');

select is((select contact_confirmed::text || ' / ' || ready_of::text
             from public.unit_readiness_v where unit_id = (select v::uuid from t where k = 'unit')),
  'true / 4',
  'The readiness view counts four checks and never shows the contact as missing.');

select is((select step_handoff from public.host_setup_progress_v
            where host_id = 'e2321000-0000-4000-8000-00000000000a'),
  true,
  'The delivery handoff setup step is done once the rule is set.');

select is(public.fn_unit_listing_missing((select v::uuid from t where k = 'unit')),
  '{}'::text[],
  'The listing checklist has nothing missing.');

select is(public.fn_unit_listing_ready((select v::uuid from t where k = 'unit')), true,
  'So the unit is ready to list.');

-- ══════════════════════════════════════════ 2. and publishable

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2320000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into t (k, v)
  select 'publish', public.rpc_unit_set_published((select v::uuid from t where k = 'unit'), true)::text
$$, 'The host publishes it with no caretaker confirmation.');

reset role;
select set_config('request.jwt.claims', '{}', true);

select is((select (v::jsonb ->> 'published') || '/' || (v::jsonb ->> 'listed') || '/' || (v::jsonb ->> 'missing')
             from t where k = 'publish'),
  'true/true/[]',
  'It is published and listed, with nothing missing.');

-- ══════════════════════════════════════════ 3. the table and the attention cards

insert into public.unit (id, host_id, property_id, name, address_line, city_id, handoff)
values ('e2323000-0000-4000-8000-00000000000b','e2321000-0000-4000-8000-00000000000a',
        'e2322000-0000-4000-8000-00000000000a','Askari unit','[Address]',
        (select id from public.city where slug = 'nairobi'),'leave_with_askari');

select lives_ok($$
  update public.unit set status = 'live' where id = 'e2323000-0000-4000-8000-00000000000b'
$$, 'A unit left with the askari can go live without a confirmed askari.');

update public.unit set caretaker_token_sent_at = now() - interval '3 days'
 where id = 'e2323000-0000-4000-8000-00000000000b';

select is((select count(*)::int from public.host_attention_v
            where host_id = 'e2321000-0000-4000-8000-00000000000a'
              and kind = 'caretaker_unconfirmed'),
  0,
  'No attention card asks the host to chase a caretaker confirmation.');

select * from finish();
rollback;
