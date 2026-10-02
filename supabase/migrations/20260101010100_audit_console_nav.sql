-- The Audit log gets a door.
--
-- The module row has existed since the console was first laid out,
-- with a null href because nothing was behind it. There is now.

update public.console_module
   set href = '/audit'
 where key = 'audit';
