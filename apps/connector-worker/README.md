# Connector worker

The standalone Node worker drains the connector outbox through service-role RPCs.
The initial registry contains only `mock-supplier`, which returns simulated results
and cannot call a merchant, bank, or payment provider.

## Configuration

Set all values explicitly before starting the worker:

| Variable | Purpose | Bounds |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (`http` or `https`) | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used for connector RPCs | Required |
| `CONNECTOR_WORKER_BATCH_SIZE` | Maximum jobs claimed per poll | 1–100 |
| `CONNECTOR_WORKER_LEASE_SECONDS` | Claim lease duration | 1–3600 |
| `CONNECTOR_WORKER_MAX_ATTEMPTS` | Maximum attempts before dead-lettering | 1–20 |
| `CONNECTOR_WORKER_BASE_DELAY_SECONDS` | Retry backoff base | 1–86400 |
| `CONNECTOR_WORKER_POLL_INTERVAL_MS` | Idle polling interval | 1–86400000 |

Run from the repository root with `pnpm --filter @nexg/connector-worker dev`.
Do not expose the service-role key to browser code, commit it, or use this worker
as evidence of a live provider integration. The database migration must be
reviewed and applied separately before the worker can claim connector jobs.

Claiming a job updates its lease and attempt count on `connector_outbox`; it is
queue bookkeeping, not a separate operator decision. The completed attempt is
recorded in `connector_run` and audited by the completion RPC.
