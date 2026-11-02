# Phase 4 connector foundation

Date: 2 November 2026. Local foundation implemented; provider acceptance remains open.

The integration boundary can describe Odoo, QuickBooks and other providers without choosing one vendor's domain model. It does not connect an account. No provider adapter is registered, and no connection activation, import, webhook receiver, provider credential acquisition or provider command route is exposed by this increment.

## Implemented boundary

`packages/contracts/src/integration-connection.ts` provides strict versioned declarations for a connector manifest, per-tenant/per-location connection, data-class authority and direction, credential references, declarative field mappings, external identity links, checkpoints and normalized delivery envelopes. Separate collection, refund, settlement and payout data classes preserve their independent owners. Declaring a class creates neither a persistence owner nor a permission.

Bindings apply explicitly to every listed location. Different authority or direction at another location requires a separate scoped connection; there is no implicit tenant-wide default.

Credential fields contain a secret-reference UUID and an existing machine-credential UUID with a version. Tokens, passwords and API keys have no configuration field. These are internal contracts; secret references, provider payloads and opaque cursors are not merchant display or audit fields. Provider account identity is not a provider URL or a credential. A future adapter must validate it against the authenticated provider account.

`apps/api/lib/integration/policy.ts` supplies deterministic decisions for the requested → test → map → preview → activate journey and pause, reconnect, rotate and disconnect. It checks current membership/session for administration, tenant/location scope, optimistic version, actual registered operation implementation, platform permission, actor permission, current machine credential and provider scopes. Activation also requires current workspace approval and current connection-bound test/mapping/preview evidence. Rotation invalidates setup; reconnect withdraws authorization; pause stops delivery; disconnect requires a recorded disposition for pending commands. Activation reports synchronization as `NOT_STARTED`, never `CURRENT`.

The production registry is immutable and empty. Registration is trusted platform code containing actual handler functions, not a manifest uploaded by a merchant. A missing implementation or a shared rule without an implemented resolver is rejected. A request body cannot register an adapter. The non-production `fixture_erp` registry in unit tests exercises policy behavior only.

The delivery guard verifies current machine identity/grants, approval and credential state independently of a browser login. It requires an authenticated normalized delivery, matching tenant/location/entity, operation, adapter/mapping/checkpoint versions and snapshot boundary. Duplicate IDs and origin/causation echoes produce no owner proposal. Monotonic source sequences fence stale or reordered events; a provider without a proven comparable sequence produces `RECONCILE`. A newer timestamp cannot override that decision. Explicit deletion produces a tombstone proposal; absence from a snapshot never deletes a record, and a tombstone blocks automatic resurrection.

`APPLY_PROPOSAL` is permission to ask an existing domain owner to validate a proposal. It is not a booking confirmation, stock reservation, invoice acceptance or settlement. The owner still applies its declared authority, command rules and expected entity version.

## Support matrix

| Surface | Readiness in this increment | Implemented provider operations |
| --- | --- | --- |
| Provider-neutral declaration and policy | Versioned strict contracts; executable lifecycle and delivery guards | None; production registry empty |
| Odoo | Can be represented by the same manifest, authority and credential-reference contracts | None: no authorization, test, import, write, webhook, reconciliation or active connection |
| QuickBooks | Can be represented by the same manifest, authority and credential-reference contracts | None: no authorization, test, import, write, webhook, reconciliation or active connection |
| Other ERP/accounting providers | Same extension boundary; each adapter needs its own acceptance | None; no universal compatibility claim |
| Field/unit/currency/time/identity mapping | Declarative schema, version/digest fence, total enum helper with `UNMAPPED` | No provider transformation runner; no currency-rate or timezone assumption |
| Existing NEXG machine API | Existing scoped API-key owner and its currently supported catalog/order read routes | Separate API support; it does not imply an ERP connection |
| Connection/checkpoint/identity persistence and delivery | Future implementation must reuse merchant, booking engine, API credential and durable delivery owners | No new database migration, queue, service, catalog or booking table |

## Integration acceptance still required

Before any provider is registered, implement and verify the following against that provider's current official contracts and a permitted sandbox account:

1. Authentication/refresh/revocation/rotation with per-connection secure storage, actual account/company identity, scopes and tenant/location ownership. Reuse existing machine credentials and current approval helpers. Do not issue a second browser session or broaden existing machine API scopes.
2. Each declared handler calls the existing owning domain interface. Prove the actual supported operation using sanitized provider fixtures and sandbox evidence. Unsupported operations remain absent. A test result or queued command cannot stand in for authority-confirmed success.
3. Complete mappings for identifiers, locations, statuses, units, amount scale/currency, date/time and protected fields; named implemented shared rules where applicable. Quarantine `UNMAPPED` records. Validate owner-approved schemas, not arbitrary executable transforms.
4. Persist connection version/evidence, immutable adapter registration, idempotency receipts, identity uniqueness, deduplication, checkpoints and entity tombstones through an additive migration and guarded owner commands. Enforce scope/approval/credential/operation guards in the database as well as the server before introducing an activation RPC. Do not expose direct writable connection rows.
5. Atomically compare connection/checkpoint/entity versions, apply the owner's accepted change and advance the durable checkpoint/receipt. Evidence and tombstones are scoped to the same connection/entity and survive reconnect. Stable operation IDs must use a durable actor/command/payload receipt; this pure policy module does not supply persistence or retry replay.
6. Obtain a provider-backed snapshot boundary, paginate within that boundary, then reconcile subsequent changes. Preserve cursor confidentiality. A provider without comparable versions needs authoritative reconciliation; do not invent sequences from arrival time. Reconcile unknown timeout outcomes before retry and keep pending commands visible through existing delivery owners.
7. Verify webhook authenticity before interpreting payloads, origin/causation provenance, replay protection, webhook/poll convergence, bounded rate-limit/backoff behavior, exhausted delivery visibility and controlled replay. Use existing durable delivery boundaries; no new queue is part of this foundation.
8. Exercise duplicate delivery, stale mutation, snapshot cutover, unknown status, deleted records, cross-tenant/location denial, lost approval, revoked credentials and reconnect. Rehearse pause/disconnect with pending operations and audit safe references without tokens, payloads or private account data.

No schema is deployed and no live provider is certified by unit tests. The actual connector journey remains unavailable until these requirements are implemented and verified.

## Local verification

Passed locally: `pnpm --filter @nexg/api test tests/integration-connection.test.ts` (30 tests), `pnpm --filter @nexg/contracts typecheck` and `pnpm --filter @nexg/api typecheck`. The behavior suite exercises strict declarations, the full fixture lifecycle, absent production registrations, missing permissions/credentials/approval, stale versions, snapshot ordering, replay/echo suppression and tombstone fences. Provider I/O and database acceptance are not claimed because this increment adds neither a provider implementation nor SQL persistence.
