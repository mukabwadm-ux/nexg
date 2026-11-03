# Proposed navigation review scenarios

Status: PROPOSED_FOR_REVIEW. These are review and future runtime acceptance tasks. No interaction or reporting runtime has been tested by writing this file.

## Tasks to assess the proposed experience

| Scenario | Task | Acceptance evidence |
| --- | --- | --- |
| Restaurant | Find fulfilled orders, explain a menu item's units, then open the full report. | Orders and Menu are recognizable. Reports is a peer. Matching scope/metric values survive the journey. |
| Beauty plus retail | Compare appointment workload and product outcomes. | Appointments and Products displayed as Retail coexist. One customer/finance/report area is shared; quantities remain distinct. |
| Activity/tab conflict | With Appointments selected, open Orders and then return. | Activity visibly changes to the compatible actual product scope, period/location stay intact, incompatible provider filters are not applied, and Back restores the prior appointment context. No permission scope broadens. |
| Rental plus transfer | Inspect rental asset-hours and transfer punctuality. | Rentals, Transfers and Fleet retain distinct evidence. Pure rental capacity is not duplicated into a second identical peer. |
| Session plus tour | Select Bookings, then switch the exact model segment. | Sessions and Tours retain their own occurrence/departure, place and supplier meanings; no universal booking funnel. |
| Quote plus production | Follow requests with accepted quotes, then separately inspect production due work. | Request and quote-issued denominators are named. Production acceptance and due dates are independent. |
| Freight or storage | Inspect a promised milestone or time-weighted compatible capacity. | Unknown evidence stays unknown. Shipment/piece/mass/storage units are not added. |
| Pass business | Inspect issuance, redemptions and associated attendance evidence. | A pass sale is not attendance. Prior-period issued rights can have current-period redemptions. |
| Finance-limited actor | Try a financial tab, saved view, altered deep link and export. | No inaccessible values, evidence, titles or generated fields leak through any entry. |
| Missing source | Open an applicable tab with a disconnected or partial feed. | Tab remains understandable; unavailable/partial/no-history are distinct from a successful zero. Unrelated supported panels remain available. |
| Report equality | Open the same metric from Overview, a domain and Reports. | Canonical ID, version, value, date basis, coverage and contributing evidence agree. |
| Back navigation | Open report, source record and return. | Original view, scope, filters and permitted scroll context restore. |
| Saved view | Load a view after capability, permission or definition changes. | Revalidation happens before any read/export. The user sees the specific invalidated filter/definition. |
| Export | Export Overview, a domain view and a selected report. | Each previews its actual scope; generated output matches approved fields, coverage and definition versions. Unknown outcomes reconcile before retry. |
| Overflow and mobile | Use a merchant with many actual activities at wide and narrow widths. | Overview and Reports remain discoverable. More/area selector includes every admitted peer and communicates the active one. No tiny forced labels. |
| Accessibility | Navigate links/tabs, menus, chart table alternatives, errors and Back by keyboard and assistive technology. | Correct semantics, reading order, focus return and meaningful status announcements are tested on the working UI. |
| Accommodation reference | Select the attachment's lodging example during review. | It is clearly outside the current admitted baseline. Adding it requires its own offering/workflow/capacity/source decisions. |

## Static proposal checks

Compare the new [structured matrix](merchant-tab-matrix.json) with the current [coverage snapshot](../coverage.json), effective profiles and prior source additions. Check all 128 identities, the 193 preserved baseline model bindings, exact guard/rule/workflow/intake references, 21 separate additional source tuples, fifteen model rules, unique stable peer keys and Overview/Reports positions. New rows must remain PROPOSED_FOR_REVIEW and runtimeEnabled must remain false.

Check source-file hashes, both unchanged image references and every local document link. Where the proposal names an existing metric, verify its stable ID against the existing [registry](../metric-registry.json). A passed structural check proves planning consistency only. It does not establish tab visibility for a real actor or correctly calculated live data.

## Decisions for review

Review the peer-tab structure, the Reports Library/Saved views/Exports organization, terminology for mixed businesses, the initial visible versus overflow presentation, and the accommodation scope. These are review topics with proposed defaults in the main plan. They are not recorded approvals.
