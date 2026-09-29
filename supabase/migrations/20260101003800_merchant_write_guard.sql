-- What a merchant may not set about themselves.
--
-- `authenticated` holds UPDATE on public.merchant, and the owner policy
-- restricts which rows they may touch but not which columns. That was already
-- more than it should have been — an applicant could set featured = true on
-- their own draft and collect paid placement for nothing the moment staff
-- took them live, because the update policy stops applying at that point and
-- nobody would have seen the flag being set.
--
-- The onboarding flow makes it sharper: submitted_at, waitlisted_at,
-- credentials_sent_at, password_set_at and payout_name_lookup are all claims
-- the system makes about a merchant, and a merchant who can write them can
-- assert their own verification history.
--
-- Column grants cannot express this, because staff are `authenticated` too. A
-- trigger can: it runs on every path into the table, including one somebody
-- adds later, and it tells the difference between the three kinds of writer.

create or replace function public.tg_merchant_protected_columns()
returns trigger
language plpgsql
/*
 * Deliberately NOT security definer. The whole check rests on reading
 * current_user, and security definer would rewrite it to this function's
 * owner on every call — the guard would pass for everyone, silently, which
 * is the worst way for a guard to fail. It needs no extra privilege anyway:
 * authz.can_manage_merchants carries its own.
 */
set search_path = ''
as $$
begin
  /*
   * current_user is `postgres` inside a security-definer RPC and inside
   * anything the service role runs, and `authenticated` on a direct PostgREST
   * call. The RPCs in this schema are the sanctioned way to set these; this
   * is what separates them from a REST client holding a session.
   */
  if current_user <> 'authenticated' then
    return new;
  end if;

  if authz.can_manage_merchants(coalesce(old.city_id, new.city_id)) then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.featured is distinct from old.featured
     or new.went_live_by is distinct from old.went_live_by
     or new.went_live_at is distinct from old.went_live_at
     or new.settlement_account is distinct from old.settlement_account
     or new.submitted_at is distinct from old.submitted_at
     or new.waitlisted_at is distinct from old.waitlisted_at
     or new.credentials_sent_at is distinct from old.credentials_sent_at
     or new.password_set_at is distinct from old.password_set_at
     or new.payout_name_lookup is distinct from old.payout_name_lookup
     or new.requires_ops_mapping is distinct from old.requires_ops_mapping
     or new.resume_token_hash is distinct from old.resume_token_hash
     or new.resume_token_expires_at is distinct from old.resume_token_expires_at
  then
    raise exception 'That is not yours to set.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger merchant_protected_columns
  before update on public.merchant
  for each row execute function public.tg_merchant_protected_columns();

comment on function public.tg_merchant_protected_columns is
  'Stops a merchant setting the things the system asserts about them — featured placement, status, verification timestamps. Staff and the security-definer RPCs pass through.';
