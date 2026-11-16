-- Company: NexG's own back office in the console.
--
-- The Company group in the console sidebar: Company files, Company
-- inventory, Assets & equipment, Procurement, Vendors & suppliers, and
-- Warehouses & stores. Everything here belongs to NexG itself: the laptops
-- staff carry, the helmets riders are issued, the office's paper and fuel,
-- the contracts and policies in the shared drive, and the suppliers who sell
-- to NexG. None of it belongs to merchants, hosts or customers.
--
-- Rules, all enforced here rather than in the console:
--   * Staff only. Reading needs a role that reaches the `company` module.
--     Changing anything needs `full` or `limited`. Approving a purchase,
--     raising a purchase order and deleting a file for good need `full`.
--     A super admin always has `full`.
--   * Every change goes through an rpc_company_* function that writes
--     audit.log in the same transaction. The tables have no write policies.
--   * Stock moves only through movements, so the quantity on hand is what
--     was received, issued, moved and counted, never a number typed over.
--   * A purchase needs two people: whoever asked for it cannot approve it.
--     A super admin can, and that is logged for review.
--   * Files live in the private `company-files` bucket and the console hands
--     out signed links that last a minute. A private file is seen by its
--     owner and the people it is shared with, nobody else.
--
-- Rollback (reverse order):
--   drop function every public.rpc_company_* and public.fn_company_* function,
--     authz.company_level_of(uuid), authz.company_level(), authz.company_reads(),
--     authz.company_writes(), authz.company_approves(), authz.company_require(text),
--     authz.company_sees_file(uuid), authz.company_reads_file(text),
--     authz.company_file_orphan(text);
--   drop view public.company_activity_v, public.company_stock_v, public.company_folder_v;
--   drop table public.company_file_star, public.company_file_share, public.company_file,
--     public.company_folder, public.company_asset_event, public.company_asset,
--     public.company_stock_movement, public.company_purchase_order,
--     public.company_purchase_line, public.company_purchase_request, public.company_stock,
--     public.company_item, public.company_category, public.company_vendor,
--     public.company_location;
--   drop sequence public.company_asset_tag_seq, public.company_purchase_request_seq,
--     public.company_purchase_order_seq;
--   empty the company-files and company-photos buckets through the Storage API, then
--     delete from storage.buckets where id in ('company-files', 'company-photos');
--   delete from public.role_module_access where module_key = 'company';
--   delete from public.console_module where key = 'company';
--   delete from audit.action_registry where module = 'company';
--   delete from public.wiring_audit_exempt where function_name = 'rpc_company_file_star';

-- ═════════════════════════════════════════════════════════════ the module

insert into public.console_module (key, label, section, href, sort, icon)
values ('company', 'Company', 'Control', '/company/files', 105, 'Building2')
on conflict (key) do update
set label = excluded.label,
    section = excluded.section,
    href = excluded.href,
    sort = excluded.sort,
    icon = excluded.icon;

/*
 * full = create, edit, approve · limited = create and edit, never approve a
 * purchase or delete a file for good · view = read only. Roles not listed
 * here do not see Company at all.
 */
insert into public.role_module_access (role_key, module_key, level, note)
values
  ('super_admin', 'company', 'full', null),
  ('ops_manager', 'company', 'full', 'Office stock, equipment, suppliers and buying'),
  ('finance', 'company', 'full', 'Approves purchases and raises purchase orders'),
  ('hr', 'company', 'limited', 'Files and equipment; asks for purchases, cannot approve them'),
  ('tech', 'company', 'limited', 'IT equipment and files; asks for purchases, cannot approve them'),
  ('legal', 'company', 'view', 'Contracts and policies'),
  ('read_only', 'company', 'view', null)
on conflict (role_key, module_key) do update
set level = excluded.level,
    note = excluded.note;

-- ═══════════════════════════════════════════════════════════ who may act

/* The best level any live grant of this staff member gives on Company:
   'full', 'limited', 'view', or null for no access at all. */
create or replace function authz.company_level_of(p_staff_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when bool_or(r.key = 'super_admin') or bool_or(a.level = 'full') then 'full'
    when bool_or(a.level = 'limited') then 'limited'
    when bool_or(a.level is not null and a.level <> 'none') then 'view'
  end
  from public.staff_user su
  join public.role_grant rg on rg.staff_user_id = su.id
  join public.role r on r.id = rg.role_id
  left join public.role_module_access a on a.role_key = r.key and a.module_key = 'company'
  where su.id = p_staff_id
    and su.status = 'active'
    and rg.revoked_at is null
    and (rg.expires_at is null or rg.expires_at > now())
$$;

create or replace function authz.company_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select authz.company_level_of(authz.staff_id())
$$;

create or replace function authz.company_reads()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.company_level() is not null
$$;

create or replace function authz.company_writes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(authz.company_level() in ('full', 'limited'), false)
$$;

create or replace function authz.company_approves()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(authz.company_level() = 'full', false)
$$;

/* The guard at the top of every Company RPC: the caller's staff id, or a
   refusal that says what is missing. p_need is 'read', 'write' or 'approve'. */
create or replace function authz.company_require(p_need text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_level text := authz.company_level_of(v_staff);
begin
  if v_staff is null or v_level is null then
    raise exception 'Only NexG staff with access to Company can do this.' using errcode = '42501';
  end if;
  if p_need = 'write' and v_level not in ('full', 'limited') then
    raise exception 'You can see Company but not change it.' using errcode = '42501';
  end if;
  if p_need = 'approve' and v_level <> 'full' then
    raise exception 'Only people with full Company access can do this.' using errcode = '42501';
  end if;
  return v_staff;
end;
$$;

comment on function authz.company_level_of(uuid) is
  'The best level (full, limited, view) a staff member''s live grants give on the Company module, or null.';
comment on function authz.company_require(text) is
  'Company RPC guard: returns the caller''s staff id when they may read, write or approve, else raises 42501.';

revoke execute on function authz.company_level_of(uuid) from public, anon, authenticated;
revoke execute on function authz.company_require(text) from public, anon, authenticated;
revoke execute on function authz.company_level() from public, anon;
revoke execute on function authz.company_reads() from public, anon;
revoke execute on function authz.company_writes() from public, anon;
revoke execute on function authz.company_approves() from public, anon;
grant execute on function authz.company_level_of(uuid) to service_role;
grant execute on function authz.company_require(text) to service_role;
grant execute on function authz.company_level() to authenticated, service_role;
grant execute on function authz.company_reads() to authenticated, service_role;
grant execute on function authz.company_writes() to authenticated, service_role;
grant execute on function authz.company_approves() to authenticated, service_role;

-- ═══════════════════════════════════════════════ warehouses, stores, offices

create table public.company_location (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  kind text not null default 'warehouse'
    check (kind in ('office', 'warehouse', 'store', 'hub', 'other')),
  city_id uuid references public.city (id) on delete set null,
  address text check (address is null or length(address) <= 200),
  manager_id uuid references public.staff_user (id) on delete set null,
  phone text check (phone is null or length(phone) <= 30),
  notes text check (notes is null or length(notes) <= 1000),
  active boolean not null default true,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index company_location_name_key on public.company_location (lower(btrim(name)));
create index company_location_city_idx on public.company_location (city_id);
create index company_location_manager_idx on public.company_location (manager_id);

comment on table public.company_location is
  'NexG''s own offices, warehouses, stores and hubs: where company stock and equipment are kept.';

-- ═════════════════════════════════════════════════════ vendors, suppliers

create table public.company_vendor (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  categories text[] not null default '{}' check (
    categories <@ array[
      'it_electronics', 'furniture', 'office_supplies', 'rider_gear', 'fuel_energy',
      'printing', 'cleaning', 'maintenance', 'professional_services', 'logistics',
      'food_beverage', 'other'
    ]::text[]),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  email text check (
    email is null or (length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or length(phone) <= 30),
  website text check (
    website is null or (length(website) <= 200 and website ~* '^https?://\S+$')),
  address text check (address is null or length(address) <= 200),
  city_id uuid references public.city (id) on delete set null,
  tax_pin text check (tax_pin is null or tax_pin ~ '^[A-Za-z0-9]{6,20}$'),
  payment_terms text not null default 'net_30'
    check (payment_terms in ('prepaid', 'on_delivery', 'net_7', 'net_15', 'net_30', 'net_60')),
  rating smallint check (rating between 1 and 5),
  status text not null default 'active' check (status in ('active', 'on_hold', 'archived')),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index company_vendor_name_key on public.company_vendor (lower(btrim(name)));
create index company_vendor_categories_idx on public.company_vendor using gin (categories);
create index company_vendor_city_idx on public.company_vendor (city_id);

comment on table public.company_vendor is
  'Businesses NexG buys from for its own use (not merchants on the platform).';

-- ══════════════════════════════════════════════════════════════ categories

create table public.company_category (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 60),
  icon text not null default 'package' check (icon in (
    'laptop', 'armchair', 'printer', 'hard-hat', 'fuel', 'paperclip', 'package', 'bike',
    'car', 'wrench', 'shield', 'spray-can', 'coffee', 'plug', 'smartphone', 'router',
    'box', 'shirt', 'book')),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index company_category_name_key on public.company_category (lower(btrim(name)));

/* The vocabulary to start from. Names only: every count on the Company
   pages is of things actually recorded against them. */
insert into public.company_category (name, icon) values
  ('IT & Electronics', 'laptop'),
  ('Furniture', 'armchair'),
  ('Equipment', 'printer'),
  ('Rider Gear', 'hard-hat'),
  ('Supplies', 'fuel'),
  ('Office Supplies', 'paperclip'),
  ('Vehicles', 'bike'),
  ('Safety', 'shield'),
  ('Cleaning', 'spray-can'),
  ('Kitchen', 'coffee')
on conflict do nothing;

-- ═══════════════════════════════════════════════════ inventory and stock

create table public.company_item (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  sku text check (sku is null or sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  category_id uuid not null references public.company_category (id) on delete restrict,
  unit text not null default 'pcs'
    check (unit in ('pcs', 'box', 'pack', 'ream', 'pair', 'set', 'roll', 'L', 'kg', 'm')),
  unit_cost_cents bigint not null default 0 check (unit_cost_cents >= 0),
  reorder_level numeric(14, 2) not null default 0 check (reorder_level >= 0),
  vendor_id uuid references public.company_vendor (id) on delete set null,
  description text check (description is null or length(description) <= 1000),
  photo_path text check (photo_path is null or length(photo_path) <= 300),
  archived_at timestamptz,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index company_item_sku_key on public.company_item (lower(sku)) where sku is not null;
create index company_item_category_idx on public.company_item (category_id);
create index company_item_vendor_idx on public.company_item (vendor_id);

comment on table public.company_item is
  'Things NexG keeps in stock by quantity (paper, fuel, helmets). Serial-numbered equipment is company_asset.';

/* What is on hand, per item and location. Written only by the movement
   functions below. */
create table public.company_stock (
  item_id uuid not null references public.company_item (id) on delete cascade,
  location_id uuid not null references public.company_location (id) on delete restrict,
  quantity numeric(14, 2) not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id)
);

create index company_stock_location_idx on public.company_stock (location_id);

-- ═══════════════════════════════════════════════════════════ procurement

create sequence public.company_purchase_request_seq;
create sequence public.company_purchase_order_seq;

create table public.company_purchase_request (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'PR-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-'
    || lpad(nextval('public.company_purchase_request_seq')::text, 4, '0')),
  title text not null check (length(btrim(title)) between 3 and 120),
  justification text check (justification is null or length(justification) <= 2000),
  department text not null default 'operations' check (department in (
    'operations', 'finance', 'technology', 'marketing', 'people', 'support', 'riders',
    'office', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  needed_by date,
  vendor_id uuid references public.company_vendor (id) on delete set null,
  location_id uuid references public.company_location (id) on delete set null,
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'approved', 'rejected', 'ordered', 'received', 'cancelled')),
  total_cents bigint not null default 0 check (total_cents >= 0),
  requested_by uuid references public.staff_user (id) on delete set null,
  submitted_at timestamptz,
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index company_purchase_request_status_idx
  on public.company_purchase_request (status, created_at desc);
create index company_purchase_request_requested_by_idx
  on public.company_purchase_request (requested_by);
create index company_purchase_request_vendor_idx on public.company_purchase_request (vendor_id);
create index company_purchase_request_location_idx on public.company_purchase_request (location_id);

create table public.company_purchase_line (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.company_purchase_request (id) on delete cascade,
  item_id uuid references public.company_item (id) on delete set null,
  description text not null check (length(btrim(description)) between 2 and 200),
  quantity numeric(14, 2) not null check (quantity > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  received_quantity numeric(14, 2) not null default 0 check (received_quantity >= 0),
  sort smallint not null default 0,
  constraint company_purchase_line_not_over_received check (received_quantity <= quantity)
);

create index company_purchase_line_request_idx on public.company_purchase_line (request_id, sort);
create index company_purchase_line_item_idx on public.company_purchase_line (item_id);

create table public.company_purchase_order (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'PO-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-'
    || lpad(nextval('public.company_purchase_order_seq')::text, 4, '0')),
  request_id uuid not null references public.company_purchase_request (id) on delete restrict,
  vendor_id uuid not null references public.company_vendor (id) on delete restrict,
  location_id uuid not null references public.company_location (id) on delete restrict,
  status text not null default 'issued'
    check (status in ('issued', 'partially_received', 'received', 'cancelled')),
  total_cents bigint not null check (total_cents >= 0),
  expected_on date,
  notes text check (notes is null or length(notes) <= 1000),
  issued_by uuid references public.staff_user (id) on delete set null,
  issued_at timestamptz not null default now(),
  received_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  updated_at timestamptz not null default now()
);

/* One live order per request; a cancelled one can be replaced. */
create unique index company_purchase_order_one_live
  on public.company_purchase_order (request_id) where status <> 'cancelled';
create index company_purchase_order_request_idx on public.company_purchase_order (request_id);
create index company_purchase_order_vendor_idx
  on public.company_purchase_order (vendor_id, issued_at desc);
create index company_purchase_order_status_idx
  on public.company_purchase_order (status, issued_at desc);
create index company_purchase_order_location_idx on public.company_purchase_order (location_id);

-- ════════════════════════════════════════════════════════ stock movements

create table public.company_stock_movement (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.company_item (id) on delete cascade,
  kind text not null check (kind in ('in', 'out', 'transfer', 'adjust')),
  quantity numeric(14, 2) not null check (quantity > 0),
  from_location_id uuid references public.company_location (id) on delete restrict,
  to_location_id uuid references public.company_location (id) on delete restrict,
  unit_cost_cents bigint check (unit_cost_cents is null or unit_cost_cents >= 0),
  purchase_order_id uuid references public.company_purchase_order (id) on delete set null,
  reason text check (reason is null or reason in (
    'purchase', 'opening', 'return', 'issued', 'used', 'damaged', 'lost', 'sold', 'count',
    'move', 'other')),
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  /* In arrives somewhere, out leaves somewhere, a transfer does both, and a
     count correction goes one way. */
  constraint company_stock_movement_direction check (
    case kind
      when 'in' then to_location_id is not null and from_location_id is null
      when 'out' then from_location_id is not null and to_location_id is null
      when 'transfer' then from_location_id is not null and to_location_id is not null
        and from_location_id <> to_location_id
      else num_nonnulls(from_location_id, to_location_id) = 1
    end)
);

create index company_stock_movement_item_idx
  on public.company_stock_movement (item_id, created_at desc);
create index company_stock_movement_at_idx on public.company_stock_movement (created_at desc);
create index company_stock_movement_from_idx on public.company_stock_movement (from_location_id);
create index company_stock_movement_to_idx on public.company_stock_movement (to_location_id);
create index company_stock_movement_po_idx on public.company_stock_movement (purchase_order_id);

-- ══════════════════════════════════════════════════ assets and equipment

create sequence public.company_asset_tag_seq;

create table public.company_asset (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique default (
    'AST-' || lpad(nextval('public.company_asset_tag_seq')::text, 5, '0')),
  name text not null check (length(btrim(name)) between 2 and 120),
  category_id uuid not null references public.company_category (id) on delete restrict,
  brand text check (brand is null or length(brand) <= 60),
  model text check (model is null or length(model) <= 80),
  serial_number text check (serial_number is null or length(serial_number) <= 80),
  location_id uuid references public.company_location (id) on delete set null,
  /* Who holds it, always by name: a colleague's name at hand-over (with
     assigned_to linking their console account) or somebody without an
     account, such as a rider or a driver. The name stays if the account is
     later removed, so the record still says who has it. */
  assigned_to uuid references public.staff_user (id) on delete set null,
  assignee_name text check (
    assignee_name is null or length(btrim(assignee_name)) between 2 and 120),
  assigned_at timestamptz,
  condition text not null default 'good'
    check (condition in ('new', 'good', 'fair', 'poor', 'broken')),
  status text not null default 'available'
    check (status in ('available', 'in_use', 'maintenance', 'retired', 'lost')),
  purchase_date date,
  purchase_cost_cents bigint check (purchase_cost_cents is null or purchase_cost_cents >= 0),
  vendor_id uuid references public.company_vendor (id) on delete set null,
  warranty_until date,
  next_service_on date,
  photo_path text check (photo_path is null or length(photo_path) <= 300),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_asset_named_holder check (assigned_to is null or assignee_name is not null),
  constraint company_asset_holder_matches_status check (
    case status
      when 'in_use' then assignee_name is not null
      when 'available' then num_nonnulls(assigned_to, assignee_name) = 0
      when 'retired' then num_nonnulls(assigned_to, assignee_name) = 0
      else true
    end)
);

create index company_asset_status_idx on public.company_asset (status);
create index company_asset_category_idx on public.company_asset (category_id);
create index company_asset_location_idx on public.company_asset (location_id);
create index company_asset_assigned_idx on public.company_asset (assigned_to);
create index company_asset_vendor_idx on public.company_asset (vendor_id);
create index company_asset_service_idx on public.company_asset (next_service_on)
  where next_service_on is not null;

comment on table public.company_asset is
  'NexG''s own serial-numbered equipment: who holds it, its condition and its maintenance.';

/* The asset's own history, append-only: what the asset page shows. */
create table public.company_asset_event (
  id bigint generated always as identity primary key,
  asset_id uuid not null references public.company_asset (id) on delete cascade,
  kind text not null check (kind in (
    'registered', 'updated', 'assigned', 'returned', 'moved', 'maintenance_scheduled',
    'maintenance_started', 'maintenance_done', 'retired', 'lost', 'restored')),
  detail text check (detail is null or length(detail) <= 500),
  cost_cents bigint check (cost_cents is null or cost_cents >= 0),
  due_on date,
  staff_id uuid references public.staff_user (id) on delete set null,
  at timestamptz not null default now()
);

create index company_asset_event_asset_idx on public.company_asset_event (asset_id, at desc);
create index company_asset_event_at_idx on public.company_asset_event (at desc);

-- ═══════════════════════════════════════════════════════════ company files

create table public.company_folder (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  color text not null default 'gold'
    check (color in ('gold', 'ink', 'green', 'blue', 'purple', 'red', 'grey')),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index company_folder_name_key on public.company_folder (lower(btrim(name)));

create table public.company_file (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.company_folder (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 200),
  storage_path text not null unique check (length(storage_path) <= 400),
  mime_type text not null check (length(mime_type) <= 120),
  size_bytes bigint not null check (size_bytes >= 0),
  visibility text not null default 'company' check (visibility in ('company', 'private')),
  description text check (description is null or length(description) <= 500),
  owner_id uuid references public.staff_user (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index company_file_folder_idx on public.company_file (folder_id);
create index company_file_owner_idx on public.company_file (owner_id);
create index company_file_updated_idx on public.company_file (updated_at desc)
  where deleted_at is null;
create index company_file_trash_idx on public.company_file (deleted_at desc)
  where deleted_at is not null;

comment on column public.company_file.visibility is
  'company: everyone who reaches Company. private: the owner and the people it is shared with.';

create table public.company_file_share (
  file_id uuid not null references public.company_file (id) on delete cascade,
  staff_id uuid not null references public.staff_user (id) on delete cascade,
  shared_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (file_id, staff_id)
);

create index company_file_share_staff_idx on public.company_file_share (staff_id);

/* A person's own bookmarks. */
create table public.company_file_star (
  staff_id uuid not null references public.staff_user (id) on delete cascade,
  file_id uuid not null references public.company_file (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, file_id)
);

create index company_file_star_file_idx on public.company_file_star (file_id);

/* Whether the caller may see a file. Security definer so the file and
   share policies can ask without reading each other through RLS. */
create or replace function authz.company_sees_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_file f
    where f.id = p_file_id
      and authz.company_reads()
      and (f.visibility = 'company'
           or f.owner_id = authz.staff_id()
           or exists (select 1 from public.company_file_share s
                      where s.file_id = f.id and s.staff_id = authz.staff_id())))
$$;

/* The same question, asked by a storage path. */
create or replace function authz.company_reads_file(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_file f
    where f.storage_path = p_path and authz.company_sees_file(f.id))
$$;

/* A stored object no file row points at: an upload that was never
   registered, or a file already deleted for good. */
create or replace function authz.company_file_orphan(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.company_file f where f.storage_path = p_path)
$$;

revoke execute on function authz.company_sees_file(uuid) from public, anon;
revoke execute on function authz.company_reads_file(text) from public, anon;
revoke execute on function authz.company_file_orphan(text) from public, anon;
grant execute on function authz.company_sees_file(uuid) to authenticated, service_role;
grant execute on function authz.company_reads_file(text) to authenticated, service_role;
grant execute on function authz.company_file_orphan(text) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════ RLS

alter table public.company_location enable row level security;
alter table public.company_vendor enable row level security;
alter table public.company_category enable row level security;
alter table public.company_item enable row level security;
alter table public.company_stock enable row level security;
alter table public.company_purchase_request enable row level security;
alter table public.company_purchase_line enable row level security;
alter table public.company_purchase_order enable row level security;
alter table public.company_stock_movement enable row level security;
alter table public.company_asset enable row level security;
alter table public.company_asset_event enable row level security;
alter table public.company_folder enable row level security;
alter table public.company_file enable row level security;
alter table public.company_file_share enable row level security;
alter table public.company_file_star enable row level security;

/* Everyone who reaches Company reads the shared records. There are no
   write policies: changes go through the functions below. */
create policy company_location_read on public.company_location
  for select to authenticated using ((select authz.company_reads()));
create policy company_vendor_read on public.company_vendor
  for select to authenticated using ((select authz.company_reads()));
create policy company_category_read on public.company_category
  for select to authenticated using ((select authz.company_reads()));
create policy company_item_read on public.company_item
  for select to authenticated using ((select authz.company_reads()));
create policy company_stock_read on public.company_stock
  for select to authenticated using ((select authz.company_reads()));
create policy company_purchase_request_read on public.company_purchase_request
  for select to authenticated using ((select authz.company_reads()));
create policy company_purchase_line_read on public.company_purchase_line
  for select to authenticated using ((select authz.company_reads()));
create policy company_purchase_order_read on public.company_purchase_order
  for select to authenticated using ((select authz.company_reads()));
create policy company_stock_movement_read on public.company_stock_movement
  for select to authenticated using ((select authz.company_reads()));
create policy company_asset_read on public.company_asset
  for select to authenticated using ((select authz.company_reads()));
create policy company_asset_event_read on public.company_asset_event
  for select to authenticated using ((select authz.company_reads()));
create policy company_folder_read on public.company_folder
  for select to authenticated using ((select authz.company_reads()));

/* Files: company-wide ones to everyone in Company, private ones to their
   owner and the people they are shared with. */
create policy company_file_read on public.company_file
  for select to authenticated
  using (
    (select authz.company_reads())
    and (visibility = 'company'
         or owner_id = (select authz.staff_id())
         or authz.company_sees_file(id)));

create policy company_file_share_read on public.company_file_share
  for select to authenticated
  using ((select authz.company_reads()) and authz.company_sees_file(file_id));

create policy company_file_star_read on public.company_file_star
  for select to authenticated
  using (staff_id = (select authz.staff_id()));

/* Reads through RLS only; nothing is written from the client. */
do $$
declare
  t text;
begin
  foreach t in array array[
    'company_location', 'company_vendor', 'company_category', 'company_item', 'company_stock',
    'company_purchase_request', 'company_purchase_line', 'company_purchase_order',
    'company_stock_movement', 'company_asset', 'company_asset_event', 'company_folder',
    'company_file', 'company_file_share', 'company_file_star'
  ] loop
    execute format('revoke all on table public.%I from anon', t);
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated',
      t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end;
$$;

revoke all on sequence public.company_asset_tag_seq from anon, authenticated;
revoke all on sequence public.company_purchase_request_seq from anon, authenticated;
revoke all on sequence public.company_purchase_order_seq from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ storage

/*
 * company-files: documents, 50 MB each, private. A file is uploaded into the
 * uploader's own folder ({auth uid}/{uuid}/{name}) and then registered with
 * rpc_company_file_add, which reads its size and type from storage rather
 * than trusting the browser. It is read only through a signed link, which
 * storage signs only for somebody who may see the file.
 *
 * company-photos: pictures of items and assets, 5 MB, private, readable by
 * everyone in Company.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-files', 'company-files', false, 50 * 1024 * 1024, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'application/zip',
    'application/x-zip-compressed'
  ]),
  ('company-photos', 'company-photos', false, 5 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy company_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select authz.company_writes()));

create policy company_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-files'
    and (select authz.company_reads())
    and (owner_id = (select auth.uid())::text or authz.company_reads_file(name)));

/* Only objects no file points at: what is left after a file is deleted for
   good, or an upload that never got registered. */
create policy company_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-files'
    and (select authz.company_writes())
    and authz.company_file_orphan(name));

create policy company_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select authz.company_writes()));

create policy company_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'company-photos' and (select authz.company_reads()));

create policy company_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-photos'
    and owner_id = (select auth.uid())::text
    and (select authz.company_writes()));

-- ══════════════════════════════════════════════════════════════════ views

/* Every stock line (an item at a location) with what the table shows. */
create view public.company_stock_v
with (security_invoker = true) as
select
  s.item_id,
  s.location_id,
  i.name,
  i.sku,
  i.unit,
  i.unit_cost_cents,
  i.reorder_level,
  i.photo_path,
  i.vendor_id,
  i.category_id,
  c.name as category_name,
  c.icon as category_icon,
  l.name as location_name,
  l.kind as location_kind,
  l.active as location_active,
  s.quantity,
  round(s.quantity * i.unit_cost_cents)::bigint as value_cents,
  case
    when s.quantity <= 0 then 'out_of_stock'
    when s.quantity <= i.reorder_level then 'low_stock'
    else 'in_stock'
  end as status,
  s.created_at,
  s.updated_at
from public.company_stock s
join public.company_item i on i.id = s.item_id
join public.company_category c on c.id = i.category_id
join public.company_location l on l.id = s.location_id
where i.archived_at is null;

/* Stock movements and asset events in one feed, newest first. */
create view public.company_activity_v
with (security_invoker = true) as
select
  'stock'::text as source,
  m.id::text as id,
  m.kind,
  m.item_id,
  null::uuid as asset_id,
  i.name as subject,
  m.quantity,
  i.unit,
  fl.name as from_location,
  tl.name as to_location,
  m.reason,
  m.note as detail,
  null::bigint as cost_cents,
  su.display_name as actor,
  m.created_at as at
from public.company_stock_movement m
join public.company_item i on i.id = m.item_id
left join public.company_location fl on fl.id = m.from_location_id
left join public.company_location tl on tl.id = m.to_location_id
left join public.staff_user su on su.id = m.created_by
union all
select
  'asset'::text,
  e.id::text,
  e.kind,
  null::uuid,
  e.asset_id,
  a.name,
  null::numeric,
  null::text,
  null::text,
  l.name,
  null::text,
  e.detail,
  e.cost_cents,
  su.display_name,
  e.at
from public.company_asset_event e
join public.company_asset a on a.id = e.asset_id
left join public.company_location l on l.id = a.location_id
left join public.staff_user su on su.id = e.staff_id;

/* Folders with what the caller can see in them. */
create view public.company_folder_v
with (security_invoker = true) as
select
  f.id,
  f.name,
  f.color,
  f.created_by,
  f.created_at,
  f.updated_at,
  coalesce(c.files, 0) as file_count,
  coalesce(c.bytes, 0) as bytes,
  c.last_change
from public.company_folder f
left join lateral (
  select count(*) as files, sum(x.size_bytes)::bigint as bytes, max(x.updated_at) as last_change
  from public.company_file x
  where x.folder_id = f.id and x.deleted_at is null
) c on true;

revoke all on public.company_folder_v from anon;
revoke insert, update, delete, truncate, references, trigger on public.company_folder_v from authenticated;
grant select on public.company_folder_v to authenticated;

revoke all on public.company_stock_v from anon;
revoke all on public.company_activity_v from anon;
revoke insert, update, delete, truncate, references, trigger on public.company_stock_v from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.company_activity_v from authenticated;
grant select on public.company_stock_v to authenticated;
grant select on public.company_activity_v to authenticated;

-- ═══════════════════════════════════════════════════════ audit registry

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('company.folder_created', 'company', 'info', false, false, false, '{}', 'A Company files folder was created'),
  ('company.folder_updated', 'company', 'info', false, false, false, '{}', 'A Company files folder was renamed or recoloured'),
  ('company.folder_deleted', 'company', 'notice', false, false, false, '{}', 'An empty Company files folder was deleted'),
  ('company.file_uploaded', 'company', 'info', false, false, false, '{}', 'A file was uploaded to Company files'),
  ('company.file_updated', 'company', 'info', false, false, false, '{}', 'A Company file was renamed, moved or made private or company-wide'),
  ('company.file_shared', 'company', 'notice', false, false, false, '{}', 'Who a Company file is shared with changed'),
  ('company.file_trashed', 'company', 'info', false, false, false, '{}', 'A Company file was moved to the trash'),
  ('company.file_restored', 'company', 'info', false, false, false, '{}', 'A Company file was restored from the trash'),
  ('company.file_deleted', 'company', 'notice', false, false, false, '{}', 'A Company file was deleted for good'),
  ('company.location_saved', 'company', 'info', false, false, false, '{}', 'A warehouse, store or office was added or changed'),
  ('company.location_status_changed', 'company', 'notice', false, false, false, '{}', 'A warehouse, store or office was closed or reopened'),
  ('company.vendor_saved', 'company', 'info', false, false, false, '{}', 'A vendor or supplier was added or changed'),
  ('company.vendor_status_changed', 'company', 'notice', false, false, false, '{}', 'A vendor was put on hold, archived or made active again'),
  ('company.category_saved', 'company', 'info', false, false, false, '{}', 'An inventory category was added or changed'),
  ('company.item_created', 'company', 'info', false, false, false, '{}', 'An inventory item was added'),
  ('company.item_updated', 'company', 'info', false, false, false, '{}', 'An inventory item was changed'),
  ('company.item_archived', 'company', 'notice', false, false, false, '{}', 'An inventory item was archived or brought back'),
  ('company.stock_received', 'company', 'info', false, false, false, '{}', 'Stock was received into a location'),
  ('company.stock_issued', 'company', 'info', false, false, false, '{}', 'Stock was issued out of a location'),
  ('company.stock_transferred', 'company', 'info', false, false, false, '{}', 'Stock was moved between locations'),
  ('company.stock_counted', 'company', 'notice', false, false, false, '{}', 'Stock was counted and the quantity on hand corrected'),
  ('company.asset_created', 'company', 'info', false, false, false, '{}', 'An asset was registered'),
  ('company.asset_updated', 'company', 'info', false, false, false, '{}', 'An asset''s details were changed'),
  ('company.asset_assigned', 'company', 'info', false, false, false, '{}', 'An asset was handed to someone'),
  ('company.asset_returned', 'company', 'info', false, false, false, '{}', 'An asset was handed back'),
  ('company.asset_maintenance_scheduled', 'company', 'info', false, false, false, '{}', 'Maintenance was scheduled for an asset'),
  ('company.asset_maintenance_started', 'company', 'info', false, false, false, '{}', 'An asset went in for maintenance'),
  ('company.asset_maintenance_completed', 'company', 'info', false, false, false, '{}', 'An asset came back from maintenance'),
  ('company.asset_status_changed', 'company', 'notice', false, false, false, '{}', 'An asset was retired, reported lost or brought back into use'),
  ('company.purchase_request_saved', 'company', 'info', false, false, true, '{}', 'A purchase request was drafted or edited'),
  ('company.purchase_request_submitted', 'company', 'info', false, false, true, '{}', 'A purchase request was sent for approval'),
  ('company.purchase_request_approved', 'company', 'notice', false, true, true, '{}', 'A purchase request was approved by someone other than whoever asked'),
  ('company.purchase_request_self_approved', 'company', 'high', true, false, true, '{}', 'A super admin approved their own purchase request'),
  ('company.purchase_request_rejected', 'company', 'notice', false, false, true, '{}', 'A purchase request was turned down, with a reason'),
  ('company.purchase_request_cancelled', 'company', 'info', false, false, true, '{}', 'A purchase request was cancelled'),
  ('company.purchase_order_issued', 'company', 'notice', false, false, true, '{}', 'A purchase order was raised with a vendor'),
  ('company.purchase_order_received', 'company', 'info', false, false, true, '{}', 'Goods on a purchase order were received'),
  ('company.purchase_order_cancelled', 'company', 'notice', false, false, true, '{}', 'A purchase order was cancelled before anything arrived')
on conflict (action) do nothing;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values ('rpc_company_file_star', 'A personal bookmark that only the person who set it sees', 'company_file_star')
on conflict (function_name) do nothing;

-- ═══════════════════════════════════════════════════ internal stock steps

/* Adds to a stock line, creating it if needed. A received unit cost
   reprices the item at the weighted average of what is on hand and what
   arrived. Called only from the RPCs below, which log the movement. */
create or replace function public.fn_company_stock_add(
  p_item_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_unit_cost_cents bigint default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_on_hand numeric;
  v_cost bigint;
begin
  if p_unit_cost_cents is not null then
    select coalesce(sum(s.quantity), 0) into v_on_hand
    from public.company_stock s where s.item_id = p_item_id;
    select i.unit_cost_cents into v_cost from public.company_item i where i.id = p_item_id for update;
    update public.company_item i
    set unit_cost_cents = case
          when v_on_hand + p_quantity <= 0 then p_unit_cost_cents
          else round((v_on_hand * v_cost + p_quantity * p_unit_cost_cents) / (v_on_hand + p_quantity))::bigint
        end,
        updated_at = now()
    where i.id = p_item_id;
  end if;

  insert into public.company_stock (item_id, location_id, quantity)
  values (p_item_id, p_location_id, p_quantity)
  on conflict (item_id, location_id) do update
  set quantity = public.company_stock.quantity + excluded.quantity,
      updated_at = now();
end;
$$;

/* Takes from a stock line, refusing to go below zero. */
create or replace function public.fn_company_stock_take(
  p_item_id uuid,
  p_location_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_on_hand numeric;
  v_unit text;
begin
  select s.quantity into v_on_hand
  from public.company_stock s
  where s.item_id = p_item_id and s.location_id = p_location_id
  for update;

  if coalesce(v_on_hand, 0) < p_quantity then
    select i.unit into v_unit from public.company_item i where i.id = p_item_id;
    raise exception 'Only % % on hand there.',
      rtrim(to_char(coalesce(v_on_hand, 0), 'FM999999999990.99'), '.'), v_unit
      using errcode = '23514';
  end if;

  update public.company_stock s
  set quantity = s.quantity - p_quantity,
      updated_at = now()
  where s.item_id = p_item_id and s.location_id = p_location_id;
end;
$$;

revoke execute on function public.fn_company_stock_add(uuid, uuid, numeric, bigint)
  from public, anon, authenticated;
revoke execute on function public.fn_company_stock_take(uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.fn_company_stock_add(uuid, uuid, numeric, bigint) to service_role;
grant execute on function public.fn_company_stock_take(uuid, uuid, numeric) to service_role;

-- ═══════════════════════════════════════════════════════════════ folders

create or replace function public.rpc_company_folder_save(
  p_name text,
  p_color text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.company_folder;
  v_new public.company_folder;
begin
  if v_name = '' then
    raise exception 'Give the folder a name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.company_folder f
             where lower(btrim(f.name)) = lower(v_name) and f.id is distinct from p_id) then
    raise exception 'There is already a folder called "%".', v_name using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.company_folder (name, color, created_by)
    values (v_name, coalesce(p_color, 'gold'), v_staff)
    returning * into v_new;
  else
    select * into v_old from public.company_folder where id = p_id for update;
    if v_old.id is null then
      raise exception 'That folder no longer exists.' using errcode = 'P0002';
    end if;
    update public.company_folder
    set name = v_name, color = coalesce(p_color, color), updated_at = now()
    where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case when p_id is null then 'company.folder_created' else 'company.folder_updated' end,
    p_actor_id => v_staff,
    p_target_type => 'company_folder', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

create or replace function public.rpc_company_folder_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_folder;
begin
  select * into v_old from public.company_folder where id = p_id for update;
  if v_old.id is null then
    raise exception 'That folder no longer exists.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.company_file f where f.folder_id = p_id and f.deleted_at is null) then
    raise exception 'Move or delete the files in "%" first.', v_old.name using errcode = '23503';
  end if;

  delete from public.company_folder where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.folder_deleted',
    p_actor_id => v_staff,
    p_target_type => 'company_folder', p_target_id => v_old.id, p_target_label => v_old.name,
    p_before => to_jsonb(v_old));
end;
$$;

-- ═════════════════════════════════════════════════════════════════ files

/* Registers an upload. Size and type come from storage, not the browser. */
create or replace function public.rpc_company_file_add(
  p_path text,
  p_name text default null,
  p_folder_id uuid default null,
  p_visibility text default 'company',
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_uid uuid := auth.uid();
  v_meta jsonb;
  v_found boolean := false;
  v_new public.company_file;
begin
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text then
    raise exception 'Upload the file into your own folder first.' using errcode = '42501';
  end if;

  select true, o.metadata into v_found, v_meta
  from storage.objects o
  where o.bucket_id = 'company-files' and o.name = p_path and o.owner_id = v_uid::text;

  if not coalesce(v_found, false) then
    raise exception 'The upload did not arrive. Try again.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.company_file f where f.storage_path = p_path) then
    raise exception 'That upload is already in Company files.' using errcode = '23505';
  end if;
  if p_folder_id is not null and not exists (select 1 from public.company_folder where id = p_folder_id) then
    raise exception 'That folder no longer exists.' using errcode = 'P0002';
  end if;
  if coalesce(p_visibility, 'company') not in ('company', 'private') then
    raise exception 'A file is either company-wide or private.' using errcode = '22023';
  end if;

  insert into public.company_file (
    folder_id, name, storage_path, mime_type, size_bytes, visibility, description, owner_id)
  values (
    p_folder_id,
    left(coalesce(nullif(btrim(p_name), ''), regexp_replace(p_path, '^.*/', '')), 200),
    p_path,
    coalesce(nullif(v_meta ->> 'mimetype', ''), 'application/octet-stream'),
    coalesce((v_meta ->> 'size')::bigint, 0),
    coalesce(p_visibility, 'company'),
    nullif(btrim(p_description), ''),
    v_staff)
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.file_uploaded',
    p_actor_id => v_staff,
    p_target_type => 'company_file', p_target_id => v_new.id, p_target_label => v_new.name,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

/* Rename, move to a folder, change who sees it. A private file is the
   owner's to change; a company-wide one anyone who writes Company may
   rename or move, but only its owner makes it private. */
create or replace function public.rpc_company_file_update(
  p_id uuid,
  p_name text,
  p_folder_id uuid default null,
  p_visibility text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_file;
  v_new public.company_file;
  v_visibility text;
begin
  select * into v_old from public.company_file where id = p_id for update;
  if v_old.id is null or not authz.company_sees_file(p_id) then
    raise exception 'That file is not there any more.' using errcode = 'P0002';
  end if;
  if v_old.deleted_at is not null then
    raise exception 'Restore the file from the trash first.' using errcode = '22023';
  end if;
  if v_old.visibility = 'private' and v_old.owner_id is distinct from v_staff then
    raise exception 'Only the owner can change a private file.' using errcode = '42501';
  end if;

  v_visibility := coalesce(p_visibility, v_old.visibility);
  if v_visibility not in ('company', 'private') then
    raise exception 'A file is either company-wide or private.' using errcode = '22023';
  end if;
  if v_visibility <> v_old.visibility and v_old.owner_id is distinct from v_staff then
    raise exception 'Only the owner can change who sees this file.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Give the file a name.' using errcode = '22023';
  end if;
  if p_folder_id is not null and not exists (select 1 from public.company_folder where id = p_folder_id) then
    raise exception 'That folder no longer exists.' using errcode = 'P0002';
  end if;

  update public.company_file
  set name = left(btrim(p_name), 200),
      folder_id = p_folder_id,
      visibility = v_visibility,
      description = nullif(btrim(p_description), ''),
      updated_at = now()
  where id = p_id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.file_updated',
    p_actor_id => v_staff,
    p_target_type => 'company_file', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => to_jsonb(v_old), p_after => to_jsonb(v_new));
end;
$$;

/* Sets exactly who a file is shared with. Everyone named must be active
   staff who reach Company, or they could not open it anyway. */
create or replace function public.rpc_company_file_share(p_id uuid, p_staff_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_file public.company_file;
  v_before uuid[];
  v_after uuid[];
  v_bad uuid;
begin
  select * into v_file from public.company_file where id = p_id for update;
  if v_file.id is null or not authz.company_sees_file(p_id) then
    raise exception 'That file is not there any more.' using errcode = 'P0002';
  end if;
  if v_file.deleted_at is not null then
    raise exception 'Restore the file from the trash first.' using errcode = '22023';
  end if;
  if v_file.visibility = 'private' and v_file.owner_id is distinct from v_staff then
    raise exception 'Only the owner can share a private file.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_after
  from unnest(coalesce(p_staff_ids, '{}')) as x
  where x is distinct from v_file.owner_id;

  select x into v_bad from unnest(v_after) as x
  where authz.company_level_of(x) is null
  limit 1;
  if v_bad is not null then
    raise exception 'Files can only be shared with colleagues who use Company.' using errcode = '22023';
  end if;

  select coalesce(array_agg(s.staff_id order by s.staff_id), '{}') into v_before
  from public.company_file_share s where s.file_id = p_id;

  delete from public.company_file_share s where s.file_id = p_id and not (s.staff_id = any (v_after));
  insert into public.company_file_share (file_id, staff_id, shared_by)
  select p_id, x, v_staff from unnest(v_after) as x
  on conflict (file_id, staff_id) do nothing;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.file_shared',
    p_actor_id => v_staff,
    p_target_type => 'company_file', p_target_id => v_file.id, p_target_label => v_file.name,
    p_before => jsonb_build_object('shared_with', to_jsonb(v_before)),
    p_after => jsonb_build_object('shared_with', to_jsonb(v_after)));

  return cardinality(v_after);
end;
$$;

/* Trash and restore. Private files: the owner. Company files: anyone who
   writes Company, since the trash keeps them. */
create or replace function public.rpc_company_file_trash(p_id uuid, p_trash boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_file;
  v_new public.company_file;
begin
  select * into v_old from public.company_file where id = p_id for update;
  if v_old.id is null or not authz.company_sees_file(p_id) then
    raise exception 'That file is not there any more.' using errcode = 'P0002';
  end if;
  if v_old.visibility = 'private' and v_old.owner_id is distinct from v_staff then
    raise exception 'Only the owner can move a private file to the trash.' using errcode = '42501';
  end if;
  if p_trash = (v_old.deleted_at is not null) then
    return;
  end if;

  update public.company_file
  set deleted_at = case when p_trash then now() end,
      deleted_by = case when p_trash then v_staff end,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case when p_trash then 'company.file_trashed' else 'company.file_restored' end,
    p_actor_id => v_staff,
    p_target_type => 'company_file', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => to_jsonb(v_old), p_after => to_jsonb(v_new));
end;
$$;

/* Deletes a file in the trash for good and returns its storage path, which
   the console then removes from the bucket (an orphan by then). The owner,
   or someone with full Company access. */
create or replace function public.rpc_company_file_purge(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_file;
begin
  select * into v_old from public.company_file where id = p_id for update;
  if v_old.id is null or not authz.company_sees_file(p_id) then
    raise exception 'That file is not there any more.' using errcode = 'P0002';
  end if;
  if v_old.deleted_at is null then
    raise exception 'Move the file to the trash first.' using errcode = '22023';
  end if;
  if v_old.owner_id is distinct from v_staff and not authz.company_approves() then
    raise exception 'Only the owner or someone with full Company access can delete a file for good.'
      using errcode = '42501';
  end if;

  delete from public.company_file where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.file_deleted',
    p_actor_id => v_staff,
    p_target_type => 'company_file', p_target_id => v_old.id, p_target_label => v_old.name,
    p_before => to_jsonb(v_old));

  return v_old.storage_path;
end;
$$;

/* A personal bookmark (exempt from the audit log, see wiring_audit_exempt). */
create or replace function public.rpc_company_file_star(p_id uuid, p_starred boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('read');
begin
  if not authz.company_sees_file(p_id) then
    raise exception 'That file is not there any more.' using errcode = 'P0002';
  end if;
  if p_starred then
    insert into public.company_file_star (staff_id, file_id) values (v_staff, p_id)
    on conflict do nothing;
  else
    delete from public.company_file_star where staff_id = v_staff and file_id = p_id;
  end if;
  return p_starred;
end;
$$;

-- ═══════════════════════════════════════════════════════════ locations

create or replace function public.rpc_company_location_save(
  p_name text,
  p_kind text default 'warehouse',
  p_city_id uuid default null,
  p_address text default null,
  p_manager_id uuid default null,
  p_phone text default null,
  p_notes text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.company_location;
  v_new public.company_location;
begin
  if length(v_name) < 2 then
    raise exception 'Give the location a name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.company_location l
             where lower(btrim(l.name)) = lower(v_name) and l.id is distinct from p_id) then
    raise exception 'There is already a location called "%".', v_name using errcode = '23505';
  end if;
  if p_manager_id is not null and not exists (
    select 1 from public.staff_user su where su.id = p_manager_id and su.status = 'active') then
    raise exception 'The manager must be an active colleague.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.company_location (name, kind, city_id, address, manager_id, phone, notes, created_by)
    values (v_name, coalesce(p_kind, 'warehouse'), p_city_id, nullif(btrim(p_address), ''),
            p_manager_id, nullif(btrim(p_phone), ''), nullif(btrim(p_notes), ''), v_staff)
    returning * into v_new;
  else
    select * into v_old from public.company_location where id = p_id for update;
    if v_old.id is null then
      raise exception 'That location no longer exists.' using errcode = 'P0002';
    end if;
    update public.company_location
    set name = v_name,
        kind = coalesce(p_kind, kind),
        city_id = p_city_id,
        address = nullif(btrim(p_address), ''),
        manager_id = p_manager_id,
        phone = nullif(btrim(p_phone), ''),
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.location_saved',
    p_actor_id => v_staff,
    p_target_type => 'company_location', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

/* Closing a location needs it empty: no stock on hand, no equipment there. */
create or replace function public.rpc_company_location_set_active(
  p_id uuid,
  p_active boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_location;
begin
  select * into v_old from public.company_location where id = p_id for update;
  if v_old.id is null then
    raise exception 'That location no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.active = p_active then
    return;
  end if;
  if not p_active then
    if exists (select 1 from public.company_stock s where s.location_id = p_id and s.quantity > 0) then
      raise exception 'Move or issue the stock at "%" before closing it.', v_old.name using errcode = '23514';
    end if;
    if exists (select 1 from public.company_asset a
               where a.location_id = p_id and a.status not in ('retired', 'lost')) then
      raise exception 'Move the equipment at "%" before closing it.', v_old.name using errcode = '23514';
    end if;
  end if;

  update public.company_location set active = p_active, updated_at = now() where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.location_status_changed',
    p_actor_id => v_staff,
    p_target_type => 'company_location', p_target_id => v_old.id, p_target_label => v_old.name,
    p_before => jsonb_build_object('active', v_old.active),
    p_after => jsonb_build_object('active', p_active),
    p_reason => nullif(btrim(p_reason), ''));
end;
$$;

-- ═════════════════════════════════════════════════════════════ vendors

create or replace function public.rpc_company_vendor_save(
  p_name text,
  p_categories text[] default '{}',
  p_contact_name text default null,
  p_email text default null,
  p_phone text default null,
  p_website text default null,
  p_address text default null,
  p_city_id uuid default null,
  p_tax_pin text default null,
  p_payment_terms text default 'net_30',
  p_rating smallint default null,
  p_notes text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.company_vendor;
  v_new public.company_vendor;
begin
  if length(v_name) < 2 then
    raise exception 'Give the vendor a name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.company_vendor v
             where lower(btrim(v.name)) = lower(v_name) and v.id is distinct from p_id) then
    raise exception 'There is already a vendor called "%".', v_name using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.company_vendor (
      name, categories, contact_name, email, phone, website, address, city_id, tax_pin,
      payment_terms, rating, notes, created_by)
    values (
      v_name, coalesce(p_categories, '{}'), nullif(btrim(p_contact_name), ''),
      lower(nullif(btrim(p_email), '')), nullif(btrim(p_phone), ''), nullif(btrim(p_website), ''),
      nullif(btrim(p_address), ''), p_city_id, upper(nullif(btrim(p_tax_pin), '')),
      coalesce(p_payment_terms, 'net_30'), p_rating, nullif(btrim(p_notes), ''), v_staff)
    returning * into v_new;
  else
    select * into v_old from public.company_vendor where id = p_id for update;
    if v_old.id is null then
      raise exception 'That vendor no longer exists.' using errcode = 'P0002';
    end if;
    update public.company_vendor
    set name = v_name,
        categories = coalesce(p_categories, '{}'),
        contact_name = nullif(btrim(p_contact_name), ''),
        email = lower(nullif(btrim(p_email), '')),
        phone = nullif(btrim(p_phone), ''),
        website = nullif(btrim(p_website), ''),
        address = nullif(btrim(p_address), ''),
        city_id = p_city_id,
        tax_pin = upper(nullif(btrim(p_tax_pin), '')),
        payment_terms = coalesce(p_payment_terms, payment_terms),
        rating = p_rating,
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.vendor_saved',
    p_actor_id => v_staff,
    p_target_type => 'company_vendor', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

create or replace function public.rpc_company_vendor_set_status(
  p_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_vendor;
begin
  if p_status not in ('active', 'on_hold', 'archived') then
    raise exception 'A vendor is active, on hold or archived.' using errcode = '22023';
  end if;
  select * into v_old from public.company_vendor where id = p_id for update;
  if v_old.id is null then
    raise exception 'That vendor no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status = p_status then
    return;
  end if;
  if p_status <> 'active' and nullif(btrim(p_reason), '') is null then
    raise exception 'Say why, so colleagues know before they order.' using errcode = '22023';
  end if;
  if p_status = 'archived' and exists (
    select 1 from public.company_purchase_order o
    where o.vendor_id = p_id and o.status in ('issued', 'partially_received')) then
    raise exception 'This vendor still has open purchase orders.' using errcode = '23514';
  end if;

  update public.company_vendor set status = p_status, updated_at = now() where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.vendor_status_changed',
    p_actor_id => v_staff,
    p_target_type => 'company_vendor', p_target_id => v_old.id, p_target_label => v_old.name,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', p_status),
    p_reason => nullif(btrim(p_reason), ''));
end;
$$;

-- ══════════════════════════════════════════════════════════ categories

create or replace function public.rpc_company_category_save(
  p_name text,
  p_icon text default 'package',
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.company_category;
  v_new public.company_category;
begin
  if length(v_name) < 2 then
    raise exception 'Give the category a name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.company_category c
             where lower(btrim(c.name)) = lower(v_name) and c.id is distinct from p_id) then
    raise exception 'There is already a category called "%".', v_name using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.company_category (name, icon, created_by)
    values (v_name, coalesce(p_icon, 'package'), v_staff)
    returning * into v_new;
  else
    select * into v_old from public.company_category where id = p_id for update;
    if v_old.id is null then
      raise exception 'That category no longer exists.' using errcode = 'P0002';
    end if;
    update public.company_category
    set name = v_name, icon = coalesce(p_icon, icon)
    where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.category_saved',
    p_actor_id => v_staff,
    p_target_type => 'company_category', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ items

/* Adds or edits an inventory item. A new item starts at a location, with
   whatever is already on the shelf as its opening stock. */
create or replace function public.rpc_company_item_save(
  p_name text,
  p_category_id uuid,
  p_sku text default null,
  p_unit text default 'pcs',
  p_unit_cost_cents bigint default 0,
  p_reorder_level numeric default 0,
  p_vendor_id uuid default null,
  p_description text default null,
  p_photo_path text default null,
  p_location_id uuid default null,
  p_opening_quantity numeric default 0,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_sku text := nullif(btrim(p_sku), '');
  v_old public.company_item;
  v_new public.company_item;
  v_opening numeric := coalesce(p_opening_quantity, 0);
begin
  if length(v_name) < 2 then
    raise exception 'Give the item a name.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_category c where c.id = p_category_id) then
    raise exception 'Choose a category.' using errcode = '22023';
  end if;
  if v_sku is not null and exists (
    select 1 from public.company_item i where lower(i.sku) = lower(v_sku) and i.id is distinct from p_id) then
    raise exception 'Another item already uses SKU %.', v_sku using errcode = '23505';
  end if;
  if coalesce(p_unit_cost_cents, 0) < 0 or coalesce(p_reorder_level, 0) < 0 then
    raise exception 'Costs and reorder levels cannot be negative.' using errcode = '22023';
  end if;
  if p_photo_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'company-photos' and o.name = p_photo_path) then
    raise exception 'The photo did not arrive. Try again.' using errcode = 'P0002';
  end if;

  if p_id is null then
    if p_location_id is null or not exists (
      select 1 from public.company_location l where l.id = p_location_id and l.active) then
      raise exception 'Choose where the item is kept.' using errcode = '22023';
    end if;
    if v_opening < 0 then
      raise exception 'The opening quantity cannot be negative.' using errcode = '22023';
    end if;

    insert into public.company_item (
      name, sku, category_id, unit, unit_cost_cents, reorder_level, vendor_id, description,
      photo_path, created_by)
    values (
      v_name, v_sku, p_category_id, coalesce(p_unit, 'pcs'), coalesce(p_unit_cost_cents, 0),
      coalesce(p_reorder_level, 0), p_vendor_id, nullif(btrim(p_description), ''),
      p_photo_path, v_staff)
    returning * into v_new;

    insert into public.company_stock (item_id, location_id, quantity)
    values (v_new.id, p_location_id, v_opening);

    if v_opening > 0 then
      insert into public.company_stock_movement (
        item_id, kind, quantity, to_location_id, unit_cost_cents, reason, created_by)
      values (v_new.id, 'in', v_opening, p_location_id, v_new.unit_cost_cents, 'opening', v_staff);
    end if;
  else
    select * into v_old from public.company_item where id = p_id for update;
    if v_old.id is null then
      raise exception 'That item no longer exists.' using errcode = 'P0002';
    end if;
    update public.company_item
    set name = v_name,
        sku = v_sku,
        category_id = p_category_id,
        unit = coalesce(p_unit, unit),
        unit_cost_cents = coalesce(p_unit_cost_cents, unit_cost_cents),
        reorder_level = coalesce(p_reorder_level, reorder_level),
        vendor_id = p_vendor_id,
        description = nullif(btrim(p_description), ''),
        photo_path = p_photo_path,
        updated_at = now()
    where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case when p_id is null then 'company.item_created' else 'company.item_updated' end,
    p_actor_id => v_staff,
    p_target_type => 'company_item', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new) || case when p_id is null
      then jsonb_build_object('opening_location_id', p_location_id, 'opening_quantity', v_opening)
      else '{}'::jsonb end);

  return v_new.id;
end;
$$;

/* Archiving takes an item off the lists; only once nothing is on hand. */
create or replace function public.rpc_company_item_archive(p_id uuid, p_archived boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_item;
begin
  select * into v_old from public.company_item where id = p_id for update;
  if v_old.id is null then
    raise exception 'That item no longer exists.' using errcode = 'P0002';
  end if;
  if p_archived = (v_old.archived_at is not null) then
    return;
  end if;
  if p_archived and exists (
    select 1 from public.company_stock s where s.item_id = p_id and s.quantity > 0) then
    raise exception 'Issue or count out what is left of "%" first.', v_old.name using errcode = '23514';
  end if;

  update public.company_item
  set archived_at = case when p_archived then now() end, updated_at = now()
  where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.item_archived',
    p_actor_id => v_staff,
    p_target_type => 'company_item', p_target_id => v_old.id, p_target_label => v_old.name,
    p_before => jsonb_build_object('archived', v_old.archived_at is not null),
    p_after => jsonb_build_object('archived', p_archived));
end;
$$;

-- ═════════════════════════════════════════════════════ moving stock

/* Receive (in), issue (out) or move (transfer) stock. */
create or replace function public.rpc_company_stock_move(
  p_item_id uuid,
  p_kind text,
  p_quantity numeric,
  p_from_location_id uuid default null,
  p_to_location_id uuid default null,
  p_unit_cost_cents bigint default null,
  p_reason text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_item public.company_item;
  v_move public.company_stock_movement;
begin
  if p_kind not in ('in', 'out', 'transfer') then
    raise exception 'Stock is received, issued or moved.' using errcode = '22023';
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Enter a quantity above zero.' using errcode = '22023';
  end if;
  select * into v_item from public.company_item where id = p_item_id;
  if v_item.id is null or v_item.archived_at is not null then
    raise exception 'That item is not in the inventory.' using errcode = 'P0002';
  end if;
  if p_kind in ('out', 'transfer') and (p_from_location_id is null or not exists (
    select 1 from public.company_location l where l.id = p_from_location_id)) then
    raise exception 'Choose where the stock comes from.' using errcode = '22023';
  end if;
  if p_kind in ('in', 'transfer') and (p_to_location_id is null or not exists (
    select 1 from public.company_location l where l.id = p_to_location_id and l.active)) then
    raise exception 'Choose an open location for the stock to go to.' using errcode = '22023';
  end if;
  if p_kind = 'transfer' and p_from_location_id = p_to_location_id then
    raise exception 'Moving stock needs two different locations.' using errcode = '22023';
  end if;

  if p_kind in ('out', 'transfer') then
    perform public.fn_company_stock_take(p_item_id, p_from_location_id, p_quantity);
  end if;
  if p_kind in ('in', 'transfer') then
    perform public.fn_company_stock_add(
      p_item_id, p_to_location_id, p_quantity,
      case when p_kind = 'in' then p_unit_cost_cents end);
  end if;

  insert into public.company_stock_movement (
    item_id, kind, quantity, from_location_id, to_location_id, unit_cost_cents, reason, note,
    created_by)
  values (
    p_item_id, p_kind, p_quantity,
    case when p_kind <> 'in' then p_from_location_id end,
    case when p_kind <> 'out' then p_to_location_id end,
    case when p_kind = 'in' then coalesce(p_unit_cost_cents, v_item.unit_cost_cents) end,
    coalesce(p_reason, case p_kind when 'in' then 'purchase' when 'out' then 'issued' else 'move' end),
    nullif(btrim(p_note), ''),
    v_staff)
  returning * into v_move;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case p_kind
      when 'in' then 'company.stock_received'
      when 'out' then 'company.stock_issued'
      else 'company.stock_transferred' end,
    p_actor_id => v_staff,
    p_target_type => 'company_item', p_target_id => p_item_id, p_target_label => v_item.name,
    p_after => to_jsonb(v_move));

  return v_move.id;
end;
$$;

/* A stock count: sets what is on hand at a location to what was counted,
   recording the difference as an adjustment. */
create or replace function public.rpc_company_stock_count(
  p_item_id uuid,
  p_location_id uuid,
  p_counted numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_item public.company_item;
  v_on_hand numeric;
  v_delta numeric;
  v_move public.company_stock_movement;
begin
  if p_counted is null or p_counted < 0 then
    raise exception 'Enter what was counted (zero or more).' using errcode = '22023';
  end if;
  select * into v_item from public.company_item where id = p_item_id;
  if v_item.id is null or v_item.archived_at is not null then
    raise exception 'That item is not in the inventory.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.company_location l where l.id = p_location_id) then
    raise exception 'Choose where the count was taken.' using errcode = '22023';
  end if;

  insert into public.company_stock (item_id, location_id, quantity)
  values (p_item_id, p_location_id, 0)
  on conflict (item_id, location_id) do nothing;

  select s.quantity into v_on_hand from public.company_stock s
  where s.item_id = p_item_id and s.location_id = p_location_id
  for update;

  v_delta := p_counted - v_on_hand;

  if v_delta <> 0 then
    update public.company_stock
    set quantity = p_counted, updated_at = now()
    where item_id = p_item_id and location_id = p_location_id;

    insert into public.company_stock_movement (
      item_id, kind, quantity, from_location_id, to_location_id, reason, note, created_by)
    values (
      p_item_id, 'adjust', abs(v_delta),
      case when v_delta < 0 then p_location_id end,
      case when v_delta > 0 then p_location_id end,
      'count', nullif(btrim(p_note), ''), v_staff)
    returning * into v_move;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.stock_counted',
    p_actor_id => v_staff,
    p_target_type => 'company_item', p_target_id => p_item_id, p_target_label => v_item.name,
    p_before => jsonb_build_object('location_id', p_location_id, 'quantity', v_on_hand),
    p_after => jsonb_build_object('location_id', p_location_id, 'quantity', p_counted),
    p_reason => nullif(btrim(p_note), ''));

  return v_move.id;
end;
$$;

-- ══════════════════════════════════════════════════════════════ assets

create or replace function public.rpc_company_asset_save(
  p_name text,
  p_category_id uuid,
  p_brand text default null,
  p_model text default null,
  p_serial_number text default null,
  p_location_id uuid default null,
  p_condition text default 'good',
  p_purchase_date date default null,
  p_purchase_cost_cents bigint default null,
  p_vendor_id uuid default null,
  p_warranty_until date default null,
  p_next_service_on date default null,
  p_photo_path text default null,
  p_notes text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.company_asset;
  v_new public.company_asset;
begin
  if length(v_name) < 2 then
    raise exception 'Give the asset a name.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_category c where c.id = p_category_id) then
    raise exception 'Choose a category.' using errcode = '22023';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.company_location l where l.id = p_location_id) then
    raise exception 'That location no longer exists.' using errcode = 'P0002';
  end if;
  if p_photo_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'company-photos' and o.name = p_photo_path) then
    raise exception 'The photo did not arrive. Try again.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.company_asset (
      name, category_id, brand, model, serial_number, location_id, condition, purchase_date,
      purchase_cost_cents, vendor_id, warranty_until, next_service_on, photo_path, notes,
      created_by)
    values (
      v_name, p_category_id, nullif(btrim(p_brand), ''), nullif(btrim(p_model), ''),
      nullif(btrim(p_serial_number), ''), p_location_id, coalesce(p_condition, 'good'),
      p_purchase_date, p_purchase_cost_cents, p_vendor_id, p_warranty_until, p_next_service_on,
      p_photo_path, nullif(btrim(p_notes), ''), v_staff)
    returning * into v_new;

    insert into public.company_asset_event (asset_id, kind, detail, cost_cents, staff_id)
    values (v_new.id, 'registered', null, v_new.purchase_cost_cents, v_staff);
  else
    select * into v_old from public.company_asset where id = p_id for update;
    if v_old.id is null then
      raise exception 'That asset no longer exists.' using errcode = 'P0002';
    end if;
    update public.company_asset
    set name = v_name,
        category_id = p_category_id,
        brand = nullif(btrim(p_brand), ''),
        model = nullif(btrim(p_model), ''),
        serial_number = nullif(btrim(p_serial_number), ''),
        location_id = p_location_id,
        condition = coalesce(p_condition, condition),
        purchase_date = p_purchase_date,
        purchase_cost_cents = p_purchase_cost_cents,
        vendor_id = p_vendor_id,
        warranty_until = p_warranty_until,
        next_service_on = p_next_service_on,
        photo_path = p_photo_path,
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_id
    returning * into v_new;

    if v_new.location_id is distinct from v_old.location_id then
      insert into public.company_asset_event (asset_id, kind, detail, staff_id)
      values (v_new.id, 'moved',
              (select 'To ' || l.name from public.company_location l where l.id = v_new.location_id),
              v_staff);
    end if;
    insert into public.company_asset_event (asset_id, kind, detail, staff_id)
    values (v_new.id, 'updated',
            case when v_new.condition <> v_old.condition
                 then 'Condition ' || v_old.condition || ' → ' || v_new.condition end,
            v_staff);
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case when p_id is null then 'company.asset_created' else 'company.asset_updated' end,
    p_actor_id => v_staff,
    p_target_type => 'company_asset', p_target_id => v_new.id,
    p_target_label => v_new.tag || ' · ' || v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

/* Hand an asset to a colleague (p_staff_id) or to somebody named
   (p_assignee_name), such as a rider. Reassigning is allowed. */
create or replace function public.rpc_company_asset_assign(
  p_id uuid,
  p_staff_id uuid default null,
  p_assignee_name text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_asset;
  v_new public.company_asset;
  v_name text := nullif(btrim(p_assignee_name), '');
  v_holder text;
begin
  if num_nonnulls(p_staff_id, v_name) <> 1 then
    raise exception 'Choose a colleague or type the name of whoever takes it.' using errcode = '22023';
  end if;
  if p_staff_id is not null then
    select coalesce(nullif(btrim(su.display_name), ''), su.email) into v_holder
    from public.staff_user su
    where su.id = p_staff_id and su.status = 'active';
    if v_holder is null then
      raise exception 'That colleague is not active.' using errcode = '22023';
    end if;
  else
    v_holder := v_name;
  end if;

  select * into v_old from public.company_asset where id = p_id for update;
  if v_old.id is null then
    raise exception 'That asset no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status not in ('available', 'in_use') then
    raise exception 'Only equipment that is available or in use can be handed over.' using errcode = '23514';
  end if;

  update public.company_asset
  set assigned_to = p_staff_id,
      assignee_name = left(v_holder, 120),
      assigned_at = now(),
      status = 'in_use',
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.company_asset_event (asset_id, kind, detail, staff_id)
  values (p_id, 'assigned', left('To ' || v_holder || coalesce(' · ' || nullif(btrim(p_note), ''), ''), 500), v_staff);

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.asset_assigned',
    p_actor_id => v_staff,
    p_target_type => 'company_asset', p_target_id => p_id,
    p_target_label => v_new.tag || ' · ' || v_new.name,
    p_before => jsonb_build_object('status', v_old.status, 'assigned_to', v_old.assigned_to,
                                   'assignee_name', v_old.assignee_name),
    p_after => jsonb_build_object('status', v_new.status, 'assigned_to', v_new.assigned_to,
                                  'assignee_name', v_new.assignee_name),
    p_reason => nullif(btrim(p_note), ''));
end;
$$;

create or replace function public.rpc_company_asset_return(
  p_id uuid,
  p_condition text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_asset;
  v_new public.company_asset;
begin
  select * into v_old from public.company_asset where id = p_id for update;
  if v_old.id is null then
    raise exception 'That asset no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status <> 'in_use' then
    raise exception 'Nobody holds this asset.' using errcode = '23514';
  end if;

  update public.company_asset
  set assigned_to = null,
      assignee_name = null,
      assigned_at = null,
      status = 'available',
      condition = coalesce(p_condition, condition),
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.company_asset_event (asset_id, kind, detail, staff_id)
  values (p_id, 'returned',
          left(concat_ws(' · ',
            v_old.assignee_name,
            case when v_new.condition <> v_old.condition then 'Condition ' || v_new.condition end,
            nullif(btrim(p_note), '')), 500),
          v_staff);

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.asset_returned',
    p_actor_id => v_staff,
    p_target_type => 'company_asset', p_target_id => p_id,
    p_target_label => v_new.tag || ' · ' || v_new.name,
    p_before => jsonb_build_object('status', v_old.status, 'assigned_to', v_old.assigned_to,
                                   'assignee_name', v_old.assignee_name, 'condition', v_old.condition),
    p_after => jsonb_build_object('status', v_new.status, 'condition', v_new.condition),
    p_reason => nullif(btrim(p_note), ''));
end;
$$;

/* Maintenance in three steps: schedule a date, take it in, bring it back.
   Whoever holds it keeps it on their name while it is away. */
create or replace function public.rpc_company_asset_maintenance(
  p_id uuid,
  p_step text,
  p_due_on date default null,
  p_cost_cents bigint default null,
  p_condition text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_asset;
  v_new public.company_asset;
begin
  if p_step not in ('schedule', 'start', 'complete') then
    raise exception 'Maintenance is scheduled, started or completed.' using errcode = '22023';
  end if;
  if p_cost_cents is not null and p_cost_cents < 0 then
    raise exception 'A cost cannot be negative.' using errcode = '22023';
  end if;
  select * into v_old from public.company_asset where id = p_id for update;
  if v_old.id is null then
    raise exception 'That asset no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status in ('retired', 'lost') then
    raise exception 'This asset is no longer in use.' using errcode = '23514';
  end if;

  if p_step = 'schedule' then
    if p_due_on is null then
      raise exception 'Choose the service date.' using errcode = '22023';
    end if;
    update public.company_asset set next_service_on = p_due_on, updated_at = now()
    where id = p_id returning * into v_new;
    insert into public.company_asset_event (asset_id, kind, detail, due_on, staff_id)
    values (p_id, 'maintenance_scheduled', nullif(btrim(p_note), ''), p_due_on, v_staff);
  elsif p_step = 'start' then
    if v_old.status = 'maintenance' then
      raise exception 'This asset is already in for maintenance.' using errcode = '23514';
    end if;
    update public.company_asset set status = 'maintenance', updated_at = now()
    where id = p_id returning * into v_new;
    insert into public.company_asset_event (asset_id, kind, detail, staff_id)
    values (p_id, 'maintenance_started', nullif(btrim(p_note), ''), v_staff);
  else
    if v_old.status <> 'maintenance' then
      raise exception 'This asset is not in for maintenance.' using errcode = '23514';
    end if;
    update public.company_asset
    set status = case when assignee_name is not null then 'in_use' else 'available' end,
        condition = coalesce(p_condition, condition),
        next_service_on = p_due_on,
        updated_at = now()
    where id = p_id
    returning * into v_new;
    insert into public.company_asset_event (asset_id, kind, detail, cost_cents, due_on, staff_id)
    values (p_id, 'maintenance_done', nullif(btrim(p_note), ''), p_cost_cents, p_due_on, v_staff);
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case p_step
      when 'schedule' then 'company.asset_maintenance_scheduled'
      when 'start' then 'company.asset_maintenance_started'
      else 'company.asset_maintenance_completed' end,
    p_actor_id => v_staff,
    p_target_type => 'company_asset', p_target_id => p_id,
    p_target_label => v_new.tag || ' · ' || v_new.name,
    p_before => jsonb_build_object('status', v_old.status, 'next_service_on', v_old.next_service_on,
                                   'condition', v_old.condition),
    p_after => jsonb_build_object('status', v_new.status, 'next_service_on', v_new.next_service_on,
                                  'condition', v_new.condition, 'cost_cents', p_cost_cents),
    p_reason => nullif(btrim(p_note), ''));
end;
$$;

/* Retire an asset, report it lost, or bring either back into use. */
create or replace function public.rpc_company_asset_set_status(
  p_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_asset;
  v_new public.company_asset;
begin
  if p_status not in ('retired', 'lost', 'available') then
    raise exception 'An asset can be retired, reported lost or made available again.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Say why.' using errcode = '22023';
  end if;
  select * into v_old from public.company_asset where id = p_id for update;
  if v_old.id is null then
    raise exception 'That asset no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status = p_status then
    return;
  end if;
  if p_status = 'available' and v_old.status not in ('retired', 'lost') then
    raise exception 'Only retired or lost equipment is brought back this way.' using errcode = '23514';
  end if;

  update public.company_asset
  set status = p_status,
      assigned_to = case when p_status = 'lost' then assigned_to end,
      assignee_name = case when p_status = 'lost' then assignee_name end,
      assigned_at = case when p_status = 'lost' then assigned_at end,
      next_service_on = case when p_status = 'available' then next_service_on end,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.company_asset_event (asset_id, kind, detail, staff_id)
  values (p_id,
          case p_status when 'retired' then 'retired' when 'lost' then 'lost' else 'restored' end,
          left(btrim(p_reason), 500), v_staff);

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.asset_status_changed',
    p_actor_id => v_staff,
    p_target_type => 'company_asset', p_target_id => p_id,
    p_target_label => v_new.tag || ' · ' || v_new.name,
    p_before => jsonb_build_object('status', v_old.status, 'assigned_to', v_old.assigned_to,
                                   'assignee_name', v_old.assignee_name),
    p_after => jsonb_build_object('status', v_new.status, 'assigned_to', v_new.assigned_to,
                                  'assignee_name', v_new.assignee_name),
    p_reason => btrim(p_reason));
end;
$$;

-- ══════════════════════════════════════════════════════════ procurement

/*
 * Drafts or edits a purchase request with its lines, and sends it for
 * approval when p_submit is true. p_lines is a JSON array of
 * {item_id?, description, quantity, unit_cost_cents}. Only drafts and
 * rejected requests can be edited (a rejected one goes back to draft), by
 * whoever asked or by someone with full access.
 */
create or replace function public.rpc_company_purchase_save(
  p_title text,
  p_lines jsonb,
  p_justification text default null,
  p_department text default 'operations',
  p_priority text default 'normal',
  p_needed_by date default null,
  p_vendor_id uuid default null,
  p_location_id uuid default null,
  p_submit boolean default false,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_purchase_request;
  v_new public.company_purchase_request;
  v_line jsonb;
  v_sort integer := 0;
  v_item public.company_item;
  v_qty numeric;
  v_cost bigint;
  v_desc text;
  v_total numeric := 0;
begin
  if length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Say what is being bought.' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one line.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'A request holds up to 50 lines.' using errcode = '22023';
  end if;
  if p_vendor_id is not null and not exists (
    select 1 from public.company_vendor v where v.id = p_vendor_id and v.status <> 'archived') then
    raise exception 'That vendor is archived.' using errcode = '22023';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.company_location l where l.id = p_location_id and l.active) then
    raise exception 'Choose an open location to deliver to.' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_old from public.company_purchase_request where id = p_id for update;
    if v_old.id is null then
      raise exception 'That request no longer exists.' using errcode = 'P0002';
    end if;
    if v_old.status not in ('draft', 'rejected') then
      raise exception 'Only a draft or a turned-down request can be changed.' using errcode = '23514';
    end if;
    if v_old.requested_by is distinct from v_staff and not authz.company_approves() then
      raise exception 'Only whoever asked can change this request.' using errcode = '42501';
    end if;
  end if;

  if p_id is null then
    insert into public.company_purchase_request (
      title, justification, department, priority, needed_by, vendor_id, location_id, requested_by)
    values (
      btrim(p_title), nullif(btrim(p_justification), ''), coalesce(p_department, 'operations'),
      coalesce(p_priority, 'normal'), p_needed_by, p_vendor_id, p_location_id, v_staff)
    returning * into v_new;
  else
    update public.company_purchase_request
    set title = btrim(p_title),
        justification = nullif(btrim(p_justification), ''),
        department = coalesce(p_department, department),
        priority = coalesce(p_priority, priority),
        needed_by = p_needed_by,
        vendor_id = p_vendor_id,
        location_id = p_location_id,
        status = 'draft',
        decided_by = null,
        decided_at = null,
        decision_note = null,
        updated_at = now()
    where id = p_id
    returning * into v_new;
    delete from public.company_purchase_line where request_id = p_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_sort := v_sort + 1;
    v_item := null;
    if nullif(v_line ->> 'item_id', '') is not null then
      select * into v_item from public.company_item i where i.id = (v_line ->> 'item_id')::uuid;
      if v_item.id is null then
        raise exception 'Line %: that inventory item no longer exists.', v_sort using errcode = '22023';
      end if;
    end if;
    v_qty := nullif(v_line ->> 'quantity', '')::numeric;
    v_cost := coalesce(nullif(v_line ->> 'unit_cost_cents', '')::bigint, v_item.unit_cost_cents);
    v_desc := coalesce(nullif(btrim(v_line ->> 'description'), ''), v_item.name);
    if v_desc is null or length(v_desc) < 2 then
      raise exception 'Line %: say what it is.', v_sort using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Line %: enter a quantity above zero.', v_sort using errcode = '22023';
    end if;
    if v_cost is null or v_cost < 0 then
      raise exception 'Line %: enter the price.', v_sort using errcode = '22023';
    end if;
    insert into public.company_purchase_line (
      request_id, item_id, description, quantity, unit_cost_cents, sort)
    values (v_new.id, v_item.id, left(v_desc, 200), v_qty, v_cost, v_sort);
    v_total := v_total + v_qty * v_cost;
  end loop;

  update public.company_purchase_request
  set total_cents = round(v_total)::bigint,
      status = case when p_submit then 'submitted' else 'draft' end,
      submitted_at = case when p_submit then now() end
  where id = v_new.id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case when p_submit then 'company.purchase_request_submitted'
                     else 'company.purchase_request_saved' end,
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_request', p_target_id => v_new.id,
    p_target_label => v_new.number || ' · ' || v_new.title,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new) || jsonb_build_object('lines', (
      select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity,
                                          'unit_cost_cents', l.unit_cost_cents) order by l.sort)
      from public.company_purchase_line l where l.request_id = v_new.id)));

  return v_new.id;
end;
$$;

/* Sends a saved draft for approval. */
create or replace function public.rpc_company_purchase_submit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_purchase_request;
begin
  select * into v_old from public.company_purchase_request where id = p_id for update;
  if v_old.id is null then
    raise exception 'That request no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status <> 'draft' then
    raise exception 'Only a draft can be sent for approval.' using errcode = '23514';
  end if;
  if v_old.requested_by is distinct from v_staff and not authz.company_approves() then
    raise exception 'Only whoever asked can send this request.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.company_purchase_line l where l.request_id = p_id) then
    raise exception 'Add at least one line.' using errcode = '22023';
  end if;

  update public.company_purchase_request
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.purchase_request_submitted',
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_request', p_target_id => p_id,
    p_target_label => v_old.number || ' · ' || v_old.title,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', 'submitted', 'total_cents', v_old.total_cents));
end;
$$;

/* Approve or turn down a submitted request. Two people: whoever asked
   cannot decide, except a super admin, which is logged for review. */
create or replace function public.rpc_company_purchase_decide(
  p_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('approve');
  v_old public.company_purchase_request;
  v_new public.company_purchase_request;
  v_self boolean;
begin
  select * into v_old from public.company_purchase_request where id = p_id for update;
  if v_old.id is null then
    raise exception 'That request no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status <> 'submitted' then
    raise exception 'This request is not waiting for a decision.' using errcode = '23514';
  end if;
  v_self := v_old.requested_by = v_staff;
  if v_self and not authz.is_super_admin() then
    raise exception 'Someone other than whoever asked has to decide this request.' using errcode = '42501';
  end if;
  if not p_approve and nullif(btrim(p_note), '') is null then
    raise exception 'Say why it is turned down, so whoever asked can fix it.' using errcode = '22023';
  end if;

  update public.company_purchase_request
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = v_staff,
      decided_at = now(),
      decision_note = nullif(btrim(p_note), ''),
      updated_at = now()
  where id = p_id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case
      when not p_approve then 'company.purchase_request_rejected'
      when v_self then 'company.purchase_request_self_approved'
      else 'company.purchase_request_approved' end,
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_request', p_target_id => p_id,
    p_target_label => v_new.number || ' · ' || v_new.title,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', v_new.status, 'total_cents', v_new.total_cents),
    p_reason => nullif(btrim(p_note), ''));
end;
$$;

create or replace function public.rpc_company_purchase_cancel(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_purchase_request;
begin
  select * into v_old from public.company_purchase_request where id = p_id for update;
  if v_old.id is null then
    raise exception 'That request no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status not in ('draft', 'submitted', 'approved', 'rejected') then
    raise exception 'A request that has been ordered is closed by cancelling its purchase order.' using errcode = '23514';
  end if;
  if v_old.requested_by is distinct from v_staff and not authz.company_approves() then
    raise exception 'Only whoever asked can cancel this request.' using errcode = '42501';
  end if;
  if v_old.status <> 'draft' and nullif(btrim(p_reason), '') is null then
    raise exception 'Say why it is cancelled.' using errcode = '22023';
  end if;

  update public.company_purchase_request
  set status = 'cancelled', updated_at = now()
  where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.purchase_request_cancelled',
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_request', p_target_id => p_id,
    p_target_label => v_old.number || ' · ' || v_old.title,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', 'cancelled'),
    p_reason => nullif(btrim(p_reason), ''));
end;
$$;

/* Raises the purchase order for an approved request. */
create or replace function public.rpc_company_po_issue(
  p_request_id uuid,
  p_vendor_id uuid default null,
  p_location_id uuid default null,
  p_expected_on date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('approve');
  v_req public.company_purchase_request;
  v_po public.company_purchase_order;
  v_vendor uuid;
  v_location uuid;
begin
  select * into v_req from public.company_purchase_request where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'That request no longer exists.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request becomes a purchase order.' using errcode = '23514';
  end if;

  v_vendor := coalesce(p_vendor_id, v_req.vendor_id);
  v_location := coalesce(p_location_id, v_req.location_id);
  if v_vendor is null or not exists (
    select 1 from public.company_vendor v where v.id = v_vendor and v.status = 'active') then
    raise exception 'Choose an active vendor to order from.' using errcode = '22023';
  end if;
  if v_location is null or not exists (
    select 1 from public.company_location l where l.id = v_location and l.active) then
    raise exception 'Choose an open location to deliver to.' using errcode = '22023';
  end if;

  insert into public.company_purchase_order (
    request_id, vendor_id, location_id, total_cents, expected_on, notes, issued_by)
  values (
    p_request_id, v_vendor, v_location, v_req.total_cents, p_expected_on,
    nullif(btrim(p_notes), ''), v_staff)
  returning * into v_po;

  update public.company_purchase_request
  set status = 'ordered', vendor_id = v_vendor, location_id = v_location, updated_at = now()
  where id = p_request_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.purchase_order_issued',
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_order', p_target_id => v_po.id,
    p_target_label => v_po.number || ' · ' || v_req.title,
    p_after => to_jsonb(v_po),
    p_related => jsonb_build_object('purchase_request_id', p_request_id));

  return v_po.id;
end;
$$;

/*
 * Receives goods on a purchase order. p_lines is a JSON array of
 * {line_id, quantity}. Lines tied to an inventory item put the stock into
 * the order's delivery location at the ordered price. When everything has
 * arrived the order and its request are received.
 */
create or replace function public.rpc_company_po_receive(
  p_po_id uuid,
  p_lines jsonb,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_po public.company_purchase_order;
  v_line public.company_purchase_line;
  v_entry jsonb;
  v_qty numeric;
  v_received jsonb := '[]'::jsonb;
  v_status text;
begin
  select * into v_po from public.company_purchase_order where id = p_po_id for update;
  if v_po.id is null then
    raise exception 'That purchase order no longer exists.' using errcode = 'P0002';
  end if;
  if v_po.status not in ('issued', 'partially_received') then
    raise exception 'This purchase order is closed.' using errcode = '23514';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Enter what arrived.' using errcode = '22023';
  end if;

  for v_entry in select value from jsonb_array_elements(p_lines) loop
    v_qty := nullif(v_entry ->> 'quantity', '')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then
      raise exception 'Quantities received cannot be negative.' using errcode = '22023';
    end if;

    select * into v_line from public.company_purchase_line l
    where l.id = (v_entry ->> 'line_id')::uuid and l.request_id = v_po.request_id
    for update;
    if v_line.id is null then
      raise exception 'That line is not on this purchase order.' using errcode = '22023';
    end if;
    if v_line.received_quantity + v_qty > v_line.quantity then
      raise exception 'More "%" than was ordered.', v_line.description using errcode = '23514';
    end if;

    update public.company_purchase_line
    set received_quantity = received_quantity + v_qty
    where id = v_line.id;

    if v_line.item_id is not null then
      perform public.fn_company_stock_add(v_line.item_id, v_po.location_id, v_qty, v_line.unit_cost_cents);
      insert into public.company_stock_movement (
        item_id, kind, quantity, to_location_id, unit_cost_cents, purchase_order_id, reason, note,
        created_by)
      values (
        v_line.item_id, 'in', v_qty, v_po.location_id, v_line.unit_cost_cents, v_po.id,
        'purchase', left(v_po.number || coalesce(' · ' || nullif(btrim(p_note), ''), ''), 500), v_staff);
    end if;

    v_received := v_received || jsonb_build_object(
      'line_id', v_line.id, 'description', v_line.description, 'quantity', v_qty);
  end loop;

  if jsonb_array_length(v_received) = 0 then
    raise exception 'Enter what arrived.' using errcode = '22023';
  end if;

  v_status := case
    when exists (select 1 from public.company_purchase_line l
                 where l.request_id = v_po.request_id and l.received_quantity < l.quantity)
    then 'partially_received' else 'received' end;

  update public.company_purchase_order
  set status = v_status,
      received_at = case when v_status = 'received' then now() end,
      updated_at = now()
  where id = p_po_id;

  if v_status = 'received' then
    update public.company_purchase_request set status = 'received', updated_at = now()
    where id = v_po.request_id;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.purchase_order_received',
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_order', p_target_id => p_po_id, p_target_label => v_po.number,
    p_before => jsonb_build_object('status', v_po.status),
    p_after => jsonb_build_object('status', v_status, 'received', v_received),
    p_reason => nullif(btrim(p_note), ''));

  return v_status;
end;
$$;

/* Cancels an order nothing has arrived on; its request goes back to
   approved, ready for another order. */
create or replace function public.rpc_company_po_cancel(p_po_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('approve');
  v_po public.company_purchase_order;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Say why the order is cancelled.' using errcode = '22023';
  end if;
  select * into v_po from public.company_purchase_order where id = p_po_id for update;
  if v_po.id is null then
    raise exception 'That purchase order no longer exists.' using errcode = 'P0002';
  end if;
  if v_po.status <> 'issued' then
    raise exception 'Goods have arrived on this order, so it cannot be cancelled.' using errcode = '23514';
  end if;

  update public.company_purchase_order
  set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason), updated_at = now()
  where id = p_po_id;
  update public.company_purchase_request set status = 'approved', updated_at = now()
  where id = v_po.request_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.purchase_order_cancelled',
    p_actor_id => v_staff,
    p_target_type => 'company_purchase_order', p_target_id => p_po_id, p_target_label => v_po.number,
    p_before => jsonb_build_object('status', v_po.status),
    p_after => jsonb_build_object('status', 'cancelled'),
    p_reason => btrim(p_reason));
end;
$$;

-- ═════════════════════════════════════════════════════ page summaries

/* The Company files KPI row. Counts are of files the caller can see;
   storage is the whole bucket's, trash included, because that is what
   takes the space. project_bytes is every bucket together, which is what
   the plan's storage limit counts. */
create or replace function public.rpc_company_files_summary(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('read');
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_from timestamptz := coalesce(p_from, date_trunc('month', v_today)::date)::timestamp
                        at time zone 'Africa/Nairobi';
  v_to timestamptz := (coalesce(p_to, v_today) + 1)::timestamp at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  with visible as (
    select f.id, f.deleted_at, f.created_at
    from public.company_file f
    where f.visibility = 'company'
       or f.owner_id = v_staff
       or exists (select 1 from public.company_file_share s
                  where s.file_id = f.id and s.staff_id = v_staff)
  )
  select jsonb_build_object(
    'files', count(*) filter (where v.deleted_at is null),
    'shared', count(*) filter (where v.deleted_at is null and exists (
      select 1 from public.company_file_share s where s.file_id = v.id)),
    'starred', count(*) filter (where v.deleted_at is null and exists (
      select 1 from public.company_file_star st where st.file_id = v.id and st.staff_id = v_staff)),
    'trash', count(*) filter (where v.deleted_at is not null),
    'added', count(*) filter (where v.deleted_at is null and v.created_at >= v_from and v.created_at < v_to),
    'folders', (select count(*) from public.company_folder),
    'bytes', (select coalesce(sum(f.size_bytes), 0) from public.company_file f),
    'project_bytes', (select coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0)
                      from storage.objects o))
  into v_result
  from visible v;

  return v_result;
end;
$$;

/* The Company inventory KPI row and stock status ring. A stock line is an
   item at a location; equipment counts while it is not retired or lost. */
create or replace function public.rpc_company_inventory_summary(p_from date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_from timestamptz := coalesce(p_from, date_trunc('month', v_today)::date)::timestamp
                        at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  perform authz.company_require('read');

  with lines as (
    select s.quantity, i.reorder_level, i.unit_cost_cents, i.category_id, s.created_at
    from public.company_stock s
    join public.company_item i on i.id = s.item_id
    where i.archived_at is null
  ), assets as (
    select a.status, a.category_id, a.created_at, a.purchase_cost_cents
    from public.company_asset a
    where a.status not in ('retired', 'lost')
  )
  select jsonb_build_object(
    'stock_lines', (select count(*) from lines),
    'in_stock', (select count(*) from lines where quantity > 0 and quantity > reorder_level),
    'low_stock', (select count(*) from lines where quantity > 0 and quantity <= reorder_level),
    'out_of_stock', (select count(*) from lines where quantity <= 0),
    'stock_value_cents', (select coalesce(round(sum(quantity * unit_cost_cents)), 0)::bigint from lines),
    'assets', (select count(*) from assets),
    'maintenance', (select count(*) from assets where status = 'maintenance'),
    'active_assets', (select count(*) from assets where status in ('available', 'in_use')),
    'asset_value_cents', (select coalesce(sum(purchase_cost_cents), 0)::bigint from assets),
    'locations', (select count(*) from public.company_location where active),
    'categories', (select count(distinct x.category_id) from (
      select category_id from lines union select category_id from assets) x),
    'total_before', (select count(*) from lines where created_at < v_from)
                    + (select count(*) from assets where created_at < v_from),
    'movements', (select count(*) from public.company_stock_movement m where m.created_at >= v_from))
  into v_result;

  return v_result;
end;
$$;

/* Active colleagues, with how far each reaches Company (null: not at all).
   For handing out equipment (anyone) and sharing files (Company users). */
create or replace function public.rpc_company_people()
returns table (id uuid, display_name text, email text, company_level text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform authz.company_require('read');
  return query
    select su.id, coalesce(su.display_name, su.email), su.email, authz.company_level_of(su.id)
    from public.staff_user su
    where su.status = 'active'
    order by lower(coalesce(su.display_name, su.email));
end;
$$;

-- ═════════════════════════════════════════════════════════════ grants

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'rpc\_company\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
