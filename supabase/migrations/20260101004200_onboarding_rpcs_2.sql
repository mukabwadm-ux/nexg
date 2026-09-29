-- Two more things the onboarding flow does that a merchant may not do
-- directly: ask us to chase a document, and have a payout number checked.

/*
 * "Send later on WhatsApp".
 *
 * The merchant can insert a document_request themselves — the policy allows
 * it — but the notification log is not theirs to write, and a chase with no
 * record of having been sent is the thing that makes a merchant say "nobody
 * ever asked me". Both rows are written here, together.
 */
create or replace function public.rpc_document_request_via_whatsapp(
  p_merchant_id uuid,
  p_requirement_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_req public.document_requirement;
  v_sender text;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  select * into v_req
  from public.document_requirement
  where owner_type = 'merchant' and kind = p_requirement_kind;

  if v_req.id is null then
    raise exception 'We do not ask for that document.' using errcode = 'no_data_found';
  end if;

  /* One open chase per document. Asking twice should not mean two reminders
     and two inbound photos to reconcile. */
  if exists (
    select 1 from public.document_request
    where owner_type = 'merchant' and owner_id = m.id
      and requirement_id = v_req.id and fulfilled_document_id is null
  ) then
    return jsonb_build_object('already_requested', true);
  end if;

  insert into public.document_request (owner_type, owner_id, requirement_id, channel)
  values ('merchant', m.id, v_req.id, 'whatsapp');

  select value #>> '{}' into v_sender
  from public.setting where key = 'whatsapp_provider' and scope = 'global';

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (
    'whatsapp', m.contact_phone, 'merchant_doc_request',
    jsonb_build_object('merchant_id', m.id, 'document', v_req.label),
    case when v_sender is null then 'skipped' else 'queued' end
  );

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'document.requested_via_whatsapp',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('document', v_req.kind)
  );

  return jsonb_build_object('requested', true, 'delivered', v_sender is not null);
end;
$$;

/*
 * Checking a till or paybill number against the name on the permit.
 *
 * There is no provider wired up, and there is no honest way to fake this: a
 * green "matches your permit" that nothing checked is worse than no check at
 * all, because it tells a reviewer the number has been verified. So with no
 * provider the answer is "not checked", the flow says a person will look, and
 * nothing is blocked either way.
 *
 * The column is written here rather than by the merchant because it is an
 * assertion about them, not by them.
 */
create or replace function public.rpc_merchant_payout_name_check(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_provider text;
  v_result jsonb;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  select value #>> '{}' into v_provider
  from public.setting where key = 'payout_name_provider' and scope = 'global';

  v_result := jsonb_build_object(
    'checked_at', now(),
    'matched', null,
    'name', null,
    'reason', case when v_provider is null
                   then 'No name-lookup provider is configured; the merchant team checks this by hand.'
                   else 'Lookup not yet implemented for this provider.' end
  );

  update public.merchant set payout_name_lookup = v_result where id = m.id;
  return v_result;
end;
$$;

grant execute on function public.rpc_document_request_via_whatsapp(uuid, text) to authenticated;
grant execute on function public.rpc_merchant_payout_name_check(uuid) to authenticated;
