-- Settings owns the console's integrations and API credentials sections.
-- Reconcile the registry so their events use that module's visibility rules.
-- The original module labels in the audit history are part of the event chain.
update audit.action_registry
   set module = 'settings'
 where (module, action) in (
   ('api', 'api.key_issued'),
   ('api', 'api.key_revoked'),
   ('api', 'api.oauth_client_created'),
   ('connectors', 'connector.connection_created'),
   ('connectors', 'connector.connection_consented'),
   ('connectors', 'connector.connection_state_changed'),
   ('connectors', 'connector.secret_stored'),
   ('connectors', 'connector.outbox_enqueued'),
   ('connectors', 'connector.outbox_completed'),
   ('connectors', 'connector.kill_switch_changed')
 );
