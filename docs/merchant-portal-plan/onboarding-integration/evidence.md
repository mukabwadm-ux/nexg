# Source and evidence register

Date: 1 November 2026. Read-only repository audit. Paths below are relative to `C:\Users\limta\Desktop\MERCHANT WORKSPACE`. Line references identify the inspected snapshot and may move during later edits.

This is evidence of existing code and design text, not verification of a deployed database, provider, permission policy or production approval journey.

This register describes the original audit snapshot. The form/shared code changed on 2 November 2026; see [implementation evidence](implementation/acceptance.md) and [Phase 2 scope](phase-2-short-form.md) for current behavior and remaining integration limits.

## Standalone form

| Source | Observed behavior |
| --- | --- |
| [Form steps and initial state](../../../merchant-onboarding/src/MerchantOnboarding.jsx#L12) | Six steps; business, one category, label-valued specialties, offerings, one location and operation configuration |
| [Form validation](../../../merchant-onboarding/src/MerchantOnboarding.jsx#L104) | Requires offerings; subsequent branches require operating address, same-day hours, documents and payout before submission |
| [Uploaded files](../../../merchant-onboarding/src/MerchantOnboarding.jsx#L264) | Browser component memory, separate from initial data |
| [Category/specialty change](../../../merchant-onboarding/src/MerchantOnboarding.jsx#L314) | Reassigns offers on specialty removal; category change resets operations/offers/files |
| [Payload and draft](../../../merchant-onboarding/src/MerchantOnboarding.jsx#L358) | Single schemaVersion label, Number(price), document metadata for drafts and browser File map for submit |
| [Submission result](../../../merchant-onboarding/src/MerchantOnboarding.jsx#L408) | Local status and success notice; no Home handoff or durable returned application reference |
| [Demo requests](../../../merchant-onboarding/src/App.jsx#L6) | Calls `/api/merchant-onboarding/draft` and `/api/merchant-onboarding`; no matching route handlers found in the inspected web API tree |
| [Independent categories](../../../merchant-onboarding/src/merchantCategories.js#L3) | 21 categories and 128 labels; hyphen IDs and category-level fields, not canonical scoped question identities |
| [Configuration export](../../../merchant-onboarding/src/merchantCategories.js#L52) | Exports `after`; form reads `afterApproval` and `offerLabel`, which are not supplied |

## Current shared definitions and amendments

| Source | Role and limit |
| --- | --- |
| [Canonical taxonomy](../../../packages/contracts/src/taxonomy.ts) | Existing category/specialty IDs and source fields. Do not replace IDs with display names |
| [Base onboarding design](../onboarding-and-configuration.md#L11) | Optional guided completion, scoped typed answers, source discovery, configuration vs effective permissions |
| [Readiness and statistics amendment](../onboarding-and-configuration.md#L135) | Applicable Home requirements supersede a fixed universal seven-step/test-order rule |
| [Reconciliation report](../../booking-engine/payload-reserve-plan/reconciliation/report.md) | Preserves the original 300 question identities and resolves booking aliases into 323 effective definitions |
| [Effective manifest](../../booking-engine/payload-reserve-plan/reconciliation/manifest.json) | Actual effective profile/question/workflow/domain file references and audit provenance. Marked design, not implemented |
| [Compiled booking configuration](../../../packages/booking-config/src/index.ts#L43) | Runtime reuse seam, model resolution and constants `Africa/Nairobi` and KES |
| [Compiled source provenance](../../../packages/booking-config/src/data/provenance.json) | Registry revision and input hashes; revalidate current source rather than assuming the saved hashes still match |
| [Kenya-only booking plan](../payload-reserve-plan/README.md) and [full copied plan](../../booking-engine/payload-reserve-plan/README.md) | Kenya zone and exact resources/intervals; the fuller reconciliation package is under `docs/booking-engine` in this checkout |
| [Automatic confirmation](../order-confirmation.md#L3) | Source-confirmed standard work has no default human merchant-acceptance gate; exceptions need named rules |
| [Home/statistics build contract](../stats/frontend-and-acceptance.md#L13) | Applicable setup tasks and shared Home/Insights evidence; structural checks do not prove runtime behavior |

Several documents still contain older source paths and proposal status. The implementation plan explicitly calls for a current version/authority inventory, not blind promotion of every historical JSON into production.

## Home and workspace

| Source | Observed behavior |
| --- | --- |
| [Screenshot fixture](../../../apps/web/app/merchant-live-preview/page.tsx#L17) | Explicit sample marks profile/hours/team complete and total 3/7. Route is development-only |
| [Production Home](../../../apps/web/app/merchant/page.tsx#L154) | Already renders HomeSetup, but does not pass a production review/access view model |
| [Setup Home](../../../apps/web/components/merchant/home-setup.tsx#L10) | Fixed seven steps; at lines 41–42 review/changes states depend on preview mode |
| [Setup progress interface](../../../apps/web/components/merchant/types.ts#L10) | Seven boolean fields rather than scoped requirement rows with pending/verification states |
| [Current progress projection](../../../supabase/migrations/20260101019000_what_the_merchant_dashboard_reads.sql#L44) | Team requires more than one merchant user; final completion uses went_live_at; eligibility has narrower predicates than a full adaptive readiness decision |
| [Latest inspected readiness](../../../supabase/migrations/20260101021003_subcategory_readiness.sql#L3) | Lines 66–89 retain zone, prep_minutes, uploaded-or-verified docs, payout presence and five-item rules |
| [Workspace preview navigation](../../../apps/web/components/merchant/workspace/navigation.ts#L16) | Nine desired destinations |
| [Production shell](../../../apps/web/components/merchant/shell.tsx#L73) | Older Dashboard/Orders/Catalogue/Hours/Branches structure, distinct from preview shell |
| [Navigation links](../../../apps/web/components/merchant/nav-links.tsx#L35) | Locked desktop rows still render ordinary links; phone handling differs. Icons alone do not enforce approval restrictions |
| [Business source boundary](../../../apps/web/components/merchant/business/README.md) | Specialty-keyed browser samples, not live Business APIs, real documents or invitations |
| [Offerings source boundary](../../../apps/web/components/merchant/offerings/README.md) | Adaptive frontend and adapter seam; local publication is not a public live listing |
| [Current handoff](../../handoff/HANDOFF.md) and [deliverables](../../status/deliverables.md) | Existing Work, Business, Offerings, Availability, Money and statistics work must be preserved. Their implementation/production limits differ |

## Backend, ownership and admin

| Source | Observed behavior |
| --- | --- |
| [Draft creation](../../../supabase/migrations/20260101003900_onboarding_rpcs.sql#L54) | rpc_merchant_start creates merchant and owner membership together; line 121 creates merchant_user |
| [Existing draft store](../../../apps/web/components/onboarding/store.tsx#L167) | Uses structured category/answer/branch commands; reusable persistence rather than a matching arbitrary demo-payload endpoint |
| [Private upload client](../../../apps/web/lib/uploads.ts#L59) | partner-documents upload and rpc_document_submit metadata record at line 108 |
| [Storage policies](../../../supabase/migrations/20260101001400_storage.sql#L106) | Existing ownership-prefixed document storage policies; verify complete access paths during implementation |
| [Submit](../../../supabase/migrations/20260101003900_onboarding_rpcs.sql#L625) | Requires category/city/essential uploads, sets submitted_at, computes status and audits; existing submitted retry returns reference |
| [Current web submit destination](../../../apps/web/components/onboarding/step-payout.tsx#L191) | Navigates to `/merchants/status`, not the requested Home |
| [Owner Home resolution](../../../supabase/migrations/20260101019300_the_setup_dashboard_is_the_destination.sql#L46) | Unfinished owned merchant can resolve to `/merchant` |
| [Portal identity guard](../../../apps/web/lib/partner.ts#L53) | Merchant entry does not require readiness. Ownership already exists before review |
| [Home context](../../../apps/web/components/merchant/frame.tsx#L27) | Queries merchant_home_v for the current owner |
| [Admin go-live action](../../../apps/admin/app/merchants/actions.ts#L47) | Calls rpc_merchant_go_live. No separately wired approval/unlock command was found |
| [Go-live RPC](../../../supabase/migrations/20260101001100_activation_rpcs.sql#L94) | Staff-scoped command checks prerequisites and directly sets live. Cannot be relabelled Approve without changing its side effect |
| [Review primitives](../../../supabase/migrations/20260101007400_merchant_console_rpcs.sql#L137) | Review start/save and return-to-applicant at lines 176 and 214. Return is document-focused; inspected admin UI does not wire these RPCs |

Existing rows, owner grants, document IDs and domain commands should be reused. Pending approval restrictions must be added to the actual operational authorization paths, not inferred from dashboard visibility.

## Review method and limitations

The audit combined direct file inspection with independent read-only form, Home and backend/admin reviews. It inspected current Desktop workspace code and handoff material, not the historical Documents checkout. No database service was started and no live database schema/policy probe was performed. No external legal/provider claims were verified. Application tests are part of the future build phases; this evidence register records a planning audit only.
