# Optional capture and shared merchant configuration

Date: 2 November 2026, Africa/Nairobi. User-authorized implementation scope: shared category/question configuration and optional form capture, with a labelled Home handoff preview. Email OTP integration is deferred until the end by explicit user instruction.

## Current decisions

The latest direction supersedes the P0 decision to remove operational questions from registration entirely. The form may still invite offerings, location, schedules, documents and payout information. Missing operational information must not prevent continuing before verified OTP sign-in. Previously entered details stay available in Home and must not be requested again as if absent.

Basic business/contact details and canonical category/subcategory selection remain the entry baseline. The existing effective merchant JSON, already compiled into `packages/booking-config`, supplies specialty identities, scoped question definitions and conditional setup requirements. Do not create a separate question registry or evaluate arbitrary predicates in the form.

There is no connected email OTP, backend persistence or approved production session in the standalone Vite form. This increment must label its local handoff as a preview, retain sensitive entries only in memory, make no authentication/approval claim and avoid placeholder network requests. OTP, durable persistence, server permissions, admin decisions and actual production Home wiring remain later integration phases.

## Build and boundaries

1. Add a shared onboarding selection/answer projection to the existing booking configuration package, reusing its compiled JSON, schema validator and bounded predicate evaluator. Required specialty answers are gated by both verified OTP and signed-in state; supplied values remain typed and scoped.
2. Replace standalone category/specialty identities with canonical registry IDs through a reviewed legacy adapter. Preserve the existing optional operational controls, clearly mark them optional before authentication and offer a route that skips them without deleting entered data.
3. Keep minimum entry validation separate from supplied-value validation and later applicable completion tasks. Preserve false/zero/unknown distinctions, blank prices and incomplete records. Do not count visited steps as setup completion.
4. Let the isolated form hand actual current entries to a safe Home setup preview. Show unfinished tasks, retained information, the approval wait and locked operational destinations. No real restricted data is loaded underneath a blur.
5. Add meaningful shared-contract and browser journey checks, run the isolated form build, and record actual results and limitations. Do not start the portal, backend or admin.

## Acceptance

- Basic registration with a canonical category/subcategory can reach Home preview with all operational groups empty.
- Optional sections remain editable before that handoff. Partial capture survives Skip for now, navigation and returning from Home during the current session.
- Selecting a specialty loads its existing JSON questions, including applicable typed declarations. Different specialties do not share one unscoped answer map.
- Missing operational answers are optional before verified sign-in. Requiredness is derived only for the relevant signed-in setup context, not from a visited page or an admin approval flag.
- Invalid supplied input is explained without fabricating a default, and untouched offer placeholders do not become zero-priced listings.
- Category changes retain recoverable scoped entries; uploaded bytes remain only in memory. Core evidence is not discarded on category changes.
- Email OTP is visibly deferred; no fake code or simulated successful login is introduced. Preview state cannot approve merchants, publish offerings, activate customer work or grant server permissions.
- Affected contract tests, focused browser journeys and isolated build pass, with failure/recovery cases recorded. Production authentication and server acceptance are explicitly unverified.

The main plan's 34-section coverage applies. This increment adds a pure client/server-shareable projection and frontend preview; no database, API, event, provider, hardware, authorization grant or persistence migration is created. Source authority and backend enforcement remain unchanged. Rollback is removal of the isolated preview changes/subpath without touching saved server records. No master-spec compliance is claimed beyond the inspected workspace contracts.
