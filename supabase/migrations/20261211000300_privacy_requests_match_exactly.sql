-- A privacy request is filed against the right person, or against nobody yet.
--
-- rpc_data_request_create (20260101008200) is open to anyone and looked the
-- requester up with
--     where phone = trim(p_phone) or (p_email is not null and p_email <> '')
-- so whenever an email was given it matched every guest, and the request was
-- filed against whichever row came first. Staff acting on an export or an
-- erasure would then have acted on the wrong person's data. Even an exact
-- phone match is not proof: anybody can type somebody else's number into a
-- help form.
--
-- Now:
--   * A request is linked at creation only to the signed-in requester's own
--     record, and only when every phone or email they gave is that record's
--     own. Anybody else's request is filed unlinked.
--   * Staff link it when they verify who is asking: on verification the
--     request is linked to the one record whose phone, or whose account
--     email, matches exactly what the requester gave. Two different matches,
--     or none, leave it unlinked for staff to resolve.
--   * rpc_data_request_anonymise asks "do we know who is asking?" before
--     "which record is it?", so an unverified request is refused for that
--     reason first, whatever it is linked to.
--
-- Phones are compared the way checkout stores them (digits and a leading +).
--
-- Rollback: re-run rpc_data_request_create and rpc_data_request_verify_identity
-- from 20260101008200 and rpc_data_request_anonymise from 20260101017700.
-- That restores the wrong-person match, so do not.

create or replace function public.rpc_data_request_create(
  p_kind public.data_request_kind,
  p_phone text default null,
  p_email text default null,
  p_scope text[] default null,
  p_channel text default 'help_form'
)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
  v_guest public.guest;
  v_uid uuid := (select auth.uid());
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_account_email text;
  v_link uuid;
begin
  if coalesce(trim(coalesce(p_phone, '')), '') = ''
     and coalesce(trim(coalesce(p_email, '')), '') = '' then
    raise exception 'We need a phone number or an email to reach you about this.'
      using errcode = 'check_violation';
  end if;

  /* A signed-in requester asking about their own record. Every detail they
     gave has to be that record's own; a request that names somebody else's
     number or email is filed unlinked, like any other. */
  if v_uid is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    select * into v_guest from public.guest
     where user_id = v_uid and anonymised_at is null
     order by created_at limit 1;
    select lower(u.email) into v_account_email
      from auth.users u where u.id = v_uid and not coalesce(u.is_anonymous, false);

    if v_guest.id is not null
       and (v_phone is null or v_phone = v_guest.phone)
       and (v_email is null or v_email = v_account_email) then
      v_link := v_guest.id;
    end if;
  end if;

  insert into public.data_request (guest_id, requester_phone, requester_email, kind, channel, scope)
  values (v_link, nullif(trim(coalesce(p_phone, '')), ''),
          nullif(trim(coalesce(p_email, '')), ''), p_kind, p_channel,
          coalesce(p_scope, array['orders', 'messages', 'payments', 'profile', 'consents']))
  returning * into v_request;

  insert into public.notification (kind, status) values ('data_request_received', 'pending');
  insert into public.notification (kind, status) values ('data_request_identity_otp', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'data_request.received',
    p_target_type => 'data_request', p_target_id => v_request.id,
    p_after => jsonb_build_object('kind', p_kind, 'due_at', v_request.due_at,
                                  'linked', v_link is not null),
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

create or replace function public.rpc_data_request_verify_identity(
  p_request_id uuid,
  p_method text default 'otp'
)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
  v_phone text;
  v_email text;
  v_matches uuid[];
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.data_request where id = p_request_id for update;
  if not found then
    raise exception 'No such request.' using errcode = 'no_data_found';
  end if;

  /* Now that we know who is asking, the request can name their record: the
     one whose phone, or whose account email, is exactly what they gave. */
  if v_request.guest_id is null then
    v_phone := nullif(regexp_replace(coalesce(v_request.requester_phone, ''), '[^0-9+]', '', 'g'), '');
    v_email := nullif(lower(trim(coalesce(v_request.requester_email, ''))), '');

    select array_agg(distinct g.id) into v_matches
      from public.guest g
      left join auth.users u on u.id = g.user_id
     where g.anonymised_at is null
       and ((v_phone is not null and g.phone = v_phone)
            or (v_email is not null and lower(u.email) = v_email));
  end if;

  update public.data_request set
    identity_verified_at = now(),
    identity_method = p_method,
    status = 'in_progress',
    handled_by = coalesce(handled_by, authz.staff_id()),
    guest_id = coalesce(guest_id,
                        case when cardinality(v_matches) = 1 then v_matches[1] end)
  where id = p_request_id
  returning * into v_request;

  perform audit.log('staff'::public.actor_type, 'hotels', 'data_request.identity_verified',
    p_target_type => 'data_request', p_target_id => p_request_id,
    p_after => jsonb_build_object('method', p_method, 'linked', v_request.guest_id is not null),
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

create or replace function public.rpc_data_request_anonymise(p_request_id uuid)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
  v_blockers jsonb;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.data_request where id = p_request_id;

  v_blockers := public.fn_data_request_blockers(p_request_id);

  /* finance_retention is a note, not a blocker — it is the reason we
     anonymise instead of deleting. Anything else stops this. Asked before
     which record it is: who is asking comes first. */
  v_blockers := v_blockers - 'finance_retention';

  if v_blockers <> '{}'::jsonb then
    raise exception 'Cannot anonymise yet: %',
      (select string_agg(value #>> '{}', ' ') from jsonb_each(v_blockers))
      using errcode = 'check_violation';
  end if;

  if v_request.guest_id is null then
    raise exception 'This request is not linked to a guest record.' using errcode = 'no_data_found';
  end if;

  perform public.fn_anonymise_guest(v_request.guest_id);

  update public.data_request set
    status = 'fulfilled', fulfilled_at = now(),
    handled_by = coalesce(handled_by, authz.staff_id())
  where id = p_request_id
  returning * into v_request;

  insert into public.notification (kind, status) values ('data_request_fulfilled', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'guest.anonymised',
    p_target_type => 'guest', p_target_id => v_request.guest_id,
    p_severity => 'high', p_reason => 'KDPA erasure request ' || p_request_id::text);

  return v_request;
end;
$$;
