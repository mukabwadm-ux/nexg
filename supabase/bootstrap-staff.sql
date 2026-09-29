-- Make the first staff account on a hosted project.
--
-- seed.sql creates dev.admin@nexgapp.com with a password written down in this
-- repository. That is fine on a laptop and unacceptable anywhere with a URL,
-- so the seed never runs against a hosted project and a real account has to be
-- made by hand. This is that, made short.
--
-- Paste the whole file into Supabase → SQL Editor, change the three values at
-- the top of the block, and run it.
--
--   https://supabase.com/dashboard/project/<your-project-ref>/sql/new
--
-- This is the database, not Vercel. Vercel runs the apps; both of them read
-- this one Supabase, so a staff account is made here once and both see it.
--
-- It will create the login for you. If you would rather make it in the
-- dashboard — Authentication → Users → Add user → Create new user, with
-- "Auto Confirm User" ticked — do that first and leave v_password as it is;
-- this will find the account and just grant the roles.
--
-- The password is typed into the SQL editor and must not be saved back into
-- this file, which is in git. Clear the editor when you are done.
--
-- Safe to run twice. Nothing is deleted and every insert is conditional.
--
-- One deliberate omission: super_admin. A trigger refuses that role, and
-- finance, without a second approver who is not the granter — so the first
-- account on a project cannot grant it to itself. The four roles below are
-- everything the console does day to day. See the footer for the rest.

do $$
declare
  -- ──────────────────────────────── change these three ────────────────────
  v_email    text := lower(trim('you@yourdomain.com'));
  v_name     text := 'Your Name';
  -- Leave as-is if you already made the account in the dashboard.
  v_password text := 'SET-A-PASSWORD-OR-LEAVE-THIS';
  -- ────────────────────────────────────────────────────────────────────────
  v_user  uuid;
  v_staff uuid;
  v_new   int;
begin
  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is null then
    if v_password = 'SET-A-PASSWORD-OR-LEAVE-THIS' then
      raise exception
        'There is no account for %. Either create it in Authentication → Users, or put a password in v_password and run this again.',
        v_email;
    end if;

    /*
     * The same insert seed.sql uses. email_confirmed_at is set because no
     * mail can reach this address from here — without it the account waits
     * for a confirmation that never arrives and you are locked out.
     */
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      '', '', '', '', '', '', '', ''
    )
    returning id into v_user;

    raise notice 'Created the login for %', v_email;
  else
    raise notice 'Found an existing login for %', v_email;
  end if;

  insert into public.staff_user (user_id, email, display_name)
  values (v_user, v_email, v_name)
  on conflict (email) do nothing;

  select id into v_staff from public.staff_user where email = v_email;

  /*
   * granted_by is this same account, which is allowed for these four;
   * approved_by stays null so the row reads as a bootstrap rather than as a
   * properly countersigned grant.
   */
  insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
  select v_staff, r.id, null, v_staff
  from public.role r
  where r.key in ('ops_manager', 'merchant_ops', 'rider_ops', 'growth')
    and not exists (
      select 1 from public.role_grant g
      where g.staff_user_id = v_staff
        and g.role_id = r.id
        and g.city_id is null
        and g.revoked_at is null
    );
  get diagnostics v_new = row_count;

  raise notice 'Staff record in place; % new role grant(s).', v_new;
end;
$$;

-- ──────────────────────────────────────────────────────────── check it ──
--
-- One row, with four roles. If it is empty, the block above raised and
-- nothing was written.

select s.email, s.display_name, s.status,
       string_agg(r.key, ', ' order by r.key) as roles
from public.staff_user s
left join public.role_grant g on g.staff_user_id = s.id and g.revoked_at is null
left join public.role r on r.id = g.role_id
group by s.email, s.display_name, s.status
order by s.email;

-- The laptop account must not have followed you here. This must return
-- nothing; if it returns a row, delete it before sharing the console's URL.

select email as delete_this_before_going_live
from public.staff_user
where email like 'dev.%@nexgapp.com';


-- ═══════════════════════════════════════════════════════════════════════
-- Later: super_admin, once a second person has an account
-- ═══════════════════════════════════════════════════════════════════════
--
-- super_admin is a superset of the four roles above — verified by giving an
-- account nothing else and watching it read every table and write the five
-- it alone may: cities, settings, document requirements, staff records and
-- role grants. Adding staff is the one thing you will miss day to day.
--
-- It waits for a second staff account because the schema will not let one
-- person grant it alone. Once two exist, one grants and the other approves:
--
--   insert into public.role_grant
--     (staff_user_id, role_id, city_id, granted_by, approved_by)
--   select recipient.id, r.id, null, granter.id, recipient.id
--   from public.staff_user recipient
--   cross join public.staff_user granter
--   cross join public.role r
--   where recipient.email = 'them@yourdomain.com'
--     and granter.email   = 'you@yourdomain.com'
--     and r.key = 'super_admin';
--
-- Worth knowing: with exactly two people the only available approver is the
-- recipient, and the trigger permits that — it checks the approver is not the
-- granter, not that the approver is not the beneficiary. So a pair can grant
-- each other super_admin unchallenged. That is weaker than the rule reads,
-- and worth tightening before the team is large enough for it to matter.
--
-- The same applies to `finance`.
