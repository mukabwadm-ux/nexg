-- Host document expiry dates (owner's request, 26 Nov 2026): an ID, passport,
-- lease or management agreement can run out, so Stays › Verification &
-- Compliance shows what is expiring and what has expired.
--
-- What this adds:
--
-- 1. host_document.expires_on (date; null = the document does not expire).
-- 2. rpc_host_document_set_expiry(document, date): hospitality staff set or
--    correct the date on any current document (the approve step uses it);
--    the host's owner or a full-access manager may enter it while the
--    document is not approved yet (the upload form sends it), never a past
--    date. Audited as host.document_expiry_set.
-- 3. fn_host_document_expiry_state(status, superseded_at, expires_on):
--      expired   a current document that is not rejected whose expires_on is
--                before today (Nairobi)
--      expiring  an approved current document expiring within 60 days
--      valid     otherwise, when it has a date; null without one
--    An expired ID or proof of authority makes the host non-compliant.
-- 4. rpc_console_stays_hosts (from 20270329000100) gains per host
--    earliest_expiry, docs_expiring, docs_expired and documents (each current
--    document with its expiry); id_ok / authority_ok / kra_ok now also need
--    the document not to be expired; tab 'expiring' lists hosts with a
--    document expiring or expired (soonest first) and counts.expiring counts
--    them. Every existing key is kept.
-- 5. cron_host_document_expiry_notices, daily at 07:00 Nairobi (04:00 UTC):
--    emails the host 30 days and 7 days before an approved document expires
--    and once it has expired. host_document_expiry_notice remembers each
--    notice (document, stage, date) so none is sent twice; a corrected date
--    starts the notices again.
--
-- Rollback: select cron.unschedule('host-document-expiry-notices'); drop
-- function public.cron_host_document_expiry_notices(),
-- public.rpc_host_document_set_expiry(uuid, date),
-- public.fn_host_document_expiry_state(text, timestamptz, date); drop table
-- public.host_document_expiry_notice; recreate rpc_console_stays_hosts from
-- 20270329000100; delete the audit.action_registry row; then (losing the
-- dates) alter table public.host_document drop column expires_on.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('host.document_expiry_set', 'hotels', 'notice', false,
   'Staff or the host set, changed or cleared a host document''s expiry date')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ 1. columns

alter table public.host_document add column if not exists expires_on date;

create index if not exists host_document_expiring on public.host_document (expires_on)
  where superseded_at is null and expires_on is not null;

/* One row per expiry email sent; staff-only, reached through the cron. */
create table if not exists public.host_document_expiry_notice (
  document_id uuid not null references public.host_document(id) on delete cascade,
  stage text not null check (stage in ('30_days', '7_days', 'expired')),
  expires_on date not null,
  recipient text,
  sent_at timestamptz not null default now(),
  primary key (document_id, stage, expires_on)
);
alter table public.host_document_expiry_notice enable row level security;
revoke all on public.host_document_expiry_notice from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 2. helpers

create or replace function public.fn_host_document_expiry_state(
  p_status text, p_superseded_at timestamptz, p_expires_on date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_expires_on is null then null
    when p_superseded_at is null and p_status <> 'rejected'
      and p_expires_on < (now() at time zone 'Africa/Nairobi')::date then 'expired'
    when p_superseded_at is null and p_status = 'approved'
      and p_expires_on <= (now() at time zone 'Africa/Nairobi')::date + 60 then 'expiring'
    else 'valid'
  end
$$;

-- ═══════════════════════════════════════════════════════════════ 3. writer

create or replace function public.rpc_host_document_set_expiry(p_document_id uuid, p_expires_on date)
returns public.host_document
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_doc public.host_document;
  v_host public.host;
  v_is_staff boolean;
  v_before date;
begin
  select * into v_doc from public.host_document where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'No such document.' using errcode = 'no_data_found';
  end if;
  select * into v_host from public.host where id = v_doc.host_id;

  v_is_staff := v_staff is not null and authz.works_hospitality(v_host.city_id);
  if not v_is_staff and not exists (
    select 1 from public.host_user member
    where member.host_id = v_doc.host_id and member.user_id = v_uid and member.units is null
  ) then
    raise exception 'You cannot change this document.' using errcode = '42501';
  end if;
  if v_doc.superseded_at is not null then
    raise exception 'A newer file replaced this document.' using errcode = '22023';
  end if;
  if not v_is_staff then
    if v_doc.status = 'approved' then
      raise exception 'NexG approved this document. Upload a new file to change its expiry date.'
        using errcode = '22023';
    end if;
    if p_expires_on is not null and p_expires_on < v_today then
      raise exception 'This document has already expired. Upload a current one.' using errcode = '22023';
    end if;
  end if;
  if p_expires_on is not null and (p_expires_on < date '2000-01-01' or p_expires_on > v_today + 365 * 50) then
    raise exception 'Check the expiry date.' using errcode = '22023';
  end if;
  if v_doc.expires_on is not distinct from p_expires_on then
    return v_doc;
  end if;

  v_before := v_doc.expires_on;
  update public.host_document set expires_on = p_expires_on
  where id = p_document_id
  returning * into v_doc;

  perform audit.log(
    case when v_is_staff then 'staff' else 'host_user' end::public.actor_type,
    'hotels', 'host.document_expiry_set',
    p_actor_id => case when v_is_staff then null else v_uid end,
    p_target_type => 'host', p_target_id => v_host.id, p_city_id => v_host.city_id,
    p_before => jsonb_build_object('document_id', v_doc.id, 'kind', v_doc.kind,
                                   'expires_on', v_before),
    p_after => jsonb_build_object('document_id', v_doc.id, 'kind', v_doc.kind, 'expires_on', p_expires_on));
  return v_doc;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 4. reader

/* Hosts and the Verification & Compliance queue (from 20270329000100), with
   document expiry. */
create or replace function public.rpc_console_stays_hosts(
  p_tab text default 'all', p_q text default null, p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();

  with h as (
    select ho.id as host_id, coalesce(ho.display_name, ho.contact_name, 'Host') as name, ho.contact_name,
           ho.kind::text as kind, ho.status::text as status, ho.status_reason, ho.tier::text as tier,
           case when authz.handles_guest_data() or authz.works_hospitality(null) then ho.phone
                else '•••• ' || right(ho.phone, 3) end as phone,
           ho.email, ho.created_at, ho.submitted_at, ho.verified_at, ho.went_live_at, ho.rejected_at,
           ho.verification_method, c.name as city_name,
           (select count(*) from public.unit u where u.host_id = ho.id and u.archived_at is null and u.deleted_at is null) as units,
           (select count(*) from public.property p where p.host_id = ho.id and p.archived_at is null and p.deleted_at is null) as properties,
           (select min(p.name) from public.property p where p.host_id = ho.id and p.archived_at is null) as first_property,
           (select count(distinct d.kind) from public.host_document d where d.host_id = ho.id and d.superseded_at is null) as docs_uploaded,
           (select count(distinct d.kind) from public.host_document d where d.host_id = ho.id and d.superseded_at is null
              and d.status = 'approved') as docs_approved,
           (select count(*) from public.host_document d where d.host_id = ho.id and d.superseded_at is null
              and d.status = 'rejected') as docs_rejected,
           exists (select 1 from public.host_document d where d.host_id = ho.id and d.superseded_at is null
                    and d.kind = 'id_document' and d.status = 'approved'
                    and (d.expires_on is null or d.expires_on >= v_today)) as id_ok,
           exists (select 1 from public.host_document d where d.host_id = ho.id and d.superseded_at is null
                    and d.kind = 'authority' and d.status = 'approved'
                    and (d.expires_on is null or d.expires_on >= v_today)) as authority_ok,
           exists (select 1 from public.host_document d where d.host_id = ho.id and d.superseded_at is null
                    and d.kind = 'kra_pin' and d.status = 'approved'
                    and (d.expires_on is null or d.expires_on >= v_today)) as kra_ok,
           exists (select 1 from public.host_payout hp where hp.host_id = ho.id and hp.verified_at is not null) as payout_ok,
           (select count(*) from public.stays_case sc where sc.host_id = ho.id
              and sc.status in ('open', 'in_progress', 'mediation')) as open_cases,
           case
             when ho.status = 'live' then 'verified'
             when ho.status in ('applied', 'verifying') and ho.rejected_at is not null and ho.submitted_at is null then 'sent_back'
             when ho.status in ('applied', 'verifying') then 'pending'
             when ho.status = 'paused' then 'flagged'
             else 'rejected' end as bucket,
           dx.earliest_expiry,
           coalesce(dx.docs_expiring, 0) as docs_expiring,
           coalesce(dx.docs_expired, 0) as docs_expired,
           coalesce(dx.documents, '[]'::jsonb) as documents
    from public.host ho
    left join public.city c on c.id = ho.city_id
    left join lateral (
      select min(d.expires_on) filter (where d.status <> 'rejected') as earliest_expiry,
             count(*) filter (where public.fn_host_document_expiry_state(d.status, d.superseded_at, d.expires_on) = 'expiring') as docs_expiring,
             count(*) filter (where public.fn_host_document_expiry_state(d.status, d.superseded_at, d.expires_on) = 'expired') as docs_expired,
             jsonb_agg(jsonb_build_object(
               'id', d.id, 'kind', d.kind, 'status', d.status, 'file_name', d.file_name,
               'uploaded_at', d.uploaded_at, 'reviewed_at', d.reviewed_at, 'expires_on', d.expires_on,
               'expiry_state', public.fn_host_document_expiry_state(d.status, d.superseded_at, d.expires_on))
               order by array_position(array['id_document', 'authority', 'kra_pin', 'business_registration'], d.kind)) as documents
      from public.host_document d
      where d.host_id = ho.id and d.superseded_at is null
    ) dx on true
  ),
  f as (select * from h where (p_tab = 'all' or bucket = p_tab or (p_tab = 'non_compliant' and status = 'live'
                                 and (not id_ok or not authority_ok))
                               or (p_tab = 'expiring' and docs_expiring + docs_expired > 0))
          and (v_q is null or name ilike '%' || v_q || '%' or coalesce(phone, '') ilike '%' || v_q || '%'
               or coalesce(email, '') ilike '%' || v_q || '%' or coalesce(first_property, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object(
      'all', (select count(*) from h),
      'verified', (select count(*) from h where bucket = 'verified'),
      'pending', (select count(*) from h where bucket = 'pending'),
      'sent_back', (select count(*) from h where bucket = 'sent_back'),
      'flagged', (select count(*) from h where bucket = 'flagged'),
      'rejected', (select count(*) from h where bucket = 'rejected'),
      'non_compliant', (select count(*) from h where status = 'live' and (not id_ok or not authority_ok)),
      'expiring', (select count(*) from h where docs_expiring + docs_expired > 0)),
    'kpis', jsonb_build_object(
      'kyc_complete', (select count(*) from h where id_ok and authority_ok),
      'verified_properties', (select count(*) from public.property p where p.review_status = 'approved' and p.archived_at is null),
      'properties', (select count(*) from public.property p where p.archived_at is null and p.deleted_at is null),
      'verified_units', (select count(*) from public.unit u join public.host ho on ho.id = u.host_id
                          where ho.status = 'live' and u.status = 'live' and u.archived_at is null),
      'units', (select count(*) from public.unit u where u.archived_at is null and u.deleted_at is null),
      'docs_expiring', (select coalesce(sum(docs_expiring), 0) from h),
      'docs_expired', (select coalesce(sum(docs_expired), 0) from h)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t)
                                       order by case when p_tab = 'expiring' then t.earliest_expiry end nulls last,
                                                t.created_at desc), '[]'::jsonb) from (
        select * from f
        order by case when p_tab = 'expiring' then earliest_expiry end nulls last,
                 (bucket = 'pending') desc, created_at desc
        offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 5. cron

/* Emails the host 30 and 7 days before an approved document expires, and
   once it has expired; each (document, stage, date) at most once. */
create or replace function public.cron_host_document_expiry_notices()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  r record;
  v_email text;
  v_name text;
  v_label text;
  v_when text;
  v_sent integer := 0;
  v_failed integer := 0;
begin
  for r in
    select d.id, d.host_id, d.kind, d.expires_on, ho.contact_name, ho.display_name, ho.email,
           case when d.expires_on < v_today then 'expired'
                when d.expires_on - v_today <= 7 then '7_days'
                else '30_days' end as stage
    from public.host_document d
    join public.host ho on ho.id = d.host_id
    where d.superseded_at is null and d.status = 'approved' and d.expires_on is not null
      and d.expires_on <= v_today + 30
      and ho.status <> 'offboarded'
  loop
    begin
      if exists (select 1 from public.host_document_expiry_notice n
                 where n.document_id = r.id and n.stage = r.stage and n.expires_on = r.expires_on) then
        continue;
      end if;
      v_email := coalesce(public.fn_receipt_email('host', r.host_id), r.email);
      if v_email is null then
        continue;
      end if;
      v_name := coalesce(nullif(btrim(r.contact_name), ''), r.display_name, 'there');
      v_label := case r.kind
                   when 'id_document' then 'ID or passport'
                   when 'authority' then 'proof of authority to let'
                   when 'kra_pin' then 'KRA PIN certificate'
                   else 'business registration' end;
      v_when := to_char(r.expires_on, 'FMDD Mon YYYY');

      insert into public.host_document_expiry_notice (document_id, stage, expires_on, recipient)
      values (r.id, r.stage, r.expires_on, v_email)
      on conflict do nothing;
      if not found then
        continue;
      end if;

      perform public.fn_notify_enqueue(
        p_channel => 'email', p_recipient => v_email,
        p_template => case when r.stage = 'expired' then 'host_document_expired' else 'host_document_expiring' end,
        p_subject => case when r.stage = 'expired' then 'Your ' || v_label || ' on NexG has expired'
                          else 'Your ' || v_label || ' on NexG expires on ' || v_when end,
        p_body => 'Hi ' || v_name || ',' || E'\n\n'
          || case when r.stage = 'expired'
               then 'The ' || v_label || ' you gave NexG expired on ' || v_when || '.'
               else 'The ' || v_label || ' you gave NexG expires on ' || v_when || ' ('
                    || (r.expires_on - v_today) || case when r.expires_on - v_today = 1 then ' day' else ' days' end
                    || ' from today).' end
          || E'\n\n'
          || case when r.kind in ('id_document', 'authority')
               then 'NexG needs a current one to keep your host account in good standing. '
               else '' end
          || 'Sign in to your host workspace, open Documents and upload the new one.'
          || E'\n\n' || '— NexG Concierge',
        p_payload => jsonb_build_object('host_id', r.host_id, 'document_id', r.id, 'kind', r.kind,
                                        'expires_on', r.expires_on, 'stage', r.stage));
      v_sent := v_sent + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'Document expiry notice for host % failed: %', r.host_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'sent', v_sent, 'failed', v_failed);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'host-document-expiry-notices') then
      perform cron.unschedule('host-document-expiry-notices');
    end if;
    -- 04:00 UTC is 07:00 in Nairobi.
    perform cron.schedule('host-document-expiry-notices', '0 4 * * *',
      'select public.cron_host_document_expiry_notices()');
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 6. grants

revoke all on function public.fn_host_document_expiry_state(text, timestamptz, date),
  public.rpc_host_document_set_expiry(uuid, date),
  public.cron_host_document_expiry_notices()
from public, anon;
revoke all on function public.cron_host_document_expiry_notices() from authenticated;
grant execute on function public.fn_host_document_expiry_state(text, timestamptz, date),
  public.rpc_host_document_set_expiry(uuid, date)
to authenticated;
grant execute on function public.cron_host_document_expiry_notices() to service_role;

revoke all on function public.rpc_console_stays_hosts(text, text, integer, integer) from public, anon;
grant execute on function public.rpc_console_stays_hosts(text, text, integer, integer) to authenticated;
