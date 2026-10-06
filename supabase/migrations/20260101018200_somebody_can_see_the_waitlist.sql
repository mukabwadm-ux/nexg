-- Somebody can see the waitlist.
--
-- `waitlist_signup` has been collecting people since the site
-- went up and nothing in the product reads it. Every one of
-- those rows is a person who typed their email in and was told
-- they would hear from us.
--
-- The useful shape is not the list. It is the list next to the
-- status of the city they are waiting for, because the two
-- together answer a question neither answers alone: are we
-- making people wait for a city we have already opened?

create or replace view waitlist_city_v
with (security_invoker = true) as
select
  c.id as city_id,
  c.name as city_name,
  c.status::text as city_status,
  count(w.id)::bigint as waiting,
  count(w.id) filter (where w.consent_marketing)::bigint as contactable,
  count(w.id) filter (
    where w.created_at > now() - interval '30 days')::bigint as last_30_days,
  min(w.created_at) as first_signup,
  max(w.created_at) as latest_signup,
  /*
   * The row that matters. Somebody waiting for a city that is
   * already live was told to wait by a form that never checked,
   * and they are still waiting now.
   */
  c.status in ('live', 'soft_launch') and count(w.id) > 0 as waiting_for_an_open_city
from public.city c
left join public.waitlist_signup w on w.city_id = c.id
group by c.id, c.name, c.status;

comment on view waitlist_city_v is
  'Who is waiting, and for a city in what state. The juxtaposition is the point: people waiting for a city that is already open were told to wait by a form that never checked.';

/*
 * Signups with no city at all.
 *
 * Counted separately rather than dropped. A signup with no city
 * is still a person, and rolling them into a city total would
 * put them somewhere they never asked for.
 */
create or replace view waitlist_signup_v
with (security_invoker = true) as
select
  w.id,
  w.email,
  w.city_id,
  c.name as city_name,
  c.status::text as city_status,
  w.source,
  w.consent_marketing,
  w.created_at
from public.waitlist_signup w
left join public.city c on c.id = w.city_id
order by w.created_at desc;

comment on view waitlist_signup_v is
  'The waitlist itself, newest first, with the state of the city each person is waiting for.';

grant select on waitlist_city_v, waitlist_signup_v to authenticated;
