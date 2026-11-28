-- A host who is sent back and submits again goes back to Pending.
--
-- "Send back to fix" (rpc_console_host_reject, 20270329000100) sets the host
-- to applied, clears submitted_at and stamps rejected_at. The console's host
-- queue (20270332000300) files a host as sent_back while rejected_at is set
-- and submitted_at is null. The host's way back is Documents › Submit for
-- review, rpc_host_documents_submit, which set status and
-- verification_submitted_at but never submitted_at again. So a host who did
-- everything asked of them stayed under Sent Back for good, staff never saw
-- them under Pending, and their setup step "Submitted for checks" stayed
-- unticked.
--
-- Body is 20261114000100's, with submitted_at set again when it was cleared.

create or replace function public.rpc_host_documents_submit(p_host_id uuid)
returns public.host_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host;
  v_missing text[];
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_uid and member.units is null
  ) then
    raise exception 'Only the account owner or a full-access manager can submit documents.'
      using errcode = '42501';
  end if;
  select * into v_host from public.host where id = p_host_id for update;
  if v_host.status = 'verifying' then
    return v_host.status;
  end if;
  if v_host.status <> 'applied' then
    raise exception 'This account is not waiting for documents.' using errcode = '22023';
  end if;
  v_missing := public.fn_host_documents_missing(p_host_id);
  if cardinality(v_missing) > 0 then
    raise exception 'Upload your ID or passport and proof of authority to let the property first.'
      using errcode = '22023';
  end if;

  update public.host
  set status = 'verifying', status_reason = null, verification_submitted_at = now(),
      submitted_at = coalesce(submitted_at, now()), updated_at = now()
  where id = p_host_id
  returning * into v_host;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.documents_submitted',
    p_actor_id => v_uid, p_target_type => 'host', p_target_id => p_host_id,
    p_city_id => v_host.city_id);
  return v_host.status;
end;
$$;
