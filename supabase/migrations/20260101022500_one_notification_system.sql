-- One notification system.
--
-- The bell (`user_notification`), the outbox and the dispatch worker
-- already existed, but staff were only rung for approvals, and no
-- bell ever became an email. This joins them:
--
--   1. `fn_notify_staff` rings every staff member whose role reaches a
--      module. Who hears is decided by `role_module_access`, not here.
--   2. A mirror trigger turns a bell into an email when its kind is
--      listed in `notification_email_kind`. Switching an email on or
--      off for an event is a row, not a deploy.
--   3. Triggers raise the staff bell for new orders, refunds, messages,
--      merchant / rider / host submissions, featured requests and job
--      applications. Triggers never fail the write they observe.

-- ═══════════════════════════════════════ a bell that follows the state

create or replace function public.fn_notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_tone public.notification_tone default 'info',
  p_object_type text default null,
  p_object_id uuid default null,
  p_tag text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.user_notification
    (user_id, kind, title, body, tone, href, object_type, object_id, tag)
  values
    (p_user_id, p_kind, p_title, p_body, p_tone, p_href, p_object_type, p_object_id, p_tag)
  on conflict (user_id, tag) where tag is not null
  do update set
    kind = excluded.kind,
    title = excluded.title,
    body = excluded.body,
    tone = excluded.tone,
    href = coalesce(excluded.href, public.user_notification.href),
    read_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ═══════════════════════════════════════ which kinds are also emailed

create table if not exists public.notification_email_kind (
  kind text primary key,
  enabled boolean not null default true,
  note text
);

alter table public.notification_email_kind enable row level security;

comment on table public.notification_email_kind is
  'Bell kinds that are also sent as an email to the person rung. Flip `enabled` to silence one without a deploy.';

insert into public.notification_email_kind (kind, note) values
  ('order.confirmed', 'Guest: order confirmed'),
  ('order.delivered', 'Guest: order delivered'),
  ('order.cancelled', 'Guest: order cancelled'),
  ('order.refunded', 'Guest: refund on its way'),
  ('refund.approved', 'Guest: refund approved'),
  ('refund.issued', 'Guest: refund sent'),
  ('refund.rejected', 'Guest: refund declined'),
  ('rider.active', 'Rider: approved'),
  ('rider.suspended', 'Rider: suspended'),
  ('rider.offboarded', 'Rider: closed'),
  ('merchant.live', 'Merchant: live'),
  ('merchant.paused', 'Merchant: paused'),
  ('merchant.suspended', 'Merchant: suspended'),
  ('merchant.delisted', 'Merchant: delisted'),
  ('staff.merchant.submitted', 'Staff: merchant submitted for review'),
  ('staff.rider.submitted', 'Staff: rider applied'),
  ('staff.host.submitted', 'Staff: host applied'),
  ('staff.featured.requested', 'Staff: featured slot requested'),
  ('staff.refund.requested', 'Staff: refund raised'),
  ('staff.conversation.new', 'Staff: new conversation'),
  ('staff.job.applied', 'Staff: job application')
on conflict (kind) do nothing;

create or replace function public.tg_bell_becomes_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_staff boolean;
  v_base text;
begin
  if not exists (select 1 from public.notification_email_kind k
                  where k.kind = new.kind and k.enabled) then
    return null;
  end if;

  select u.email into v_email from auth.users u where u.id = new.user_id;
  if coalesce(trim(v_email), '') = '' then return null; end if;

  select exists (select 1 from public.staff_user su where su.user_id = new.user_id) into v_staff;
  v_base := case when v_staff then 'https://admin.nexgapp.com' else 'https://nexgapp.com' end;

  perform public.fn_notify_enqueue(
    p_channel => 'email',
    p_recipient => v_email,
    p_template => 'bell_' || new.kind,
    p_subject => new.title,
    p_body => coalesce(new.body, new.title)
      || case when new.href is null then ''
              else E'\n\nOpen it: ' || v_base || new.href end
      || E'\n\n— NexG',
    p_payload => jsonb_build_object('kind', new.kind, 'notification_id', new.id),
    p_sensitive => false);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists bell_becomes_email_insert on public.user_notification;
create trigger bell_becomes_email_insert
  after insert on public.user_notification
  for each row execute function public.tg_bell_becomes_email();

drop trigger if exists bell_becomes_email_update on public.user_notification;
create trigger bell_becomes_email_update
  after update on public.user_notification
  for each row when (new.updated_at is distinct from old.updated_at)
  execute function public.tg_bell_becomes_email();

-- ═══════════════════════════════════════ ring a desk

create or replace function public.fn_notify_staff(
  p_module text,
  p_kind text,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_tone public.notification_tone default 'info',
  p_object_type text default null,
  p_object_id uuid default null,
  p_city_id uuid default null,
  p_tag text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff record;
  v_n integer := 0;
begin
  for v_staff in
    select distinct su.user_id
      from public.staff_user su
      join public.role_grant rg on rg.staff_user_id = su.id
      join public.role_module_access rma on rma.role_key = (
        select r.key from public.role r where r.id = rg.role_id)
     where su.status = 'active'
       and su.user_id is not null
       and rg.revoked_at is null
       and (rg.expires_at is null or rg.expires_at > now())
       and rma.module_key = p_module
       and rma.level::text <> 'none'
       and (p_city_id is null or rg.city_id is null or rg.city_id = p_city_id)
  loop
    perform public.fn_notify_user(
      v_staff.user_id, p_kind, p_title, p_body, p_href, p_tone,
      p_object_type, p_object_id, p_tag);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.fn_notify_staff(text, text, text, text, text, public.notification_tone, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fn_notify_staff(text, text, text, text, text, public.notification_tone, text, uuid, uuid, text)
  to service_role;

-- ═══════════════════════════════════════ what rings the desks

create or replace function public.tg_staff_bell()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_ref text;
  v_city uuid;
  v_external boolean;
  v_first boolean;
  v_subject text;
begin
  case tg_table_name
  when 'merchant' then
    if tg_op = 'UPDATE' and new.status::text not in ('under_review')
       then return null; end if;
    if tg_op = 'UPDATE' and old.status = new.status then return null; end if;
    v_name := coalesce(new.trading_name, new.legal_name, 'A merchant');
    perform public.fn_notify_staff('merchants', 'staff.merchant.submitted',
      'New merchant: ' || v_name,
      v_name || ' has ' || case when tg_op = 'INSERT' then 'applied' else 'submitted for review' end || '.',
      '/merchants/' || new.id::text, 'warning', 'merchant', new.id, new.city_id,
      'merchant-submitted:' || new.id::text);

  when 'rider' then
    if tg_op = 'UPDATE' and (old.status = new.status or new.status::text <> 'under_review')
       then return null; end if;
    perform public.fn_notify_staff('riders', 'staff.rider.submitted',
      'New rider ' || case when tg_op = 'INSERT' then 'application' else 'ready for review' end,
      'A rider is waiting for a decision.',
      '/riders/' || new.id::text, 'warning', 'rider', new.id, new.city_id,
      'rider-submitted:' || new.id::text);

  when 'host' then
    if tg_op = 'UPDATE' and (old.status = new.status or new.status::text <> 'verifying')
       then return null; end if;
    perform public.fn_notify_staff('hotels', 'staff.host.submitted',
      'New host: ' || coalesce(new.display_name, 'unnamed'),
      coalesce(new.display_name, 'A host') || ' is waiting to be verified.',
      '/hotels/' || new.id::text, 'warning', 'host', new.id, new.city_id,
      'host-submitted:' || new.id::text);

  when 'featured_booking' then
    if new.status::text <> 'requested' then return null; end if;
    perform public.fn_notify_staff('featured', 'staff.featured.requested',
      'New featured slot request',
      'A merchant has asked for a featured placement.',
      '/featured', 'warning', 'featured_booking', new.id, new.city_id,
      'featured-requested:' || new.id::text);

  when 'refund' then
    select o.reference, o.city_id into v_ref, v_city
      from public."order" o where o.id = new.order_id;
    perform public.fn_notify_staff('finance', 'staff.refund.requested',
      'Refund raised on ' || coalesce(v_ref, 'an order'),
      'A refund needs a decision.',
      '/orders', 'warning', 'refund', new.id, v_city,
      'refund-raised:' || new.id::text);

  when 'order' then
    perform public.fn_notify_staff('orders', 'staff.order.new',
      'New order ' || new.reference, null,
      '/orders', 'info', 'order', new.id, new.city_id,
      'order-new:' || new.id::text);

  when 'job_application' then
    perform public.fn_notify_staff('careers', 'staff.job.applied',
      'New job application: ' || new.full_name, null,
      '/careers', 'info', 'job_application', new.id, new.city_id,
      'job-applied:' || new.id::text);

  when 'support_ticket' then
    perform public.fn_notify_staff('support', 'staff.ticket.new',
      'New ticket ' || new.reference, left(coalesce(new.body, ''), 160),
      '/support', 'warning', 'support_ticket', new.id, new.city_id,
      'ticket-new:' || new.id::text);

  when 'msg_message' then
    if new.kind::text <> 'text' then return null; end if;
    select (c.kind::text = 'external'), c.city_id, c.subject
      into v_external, v_city, v_subject
      from public.msg_conversation c where c.id = new.conversation_id;
    if not coalesce(v_external, false) then return null; end if;
    if not exists (
      select 1 from public.msg_participant p
       where p.id = new.author_participant_id
         and p.staff_user_id is null and p.team_key is null) then
      return null;
    end if;
    v_first := (new.seq = 1);
    perform public.fn_notify_staff('messaging',
      case when v_first then 'staff.conversation.new' else 'staff.message.new' end,
      case when v_first then 'New conversation' else 'New message' end,
      left(coalesce(v_subject, new.body, ''), 160),
      '/messaging', 'info', 'msg_conversation', new.conversation_id, v_city,
      (case when v_first then 'msg-new:' else 'msg:' end) || new.conversation_id::text);
  end case;

  return null;
exception when others then
  return null;
end;
$$;

do $$
declare t record;
begin
  for t in
    select * from (values
      ('merchant', 'insert'), ('merchant', 'update'),
      ('rider', 'insert'), ('rider', 'update'),
      ('host', 'insert'), ('host', 'update'),
      ('featured_booking', 'insert'),
      ('refund', 'insert'),
      ('order', 'insert'),
      ('job_application', 'insert'),
      ('support_ticket', 'insert'),
      ('msg_message', 'insert')
    ) v(tbl, op)
  loop
    execute format('drop trigger if exists staff_bell_%s on public.%I', t.op, t.tbl);
    execute format(
      'create trigger staff_bell_%s after %s on public.%I for each row execute function public.tg_staff_bell()',
      t.op, t.op, t.tbl);
  end loop;
end $$;
