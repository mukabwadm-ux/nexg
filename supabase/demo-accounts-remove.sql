-- Removes everything supabase/demo-accounts.sql created, and nothing else.
--
-- Run by hand in the Supabase SQL editor. Rows are found by the fixed ids
-- and the demo emails that script uses (live.*, new.*, customer.demo
-- @nexgapp.com). Any order or booking a demo account made is kept, with
-- its account link cleared by the usual foreign keys.

begin;

delete from public.document
 where owner_type = 'merchant'
   and owner_id in (select md5('demo-merchant-' || kind || '-' || cc.category::text)::uuid
                      from public.category_config cc cross join (values ('live'), ('new')) k(kind));

-- Applications from demo-accounts-workspace.sql. Submission snapshots are
-- immutable for real applicants; the guard is lifted only for this delete,
-- inside this transaction, and only demo merchants' rows are touched.
alter table public.merchant_application_submission
  disable trigger merchant_application_submission_immutable;
delete from public.merchant_application_submission
 where merchant_id in (select md5('demo-merchant-' || kind || '-' || cc.category::text)::uuid
                         from public.category_config cc cross join (values ('live'), ('new')) k(kind));
alter table public.merchant_application_submission
  enable trigger merchant_application_submission_immutable;
delete from public.merchant_application
 where merchant_id in (select md5('demo-merchant-' || kind || '-' || cc.category::text)::uuid
                         from public.category_config cc cross join (values ('live'), ('new')) k(kind));

delete from public.merchant
 where id in (select md5('demo-merchant-' || kind || '-' || cc.category::text)::uuid
                from public.category_config cc cross join (values ('live'), ('new')) k(kind));

delete from public.unit where host_id in (md5('demo-host-live')::uuid, md5('demo-host-new')::uuid);
delete from public.property where host_id in (md5('demo-host-live')::uuid, md5('demo-host-new')::uuid);
delete from public.host where id in (md5('demo-host-live')::uuid, md5('demo-host-new')::uuid);

delete from public.document
 where owner_type = 'rider' and owner_id in (md5('demo-rider-live')::uuid, md5('demo-rider-new')::uuid);
delete from public.rider where id in (md5('demo-rider-live')::uuid, md5('demo-rider-new')::uuid);

delete from public.guest
 where user_id in (select id from auth.users where email = 'customer.demo@nexgapp.com');

delete from auth.users
 where email like '%@nexgapp.com'
   and (email ~ '^(live|new)\.' or email = 'customer.demo@nexgapp.com')
   and raw_user_meta_data ->> 'demo' = 'true';

commit;
