-- Finance has a door.
--
-- `console_module.finance` has had a null href since the rail was
-- first built, which the sidebar renders greyed — designed, not
-- reachable. Two of its seven tabs now exist, so it gets a link.
--
-- The ordering matters and has already cost something once this
-- week. A migration naming `/live` went to production before the
-- route did, and the rail happily offered a link to a 404 for as
-- long as it took to notice. The href is the last thing to move,
-- after the page is deployed.

update public.console_module
   set href = '/finance'
 where key = 'finance';

/*
 * The label said "weekly settlement" when that was the whole of
 * the plan. It is now one tab of seven, and a rail entry naming
 * one tab makes the others hard to find.
 */
update public.console_module
   set label = 'Finance'
 where key = 'finance';
