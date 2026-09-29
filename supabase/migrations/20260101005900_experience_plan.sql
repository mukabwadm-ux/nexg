-- Customize Your Experience · the guest's day.
--
-- A plan is one built day: what the guest asked for, the blocks the
-- allocator assembled, the thread with their concierge, and the money.
--
-- Two places where this departs from the build prompt, both deliberate:
--
--  * The prompt gives `plan.session_id` with "a signed-session claim" for
--    anonymous building. This project already does anonymous building, for
--    merchant and rider applications, with Supabase anonymous auth and the
--    claim in 20260101001700 — a real session, owned by auth.uid(), that
--    survives sign-in. Inventing a second identity mechanism for the same
--    problem would give us two things to get wrong instead of one.
--
--  * The prompt gives `unit_id` referencing property/unit. Hotels & Airbnb
--    is designed and not built; there is no such table to point at. The
--    stay is a label and a point, which is all the allocator needs to
--    measure travel time from where they are sleeping, and it is replaced
--    by a foreign key the day that module lands.

create type public.plan_status as enum (
  'draft', 'sent', 'confirming', 'quoted', 'changes_requested',
  'approved', 'paid', 'in_progress', 'completed', 'cancelled', 'expired'
);

create type public.plan_block_status as enum (
  'proposed', 'confirmed', 'changed', 'unavailable', 'removed', 'done'
);

create type public.hold_status as enum ('none', 'requested', 'held', 'declined', 'expired');

create sequence public.plan_reference_seq start 1000;

create table public.plan (
  id uuid primary key default gen_random_uuid(),
  /*
   * A reference a guest can read down a phone line, as tickets do.
   * Defaulted rather than supplied: a draft that exists has a reference,
   * so the one the guest quotes on the phone is the one they saw while
   * building and does not change when they send it.
   */
  reference text not null unique
    default ('NX-X-' || nextval('public.plan_reference_seq')::text),

  /*
   * The guest. Anonymous while they build; the same row once they verify a
   * phone at Send, because Supabase anonymous auth upgrades the session in
   * place rather than issuing a new user.
   */
  user_id uuid references auth.users (id) on delete set null,
  guest_name text,
  guest_phone text,

  city_id uuid not null references public.city (id) on delete restrict,

  /* Where they are sleeping. See the note at the top of this file. */
  stay_label text,
  stay_point extensions.geography(Point, 4326),

  duration text not null default 'day' check (duration in ('evening', 'day', 'weekend', 'dates')),
  party_type text not null default 'couple'
    check (party_type in ('solo', 'couple', 'family', 'group')),
  party_size integer not null default 2 check (party_size between 1 and 40),
  date date,
  end_date date,
  budget_kes bigint check (budget_kes is null or budget_kes > 0),
  moods public.mood[] not null default '{}',
  /* The follow-up chips under each mood, plus the transport answer. */
  answers jsonb not null default '{}'::jsonb,
  notes text,

  status public.plan_status not null default 'draft',
  curated_day_id uuid references public.curated_day (id) on delete set null,

  concierge_id uuid references public.staff_user (id) on delete set null,
  claimed_at timestamptz,
  first_reply_at timestamptz,
  quoted_at timestamptz,
  sla_first_reply_due_at timestamptz,
  sla_quote_due_at timestamptz,
  /* Pre-computed advisories for the queue panel. See fn_plan_flags. */
  flags jsonb not null default '[]'::jsonb,
  handover_note text,

  estimate_total_kes bigint,
  quote_total_kes bigint,
  pay_on_day_total_kes bigint,
  concierge_fee_kes bigint,

  sent_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  expires_at timestamptz,
  completed_at timestamptz,
  cancel_reason text,
  review_requested_at timestamptz,

  /* Share links are capabilities: the token is never stored, only its hash. */
  share_token_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plan_dates_ordered check (end_date is null or date is null or end_date >= date),
  constraint plan_quote_is_timed check (status <> 'quoted' or quoted_at is not null),
  /*
   * Money never moves without a reference from the payments provider. There
   * is no payments provider wired yet, which is exactly why this is a
   * constraint and not a convention: nothing can quietly mark a day paid.
   */
  constraint plan_paid_is_referenced check (
    status not in ('paid', 'in_progress', 'completed')
    or (paid_at is not null and coalesce(trim(payment_reference), '') <> '')
  ),
  constraint plan_cancelled_has_a_reason check (
    status <> 'cancelled' or coalesce(trim(cancel_reason), '') <> ''
  )
);

create index plan_queue_idx on public.plan (status, sent_at)
  where status in ('sent', 'confirming', 'quoted', 'changes_requested');
create index plan_concierge_idx on public.plan (concierge_id, status);
create index plan_user_idx on public.plan (user_id, created_at desc);
create index plan_city_idx on public.plan (city_id, status);

create trigger plan_set_updated_at
  before update on public.plan
  for each row execute function public.tg_set_updated_at();

comment on table public.plan is
  'One day a guest built. Anonymous until they verify a phone at Send; owned by auth.uid() throughout.';

-- ───────────────────────────────────────────────────── the timeline

create table public.plan_block (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plan (id) on delete cascade,

  slot public.block_slot not null,
  start_time time,
  end_time time,
  kind public.block_kind not null,
  component_id uuid references public.experience_component (id) on delete set null,
  event_id uuid references public.event (id) on delete set null,

  /*
   * The title and price the guest was shown, frozen at the moment they were
   * shown it. A component's price changing next week must not silently
   * rewrite what somebody already approved.
   */
  title_snapshot text not null,
  subtitle_snapshot text,
  price_estimate_kes bigint,
  price_quoted_kes bigint,
  pay_on_day jsonb not null default '[]'::jsonb,

  /* The ride home is included by the night block, not charged twice. */
  included_by uuid references public.plan_block (id) on delete set null,
  anchored boolean not null default false,
  swap_group text,

  status public.plan_block_status not null default 'proposed',
  change_note text,
  /* What it looked like before the concierge changed it, so the guest can
     be shown "changed from" rather than just a different row. */
  changed_from jsonb,

  hold_status public.hold_status not null default 'none',
  hold_requested_at timestamptz,
  hold_expires_at timestamptz,
  partner_contact_log jsonb not null default '[]'::jsonb,

  assigned_rider_id uuid references public.rider (id) on delete set null,
  assigned_driver_partner_id uuid references public.experience_partner (id) on delete set null,
  ticket_asset_paths text[] not null default '{}',
  done_at timestamptz,

  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plan_block_title_not_blank check (length(trim(title_snapshot)) > 0),
  /*
   * The two rules the build prompt calls out as inviolable, written where
   * they cannot be forgotten: a confirmed block carries a price, and a
   * change or an unavailability carries a reason the guest will read.
   */
  constraint plan_block_confirmed_has_a_price check (
    status <> 'confirmed' or price_quoted_kes is not null
  ),
  constraint plan_block_change_has_a_note check (
    status not in ('changed', 'unavailable', 'removed')
    or coalesce(trim(change_note), '') <> ''
  ),
  constraint plan_block_done_is_timed check (status <> 'done' or done_at is not null),
  constraint plan_block_free_has_no_component check (
    kind <> 'free' or component_id is null
  )
);

create index plan_block_plan_idx on public.plan_block (plan_id, sort);
create index plan_block_hold_idx on public.plan_block (hold_status, hold_expires_at)
  where hold_status = 'requested';

create trigger plan_block_set_updated_at
  before update on public.plan_block
  for each row execute function public.tg_set_updated_at();

comment on column public.plan_block.included_by is
  'The block that already pays for this one — a ride home included with a night out. Included blocks show INCLUDED and never add to the total.';

-- ──────────────────────────────────────────────────────── the thread

create table public.plan_message (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plan (id) on delete cascade,
  author_type public.actor_type not null,
  author_id uuid,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint plan_message_body_not_blank check (length(trim(body)) > 0)
);

create index plan_message_plan_idx on public.plan_message (plan_id, created_at);

/* Narrow, append-only. The audit log is the record of who did what; this is
   the shape of the funnel, cheap enough to read on every queue render. */
create table public.plan_event (
  id bigserial primary key,
  plan_id uuid not null references public.plan (id) on delete cascade,
  from_status public.plan_status,
  to_status public.plan_status not null,
  actor uuid,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index plan_event_plan_idx on public.plan_event (plan_id, at);

create table public.plan_assignment_event (
  id bigserial primary key,
  plan_id uuid not null references public.plan (id) on delete cascade,
  from_concierge_id uuid references public.staff_user (id) on delete set null,
  to_concierge_id uuid references public.staff_user (id) on delete set null,
  reason text,
  at timestamptz not null default now()
);

create index plan_assignment_plan_idx on public.plan_assignment_event (plan_id, at);

-- ───────────────────────────────────────────────────────── holds

create table public.partner_hold (
  id uuid primary key default gen_random_uuid(),
  plan_block_id uuid not null references public.plan_block (id) on delete cascade,
  partner_id uuid not null references public.experience_partner (id) on delete restrict,
  requested_by uuid references public.staff_user (id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'phone', 'email', 'portal')),
  message_sent text,
  status public.hold_status not null default 'requested',
  holds_until timestamptz,
  responded_at timestamptz,
  response_note text,
  created_at timestamptz not null default now(),

  constraint partner_hold_answer_is_timed check (
    status in ('requested', 'expired') or responded_at is not null
  )
);

create index partner_hold_block_idx on public.partner_hold (plan_block_id, created_at);
create index partner_hold_partner_idx on public.partner_hold (partner_id, status);

comment on table public.partner_hold is
  'A request to a partner to hold a slot. Answered in the portal by partners who have it, recorded by the concierge for everyone else.';

-- ────────────────────────────────────────────── the state machine
--
-- The build prompt states two rules in prose. Prose does not hold at 02:00
-- when a retry fires twice, so they are a trigger.

create or replace function public.tg_plan_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'draft'             then array['sent', 'cancelled']
    when 'sent'              then array['confirming', 'quoted', 'cancelled', 'expired']
    when 'confirming'        then array['quoted', 'cancelled', 'expired']
    when 'quoted'            then array['changes_requested', 'approved', 'cancelled', 'expired']
    when 'changes_requested' then array['confirming', 'quoted', 'cancelled', 'expired']
    when 'approved'          then array['paid', 'cancelled']
    when 'paid'              then array['in_progress', 'completed', 'cancelled']
    when 'in_progress'       then array['completed', 'cancelled']
    when 'completed'         then array[]::text[]
    when 'cancelled'         then array[]::text[]
    when 'expired'           then array['confirming', 'quoted', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status::text = any (v_allowed)) then
    raise exception 'A plan cannot go from % to %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  /*
   * Said twice on purpose. The transition table above already refuses
   * sent → paid, but this is the rule that costs a guest money if it ever
   * slips, so it is also checked on its own terms.
   */
  if new.status = 'approved' and old.status <> 'quoted' then
    raise exception 'A day can only be approved from a quote.' using errcode = 'check_violation';
  end if;

  insert into public.plan_event (plan_id, from_status, to_status, actor)
  values (new.id, old.status, new.status, authz.staff_id());

  return new;
end;
$$;

create trigger plan_status_transition
  before update of status on public.plan
  for each row execute function public.tg_plan_status_transition();

comment on function public.tg_plan_status_transition is
  'The plan state machine. Refuses any transition not in the table, and refuses approval that did not come from a quote whatever else is true.';

-- ───────────────────────────────────────────────────────────── RLS

alter table public.plan enable row level security;
alter table public.plan_block enable row level security;
alter table public.plan_message enable row level security;
alter table public.plan_event enable row level security;
alter table public.plan_assignment_event enable row level security;
alter table public.partner_hold enable row level security;

/*
 * Who may see a plan.
 *
 * The guest who owns it, and staff who reach the module. `city_lead` is
 * scoped: the matrix gives them own_city and a Mombasa lead reading a
 * Nairobi guest's phone number would make that a lie.
 */
create or replace function authz.can_see_plan(p_city uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or (
        authz.reaches_module('experiences')
        and (
          not authz.has_role('city_lead')
          or authz.has_role('city_lead', p_city)
          or authz.has_role('ops_manager', p_city)
          or authz.has_role('concierge_lead', p_city)
          or authz.has_role('concierge_agent', p_city)
          or authz.has_role('growth')
          or authz.has_role('finance')
        )
      )
$$;

grant execute on function authz.can_see_plan(uuid) to authenticated, service_role;

create policy plan_read_owner on public.plan
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy plan_write_owner on public.plan
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and status in ('draft', 'quoted', 'changes_requested')
  )
  with check (user_id = (select auth.uid()));

create policy plan_insert_owner on public.plan
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'draft');

create policy plan_read_staff on public.plan
  for select to authenticated
  using (authz.can_see_plan(city_id));

/*
 * Staff writes go through the RPCs, which check the assignment. This policy
 * exists so the RPCs' own updates are not blocked and so a lead can
 * reassign; `growth` and `finance` are absent from it deliberately — the
 * matrix says they read this module, not that they work it.
 */
create policy plan_write_desk on public.plan
  for update to authenticated
  using (
    authz.is_super_admin()
    or authz.has_role('ops_manager', city_id)
    or authz.has_role('concierge_lead', city_id)
    or concierge_id = authz.staff_id()
  )
  with check (
    authz.is_super_admin()
    or authz.has_role('ops_manager', city_id)
    or authz.has_role('concierge_lead', city_id)
    or concierge_id = authz.staff_id()
  );

/* Blocks, messages and the logs follow their plan. */
create policy plan_block_read on public.plan_block
  for select to authenticated
  using (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and (p.user_id = (select auth.uid()) or authz.can_see_plan(p.city_id))
    )
  );

create policy plan_block_write_owner on public.plan_block
  for all to authenticated
  using (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and p.user_id = (select auth.uid()) and p.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and p.user_id = (select auth.uid()) and p.status = 'draft'
    )
  );

create policy plan_block_write_desk on public.plan_block
  for all to authenticated
  using (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and (authz.is_super_admin() or p.concierge_id = authz.staff_id()
             or authz.has_role('ops_manager', p.city_id)
             or authz.has_role('concierge_lead', p.city_id))
    )
  )
  with check (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and (authz.is_super_admin() or p.concierge_id = authz.staff_id()
             or authz.has_role('ops_manager', p.city_id)
             or authz.has_role('concierge_lead', p.city_id))
    )
  );

create policy plan_message_read on public.plan_message
  for select to authenticated
  using (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and (p.user_id = (select auth.uid()) or authz.can_see_plan(p.city_id))
    )
  );

create policy plan_message_insert on public.plan_message
  for insert to authenticated
  with check (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and (
          (p.user_id = (select auth.uid()) and author_type = 'guest')
          or (author_type = 'staff' and author_id = authz.staff_id()
              and (authz.is_super_admin() or p.concierge_id = authz.staff_id()
                   or authz.has_role('ops_manager', p.city_id)
                   or authz.has_role('concierge_lead', p.city_id)))
        )
    )
  );

create policy plan_event_read on public.plan_event
  for select to authenticated
  using (
    exists (
      select 1 from public.plan p where p.id = plan_id
        and (p.user_id = (select auth.uid()) or authz.can_see_plan(p.city_id))
    )
  );

create policy plan_assignment_read_staff on public.plan_assignment_event
  for select to authenticated
  using (
    exists (select 1 from public.plan p where p.id = plan_id and authz.can_see_plan(p.city_id))
  );

/* A partner sees the holds asked of it, and no others. */
create policy partner_hold_read_partner on public.partner_hold
  for select to authenticated
  using (
    partner_id in (
      select id from public.experience_partner where portal_user_id = (select auth.uid())
    )
  );

create policy partner_hold_answer_partner on public.partner_hold
  for update to authenticated
  using (
    partner_id in (
      select id from public.experience_partner
      where portal_user_id = (select auth.uid()) and can_answer_holds
    )
  )
  with check (
    partner_id in (
      select id from public.experience_partner
      where portal_user_id = (select auth.uid()) and can_answer_holds
    )
  );

create policy partner_hold_staff on public.partner_hold
  for all to authenticated
  using (
    exists (
      select 1 from public.plan_block b join public.plan p on p.id = b.plan_id
      where b.id = plan_block_id and authz.can_see_plan(p.city_id)
    )
  )
  with check (
    exists (
      select 1 from public.plan_block b join public.plan p on p.id = b.plan_id
      where b.id = plan_block_id
        and (authz.is_super_admin() or p.concierge_id = authz.staff_id()
             or authz.has_role('ops_manager', p.city_id)
             or authz.has_role('concierge_lead', p.city_id))
    )
  );
