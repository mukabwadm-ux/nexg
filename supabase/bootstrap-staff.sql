-- Make the first staff account on a hosted project.
--
-- seed.sql creates dev.admin@nexgapp.com with a password written down in this
-- repository. That is fine on a laptop and unacceptable anywhere with a URL,
-- so the seed never runs against a hosted project and a real account has to be
-- made by hand. This is that, made short.
--
-- Before running this, create the person in Supabase Studio:
--
--   Authentication → Users → Add user → Create new user
--   Email, a password from a password manager, "Auto Confirm User" ticked
--
-- Then edit the two values in the `me` block below and run the whole file in
-- Studio → SQL Editor. The password is set in that dialog and never appears
-- here, which is the point: this file is in git.
--
-- Safe to run twice. Nothing is deleted and every insert is conditional.

begin;

-- ─────────────────────────────────────────────── edit these two lines ──
create temporary table me on commit drop as
select
  lower(trim('you@yourdomain.com')) as email,
              'Your Name'           as display_name;
-- ───────────────────────────────────────────────────────────────────────

-- The person. Inserts nothing — quietly — if no auth user has that email,
-- which the check at the bottom reports.
insert into public.staff_user (user_id, email, display_name)
select u.id, me.email, me.display_name
from me
join auth.users u on lower(u.email) = me.email
on conflict (email) do nothing;

/*
 * The powers, minus the two that cannot be self-granted.
 *
 * These four are everything the console does day to day: review and verify
 * documents, take a merchant or rider live, suspend one, work the concierge
 * desk, read the waitlist. It is the same set the seeded dev.admin account
 * holds locally.
 *
 * `super_admin` and `finance` are deliberately not here. A trigger refuses
 * them without a second approver who is not the granter, so the first account
 * on a project cannot grant itself either — which is the rule working, not an
 * obstacle to route around. See the block after this one.
 *
 * granted_by is this same account. For these four roles that is allowed;
 * approved_by stays null so the row reads as a bootstrap rather than as a
 * properly countersigned grant.
 */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, r.id, null, s.id
from me
join public.staff_user s on s.email = me.email
cross join public.role r
where r.key in ('ops_manager', 'merchant_ops', 'rider_ops', 'growth')
  and not exists (
    select 1 from public.role_grant g
    where g.staff_user_id = s.id
      and g.role_id = r.id
      and g.city_id is null
      and g.revoked_at is null
  );

-- ──────────────────────────────────────────────────────────── check it ──

-- No rows here means there is no auth user with that email yet. Go back to
-- Authentication → Users and create it.
select
  s.email,
  s.display_name,
  s.status,
  string_agg(r.key, ', ' order by r.key) as roles
from me
join public.staff_user s on s.email = me.email
left join public.role_grant g on g.staff_user_id = s.id and g.revoked_at is null
left join public.role r on r.id = g.role_id
group by s.email, s.display_name, s.status;

commit;

-- The laptop account must not have followed you here. This must return
-- nothing; if it returns a row, delete it before sharing the console's URL.
select email as delete_this_before_going_live
from public.staff_user
where email like 'dev.%@nexgapp.com';


-- ═══════════════════════════════════════════════════════════════════════
-- Later: super_admin, once a second person has an account
-- ═══════════════════════════════════════════════════════════════════════
--
-- super_admin is not needed to run the console. It gates three things:
-- editing cities, changing which documents we demand, and adding or removing
-- staff. Each is a decision that outlives whoever made it, which is why the
-- schema will not let one person grant it alone — the trigger refuses a grant
-- with no approver, and refuses one approved by the person granting it.
--
-- So it waits for a second staff account. Then, with the emails the right way
-- round, one of you grants it and the other is recorded as the approver:
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
