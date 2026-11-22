-- Going live: one email, and a bell that is true.
--
-- tg_notify_merchant_status (20260101017900) rings every member's bell when
-- a business becomes live, and notification_email_kind 'merchant.live' made
-- each of those an email too: "You are live on NexG. Guests can order from
-- you now." Since the congratulations email (20270131000500) two things were
-- wrong with it:
--   * the owner got two emails on going live, and the congratulations one is
--     the one with the signed agreement and the next steps;
--   * going live leaves Accepting orders off, and so does coming back after a
--     pause, so "Guests can order from you now" was usually untrue.
--
-- Now:
--   * Going live for the first time rings the bell (kind merchant.live) and
--     is no longer emailed: the congratulations email is the email.
--   * Coming back after a pause, suspension or delisting rings the bell as
--     merchant.resumed, "You are live on NexG again". It is still emailed,
--     as "Business restored" in Settings > Notifications & templates.
--   * Both bells say what is true: guests can order, or how to start taking
--     orders.
--
-- Rollback: re-create tg_notify_merchant_status from 20260101017900;
--   update public.notification_email_kind set enabled = true where kind = 'merchant.live';
--   delete from public.notification_email_kind where kind = 'merchant.resumed';

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
begin
  if new.status is not distinct from old.status then return null; end if;

  v_kind := 'merchant.' || new.status::text;
  v_title := case new.status::text
    when 'live'      then 'You are live on NexG'
    when 'paused'    then 'Your shop is paused'
    when 'suspended' then 'Your shop has been suspended'
    when 'delisted'  then 'Your shop has been delisted'
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
    v_title := 'You are live on NexG again';
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

update public.notification_email_kind
   set enabled = false,
       note = 'Merchant: live. The bell stays; the email is the congratulations email with the signed agreement (partner_merchant_live, 20270131000500).'
 where kind = 'merchant.live';

insert into public.notification_email_kind (kind, enabled, note)
values ('merchant.resumed', true, 'Merchant: live again after a pause, suspension or delisting')
on conflict (kind) do nothing;
