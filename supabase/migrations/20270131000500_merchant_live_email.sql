-- The owner hears that the business is live, with the signed agreement.
--
-- When NexG has signed a merchant's agreement and the business is live, the
-- owner gets one email: congratulations, what to do next for its category,
-- and the signed agreement attached as a PDF. Whichever happens last sends
-- it: Take live signs the agreement straight after going live, and "Issue
-- signed agreement" can sign a business that is already live. Signed but
-- not live yet (or paused) sends nothing until the business goes live, so
-- the email is never untrue.
--
--   * merchant_live_email: one row per signed agreement. Its primary key is
--     what stops a second email on a retry, a second press or a reload.
--   * Two triggers mark it due (one small insert, status pending): a signed
--     agreement recorded for a live business, and a business with a signed
--     agreement going live. Nothing else happens inside the signing or the
--     going live, so neither can be slowed or stopped by the email.
--   * cron_merchant_live_emails, every minute (job merchant-live-emails),
--     writes and queues the emails due. A failure is kept on the row
--     (status error), where staff see it and can send it again.
--   * fn_merchant_live_next_steps: the next steps for the merchant's
--     category, naming the dashboard sections the merchant has.
--   * fn_merchant_live_email_queue: writes the email (plain text, and the
--     parts of the house design in payload.content) and queues it through
--     fn_notify_enqueue as template partner_merchant_live (Settings › Email
--     routing: partner_updates; Settings › Notifications & templates:
--     "Business live"). The payload names the signed PDF and its SHA-256;
--     notify-dispatch reads it from the private bucket, checks it and
--     attaches it.
--   * rpc_merchant_live_email: what staff see on the merchant page.
--   * rpc_merchant_live_email_resend: Send again, when the email did not go
--     (skipped, failed after its retries, or never queued). Never after it
--     was sent: one email per signed agreement.
--
-- Recipient: the owner's sign-in email (the account that runs the dashboard
-- and gets every other merchant notice); the business email on file only when
-- the business has no owner account with an email.
--
-- Agreements already signed for live businesses when this runs are recorded
-- as skipped ("signed before these emails began"), so pausing and resuming one
-- later does not send it out of the blue; staff can press Send again. One
-- already signed for a business not live yet sends when the business goes live.
--
-- Rollback:
--   select cron.unschedule('merchant-live-emails');
--   drop trigger merchant_agreement_signed_live_email on public.merchant_agreement_signed;
--   drop trigger merchant_live_email_on_live on public.merchant;
--   drop function public.rpc_merchant_live_email_resend(uuid, text),
--     public.rpc_merchant_live_email(uuid), public.tg_merchant_live_email_on_live(),
--     public.tg_merchant_agreement_signed_live_email(), public.cron_merchant_live_emails(),
--     public.fn_merchant_live_email_queue(uuid, uuid, text), public.fn_merchant_live_next_steps(uuid);
--   drop table public.merchant_live_email;
--   delete from audit.action_registry where action in
--     ('merchant.live_email_queued', 'merchant.live_email_resent');

-- ═══════════════════════════════════════════════════════════════ the record

create table if not exists public.merchant_live_email (
  signed_id uuid primary key
    references public.merchant_agreement_signed (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  /* pending: due, the minute job writes and queues it; queued: in the outbox
     (its own status says sent, waiting or failed); skipped: not queued, and
     why; error: queuing it failed, and why. */
  status text not null check (status in ('pending', 'queued', 'skipped', 'error')),
  reason text check (reason is null or length(reason) <= 500),
  recipient text,
  recipient_source text check (recipient_source in ('owner_sign_in', 'business_email')),
  outbox_id uuid references public.notification_outbox (id) on delete set null,
  sends smallint not null default 1 check (sends between 1 and 50),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  /* Null when it went by itself; the staff member who pressed Send again. */
  last_by uuid references public.staff_user (id) on delete set null
);
create index if not exists merchant_live_email_merchant_idx
  on public.merchant_live_email (merchant_id);
create index if not exists merchant_live_email_pending_idx
  on public.merchant_live_email (first_at) where status = 'pending';

comment on table public.merchant_live_email is
  'The "your business is live" email, with the signed merchant agreement attached: one row per signed agreement, so it goes once. Read by staff through rpc_merchant_live_email.';

alter table public.merchant_live_email enable row level security;
revoke all on public.merchant_live_email from public, anon, authenticated;

/* Live businesses signed before this: on record, not sent (see the header). */
insert into public.merchant_live_email (signed_id, merchant_id, status, reason)
select g.id, g.merchant_id, 'skipped',
  'Signed before these emails began. Press Send again to send it now.'
from public.merchant_agreement_signed g
join public.merchant m on m.id = g.merchant_id
where m.status::text = 'live'
on conflict (signed_id) do nothing;

-- ══════════════════════════════════════════════════════════ what to do next

/*
 * The next steps for a newly live merchant, as {text, path}: two for its
 * category, then its logo and banner, then taking orders while that is off.
 * Workspace merchants (those that applied through the form) have Offerings,
 * Availability and Business; older merchants have Catalogue and Hours. Old
 * category ids an application may still carry are read as today's.
 */
create or replace function public.fn_merchant_live_next_steps(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_category text;
  v_steps jsonb := '[]'::jsonb;
  v_offer text;
  v_hours text := 'Check your opening hours in Availability, so customers order only while you are open.';
  v_area text;
  v_booking text;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return v_steps;
  end if;

  if not exists (select 1 from public.merchant_application a where a.merchant_id = p_merchant_id) then
    v_steps := jsonb_build_array(
      jsonb_build_object('text',
        'Add what you sell in Catalogue, with prices and photos, and check it is all there.',
        'path', '/merchant/menu'),
      jsonb_build_object('text', 'Check your opening hours in Hours.', 'path', '/merchant/hours'));
  else
    v_category := public.fn_merchant_agreement_category(p_merchant_id);
    v_category := case v_category
      when 'restaurant' then 'restaurants_food'
      when 'supermarket' then 'groceries_essentials'
      when 'bar_liquor' then 'alcohol_beverages'
      when 'florist' then 'flowers_gifts'
      when 'gift_shop' then 'flowers_gifts'
      when 'laundry' then 'laundry_cleaning'
      when 'beauty_fashion' then 'beauty'
      when 'airport' then 'airport_transfers'
      when 'health' then 'pharmacy'
      when 'financial_services' then 'concierge_services'
      when 'vehicle_services' then 'vehicle_rentals'
      when 'flights' then 'travel_tours'
      when 'other' then 'marketplace'
      else v_category
    end;

    v_offer := case v_category
      when 'restaurants_food' then
        'Add your menu in Offerings: each dish with its price and a photo, then publish it.'
      when 'alcohol_beverages' then
        'Add your drinks in Offerings, with prices and photos, then publish them.'
      when 'fashion_apparel' then
        'Add your products in Offerings, with sizes, colours, prices and photos, then publish them.'
      when 'flowers_gifts' then
        'Add your flowers and gifts in Offerings, with prices and photos, then publish them.'
      when 'tech_electronics' then
        'Add your products and repair services in Offerings, with prices and photos, then publish them.'
      when 'adults_only' then
        'Add your products and experiences in Offerings, with prices and photos, then publish them.'
      when 'beauty' then
        'Add your services in Offerings, with prices and how long each takes, then publish them.'
      when 'wellness' then
        'Add your services, classes and memberships in Offerings, with prices, then publish them.'
      when 'games_sports' then
        'Add your games, products and sessions in Offerings, with prices, then publish them.'
      when 'experiences' then
        'Add your experiences and tickets in Offerings, with prices, then publish them.'
      when 'travel_tours' then
        'Add your tours and trips in Offerings, with prices, then publish them.'
      when 'vehicle_rentals' then
        'Add your rentals in Offerings, priced per day or per hour, then publish them.'
      when 'airport_transfers' then
        'Add your transfers in Offerings, with their prices, then publish them.'
      when 'laundry_cleaning' then
        'Add your services in Offerings, with prices, and choose Collection and return on each one.'
      when 'movers_relocation' then
        'Add your moving and storage services in Offerings, then publish them. Quote requests arrive in Work.'
      when 'logistics_shipping' then
        'Add your delivery services and rates in Offerings, then publish them.'
      when 'concierge_services' then
        'Add the services you offer in Offerings, then publish them. Quote requests arrive in Work.'
      when 'premium_services' then
        'Add the services and reservations you offer in Offerings, then publish them. Quote requests arrive in Work.'
      when 'groceries_essentials' then
        'Add your products in Offerings, with prices, photos and stock, then publish them.'
      when 'pharmacy' then
        'Add your products in Offerings, with prices, photos and stock, then publish them.'
      when 'marketplace' then
        'Add your products in Offerings, with prices, photos and stock, then publish them.'
      else
        'Add what you offer in Offerings, with prices and photos, then publish it.'
    end;

    v_booking := case v_category
      when 'beauty' then
        'Set your opening hours in Availability, and add who customers can book under Resources and bookings.'
      when 'wellness' then
        'Set your opening hours in Availability, and add your therapists, rooms or class sessions under Resources and bookings.'
      when 'games_sports' then
        'Set your opening hours in Availability, and add your sessions under Resources and bookings.'
      when 'experiences' then
        'Add your dates in Availability: under Resources and bookings, add each session with its seats.'
      when 'travel_tours' then
        'Add your departures in Availability: under Resources and bookings, add each one as a session with its seats.'
      when 'vehicle_rentals' then
        'Add each vehicle in Availability, under Resources and bookings, so customers can book it.'
      when 'airport_transfers' then
        'Add your vehicles in Availability, under Resources and bookings, so customers can book them.'
    end;

    v_area := case v_category
      when 'laundry_cleaning' then 'Check the areas you collect from in Business, under Locations.'
      when 'movers_relocation' then 'Check the areas you cover in Business, under Locations.'
      when 'logistics_shipping' then 'Check the areas you cover in Business, under Locations.'
    end;

    v_steps := jsonb_build_array(
      jsonb_build_object('text', v_offer, 'path', '/merchant/offerings'),
      case
        when v_booking is not null then
          jsonb_build_object('text', v_booking, 'path', '/merchant/availability')
        when v_area is not null then
          jsonb_build_object('text', v_area, 'path', '/merchant/business?tab=locations')
        else jsonb_build_object('text', v_hours, 'path', '/merchant/availability')
      end,
      jsonb_build_object('text',
        'Add your logo and a banner photo in Business, so customers recognise you.',
        'path', '/merchant/business'));
  end if;

  if not m.accepting_orders then
    v_steps := v_steps || jsonb_build_array(jsonb_build_object('text',
      'When you are ready for orders, press Start taking orders on your dashboard Home.',
      'path', '/merchant'));
  end if;

  return v_steps;
end;
$$;

revoke all on function public.fn_merchant_live_next_steps(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_live_next_steps(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════ queuing it

/*
 * Writes and queues the email for one signed agreement, if its business is
 * live and it is the business's current agreement. The minute job (p_staff
 * null) writes only what the triggers marked due; Send again
 * (rpc_merchant_live_email_resend) passes the staff member and may queue
 * again only when the last one did not go. Returns what happened.
 */
create or replace function public.fn_merchant_live_email_queue(
  p_signed_id uuid,
  p_staff uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.merchant_agreement_signed;
  m public.merchant;
  a public.merchant_application;
  v_current public.merchant_agreement_acceptance;
  v_row public.merchant_live_email;
  v_outbox public.notification_outbox;
  v_route public.email_route;
  v_base constant text := 'https://nexgapp.com';
  v_template constant text := 'partner_merchant_live';
  v_name text;
  v_first text;
  v_to text;
  v_source text;
  v_steps jsonb;
  v_step jsonb;
  v_n integer := 0;
  v_step_lines text := '';
  v_slug text;
  v_filename text;
  v_intro text;
  v_docs text;
  v_subject text;
  v_body text;
  v_content jsonb;
  v_id uuid;
  v_status text;
  v_reason text;
begin
  select * into g from public.merchant_agreement_signed where id = p_signed_id;
  if g.id is null then
    return jsonb_build_object('status', 'none');
  end if;

  /* The agreement's row, held to the end of the transaction, so the minute
     job and Send again can never both queue it. */
  select * into v_row from public.merchant_live_email where signed_id = g.id for update;
  if p_staff is null then
    if v_row.signed_id is null or v_row.status <> 'pending' then
      return jsonb_build_object('status', 'already');
    end if;
  elsif v_row.status = 'pending' then
    raise exception 'The email is about to go out by itself. If it fails, send it again then.'
      using errcode = '55000';
  elsif v_row.status = 'queued' then
    select * into v_outbox from public.notification_outbox where id = v_row.outbox_id;
    if v_outbox.status = 'sent' then
      raise exception 'The email was sent on %. One email goes out per signed agreement.',
        to_char(v_outbox.sent_at at time zone 'Africa/Nairobi', 'DD Mon YYYY, HH24:MI')
        using errcode = '23505';
    elsif v_outbox.status = 'pending' or v_outbox.id is null then
      raise exception 'The email is still waiting to go out. Try again if it fails.'
        using errcode = '55000';
    end if;
  end if;

  select * into m from public.merchant where id = g.merchant_id;
  v_current := public.fn_merchant_agreement_current_acceptance(m.id);
  if m.status::text <> 'live' or m.deleted_at is not null or m.deactivated_at is not null
     or v_current.id is distinct from g.acceptance_id then
    /* No longer true: forget it, so going live again marks it due again. */
    if p_staff is null then
      delete from public.merchant_live_email where signed_id = g.id and status = 'pending';
    end if;
    return jsonb_build_object('status',
      case when v_current.id is distinct from g.acceptance_id then 'not_current' else 'not_live' end);
  end if;

  if v_row.signed_id is null then
    insert into public.merchant_live_email (signed_id, merchant_id, status)
    values (g.id, m.id, 'pending');
  end if;

  -- Who it goes to, and how they are greeted.
  select * into a from public.merchant_application where merchant_id = m.id;
  v_name := coalesce(nullif(btrim(m.trading_name), ''), nullif(btrim(m.legal_name), ''), 'Your business');
  v_first := coalesce(
    nullif(btrim(a.payload #>> '{business,firstName}'), ''),
    nullif(split_part(btrim(coalesce(m.contact_name, '')), ' ', 1), ''));
  select u.email into v_to
  from public.merchant_user mu
  join auth.users u on u.id = mu.user_id
  where mu.merchant_id = m.id and mu.role = 'owner'
    and coalesce(btrim(u.email), '') <> ''
  order by mu.created_at, mu.id
  limit 1;
  v_source := case when v_to is not null then 'owner_sign_in' end;
  if v_to is null then
    v_to := coalesce(nullif(btrim(a.payload #>> '{business,email}'), ''),
                     nullif(btrim(m.contact_email), ''));
    v_source := case when v_to is not null then 'business_email' end;
  end if;

  -- The words.
  v_steps := public.fn_merchant_live_next_steps(m.id);
  for v_step in select s from jsonb_array_elements(v_steps) as e(s) loop
    v_n := v_n + 1;
    v_step_lines := v_step_lines || v_n || '. ' || (v_step ->> 'text') || E'\n   '
      || v_base || (v_step ->> 'path') || E'\n';
  end loop;

  v_slug := btrim(left(btrim(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g'), '-'), 60), '-');
  v_filename := 'NexG-merchant-agreement-' || coalesce(nullif(v_slug, ''), g.reference) || '.pdf';
  v_docs := case when a.merchant_id is not null then 'Business › Documents' else 'Documents' end;
  v_intro := 'Congratulations, and welcome to NexG. ' || v_name || ' is now live'
    || case when m.explore_visible then ', and customers can find you on NexG.' else '.' end;
  v_subject := 'Congratulations! ' || v_name || ' is live on NexG';

  v_body := 'Hi' || coalesce(' ' || v_first, '') || E',\n\n'
    || v_intro || E'\n\n'
    || E'Here is what to do next:\n\n' || v_step_lines || E'\n'
    || 'Your merchant agreement, signed by NexG, is attached to this email as a PDF (reference '
    || g.reference || '). Keep it for your records. You can download it again any time from '
    || v_docs || E' in your dashboard.\n\n'
    || E'Questions about getting set up? Reply to this email and we will help.\n\n'
    || 'Open your dashboard: ' || v_base || E'/merchant\n\n— NexG\n';

  v_content := jsonb_build_object(
    'title', 'Congratulations! ' || v_name || ' is live',
    'greeting', 'Hi' || coalesce(' ' || v_first, '') || ',',
    'intro', v_intro || E'\n\nHere is what to do next:',
    'steps', (select coalesce(jsonb_agg(s ->> 'text' order by n), '[]'::jsonb)
              from jsonb_array_elements(v_steps) with ordinality as e(s, n)),
    'action', jsonb_build_object('label', 'Open your dashboard', 'url', v_base || '/merchant'),
    'callout', jsonb_build_object(
      'title', 'Your signed agreement is attached',
      'body', 'NexG has signed your merchant agreement (' || g.reference || '). The PDF is '
        || 'attached to this email: keep it for your records. You can download it again any '
        || 'time from ' || v_docs || ' in your dashboard.'),
    'closing', 'Questions about getting set up? Reply to this email and we will help.',
    'preheader', 'Your business is live. Your signed merchant agreement is attached.');

  -- Queue it, or say why not.
  select * into v_route from public.email_route r where r.key = public.fn_email_route_for(v_template);
  if v_to is null then
    v_status := 'skipped';
    v_reason := 'The business has no owner account or business email to send it to.';
  elsif v_route.key is not null and not v_route.enabled then
    v_status := 'skipped';
    v_reason := 'Partner emails are switched off in Settings › Email routing ('
      || v_route.key || ').';
  else
    v_id := public.fn_notify_enqueue(
      p_channel => 'email',
      p_recipient => v_to,
      p_template => v_template,
      p_subject => v_subject,
      p_body => v_body,
      p_payload => jsonb_build_object(
        'kind', 'merchant.live',
        'merchant_id', m.id,
        'signed_id', g.id,
        'reference', g.reference,
        'content', v_content,
        'attachments', jsonb_build_array(jsonb_build_object(
          'bucket', 'merchant-agreements',
          'path', g.storage_path,
          'filename', v_filename,
          'sha256', g.sha256,
          'bytes', g.bytes))),
      p_sensitive => false);
    v_status := case when v_id is null then 'skipped' else 'queued' end;
    v_reason := case when v_id is null then 'The email was not queued; see the notification log.' end;
  end if;

  update public.merchant_live_email
     set status = v_status,
         reason = v_reason,
         recipient = v_to,
         recipient_source = v_source,
         outbox_id = v_id,
         sends = case when p_staff is null or v_row.signed_id is null then sends
                      else least(sends + 1, 50) end,
         last_at = now(),
         last_by = p_staff
   where signed_id = g.id;

  perform audit.log(
    p_actor_type => (case when p_staff is null then 'system' else 'staff' end)::public.actor_type,
    p_actor_id => p_staff,
    p_module => 'merchants',
    p_action => case when p_staff is null then 'merchant.live_email_queued'
                     else 'merchant.live_email_resent' end,
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('reference', g.reference, 'status', v_status,
      'reason', v_reason, 'recipient', v_source, 'outbox_id', v_id),
    p_reason => nullif(btrim(coalesce(p_reason, '')), ''),
    p_city_id => m.city_id);

  return jsonb_build_object('status', v_status, 'reason', v_reason, 'outbox_id', v_id,
    'recipient', v_source);
end;
$$;

revoke all on function public.fn_merchant_live_email_queue(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_merchant_live_email_queue(uuid, uuid, text) to service_role;

/*
 * Every minute: write and queue the emails marked due. One that fails is
 * kept on its row (status error) for staff to see and send again, and never
 * holds up the others.
 */
create or replace function public.cron_merchant_live_emails()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_status text;
  v_error text;
  v_done jsonb := '{}'::jsonb;
  v_failed integer := 0;
begin
  for r in
    select e.signed_id, e.merchant_id
    from public.merchant_live_email e
    where e.status = 'pending'
    order by e.first_at
    limit 50
  loop
    begin
      v_status := public.fn_merchant_live_email_queue(r.signed_id) ->> 'status';
      v_done := v_done || jsonb_build_object(v_status, coalesce((v_done ->> v_status)::integer, 0) + 1);
    exception when others then
      v_error := left(sqlerrm, 500);
      v_failed := v_failed + 1;
      raise warning 'The live email for signed agreement % was not queued: %', r.signed_id, v_error;
      begin
        update public.merchant_live_email
           set status = 'error', reason = v_error, last_at = now()
         where signed_id = r.signed_id and status = 'pending';
        perform audit.log(
          p_actor_type => 'system'::public.actor_type,
          p_module => 'merchants',
          p_action => 'merchant.live_email_queued',
          p_target_type => 'merchant',
          p_target_id => r.merchant_id,
          p_after => jsonb_build_object('status', 'error', 'reason', v_error),
          p_severity => 'high'::public.audit_severity);
      exception when others then
        raise warning 'Recording that failure failed too: %', sqlerrm;
      end;
    end;
  end loop;
  return v_done || jsonb_build_object('failed', v_failed);
end;
$$;

revoke all on function public.cron_merchant_live_emails() from public, anon, authenticated;
grant execute on function public.cron_merchant_live_emails() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the live emails are not scheduled.';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'merchant-live-emails') then
    perform cron.unschedule('merchant-live-emails');
  end if;
  perform cron.schedule('merchant-live-emails', '* * * * *',
    $sched$select public.cron_merchant_live_emails()$sched$);
end
$cron$;

-- ═══════════════════════════════════════════════════════════ what starts it

/* An agreement signed for a business that is already live: due. One small
   insert, so the signing is never held up by the email. */
create or replace function public.tg_merchant_agreement_signed_live_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.merchant m
             where m.id = new.merchant_id and m.status::text = 'live') then
    insert into public.merchant_live_email (signed_id, merchant_id, status)
    values (new.id, new.merchant_id, 'pending')
    on conflict (signed_id) do nothing;
  end if;
  return null;
exception when others then
  raise warning 'The live email for signed agreement % was not marked due: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke all on function public.tg_merchant_agreement_signed_live_email() from public, anon, authenticated;

drop trigger if exists merchant_agreement_signed_live_email on public.merchant_agreement_signed;
create trigger merchant_agreement_signed_live_email
  after insert on public.merchant_agreement_signed
  for each row execute function public.tg_merchant_agreement_signed_live_email();

/* A business going live (or live again) whose current agreement is signed
   and has not had its email: due. */
create or replace function public.tg_merchant_live_email_on_live()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.merchant_live_email (signed_id, merchant_id, status)
  select g.id, g.merchant_id, 'pending'
  from public.merchant_agreement_signed g
  where g.merchant_id = new.id
    and g.acceptance_id = (public.fn_merchant_agreement_current_acceptance(new.id)).id
  on conflict (signed_id) do nothing;
  return null;
exception when others then
  raise warning 'The live email check for merchant % failed: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke all on function public.tg_merchant_live_email_on_live() from public, anon, authenticated;

drop trigger if exists merchant_live_email_on_live on public.merchant;
create trigger merchant_live_email_on_live
  after update of status on public.merchant
  for each row
  when (new.status = 'live' and old.status is distinct from new.status)
  execute function public.tg_merchant_live_email_on_live();

-- ══════════════════════════════════════════════════════════ for the console

/*
 * The email's state for the merchant page: not signed yet, waiting for the
 * business to go live, waiting to go out, sent, skipped, failed (after its
 * retries) or never queued, with when, to whom (masked) and whether Send
 * again is open.
 */
create or replace function public.rpc_merchant_live_email(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_acceptance public.merchant_agreement_acceptance;
  g public.merchant_agreement_signed;
  e public.merchant_live_email;
  o public.notification_outbox;
  v_live boolean;
  v_state text;
begin
  if authz.staff_id() is null or not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant staff only.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  v_live := m.status::text = 'live' and m.deleted_at is null and m.deactivated_at is null;
  v_acceptance := public.fn_merchant_agreement_current_acceptance(p_merchant_id);
  if v_acceptance.id is not null then
    select * into g from public.merchant_agreement_signed where acceptance_id = v_acceptance.id;
  end if;
  if g.id is not null then
    select * into e from public.merchant_live_email where signed_id = g.id;
    if e.outbox_id is not null then
      select * into o from public.notification_outbox where id = e.outbox_id;
    end if;
  end if;

  v_state := case
    when g.id is null then 'not_signed'
    when e.signed_id is null and not v_live then 'not_live'
    when e.signed_id is null then 'not_queued'
    when e.status = 'pending' then 'waiting'
    when e.status <> 'queued' then e.status
    when o.status = 'sent' then 'sent'
    when o.status = 'pending' or o.id is null then 'waiting'
    else 'failed'
  end;

  return jsonb_build_object(
    'state', v_state,
    'live', v_live,
    'reference', g.reference,
    'recipient', case
      when e.recipient is null then null
      when position('@' in e.recipient) > 1
        then left(e.recipient, 1) || '•••@' || split_part(e.recipient, '@', 2)
      else '•••' end,
    'recipient_source', e.recipient_source,
    'reason', e.reason,
    'queued_at', e.last_at,
    'sent_at', o.sent_at,
    'attempts', o.attempts,
    'last_error', o.last_error,
    'sends', e.sends,
    'can_resend', v_live and v_state in ('not_queued', 'skipped', 'error', 'failed'));
end;
$$;

/* Send again: for staff who sign agreements, while the business is live. */
create or replace function public.rpc_merchant_live_email_resend(
  p_merchant_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  m public.merchant;
  v_acceptance public.merchant_agreement_acceptance;
  v_signed uuid;
begin
  if v_staff is null or not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant staff only.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  if m.status::text <> 'live' or m.deleted_at is not null or m.deactivated_at is not null then
    raise exception 'The business is not live, so the email would not be true. It goes out by itself when the business goes live.'
      using errcode = '55000';
  end if;
  v_acceptance := public.fn_merchant_agreement_current_acceptance(p_merchant_id);
  select g.id into v_signed from public.merchant_agreement_signed g
  where g.acceptance_id = v_acceptance.id;
  if v_signed is null then
    raise exception 'The merchant agreement is not signed yet. Issue the signed agreement first.'
      using errcode = '55000';
  end if;
  return public.fn_merchant_live_email_queue(v_signed, v_staff, p_reason);
end;
$$;

revoke all on function public.rpc_merchant_live_email(uuid),
  public.rpc_merchant_live_email_resend(uuid, text) from public, anon;
grant execute on function public.rpc_merchant_live_email(uuid),
  public.rpc_merchant_live_email_resend(uuid, text) to authenticated, service_role;

alter function public.rpc_merchant_live_email_resend(uuid, text) set statement_timeout = '5s';

-- ═══════════════════════════════════════════════════════════════ audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.live_email_queued', 'merchants', 'info', false, false, false, '{}',
   'The owner was emailed that the business is live, with the signed merchant agreement attached; or why it was not sent'),
  ('merchant.live_email_resent', 'merchants', 'notice', false, false, false, '{}',
   'Staff sent the "your business is live" email again after it did not go')
on conflict (action) do nothing;
