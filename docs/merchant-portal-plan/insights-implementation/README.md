# Adaptive Insights and workspace implementation

Implementation: `C:/Users/limta/Desktop/MERCHANT WORKSPACE`.
The planning references in `C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA` remain design evidence; that older app is not the implementation target.

## Open locally

- Sample Insights: http://127.0.0.1:3141/merchant-live-preview/insights
- Settings: http://127.0.0.1:3141/merchant-live-preview/settings
- Authenticated Insights: `/merchant/insights`
- Legacy `/merchant/analytics` redirects to Insights with valid reporting dates and tab preserved.

Run the web app with `NEXG_NEXT_DIST_DIR=.next-insights-preview` and port3141. Sample routes are development previews.

## Delivered behavior

The restaurant view has eight peers: Overview, Orders, Menu, Customers, Operations, Promotions, Finance and Reports. Reports supports a searchable library, detailed evidence, exact metric contributors, saved view configuration and CSV downloads. Scope includes Nairobi calendar dates, location, activity and record search. Comparisons use a matched prior period. Browser history restores scope.

The adaptive registry uses128 booking profiles and15 operational models. Preview profiles expose only configured model samples. The real merchant source uses actual configured offerings and permitted evidence, rather than enabling every category candidate. Missing capability evidence remains unavailable.

Shared Home, Work, Offerings, Availability, Business, Money, Promotions, Insights and Settings use a consistent shell, section search, mobile navigation, type and spacing. Existing operational handlers and local draft semantics remain intact. Settings includes local account/preferences/notification choices and read-only connection details; saving a preference does not claim to change a remote service.

## Source boundary

The server adapter authenticates with the normal Supabase session, checks merchant membership and owner access, restricts locations, and returns a private no-store response. It performs no mutations and uses no service-role key. Dates are bounded, inclusive in Africa/Nairobi, and include the matched comparison period. A bounded source query marks truncation partial.

Existing ORDER records back order counts, actual lifecycle events, historical item sales and ready-promise evidence. A completed event can remain completed after a later refund. Item sales use recorded item subtotal, not the order total including other charges. Kitchen preparation duration remains unavailable without a real start event.

Customer identity, financial postings, campaign attribution, declared capacity and other operational-model sources are not fabricated. Their live reports remain unavailable until those source contracts are connected. Synthetic previews exercise those frontend states and are visibly labeled. No configured live merchant session or database integration was available during local verification.

## Reproducible verification

User testing rule: keep passing results. Repeat a check only after changing the part it covers. Final layout confirmation is limited to the changed phone Insights controls/cards and Availability shell styles; unchanged report and source checks retain their earlier passing evidence.

- `scripts/smoke-insights-workspace.cjs`: functional browser journeys, filter/report/export parity, saved views, adaptive profiles, source states, keyboard and phone widths; results in `functional-verification.json`.
- `scripts/capture-insights-workspace.cjs`: bounded desktop/phone capture batch across Insights and existing workspaces; results in `visual/`.
- `apps/web/components/merchant/insights/model.test.ts`: reporting definitions, scope, contributors, privacy and CSV behavior.
- `apps/web/lib/merchant-insights.test.ts`: authenticated source adapter with controlled source fixtures.

Screenshots and sample tests prove the frontend behavior; they do not certify a live financial ledger, production authorization policy or full accessibility conformance.
