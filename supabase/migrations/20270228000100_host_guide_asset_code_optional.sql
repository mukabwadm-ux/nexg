-- A guide's plan or model can be opened without a share code, as main has always defined it.
--
-- Why this exists: the live database ran the hosts workspace guides as
-- 20261111001100 (a local number, before the file became
-- 20261113001000_host_workspace_guides.sql). That early copy declared
-- `p_code text` with no default; main's file says `p_code text default null`.
-- The rollout of 23 Nov 2026 marks 20261113001000 as applied, because live
-- already ran every other statement of it (docs/database/live-rollout-2026-11-23.md),
-- so the default has to arrive another way. A host opening their own guide calls
-- this with one argument, which fails on live without it.
--
-- Same body, same grants. On any database built from main this changes nothing.
-- The other function that differed, rpc_host_workspace_task_save, needs no fix:
-- 20261114000100_host_onboarding re-creates it with its defaults.

create or replace function public.rpc_host_workspace_guide_asset(p_id uuid, p_code text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('mime',asset.mime,'base64',encode(asset.body,'base64'))
  from public.host_unit_guide_asset asset
  join public.unit u on u.id = asset.unit_id and u.archived_at is null
  where asset.id = p_id and (
    p_code is null and authz.can_see_unit(asset.unit_id) or
    p_code is not null and p_id::text in (
      select unnest(array[doc ->> 'planId', doc ->> 'modelId'])
      from (select public.rpc_host_workspace_published_guide(p_code) -> 'document' as doc) guide
    )
  )
$$;
