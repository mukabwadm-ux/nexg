# Merchant backend integration prompt

Copy the text between the separators into the implementation AI's chat. The context below comes from a targeted source inspection on 2 November 2026. Revalidate it against current files and the actual target environment.

---

You are responsible for implementing the NEXG merchant and onboarding backend integration, including the scoped foundation for two-way ERP connections, external APIs, and incoming/outgoing webhooks. Work as a senior backend engineer who must preserve existing production behavior and data. Deliver working, reviewable changes and verification evidence. A list of recommendations alone is insufficient.

## Scope and source selection

The active implementation workspace is `C:\Users\limta\Desktop\MERCHANT WORKSPACE`.

The existing backend reference is `C:\Users\limta\Desktop\Derrick NexG`. Treat that checkout as reference material unless I explicitly designate it as an implementation target. The Documents checkout is historical.

Read only what affects merchant onboarding, merchant setup, the selected ERP/API/webhook integration paths, and their direct dependencies. Start with applicable repository instructions, targeted filename searches, and the entry points below. Follow actual imports, RPC calls, policies, and event consumers when needed. Do not scan the entire repository, unrelated business domains, dependency directories, generated builds, or all design JSON files. Do not open or print secret files. Explain a new dependency briefly before expanding scope.

Start with:

- `docs/merchant-portal-plan/onboarding-integration/README.md` and its Phase 0, Phase 2, Phase 3, and Phase 4 documents. Read relevant sections rather than every linked artifact.
- `docs/handoff/sessions/2026-11-02-onboarding-shared-home.md` for the latest implemented boundary.
- `merchant-onboarding/src/`, the actual merchant Home adapters, and `packages/booking-config/src/onboarding.ts` and `onboarding-home.ts`, restricted to the flows being integrated.
- Relevant `packages/contracts` definitions, Supabase client/auth helpers, and merchant routes/server actions.
- `docs/merchant-portal-plan/integrations.md` for proposed source-authority, connector, and connection-lifecycle contracts. It is design input, not evidence that any connector exists. Follow only the integration/domain definitions needed for the selected data classes.
- In the backend reference, `docs/merchant-onboarding.md`, then only the merchant SQL/RPC/RLS/storage definitions and affected admin/public consumers needed to verify its claims.

The two checkouts have diverged. Their files and migration names do not establish what is deployed. Identify the implementation branch, deployment target, installed versions, and available migration history before proposing rollout. Clearly distinguish source inspection, local execution, staging verification, and production verification.

## Product behavior to preserve

Registration stays short. It captures business/applicant names, canonical category/subcategories, declared branch count, business email/Kenyan phone, a different business contact when needed, registration declaration, required policy acknowledgement, and separate optional marketing consent. Operating details, offerings, addresses, hours, documents, payouts, and integration questions belong in Home tasks. Do not restore the old six-step registration requirement through backend validation.

The current form shares the actual Home presentation and workspace frame, but its captured data and files are still in memory. This does not establish persistence, authentication, admin review, or server authorization.

Preserve these independent facts: application review, permitted workspace scope, setup readiness, publication, accepting work, and document/payout/connection verification. Admin approval unlocks only its authorized scope. It does not publish the merchant, verify evidence, connect a provider, or enable work. Activation is a separate authorized operation.

Pending merchants can use permitted Home setup tasks. Operational access must be denied on the server. Never fetch sensitive operational data underneath a CSS blur. Unknown authorization/review state stays restricted, with a recovery path.

Reuse merchant identity, ownership, canonical taxonomy, the shared requirement resolver, the existing booking engine, and domain-owned records. Preserve false, zero, unknown, and not applicable as distinct values. Do not invent default categories, fake completion counts, universal five-item requirements, or mandatory test orders for enquiry-only businesses.

Canonical IDs in the active workspace and the reference backend's `category_key`/database configuration need an explicit compatibility map and version policy. Do not derive IDs from display labels or create another category registry. Pin relevant configuration/question versions and preserve old drafts and inactive answers.

Keep the separate M-Pesa Till, PayBill with account reference, and bank declaration contracts. Store identifiers as strings. Applicant declarations and finance-verified settlement destinations remain separate. Preserve unresolved legacy phone-based payout data without reinterpreting it as a Till or PayBill. Provider declarations never prove a connection or successful payment.

Complete email OTP integration in the final planned phase. This sequencing never permits authentication bypass in a connected environment. Keep unverified preview flows isolated until real authentication works. Do not expose development verification codes in production or claim delivery from a placeholder provider.

## First establish the integration contract

Produce a concise field-and-operation matrix before editing. For each affected flow identify the current UI input/output, owning service/table, existing route/RPC, authentication, tenant authorization, validation, lifecycle transition, and compatibility gap. Cover draft start/save/resume, submission, Home reads/edits, uploads, review/changes requested, approval, activation, and applicable booking/source adapters. Keep integration with existing owners explicit.

The existing backend includes `rpc_merchant_start`, step/category/branch save RPCs, `fn_merchant_readiness`, `rpc_merchant_submit`, and staff-controlled `rpc_merchant_go_live`. Audit and adapt their actual implementations, including later redefinitions. Their names do not prove they satisfy the new journey. Create missing capabilities where necessary and preserve compatible callers through deliberate adapters or additive contracts.

Merchant creation and its ownership record must be atomic. A phone number or email alone cannot expose, claim, or resume another merchant's draft. Audit resume credentials for expiry, single use, hashed storage, scoped ownership, and safe conflict handling.

Check deactivated/deleted merchant restrictions, retained financial/audit history, and restore behavior before changing lifecycle code. Preserve protected-column guards. In particular, the reference `tg_merchant_protected_columns` relies on `current_user`; changing it to `SECURITY DEFINER` would invalidate that guard. Audit privileged functions, grants, safe `search_path`, and caller validation deliberately.

After this focused assessment, implement the scoped work in small coherent increments. Ask only about genuinely missing business authority or a conflicting requirement. Resolve routine implementation choices yourself and record assumptions.

## Authentication, sessions, and authorization

1. Reuse the existing Supabase authentication flow and installed SDK's supported server/browser integration. Supabase already supplies a unique `session_id`; do not build a parallel login/session system. Session IDs, request IDs, trace IDs, application IDs, and idempotency keys have different purposes and must remain separate.
2. Validate identity on the server using the supported verification method. Do not trust a browser flag, decoded unsigned token, client-provided role, editable user metadata, or an unverified session object. Derive merchant access from authenticated identity and current membership/permissions.
3. Define configurable access-token, absolute-session, and inactivity policies. Distinguish token expiry from session expiry. Supabase session limits depend on configuration/plan and are checked during refresh, so enforcement can lag by the access-token lifetime. Session-refresh activity is also different from actual user activity. Document the chosen semantics and enforce stricter deadlines on the server where required; a UI timer or surviving session row is insufficient.
4. Coordinate supported token refresh across requests/tabs and allow at most the intended refresh/replay attempt. Do not log out users merely because an access token expired while a valid refresh remains. When the session actually expires or is revoked, reject its protected requests, stop that browser session's protected background requests/subscriptions, clear user/merchant caches and credentials through the supported flow, and route to sign-in with a clear message. Handle offline/resume and late responses without restoring private state after logout. Connection-scoped ERP jobs use separate machine authorization and lifecycle rules; ordinary user logout does not disconnect an authorized ERP connection.
5. Enforce object, field, role, merchant, branch/activity, and workflow authorization at every affected boundary, including RPCs, server actions, storage, exports, workers, and realtime subscriptions. Use RLS and unprivileged user contexts for normal operations. API-key credentials for external integrations are separate from merchant browser sessions.
6. Preserve supported SSR cookie behavior. Apply Secure, SameSite, and HttpOnly where compatible with the chosen architecture, plus CSRF/origin protection where cookie-authenticated writes require it. Do not break the browser SDK's refresh mechanism by blindly changing cookie accessibility. Propagate refreshed cookies into both the downstream request context and returned response through the installed framework's supported flow. Keep service/secret keys out of browser bundles and ordinary merchant request handlers. Restrict CORS and privileged administrative paths.

## Reads, writes, and concurrency

- Keep reads free of business mutations. Scope and validate filters, projections, sorts, identifiers, and search inputs. Return only needed fields. Preserve established response/error contracts; expose stable machine-readable codes and a correlation ID without internal stack traces.
- Validate writes server-side with shared typed schemas and explicit writable-field allowlists. Reject forged ownership, status, approval, verification, publication, and settlement fields. Treat supplied-but-invalid optional data differently from omitted data.
- Use transactions and database constraints for multi-record invariants. Use revision checks or another suitable concurrency mechanism for draft saves, admin decisions, and updates that could overwrite newer data. Return a clear conflict and recovery path. Serialize dependent draft saves and prevent late responses from replacing newer state.
- Bind review and evidence verification to a submitted revision. Preserve that snapshot while Home edits continue. Reject stale decisions; material changes trigger the applicable scoped re-review rather than silently inheriting verification.
- Do not hold database transactions open during external HTTP calls. Reuse existing atomic capacity/availability and booking operations instead of duplicating them in onboarding. Represent money in integer minor units with currency and units. Preserve the existing time-zone policy and explicit overnight/time-boundary semantics.

## Idempotency and retries

Implement durable idempotency for operations where retries can duplicate records, transitions, notifications, jobs, or provider effects, especially start/submit/approve/activate commands. Do not require an idempotency record for every harmless read.

Atomically scope each key to the authenticated tenant/actor and operation. Store a canonical validated-request fingerprint, execution state, and sufficient safe result data. Define concurrent-duplicate handling, replay behavior, retention, cleanup, and recovery after a crash. Reusing a key with a different payload must return a conflict. Retries preserve the original key. Recheck current authorization before replaying a result.

A timeout does not prove a write failed. Handle timeout-after-commit and unknown provider outcomes through status lookup/reconciliation. Retry only safe transient failures, with bounded attempts, exponential backoff, jitter, and applicable `Retry-After`. Do not automatically retry authentication, validation, or business conflicts. Avoid retry multiplication across client, API, queue, and provider layers. Do not promise exactly-once delivery.

## Caching and pagination

Audit existing HTTP/client/database caching before adding another layer. Cache public/reference taxonomy and expensive repeatable reads where freshness and access rules permit. Define ownership, tenant/user/scope and configuration-version keys, TTL, size limits, and post-commit invalidation. Prevent cross-merchant leakage, stale permission reuse, and late cache writes after sign-out. Invalidate on membership/review changes as well as ordinary edits.

Use explicit cache headers for authenticated/private responses, commonly `no-store` for sensitive data. Never publicly cache sessions, KYC documents, payout details, signed credentials, or private personalized responses. Login and token-refresh responses that set session cookies must never enter a shared/CDN cache. Do not assume cookie-bearing SSR responses are safe for CDN caching. Use conditional requests, request deduplication, and stampede protection where useful. State when a cache is unnecessary.

Paginate growing lists with bounded defaults and hard maximums. Prefer keyset/cursor pagination for changing or large datasets, using deterministic ordering and a unique tie-breaker. Validate cursors and bind their meaning to the authorized query/filter/sort. A cursor never grants access. Document consistency during concurrent updates and avoid expensive exact counts unless needed. Keep bounded offset pagination only where justified.

## Queries and database resources

Measure the affected paths before optimizing. Remove N+1 requests, unnecessary joins/columns, unbounded scans/results, repeated counts, and avoidable sequential calls. Parameterize SQL and allowlist dynamic identifiers/sorts. Add indexes that match real tenant filters, ordering, joins, and RLS predicates; review write/storage cost.

Use representative query plans and realistic staging data. Remember that `EXPLAIN ANALYZE` executes the query; do not run unsafe production writes or load tests for evidence. Check pool configuration, connection budgets, transaction duration, statement/lock timeouts, and compatibility with the deployed Supabase connection mode. Do not assume a migration file or regenerated type proves the remote schema exists.

## Timeouts, parallel requests, and async work

Give outbound HTTP calls, database work, uploads, and jobs finite configurable deadlines suited to the hosting platform. Define an end-to-end deadline, smaller dependency budgets, bounded retries, cancellation where supported, and useful timeout errors. Record numeric defaults and why they fit. Distinguish optional data failures from failure of required authorization or persistence.

Run independent authorized reads concurrently when it reduces latency. Bound concurrency and batch where possible. Do not use unbounded `Promise.all`, parallelize dependent writes, or return protected data before authorization completes. Cancel or discard obsolete browser requests and prevent stale results from winning.

Use async workers for slow or retryable work such as document scanning, imports, notifications, reconciliation, and provider synchronization. Keep ownership checks and durable command acceptance synchronous; authority-confirmed business completion can remain asynchronous. Never use fire-and-forget promises in a request handler as durable job delivery.

## Durable queue and provider integration

Reuse an existing suitable durable queue/outbox before adding infrastructure. Where a write must cause an event/job, commit the domain change and outbox record atomically, or use an equivalent proven mechanism. Return a job/reference and accurate pending state only after durable acceptance. A failed enqueue must not silently lose work.

Specify leases/visibility timeouts, acknowledgements, crash recovery, attempt limits, delayed retries, poison-message/dead-letter handling, retention, monitoring, and authorized replay. Consumers must tolerate duplicate delivery and out-of-order events; use versions, deduplication, or per-entity ordering where required. Bound worker concurrency and protect shared resources and tenants from overload. Keep job payloads minimal and reload current authorized state where appropriate.

Authenticate webhooks with the provider's supported signature and raw-body rules, timestamps/replay controls, and durable event deduplication. Acknowledge after durable receipt and process heavy work asynchronously. Distinguish requested, pending, succeeded, failed, and unknown outcomes. Use provider sandbox/contracts until real credentials and acceptance are available. Do not invent provider success or call real financial operations during tests.

Validate merchant-supplied connection/import URLs and redirects to prevent SSRF and unintended internal-network access. Store provider secrets in the existing secret-management mechanism with least-privilege access, rotation, and revocation support.

## ERP ownership, connectors, and two-way synchronization

Apply these requirements to the merchant integrations actually in scope. Inventory supported providers, data classes, and operations first. Do not promise universal ERP compatibility, build unrelated ERP modules, or enable unsupported operations. A connector interface or passing mock is not a working provider connection.

### Domain boundaries and source authority

Keep provider SDKs and provider-specific payloads inside adapters. Expose stable domain commands, queries, and events so external ERPs and future native NEXG modules can use the same owning-domain interfaces. Integrations must not write domain tables directly or bypass approval and business invariants.

Create an authority/direction matrix per tenant, connection, location, and data class, with field-level exceptions only where explicitly specified. Reconcile the existing planned classifications: `NEXG_AUTHORITATIVE`, `EXTERNAL_AUTHORITATIVE`, `SHARED_WITH_RULES`, and `READ_ONLY_EXTERNAL`. State who may propose a change, who confirms it, how conflicts are resolved, and what freshness is required for each action. Missing authority blocks activation of that data class while unrelated approved capabilities remain usable. Do not use universal last-write-wins or compare wall-clock timestamps as the conflict policy.

For example, ERP-owned stock and prices do not imply ERP ownership of bookings, payments, or merchant approval. A queued external write remains pending until the designated authority confirms it. Stock mirrors do not establish an atomic reservation. Reuse the actual reservation/capacity owner, and block or explicitly limit capabilities that cannot safely prevent overselling/double booking. External invoices, payment notifications, refunds, and NEXG settlements retain their separate owners and references.

Version the connector capability manifest, mappings, and canonical contracts. Declare supported reads/writes, authentication/scopes, API versions, limits, pagination, webhook/polling behavior, delete semantics, ordering guarantees, and reconciliation support. Connector capability, platform permission, operator role, and connection state must all permit a command.

### Machine credentials and connection lifecycle

Separate human portal sessions from service identities and connection-scoped provider grants. Give each installation a tenant-scoped identity, provider account/environment, permissions, secret references, and connection version. A browser session token must not become a stored ERP integration credential. An authorized background sync can continue after its initiating user logs out, subject to the connection's current tenant permissions, suspension policy, and revocation state.

Use the provider's supported OAuth/API-key mechanism. For delegated OAuth, follow the current OAuth security BCP, including authorization code with PKCE, exact registered redirects, one-time authorization binding/CSRF protection, least-privilege scopes/audiences, and secure callback/provider validation. Store tokens in the existing encrypted secret mechanism, coordinate refresh atomically per grant, handle rotation/expiry/revocation, and never put secrets in URLs or normal configuration JSON. Invalid or revoked grants require reconnect rather than endless refresh retries. For ERP access to NEXG, use revocable scoped machine credentials or supported machine OAuth grants, with merchant/location binding, expiry, and rotation. Preserve existing valid API-key consumers through compatible changes.

Provide authorized connect, test, map, preview, activate, pause, reconnect, rotate, and disconnect operations with an audit trail. Keep authorization state, setup/mapping readiness, sync health, and business approval distinct. A successful credential check does not mean that data is current or every operation is supported. Disconnect/revocation must stop new unauthorized calls and fence stale queued jobs; reconcile already-started commands and unknown external effects before claiming cancellation. Define retained history and removed credentials explicitly.

### Identifier mapping and synchronization correctness

Persist stable links between NEXG IDs and external IDs, scoped to provider instance, connection, tenant, entity type, and relevant location. Never match records by display name alone. Version mappings for statuses, variants, taxes, currencies, quantities/units, time zones, locations, and custom fields. Preserve provenance and original references with controlled access. Unknown values become an explicit unmapped/quarantined outcome. Do not silently invent units, currencies, defaults, or exchange rates.

Design initial snapshot/import and incremental synchronization together. Establish a documented snapshot/change-capture boundary so updates arriving during import are not lost. Use provider delta tokens, cursors, versions, or a documented overlap-and-deduplication strategy. Persist checkpoints, resume safely after crashes, and commit applied checkpoints with the corresponding durable state. Expired cursors, empty intermediate pages, partial pages, per-record failures, deletions/tombstones, and provider-side schema changes require explicit recovery. Preview import scope/conflicts and avoid triggering new-business side effects while replaying historical records.

Prevent two-way echo loops using origin, causation/operation references, external versions, and explicit field authority. Deduplicate webhook and polling updates through the same adapter/domain path. Enforce ordering/version rules per entity rather than assuming global arrival order. A replayed old event must not resurrect deleted records, roll back a current price, or re-enable revoked access.

Treat webhooks as potentially duplicated, delayed, reordered, or missing. Their authentication proves the sender; authority rules still determine which state they may change. Use the owning domain's required confirmation/reconciliation policy before showing consequential final state. Run bounded periodic or on-demand reconciliation against the authoritative system to detect drift, missed changes, and unknown command outcomes. Reconciliation can resolve by declared authority or escalate a conflict; it must not guess. Require an online authority response for confirmation of external inventory or financial state.

Expose safe last-confirmed data with source, coverage, last successful sync, and freshness where they affect decisions. Define which actions stop when stock, availability, or financial data is stale. Preserve unrelated usable capabilities and offer an actionable, permission-scoped exception/recovery view.

### Public integration API and outgoing webhooks

For NEXG APIs consumed by merchants' ERPs, provide a scoped, versioned contract with OpenAPI documentation, stable resource/error semantics, pagination, idempotent write behavior, concurrency rules, operation/status lookup, and a deprecation/migration policy. Offer supported change retrieval or reconciliation so consumers can recover from missed webhooks. Define bounded bulk/import jobs and per-record results where needed. Use the same domain commands and authorization rules as other clients; API access cannot grant capabilities the merchant does not have.

Build incoming receipt and outgoing delivery as distinct durable flows. Incoming receipt needs a connection/producer-scoped event-deduplication inbox before asynchronous application. Outgoing delivery needs an outbox, authorized tenant-scoped subscriptions, event filters, and minimal versioned payloads. Give a business event a stable event ID, distinguish subscription deliveries and attempts, and retain the event identity and payload version across retries and replays. Include event type/schema version, resource ID/version, occurrence time, and correlation/causation references as appropriate.

Verify incoming signatures over the exact bytes required by the provider. Sign outgoing events with the supported per-endpoint secret/key scheme, a fresh signed delivery timestamp per attempt, documented raw-body verification, and key rotation. Keep replay-window checks separate from durable business-event deduplication. A duplicate valid delivery should produce the appropriate acknowledgement without duplicate effects.

Endpoint registration, testing, and every subsequent dispatch must enforce SSRF-safe URL/network rules. Validate the actual connected IPv4/IPv6 destination to prevent DNS rebinding; block untrusted private, loopback, link-local, and metadata targets. Require HTTPS with correct hostname/TLS verification. Disable redirects or revalidate every target, and never forward a received secret to a redirected destination. If private-network ERP connectivity is needed, require an explicitly approved secure connector/network path rather than weakening public egress rules.

Document acknowledgement timeouts, retryable statuses, bounded jittered delivery attempts, retention, dead letters, authorized replay, and subscriber disablement/escalation. Do not promise exactly-once delivery or ordering that is not implemented. Expose safe delivery history and test events to authorized merchant administrators, without logging credentials or sensitive business payloads. Replays must not bypass current subscription permissions or revive stale commands.

### Provider protection and acceptance

Ingress token buckets do not enforce outbound provider quotas. Schedule calls using the provider's actual per-app, credential, account, tenant, endpoint, burst, concurrency, and daily/window quotas. Share budgets across workers, honor `Retry-After`, account for SDK retries, and inspect per-operation batch results even when the outer response succeeds. Use fair scheduling, backpressure, and suitable circuit breakers/per-connection concurrency bounds. Backfills must not starve live operations, and one broken ERP must not consume all workers or make the portal unavailable.

For each implemented connector, test the complete allowed direction(s) with sanitized provider fixtures and available sandbox contract checks. Include grant refresh/revocation, read-only write denial, mapping changes, concurrent snapshot/events, repeated/missing/out-of-order events, polling/webhook convergence, echo-loop prevention, deletes, expired cursors, partial imports, provider quotas/outages, disconnect during work, stale-data gates, outgoing signature verification, subscriber replay, SSRF controls, and drift reconciliation. State separately what local tests, provider sandbox, and production acceptance establish.

## Rate limits, payloads, and files

Use token bucket as the default API rate-limiting algorithm. Configure and document bucket capacity, refill rate, initial state, and request cost per operation class. Permit controlled bursts while bounding sustained traffic; expensive queries, uploads, and job creation can consume more tokens. Do not describe this as an exact maximum count in every rolling window.

Refill, check, and consume tokens atomically using an authoritative time source and state shared across replicas. An in-process bucket alone cannot enforce a fleet-wide quota. Reuse suitable existing gateway/datastore capabilities; add Redis or another dependency only when justified. Define safe idle-key expiration that cannot restore capacity early, protect against clock changes, bound key cardinality, and choose explicit failure behavior when the limiter is unavailable.

Apply appropriate per-tenant, user/API-key, and route-class buckets, with trusted IP-based abuse protection for anonymous/authentication traffic. Derive keys from verified identity and trusted proxy configuration. Session creation or API-key rotation must not bypass the applicable principal/tenant budget. Audit the existing API-key limiter and its anonymous bypass. Return `429` with `Retry-After` based on the applicable exhausted bucket policies, without leaking account existence or promising that a retry will succeed.

Layer strict OTP/resume/login controls on top where needed: resend cooldowns, per-challenge attempt ceilings, and longer-window abuse budgets. Token bucket does not replace one-time credential rules, exact rolling-window quotas, or limits on simultaneous in-flight work. Keep separate concurrency limits for expensive requests and workers.

Bound request size, batch size, field length, nested JSON depth, upload size/count, response size, and decompressed input size. Compress sufficiently large compressible responses at the supported proxy/server layer after content negotiation. Preserve correct `Vary` behavior; avoid double compression, already-compressed media, and unsafe compression of secret-bearing reflected responses. Keep small responses simple and measure CPU/latency tradeoffs.

Use private document storage and scoped, short-lived access URLs. Check upload ownership, server-side content/type, safe filenames, completion state, and scan/quarantine policy where required. Do not trust browser MIME metadata or count a selected file as a durable or verified document. Handle abandoned uploads, retries, retention/deletion, and read access after suspension. Keep sensitive data and credentials out of general configuration JSON, logs, queue payloads, and browser persistence.

## Observability and recovery

Use structured logs with a validated/generated request ID and trace propagation into jobs and provider calls. Keep session secrets, API keys, OTPs, resume links, signed URLs, tokens, raw documents, and payout/identity data redacted. Do not expose raw session IDs in routine logs. Record actor, tenant, action, affected record/revision, result, duration, and safe error category only where appropriate and access-controlled.

Maintain durable, access-controlled audit records for submission, review, permission, verification, activation, and payout changes. Monitor latency/error rates, database/pool saturation, auth failures, rate-limit events, duplicate/conflicting idempotency use, queue lag/retries/dead letters, and stuck or unreconciled operations. Set actionable alerts and document recovery ownership. Logs alone are not a recovery mechanism.

## Compatible migrations and rollout

Use additive, versioned changes that allow old and new applications/workers to coexist. Plan schema expansion, compatible adapters, bounded resumable backfills, validation, cutover, and later removal separately. Preserve merchant IDs, ownership, history, archived categories, incomplete drafts, and verified evidence. Do not rewrite applied migrations, blindly copy the reference tree, or reset production data.

Assess locks, table rewrites, constraint validation, existing duplicate data, index build load, and migration-runner transaction behavior. `CREATE INDEX CONCURRENTLY` has restrictions and failure states; use it only with a supported execution/recovery plan. Reconcile generated database types and grants after schema changes.

Provide server-enforced feature flags or a similarly controlled rollout, staging rehearsal, deployment order, smoke checks, monitoring criteria, and a rollback/forward-fix plan compatible with already written data. A code rollback must not assume that dropping new tables or undoing a backfill is safe. Keep background jobs and provider effects in the recovery plan.

Confirm the backup/restore process and recovery point before a risky production migration. Use synthetic or appropriately sanitized staging data, and preserve existing retention and deletion policies.

Implement and verify local reviewable changes within scope. Do not mutate or deploy to production without explicit authorization for that environment. If deployment access is absent, finish code, migrations, tests, and the exact deployment runbook; identify the remaining external step accurately.

## Credentials and execution boundaries

You do not need a Supabase database password to inspect code, edit application code, prepare SQL migrations, or run suitable isolated tests. Check for existing authorized tooling without printing credentials. Remote schema/configuration changes and real provider operations require the appropriate authorized access; direct database-password authentication is only one possible deployment method. Do not request pasted secrets or treat an anon key as administrative access.

Do not add Redis, Kafka, a new authentication service, or another microservice simply to satisfy this prompt. Reuse deployed capabilities and justify new dependencies through a concrete requirement. Do not silently upgrade unrelated dependencies or redesign the merchant UI.

## Verification and required handoff

Run focused tests against real affected boundaries, including database/RLS checks with unprivileged identities. Cover:

- Short registration persists and reloads into the existing Home; partial tasks remain recoverable and do not become false verification.
- Cross-merchant access, forged protected fields, direct RPC/storage access, pending access restrictions, and scoped approval versus activation.
- Duplicate/concurrent submissions with the same key; changed-payload key reuse; timeout-after-commit; stale draft/review revisions.
- Access-token refresh, actual session expiry/revocation, refresh races, logout across tabs, and rejection of protected requests after the enforced deadline.
- Tenant-safe caches, authorization invalidation, pagination boundaries, request limits, deadline failures, and bounded concurrency. Test token-bucket exhaustion/refill, weighted costs, concurrent spending across replicas, idle expiry, dependency failure, and attempts to evade principal limits through session/key rotation.
- Queue redelivery, crash after commit or external effect, retries/dead letters, webhook replay/signature failures, and unknown provider outcomes.
- Old/new contract coexistence, representative existing merchant categories and drafts, migration/backfill rehearsal, and rollback compatibility.

Reuse unchanged test evidence only when it still applies to the same covered code and environment. Run affected checks after changes. Do not claim security, delivery, performance improvement, or production readiness from mocks, compilation, historical reports, or source inspection alone. State unavailable checks and their impact.

At the end provide:

1. The contract/gap map and a concise summary of implemented behavior with exact changed file paths.
2. A configuration table containing chosen session policies, deadlines, retry limits, token-bucket capacities/refill rates/request costs and scopes, additional authentication limits, page/payload limits, cache TTLs, and queue settings, with reasons and configurable overrides.
3. Exact test commands/results, the environments exercised, relevant query/performance evidence, and remaining external acceptance checks.
4. The migration/deployment order, compatibility considerations, monitoring and recovery instructions, and any required access or unresolved business decision.
5. For ERP integrations, the supported provider/data-class matrix, source-authority/direction rules, machine-credential lifecycle, API/event contracts, mapping/checkpoint strategy, and operator instructions for reconnect, replay, and reconciliation. Identify capabilities still unsupported rather than presenting a generic connector framework as complete integration.

Keep factual findings separate from assumptions. Continue through implementation and verification; stop only at a real missing decision, inaccessible dependency, or explicit environment-authorization boundary. Never describe a partial or preview-only integration as complete production behavior.

---

## Primary references checked while preparing this prompt

- [Supabase session lifecycle and timeout limitations](https://supabase.com/docs/guides/auth/sessions)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase access tokens and permissions](https://supabase.com/docs/guides/platform/personal-access-tokens)
- [OWASP REST security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [HTTP semantics and retry safety, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- [PostgreSQL index creation and concurrent-build restrictions](https://www.postgresql.org/docs/current/sql-createindex.html)
- [Redis documentation on distributed token buckets and atomic enforcement](https://redis.io/docs/latest/develop/use-cases/rate-limiter/redis-py/)
- [OAuth 2.0 security best current practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OWASP incoming and outgoing webhook security](https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html)
- [Microsoft Graph change tracking, an example of provider-specific sync contracts](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- [Microsoft Graph throttling, including per-operation batch failures](https://learn.microsoft.com/en-us/graph/throttling)
