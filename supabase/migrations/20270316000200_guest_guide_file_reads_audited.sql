-- A guest opening a guide file is in the audit log (25 Nov 2026).
--
-- 20270316000100 let a guest read a unit guide's floor plan or 3D model through its QR code:
-- rpc_host_workspace_guide_asset_sign runs the code check and grants that one Storage path for 60 seconds. It wrote
-- nothing to the audit log, and was listed in wiring_audit_exempt for that. The owner decided a guest opening a guide
-- file must be recorded, so:
--
--   * rpc_host_workspace_guide_asset_sign keeps its body and signature, and calls audit.log once for each read that
--     creates a grant: when the path had no grant, or its grant had expired. A guest's reloads within the minute only
--     refresh the grant and are not logged again, so they cannot flood the log. The event is
--     host.guide_file_opened_by_guest, by a guest (no session, so no actor id), on the unit, with {asset_id, kind}.
--     The QR code is never written to the log.
--   * The action is registered in audit.action_registry.
--   * The function leaves wiring_audit_exempt. It stays in wiring_anon_allow: guests still have no session.
--
-- Same signature, so the generated types do not change.
-- Rollback: re-run the function and the wiring_audit_exempt insert from 20270316000100, and delete the registry row.

-- ═══════════════════════════════════════════════ the guest's read, now audited

/*
 * The guest guide’s read of one file by its QR code: the same answer as
 * rpc_host_workspace_guide_asset(p_id, p_code), and, for a file in Storage,
 * a 60-second grant so the API can sign a download link for that path only.
 * A grant that is new (none, or the last one had expired) is logged once.
 */
create or replace function public.rpc_host_workspace_guide_asset_sign(p_id uuid, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_asset jsonb;
  v_new_grant boolean;
  v_unit uuid;
  v_kind text;
begin
  if p_id is null or p_code is null then
    return null;
  end if;
  v_asset := public.rpc_host_workspace_guide_asset(p_id, p_code);
  if v_asset ? 'path' then
    delete from public.host_guide_asset_grant where expires_at <= now();
    -- An expired grant was just deleted, so the upsert inserts (xmax = 0) exactly when the grant is new, and only
    -- updates when an unexpired grant is refreshed.
    insert into public.host_guide_asset_grant (path, expires_at)
      values (v_asset ->> 'path', now() + interval '60 seconds')
      on conflict (path) do update set expires_at = excluded.expires_at
      returning (xmax = 0) into v_new_grant;
    if v_new_grant then
      select a.unit_id, a.kind into v_unit, v_kind from public.host_unit_guide_asset a where a.id = p_id;
      perform audit.log('guest'::public.actor_type, 'hotels', 'host.guide_file_opened_by_guest',
        p_target_type => 'unit', p_target_id => v_unit,
        p_after => jsonb_build_object('asset_id', p_id, 'kind', v_kind));
    end if;
  end if;
  return v_asset;
end;
$$;
revoke execute on function public.rpc_host_workspace_guide_asset_sign(uuid,text) from public;
grant execute on function public.rpc_host_workspace_guide_asset_sign(uuid,text) to anon, authenticated;

-- ═══════════════════════════════════════════════ audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('host.guide_file_opened_by_guest', 'hotels', 'info', false,
   'A guest opened a unit guide''s floor plan or 3D model through its QR code')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ the wiring gate (test 26)

/* It calls audit.log now, so it is no longer exempt. Its wiring_anon_allow row stays: guests have no session. */
delete from public.wiring_audit_exempt where function_name = 'rpc_host_workspace_guide_asset_sign';

update public.wiring_anon_allow
   set guarded_by = 'Returns null and writes nothing unless rpc_host_workspace_guide_asset(p_id, p_code) answers: the code must open a live, published guide and the asset must be that guide''s planId or modelId. It only grants that one Storage path for 60 seconds (one row per path, upserted), deletes expired grants on every write, and logs host.guide_file_opened_by_guest once per new grant, without the code.'
 where function_name = 'rpc_host_workspace_guide_asset_sign';
