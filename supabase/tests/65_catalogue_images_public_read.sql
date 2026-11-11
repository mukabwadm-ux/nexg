-- Menu photos: a visitor may read the photo of an item on a live, visible
-- merchant, and nothing else, without being able to read the merchant table.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible, went_live_at)
values ('6c000000-0000-4000-8000-000000000001', 'Photo Test Ltd', 'Photo Test Kitchen', 'restaurant',
        'Test Contact', '+254700000951', 'photo1@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, now() - interval '1 day'),
       ('6c000000-0000-4000-8000-000000000002', 'Photo Paused Ltd', 'Photo Test Paused', 'restaurant',
        'Test Contact', '+254700000952', 'photo2@example.test',
        (select id from public.city where slug = 'nairobi'), 'paused', true, now() - interval '1 day');

insert into public.catalogue_section (id, merchant_id, name, sort)
values ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000001', 'Mains', 1),
       ('6c000000-0000-4000-8000-000000000012', '6c000000-0000-4000-8000-000000000002', 'Mains', 1);

insert into public.catalogue_item (merchant_id, section_id, name, price_kes, photo_path, available)
values ('6c000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000011', 'Pizza', 900,
        '6c000000-0000-4000-8000-000000000001/pizza.jpg', true),
       ('6c000000-0000-4000-8000-000000000002', '6c000000-0000-4000-8000-000000000012', 'Pizza', 900,
        '6c000000-0000-4000-8000-000000000002/pizza.jpg', true);

set local role anon;

select ok(
  authz.catalogue_image_is_public('6c000000-0000-4000-8000-000000000001/pizza.jpg'),
  'A visitor can see the photo of an item on a live merchant.');

select ok(
  not authz.catalogue_image_is_public('6c000000-0000-4000-8000-000000000002/pizza.jpg'),
  'Not the photo of an item on a paused merchant.');

select ok(
  not authz.catalogue_image_is_public('6c000000-0000-4000-8000-000000000001/other.jpg'),
  'Not a file that is no item''s photo.');

select throws_ok(
  $$ select 1 from public.merchant limit 1 $$,
  '42501', null,
  'The visitor still cannot read the merchant table itself.');

reset role;
select * from finish();
rollback;
