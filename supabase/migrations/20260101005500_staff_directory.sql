-- The staff directory the console draws, including the facts Auth holds.
--
-- PostgREST does not expose the auth schema, and it should not: it holds
-- password hashes and every session token on the project. But three things
-- in there are exactly what a staff page is for — whether someone has a
-- second factor, when they last signed in, and how many sessions they have
-- open. A security-definer function reaches them, returns those three, and
-- nothing else.

/* How many super admins the project expects. Policy, so it lives in
   settings rather than in a component — the console reads it to say
   "minimum 2" and to warn when it is not met. */
insert into public.setting (scope, key, value, effective_from) values
  ('global', 'super_admin_min', '2'::jsonb, now()),
  ('global', 'super_admin_max', '3'::jsonb, now())
on conflict do nothing;

create or replace function public.rpc_staff_directory()
returns table (
  staff_id uuid,
  email text,
  display_name text,
  status public.staff_status,
  roles text[],
  role_labels text[],
  /* The most privileged role held, which is the one the table shows. */
  primary_role text,
  primary_role_label text,
  /* Null city on any grant means every city. */
  all_cities boolean,
  cities text[],
  mfa_enrolled boolean,
  last_sign_in_at timestamptz,
  active_sessions integer,
  /* The soonest expiry across their grants, for contractors. */
  access_expires_at timestamptz,
  invited boolean,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  with ranked as (
    select
      s.id,
      r.key,
      r.label,
      /* The order the console treats as "most privileged", so the badge on
         the row is the one that matters. */
      case r.key
        when 'super_admin' then 1 when 'ops_manager' then 2
        when 'finance' then 3 when 'city_lead' then 4
        when 'merchant_ops' then 5 when 'rider_ops' then 6
        when 'concierge_agent' then 7 when 'hr' then 8
        when 'growth' then 9 when 'dpo' then 10 else 11
      end as rank
    from public.staff_user s
    join public.role_grant g on g.staff_user_id = s.id and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
    join public.role r on r.id = g.role_id
  )
  select
    s.id,
    s.email,
    s.display_name,
    s.status,
    coalesce((select array_agg(k.key order by k.rank) from ranked k where k.id = s.id), '{}'),
    coalesce((select array_agg(k.label order by k.rank) from ranked k where k.id = s.id), '{}'),
    (select k.key from ranked k where k.id = s.id order by k.rank limit 1),
    (select k.label from ranked k where k.id = s.id order by k.rank limit 1),
    coalesce((
      select bool_or(g.city_id is null) from public.role_grant g
      where g.staff_user_id = s.id and g.revoked_at is null
    ), false),
    coalesce((
      select array_agg(distinct c.name order by c.name)
      from public.role_grant g join public.city c on c.id = g.city_id
      where g.staff_user_id = s.id and g.revoked_at is null
    ), '{}'),
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = s.user_id and f.status = 'verified'
    ),
    u.last_sign_in_at,
    (select count(*)::int from auth.sessions ss where ss.user_id = s.user_id),
    (select min(g.expires_at) from public.role_grant g
      where g.staff_user_id = s.id and g.revoked_at is null and g.expires_at is not null),
    u.last_sign_in_at is null,
    s.created_at
  from public.staff_user s
  join auth.users u on u.id = s.user_id
  /*
   * Only a super admin sees the directory. It carries other people's
   * sign-in times and session counts, which is not something every staff
   * member needs to know about every colleague.
   */
  where authz.is_super_admin()
  order by s.display_name;
$$;

comment on function public.rpc_staff_directory is
  'Staff, their roles and the three facts Auth holds that a staff page needs: second factor, last sign-in, open sessions. Super admin only.';

grant execute on function public.rpc_staff_directory() to authenticated;

/*
 * Ending every session a person has.
 *
 * Deactivating a staff member stops has_role returning true, but their
 * existing access token stays valid until it expires — up to an hour of a
 * suspended account still working. Deleting the sessions closes that.
 */
create or replace function public.rpc_staff_sign_out_everywhere(p_staff_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_user uuid;
  v_count integer;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can end someone else''s sessions.'
      using errcode = 'insufficient_privilege';
  end if;

  select user_id into v_user from public.staff_user where id = p_staff_id;
  if v_user is null then
    raise exception 'No such staff member.' using errcode = 'no_data_found';
  end if;

  delete from auth.sessions where user_id = v_user;
  get diagnostics v_count = row_count;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.sessions_ended',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_after => jsonb_build_object('sessions_ended', v_count),
    p_severity => 'high'::public.audit_severity
  );

  return v_count;
end;
$$;

grant execute on function public.rpc_staff_sign_out_everywhere(uuid) to authenticated;

/*
 * Setting a city scope and an expiry on someone's access.
 *
 * Both columns already existed on role_grant and nothing ever wrote them.
 * A city lead scoped to Kampala and a contractor whose access lapses in
 * thirty days are the two cases the design draws, and they are the same
 * mechanism.
 */
create or replace function public.rpc_staff_set_scope(
  p_staff_id uuid,
  p_city_id uuid default null,
  p_expires_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_count integer;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can change scope.' using errcode = 'insufficient_privilege';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'An expiry in the past would lock them out immediately.'
      using errcode = 'check_violation';
  end if;

  /*
   * super_admin is left at every city on purpose. Scoping it to one city
   * would leave a project with no one who can act everywhere, and the
   * console's own minimum-two rule counts on that not happening.
   */
  update public.role_grant g
  set city_id = p_city_id, expires_at = p_expires_at
  from public.role r
  where r.id = g.role_id
    and g.staff_user_id = p_staff_id
    and g.revoked_at is null
    and r.key <> 'super_admin';
  get diagnostics v_count = row_count;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.scope_changed',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_after => jsonb_build_object('city_id', p_city_id, 'expires_at', p_expires_at,
                                  'grants_changed', v_count),
    p_severity => 'notice'::public.audit_severity
  );

  return v_count;
end;
$$;

grant execute on function public.rpc_staff_set_scope(uuid, uuid, timestamptz) to authenticated;
