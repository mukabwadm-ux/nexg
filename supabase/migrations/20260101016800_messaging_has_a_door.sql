-- Messaging has a door.
--
-- Last, and in its own migration, because the rail entry must
-- not name a route before the route is deployed. This console
-- has served a 404 from exactly that mistake once already.

update public.console_module
   set href = '/messaging',
       label = 'Messaging'
 where key = 'messaging';
