-- A signup with no address.
--
-- Four rows on production have no email, no city and no way to
-- reach the person. They are not corrupt — they are what the
-- homepage card used to write before it was changed to raise a
-- support ticket, and it took no contact detail at all.
--
-- Their payloads still hold what each person asked for: food in
-- Upperhill at eight, drinks at Wilma, drinks now. Those are
-- four orders nobody served and four people nobody can call.
--
-- So the view stops rendering them as blank rows. A blank row
-- reads as a database fault and gets ignored; a row that says
-- "no contact was captured" next to "Food · 8pm · upperhill"
-- is a person somebody might still think about.

/* Dropped rather than replaced: `create or replace view` can
   only append columns, and `reachable` belongs beside the email
   it is about rather than tacked on the end. */
drop view if exists waitlist_signup_v;

create view waitlist_signup_v
with (security_invoker = true) as
select
  w.id,
  w.email,
  nullif(btrim(coalesce(w.email, '')), '') is not null as reachable,
  w.city_id,
  c.name as city_name,
  c.status::text as city_status,
  w.source,
  w.consent_marketing,
  w.payload,
  /*
   * What they actually asked for, assembled from the payload
   * for the rows that have one. This is the only trace left of
   * these requests and it is worth putting in front of someone.
   */
  nullif(
    concat_ws(' · ',
      nullif(w.payload ->> 'need', ''),
      nullif(w.payload ->> 'when_detail', ''),
      case when w.payload ->> 'when' = 'asap' then 'as soon as possible' end,
      nullif(w.payload ->> 'staying_at', '')),
    '') as asked_for,
  w.created_at
from public.waitlist_signup w
left join public.city c on c.id = w.city_id
order by w.created_at desc;

comment on view waitlist_signup_v is
  'The waitlist, with whether each person can actually be reached and what they asked for. Rows from the old homepage card have no contact detail at all; shown as blanks they read as a database fault and get ignored.';

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
  c.status in ('live', 'soft_launch') and count(w.id) > 0 as waiting_for_an_open_city
from public.city c
left join public.waitlist_signup w on w.city_id = c.id
group by c.id, c.name, c.status;

grant select on waitlist_signup_v, waitlist_city_v to authenticated;

-- ════════════════════════════ the one message with no envelope

/*
 * One `notification_log` row says `queued` and has no outbox
 * entry, because it was raised before the outbox existed. The
 * sender will never see it, so it would sit in `queued` for
 * ever — indistinguishable on a screen from something about to
 * go out in the next minute.
 *
 * It is not resurrected: its body was never rendered, so there
 * is nothing to send. It is marked for what it is.
 */
update notification_log l
   set status = 'skipped',
       error = 'Raised before the outbox existed. No message was ever rendered for it.'
 where l.status = 'queued'
   and not exists (
     select 1 from notification_outbox o where o.notification_log_id = l.id);
