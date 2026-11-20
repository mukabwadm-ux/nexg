-- Every app email group sends from NEXG Concierge <no-reply@nexgapp.com>, replies to
-- info@nexgapp.com (owner, 20 Nov 2026). The same sender Supabase Auth's SMTP uses.
-- Groups stay as they are: on or off.

update public.email_route
   set from_name = 'NEXG Concierge',
       from_email = 'no-reply@nexgapp.com',
       reply_to = 'info@nexgapp.com'
 where key in ('app_account', 'app_orders', 'app_bookings', 'app_stays', 'app_support', 'app_privacy');
