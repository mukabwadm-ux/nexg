-- A submission reaches a person.
--
-- Everything for this existed and nothing joined it up.
-- `approval_request` held the queue, `fn_notify_user` rang an
-- in-app bell, `fn_notify_enqueue` sent email and WhatsApp
-- through the dispatch worker — and when a merchant uploaded a
-- document or a host added a unit, none of the three were
-- called. The row changed and no one was told.
--
-- That is the worst shape for this kind of gap: nothing errors,
-- the partner sees "submitted", and it sits there. The first
-- anybody hears is the partner asking why nobody has looked at
-- it in four days.
--
-- One function now does the whole thing in one transaction:
-- raise the request, ring every staff member who can act on it,
-- and queue them an email. One function because three callers
-- doing it by hand is two callers eventually forgetting a step,
-- and the step they forget is the notification.

/*
 * `approval_request` was built for staff raising things about
 * partners — suspend this merchant, grant that role — so
 * `requested_by` is a `staff_user` and is not null.
 *
 * What is needed now is the other direction: a partner submits
 * and staff decide. That is a different requester, not the same
 * one wearing a hat, so it gets its own column rather than a
 * fake staff row standing in for a merchant. The check keeps
 * the original guarantee — every request has somebody behind
 * it — while allowing either kind.
 */
alter table public.approval_request
  add column if not exists requested_by_user uuid references auth.users (id) on delete set null;

alter table public.approval_request
  alter column requested_by drop not null;

alter table public.approval_request
  drop constraint if exists approval_request_has_a_requester;

alter table public.approval_request
  add constraint approval_request_has_a_requester
  check (requested_by is not null or requested_by_user is not null);

/**
 * Who can act on this?
 *
 * Staff whose live role grants them the module, scoped to the
 * city when the role is city-scoped. A role grant that has
 * expired or been revoked does not count — somebody who left in
 * March should not be the reason a request looks attended to.
 */
create or replace function public.fn_staff_for_module(
  p_module text,
  p_city_id uuid default null
)
returns table (staff_user_id uuid, user_id uuid, email text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct su.id, su.user_id, su.email, su.display_name
    from public.staff_user su
    join public.role_grant rg on rg.staff_user_id = su.id
    join public.role_module_access rma on rma.role_key = (
      select r.key from public.role r where r.id = rg.role_id)
   where su.status = 'active'
     and rg.revoked_at is null
     and (rg.expires_at is null or rg.expires_at > now())
     and rma.module_key = p_module
     /* A grant with no city is platform-wide; one with a city
        only counts for that city. A request with no city at all
        goes to everyone who holds the module. */
     and (p_city_id is null or rg.city_id is null or rg.city_id = p_city_id);
$$;

/**
 * Raise something for staff to decide, and tell them.
 *
 * Returns the approval request id. Idempotent on
 * (kind, target_type, target_id) while one is still pending —
 * a partner pressing submit twice, or a retried action, must
 * not put the same thing in the queue twice and ring two bells
 * for it.
 *
 * `p_module` decides who hears. It is a parameter rather than
 * derived from the kind because the same kind can belong to
 * different desks in different deployments, and a hard-coded
 * mapping here is one nobody can change without a migration.
 */
create or replace function public.fn_approval_raise(
  p_kind public.approval_kind,
  p_module text,
  p_target_type text,
  p_target_id uuid,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_city_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_email boolean default true,
  /* Who is asking. Defaults to the signed-in caller, which is
     the normal case; passed explicitly when something automated
     raises on a partner's behalf. */
  p_requested_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing uuid;
  v_staff record;
  v_rang integer := 0;
  v_by uuid := coalesce(p_requested_by, (select auth.uid()));
begin
  /*
   * An approval with no requester is one nobody can go back to
   * and ask about, so it is refused here with a sentence rather
   * than at the not-null constraint with a stack trace.
   */
  if v_by is null then
    raise exception 'An approval needs a requester. Pass p_requested_by when raising one outside a signed-in request.'
      using errcode = '22023';
  end if;
  /* Already waiting? Then this is the same ask again. */
  select id into v_existing from public.approval_request
   where kind = p_kind and target_type = p_target_type
     and target_id = p_target_id and status = 'pending'
   limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  /* Staff raise through `requested_by`; a partner through
     `requested_by_user`. Which one is decided here, by whether
     the caller has a staff identity at all. */
  insert into public.approval_request (
    kind, target_type, target_id, city_id,
    requested_by, requested_by_user, reason, payload, status)
  values (
    p_kind, p_target_type, p_target_id, p_city_id,
    (select su.id from public.staff_user su where su.user_id = v_by),
    v_by,
    p_title, p_payload, 'pending')
  returning id into v_id;

  /*
   * The bell and the email, for every person who can act.
   *
   * In-app first and in the same transaction, so the console
   * shows it the instant the write commits rather than when a
   * worker next runs. Email goes to the outbox, which the
   * dispatch worker drains — that one cannot be synchronous
   * without making a merchant's upload wait on an SMTP
   * handshake.
   */
  for v_staff in select * from public.fn_staff_for_module(p_module, p_city_id) loop
    perform public.fn_notify_user(
      p_user_id => v_staff.user_id,
      p_kind => 'approval.' || p_kind::text,
      p_title => p_title,
      p_body => p_body,
      p_href => p_href,
      p_tone => 'warning',
      p_object_type => p_target_type,
      p_object_id => p_target_id,
      /* Tagged, so a second raise about the same thing replaces
         the bell rather than stacking a second one beside it. */
      p_tag => 'approval:' || v_id::text);

    if p_email and coalesce(trim(v_staff.email), '') <> '' then
      perform public.fn_notify_enqueue(
        p_channel => 'email',
        p_recipient => v_staff.email,
        p_template => 'staff_approval_waiting',
        p_subject => p_title,
        p_body => coalesce(p_body, p_title)
          || case when p_href is null then ''
                  else E'\n\n' || 'Open it: ' || p_href end,
        p_payload => jsonb_build_object(
          'approval_id', v_id, 'kind', p_kind, 'target_type', p_target_type,
          'target_id', p_target_id, 'href', p_href),
        /* Not sensitive: it names a business and a document
           type, never a guest or a number. */
        p_sensitive => false);
    end if;

    v_rang := v_rang + 1;
  end loop;

  perform audit.log('system'::public.actor_type, 'audit', 'approval.raised',
    p_target_type => p_target_type, p_target_id => p_target_id,
    p_target_label => p_title,
    p_city_id => p_city_id,
    p_after => jsonb_build_object(
      'approval_id', v_id, 'kind', p_kind, 'module', p_module,
      /*
       * How many people were told, recorded on purpose.
       *
       * Zero is the dangerous number: it means the request is
       * in the queue and nobody holds the module in that city,
       * so it will sit unseen. `wiring-check` reads this.
       */
      'staff_notified', v_rang));

  return v_id;
end;
$$;

/**
 * Tell a partner something, without an approval attached.
 *
 * The other direction: a decision made, a document rejected, a
 * card retired. Same shape so a caller does not have to think
 * about which table a notification lives in.
 */
create or replace function public.fn_notify_partner(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_tone public.notification_tone default 'info',
  p_email text default null,
  p_object_type text default null,
  p_object_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  v_id := public.fn_notify_user(
    p_user_id => p_user_id, p_kind => p_kind, p_title => p_title,
    p_body => p_body, p_href => p_href, p_tone => p_tone,
    p_object_type => p_object_type, p_object_id => p_object_id);

  if coalesce(trim(coalesce(p_email, '')), '') <> '' then
    perform public.fn_notify_enqueue(
      p_channel => 'email',
      p_recipient => p_email,
      p_template => 'partner_update',
      p_subject => p_title,
      p_body => coalesce(p_body, p_title),
      p_payload => jsonb_build_object('kind', p_kind, 'href', p_href),
      p_sensitive => false);
  end if;

  return v_id;
end;
$$;

/**
 * What a staff member has waiting, in one place.
 *
 * The console had no single list of "things asked of me". Each
 * module kept its own queue, which is fine for working through
 * one desk and useless for the question somebody actually opens
 * the console to ask.
 */
create or replace view staff_inbox_v
with (security_invoker = true) as
select
  n.id,
  n.user_id,
  n.kind,
  n.title,
  n.body,
  n.tone::text as tone,
  n.href,
  n.object_type,
  n.object_id,
  n.read_at,
  n.created_at,
  /* The approval behind it, when there is one, so the row can
     say whether somebody has already dealt with it. */
  a.id as approval_id,
  a.status::text as approval_status,
  a.decided_at,
  a.kind::text as approval_kind
from public.user_notification n
left join public.approval_request a
  on n.tag is not null
 and n.tag like 'approval:%'
 and a.id = nullif(replace(n.tag, 'approval:', ''), '')::uuid
where n.user_id = (select auth.uid());

grant select on staff_inbox_v to authenticated;
revoke all on staff_inbox_v from anon;

revoke execute on function
  public.fn_approval_raise(public.approval_kind, text, text, uuid, text, text, text, uuid, jsonb, boolean, uuid),
  public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid),
  public.fn_staff_for_module(text, uuid)
from public, anon;

/* Called by other definer functions, never from a browser. */
grant execute on function
  public.fn_approval_raise(public.approval_kind, text, text, uuid, text, text, text, uuid, jsonb, boolean, uuid),
  public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid),
  public.fn_staff_for_module(text, uuid)
to service_role;

insert into wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('fn_notify_partner',
   'A notification is not a state change; the thing it announces was audited where it happened',
   'user_notification and notification_outbox rows'),
  ('fn_staff_for_module',
   'Read-only: it answers who holds a module and writes nothing',
   'no write')
on conflict (function_name) do nothing;
