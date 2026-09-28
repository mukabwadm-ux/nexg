-- Who agreed to which version of what, and when.
--
-- The `Terms of Service` artboard carries a version and a last-updated date,
-- and the `Merchants` console shows "Merchant terms v[—] · signed [—] · VALID"
-- as a compliance row. Neither is answerable without a record of acceptance.
--
-- The documents themselves are not stored here. They live in the repository,
-- versioned by git and reviewable in a pull request — legal text that anyone
-- with console access can edit in a table, with the previous wording gone, is
-- exactly what you do not want when someone disputes what they agreed to.
-- This table records the agreement; the repository records the words.

create type public.legal_document_key as enum (
  'terms',
  'privacy',
  'cookies',
  'refunds',
  'merchant_terms',
  'rider_agreement'
);

create table public.legal_acceptance (
  id uuid primary key default gen_random_uuid(),
  document public.legal_document_key not null,
  /*
   * The version string as published, e.g. "2026-03-01" or "1.2". Free text
   * rather than a foreign key because the authority is the repository, and a
   * row must stay meaningful after that version stops being current.
   */
  version text not null,
  /* Exactly one of these. A rider, a merchant, or a signed-in person. */
  rider_id uuid references public.rider (id) on delete cascade,
  merchant_id uuid references public.merchant (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  /*
   * Who physically clicked, when the subject is a business. A merchant does
   * not accept anything; a person at that merchant does, and a dispute asks
   * which person.
   */
  accepted_by_name text,
  accepted_at timestamptz not null default now(),
  /*
   * Kept because an acceptance that cannot be placed is weak evidence. Not
   * used for anything else, and never shown to another partner.
   */
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint legal_acceptance_version_not_blank check (length(trim(version)) > 0),
  constraint legal_acceptance_has_one_subject check (
    (rider_id is not null)::integer
    + (merchant_id is not null)::integer
    + (rider_id is null and merchant_id is null and user_id is not null)::integer = 1
  )
);

-- Re-accepting the same version is not a new fact.
create unique index legal_acceptance_rider_once
  on public.legal_acceptance (rider_id, document, version)
  where rider_id is not null;

create unique index legal_acceptance_merchant_once
  on public.legal_acceptance (merchant_id, document, version)
  where merchant_id is not null;

create index legal_acceptance_merchant_idx
  on public.legal_acceptance (merchant_id, document, accepted_at desc);

comment on table public.legal_acceptance is
  'A record that a partner agreed to a named version of a document. The wording lives in the repository; this says who agreed to it and when.';

alter table public.legal_acceptance enable row level security;

create policy legal_acceptance_read_own on public.legal_acceptance
  for select to authenticated
  using (
    (rider_id is not null and exists (
      select 1 from public.rider r where r.id = legal_acceptance.rider_id
        and r.user_id = (select auth.uid())
    ))
    or (merchant_id is not null and authz.is_merchant_member(merchant_id))
    or (user_id is not null and user_id = (select auth.uid()))
  );

create policy legal_acceptance_read_staff on public.legal_acceptance
  for select to authenticated
  using (
    authz.is_super_admin()
    or (merchant_id is not null and exists (
      select 1 from public.merchant m
      where m.id = legal_acceptance.merchant_id and authz.can_manage_merchants(m.city_id)
    ))
    or (rider_id is not null and exists (
      select 1 from public.rider r
      where r.id = legal_acceptance.rider_id and authz.can_manage_riders(r.city_id)
    ))
  );

/*
 * No update or delete policy, for anyone. An acceptance is a historical fact;
 * correcting one means recording the later acceptance that supersedes it.
 */

create or replace function public.rpc_legal_accept(
  p_document public.legal_document_key,
  p_version text,
  p_merchant_id uuid default null,
  p_rider_id uuid default null,
  p_accepted_by_name text default null
)
returns public.legal_acceptance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_row public.legal_acceptance;
begin
  if v_caller is null then
    raise exception 'Sign in before accepting a document.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_merchant_id is not null and p_rider_id is not null then
    raise exception 'An acceptance belongs to one party.' using errcode = 'check_violation';
  end if;

  if p_merchant_id is not null and not authz.is_merchant_member(p_merchant_id) then
    raise exception 'That business is not yours to accept for.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_rider_id is not null and not exists (
    select 1 from public.rider r where r.id = p_rider_id and r.user_id = v_caller
  ) then
    raise exception 'That application is not yours to accept for.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.legal_acceptance (
    document, version, rider_id, merchant_id, user_id, accepted_by_name
  )
  values (
    p_document, trim(p_version), p_rider_id, p_merchant_id,
    case when p_merchant_id is null and p_rider_id is null then v_caller else null end,
    nullif(trim(coalesce(p_accepted_by_name, '')), '')
  )
  on conflict do nothing
  returning * into v_row;

  -- Already on file for this version: return it rather than failing, because
  -- a second click is not an error.
  if v_row.id is null then
    select * into v_row
    from public.legal_acceptance
    where document = p_document
      and version = trim(p_version)
      and rider_id is not distinct from p_rider_id
      and merchant_id is not distinct from p_merchant_id
    limit 1;

    return v_row;
  end if;

  perform audit.log(
    p_actor_type => case
      when p_rider_id is not null then 'rider'::public.actor_type
      when p_merchant_id is not null then 'merchant_user'::public.actor_type
      else 'guest'::public.actor_type
    end,
    p_module => 'legal',
    p_action => 'legal.accepted',
    p_target_type => 'legal_acceptance',
    p_target_id => v_row.id,
    p_after => jsonb_build_object('document', p_document, 'version', trim(p_version))
  );

  return v_row;
end;
$$;

comment on function public.rpc_legal_accept is
  'Records that the caller accepted a version of a document. Accepting twice returns the existing record rather than failing: a second click is not an error.';

grant execute on function public.rpc_legal_accept(
  public.legal_document_key, text, uuid, uuid, text
) to authenticated, service_role;
