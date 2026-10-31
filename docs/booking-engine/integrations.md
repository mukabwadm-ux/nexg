# External systems and the future NEXG ERP

Status: proposed design, 29 October 2026. This document specifies contracts and merchant journeys. It does not claim that these adapters exist or that a form choice connects a system. Read the onboarding audit for the distinction between deployed behaviour and repository evidence.

## Boundary and configuration

Each portal component reads a NEXG business display contract. An adapter translates a supported external system into the owning domain's queries, commands and confirmed events. A provider SDK stays inside the integration layer. Future NEXG ERP modules implement those same domain interfaces. A merchant can replace one data source without replacing their portal or moving every business function at once.

The business configuration chooses relevant capabilities. A separate connection configuration supplies actual provider capabilities and authority. Runtime authorization decides whether a particular person can perform an action now. A published category manifest cannot create a permission or prove that a provider operation works.

Source modes are `NATIVE`, `EXTERNAL`, `HYBRID_BY_DATA_CLASS` and `MANUAL`. These describe a business's operating arrangement; authority remains explicit for each data class. Connection methods are separately `API`, `WEBHOOK`, `POLL`, `FILE` or `MANUAL`, with more than one possible for a connection. A manually entered balance is not a confirmed external balance. A file import has an import time and coverage period, not a live-sync claim.

## Authority and shared contracts

Every connected data class chooses exactly one authority classification. Missing authority blocks activating that data class, while unrelated established capabilities remain usable.

| Classification | Read and write rule |
| --- | --- |
| `NEXG_AUTHORITATIVE` | The owning NEXG domain decides the fact. External updates are proposals and may be rejected. |
| `EXTERNAL_AUTHORITATIVE` | NEXG mirrors the provider's confirmed fact. A supported write is a request to that authority and remains pending until confirmed. |
| `SHARED_WITH_RULES` | Registered field ownership, command ownership, reservation and conflict rules specify how both systems act. Timestamp alone never resolves a conflict. |
| `READ_ONLY_EXTERNAL` | NEXG mirrors permitted fields. It exposes no write operation for that class. |

Resolve authority per connection, tenant, location and data class; field exceptions require a named shared rule. Do not assign one authority flag to an entire ERP. The following are proposed contract families, not new approved persistence owners:

| Contract family | Required distinctions | Portal use |
| --- | --- | --- |
| Offering and price | Stable offering/variant IDs, units, price type, currency, tax treatment reference, publication | `SC_OFFERINGS`, `SC_WORK` |
| Stock and reservations | On-hand, reserved, available, measured unit, location, effective time, reservation owner | `SC_OFFERINGS`, `SC_WORK`, `SC_AVAILABILITY` |
| Schedule and capacity | Resource, zone, calendar, duration, holds, booking confirmation and conflicts | `SC_AVAILABILITY`, `SC_WORK` |
| Work and execution | Request versus accepted work, workflow version, actionable transition, assignee, deadlines and provenance | `SC_WORK` |
| Fulfilment | Responsibility, method, addresses subject to privacy, milestone, evidence and handoff | `SC_WORK`, `SC_BUSINESS` |
| Transactions and settlements | Collection versus payable versus paid out, fees, refund movement, references and authoritative reconciliation | `SC_MONEY`, `SC_INSIGHTS` |
| Business and contact | Legal identity versus display profile; location; verified contact; permitted purpose and visibility | `SC_BUSINESS`, `SC_SETTINGS` |
| Metrics and promotion evidence | Definition/version, included records, source completeness, attribution limits and eligibility | `SC_INSIGHTS`, `SC_PROMOTIONS` |

The approved domain registry must name one owner for each fact before implementation. The proposed definitions in `domain-registry.json` split payment, refund, settlement and payout authority; Finance is a grouping, not one universal writer. Adapters never write another domain's tables directly. An ERP invoice, payment notification and NEXG settlement are separate records linked through references, not three names for one generic status.

A shared display envelope contains the entity and version, tenant/location scope, authoritative source reference, external identifiers, observed and effective times, freshness/coverage, data quality, permitted actions and any unresolved mapping issue. Show a meaningful source label and last confirmation where they affect a decision. Avoid exposing credentials, payloads or implementation names to routine merchant users.

Money has an integer minor-unit amount and currency. Quantity has an explicit unit. Instants have an offset and scheduling uses the merchant/location time zone. Preserve original values and transformation versions in controlled audit records. Unknown enums map to `UNMAPPED`; missing stock is unknown rather than zero. A mapping can use approved conversions and lookups, never uploaded executable code.

## Connector declaration and action checks

A versioned connector manifest declares provider/instance identity, contract versions, supported operations, authentication method, required scopes, supported locations, rate limits, pagination, event ordering, webhook verification, mapping versions, read/write restrictions and reconciliation support. Credentials are connection-scoped secrets referenced securely, never questionnaire answers or visible configuration values.

The server checks connector operation support, platform permission, user role and scoped grant, tenant/location ownership, document/approval constraints, workflow state, version, command policy and current connection state. A hidden UI control is not an access-control mechanism. A category author cannot grant additional roles, send arbitrary commands or bypass these checks.

Every mutation has a stable operation reference, idempotency behaviour and an expected version where appropriate. The UI acknowledges receipt before displaying the authority-confirmed result. When the authority is external, a locally queued command cannot make a booking confirmed, stock reserved or payment settled.

## Connection journey and placement

Onboarding asks which existing systems handle each relevant business function, the desired data classes, locations, connection method and intended read/write direction. Business owns the business requirement. `SC_SETTINGS` owns connection administration; operational screens show contextual status and a permitted route to resolve it.

The proposed connection journey is:

1. Discover a supported provider or record an unsupported-system request. Retain entered business answers.
2. Inspect the proposed data access, locations, authority and consequences. Select existing account/instance details without saving credentials in ordinary fields.
3. Authorize securely using the connector's supported method. Denial returns without pretending the connection succeeded.
4. Validate identity, scopes and actual operation support. Test with a bounded preview and sanitized records.
5. Map identifiers, units, statuses and locations. Resolve missing mappings explicitly.
6. Preview initial import counts, conflicts and protected fields. Confirm permitted import scope.
7. Activate the validated capabilities, then show initial-sync progress and confirmed coverage.

Keep authorization and health separate. Authorization states are `NOT_CONNECTED`, `AUTHORIZATION_REQUIRED`, `AUTHORIZED`, `EXPIRED`, `REVOKED`; setup states are `UNMAPPED`, `VALIDATING`, `READY`, `BLOCKED`; synchronization states are `NOT_STARTED`, `SYNCING`, `CURRENT`, `PARTIAL`, `STALE`, `FAILED`, `UNKNOWN`. The interface uses plain labels appropriate to the current task. An authorized connection can still have stale stock.

No-ERP merchants use supported native/manual capabilities with guided setup for actual offerings, staff or resources. Missing future ERP functionality receives a stated dependency. No screen promises universal vendor compatibility.

## Failure, recovery and audit

| Condition | Merchant experience | Server recovery |
| --- | --- | --- |
| Expired authorization | Preserve permitted last-confirmed data with time; explain affected edits; offer reconnect to an authorized administrator | Refresh/re-authorize, validate scopes, reconcile pending operations |
| Partial import or unknown mapping | Show usable records and affected counts; link to the scoped issue list | Quarantine affected records; preserve original reference; replay after mapping correction |
| External update conflicts with a draft | Explain the changed field and current authoritative value; preserve the draft for comparison | Check version and declared authority; reject stale mutation; require an informed resubmission |
| Command timeout | Say the outcome is not yet confirmed; prevent a duplicate action | Look up the stable operation/external reference and reconcile before retry |
| Duplicate or reordered webhook | No duplicated work, charges or notifications | Verify origin, deduplicate, enforce version/order rules and confirm through the authority |
| Rate limit or outage | Show affected freshness and next permitted action; keep unrelated capabilities available | Bounded retry/backoff for retryable failures, respect retry-after, surface exhausted work in a scoped exception queue |
| Disconnect | Explain data retention, pending commands and operational consequences | Stop new external commands; reconcile or explicitly escalate pending ones; preserve history and references |

Reconciliation compares declared records and reports `MATCHED`, `RESOLVED_BY_AUTHORITY`, `NEEDS_MERCHANT_INPUT` or `NEEDS_OPERATIONS_REVIEW`. It never guesses from the newest timestamp. Failed records are inspectable by permitted operators; replay follows a corrected mapping and the same idempotency rules. Financial reconciliation and external inventory reconciliation require an online authority response.

## Acceptance evidence and adoption

Every connector gets contract tests with sanitized provider fixtures, complete mapping coverage, permission/scope tests, unit/time conversion, readonly write rejection, duplicate delivery, timeout followed by confirmed success, stale concurrent edits and reconnect. Every merchant profile gets at least one source-mode fixture for its applicable workflows. Risk-based pairwise coverage supplements those rows; it does not claim every provider supports every capability.

Adopting a native ERP module changes authority only through a versioned migration: snapshot and reconcile, establish a cutover boundary, drain pending work, validate identifiers and totals, switch the declared authority, then monitor. Started work retains its workflow/configuration version. A rollback is a reconciled cutover, not an unsupervised toggle between two writers.

These plans describe the boundaries to implement and test. They establish no live connector, payment movement or runtime certification.
