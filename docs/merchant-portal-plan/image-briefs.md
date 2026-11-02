# Reference-image briefs

Status: illustrative design references. Exactly one image is planned per named screen. These are pictures of proposed interfaces, not an interactive prototype or evidence of completed implementation.

## Generation gate

Generate only after the onboarding/configuration plan, all 128 profiles, future-category authoring, components/integrations, all eight screen specifications and consistency checks exist. Record validation separately from runtime tests. No extra state, mobile or merchant pictures are required.

## Shared composition

Use a single fictional merchant, Savanna Mobility, with primary vehicle-rental activity and separately selected airport transfers. Driver options within rentals do not automatically enable airport transfers; the secondary activity is explicitly part of this demonstration configuration.

The company operates Westlands and a second permitted Nairobi location. This snapshot selects Westlands. NEXG owns bookings and the availability calendar; an external fleet catalogue supplies asset descriptions read-only; accounting receives permitted posted-transaction exports. This is fictional preview data, not an actual connected ERP or verified company.

Desktop reference viewport: approximately 2048 by 1280, landscape. Show only the finished application UI. No browser chrome, device frame, collage, floating explanatory labels or text outside the application. Each screen includes a subtle in-app 'Preview data' label. Use one coherent populated state with applicable controls enabled. Panels, menus and later steps are represented by their meaningful access controls; do not open them all simultaneously.

Shared visual language: ink #141414 sidebar, cream #f6f3ec canvas, white work surfaces, gold #d4a72c selective accent, readable dark text, restrained serif page title and clean sans-serif UI. Use consistent thin icons, real spacing and modest borders. Preserve necessary information with a calm hierarchy and readable density. Avoid ornamental dashboard cards, oversized empty areas and tiny text.

Sidebar order: Home, Work, Offerings, Availability, Business, Money, Promotions, Insights, Settings. Mark the current destination only. Header includes Savanna Mobility, Westlands selector, Help, notifications, owner avatar 'ZM' and preview label. Currency KES; dates use the merchant's Africa/Nairobi timezone. Fictional snapshot is 29 October 2026. No claim of accessibility compliance is inferred from pixels.

## One picture per screen

| File | Main populated content and accessible feature entry points |
| --- | --- |
| 01-work.png | Work heading; All work/Rentals/Airport transfers selector; attention/upcoming/in-progress/history views; search/location/stage/owner filters; queue with rental and transfer references, vehicle/service, due time, stage and next action. A selected rental detail shows collection due, vehicle, customer display name, dates, confirmed allocation, checklist and 'Confirm collection'. Tabs expose Activity, Communication and Related records; row menus/assign/cancel/export remain accessible. |
| 02-offerings.png | Offerings heading; Vehicles/Transfer services views; search and publication/source filters; Add offering/Import. Table shows asset/service, type, explicit rate basis, publication, availability and source. A selected rental's editor shows basics, vehicle attributes, KES-per-day rate, driver option, resource/availability link, applicable terms reference and customer preview. Clear Save draft/Review publication controls. |
| 03-availability.png | Availability heading; Vehicle calendar/Driver schedule/Rules/Exceptions; date range, timezone and branch. Resource timeline for a week with labelled free/reserved/in-use/maintenance intervals, textual legend, date controls and agenda alternative. Selected interval panel shows exact dates, vehicle, reservation reference and permitted actions. Add block/Edit rules/Preview customer availability remain clear. |
| 04-business.png | Business heading; Profile/Activities and setup/Locations/Team/Documents/Customer feedback. Current activities explicitly Rentals and Airport transfers. Show distinct business approval, location publication and intake status. Main profile/setup review shows editable answers and configuration preview; location/resource/readiness links; documents and team summaries with precise status and next actions. Existing obligations remain separate. |
| 05-money.png | Money heading; period/location/currency; precise sample totals and separate settlement status. Transactions/Payouts/Statements/Issues; readable transaction table linked to rental/transfer references. Historical RNT-1039 shows customer charge KES 12,000, recorded fee KES 600, refund KES 0, merchant amount KES 11,400, with settlement state separately labelled. The visible rows are a page of a larger period list. Refund request, issued-document link, statement/export and any beneficiary information remain under demo owner permissions. Sample charges do not set real fee policy. |
| 06-promotions.png | Promotions heading; Active and scheduled/Drafts/History; Create promotion. One Featured placement with confirmed demo status, location, dates, approved cost record and preview; campaign table and permitted edit/end controls. Measured impressions/clicks labelled with period; View report and charges link. Additional campaign types appear only as a labelled availability link, without implying unapproved coupon rules. |
| 07-insights.png | Insights heading; month/location/work-type filters and source coverage; useful rental/transfer metrics with definitions. Utilization chart with denominator description, work-completion trend and offering breakdown table. Tabs for Work/Offerings/Availability/Promotions/authorized financial report; comparison/table/drill-down/export controls. Mark sample data and report period. Avoid unsupported causal claims. |
| 08-settings.png | Settings heading; Account and security/Notifications/Preferences/Connections/API access/Data requests. Connections selected with two function-specific records: external fleet catalogue for read-only asset details, and accounting export for posted transactions. NEXG bookings/calendar authority shown separately. Selected connection has status, last confirmed update, data classes, direction, permission summary, mapping/validation/history, supported refresh/reconnect/disconnect. No secrets or raw environment variable instructions. |

## Inspection and delivery

Inspect each result for screen-only framing, correct current navigation, consistent business context, readable feature labels and one coherent state. Record any legibility limitations. Do not claim active controls actually work in a raster picture. Save project-bound final images under `docs/merchant-portal-plan/images/` and keep their generation prompts and output paths in the image manifest.

If generation fails, report the actual failure. Do not substitute an extra collage or claim an ungenerated image exists.
