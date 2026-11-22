-- Removes the [Demo] merchants and the [Demo] hosts that supabase/demo-accounts.sql
-- created on 10 Nov 2026 (and demo-accounts-workspace.sql moved onto the
-- merchant workspace), with their sign-in accounts, and nothing else.
--
-- Run by hand in the Supabase SQL editor (owner asked, 19 Nov 2026):
--   1. Run step 1 on its own: it only reads, and lists what will go.
--   2. Run step 2 on its own. It is one do block on purpose: the editor runs
--      each statement by itself, so a script of separate deletes could stop
--      half way. This block is all or nothing.
--   3. Run step 3 on its own: every count should be 0.
--
-- A merchant counts as demo only when BOTH the seed's fixed id
-- (md5('demo-merchant-<live|new>-<category>')) AND the "[Demo]" name match;
-- a host only when its fixed id and its "[Demo]" name match. No real
-- business can be caught.
--
-- Step 2 stops, deleting nothing, if any order, payment, booking, stay, host
-- invoice, ledger account or payout line belongs to a demo merchant or host,
-- or if a demo sign-in also belongs to a real business, host or staff member.
--
-- Not touched: the two demo riders and the demo customer login, which carry
-- no "[Demo]" label (supabase/demo-accounts-remove.sql removes everything
-- the demo script made, those included).

-- ------------------------------------------------------------- 1. preview
with demo_merchant as (
  select m.id, coalesce(m.trading_name, m.legal_name) as name, m.status::text as status
    from public.merchant m
   where m.id in (select md5('demo-merchant-' || k.kind || '-' || cc.category::text)::uuid
                    from public.category_config cc cross join (values ('live'), ('new')) k(kind))
     and (m.trading_name like '[Demo]%' or m.legal_name like '[Demo]%')
),
demo_host as (
  select h.id, h.display_name as name, h.status::text as status
    from public.host h
   where h.id in (md5('demo-host-live')::uuid, md5('demo-host-new')::uuid)
     and h.display_name like '[Demo]%'
)
select 'merchant' as kind, name, status from demo_merchant
union all
select 'host', name, status from demo_host
order by 1, 2;

-- --------------------------------------------------------- 2. remove (one block)
do $$
declare
  v_merchants uuid[];
  v_hosts uuid[];
  v_users uuid[];
begin
  select coalesce(array_agg(m.id), '{}') into v_merchants
    from public.merchant m
   where m.id in (select md5('demo-merchant-' || k.kind || '-' || cc.category::text)::uuid
                    from public.category_config cc cross join (values ('live'), ('new')) k(kind))
     and (m.trading_name like '[Demo]%' or m.legal_name like '[Demo]%');

  select coalesce(array_agg(h.id), '{}') into v_hosts
    from public.host h
   where h.id in (md5('demo-host-live')::uuid, md5('demo-host-new')::uuid)
     and h.display_name like '[Demo]%';

  /* The demo sign-ins of those merchants and hosts: flagged demo by the seed,
     on its live.* / new.* @nexgapp.com addresses. */
  select coalesce(array_agg(u.id), '{}') into v_users
    from auth.users u
   where u.raw_user_meta_data ->> 'demo' = 'true'
     and u.email like '%@nexgapp.com'
     and u.email ~ '^(live|new)\.'
     and (u.id in (select mu.user_id from public.merchant_user mu where mu.merchant_id = any (v_merchants))
          or u.id in (select hu.user_id from public.host_user hu where hu.host_id = any (v_hosts)));

  if exists (select 1 from public."order" where merchant_id = any (v_merchants))
     or exists (select 1 from public.payment where merchant_id = any (v_merchants))
     or exists (select 1 from public.booking where merchant_id = any (v_merchants))
     or exists (select 1 from ledger.account where party_id = any (v_merchants || v_hosts))
     or exists (select 1 from public.fin_settlement_line where party_id = any (v_merchants || v_hosts))
     or exists (select 1 from public.host_invoice where host_id = any (v_hosts))
     or exists (select 1 from public.stay s join public.property p on p.id = s.property_id
                 where p.host_id = any (v_hosts)) then
    raise exception 'Stopped: a demo merchant or host has orders, payments, bookings, stays, invoices or ledger lines. Nothing was deleted.';
  end if;

  if exists (select 1 from public.merchant_user mu
              where mu.user_id = any (v_users) and not (mu.merchant_id = any (v_merchants)))
     or exists (select 1 from public.host_user hu
                 where hu.user_id = any (v_users) and not (hu.host_id = any (v_hosts)))
     or exists (select 1 from public.staff_user s where s.user_id = any (v_users)) then
    raise exception 'Stopped: a demo sign-in also belongs to a real business, host or staff member. Nothing was deleted.';
  end if;

  /* Documents point at their owner without a foreign key. */
  delete from public.document where owner_type = 'merchant' and owner_id = any (v_merchants);

  /* Applications. A submission snapshot is immutable for real applicants: the
     guard is lifted only inside this block, only for these merchants' rows. */
  delete from public.merchant_application_operation where merchant_id = any (v_merchants);
  delete from public.merchant_application_payout where merchant_id = any (v_merchants);
  alter table public.merchant_application_submission
    disable trigger merchant_application_submission_immutable;
  delete from public.merchant_application_submission where merchant_id = any (v_merchants);
  alter table public.merchant_application_submission
    enable trigger merchant_application_submission_immutable;
  delete from public.merchant_application where merchant_id = any (v_merchants);

  /* Branches, hours, catalogue, members, agreements and the rest cascade. */
  delete from public.merchant where id = any (v_merchants);

  delete from public.unit where host_id = any (v_hosts);
  delete from public.property where host_id = any (v_hosts);
  delete from public.host where id = any (v_hosts);

  /* Their identities and sessions cascade with them. */
  delete from auth.users where id = any (v_users);
end $$;

-- ------------------------------------------------------------- 3. check
select 'demo merchants left' as what, count(*) as n
  from public.merchant where trading_name like '[Demo]%' or legal_name like '[Demo]%'
union all
select 'demo hosts left', count(*) from public.host where display_name like '[Demo]%'
union all
select 'demo properties left', count(*) from public.property where name like '[Demo]%'
union all
select 'demo merchant and host sign-ins left', count(*)
  from auth.users
 where raw_user_meta_data ->> 'demo' = 'true' and email like '%@nexgapp.com'
   and email ~ '^(live|new)\.' and email !~ '^(live|new)\.rider@';
