# Flights master-key bridge checkpoint, 2026-11-17

Isolated checkout: codex/discover-visibility-20261112 lineage at fe0a4ce5506295a56db96aa951289efa2fc1393e. Not integrated into active Discovery/Expo or current main.

platformCatalogueRows now advertises canonical travel_tours/flight_hotel_bookings and premium_services/private_jet_charters, with hyphenated Discovery keys. This follows current main category-master.json: scenic/safari source migrations merge into Flight & Hotel Bookings; helicopter/private charters merge into Private Jet Charters. Legacy flights rows are not silently exposed. Source migration and actual deployment are separate prerequisites.

Reviewed input rows retain precedence and identity; append is idempotent by source pair. Cinema is unchanged. No merchant/item identifiers, booking authority, capacities, prices, request workflows or external APIs were changed. A mapped category does not imply bookable seats. Master variants default to itinerary/quote with supplier confirmation; exact NexG-owned capacity requires its own published offering/authority binding.

Focused proof (Node 24.21.0; source execution, no dependency install):
node --experimental-strip-types --test discovery/discovery-engine/test/platformCatalogueRows.test.mjs

Five cases cover canonical mapping, merged-group dedupe/idempotence, reviewed-row precedence, no retired source advertisement/no capability fields, and unaffected cinema/unmapped rows. The mjs fixture is intentionally separate from tsc-emitted test files and must be run explicitly with the command above. Full engine typecheck/integration/device tests were not run; this isolated checkout lacks the compiler dependencies. Before integrating, compare against current master fixtures and run full provider/bridge regressions. Existing read-only source IDs and request/quote default must remain unchanged.
