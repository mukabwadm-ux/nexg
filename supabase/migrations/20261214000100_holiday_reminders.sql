-- Merchants are reminded to answer an upcoming public holiday.
--
-- holiday_calendar.prompt_merchants_days_before (default 3) has said since the
-- settings domain that merchants are asked about a holiday that many days
-- ahead, and nothing asked them. Every morning at 07:00 Nairobi time,
-- cron_holiday_reminders finds each live merchant with a holiday inside its
-- window (from today to prompt_merchants_days_before days ahead) that they
-- have not answered open or closed, and rings the bell of everyone on that
-- merchant's team: "Are you open on Jamhuri Day?", linking to the page where
-- they answer (the Hours board for legacy accounts, Availability for
-- workspace accounts).
--
-- One reminder per merchant per holiday. merchant_holiday_reminder records
-- it before the bells ring, and a merchant already in it is skipped, so a
-- second or retried run sends nothing and two overlapping runs cannot both
-- send. A holiday added late, inside its window, is picked up the next
-- morning. A merchant that answers is not reminded.
--
-- Demo workspaces are left out, because they are not businesses: the
-- merchants supabase/demo-accounts.sql made (found by their fixed ids, even
-- if renamed) and anything else named "[Demo] …".
--
-- The bell is the existing one (fn_notify_user), tagged per holiday: it is
-- pushed to devices that subscribed, and because the kind is listed in
-- notification_email_kind it is emailed too. Set that row's enabled to false
-- to stop the emails without a deploy.
--
-- Safe to run more than once.

-- ───────────────────────────────────────────────────── who was reminded

create table if not exists public.merchant_holiday_reminder (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  holiday_id uuid not null references public.holiday_calendar (id) on delete cascade,
  reminded_at timestamptz not null default now(),
  /* Team members whose bell rang. A merchant with nobody on its team is
     still recorded, so it is not tried again every morning. */
  recipients integer not null default 0,
  primary key (merchant_id, holiday_id)
);

comment on table public.merchant_holiday_reminder is
  'One row per merchant reminded to answer a public holiday, written by cron_holiday_reminders before the bells ring, so nobody is reminded twice about the same holiday.';

alter table public.merchant_holiday_reminder enable row level security;

revoke all on public.merchant_holiday_reminder from anon, authenticated;
grant select on public.merchant_holiday_reminder to authenticated;

drop policy if exists merchant_holiday_reminder_read on public.merchant_holiday_reminder;
create policy merchant_holiday_reminder_read on public.merchant_holiday_reminder
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

-- ───────────────────────────────────────────── the bell is also an email

insert into public.notification_email_kind (kind, note)
values ('merchant.holiday_reminder', 'Merchant: say whether you open on an upcoming public holiday')
on conflict (kind) do nothing;

-- ───────────────────────────────────────────────────────── the morning run

create or replace function public.cron_holiday_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  u record;
  v_href text;
  v_title text;
  v_body text;
  v_sent integer;
  v_reminders integer := 0;
  v_bells integer := 0;
  v_failed integer := 0;
begin
  for r in
    select m.id as merchant_id, h.id as holiday_id, h.date, h.label, h.estimated
    from public.holiday_calendar h
    join public.city c
      on c.id = h.city_id or (h.city_id is null and c.country = h.country)
    join public.merchant m
      on m.city_id = c.id and m.status = 'live' and m.deleted_at is null
    where h.date >= (now() at time zone c.timezone)::date
      and h.date <= (now() at time zone c.timezone)::date + h.prompt_merchants_days_before
      /* Not a demo workspace: neither one supabase/demo-accounts.sql made
         (its fixed ids, found as demo-accounts-remove.sql finds them) nor
         any other "[Demo] …". */
      and m.trading_name not like '[Demo]%'
      and not exists (select 1 from public.category_config cc
                      cross join (values ('live'), ('new')) as k (kind)
                      where m.id = md5('demo-merchant-' || k.kind || '-' || cc.category::text)::uuid)
      and not exists (select 1 from public.merchant_holiday_hours a
                      where a.merchant_id = m.id and a.holiday_id = h.id)
      and not exists (select 1 from public.merchant_holiday_reminder x
                      where x.merchant_id = m.id and x.holiday_id = h.id)
    order by h.date, m.id
  loop
    /* Each merchant on its own: one that fails is retried tomorrow and does
       not stop the rest. */
    begin
      insert into public.merchant_holiday_reminder (merchant_id, holiday_id)
      values (r.merchant_id, r.holiday_id)
      on conflict do nothing;
      if found then
        v_href := case when exists (select 1 from public.merchant_application ma
                                    where ma.merchant_id = r.merchant_id)
                       then '/merchant/availability' else '/merchant/hours' end;
        v_title := format('Are you open on %s?', r.label);
        v_body := format('%s is on %s. Tell guests whether you open that day. Until you answer, they see your usual hours.',
                         r.label, to_char(r.date, 'FMDay FMDD FMMonth'))
                  || case when r.estimated then ' The date is still to be confirmed.' else '' end;

        v_sent := 0;
        for u in
          select mu.user_id from public.merchant_user mu where mu.merchant_id = r.merchant_id
        loop
          perform public.fn_notify_user(
            p_user_id => u.user_id, p_kind => 'merchant.holiday_reminder',
            p_title => v_title, p_body => v_body, p_href => v_href,
            p_tone => 'warning'::public.notification_tone,
            p_object_type => 'holiday', p_object_id => r.holiday_id,
            p_tag => 'holiday:' || r.holiday_id::text);
          v_sent := v_sent + 1;
        end loop;

        update public.merchant_holiday_reminder set recipients = v_sent
        where merchant_id = r.merchant_id and holiday_id = r.holiday_id;

        v_reminders := v_reminders + 1;
        v_bells := v_bells + v_sent;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'Holiday reminder for merchant % about holiday % failed: %',
        r.merchant_id, r.holiday_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'reminders', v_reminders, 'bells', v_bells,
                            'failed', v_failed);
end;
$$;

comment on function public.cron_holiday_reminders is
  'Rings the team of each live merchant (demo workspaces aside) that has not answered a public holiday inside its prompt_merchants_days_before window, once per merchant and holiday. Run every morning by pg_cron (holiday-reminders).';

revoke execute on function public.cron_holiday_reminders() from public, anon, authenticated;
grant execute on function public.cron_holiday_reminders() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; holiday reminders are not scheduled.';
    return;
  end if;
  /* 04:00 UTC is 07:00 in Nairobi. */
  perform cron.schedule('holiday-reminders', '0 4 * * *',
    $sched$select public.cron_holiday_reminders()$sched$);
end
$cron$;
