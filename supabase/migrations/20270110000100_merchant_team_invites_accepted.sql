-- A team invitation can be accepted, and only an owner changes the team.
--
-- rpc_merchant_invite_member (20260101020100) saves an invitation and
-- tells the person to "Sign in at nexgapp.com with this number or address
-- to accept", but nothing ever accepted one: no function sets
-- merchant_invite.accepted_at, so an invited manager signed in to an
-- account with no access to the business. Found in the system test on
-- 18 Nov 2026 (manager invited by email, signed up, no workspace).
--
-- 1. rpc_merchant_invites_accept() turns every open invitation addressed
--    to the signed-in account's confirmed email into a membership. The web
--    app calls it after sign-in, after sign-up and from /merchants/join.
--    Only a confirmed email matches (auth.users.email_confirmed_at): an
--    account confirms its email before it can sign in (config.toml
--    enable_confirmations). There is no phone sign-in, so a phone number
--    can never be proven and is not matched.
-- 2. New invitations therefore need an email address, saved in lower
--    case, and the message says where to accept: nexgapp.com/merchants/join.
-- 3. Only an owner invites, withdraws an invitation or removes somebody,
--    as 20270101000400 already requires for changing a role. An accepted
--    invitation is now real access, so a manager or a cashier must not be
--    able to invite a second account of their own as owner. Anyone may
--    still remove themselves, subject to the last-owner rule.
--
-- 4. The membership guard on merchant_user admits the invited account when
--    it accepts its own invitation (see the function at the end).
--
-- Rollback: re-run rpc_merchant_invite_member, rpc_merchant_invite_revoke
-- and rpc_merchant_membership_remove from
-- 20260101020100_branches_and_team_can_be_managed.sql and
-- tg_merchant_application_membership_guard from
-- 20261102000100_merchant_application.sql, then
-- drop function public.rpc_merchant_invites_accept();
-- drop function authz.is_merchant_owner(uuid);

insert into audit.action_registry (action, module, default_severity, description) values
  ('merchant.member_joined', 'merchants', 'notice',
   'Somebody accepted a team invitation by signing in with the invited email address')
on conflict (action) do nothing;

/*
 * The one rule every team change shares: the caller owns the business.
 * Membership alone is not enough, because a manager or a cashier is a
 * member too.
 */
create or replace function authz.is_merchant_owner(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_user mu
    join public.merchant m on m.id = mu.merchant_id
    where mu.merchant_id = p_merchant_id
      and mu.user_id = (select auth.uid())
      and mu.role = 'owner'
      and m.deleted_at is null
  )
$$;

revoke all on function authz.is_merchant_owner(uuid) from public, anon;
grant execute on function authz.is_merchant_owner(uuid) to authenticated;

create or replace function public.rpc_merchant_invite_member(
  p_merchant_id uuid,
  p_contact text,
  p_role text default 'manager',
  p_branches uuid[] default null,
  p_caps jsonb default '{}'::jsonb
)
returns public.merchant_invite
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.merchant_invite;
  v_contact text := lower(nullif(trim(p_contact), ''));
  v_me text;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if not authz.is_merchant_owner(p_merchant_id) then
    raise exception 'Only an owner can change the team.' using errcode = '42501';
  end if;
  if v_contact is null then
    raise exception 'An email address: it is how they are sent the invitation.'
      using errcode = '22023';
  end if;
  if v_contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invite by email address. Team members join by signing in to NexG with it.'
      using errcode = '22023';
  end if;
  if p_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Role must be owner, manager or cashier.' using errcode = '22023';
  end if;

  if exists (select 1 from public.merchant_user mu
               join auth.users u on u.id = mu.user_id
              where mu.merchant_id = p_merchant_id and lower(u.email) = v_contact) then
    raise exception '% is already on the team.', v_contact using errcode = '23505';
  end if;

  if exists (select 1 from public.merchant_invite
              where merchant_id = p_merchant_id and lower(contact) = v_contact
                and accepted_at is null and revoked_at is null) then
    raise exception 'There is already an open invitation to %. Resend it rather than making a second.', v_contact
      using errcode = '23505';
  end if;

  insert into public.merchant_invite (
    merchant_id, contact, role, branches, caps, invited_by)
  values (
    p_merchant_id, v_contact, p_role, p_branches,
    coalesce(p_caps, '{}'::jsonb), (select auth.uid()))
  returning * into v_invite;

  select trading_name into v_me from public.merchant where id = p_merchant_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_invited',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => v_me,
    p_after => jsonb_build_object('role', p_role, 'branches',
      coalesce(array_length(p_branches, 1), 0)));

  perform public.fn_notify_enqueue(
    p_channel => 'email',
    p_recipient => v_contact,
    p_template => 'merchant_team_invite',
    p_subject => 'You have been added to ' || coalesce(v_me, 'a business') || ' on NexG',
    p_body => coalesce(v_me, 'A business') || ' has invited you to its team on NexG as a '
      || p_role || '. To accept, open nexgapp.com/merchants/join and sign in with this email '
      || 'address. No NexG account yet? Create one with this address first.',
    p_payload => jsonb_build_object('invite_id', v_invite.id, 'merchant_id', p_merchant_id),
    p_sensitive => false);

  return v_invite;
end;
$$;

create or replace function public.rpc_merchant_invite_revoke(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.merchant_invite
   where id = p_invite_id and accepted_at is null and revoked_at is null;
  if v_merchant is null then
    raise exception 'No open invitation with that id.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_merchant) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if not authz.is_merchant_owner(v_merchant) then
    raise exception 'Only an owner can change the team.' using errcode = '42501';
  end if;

  update public.merchant_invite set revoked_at = now() where id = p_invite_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.invite_revoked',
    p_target_type => 'merchant', p_target_id => v_merchant);

  return jsonb_build_object('ok', true, 'note', 'Withdrawn. Signing in with that address no longer joins the team.');
end;
$$;

create or replace function public.rpc_merchant_membership_remove(p_merchant_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_owners integer;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  -- Leaving is always allowed; removing somebody else is an owner's call.
  if p_user_id is distinct from (select auth.uid())
     and not authz.is_merchant_owner(p_merchant_id) then
    raise exception 'Only an owner can change the team.' using errcode = '42501';
  end if;

  select count(*) into v_owners from public.merchant_user
   where merchant_id = p_merchant_id and role = 'owner' and user_id <> p_user_id;
  if v_owners = 0 then
    raise exception 'That is the only owner. Make somebody else an owner before removing them.'
      using errcode = '23503';
  end if;

  delete from public.merchant_user
   where merchant_id = p_merchant_id and user_id = p_user_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_removed',
    p_target_type => 'merchant', p_target_id => p_merchant_id);

  return jsonb_build_object('ok', true, 'note', 'Removed. They lose access at their next request.');
end;
$$;

/*
 * Accept every open invitation addressed to the caller's confirmed email.
 *
 * Safe to call on every sign-in: with nothing to accept it reads one row of
 * auth.users and one index. An invitation for somebody already on the team
 * is marked accepted and changes nothing about their role.
 */
create or replace function public.rpc_merchant_invites_accept()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_invite record;
  v_joined jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', true, 'joined', v_joined);
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_uid
    and not coalesce(u.is_anonymous, false)
    and u.email_confirmed_at is not null;

  if coalesce(v_email, '') = '' then
    return jsonb_build_object('ok', true, 'joined', v_joined);
  end if;

  for v_invite in
    select i.id, i.merchant_id, i.role, i.branches, i.caps, m.trading_name
    from public.merchant_invite i
    join public.merchant m on m.id = i.merchant_id
    where i.accepted_at is null
      and i.revoked_at is null
      and lower(trim(i.contact)) = v_email
      and m.deleted_at is null
    order by i.created_at
    for update of i
  loop
    -- Accepted first: the membership guard below admits the new member
    -- because this invitation was accepted by them in this transaction.
    update public.merchant_invite
       set accepted_at = now(), accepted_user_id = v_uid
     where id = v_invite.id;

    insert into public.merchant_user (merchant_id, user_id, role, branches, caps)
    values (v_invite.merchant_id, v_uid, v_invite.role::public.merchant_user_role,
            v_invite.branches, coalesce(v_invite.caps, '{}'::jsonb))
    on conflict (merchant_id, user_id) do nothing;

    perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_joined',
      p_target_type => 'merchant', p_target_id => v_invite.merchant_id,
      p_target_label => v_invite.trading_name,
      p_after => jsonb_build_object('role', v_invite.role));

    v_joined := v_joined || jsonb_build_array(jsonb_build_object(
      'merchant_id', v_invite.merchant_id,
      'name', v_invite.trading_name,
      'role', v_invite.role));
  end loop;

  return jsonb_build_object('ok', true, 'joined', v_joined);
end;
$$;

revoke all on function public.rpc_merchant_invites_accept() from public, anon;
grant execute on function public.rpc_merchant_invites_accept() to authenticated;

/*
 * The membership guard (20261102000100) lets only a current owner or staff
 * session add a member to a business that has an application, which is
 * every business registered through the current form. An invited person is
 * neither, so it also admits the one membership an accepted invitation
 * stands for: the invited account itself, joining in the same transaction
 * in which rpc_merchant_invites_accept marked its invitation accepted, in
 * the role the owner chose. Nothing else writes accepted_user_id.
 */
create or replace function public.tg_merchant_application_membership_guard()
returns trigger
language plpgsql
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
begin
  if new.user_id = (select auth.uid())
     and exists (
       select 1 from public.merchant_invite i
       where i.merchant_id = new.merchant_id
         and i.accepted_user_id = new.user_id
         and i.accepted_at = now()
         and i.role = new.role::text
     ) then
    return new;
  end if;
  if not authz.merchant_application_membership_write_allowed(new.merchant_id) then
    raise exception 'A current owner or authorized staff session must add application members.' using errcode='42501';
  end if;
  return new;
end;
$$;
