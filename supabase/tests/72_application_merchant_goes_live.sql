-- A new-form merchant goes live once its application is approved
-- (20261218000100). Before that migration, the application write guard
-- refused rpc_merchant_go_live for every merchant with an application.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '71000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'golive.ops@example.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('71000000-0000-4000-8000-0000000000b1', '71000000-0000-4000-8000-0000000000a1',
        'golive.ops@example.test', 'Go Live Ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select '71000000-0000-4000-8000-0000000000b1', r.id, c.id, '71000000-0000-4000-8000-0000000000b1'
from public.role r cross join public.city c
where r.key = 'merchant_ops' and c.slug = 'nairobi';

-- The merchant row mirrors the application's captured identity, as
-- fn_merchant_application_mirror leaves it.
insert into public.merchant (
  id, legal_name, trading_name, category, subcategory, contact_name, contact_phone,
  contact_email, city_id, status
)
select '71000000-0000-4000-8000-0000000000c1', 'Glow Applied Ltd', 'Glow Applied', 'beauty',
       'makeup', 'Wanjiru Kamau', '+254700000771', 'glow.applied@example.test', c.id, 'under_review'
from public.city c where c.slug = 'nairobi';

insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('71000000-0000-4000-8000-0000000000c1', 'Main', '[Address]', true);

insert into public.merchant_application (
  merchant_id, revision, payload, review_state, submitted_revision, submitted_at
)
values (
  '71000000-0000-4000-8000-0000000000c1', 1,
  jsonb_build_object(
    'business', jsonb_build_object(
      'name', 'Glow Applied', 'firstName', 'Wanjiru', 'lastName', 'Kamau',
      'phone', '+254700000771', 'email', 'glow.applied@example.test'),
    'categoryId', 'beauty',
    'subcategories', jsonb_build_array('makeup')),
  'pending', 1, now()
);

insert into public.document (
  owner_type, owner_id, requirement_id, storage_path, mime, size_bytes, status,
  reviewed_by, reviewed_at
)
select 'merchant', '71000000-0000-4000-8000-0000000000c1', q.id, 'golive/' || q.id || '.pdf',
       'application/pdf', 1000, 'verified', '71000000-0000-4000-8000-0000000000b1', now()
from public.fn_merchant_required_docs('71000000-0000-4000-8000-0000000000c1') q;

-- -------------------------------------------------------- before approval

select throws_ok(
  $$update public.merchant set status = 'live' where id = '71000000-0000-4000-8000-0000000000c1'$$,
  '42501',
  'Use application commands; operational activation is not available.',
  'nothing makes an unapproved application live directly'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_go_live('71000000-0000-4000-8000-0000000000c1', 'Checked')$$,
  '23514',
  'Approve this merchant''s application first (Merchants › Applications). Its current review state is pending.',
  'Take live on a pending application says to approve it first'
);

reset role;

-- --------------------------------------------------------- after approval

update public.merchant_application
set review_state = 'approved', approved_revision = revision,
    reviewed_by = '71000000-0000-4000-8000-0000000000b1', reviewed_at = now()
where merchant_id = '71000000-0000-4000-8000-0000000000c1';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_go_live('71000000-0000-4000-8000-0000000000c1', 'Checked')$$,
  'merchant ops take an approved application live'
);

select lives_ok(
  $$select public.rpc_merchant_set_controls('71000000-0000-4000-8000-0000000000c1',
      p_explore_visible => true)$$,
  'and can show the live merchant in Discovery, as the console does next'
);

reset role;

select is(
  (select status::text from public.merchant where id = '71000000-0000-4000-8000-0000000000c1'),
  'live',
  'the merchant is live'
);

select isnt(
  (select went_live_at from public.merchant where id = '71000000-0000-4000-8000-0000000000c1'),
  null,
  'with the time it went live'
);

select is(
  (select went_live_by from public.merchant where id = '71000000-0000-4000-8000-0000000000c1'),
  '71000000-0000-4000-8000-0000000000b1'::uuid,
  'and who took it live'
);

select is(
  (select explore_visible from public.merchant where id = '71000000-0000-4000-8000-0000000000c1'),
  true,
  'and it is shown in Discovery'
);

select is(
  (select e.before ->> 'status'
   from audit.audit_event e
   where e.action = 'merchant.went_live'
     and e.target_id = '71000000-0000-4000-8000-0000000000c1'),
  'under_review',
  'the audit trail records the status it actually left'
);

select is(
  (select to_status::text from public.merchant_status_change
   where merchant_id = '71000000-0000-4000-8000-0000000000c1'
   order by created_at desc limit 1),
  'live',
  'and the status history has the change'
);

select throws_ok(
  $$update public.merchant set trading_name = 'Forged' where id = '71000000-0000-4000-8000-0000000000c1'$$,
  '42501',
  'Use application commands; operational activation is not available.',
  'a live merchant''s captured identity still cannot be overwritten'
);

select lives_ok(
  $$update public.merchant set accepting_orders = true where id = '71000000-0000-4000-8000-0000000000c1'$$,
  'an approved live merchant may take orders'
);

update public.merchant set accepting_orders = false
where id = '71000000-0000-4000-8000-0000000000c1';

-- ------------------------------------- an edit waiting for review, while live

-- What rpc_merchant_application_save leaves after an approved merchant edits
-- its application: a new revision, pending, not yet resubmitted.
update public.merchant_application
set revision = 2, review_state = 'pending'
where merchant_id = '71000000-0000-4000-8000-0000000000c1';

select lives_ok(
  $$update public.merchant set explore_visible = false where id = '71000000-0000-4000-8000-0000000000c1'$$,
  'a live merchant whose edit waits for review can still be changed'
);

select throws_ok(
  $$update public.merchant set accepting_orders = true where id = '71000000-0000-4000-8000-0000000000c1'$$,
  '42501',
  'Use application commands; operational activation is not available.',
  'but it cannot start taking orders until the edit is approved'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_set_deactivated(
      '71000000-0000-4000-8000-0000000000c1', true, 'Checking the new details')$$,
  'staff can still deactivate it'
);

reset role;

select is(
  (select status::text from public.merchant where id = '71000000-0000-4000-8000-0000000000c1'),
  'paused',
  'which pauses it'
);

-- ----------------------------------------- a second merchant, not yet live

insert into public.merchant (
  id, legal_name, trading_name, category, subcategory, contact_name, contact_phone,
  contact_email, city_id, status
)
select '71000000-0000-4000-8000-0000000000c2', 'Glow Edited Ltd', 'Glow Edited', 'beauty',
       'makeup', 'Achieng Otieno', '+254700000772', 'glow.edited@example.test', c.id, 'under_review'
from public.city c where c.slug = 'nairobi';

insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('71000000-0000-4000-8000-0000000000c2', 'Main', '[Address]', true);

-- Approved at revision 1, then edited: revision 2 waits for review.
insert into public.merchant_application (
  merchant_id, revision, payload, review_state, submitted_revision, submitted_at,
  approved_revision
)
values (
  '71000000-0000-4000-8000-0000000000c2', 2,
  jsonb_build_object(
    'business', jsonb_build_object(
      'name', 'Glow Edited', 'firstName', 'Achieng', 'lastName', 'Otieno',
      'phone', '+254700000772', 'email', 'glow.edited@example.test'),
    'categoryId', 'beauty',
    'subcategories', jsonb_build_array('makeup')),
  'approved', 2, now(), 1
);

insert into public.document (
  owner_type, owner_id, requirement_id, storage_path, mime, size_bytes, status,
  reviewed_by, reviewed_at
)
select 'merchant', '71000000-0000-4000-8000-0000000000c2', q.id, 'golive2/' || q.id || '.pdf',
       'application/pdf', 1000, 'verified', '71000000-0000-4000-8000-0000000000b1', now()
from public.fn_merchant_required_docs('71000000-0000-4000-8000-0000000000c2') q;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_go_live('71000000-0000-4000-8000-0000000000c2', null)$$,
  '23514',
  'Approve this merchant''s application first (Merchants › Applications). Its current review state is a newer revision waiting for review.',
  'an approval of an older revision does not take the merchant live'
);

reset role;

select is(
  (select status::text from public.merchant where id = '71000000-0000-4000-8000-0000000000c2'),
  'under_review',
  'so it stays under review'
);

select * from finish();
rollback;
