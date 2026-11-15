# Maps live integration plan

15 November 2026. Continues shared-services PR 146 with owner-authorized Maps integration work. Existing phase-one fixes and sign-in behavior are preserved. Source implementation and PR updates are authorized; production deployment, hosted migrations, real transactions and interactive acceptance are separate.

## Execution gates

One integration stage at a time: routes, customer tracking, Discovery viewport search, generated day edits/re-timing, Saved, then dated stays/booking. Each stage publishes its actual contract, connects the consumer, and runs isolated verification before the next stage. Discovery and mobile source stay in their own workspaces. No duplicate booking/authentication engine is introduced.

| Plan section | Decision |
|---|---|
| 1 Objective | Supply actual source-backed map features with explicit unavailable behavior. |
| 2 Scope | Add shared read APIs/adapters for the six stages; retain existing app and provider ownership. |
| 3 Dependencies | Supabase account/auth, existing merchant and order/stay records, Google Routes, Discovery contracts. |
| 4 Architecture | Edge/API adapters hold provider secrets. Maps draws supplied geometry. Discovery selects and re-times. |
| 5 Existing contracts | Extend capabilities compatibly; preserve current account, quote and lifecycle semantics. |
| 6 New contracts | Versioned route read first; later stage-specific source contracts documented before adapters. |
| 7 Entities | Route requests are ephemeral. Budget counters contain account/day/context counts only, no route/coordinate history. |
| 8 Database changes | Versioned quota/read migrations after 20261211000700; do not apply to hosted databases. |
| 9 APIs | Stage 1: authenticated `POST /functions/v1/maps-routes`. No provider endpoint from the client. |
| 10 Commands | Route computation on explicit customer action; later confirmed stop edits invalidate the old route. |
| 11 Events | No new event transport. A documented wiring-audit exemption covers bounded quota counters, following the existing counter precedent; no per-request location/history event is created. |
| 12 States | idle/pending/available/unavailable/error; stale, foreign or obsolete responses never become current. |
| 13 Capabilities | Enable only implemented/versioned operations. Unsupported sources remain explicit. |
| 14 Authorization | Non-anonymous authenticated account; customer tracking/records restricted to owning account. |
| 15 Offline | Route/tracking unavailable offline; no synthetic operational response or persisted Google route cache. |
| 16 Synchronization | Cancellation plus request/account/generation identity. No new polling. |
| 17 Hardware | No location permission or provider-device tracking changes. |
| 18 Integrations | Google Routes v2 with explicit field mask, server key and bounded upstream request. |
| 19 UI | Same Google canvases; explicit route action, source distance/time chips and failure recovery. |
| 20 Security | Validate input/response bounds, deny anonymous accounts, atomic rate budget, no service key in client. |
| 21 Observability | Typed failure codes and bounded quota metadata; no raw upstream errors, positions or tokens logged. |
| 22 Tests | Injected auth/quota/Google boundary cases; pgTAP quota ownership tests; client race/expiry/account checks. |
| 23 CI | Focused tests/type/lint first; PR checks recorded separately from local proof. |
| 24 Migration | Additive migrations only; unique versions beyond all prerequisite migrations. |
| 25 Rollback | Disable route feature flag; preserve existing map/manual-plan behavior. Do not discard saved source records. |
| 26 Documentation | Contract, configuration names, failure codes, verification and release order with each stage. |
| 27 Deliverables | Reviewed source changes, tests, connected client and accurate PR description. |
| 28 Acceptance | Real source identities/geometry; account isolation, cancellation and unknown-state checks pass. |
| 29 Failures | Missing config, rejected account, exhausted budget, provider timeout/invalid response/unreachable route. |
| 30 Risks | Provider spend bounded; no caching of Google content; route travel time is never a delivery promise. |
| 31 ADRs | No new backend or booking architecture. Reuse existing Supabase; record later material decisions explicitly. |
| 32 Exit | All implemented checks pass; configuration/deployment/UI limitations remain explicit until separately verified. |
| 33 Resolved decisions | Owner selected Google and authorized work alongside PR 146, then updating that PR. No sign-in changes. |
| 34 Subphases | 1 routes, 2 tracking, 3 viewport, 4 generated edits, 5 Saved, 6 stays; later design details follow verified source. |

## Stage 1 contract

`POST /functions/v1/maps-routes` accepts bearer authentication and a public Supabase API key. JSON request: `contractVersion: '1'`, `requestId` (1–120 characters), `contextId` (1–120 characters), `travelMode` (`DRIVE` or `WALK`), and 2–12 ordered `stops` with distinct `id` (1–120 characters), `latitude`, `longitude`. Coordinates are finite geographic ranges, including zero. Context is an ephemeral planning scope, not evidence of an owned saved plan. No location is stored by this operation.

Success JSON: `contractVersion: '1'`, echoed `requestId`, verified `accountId`, `provider: 'google-routes'`, `travelMode`, `computedAt`, `expiresAt`, `status: 'available' | 'unavailable'`, and `legs`. Each available leg contains `fromStopId`, `toStopId`, `distanceMeters`, `durationSeconds`, and decoded `coordinates` (`latitude`, `longitude`). Available legs must match adjacent request stops in order. Unavailable has no legs and a typed `reason`. Expiry is the application's five-minute use window from computation; it is not a provider arrival guarantee. No raw provider message is returned.

Authentication failures use 401/403, invalid input 400, budget exhaustion 429 with Retry-After, and missing configuration/upstream infrastructure 503. Responses use `Cache-Control: no-store`. A missing server Google key or `MAPS_ROUTES_ENABLED` flag fails closed. The public browser key is never reused automatically. Google requests use the v2 computeRoutes endpoint, route-leg field masks and no waypoint optimization. DRIVE requests traffic-aware duration; WALK includes Google's returned warnings and an explicit walking-route caution for the consumer. Request timeout and geometry/JSON limits are enforced.

Atomic budget defaults: at most 10 requests per account per minute, 60 per UTC day and 20 per context per UTC day. Counts are consumed before paid work; aborted/failed upstream requests remain charged to the budget. These are application limits, not a quoted Google price. Actual provider quota/billing setup remains operator-owned. No paid requests are made during injected verification.

Authoritative provider references checked for this implementation: [Routes v2 computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [field masks](https://developers.google.com/maps/documentation/routes/choose_fields), [Routes policies](https://developers.google.com/maps/documentation/routes/policies). Route content is kept only in memory for the current view and is not persisted in plans or usage counters.

## Stage 2 contract

The signed-in app reads `rpc_my_order_map(p_order_id uuid)` on explicit map open. Version 1 returns `{contractVersion: "1", accountId, record: {kind: "order", id}, stage, status, places, courier: null, reason?}`. A `locations-only` result contains one or two valid fixed places with `id`, `latitude`, `longitude`, generic `title`, and `role: "pickup" | "dropoff"`. An `unavailable` result returns an empty place list and `reason: "completed" | "locations-missing"`. SQLSTATE `P0002` covers missing and foreign orders identically. The read checks a non-anonymous account and direct ownership through the order's non-anonymised guest.

Fixed pickup comes from the unambiguous current dispatch job or the order's matching merchant branch. Dropoff comes from the order point. The available source has global rider positions under staff access and no authoritative customer observation for a specific order. The response carries fixed locations only, with no automatic polling, realtime subscription, ETA or route. [Customer order map v1](./ORDER_MAP_V1.md)

## Stage 3 contract

Only requests with `X-Nexg-Features: maps-v1` receive the new capability fields. The Discovery engine advertises `viewportSearch: true` with its NexG source when its healthy Supabase catalogue can filter merchant points. The existing results read accepts optional `viewport: {south, west, north, east}` for a selected merchant category. Bounds are inclusive and support the antimeridian. A viewport cannot combine with a position, zone, named area, nearest sort, or collections. The source applies the bounds before the candidate window. Lexical query matching remains available within that window. The response echoes `applied.viewport` and includes each merchant's existing source `location`.

The app requests the viewport on explicit action. Changing the bounds starts a fresh results session. The engine does not need device location or permission for this read.

## Stage 4 implemented in authoritative Discovery and App

Generated day edits stay in Discovery. The additive contract provides stable stop occurrence IDs, numeric revision (starting at 0), and a short-lived AES-256-GCM encrypted edit token on eligible NexG day answers. Initial Day requests opt in with `editing: "day-v1"`; legacy requests retain their previous response shape. An explicit edit submits one move, remove, replace, or add operation with that token. The service checks the original release, brief, expiry, revision and source IDs, reads fresh source facts, and returns a complete re-timed answer. A failed edit preserves the previous answer; the client never repairs the timetable. Existing budget, opening-hours, source and geographic constraints still apply. Unknown hours and planning travel estimates remain marked unknown/estimated; this does not become booking availability or live routing.

The token authenticates an in-memory planning draft, not account ownership or a saved booking. A per-process encryption key needs no database and restart invalidates old tokens; a deployment with multiple workers needs request affinity or refresh recovery. No location-bearing near/GPS draft or demo result is editable. One request is active per client revision; obsolete replies cannot replace a later answer. New answers invalidate route geometry, and no generated stop is persisted without an existing authorized save flow. The accepted response preserves the original expiry, increments revision once and echoes baseRevision. This implementation lives in the authoritative standalone Discovery workspace and its production-relative source export; the older Discovery engine bundled in this PR receives viewport search only.

## Stage 5 implemented: account Saved places

Account Saved places reuse the customer_saved schema proposed in PR 132; do not create a competing saved-place table or copy merchant positions into private records. Extract only the merchant/item identity storage and save command, with real-account guards, bounded account capacity and owner-only access. Account deletion, preferences and export work from PR 132 remain outside this integration. Record the overlapping migration section for PR 132 reconciliation before merge.

The implemented RPCs and release overlap are documented in [Saved places v1](./SAVED_PLACES_V1.md). The connected Maps/App capability is merchant places: list/get/save/remove, using current public merchant facts. A hidden or unlocated saved merchant remains represented in Saved with an explicit unavailable presentation and no fabricated coordinate. Other saved kinds, restoring the original record/time, notes and personal lists are not advertised by this adapter. Existing richer adapters retain their capabilities. Every read or mutation uses the current bearer and is discarded on account/generation change; timeouts produce unknown outcomes rather than optimistic success or automatic retry.

## Stay scope

The requested Maps integrations do not replace the separate dated stay availability, booking or payment dependencies. Existing listed rates remain labelled as supplied rates, and map placement requires an explicitly classified public map point. Deployment and owner UI acceptance are separate from source checks.
