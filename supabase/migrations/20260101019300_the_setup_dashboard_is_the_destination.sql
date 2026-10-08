-- The setup dashboard is the destination.
--
-- `fn_partner_home` sent an unfinished merchant to
-- `/merchants/apply` and an unfinished rider to `/riders/apply`,
-- because when it was written each portal had one state and
-- that state assumed a finished account. Both now have two, and
-- the second is built for precisely this person: the setup
-- strip, what going live unlocks, and every section open with
-- sample data.
--
-- This is also the answer to a real complaint. Every merchant
-- and every rider on production sits under the readiness line,
-- so every one of them signed in and landed back on the
-- application form. The portals were not broken; they were
-- unreachable.
--
-- The application routes stay exactly where they are, for
-- somebody who has no account at all.

create or replace function public.fn_partner_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.merchant;
  r public.rider;
  h public.host;
  v_pct integer;
  v_done integer;
begin
  if v_uid is null then
    return jsonb_build_object('kind', 'anonymous', 'home', '/sign-in');
  end if;

  if exists (select 1 from public.staff_user su
              where su.user_id = v_uid and su.status = 'active') then
    return jsonb_build_object('kind', 'staff', 'home', '/',
      'note', 'Staff work in the admin console, not here.');
  end if;

  select * into m from public.merchant mm
   where authz.is_merchant_member(mm.id)
   order by mm.updated_at desc limit 1;

  if m.id is not null then
    v_pct := coalesce((public.fn_merchant_readiness(m.id) ->> 'pct')::int, 0);
    return jsonb_build_object(
      'kind', 'merchant', 'id', m.id,
      'name', coalesce(m.trading_name, m.legal_name),
      'status', m.status, 'pct', v_pct,
      'submitted', m.submitted_at is not null,
      /* Kept in the payload because the dashboard still reads it
         to decide which of its two states to draw. It no longer
         decides whether they may arrive at all. */
      'ready', m.submitted_at is not null or v_pct >= 80,
      'home', '/merchant');
  end if;

  select * into r from public.rider rr where rr.user_id = v_uid
   order by rr.updated_at desc limit 1;

  if r.id is not null then
    v_pct := coalesce((public.fn_rider_readiness(r.id) ->> 'pct')::int, 0);
    return jsonb_build_object(
      'kind', 'rider', 'id', r.id,
      'name', nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
      'status', r.status, 'pct', v_pct,
      'submitted', r.submitted_at is not null,
      'ready', r.submitted_at is not null or v_pct >= 80,
      'home', '/rider');
  end if;

  select * into h from public.host hh
   where authz.is_host_member(hh.id)
   order by hh.updated_at desc limit 1;

  if h.id is not null then
    select done_count into v_done
      from public.host_setup_progress_v where host_id = h.id;
    return jsonb_build_object(
      'kind', 'host', 'id', h.id,
      'name', h.display_name,
      'status', h.status,
      'pct', round(coalesce(v_done, 0) * 100.0 / 5),
      'submitted', h.submitted_at is not null,
      'ready', true,
      'home', '/host');
  end if;

  /* No partner record at all — the application forms are still
     the right destination for somebody who has not applied. */
  return jsonb_build_object('kind', 'guest', 'home', '/');
end;
$$;

grant execute on function public.fn_partner_home() to authenticated, anon;

comment on function public.fn_partner_home is
  'Where this account belongs. Unfinished merchants and riders now land on their own dashboard in its setup state rather than back on an application form — every partner on production sat under the readiness line, so every one of them bounced.';
