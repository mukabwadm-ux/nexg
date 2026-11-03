# Shared NEXG booking configuration

The runtime package contains a compact, versioned copy of the reconciled onboarding contract: 21 categories, 128 existing subcategories, 323 canonical question definitions, 31 BQ input mappings and 15 reusable booking models. The source digests are in `src/data/provenance.json`; `sync:plan` regenerates the snapshot from the planning package without changing its meanings.

`resolveBookingConfiguration` validates typed/scoped inputs, resolves aliases and conditional rules, and returns model/workflow bindings, missing setup and explicit readiness. It never creates a booking or grants access. The booking server must supply actual resource and authority facts, independently authorize every command, validate policy references and enforce resource transactions. `primaryModel` and `models` describe eligible structure; only `isReady`, `activeModels` and the runtime's actual policy/authority checks establish configured functionality. `canConfirmNative` remains false for external/read-only ownership.

All merchant time is `Africa/Nairobi` and native currency is KES. No timezone selector is exported. Missing values remain unknown, false remains a valid answer, different explicit aliases cannot overwrite each other, and other business/offering scopes are not imported implicitly. Calendar recurrence does not grant membership or payment renewal; product orders and enquiries remain nonblocking unless the selected activity explicitly uses reservations.

The lightweight `@nexg/booking-config/profiles` export contains category labels and profile summaries without importing the schema/resolver bundle. Merchant APIs should use the main export for validation and configuration. The public profile summary is not a permission or readiness assertion.

`getApplicableBookingQuestions` returns deduplicated schemas for source specialty fields and the selected model's operational setup. `validateBookingAnswer` applies JSON Schema and implemented semantic checks for ranges, schedules, recurrence, capacity, tables and authority. Named upstream policy-owner validations and actual references remain server responsibilities, not questionnaire truth.

`registerBookingCategory` accepts only declarative fields and registered question/model IDs. Its caller must provide the runtime's implemented model list, authorize category publication, persist the definition/version and replay it during startup. It does not persist or publish a category itself. Categories with novel operations cannot become active by supplying scripts or a model name.

The configuration revision is a deterministic content fingerprint for display/change comparison. It is not an authentication signature or a replacement for the booking database's optimistic concurrency version.

`ReservationFeePolicy` describes no fee, a fixed minor-unit amount or an exact percentage in basis points, credited toward the total or charged in addition. Required fees use the runtime's approved collection policy. Configuration validation never represents receipt evidence, a provider integration or a customer's acceptance. The booking engine must calculate the final quote, preserve accepted fee/payment/refund terms immutably, authorize collection and check evidence before fee-gated confirmation.

Run `pnpm --filter @nexg/booking-config typecheck` and `pnpm --filter @nexg/booking-config test`. The tests exercise all 128 mappings, attainable readiness for all 15 models, reservation fee rules and concrete business exceptions; they do not certify the separate reservation engine's transaction or integration behavior.
