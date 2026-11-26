# Stays VPS exact-unit read seam, 2026-11-17

Status: isolated advisory adapter only, not activated. No holds, quote operations, reservation writer, Supabase fallback, external API or active app changes.

## Existing dated search and authority gap
Read-only inspection found the latest complete dated source in Desktop/NEXG DISCOVERY/discovery-engine/src/stays/datedCandidates.ts and active app src/stays-engine/dated-search.ts. It calls rpc_stay_filter_candidates_v1 against Supabase and validates complete same-unit room-only candidates. The app shares those results between list/map, but public coordinates are null. This local test path must not be described as VPS reservation availability or copied into the release with availability:checked.

The isolated release-native/journeys snapshots inspected do not contain that latest datedCandidates implementation. The native release candidate lacks stays-engine entirely. Core quoteStay persists a quote operation and must not be called once per candidate as a read-only search workaround.

## Adapter delivered
src/stays/vpsAvailability.ts accepts the exact property/unit, dates, adults and children. It requires an explicitly configured trusted nexg-booking-engine read port. No configured port or wrong authority => unavailable. It validates the core-proposed readStayAvailability DTO: matching request, exact offering ID, nights, boolean availability, safe positive room-only money, and observedAt within 60 seconds (at most 5 seconds future skew).

The adapter snapshots input, fails closed on invalid or changed echoes, projects only known fields, preserves verified negative availability, and never treats a source error as empty results. Output explicitly says held:false and booking:not_checked. Capability declares enumeration:false and sourceAvailability:not_checked. No HTTP route or runtime source was enabled. Adapter metadata is not proof of deployment, successful core read or current inventory.

Wire the port only to core readStayAvailability under its verified coherent transaction/snapshot. Do not point it at legacy RPCs or trust a network response claiming a VPS authority string. The core owns authority binding, resource exclusivity, schedule, lead/horizon, pricing and occupancy. This adapter does not reimplement those rules.

## Verification
node --experimental-strip-types --test discovery/discovery-engine/test/vpsStayAvailability.test.mjs

8/8 tests passed on Node24.21.0. git diff --check passed. These are injected adapter fixtures, not actual core integration or database proof. Full TypeScript compiler/integration tests remain pending in a suitable isolated dependency environment. First invocation failed because this older isolated checkout lacked src/stays; creating that new directory resolved the setup failure and the subsequent run passed.

## Remaining end-to-end gates
- Core exact read helper and coherent transaction integration; preserve selected authority per offering.
- Published unit/property mapping and complete authorized candidate enumeration before pagination. Do not filter only a page or create quote operations for every candidate.
- Native search/detail wiring that distinguishes listed metadata from available inventory; quote/hold recheck stays authoritative.
- Same verified result set for list/map; public coordinates still required for actual map placement.
- Negative/stale/changed identity fixtures integrated with actual core, then device QA.
- Migration collision: actual local 20261224000100_stay_filter_candidates.sql conflicts with main 20261224000100_careers_board.sql. No migration renamed/applied and no target ledger queried. Supabase occupancy migration does not solve VPS read authority.

## Complete-set composition follow-up
Added src/stays/vpsSearch.ts and test/vpsStaySearch.test.mjs. Trusted withSnapshot must provide source-local COMPLETE prefiltered unit bindings and the exact availability reader in the SAME coherent snapshot. scopeKey echoes the caller's stable normalized filter identity; it is not a page cursor and this module does not implement category, amenity or price filtering. The trusted source must enforce those predicates before enumeration.

Default bound 200 units (configurable 1..1000). Missing source => explicit unavailable; source-incomplete or excess units => incomplete with no partial units and no availability reads. All identity bindings are validated first; duplicate unit IDs, changed offering identity, source errors or cancellation abort the entire search. Every positive and negative observation must remain fresh at completion. A genuine complete empty universe returns verified zero separately from unavailable/incomplete.

One canonical sorted available-unit array is returned for List/Map reuse, with no invented coordinates, no holds and no booking promise. This is still not a property metadata hydrator or client screen integration. No trusted complete runtime enumeration exists in this candidate; no route/source was configured. Production remains unavailable until a verified publication/filter universe and coherent VPS read transaction are wired.

Combined command: node --experimental-strip-types --test discovery/discovery-engine/test/vpsStaySearch.test.mjs discovery/discovery-engine/test/vpsStayAvailability.test.mjs
Latest combined fixtures: 17/17 passed. No full typecheck or live source proof claimed.
