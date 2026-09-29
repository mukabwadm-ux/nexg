-- The Experiences module, the desk lead role, and who is on shift.
--
-- The catalogue policies in the previous migration call
-- authz.reaches_module('experiences'), which is false for everyone until
-- the module exists and the matrix has a row. This is that row.

insert into public.role (key, label, description) values
  ('concierge_lead', 'Concierge lead',
   'Runs the desk: assigns and reassigns plans, is paged when an SLA is missed, and may override a claim.')
on conflict (key) do nothing;

/* Grow, between Featured slots and Careers. */
insert into public.console_module (key, label, section, href, sort) values
  ('experiences', 'Experiences', 'Grow', '/experiences', 85)
on conflict (key) do nothing;

/*
 * Who reaches it, and how much.
 *
 * `growth` owns the catalogue and approves reviews. The desk roles work
 * plans. `finance` gets `view_invoices`, which on this module means the
 * Reports tab and nothing else — a concierge's thread with a guest is not
 * finance's to read, and the matrix has always said so.
 */
insert into public.role_module_access (role_key, module_key, level, note) values
  ('super_admin',     'experiences', 'full',          null),
  ('ops_manager',     'experiences', 'full',          null),
  ('concierge_lead',  'experiences', 'full',          'assigns and reassigns · paged on a missed SLA'),
  ('concierge_agent', 'experiences', 'full',          'works plans · catalogue is read-only'),
  ('city_lead',       'experiences', 'own_city',      null),
  ('growth',          'experiences', 'full',          'catalogue and reviews · no block actions'),
  ('finance',         'experiences', 'view_invoices', 'Reports only · no threads, no guest contact'),
  ('merchant_ops',    'experiences', 'none',          null),
  ('rider_ops',       'experiences', 'none',          null),
  ('hr',              'experiences', 'none',          null),
  ('read_only',       'experiences', 'view',          null),
  ('dpo',             'experiences', 'none',          null)
on conflict (role_key, module_key) do nothing;

/*
 * The new role needs a row for every existing module too, or its holder
 * gets an empty console. A desk lead is an ops manager for the desk and
 * nothing else: they do not touch merchants, money or staff.
 */
insert into public.role_module_access (role_key, module_key, level, note) values
  ('concierge_lead', 'overview',  'full', null),
  ('concierge_lead', 'support',   'full', null),
  ('concierge_lead', 'live_ops',  'full', null),
  ('concierge_lead', 'orders',    'limited', 'refunds up to cap · no post-pickup cancels'),
  ('concierge_lead', 'merchants', 'view', null),
  ('concierge_lead', 'riders',    'view', null),
  ('concierge_lead', 'hotels',    'view', null),
  ('concierge_lead', 'featured',  'none', null),
  ('concierge_lead', 'careers',   'none', null),
  ('concierge_lead', 'finance',   'none', null),
  ('concierge_lead', 'staff',     'none', null),
  ('concierge_lead', 'settings',  'none', null),
  ('concierge_lead', 'audit',     'view', null)
on conflict (role_key, module_key) do nothing;

update public.role set landing_module = 'experiences' where key = 'concierge_lead';

-- ────────────────────────────────────────────────────────── on shift

/*
 * Who is at the desk right now, per city, and how many plans they can hold.
 *
 * The allocator of work, not of days: rpc_receive_plan round-robins among
 * the online rows with spare capacity. When nobody is online a plan is
 * still received and still visible — it is left unassigned and the lead is
 * paged, because a day that arrives at 02:00 must not vanish until someone
 * clocks in.
 */
create table public.concierge_shift (
  staff_user_id uuid not null references public.staff_user (id) on delete cascade,
  city_id uuid not null references public.city (id) on delete cascade,
  online boolean not null default false,
  capacity integer not null default 6 check (capacity between 1 and 50),
  since timestamptz not null default now(),
  primary key (staff_user_id, city_id)
);

alter table public.concierge_shift enable row level security;

create policy concierge_shift_read_staff on public.concierge_shift
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

/* A concierge clocks themselves in; a lead clocks anyone in their city. */
create policy concierge_shift_write_self on public.concierge_shift
  for all to authenticated
  using (staff_user_id = authz.staff_id())
  with check (staff_user_id = authz.staff_id());

create policy concierge_shift_write_lead on public.concierge_shift
  for all to authenticated
  using (
    authz.is_super_admin() or authz.has_role('concierge_lead', city_id)
    or authz.has_role('ops_manager', city_id)
  )
  with check (
    authz.is_super_admin() or authz.has_role('concierge_lead', city_id)
    or authz.has_role('ops_manager', city_id)
  );

comment on table public.concierge_shift is
  'Who is at the desk, per city, and how many plans they can hold. Nobody online does not block a plan arriving — it arrives unassigned and the lead is paged.';

-- ───────────────────────────────────────────────── settings this needs
--
-- Every one of these is inserted with a null value on purpose. A null
-- renders [—] and, where it is a fee, makes quoting refuse outright. The
-- alternative is a plausible-looking number nobody chose, which is ground
-- rule 3 and the one mistake that would cost a guest real money.

insert into public.setting (scope, key, value) values
  ('global', 'experience_fee_rule',            null),
  ('global', 'experience_commission_pct',      null),
  ('global', 'experience_first_reply_min',     '30'::jsonb),
  ('global', 'experience_quote_hours',         '2'::jsonb),
  ('global', 'experience_quote_validity_hours','24'::jsonb),
  ('global', 'experience_free_change_cutoff',  '"18:00 the day before"'::jsonb),
  ('global', 'experience_review_delay_hours',  '24'::jsonb),
  ('global', 'experience_review_link_days',    '14'::jsonb),
  ('global', 'experience_budget_min_kes',      '5000'::jsonb),
  ('global', 'experience_budget_max_kes',      '150000'::jsonb),
  ('global', 'experience_hold_default_hours',  '24'::jsonb),
  ('global', 'experience_sample_budget_kes',   null),
  ('global', 'experience_stay_low_budget_kes', null)
on conflict (key, scope, coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

comment on table public.setting is
  'Operational configuration. A null value is a valid, expected state: the UI renders [—] rather than a made-up number, and the fee rule being null makes quoting refuse rather than guess.';
