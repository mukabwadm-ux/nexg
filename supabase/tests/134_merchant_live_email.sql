-- The owner hears that the business is live, with the signed agreement
-- (20270131000500): one email per signed agreement, sent when the agreement
-- is signed and the business is live, whichever comes last; next steps for
-- the merchant's category; Send again only when it did not go; and a failure
-- never stops the signing.

begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.emails(p_merchant text) returns integer language sql as $f$
  select count(*)::int from public.notification_outbox
  where template = 'partner_merchant_live' and payload ->> 'merchant_id' = p_merchant
$f$;
create function pg_temp.steps(p_merchant text) returns jsonb language sql as $f$
  select payload #> '{content,steps}' from public.notification_outbox
  where template = 'partner_merchant_live' and payload ->> 'merchant_id' = p_merchant
  order by created_at desc limit 1
$f$;

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('a1340000-0000-4000-8000-0000000000a1'::uuid, 'owner.kitchen134@test.local'),
  ('a1340000-0000-4000-8000-0000000000a2'::uuid, 'ops134@test.local'),
  ('a1340000-0000-4000-8000-0000000000a3'::uuid, 'stranger134@test.local'),
  ('a1340000-0000-4000-8000-0000000000a4'::uuid, 'owner.salon134@test.local'),
  ('a1340000-0000-4000-8000-0000000000a5'::uuid, 'manager.salon134@test.local'),
  ('a1340000-0000-4000-8000-0000000000a6'::uuid, 'owner.tours134@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('a1340000-0000-4000-8000-0000000000b2', 'a1340000-0000-4000-8000-0000000000a2', 'ops134@test.local', 'Ops 134');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'a1340000-0000-4000-8000-0000000000b2', r.id, null,
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

/* NexG's signing details, as a super admin saves them. */
insert into public.merchant_agreement_signer (id, signatory_name, signatory_title, representative_name,
  representative_title, po_box, registered_office, email, phone, website, in_room_commission_pct,
  signature_path, signature_type, signature_sha256)
values ('a1340000-0000-4000-8000-0000000000e1', 'Amina CEO', 'Chief Executive', 'Brian Ops',
  'Head of Merchant Operations', '12345-00100', 'Example House, Nairobi', 'legal@nexg.test',
  '+254 700 000 000', 'www.nexg.test', 10, 'signer/a1340000-0000-4000-8000-0000000000e1.png',
  'image/png', repeat('b', 64));

/* A live restaurant, a salon not live yet, a live tour operator (all three
   applied through the form) and an older live shop with no owner account. */
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, went_live_at, explore_visible)
select x.id, x.legal, x.trading, x.category::public.merchant_category, x.contact, x.phone, x.email,
  (select id from public.city where slug = 'nairobi'), x.status::public.partner_status,
  case when x.status = 'live' then now() end, x.status = 'live'
from (values
  ('a1340000-0000-4000-8000-0000000000c1'::uuid, 'Mama Kitchen Limited', 'Mama''s Kitchen',
   'restaurants_food', 'Achieng Owner', '+254712134001', 'kitchen134@shop.example', 'live'),
  ('a1340000-0000-4000-8000-0000000000c2'::uuid, 'Glow Salon Limited', 'Glow Salon',
   'beauty', 'Njeri Owner', '+254712134002', 'salon134@shop.example', 'under_review'),
  ('a1340000-0000-4000-8000-0000000000c3'::uuid, 'Duka Groceries Limited', 'Duka Groceries',
   'groceries_essentials', 'Kamau Owner', '+254712134003', 'shop134@shop.example', 'live'),
  ('a1340000-0000-4000-8000-0000000000c4'::uuid, 'Safari Trails Limited', 'Safari Trails',
   'travel_tours', 'Wafula Owner', '+254712134004', 'tours134@shop.example', 'live')
) as x (id, legal, trading, category, contact, phone, email, status);

update public.merchant set accepting_orders = true where id = 'a1340000-0000-4000-8000-0000000000c3';

insert into public.merchant_user (merchant_id, user_id, role) values
  ('a1340000-0000-4000-8000-0000000000c1', 'a1340000-0000-4000-8000-0000000000a1', 'owner'),
  ('a1340000-0000-4000-8000-0000000000c2', 'a1340000-0000-4000-8000-0000000000a5', 'manager'),
  ('a1340000-0000-4000-8000-0000000000c2', 'a1340000-0000-4000-8000-0000000000a4', 'owner'),
  ('a1340000-0000-4000-8000-0000000000c4', 'a1340000-0000-4000-8000-0000000000a6', 'owner');

set local session_replication_role = replica;
insert into public.merchant_application (merchant_id, revision, payload, review_state,
  submitted_revision, submitted_at, approved_revision, reviewed_at)
select x.id, 1, x.payload::jsonb, 'approved', 1, now(), 1, now()
from (values
  ('a1340000-0000-4000-8000-0000000000c1'::uuid,
   '{"categoryId": "restaurants_food", "subcategories": [], "business": {"name": "Mama''s Kitchen",
     "firstName": "Achieng", "lastName": "Owner", "phone": "+254712134001", "email": "kitchen134@shop.example"}}'),
  ('a1340000-0000-4000-8000-0000000000c2'::uuid,
   '{"categoryId": "beauty", "subcategories": [], "business": {"name": "Glow Salon",
     "firstName": "Njeri", "lastName": "Owner", "phone": "+254712134002", "email": "salon134@shop.example"}}'),
  ('a1340000-0000-4000-8000-0000000000c4'::uuid,
   '{"categoryId": "travel_tours", "subcategories": [], "business": {"name": "Safari Trails",
     "firstName": "Wafula", "lastName": "Owner", "phone": "+254712134004", "email": "tours134@shop.example"}}')
) as x (id, payload);
set local session_replication_role = origin;

insert into public.merchant_agreement_acceptance (id, merchant_id, category, agreement_id, version, accepted_by)
select x.id, x.merchant, x.category, a.id, a.version, x.who
from (values
  ('a1340000-0000-4000-8000-0000000000d1'::uuid, 'a1340000-0000-4000-8000-0000000000c1'::uuid,
   'restaurants_food', 'a1340000-0000-4000-8000-0000000000a1'::uuid),
  ('a1340000-0000-4000-8000-0000000000d2'::uuid, 'a1340000-0000-4000-8000-0000000000c2'::uuid,
   'beauty', 'a1340000-0000-4000-8000-0000000000a4'::uuid),
  ('a1340000-0000-4000-8000-0000000000d3'::uuid, 'a1340000-0000-4000-8000-0000000000c3'::uuid,
   'groceries_essentials', 'a1340000-0000-4000-8000-0000000000a2'::uuid),
  ('a1340000-0000-4000-8000-0000000000d4'::uuid, 'a1340000-0000-4000-8000-0000000000c4'::uuid,
   'travel_tours', 'a1340000-0000-4000-8000-0000000000a6'::uuid)
) as x (id, merchant, category, who)
cross join lateral public.fn_merchant_agreement_for_category(x.category) a;

insert into public.merchant_agreement_party (merchant_id, legal_name, registration_number, kra_pin,
  address, signatory_name, signatory_title, representative_name, representative_title, principal_name)
values ('a1340000-0000-4000-8000-0000000000c1', 'Mama Kitchen Limited', 'PVT-MAMA134', 'P051234567X',
  'Shop 4, Ngong Road, Nairobi', 'Achieng Owner', 'Director', 'Achieng Owner', 'Director',
  'Achieng Owner');

/* The PDF the console uploaded before recording it. */
insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
  ('merchant-agreements',
   'signed/a1340000-0000-4000-8000-0000000000c1/a1340000-0000-4000-8000-0000000000f1.pdf',
   'a1340000-0000-4000-8000-0000000000a2', 'a1340000-0000-4000-8000-0000000000a2',
   '{"size": 84000, "mimetype": "application/pdf"}');

/* A signed copy recorded straight in the table, as the console records one. */
create function pg_temp.sign(p_merchant text, p_acceptance text, p_reference text) returns void
language sql as $f$
  insert into public.merchant_agreement_signed (merchant_id, acceptance_id, agreement_id, version,
    signer_id, storage_path, sha256, bytes, pages, reference, template_version, effective_on, details)
  select x.merchant_id, x.id, x.agreement_id, x.version, 'a1340000-0000-4000-8000-0000000000e1',
    'signed/' || x.merchant_id || '/' || gen_random_uuid() || '.pdf', repeat('d', 64), 90000, 16,
    p_reference, '1+abc', current_date, '{}'
  from public.merchant_agreement_acceptance x where x.id = p_acceptance::uuid
$f$;

-- ------------------------------------------------------------------ wiring

select results_eq(
  $$select action collate "C", module, default_severity::text, needs_review, pii_fields
    from audit.action_registry
    where action in ('merchant.live_email_queued', 'merchant.live_email_resent')
    order by 1$$,
  $$values ('merchant.live_email_queued' collate "C", 'merchants', 'info', false, '{}'::text[]),
           ('merchant.live_email_resent', 'merchants', 'notice', false, '{}'::text[])$$,
  'both actions are registered under Merchants');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where finding ilike '%live_email%' or finding ilike '%merchant_live%'),
  0,
  'the wiring check finds nothing wrong with the live email');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.merchant_live_email'::regclass)
    and not has_table_privilege('authenticated', 'public.merchant_live_email', 'select')
    and not has_table_privilege('anon', 'public.merchant_live_email', 'select'),
  'the record has row-level security and nobody signed in reads it directly');

select ok(
  not has_function_privilege('anon', 'public.rpc_merchant_live_email_resend(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.rpc_merchant_live_email(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.fn_merchant_live_email_queue(uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.fn_merchant_live_next_steps(uuid)', 'execute'),
  'anon reaches neither RPC, and nobody signed in queues an email directly');

-- ------------------------------------------------- signing a live business

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(
  public.rpc_merchant_agreement_sign_record('a1340000-0000-4000-8000-0000000000c1',
    'a1340000-0000-4000-8000-0000000000d1', 'a1340000-0000-4000-8000-0000000000e1',
    'signed/a1340000-0000-4000-8000-0000000000c1/a1340000-0000-4000-8000-0000000000f1.pdf',
    repeat('c', 64), 16, 'NXG-MA-KITCHEN134', '1+abc', current_date, '{}') ->> 'reference',
  'NXG-MA-KITCHEN134',
  'merchant staff sign the live restaurant''s agreement');

reset role;

select results_eq(
  $$select channel, recipient, template, subject, status from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c1'$$,
  $$values ('email', 'owner.kitchen134@test.local', 'partner_merchant_live',
            'Congratulations! Mama''s Kitchen is live on NexG', 'pending')$$,
  'signing a live business''s agreement queues one email, to the owner''s sign-in address');

select is(
  (select payload -> 'attachments' from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c1'),
  jsonb_build_array(jsonb_build_object('bucket', 'merchant-agreements',
    'path', 'signed/a1340000-0000-4000-8000-0000000000c1/a1340000-0000-4000-8000-0000000000f1.pdf',
    'filename', 'NexG-merchant-agreement-Mama-s-Kitchen.pdf', 'sha256', repeat('c', 64),
    'bytes', 84000)),
  'it names the signed PDF to attach, its checksum and a readable file name');

select is(
  pg_temp.steps('a1340000-0000-4000-8000-0000000000c1'),
  '["Add your menu in Offerings: each dish with its price and a photo, then publish it.",
    "Check your opening hours in Availability, so customers order only while you are open.",
    "Add your logo and a banner photo in Business, so customers recognise you.",
    "When you are ready for orders, press Start taking orders on your dashboard Home."]'::jsonb,
  'a restaurant is told to add its menu, check its hours, add its logo and start taking orders');

select ok(
  (select body like 'Hi Achieng,%'
      and body like '%is now live, and customers can find you on NexG.%'
      and body like '%https://nexgapp.com/merchant/offerings%'
      and body like '%(reference NXG-MA-KITCHEN134)%'
      and payload #>> '{content,title}' = 'Congratulations! Mama''s Kitchen is live'
      and payload #>> '{content,action,url}' = 'https://nexgapp.com/merchant'
      and payload ->> 'from' = 'NexG Partners <info@nexgapp.com>'
   from public.notification_outbox
   where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c1'),
  'the text greets the owner, links each step and names the agreement; the design gets the same, from the partner sender');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'merchant.live_email_queued' and actor_type = 'system'
      and target_id = 'a1340000-0000-4000-8000-0000000000c1'
      and after ->> 'status' = 'queued' and after ->> 'recipient' = 'owner_sign_in'),
  1,
  'queuing it is in the audit trail, without the address');

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(
  (select jsonb_build_object('state', s -> 'state', 'recipient', s -> 'recipient',
     'source', s -> 'recipient_source', 'can_resend', s -> 'can_resend')
   from public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c1') s),
  '{"state": "waiting", "recipient": "o•••@test.local", "source": "owner_sign_in", "can_resend": false}'::jsonb,
  'staff see it waiting to go out, to a masked address, with Send again closed');

select throws_ok(
  $$select public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c1')$$,
  '55000', 'The email is still waiting to go out. Try again if it fails.',
  'Send again is refused while it waits');

-- -------------------------------------------------------- never a second one

select is(
  public.rpc_merchant_agreement_sign_record('a1340000-0000-4000-8000-0000000000c1',
    'a1340000-0000-4000-8000-0000000000d1', 'a1340000-0000-4000-8000-0000000000e1',
    'signed/a1340000-0000-4000-8000-0000000000c1/a1340000-0000-4000-8000-0000000000f1.pdf',
    repeat('c', 64), 16, 'NXG-MA-KITCHEN134', '1+abc', current_date, '{}') ->> 'reference',
  'NXG-MA-KITCHEN134',
  'recording the same signed copy again, as a retry or a reload does, changes nothing');

reset role;

select is(pg_temp.emails('a1340000-0000-4000-8000-0000000000c1'), 1,
  'and queues no second email');

update public.merchant set status = 'paused' where id = 'a1340000-0000-4000-8000-0000000000c1';
update public.merchant set status = 'live' where id = 'a1340000-0000-4000-8000-0000000000c1';

select is(pg_temp.emails('a1340000-0000-4000-8000-0000000000c1'), 1,
  'pausing the business and taking it live again sends nothing more');

select is(
  public.fn_merchant_live_email_queue(
    (select id from public.merchant_agreement_signed
      where merchant_id = 'a1340000-0000-4000-8000-0000000000c1')) ->> 'status',
  'already',
  'a second automatic try finds it dealt with');

select public.rpc_outbox_sent(
  (select id from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c1'),
  'resend', 'test-ref-134');

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c1') ->> 'state', 'sent',
  'once delivered, staff see it sent');

select throws_ok(
  $$select public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c1')$$,
  '23505', null,
  'and Send again is refused: one email per signed agreement');

-- -------------------------------------------- signed first, live afterwards

reset role;
select pg_temp.sign('a1340000-0000-4000-8000-0000000000c2', 'a1340000-0000-4000-8000-0000000000d2',
  'NXG-MA-SALON134');

select is(pg_temp.emails('a1340000-0000-4000-8000-0000000000c2'), 0,
  'an agreement signed for a business that is not live yet sends nothing');

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c2') ->> 'state', 'not_live',
  'staff see it will go when the business goes live');

select throws_ok(
  $$select public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c2')$$,
  '55000',
  'The business is not live, so the email would not be true. It goes out by itself when the business goes live.',
  'and cannot send it early');

reset role;
update public.merchant set status = 'live', went_live_at = now(), explore_visible = true
where id = 'a1340000-0000-4000-8000-0000000000c2';

select results_eq(
  $$select recipient, template from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c2'$$,
  $$values ('owner.salon134@test.local', 'partner_merchant_live')$$,
  'going live sends it then, once, to the owner and not the manager');

select is(
  pg_temp.steps('a1340000-0000-4000-8000-0000000000c2'),
  '["Add your services in Offerings, with prices and how long each takes, then publish them.",
    "Set your opening hours in Availability, and add who customers can book under Resources and bookings.",
    "Add your logo and a banner photo in Business, so customers recognise you.",
    "When you are ready for orders, press Start taking orders on your dashboard Home."]'::jsonb,
  'a salon is told to add its services and who customers can book');

-- ------------------------------------------- failed after its retries: send again

select public.rpc_outbox_failed(
  (select id from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c2'),
  'The mailbox does not exist.', false);

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(
  (select jsonb_build_object('state', s -> 'state', 'last_error', s -> 'last_error', 'can_resend', s -> 'can_resend')
   from public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c2') s),
  '{"state": "failed", "last_error": "The mailbox does not exist.", "can_resend": true}'::jsonb,
  'a send that failed for good shows why, with Send again open');

select is(
  public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c2', 'Owner fixed their mailbox') ->> 'status',
  'queued',
  'Send again queues it once more');

select throws_ok(
  $$select public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c2')$$,
  '55000', null,
  'and pressing it twice does not queue a third');

reset role;

select is(
  (select array_agg(status order by status) from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c2'),
  array['abandoned', 'pending'],
  'the failed email stays on record beside the new one');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'merchant.live_email_resent' and actor_id = 'a1340000-0000-4000-8000-0000000000b2'
      and target_id = 'a1340000-0000-4000-8000-0000000000c2' and reason = 'Owner fixed their mailbox'),
  1,
  'Send again is in the audit trail with who pressed it and why');

-- ---------------------------------- switched off, an older merchant, no owner

update public.email_route set enabled = false where key = 'partner_updates';
select pg_temp.sign('a1340000-0000-4000-8000-0000000000c3', 'a1340000-0000-4000-8000-0000000000d3',
  'NXG-MA-DUKA134');

select is(pg_temp.emails('a1340000-0000-4000-8000-0000000000c3'), 0,
  'with partner emails switched off nothing is queued');

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(
  (select jsonb_build_object('state', s -> 'state', 'reason', s -> 'reason', 'can_resend', s -> 'can_resend')
   from public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c3') s),
  '{"state": "skipped", "reason": "Partner emails are switched off in Settings › Email routing (partner_updates).", "can_resend": true}'::jsonb,
  'staff see it was skipped and why');

reset role;
update public.email_route set enabled = true where key = 'partner_updates';
set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(
  public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c3') ->> 'recipient',
  'business_email',
  'once switched back on, Send again queues it');

reset role;

select results_eq(
  $$select recipient from public.notification_outbox
    where payload ->> 'merchant_id' = 'a1340000-0000-4000-8000-0000000000c3'$$,
  $$values ('shop134@shop.example')$$,
  'a business with no owner account gets it at its business email');

select is(
  pg_temp.steps('a1340000-0000-4000-8000-0000000000c3'),
  '["Add what you sell in Catalogue, with prices and photos, and check it is all there.",
    "Check your opening hours in Hours."]'::jsonb,
  'an older merchant is pointed at Catalogue and Hours, and one already taking orders is not told to start');

select is(
  (select sends from public.merchant_live_email where merchant_id = 'a1340000-0000-4000-8000-0000000000c3'),
  2::smallint,
  'the record counts both tries');

-- ------------------------------------------- a failure never stops the signing

alter table public.notification_outbox
  add constraint t134_refuse check (template <> 'partner_merchant_live') not valid;

select lives_ok(
  $$select pg_temp.sign('a1340000-0000-4000-8000-0000000000c4', 'a1340000-0000-4000-8000-0000000000d4',
    'NXG-MA-SAFARI134')$$,
  'when queuing the email fails, the agreement is still signed');

select is(
  (select count(*)::int from public.merchant_agreement_signed
    where merchant_id = 'a1340000-0000-4000-8000-0000000000c4'),
  1,
  'and the signed copy is on record');

select ok(
  (select status = 'error' and reason like '%t134_refuse%' from public.merchant_live_email
    where merchant_id = 'a1340000-0000-4000-8000-0000000000c4'),
  'the failure is kept on the email''s record');

alter table public.notification_outbox drop constraint t134_refuse;

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a2');

select is(
  (select jsonb_build_object('state', s -> 'state', 'can_resend', s -> 'can_resend')
   from public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c4') s),
  '{"state": "error", "can_resend": true}'::jsonb,
  'staff see it did not go and can send it again');

select is(
  public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c4') ->> 'status',
  'queued',
  'and Send again queues it');

reset role;

select is(
  pg_temp.steps('a1340000-0000-4000-8000-0000000000c4'),
  '["Add your tours and trips in Offerings, with prices, then publish them.",
    "Add your departures in Availability: under Resources and bookings, add each one as a session with its seats.",
    "Add your logo and a banner photo in Business, so customers recognise you.",
    "When you are ready for orders, press Start taking orders on your dashboard Home."]'::jsonb,
  'a tour operator is told to add its tours and each departure');

-- ------------------------------------------------------------------ strangers

set local role authenticated;
select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a3');

select throws_ok(
  $$select public.rpc_merchant_live_email('a1340000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Merchant staff only.',
  'somebody else cannot see where the email stands');

select pg_temp.as_user('a1340000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$select public.rpc_merchant_live_email_resend('a1340000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Merchant staff only.',
  'nor can the merchant send it to itself again');

reset role;

select * from finish();
rollback;
