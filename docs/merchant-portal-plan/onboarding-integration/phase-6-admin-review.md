# Phase 6 managed application review

2 November 2026, Africa/Nairobi. Status: local implementation and focused verification complete; configured-runtime acceptance remains open. The user authorized continuing the onboarding → saved Home → backend → admin approval journey. This increment edits Desktop MERCHANT WORKSPACE only. The existing platform reference, real accounts, provider effects and deployed schema are unchanged. See [Phase 6 acceptance](phase-6-acceptance.md) and [Phase 5 source/runtime limits](phase-5-acceptance.md).

The existing console directory joins city and omits short applications with no city. Its legacy Take live command publishes a merchant and cannot serve as account approval. Reuse the existing application review RPC and current staff/session authority; add a bounded managed queue and explicit submitted-snapshot review inside the current admin app. Approval does not publish or accept work. Email OTP remains the last phase.

| Plan section | Decision |
| --- | --- |
| 1 Objective | Staff can find a submitted short application, inspect the exact submitted facts and approve access, request changes or reject through the existing revision-bound command. |
| 2 Scope | A managed Applications queue/detail and review controls in apps/admin; merchant status already flows through the Phase 5 Home source and access boundary. |
| 3 Dependencies | Existing Auth/session, active staff grants, application/submission/operation tables and rpc_merchant_application_review from Phase 4. |
| 4 Boundaries | Admin reads/reviews application facts through authenticated owner APIs/RLS. No service-role client, finance verification, file upload or booking engine duplication. |
| 5 Existing contracts | Strict canonical MerchantApplicationCapture/Record, current submitted revision, approved/changes_requested/rejected decisions, actor-scoped operation journal. |
| 6 New contracts | Bounded staff queue and detail read models; detail contains current record and immutable submitted snapshot, never private payout credentials. |
| 7 Entities | Reuse application, submission, merchant, staff and role grants. No new identity or approval entity. |
| 8 Database | Additive staff-only read RPCs/index only if needed for safe bounded queue/snapshot access. Existing review command remains authoritative. |
| 9 APIs | Same-origin, private/no-store admin application review route with finite deadline and RFC 9457 errors. Existing server pages load authorized queue/detail. |
| 10 Commands | Existing review RPC only, with merchant ID, expected revision, stable operation ID, decision and bounded reason. No automatic retries. |
| 11 Events | None new: the existing command atomically records its audit and operation result. |
| 12 States | Only pending current submitted revision can receive a decision. Draft/edited/unsubmitted or already-reviewed revisions are read-only. |
| 13 Capabilities | Existing active merchant_ops/super_admin grants scoped by city; unassigned short applications require an existing global grant. UI cannot widen that grant. |
| 14 Authorization | Verified non-anonymous Auth and current staff authority at every read/command; DB checks session/grant/revision at execution. Revoked/foreign/expired users fail closed. |
| 15 Offline | No cached private record or queued approval. Unknown write outcome retains the same operation ID for explicit retry/reconciliation. |
| 16 Sync | One in-flight review, current revision displayed, stale response discarded, refresh after confirmed decision. Merchant rechecks current access independently. |
| 17 Hardware | None; existing browser console. |
| 18 Integrations | No outbound email, ERP, payment or publication call. |
| 19 UI | Existing console shell/tokens and merchants navigation; dedicated Applications entry, bounded queue, snapshot/current distinction and reason controls. Legacy detail links managed applications to this flow. Merchant Home displays the bounded change request against its submitted revision. |
| 20 Security | No restricted operational facts hidden behind UI; no payout read; same-origin POST, bounded body/inputs, current session, no-store including refreshed Auth cookies. |
| 21 Observability | Safe problem code/request ID and existing operation/revision/audit identities. No raw backend exceptions, applicant payload or financial details in logs. |
| 22 Tests | Actual read/review RPCs under scoped synthetic roles in the existing local PostgreSQL fixture; transport auth/origin/deadline/error/conflict cases; SSR/control behavior and integration type checks. |
| 23 CI | Focused checks once per covered revision. Reuse unchanged Phase 4/5 evidence; no full service startup or broad suite rerun. |
| 24 Migration | Additive migration only, not remotely applied. Existing managed-entry feature gate remains disabled until configured-runtime acceptance. Legacy directory/activation stays available for legacy merchants. |
| 25 Rollback | Hide managed queue/review entry and revert compatible admin reader; preserve application/submission/journal records and original RPC semantics. |
| 26 Documentation | Evidence, current status, rollout limitations and handoff; register the route/capability/read contract here. |
| 27 Deliverables | Working local admin queue/detail/review plus merchant feedback path and focused evidence. |
| 28 Acceptance | Cityless applications visible only to eligible global staff; exact snapshot visible; stale/unauthorized decisions denied; explicit retry idempotent; approval unlocks approved access while publication/accepting-work stay unchanged. |
| 29 Failures | Missing migration, unavailable backend, expired session, revoked/city-only grant, malformed cursor, concurrent edit/review and timeout after commit. Render recovery, never empty-success or guessed approval. |
| 30 Risks | Legacy directory undercounts managed applications; show separate managed results/count scope. Growing queues use bounded keyset pagination. Concurrent updates may move records between pages; detail and command always revalidate. |
| 31 ADR | Reuse separate application review rather than legacy go-live; additive submitted-snapshot read boundary documented here. |
| 32 Exit | Local changed-code checks pass and limits documented. Live Auth/storage/deployed-schema acceptance remains explicitly open until actually exercised. |
| 33 Decisions | Continue implementation is authorized; short form/cityless entry, approval distinct from activation, demo only on onboarding and OTP last are user decisions. No new permission gate is inferred. |
| 34 Subphases | Staff read contracts; existing console integration; review controls/transport; focused verification and handoff. |

The referenced master/contracts directories are absent in this checkout; this plan follows the existing verified contracts and Phase 0 rules and does not claim unavailable master-spec validation. No remote migration or running whole service is authorized by this plan.
