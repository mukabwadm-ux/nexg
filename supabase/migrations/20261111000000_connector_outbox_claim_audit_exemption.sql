insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values (
  'rpc_connector_outbox_claim',
  'Worker lease claims are high-volume queue bookkeeping; attempts are recorded on the outbox and completed outcomes are audited.',
  'connector_outbox lease and attempt fields; connector_run and connector.outbox_completed audit event'
)
on conflict (function_name) do nothing;
