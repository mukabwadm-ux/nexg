# Phase 2: short registration acceptance

Date: 2 November 2026, Africa/Nairobi. Status: implemented and verified for the isolated frontend preview.

## Result

The existing onboarding component now starts on a single page containing exactly the six user-requested groups: business/applicant names; category/subcategories; branch count, email and Kenyan phone; a different business contact number where needed; registration yes/no and required policy acknowledgement; optional marketing. No startup wizard, listing, legal-entity, location, hours, evidence, payout or specialty-attribute controls are rendered.

The existing detailed sections were retained as Home task editors. Home's review/add actions open them with their current state. Return keeps partial edits; save validates only relevant supplied values. The separate Back to registration action returns to the short form, not the old wizard. Operational drafts cannot block the entry contract or be silently erased. Email OTP remains deferred.

The shared category/question layer from Phase 1 is reused. Category/subcategory IDs and question rules were not duplicated. A display-only correction uses the canonical taxonomy spelling Café for the existing café ID; the historical snapshot's encoding does not change any identity or rule. Correcting a field clears its obsolete error immediately.

## Observed verification

| Check | Actual result | Execution policy |
| --- | --- | --- |
| `node --test --test-name-pattern 'short registration' src/capture.test.js` in merchant-onboarding | Four new short-registration tests passed, none skipped | Ran once after adding the new registration boundary. The 13 unchanged capture cases and 212 unchanged shared cases were not rerun for this phase |
| `node scripts/smoke-onboarding-registration.cjs` | Five changed-flow journeys passed, no runtime errors or server writes | Initial harness had an ambiguous business-phone label; corrected its selector. Later form/display code changed to fix stale errors and Café, so the affected browser check was rerun on that changed revision |
| `npm run build` in merchant-onboarding | Passed | Built the changed form; the final display/error correction touched covered code, justifying the final build. No rebuild after documentation-only edits |

Browser journeys verified the six-group single-page boundary; absence of portal-only fields; explicit policy acknowledgement with optional marketing; basic-only registration to personalized Home; partial listing/location task editing and retention; a return to short registration with an unfinished invalid portal draft; and safe approval-locked navigation. Phone layout stays within the viewport.

Artifacts: [browser results](phase-2-browser-verification.json), [desktop registration](registration-desktop.png), [phone registration](registration-phone.png). The earlier six-section capture browser scripts/results are historical records of the prior increment, not the current Phase 2 acceptance commands.

## Limits

This is the completed Phase 2 frontend change, built on Phase 1's implemented category/question foundation. It is not a claim that every future production/task contract is complete. The callback is still an explicitly labelled in-memory Home preview. No real OTP/sign-in, durable application or upload, backend permission, admin review, publication or live operation is connected. The production Home and existing operational modules were not replaced or started.

Only the isolated form server on 127.0.0.1:5181 is running. Refresh/close clears preview data. The build retains the documented non-failing large-chunk advisory for its compiled registry. Production source/authentication/admin/activation phases remain open.
