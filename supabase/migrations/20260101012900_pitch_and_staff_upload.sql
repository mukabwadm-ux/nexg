-- Two things a reviewer on a phone call needs.
--
--  1. Send the merchant the featured-slot pitch, with real prices
--     and real durations — not a figure somebody half-remembers.
--  2. Put a document on file that arrived by email, because plenty
--     of them do, and the alternative today is asking a merchant who
--     has already sent you their permit to go and send it again.
--
-- The second one needs care. A document staff uploaded on somebody's
-- behalf is not the same fact as one the applicant uploaded, and
-- flattening the two would mean nobody can later tell who put a
-- licence on file.

-- ═══════════════════════════════════ what there is to sell

/*
 * The pitch, per city and category: which placements this merchant
 * could buy, at what the rate card actually says.
 *
 * Only priced slots. A pitch quoting "KES [—]" is not a pitch, and
 * inventing a number to fill the gap is how a merchant gets invoiced
 * for something nobody agreed — so an unpriced placement is simply
 * absent, and the RPC refuses to send an empty one.
 */
create or replace view public.featured_pitch_v
with (security_invoker = true) as
select
  p.city_id,
  c.name as city_name,
  p.kind,
  p.category,
  count(*) filter (where s.status = 'open') as weeks_open,
  min(s.list_price) filter (where s.list_price is not null) as price_per_week,
  min(s.week_start) filter (where s.status = 'open') as earliest_week,
  /* What the merchant is actually buying, said plainly. */
  case p.kind
    when 'homepage' then 'The band on the home page, above everything else'
    when 'category_top' then 'First in ' || coalesce(replace(p.category::text, '_', ' '), 'their category')
    when 'popular_request' then 'In Popular requests, where guests browse without searching'
    else replace(p.kind::text, '_', ' ')
  end as what_it_is
from public.featured_placement p
join public.featured_open_slot_v s
  on s.placement_id = p.id and s.week_start >= current_date
left join public.city c on c.id = p.city_id
where p.enabled
group by p.city_id, c.name, p.kind, p.category
having min(s.list_price) filter (where s.list_price is not null) is not null;

grant select on public.featured_pitch_v to authenticated;

comment on view public.featured_pitch_v is
  'What can honestly be pitched: placements with a published rate-card price. An unpriced slot is absent rather than shown as [—], because a pitch quoting a dash is not a pitch and a number invented to fill it is one somebody gets invoiced for.';

/*
 * Send it.
 *
 * Builds the payload from the rate card at this moment and stores
 * it on the notification, so what the merchant was quoted stays
 * answerable after the rate card moves.
 */
create or replace function public.rpc_featured_send_pitch(
  p_merchant_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  m public.merchant;
  v_slots jsonb;
  v_count integer;
  v_recipient text;
  v_provider text;
  v_queued boolean;
  v_last timestamptz;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  select * into m from public.merchant where id = p_merchant_id;
  if not found then raise exception 'No such merchant.'; end if;

  if not (authz.is_super_admin()
          or authz.reaches_module('featured')
          or authz.can_manage_merchants(m.city_id)) then
    raise exception 'You cannot sell featured placement.' using errcode = '42501';
  end if;

  if m.status <> 'live' then
    raise exception '% is %. Pitching placement to somebody who is not trading yet is a promise we cannot keep.',
      coalesce(m.trading_name, m.legal_name), replace(m.status::text, '_', ' ');
  end if;

  v_recipient := nullif(trim(coalesce(m.contact_email, '')), '');
  if v_recipient is null then
    raise exception 'We have no email address for %, so there is nowhere to send it.',
      coalesce(m.trading_name, m.legal_name);
  end if;

  /* What they could buy, in their own city, priced. */
  select jsonb_agg(jsonb_build_object(
           'what_it_is', t.what_it_is,
           'kind', t.kind,
           'category', t.category,
           'price_per_week', t.price_per_week,
           'weeks_open', t.weeks_open,
           'earliest_week', t.earliest_week) order by t.price_per_week desc),
         count(*)
    into v_slots, v_count
  from public.featured_pitch_v t
  where t.city_id = m.city_id
    /* A category placement is only worth pitching to a merchant in
       that category. The homepage band is worth pitching to anyone. */
    and (t.category is null or t.category::text = m.category::text);

  if coalesce(v_count, 0) = 0 then
    raise exception 'There is nothing priced to pitch in %. Finance publishes a rate card on Settings → Fees, and until they do a pitch would have to quote a number nobody agreed.',
      coalesce((select name from public.city where id = m.city_id), 'that city');
  end if;

  /* Not twice in a week. A pitch that arrives every other day is
     not a pitch, it is a reason to stop reading our email. */
  select max(created_at) into v_last from public.notification_log
   where template = 'merchant_featured_pitch'
     and payload ->> 'merchant_id' = p_merchant_id::text;

  if v_last is not null and v_last > now() - interval '7 days' then
    raise exception 'They were sent this %. Give it a week — a pitch that arrives every other day is a reason to stop reading our email.',
      case
        when now() - v_last < interval '1 hour' then 'less than an hour ago'
        when now() - v_last < interval '1 day'
          then (extract(epoch from now() - v_last) / 3600)::int || ' hours ago'
        else (extract(epoch from now() - v_last) / 86400)::int || ' days ago'
      end;
  end if;

  select i.status into v_provider from public.integration i where i.key = 'email';
  v_queued := coalesce(v_provider, 'to_do') = 'connected';

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (
    'email', v_recipient, 'merchant_featured_pitch',
    jsonb_build_object(
      'merchant_id', p_merchant_id,
      'name', coalesce(m.trading_name, m.legal_name),
      'city', (select name from public.city where id = m.city_id),
      'category', m.category,
      'slots', v_slots,
      'note', p_note,
      'from', (select email from public.staff_user where id = v_me)),
    case when v_queued then 'queued' else 'skipped' end);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'featured',
    p_action => 'featured.pitch_sent',
    p_actor_id => v_me,
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id,
    p_reason => p_note,
    p_after => jsonb_build_object('placements', v_count, 'delivered', v_queued));

  return jsonb_build_object(
    'ok', true,
    'placements', v_count,
    'queued', v_queued,
    'slots', v_slots,
    'message', case when v_queued
      then 'Queued for ' || v_recipient || ' with ' || v_count
           || ' priced placement' || case when v_count = 1 then '' else 's' end
           || '. Nothing drains the notification queue yet, so treat this as recorded rather than delivered.'
      else 'Recorded against ' || coalesce(m.trading_name, m.legal_name)
           || ', and nothing will go out: no email provider is connected.' end);
end;
$$;

-- ═════════════════════ a document that arrived by email

/*
 * Plenty of merchants email their permit rather than using the
 * upload step, and today the only answer is to ask somebody who has
 * already sent it to send it again.
 *
 * A document staff put on file is not the same fact as one the
 * applicant uploaded, so it is recorded as a different one.
 */
alter table public.document
  add column if not exists uploaded_by_staff_id uuid references public.staff_user (id) on delete set null,
  add column if not exists received_via text
    check (received_via is null or received_via in ('upload', 'email', 'whatsapp', 'in_person', 'post'));

comment on column public.document.uploaded_by_staff_id is
  'Set when a reviewer put the file on file on somebody''s behalf. Null means the applicant uploaded it themselves — which is the only way a document could arrive before now.';

/*
 * Staff who may review a path may now also write to it. Narrow on
 * purpose: `can_review_document_path` already resolves the owner
 * out of the path and checks the city, so this grants exactly the
 * set of files that person could already open.
 */
drop policy if exists partner_documents_staff_insert on storage.objects;
create policy partner_documents_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'partner-documents' and authz.can_review_document_path(name));

create or replace function public.rpc_document_upload_for(
  p_owner_type public.document_owner_type,
  p_owner_id uuid,
  p_requirement_kind text,
  p_storage_path text,
  p_mime text,
  p_size_bytes bigint,
  p_received_via text default 'email',
  p_expires_at date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_req public.document_requirement;
  v_city uuid;
  v_name text;
  v_existing public.document;
  v_id uuid;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  if p_owner_type = 'merchant' then
    select m.city_id, coalesce(m.trading_name, m.legal_name) into v_city, v_name
      from public.merchant m where m.id = p_owner_id;
    if v_name is null then raise exception 'No such merchant.'; end if;
    if not authz.can_manage_merchants(v_city) then
      raise exception 'You cannot file documents for merchants in that city.' using errcode = '42501';
    end if;
  else
    select r.city_id, trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
      into v_city, v_name from public.rider r where r.id = p_owner_id;
    if v_name is null then raise exception 'No such rider.'; end if;
    if not authz.can_manage_riders(v_city) then
      raise exception 'You cannot file documents for riders in that city.' using errcode = '42501';
    end if;
  end if;

  select * into v_req from public.document_requirement
   where owner_type = p_owner_type and kind = p_requirement_kind;
  if v_req.id is null then raise exception 'We do not ask for that document.'; end if;

  /* The path decides who can read the file afterwards, so it has to
     be the owner's own folder and not wherever the uploader put it. */
  if p_storage_path not like (p_owner_type::text || '/' || p_owner_id::text || '/%') then
    raise exception 'That file is in the wrong place. A document has to live under %/%/ or nobody will be able to open it later.',
      p_owner_type, p_owner_id;
  end if;

  /*
   * A replacement supersedes rather than overwrites. The old file
   * stays readable, because "what did the permit say in March" is a
   * question somebody eventually asks.
   */
  select * into v_existing from public.document
   where owner_type = p_owner_type and owner_id = p_owner_id
     and requirement_id = v_req.id and superseded_at is null
   order by created_at desc limit 1;

  if v_existing.id is not null then
    update public.document set superseded_at = now() where id = v_existing.id;
  end if;

  insert into public.document (
    owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
    status, expires_at, uploaded_by_staff_id, received_via,
    version)
  values (
    p_owner_type, p_owner_id, v_req.id, p_storage_path, p_mime, p_size_bytes,
    /* Uploaded, not verified. Putting a file on file is not the
       same act as checking it, and the person who does the first
       should not be able to skip the second by accident. */
    'uploaded', p_expires_at, v_me, coalesce(p_received_via, 'email'),
    coalesce(v_existing.version, 0) + 1)
  returning id into v_id;

  /* Any open chase for this document is now answered. */
  update public.document_request
     set fulfilled_document_id = v_id
   where owner_type = p_owner_type and owner_id = p_owner_id
     and requirement_id = v_req.id and fulfilled_document_id is null;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => case when p_owner_type = 'merchant' then 'merchants' else 'riders' end,
    p_action => 'document.filed_by_staff',
    p_actor_id => v_me,
    p_target_type => 'document',
    p_target_id => v_id,
    p_target_label => v_name || ' · ' || v_req.label,
    p_city_id => v_city,
    p_reason => 'Arrived by ' || coalesce(p_received_via, 'email') || '.',
    p_severity => 'notice',
    p_after => jsonb_build_object(
      'received_via', coalesce(p_received_via, 'email'),
      'replaced_version', v_existing.version));

  return jsonb_build_object(
    'ok', true, 'document_id', v_id,
    'replaced', v_existing.id is not null,
    'message', v_req.label || ' is on file for ' || v_name
      || '. It still needs verifying — filing a document is not the same as checking it.');
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('featured.pitch_sent', 'featured', 'info', false, false, false,
   'A featured-placement pitch was sent to a merchant'),
  ('document.filed_by_staff', 'merchants', 'notice', false, false, false,
   'A reviewer put a document on file on somebody''s behalf')
on conflict (action) do nothing;

grant execute on function public.rpc_featured_send_pitch(uuid, text) to authenticated;
grant execute on function public.rpc_document_upload_for(
  public.document_owner_type, uuid, text, text, text, bigint, text, date) to authenticated;
