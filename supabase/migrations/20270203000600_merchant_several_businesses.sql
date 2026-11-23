-- One sign-in may own several businesses (merchant_user, one row each), and
-- the merchant portal now switches between them. Two things follow:
--
-- 1. Notifications name the business. "Your shop is paused" no longer says
--    which shop, so the two merchant notifications that did not, now do:
--
--   * tg_notify_merchant_status: "<Business> is live on NexG", "… is paused" …
--   * cron_holiday_reminders: "Is <Business> open on <holiday>?", and its bell
--     tag now carries the merchant, so the reminder for one business no longer
--     replaces the other's (user_notification is unique on user_id + tag).
--
-- The holiday body is production's (checked 2026-11-22) and the status trigger
-- is 20270131000650's (merchant.resumed, true live body), each with only these
-- changes. Run after 20270131000650.
--
-- 2. merchant.contact_email is no longer unique (at the end of this file), so
--    a second business can carry the owner's own email.

create or replace function public.tg_notify_merchant_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_kind text;
  v_title text;
  v_body text;
  v_name text := coalesce(nullif(trim(new.trading_name), ''), nullif(trim(new.legal_name), ''),
                          'Your business');
begin
  if new.status is not distinct from old.status then return null; end if;

  v_kind := 'merchant.' || new.status::text;
  v_title := case new.status::text
    when 'live'      then format('%s is live on NexG', v_name)
    when 'paused'    then format('%s is paused', v_name)
    when 'suspended' then format('%s has been suspended', v_name)
    when 'delisted'  then format('%s has been delisted', v_name)
    else null end;
  if v_title is null then return null; end if;

  v_body := case new.status::text
    when 'live' then case when new.accepting_orders then 'Guests can order from you now.'
      else 'Start taking orders from your dashboard Home when you are ready.' end
    when 'paused' then 'You are not taking orders. Tap to see what to do.'
    else 'Tap to see why and what happens next.' end;

  /* Back after a pause, suspension or delisting: its own kind, still emailed. */
  if new.status::text = 'live' and old.status::text in ('paused', 'suspended', 'delisted') then
    v_kind := 'merchant.resumed';
    v_title := format('%s is live on NexG again', v_name);
  end if;

  /* Everybody on the account, not only whoever applied — a
     paused shop is news for whoever is working today. */
  for m in select user_id from public.merchant_user where merchant_id = new.id
  loop
    perform public.fn_notify_user(
      m.user_id, v_kind, v_title, v_body, '/merchant',
      (case new.status::text when 'live' then 'good'
            when 'paused' then 'warning' else 'urgent' end)::public.notification_tone,
      'merchant', new.id,
      'merchant-status:' || new.id::text);
  end loop;

  return null;
end;
$$;

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
    select m.id as merchant_id, h.id as holiday_id, h.date, h.label, h.estimated,
           coalesce(nullif(trim(m.trading_name), ''), nullif(trim(m.legal_name), ''),
                    'your business') as name
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
        v_title := format('Is %s open on %s?', r.name, r.label);
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
            p_tag => 'holiday:' || r.holiday_id::text || ':' || r.merchant_id::text);
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

revoke execute on function public.cron_holiday_reminders() from public, anon, authenticated;
grant execute on function public.cron_holiday_reminders() to service_role;

-- ─────────────────────────── one owner, several businesses, one email

-- merchant.contact_email was unique, so an owner adding a second business
-- under the same sign-in could not give it their own email: the
-- registration's first save failed (23505) with "The application changed".
-- Nothing reads a merchant by its email (submitting already requires the
-- email to be verified on the submitter's own sign-in), so the key only
-- stopped an owner's second business, and let any draft hold an email
-- against its real owner. It becomes a plain index.
alter table public.merchant drop constraint if exists merchant_contact_email_key;
create index if not exists merchant_contact_email_idx on public.merchant (contact_email);
