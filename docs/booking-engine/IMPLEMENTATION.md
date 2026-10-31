# Booking engine implementation

Date: 31 October 2026. Status: NATIVE CORE IMPLEMENTED AND LOCALLY VERIFIED, INCLUDING BROWSER ACCEPTANCE. User authorization: build end-to-end in the existing merchant workspace using Payload Reserve and the reconciled onboarding for all 128 subcategories. Google Calendar is optional. This record links the approved plan to the implementation; Shared native handlers cover resource reservations and six specialist workflows. Complete production journeys across all 128 subcategories remain unverified. See README.md for the exact native and request-capture boundaries and VERIFICATION.md for completed evidence.

| Plan section | Implementation boundary and acceptance |
| --- | --- |
| 1 Objective | Persistent NEXG booking and calendar journeys using onboarding configuration, with supported resource/work models. |
| 2 Scope | Shared configuration package, isolated headless Payload runtime, existing portal integration, customer booking page, local operation and verification. |
| 3 Dependencies | Pinned Payload Reserve 4.4.2 and Payload 3.86.0; existing Next 14/React 18 portal remains separate. |
| 4 Architectural boundaries | NEXG identity/proxy, booking runtime and adapter, authoritative providers; no second merchant login or cross-domain table writes. |
| 5 Existing contracts | Merchant identity/membership and taxonomy preserved; existing dirty Home/sign-in work retained. |
| 6 New contracts | Typed configuration, workspace/resource/offering/availability/booking APIs and signed service context. |
| 7 Entities | Business-scoped configuration, resources, services, reservations/work, operation identity, audit, durable tasks and customer access references. |
| 8 Database changes | New dedicated booking store owned by Payload; SQLite for local development, PostgreSQL adapter configuration for deployment. No existing merchant database reset. |
| 9 APIs | Merchant proxy under /api/merchant/booking, public restricted proxy under /api/public/booking, private runtime on loopback 3003 by default. |
| 10 Commands | Configure, create resources/offerings, request/hold/book, approve/confirm, cancel, change and complete with policy, scope and concurrency guards. |
| 11 Events | Durable committed booking/audit/task records; external messages cannot claim pre-commit success. |
| 12 State machines | Reconciled work/model bindings; allocation, work and financial/provider state remain distinct. |
| 13 Capabilities | Registered model selection across 128 profiles; unknown category/model bindings rejected. |
| 14 Authorization | Merchant identity from existing auth/membership; HMAC short-lived server context; direct tenant injection and customer merchant actions denied. |
| 15 Offline | Read errors are visible; writes require confirmed service responses, and unknown outcomes retain idempotency references. |
| 16 Synchronization | Native booking works without Google; external authority is not assumed to be locally confirmable. |
| 17 Hardware | None; browser and server only. |
| 18 Integrations | Optional Google; provider/payment/messaging access requires actual configured credentials and supported adapters. No fabricated confirmations. |
| 19 UI | Existing NEXG tokens/shell, appropriate calendar and agenda, resources/setup, booking detail and public customer journey. |
| 20 Security | Server scope checks, same-origin mutations, request limits, signed private service access, opaque public identifiers and customer tokens. |
| 21 Observability | Health/status, structured failures, operation identity, audit and durable task visibility; no secret logging. |
| 22 Tests | All-128 configuration coverage, real persistence, tenant rejection, concurrency, hold expiry, retry and reschedule recovery, interface/type checks and browser flows. |
| 23 CI | Scoped package tests/typecheck/build plus affected portal checks; unrelated pre-existing failures recorded distinctly. |
| 24 Migration | Booking store/schema migration ownership is isolated; provider/source cutover requires deliberate reconciliation. |
| 25 Rollback | Disable routing/stop only the new runtime; preserve stored bookings and existing portal. Never reset another chat's server or database. |
| 26 Documentation | Approved source snapshot, dependency notices, commands/environment, evidence, status and handoff. |
| 27 Deliverables | Runtime, contracts/configuration, merchant/calendar and customer flow, startup tooling and verification evidence. |
| 28 Acceptance | Real persisted and authorized outcomes with no duplicate or overlapping incompatible local allocations; no unverified feature declared complete. |
| 29 Failures | Unknown source/timeout, permission denial, invalid/missing setup, capacity conflict, invalid transitions, late expiry and duplicate commands. |
| 30 Risks | Dependency compatibility, adapter transactions, unsupported provider operations and credentials; isolate runtime and verify actual behavior. |
| 31 Decisions | Selected Payload foundation, fixed Africa/Nairobi, native-first optional Google, shared engine rather than 128 separate backends. |
| 32 Exit | Acceptance evidence recorded for implemented paths; any remaining requirement explicitly open. |
| 33 Resolved decisions | Full build authorized, existing workspace selected, new store isolated, Google optional, existing work preserved. |
| 34 Work packages | Configuration and runtime/UI in parallel; bridge/integration, dependency install, real tests, browser verification, operational documentation. |

The supplied NEXG skill summaries and reconciled plan guide contract boundaries. Referenced higher-level master documents were not found in the inspected checkout, so compliance with unavailable material is not claimed. This declaration does not add an approval request to the user's existing build authorization.
