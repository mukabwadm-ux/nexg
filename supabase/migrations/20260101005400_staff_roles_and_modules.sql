-- The roles the console draws, and what each one may reach.

/*
 * Three roles the artboards name that the schema did not have.
 *
 * merchant_ops keeps its key and gains the label the design uses — renaming
 * the key would break every policy that names it, and the key is not what
 * anybody reads.
 */
insert into public.role (key, label, description) values
  ('concierge_agent', 'Concierge agent',
   'Works the desk: guest requests, quotes and live orders. Never sees settlement amounts.'),
  ('city_lead', 'City lead',
   'Runs one city end to end. City scope filters what they see; it never widens what they may do.'),
  ('read_only', 'Read-only',
   'Sees without touching. For auditors and observers, usually with an expiry.')
on conflict (key) do nothing;

update public.role set label = 'Merchant success' where key = 'merchant_ops';

/*
 * What each role may reach, module by module.
 *
 * This is the matrix the console draws, and it is also what the console
 * obeys: the sidebar is built from it and a page a role cannot reach is not
 * rendered. Keeping it as data rather than as a constant in the app means
 * the picture staff are shown and the behaviour they get come from one
 * place and cannot drift apart.
 *
 * It is not, and must not be mistaken for, the enforcement of data access.
 * That is RLS, which runs whatever the UI believes. This decides what is
 * worth showing someone; the policies decide what they may have.
 */
create table public.role_module_access (
  role_key text not null references public.role (key) on delete cascade,
  module_key text not null,
  level text not null check (
    level in ('full', 'view', 'own_city', 'limited', 'view_invoices', 'own_actions', 'none')
  ),
  /* The qualifier under a cell: "refunds up to the cap, no post-pickup
     cancels". Null where the level says it all. */
  note text,
  primary key (role_key, module_key)
);

comment on table public.role_module_access is
  'Which modules each role sees in the console, and how much of each. Drives the sidebar and the permission matrix. Data access itself is RLS, not this.';

alter table public.role_module_access enable row level security;

/* Every staff member may read the matrix — it is how the console knows what
   to draw for them, and it is a description of the rules rather than a
   secret. Only a super admin may change it. */
create policy role_module_access_read_staff on public.role_module_access
  for select to authenticated using (authz.staff_id() is not null);

create policy role_module_access_write_super_admin on public.role_module_access
  for all to authenticated
  using (authz.is_super_admin()) with check (authz.is_super_admin());

/* The modules, in the order the sidebar lists them. */
create table public.console_module (
  key text primary key,
  label text not null,
  section text not null,
  href text,
  sort integer not null
);

alter table public.console_module enable row level security;
create policy console_module_read_staff on public.console_module
  for select to authenticated using (authz.staff_id() is not null);

insert into public.console_module (key, label, section, href, sort) values
  ('overview',       'Overview',                    'Operate', '/',            10),
  ('concierge',      'Concierge desk',              'Operate', '/concierge',   20),
  ('live_ops',       'Live operations / dispatch',  'Operate', null,           30),
  ('orders',         'Orders & refunds',            'Operate', null,           40),
  ('merchants',      'Merchants',                   'Partners','/merchants',   50),
  ('riders',         'Riders & cash ledger',        'Partners','/riders',      60),
  ('hotels',         'Hotels & Airbnb',             'Partners',null,           70),
  ('featured',       'Featured slots',              'Grow',    null,           80),
  ('careers',        'Careers ATS',                 'Grow',    null,           90),
  ('finance',        'Finance · weekly settlement', 'Money',   null,          100),
  ('staff',          'Staff & roles',               'Control', '/staff',      110),
  ('settings',       'Settings (fees, cities, legal)','Control',null,         120),
  ('audit',          'Audit log',                   'Control', null,          130);

comment on column public.console_module.href is
  'Null where the module is designed but not built. The sidebar shows it greyed rather than pretending it is one click away.';

-- ───────────────────────────────────────────────────────── the matrix
--
-- Transcribed from the Roles & permissions artboard. Read the legend there:
-- full = create, edit, approve · view = read only · own_city = full but
-- filtered to assigned cities · limited and view_invoices carry their own
-- note · own_actions = their own entries only.

insert into public.role_module_access (role_key, module_key, level, note) values
  -- super admin: everything
  ('super_admin','overview','full',null),      ('super_admin','concierge','full',null),
  ('super_admin','live_ops','full',null),      ('super_admin','orders','full',null),
  ('super_admin','merchants','full',null),     ('super_admin','riders','full',null),
  ('super_admin','hotels','full',null),        ('super_admin','featured','full',null),
  ('super_admin','finance','full',null),       ('super_admin','careers','full',null),
  ('super_admin','staff','full',null),         ('super_admin','settings','full',null),
  ('super_admin','audit','full',null),

  -- ops manager: everything operational, finance and audit read-only
  ('ops_manager','overview','full',null),      ('ops_manager','concierge','full',null),
  ('ops_manager','live_ops','full',null),      ('ops_manager','orders','full',null),
  ('ops_manager','merchants','full',null),     ('ops_manager','riders','full',null),
  ('ops_manager','hotels','full',null),        ('ops_manager','featured','full',null),
  ('ops_manager','finance','view',null),       ('ops_manager','careers','none',null),
  ('ops_manager','staff','none',null),
  ('ops_manager','settings','limited','prep-time & hours only'),
  ('ops_manager','audit','view',null),

  -- concierge agent: the desk
  ('concierge_agent','overview','full',null),  ('concierge_agent','concierge','full',null),
  ('concierge_agent','live_ops','view',null),
  ('concierge_agent','orders','limited','refunds up to cap · no post-pickup cancels'),
  ('concierge_agent','merchants','view',null), ('concierge_agent','riders','view',null),
  ('concierge_agent','hotels','view',null),    ('concierge_agent','featured','none',null),
  ('concierge_agent','finance','none',null),   ('concierge_agent','careers','none',null),
  ('concierge_agent','staff','none',null),     ('concierge_agent','settings','none',null),
  ('concierge_agent','audit','none',null),

  -- city lead: their own city, in full
  ('city_lead','overview','own_city',null),    ('city_lead','concierge','own_city',null),
  ('city_lead','live_ops','own_city',null),    ('city_lead','orders','own_city',null),
  ('city_lead','merchants','own_city',null),   ('city_lead','riders','own_city',null),
  ('city_lead','hotels','own_city',null),      ('city_lead','featured','own_city',null),
  ('city_lead','finance','none',null),         ('city_lead','careers','none',null),
  ('city_lead','staff','none',null),           ('city_lead','settings','none',null),
  ('city_lead','audit','none',null),

  -- finance: the money, and never the guests
  ('finance','overview','none',null),          ('finance','concierge','none',null),
  ('finance','live_ops','none',null),          ('finance','orders','view',null),
  ('finance','merchants','view',null),         ('finance','riders','view',null),
  ('finance','hotels','view',null),
  ('finance','featured','view_invoices','slot performance + invoices, no pricing'),
  ('finance','finance','full',null),           ('finance','careers','none',null),
  ('finance','staff','none',null),             ('finance','settings','none',null),
  ('finance','audit','own_actions',null),

  -- merchant success
  ('merchant_ops','overview','none',null),     ('merchant_ops','concierge','none',null),
  ('merchant_ops','live_ops','none',null),     ('merchant_ops','orders','view',null),
  ('merchant_ops','merchants','full',null),    ('merchant_ops','riders','none',null),
  ('merchant_ops','hotels','full',null),       ('merchant_ops','featured','full',null),
  ('merchant_ops','finance','none',null),      ('merchant_ops','careers','none',null),
  ('merchant_ops','staff','none',null),        ('merchant_ops','settings','none',null),
  ('merchant_ops','audit','none',null),

  -- rider ops
  ('rider_ops','overview','none',null),        ('rider_ops','concierge','none',null),
  ('rider_ops','live_ops','full',null),        ('rider_ops','orders','view',null),
  ('rider_ops','merchants','none',null),       ('rider_ops','riders','full',null),
  ('rider_ops','hotels','none',null),          ('rider_ops','featured','none',null),
  ('rider_ops','finance','none',null),         ('rider_ops','careers','none',null),
  ('rider_ops','staff','none',null),           ('rider_ops','settings','none',null),
  ('rider_ops','audit','none',null),

  -- hr / recruiter
  ('hr','overview','none',null),               ('hr','concierge','none',null),
  ('hr','live_ops','none',null),               ('hr','orders','none',null),
  ('hr','merchants','none',null),              ('hr','riders','none',null),
  ('hr','hotels','none',null),                 ('hr','featured','none',null),
  ('hr','finance','none',null),                ('hr','careers','full',null),
  ('hr','staff','none',null),                  ('hr','settings','none',null),
  ('hr','audit','none',null),

  -- read-only
  ('read_only','overview','view',null),        ('read_only','concierge','view',null),
  ('read_only','live_ops','view',null),        ('read_only','orders','view',null),
  ('read_only','merchants','view',null),       ('read_only','riders','view',null),
  ('read_only','hotels','view',null),          ('read_only','featured','view',null),
  ('read_only','finance','none',null),         ('read_only','careers','none',null),
  ('read_only','staff','none',null),           ('read_only','settings','none',null),
  ('read_only','audit','none',null),

  -- growth and dpo predate the artboard's nine and keep what they had
  ('growth','overview','view',null),           ('growth','featured','full',null),
  ('growth','merchants','view',null),          ('growth','careers','none',null),
  ('dpo','overview','view',null),              ('dpo','audit','view',null)
on conflict (role_key, module_key) do nothing;

/* The landing page each role opens on. Null falls back to the overview. */
alter table public.role add column if not exists landing_module text
  references public.console_module (key) on delete set null;

update public.role set landing_module = v.m from (values
  ('super_admin','overview'), ('ops_manager','overview'), ('concierge_agent','concierge'),
  ('city_lead','live_ops'),   ('finance','finance'),      ('merchant_ops','merchants'),
  ('rider_ops','riders'),     ('hr','careers'),           ('read_only','overview'),
  ('growth','featured'),      ('dpo','audit')
) as v(k, m) where public.role.key = v.k;

-- ───────────────────────────────────────────── claiming the first one

/*
 * The trigger allows the first super_admin to go unapproved, but the insert
 * policy on role_grant still requires super_admin to write a grant — so the
 * first one could not be written at all. Loosening that policy would leave
 * a permanent hole for the sake of one moment.
 *
 * This is that moment, named. It runs as its owner so the policy does not
 * apply, refuses the instant any active super_admin exists, and records
 * itself at high severity — because "who made themselves the first admin,
 * and when" is a question worth being able to answer years later.
 */
create or replace function public.rpc_bootstrap_super_admin()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_email text;
begin
  if v_actor is null then
    raise exception 'Only a staff member can do this.' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.role_grant g join public.role r on r.id = g.role_id
    where r.key = 'super_admin' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  ) then
    raise exception
      'This project already has a super admin. Ask them to propose you, and a second admin to countersign.'
      using errcode = 'check_violation';
  end if;

  select email into v_email from public.staff_user where id = v_actor;

  insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
  select v_actor, r.id, null, v_actor from public.role r where r.key = 'super_admin';

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.first_super_admin_claimed',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => v_actor,
    p_after => jsonb_build_object('email', v_email, 'unapproved', true),
    p_reason => 'First super admin on the project; no one existed to countersign.',
    p_severity => 'high'::public.audit_severity
  );

  return v_email;
end;
$$;

grant execute on function public.rpc_bootstrap_super_admin() to authenticated;
