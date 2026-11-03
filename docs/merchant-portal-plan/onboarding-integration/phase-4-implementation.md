# Phase 4 implementation contract

Date: 2 November 2026. Status: VERIFYING. Local implementation and focused checks are complete; real connected staging acceptance remains open. [Final boundary and rollout](phase-4-rollout.md). Implementation target: Desktop MERCHANT WORKSPACE, branch `codex/booking-engine-calendar`, HEAD `c92c02d` plus preserved pre-existing work. Desktop Derrick NexG is reference only. No linked Supabase/Vercel deployment is available. Source migrations are not remote migration history. Production deployment is outside this increment.

This increment implements the short application persistence/access foundation and bounded integration security. It preserves existing owner services and introduces no new authentication service, infrastructure service or ERP vendor. Email OTP stays last. Preview remains explicitly isolated. New connected entry is feature gated and requires an existing verified Supabase user session.

## Field and operation matrix, before code

All new normal browser operations use the existing anon-key Supabase SSR client with end-user authentication and database authorization. Tenant comes from current ownership, never an untrusted role or email match. New SQL entry points reject anonymous Supabase users. Strict schemas reject unknown/protected fields.

| Flow / current input-output | Owner / existing boundary | Validation / transition / compatibility gap and correction |
| --- | --- | --- |
| Start: six basic groups, selected canonical IDs | Existing merchant + merchant_user; rpc_merchant_start | New additive application-start command creates merchant/owner atomically or explicitly binds an owned existing draft. No phone/email-based claim. No invented city/legal name. Durable caller/operation idempotency. |
| Save/resume: current short form and permitted unfinished setup | merchant fields and application-specific capture/revision; legacy save_step/category/branch RPCs | Expected revision, strict writable fields, canonical compatibility/version policy, retained inactive answers. Read by ownership. Keep the application draft distinct from committed offerings/resources and verified evidence. |
| Submit: registration only | Existing merchant submission/review; legacy rpc_merchant_submit has city/docs gates | New short-submit command validates entry facts, snapshots a revision and marks review pending without restoring six-step requirements. A repeated command replays safely. |
| Home read/edit | Existing Home presentation and shared booking-config projection | New server adapter loads persisted draft. Save task edits before returning Home. Pending setup remains permitted; no operational fetch underneath blur. Missing/unknown access fails closed. |
| Payout declaration | merchant.payout_account, payout_rail; finance settlement_account | Till, PayBill+reference, bank strings. Private declared values separate from finance verification. Unresolved mobile-money phone drafts preserved, never converted. No provider call. |
| Documents | Existing document + private partner-documents and upload helper | Selected File is not uploaded/verified. Reuse private owner upload contract; validate ownership, object completion/type/limits. No files or credentials in capture JSON. Unsupported scan/provider acceptance stays explicit. |
| Changes requested / approval | Staff role/city helpers and existing review RPCs | New revision-bound review command with immutable submitted snapshot, explicit changes/rejection reason and separate workspace approval. Draft edits cannot inherit stale approval. Legacy cases remain legacy. |
| Activation | Existing rpc_merchant_go_live and readiness owner | Approval alone never publishes/accepts work. Guard new-flow activation against missing current approval and applicable readiness; unsupported activation remains denied rather than fabricated. |
| Booking setup / operations | Existing booking-config, Payload Reserve engine, merchant proxy | Preserve resource/availability/capacity owner. New operational guard precedes bootstrap/forwarding. Source GET must not silently provision. No duplicate engine or booking records in application JSON. |
| API / ERP / webhooks | Existing API-key registry, API routes, notification outbox, booking outbox, integrations design | Harden existing credential issuance and principal limiting; define explicit supported surface/authority/version matrix. No unspecified provider connection or unsupported two-way operations advertised. Reuse durable delivery owners; provider rollout requires actual selected credentials/contracts. |
| Browser session / revocation | Supabase Auth session_id and installed SSR 0.5.2 / JS 2.47.10 | getUser server verification, current membership/session/deadline checks, SDK refresh/cross-tab logout. Merchant middleware propagates cookie refresh to request+response. No parallel session/login system. |

## New application boundary

SQL signatures: `rpc_merchant_application_start(p_operation_id uuid, p_payload jsonb, p_merchant_id uuid default null)`; `rpc_merchant_application_save(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid,p_payload jsonb)`; `rpc_merchant_application_submit(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid)`; `rpc_merchant_application_read(p_merchant_id uuid)`.

Response: merchant_id, revision, payload, review {state,submitted_revision,submitted_at,needs_resubmission}, access {state,setup,operations}, publication {status}, operation_id where applicable. The browser application ID maps to the existing merchant ID. Operation IDs and Supabase session IDs remain different identifiers.

Capture is a draft, never a replacement owner for catalogue, resources, reservations or finance verification. Keep private payouts outside general draft JSON. Bound and validate retained answers without discarding inactive keys. Version canonical taxonomy/configuration and use an explicit map for legacy database category keys. Submission retains the versioned snapshot. Review commands compare the submitted and current revision; stale decisions fail.

Idempotency scope is authenticated actor + command + operation UUID with a canonical validated payload digest and stored safe result. Database locks serialize concurrent duplicates and revision changes. Same key/different command payload conflicts. Authorization is checked before replay. No provider I/O occurs inside a database transaction.

## Plan coverage and acceptance

| Section | Decision / acceptance |
| --- | --- |
| 1 Objective | Durable simple registration and truthful setup Home with server-enforced pending access. |
| 2 Scope | Application contracts/RPCs/routes, connected form adapter, payout correction, auth/access guards and bounded existing integration security. |
| 3 Dependencies | Existing Supabase, merchant owners, booking configuration/runtime and installed framework. Local DB tooling is unavailable until established; do not misreport DB acceptance. |
| 4 Boundaries | Existing domain owners; reference checkout read only; no second login/booking/queue service. |
| 5 Existing contracts | Merchant/ownership, old onboarding, protected trigger, private uploads, booking proxy, API credentials and outbox. |
| 6 New contracts | Versioned application commands/read/access, current revision review and deployment feature flag. |
| 7 Entities | Existing merchant/member; application capture/snapshot/revision/operation journal; existing session and credential identity. |
| 8 Database | Additive migration(s), explicit grants/RLS/indexes/timeouts; preserve invoker protected-column trigger; close direct member self-join/create bypass. |
| 9 APIs | Same-origin private application route, explicit authentication, bounded bodies, stable problem codes/request ID/no-store; existing API compatibility retained. |
| 10 Commands | Start/save/submit/review; payout declarations and permitted setup. Reads do not change business state. |
| 11 Events | Atomic existing audit/outbox conventions; no new unconfigured provider event consumer. |
| 12 States | Review/access/readiness/publication/accepting work independent. Unknown state restricts. |
| 13 Capabilities | Owner setup access; staff review; approved operational scope. Declared category/provider never grants capabilities. |
| 14 Authorization | getUser + database session/ownership/current state; RLS, guarded RPC and prefetch gates. No service role in ordinary browser handlers. |
| 15 Offline | Unsaved drafts visibly unsaved; no fake success or automatic financial retry. No sensitive browser persistence. |
| 16 Synchronization | Serialized saves, optimistic revision, stable retry IDs, stale-response fencing, independent machine credentials. |
| 17 Hardware | None. Browser/server changes only. |
| 18 Integrations | Reuse actual APIs/outboxes. Vendor not selected means no active universal ERP adapter. Record supported/unsupported paths and later acceptance precisely. |
| 19 UI | Reuse current form/Home; persist before returning; leave preview separate. No redesign. |
| 20 Security | Strict field allowlists, finite limits, private evidence/payout, same-origin writes, no secret output, no direct member join. |
| 21 Observability | Safe request/operation/revision IDs, audit, explicit unknown/conflict/recovery. No raw tokens/session IDs/payout logs. |
| 22 Tests | Changed contracts, persisted/reloaded revisions, duplicate/conflicting commands, ownership/role/review gates, invalid fields, session/limit failures; real SQL/RLS checks if isolated PG available. |
| 23 CI | Focused checks once per covered code revision. Reuse unchanged Phase 1–3 evidence. No root full-service launcher. |
| 24 Migration | Expand first, compatible disabled feature deployment, staging rehearsal, enable only after checks. Preserve legacy merchants with no new application row. |
| 25 Rollback | Disable new entry, retain stored rows/snapshots/operations. Never drop data or restore broad unsafe grants. |
| 26 Docs | Gap map, configuration/support matrix, exact tests/limits, migration/recovery runbook, handoff/status/changelog. |
| 27 Deliverables | Reviewable code and migrations plus available local verification; unavailable deployment/provider acceptance identified. |
| 28 Acceptance | Basic-only save/reload/submit; current owned session only; pending task edits allowed; operational reads denied; separate approval; strict payout branches; retries/conflicts safe. |
| 29 Failures | Timeout after commit, unknown auth, stale edits/review, duplicate keys, deleted/suspended state, legacy adapters, missing DB/provider/deployment. |
| 30 Risks | Divergent source and deployed schema require rehearsal. Existing member/credential bypasses must close before relying on owner guards. |
| 31 ADR | Additive short-flow application revision; old/new coexistence and scoped integration implementation boundaries recorded here. |
| 32 Exit | Local criteria pass or remain explicitly open. Production is never declared complete from source or mocks. |
| 33 Decisions | User authorizes local implementation/verification, reference checkout read-only, no production mutation; short registration/Home tasks/email OTP last. |
| 34 Subphases | A contracts/schema; B authenticated adapter; C connected UI/payout; D integration hardening; E focused verification/runbook. |

Higher-level master files referenced by the skills are not present in the inspected checkout, so conformance to unavailable documents is not asserted. No permission request is inferred from that absence.
