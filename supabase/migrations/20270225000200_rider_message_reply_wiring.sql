-- The wiring gate (fn_wiring_check, test 26) found one critical:
-- public.rpc_rider_message_reply changes state without calling audit.log.
--
-- It came with 20270224000100 (a rider writes to rider ops from the portal).
-- A rider's message is the same kind of write as a host's reply in a
-- conversation (rpc_host_message_reply, exempt since 20260101017700): the
-- message row itself records who wrote it and when. So it is exempted with
-- the same reason, rather than adding an audit row for every line.
--
-- Rollback: delete from public.wiring_audit_exempt
--           where function_name = 'rpc_rider_message_reply';

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_rider_message_reply',
   'Auditing every line of a conversation is volume without accountability',
   'rider_message, with its rider, direction and time')
on conflict do nothing;
