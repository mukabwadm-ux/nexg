-- What the guest said afterwards.
--
-- Four rules, and all four are in the database rather than in a screen,
-- because every one of them is the kind of thing that erodes the first
-- time somebody is in a hurry:
--
--   1. A review is asked for once. Not "usually once" — a unique
--      constraint on plan_id in review_request.
--   2. The words and the rating are never edited. Not by growth, not by a
--      super admin, not by the service role. A trigger, not a convention.
--   3. Nothing is published without a person deciding, and the decision
--      and its reason are logged.
--   4. It appears in the form the guest consented to and no other. Asking
--      for a full name they did not agree to is the one mistake here that
--      cannot be taken back.

create type public.review_status as enum ('received', 'approved', 'kept_private');

create type public.review_display as enum ('initial', 'full_name', 'anonymous');

create table public.review (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.plan (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,

  rating integer not null check (rating between 1 and 5),
  body text not null,
  word_count integer not null default 0,
  received_at timestamptz not null default now(),
  channel text not null default 'web' check (channel in ('whatsapp_link', 'web', 'sms_link')),

  consent_publish boolean not null default false,
  consent_display public.review_display not null default 'initial',

  /*
   * Frozen at the moment of approval. The guest's name changing later, or
   * the day being renamed, must not silently rewrite a published quote.
   */
  display_name_snapshot text,
  area_snapshot text,
  day_title_snapshot text,

  status public.review_status not null default 'received',
  /* {pii_found, pii_kinds, partner_staff_named, consent_ok, negative_mention} */
  checks jsonb not null default '{}'::jsonb,
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  reply_body text,
  reply_sent_at timestamptz,
  published_at timestamptz,

  created_at timestamptz not null default now(),

  constraint review_body_not_blank check (length(trim(body)) > 0),
  /* Timed, not attributed — see the note on event_published_is_timed.
     Who decided is in the audit log and survives them leaving. */
  constraint review_decision_is_timed check (
    status = 'received' or decided_at is not null
  ),
  constraint review_private_has_a_reason check (
    status <> 'kept_private' or coalesce(trim(decision_reason), '') <> ''
  ),
  /* Published means published: consent, a decision, and a time. */
  constraint review_published_is_consented check (
    status <> 'approved' or (consent_publish and published_at is not null)
  )
);

create index review_queue_idx on public.review (status, received_at)
  where status = 'received';

/*
 * Asked once. The constraint is the rule — a second request cannot be
 * written, so no code path can decide today is an exception.
 */
create table public.review_request (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.plan (id) on delete cascade,
  sent_at timestamptz not null default now(),
  channel text not null default 'whatsapp_link',
  /* The link is a capability. Only its hash is kept. */
  token_hash text not null,
  expires_at timestamptz not null,
  opened_at timestamptz
);

comment on table public.review_request is
  'One per plan, enforced by the unique constraint. A guest is asked for a review once, ever.';

-- ─────────────────────────────────────────────── the words are theirs

create or replace function public.tg_review_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.rating is distinct from old.rating then
    raise exception 'A review is not editable. Approve it or keep it private.'
      using errcode = 'insufficient_privilege';
  end if;

  /* Nor may consent be widened after the fact by whoever is approving. */
  if new.consent_display is distinct from old.consent_display
     and old.consent_display <> 'full_name' and new.consent_display = 'full_name' then
    raise exception 'The guest did not agree to their full name being shown.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger review_is_immutable
  before update on public.review
  for each row execute function public.tg_review_is_immutable();

comment on function public.tg_review_is_immutable is
  'The body and the rating cannot change, by anyone, ever — the service role included. Consent cannot be widened to a full name that was not given.';

-- ────────────────────────────────────────────── what to look at twice

/*
 * Not a filter and not a censor: it tells the person approving what is in
 * the text so they read it with their eyes open. A phone number in a
 * public quote is the guest's own number, and nobody means to publish it.
 */
create or replace function public.fn_review_checks(p_plan_id uuid, p_body text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kinds text[] := '{}';
  v_staff boolean := false;
  v_name text;
begin
  /*
   * The casts are load-bearing. `text[] || 'phone'` is ambiguous — Postgres
   * resolves it as array || array and then fails parsing 'phone' as an
   * array literal, which surfaces as "malformed array literal" from inside
   * a function that looks like it is only doing regexes.
   */
  if p_body ~ '(\+?254|\y0)[17]\d{8}\y' then v_kinds := v_kinds || 'phone'::text; end if;
  if p_body ~* '\yK[A-Z]{2,3} ?\d{3}[A-Z]?\y' then v_kinds := v_kinds || 'plate'::text; end if;
  if p_body ~* '[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+' then
    v_kinds := v_kinds || 'email'::text;
  end if;

  /* A partner's contact named in public is that person's problem, not the
     business's, so it is called out separately. */
  for v_name in
    select distinct pr.contact_name
    from public.plan_block b
    join public.experience_component k on k.id = b.component_id
    join public.experience_partner pr on pr.id = k.partner_id
    where b.plan_id = p_plan_id and coalesce(trim(pr.contact_name), '') <> ''
  loop
    if position(lower(v_name) in lower(p_body)) > 0 then v_staff := true; end if;
  end loop;

  return jsonb_build_object(
    'pii_found', array_length(v_kinds, 1) is not null,
    'pii_kinds', to_jsonb(v_kinds),
    'partner_staff_named', v_staff,
    'negative_mention', p_body ~* '\y(loud|late|rude|dirty|cold|slow|wrong|miss)\y'
  );
end;
$$;

-- ──────────────────────────────────────────────────── asking for one

create or replace function public.rpc_request_review(p_plan_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_token text;
begin
  select * into v_plan from public.plan where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'No such day.' using errcode = 'no_data_found';
  end if;
  if not authz.works_plan(p_plan_id) and not authz.has_role('growth') then
    raise exception 'Not yours to ask.' using errcode = 'insufficient_privilege';
  end if;
  if v_plan.status <> 'completed' then
    raise exception 'Ask after the day, not before it.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.review_request where plan_id = p_plan_id) then
    raise exception 'They have already been asked. Once is the rule.'
      using errcode = 'unique_violation';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.review_request (plan_id, token_hash, expires_at)
  values (
    p_plan_id, encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + make_interval(days => public.fn_setting_int('experience_review_link_days', 14))
  );

  update public.plan set review_requested_at = now() where id = p_plan_id;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('review_request', p_plan_id, v_plan.guest_phone, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'review.requested',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id);

  /* Returned once, to be put in the message. It is not stored. */
  return v_token;
end;
$$;

create or replace function public.rpc_submit_review(
  p_token text,
  p_rating integer,
  p_body text,
  p_consent_publish boolean,
  p_consent_display public.review_display default 'initial'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.review_request;
  v_plan public.plan;
begin
  select * into v_req from public.review_request
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if v_req.id is null then
    raise exception 'That link is not valid.' using errcode = 'no_data_found';
  end if;
  if v_req.expires_at < now() then
    raise exception 'That link has expired.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.review where plan_id = v_req.plan_id) then
    raise exception 'You have already left a review for this day.'
      using errcode = 'unique_violation';
  end if;

  select * into v_plan from public.plan where id = v_req.plan_id;

  insert into public.review (
    plan_id, user_id, rating, body, word_count, channel,
    consent_publish, consent_display, checks, day_title_snapshot
  )
  values (
    v_req.plan_id, v_plan.user_id, p_rating, trim(p_body),
    array_length(regexp_split_to_array(trim(p_body), '\s+'), 1),
    v_req.channel, coalesce(p_consent_publish, false), p_consent_display,
    public.fn_review_checks(v_req.plan_id, trim(p_body)),
    coalesce(v_plan.reference, 'A day')
  );

  update public.review_request set opened_at = coalesce(opened_at, now()) where id = v_req.id;

  insert into public.notification (kind, plan_id, status)
  values ('desk_sla_breach', v_req.plan_id, 'pending');

  perform audit.log('guest'::public.actor_type, 'experiences', 'review.received',
    p_target_type => 'plan', p_target_id => v_req.plan_id, p_city_id => v_plan.city_id,
    p_after => jsonb_build_object('rating', p_rating, 'consent', p_consent_publish));

  return 'Thank you — a person reads every one of these.';
end;
$$;

-- ─────────────────────────────────────────────── deciding about one

create or replace function public.rpc_decide_review(
  p_review_id uuid,
  p_decision public.review_status,
  p_reason text default null,
  p_display public.review_display default null
)
returns public.review
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.review;
  v_plan public.plan;
  v_name text;
begin
  if not (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager')) then
    raise exception 'Only growth or ops decides about a review.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('approved', 'kept_private') then
    raise exception 'Approve it or keep it private. There is no third thing.'
      using errcode = 'check_violation';
  end if;

  select * into v_review from public.review where id = p_review_id;
  if v_review.id is null then
    raise exception 'No such review.' using errcode = 'no_data_found';
  end if;

  select * into v_plan from public.plan where id = v_review.plan_id;

  if p_decision = 'approved' then
    if not v_review.consent_publish then
      raise exception 'They did not agree to this being published.'
        using errcode = 'insufficient_privilege';
    end if;
    if p_display = 'full_name' and v_review.consent_display <> 'full_name' then
      raise exception 'They did not agree to their full name being shown.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Say why it is being kept private.' using errcode = 'check_violation';
    end if;
  end if;

  /* The display form is resolved here, once, and frozen. */
  v_name := case coalesce(p_display, v_review.consent_display)
    when 'full_name' then v_plan.guest_name
    when 'anonymous' then null
    else
      coalesce(
        split_part(trim(v_plan.guest_name), ' ', 1)
          || case when position(' ' in trim(v_plan.guest_name)) > 0
                  then ' ' || left(split_part(trim(v_plan.guest_name), ' ', 2), 1) || '.'
                  else '' end,
        null)
  end;

  update public.review set
    status = p_decision,
    consent_display = coalesce(p_display, consent_display),
    display_name_snapshot = case when p_decision = 'approved' then v_name end,
    area_snapshot = case
      when p_decision = 'approved'
      then nullif(split_part(coalesce(v_plan.stay_label, ''), '· ', 2), '') end,
    day_title_snapshot = coalesce(day_title_snapshot, v_plan.reference),
    decided_by = authz.staff_id(),
    decided_at = now(),
    decision_reason = nullif(trim(coalesce(p_reason, '')), ''),
    published_at = case when p_decision = 'approved' then now() end
  where id = p_review_id
  returning * into v_review;

  perform audit.log('staff'::public.actor_type, 'experiences',
    case when p_decision = 'approved' then 'review.approved' else 'review.kept_private' end,
    p_target_type => 'review', p_target_id => p_review_id,
    p_reason => nullif(trim(coalesce(p_reason, '')), ''), p_city_id => v_plan.city_id,
    p_after => jsonb_build_object('display', v_review.consent_display,
                                  'shown_as', v_review.display_name_snapshot));

  return v_review;
end;
$$;

create or replace function public.rpc_reply_review(p_review_id uuid, p_body text)
returns public.review
language plpgsql
security definer
set search_path = ''
as $$
declare v_review public.review;
begin
  if not (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager')) then
    raise exception 'Not yours to answer.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write something.' using errcode = 'check_violation';
  end if;

  update public.review set reply_body = trim(p_body), reply_sent_at = now()
  where id = p_review_id returning * into v_review;

  insert into public.notification (kind, plan_id, status)
  values ('review_reply', v_review.plan_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'review.replied',
    p_target_type => 'review', p_target_id => p_review_id);

  return v_review;
end;
$$;

-- ──────────────────────────────────────────────── what the world sees

/*
 * Approved reviews, in the form consented to. No plan id, no guest id, no
 * dates precise enough to identify a booking — this is the one place
 * where a guest's words leave the building.
 */
create view public.review_public
with (security_invoker = false)
/*
 * Definer, not invoker. The base tables are closed to anon by RLS, so an
 * invoker view returns an empty list to exactly the people it exists for.
 * The view's own WHERE clause is the visibility rule — the same choice
 * merchant_public makes, and the reason it restates the rule in full
 * rather than trusting a status column read somewhere else.
 */
as
select
  r.rating,
  r.body,
  r.display_name_snapshot,
  r.area_snapshot,
  r.day_title_snapshot,
  r.published_at
from public.review r
where r.status = 'approved' and r.consent_publish;

grant select on public.review_public to anon, authenticated;

-- ───────────────────────────────────────────────────────── RLS

alter table public.review enable row level security;
alter table public.review_request enable row level security;

create policy review_read_staff on public.review
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

/* No insert or update policy at all. Everything goes through the RPCs,
   which are the only place the rules at the top of this file exist. */

create policy review_request_read_staff on public.review_request
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

grant execute on function
  public.fn_review_checks(uuid, text),
  public.rpc_request_review(uuid),
  public.rpc_decide_review(uuid, public.review_status, text, public.review_display),
  public.rpc_reply_review(uuid, text)
to authenticated, service_role;

/* The guest follows a link from a message; they may not be signed in. */
grant execute on function
  public.rpc_submit_review(text, integer, text, boolean, public.review_display)
to anon, authenticated;
