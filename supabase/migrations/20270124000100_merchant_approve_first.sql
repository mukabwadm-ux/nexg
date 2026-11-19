-- Approve first: a merchant applies with the basics, NexG approves, and the
-- rest is finished in the dashboard before NexG takes the business live.
--
-- Until now an application could only be submitted with the onboarding
-- template details (20270110410100) and the merchant agreement accepted
-- (20261124000100), so the sign-up was one long form. The owner decided on
-- 19 Nov 2026 that a merchant should be approved on the basics (business,
-- contact, verified email, category and activity) and give the rest from
-- their dashboard, where they are already part of NexG.
--
-- 1. Submitting no longer needs the onboarding details or the agreement:
--    both submit triggers go. The form that is live today still sends them,
--    so this does not break it.
-- 2. fn_merchant_go_live_missing lists what still stands between a merchant
--    and going live, and whose move it is (the merchant's or NexG's).
-- 3. rpc_merchant_go_live refuses a new-form merchant while anything on that
--    list is open: the onboarding details, the agreement details, accepting
--    the agreement, a main branch, and every required document verified.
--    Merchants without an application keep the old checks.
-- 4. rpc_merchant_setup_todo gives the dashboard and the admin that list.
-- 5. Approval tells the owner, by bell and email, to finish setting up.
-- 6. cron_merchant_setup_reminders reminds owners who still have something
--    to do, 1, 3 and 7 days after approval (bell and email).
--
-- Rollback: re-create the two triggers from 20261124000100 and
-- 20270110410100, re-run rpc_merchant_go_live from 20261218000100, then drop
-- the objects created here and unschedule 'merchant-setup-reminders'.

-- ------------------------------------------------------------ 1. submitting

drop trigger if exists merchant_application_onboarding_required on public.merchant_application;
drop trigger if exists merchant_application_agreement_required on public.merchant_application;

-- ------------------------------------------------------------ 2. what is missing

/* What a merchant still needs before going live, in the order the dashboard
   shows it. Each item: key, label, who ('merchant' or 'nexg') and, where it
   helps, a count. An empty array means nothing is missing. */
create or replace function public.fn_merchant_go_live_missing(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  a public.merchant_application;
  v_items jsonb := '[]'::jsonb;
  v_category text;
  v_details int;
  v_agreement public.merchant_agreement;
  v_to_upload int;
  v_to_check int;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;

  if a.merchant_id is not null then
    if not (a.review_state = 'approved' and a.approved_revision = a.revision
            and a.submitted_revision = a.revision) then
      v_items := v_items || jsonb_build_object('key', 'application', 'who', 'nexg',
        'label', 'NexG approves your application');
    end if;

    v_category := public.fn_merchant_onboarding_category(p_merchant_id);
    v_details := jsonb_array_length(public.fn_merchant_onboarding_missing_for(
      v_category,
      coalesce((select oa.answers from public.merchant_onboarding_answer oa
                where oa.merchant_id = p_merchant_id), '{}'::jsonb)));
    if v_details > 0 then
      v_items := v_items || jsonb_build_object('key', 'onboarding_details', 'who', 'merchant',
        'label', 'Onboarding details', 'count', v_details);
    end if;

    if not exists (
      select 1 from public.merchant_agreement_party p
      where p.merchant_id = p_merchant_id
        and nullif(trim(coalesce(p.registration_number, '')), '') is not null
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement_details', 'who', 'merchant',
        'label', 'Your details for the agreement');
    end if;

    v_agreement := public.fn_merchant_agreement_for_category(public.fn_merchant_agreement_category(p_merchant_id));
    if v_agreement.id is not null and not exists (
      select 1 from public.merchant_agreement_acceptance x
      where x.merchant_id = p_merchant_id and x.agreement_id = v_agreement.id
        and x.version = v_agreement.version
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement', 'who', 'merchant',
        'label', 'Read and accept the merchant agreement');
    end if;
  end if;

  if not exists (select 1 from public.merchant_branch b
                 where b.merchant_id = p_merchant_id and b.is_primary) then
    v_items := v_items || jsonb_build_object('key', 'branch', 'who', 'merchant',
      'label', 'Your business location');
  end if;

  /* A required document is the merchant's to do while it has no current
     upload or the last one was rejected or expired; NexG's while it waits to
     be checked. */
  select
    count(*) filter (where d.status is null or d.status in ('rejected', 'expired')),
    count(*) filter (where d.status = 'uploaded')
  into v_to_upload, v_to_check
  from public.fn_merchant_required_docs(p_merchant_id) q
  left join lateral (
    select doc.status::text as status
    from public.document doc
    where doc.owner_type = 'merchant' and doc.owner_id = p_merchant_id
      and doc.requirement_id = q.id and doc.superseded_at is null
    order by doc.created_at desc
    limit 1
  ) d on true;

  if v_to_upload > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents', 'who', 'merchant',
      'label', 'Documents to upload', 'count', v_to_upload);
  end if;
  if v_to_check > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents_review', 'who', 'nexg',
      'label', 'NexG checks your documents', 'count', v_to_check);
  end if;

  return v_items;
end;
$$;

revoke all on function public.fn_merchant_go_live_missing(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_go_live_missing(uuid) to service_role;

-- ------------------------------------------------------------ 3. going live

create or replace function public.rpc_merchant_go_live(p_merchant_id uuid, p_reason text default null)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_before public.partner_status;
  v_staff uuid;
  v_required int;
  v_verified int;
  v_branches int;
  v_review text;
  v_missing jsonb;
begin
  select * into v_merchant from public.merchant where id = p_merchant_id for update;
  if v_merchant.id is null then
    raise exception 'No merchant with id %', p_merchant_id using errcode = 'no_data_found';
  end if;

  v_staff := authz.staff_id();
  if v_staff is null or not authz.can_manage_merchants(v_merchant.city_id) then
    raise exception 'You need merchant_ops or super_admin for this city to take a merchant live.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_merchant.status = 'live' then
    return v_merchant;
  end if;

  if exists (select 1 from public.merchant_application a where a.merchant_id = p_merchant_id) then
    -- A new-form merchant goes live on the approval of its current revision.
    select a.review_state into v_review
    from public.merchant_application a
    where a.merchant_id = p_merchant_id
      and not (a.review_state = 'approved' and a.approved_revision = a.revision
               and a.submitted_revision = a.revision);

    if found then
      raise exception 'Approve this merchant''s application first (Merchants › Applications). Its current review state is %.',
        case when v_review = 'approved' then 'a newer revision waiting for review'
          else replace(v_review, '_', ' ') end
        using errcode = 'check_violation';
    end if;

    -- Then everything it finishes in its dashboard, and its documents checked.
    v_missing := public.fn_merchant_go_live_missing(p_merchant_id);
    if jsonb_array_length(v_missing) > 0 then
      raise exception 'Not ready to go live yet. Still open: %.',
        (select string_agg(i ->> 'label'
                           || case when i ? 'count' then ' (' || (i ->> 'count') || ')' else '' end,
                           '; ' order by n)
         from jsonb_array_elements(v_missing) with ordinality as e(i, n))
        using errcode = 'check_violation';
    end if;
  else
    -- public.merchant_public exposes the primary branch; going live without one
    -- would publish a merchant nobody can be sent to.
    select count(*) into v_branches
    from public.merchant_branch b
    where b.merchant_id = p_merchant_id and b.is_primary;

    if v_branches = 0 then
      raise exception 'This merchant has no primary branch, so there is nowhere to send a rider.'
        using errcode = 'check_violation';
    end if;

    select
      count(*),
      count(*) filter (
        where exists (
          select 1 from public.document d
          where d.owner_type = 'merchant'
            and d.owner_id = p_merchant_id
            and d.requirement_id = q.id
            and d.superseded_at is null
            and d.status = 'verified'
        )
      )
    into v_required, v_verified
    from public.fn_merchant_required_docs(p_merchant_id) q;

    if v_verified < v_required then
      raise exception
        'This merchant has % of % required documents verified.', v_verified, v_required
        using errcode = 'check_violation';
    end if;
  end if;

  v_before := v_merchant.status;

  update public.merchant
  set status = 'live',
      status_reason = p_reason,
      went_live_by = v_staff,
      went_live_at = now()
  where id = p_merchant_id
  returning * into v_merchant;

  perform audit.log(
    p_actor_type => 'staff',
    p_actor_id => v_staff,
    p_module => 'merchant',
    p_action => 'merchant.went_live',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object('status', v_before),
    p_after => jsonb_build_object('status', 'live'),
    p_reason => p_reason,
    p_severity => 'notice',
    p_city_id => v_merchant.city_id
  );

  return v_merchant;
end;
$$;

-- ------------------------------------------------------------ 4. the to-do list

/* The merchant's list of what is left before going live, for its own team
   and for NexG staff. */
create or replace function public.rpc_merchant_setup_todo(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  a public.merchant_application;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  if not (authz.is_merchant_member(m.id) or authz.can_manage_merchants(m.city_id)) then
    raise exception 'Not yours to look at.' using errcode = '42501';
  end if;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;

  return jsonb_build_object(
    'live', m.status = 'live',
    'approved', a.merchant_id is not null and a.review_state = 'approved'
                and a.approved_revision = a.revision and a.submitted_revision = a.revision,
    'approved_at', case when a.review_state = 'approved' then a.reviewed_at end,
    'items', case when m.status = 'live' then '[]'::jsonb
                  else public.fn_merchant_go_live_missing(p_merchant_id) end);
end;
$$;

revoke all on function public.rpc_merchant_setup_todo(uuid) from public, anon;
grant execute on function public.rpc_merchant_setup_todo(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ 5. approval tells the owner

insert into public.notification_email_kind (kind, note)
values ('merchant.application_approved', 'Merchant: application approved, finish setting up to go live'),
       ('merchant.setup_reminder', 'Merchant: still to do before going live')
on conflict (kind) do nothing;

create or replace function public.tg_merchant_application_approved_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_name text;
begin
  if new.review_state = 'approved' and old.review_state is distinct from 'approved'
     and old.approved_revision is null then
    select coalesce(m.trading_name, m.legal_name) into v_name
    from public.merchant m where m.id = new.merchant_id;
    for u in
      select mu.user_id from public.merchant_user mu
      where mu.merchant_id = new.merchant_id and mu.role in ('owner', 'manager')
    loop
      begin
        perform public.fn_notify_user(
          p_user_id => u.user_id, p_kind => 'merchant.application_approved',
          p_title => format('%s is approved', coalesce(v_name, 'Your business')),
          p_body => 'Welcome to NexG. Finish setting up in your dashboard: your onboarding details, '
                    || 'the merchant agreement and your documents. We take you live once they are in '
                    || 'and checked.',
          p_href => '/merchant', p_tone => 'good'::public.notification_tone,
          p_object_type => 'merchant', p_object_id => new.merchant_id,
          p_tag => 'merchant-approved:' || new.merchant_id::text);
      exception when others then
        raise warning 'Approval notice for merchant % failed: %', new.merchant_id, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.tg_merchant_application_approved_notice() from public, anon, authenticated;

drop trigger if exists merchant_application_approved_notice on public.merchant_application;
create trigger merchant_application_approved_notice
  after update of review_state on public.merchant_application
  for each row execute function public.tg_merchant_application_approved_notice();

-- ------------------------------------------------------------ 6. reminders

create table if not exists public.merchant_setup_reminder (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  step smallint not null check (step in (1, 3, 7)),
  sent_at timestamptz not null default now(),
  recipients integer not null default 0,
  primary key (merchant_id, step)
);
alter table public.merchant_setup_reminder enable row level security;
revoke all on public.merchant_setup_reminder from anon, authenticated;

/* Daily: an approved, not-yet-live merchant with something still on its side
   of the list gets one reminder on day 1, 3 and 7 after approval. A job that
   missed days sends only the latest step due, never several at once. */
create or replace function public.cron_merchant_setup_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  u record;
  v_todo text;
  v_sent integer;
  v_reminders integer := 0;
  v_failed integer := 0;
begin
  for r in
    select m.id as merchant_id, coalesce(m.trading_name, m.legal_name) as name, x.step,
           public.fn_merchant_go_live_missing(m.id) as missing
    from public.merchant m
    join public.merchant_application a on a.merchant_id = m.id
    cross join lateral (
      select max(s.step) as step
      from (values (1), (3), (7)) s (step)
      where a.reviewed_at + make_interval(days => s.step) <= now()
    ) x
    where a.review_state = 'approved' and a.approved_revision is not null
      and m.status::text not in ('live', 'paused', 'delisted', 'suspended')
      and m.deleted_at is null
      and m.trading_name not like '[Demo]%'
      and x.step is not null
      and a.reviewed_at > now() - interval '30 days'
      and not exists (select 1 from public.merchant_setup_reminder sr
                      where sr.merchant_id = m.id and sr.step >= x.step)
    order by m.id
  loop
    select string_agg(i ->> 'label', ', ' order by n) into v_todo
    from jsonb_array_elements(r.missing) with ordinality as e(i, n)
    where i ->> 'who' = 'merchant';
    if v_todo is null then
      continue;
    end if;

    begin
      insert into public.merchant_setup_reminder (merchant_id, step)
      values (r.merchant_id, r.step)
      on conflict do nothing;
      if found then
        v_sent := 0;
        for u in
          select mu.user_id from public.merchant_user mu
          where mu.merchant_id = r.merchant_id and mu.role in ('owner', 'manager')
        loop
          perform public.fn_notify_user(
            p_user_id => u.user_id, p_kind => 'merchant.setup_reminder',
            p_title => format('Finish setting up %s to go live', coalesce(r.name, 'your business')),
            p_body => format('You are approved. Still to do in your dashboard: %s.', v_todo),
            p_href => '/merchant', p_tone => 'warning'::public.notification_tone,
            p_object_type => 'merchant', p_object_id => r.merchant_id,
            p_tag => 'merchant-setup:' || r.merchant_id::text || ':' || r.step::text);
          v_sent := v_sent + 1;
        end loop;
        update public.merchant_setup_reminder set recipients = v_sent
        where merchant_id = r.merchant_id and step = r.step;
        v_reminders := v_reminders + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'Setup reminder for merchant % failed: %', r.merchant_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'reminders', v_reminders, 'failed', v_failed);
end;
$$;

revoke all on function public.cron_merchant_setup_reminders() from public, anon, authenticated;
grant execute on function public.cron_merchant_setup_reminders() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'merchant-setup-reminders') then
    perform cron.unschedule('merchant-setup-reminders');
  end if;
  -- 06:00 UTC is 09:00 in Nairobi.
  perform cron.schedule('merchant-setup-reminders', '0 6 * * *',
    'select public.cron_merchant_setup_reminders()');
end;
$$;
