# Insights across the merchant journey

Date: 1 November 2026. Status: proposed design, with synthetic examples for review. Merchant-facing workspace. An owner with permission can inspect their permitted locations; this is not a marketplace administrator's cross-merchant directory.

## Outcome and users

A merchant should be able to answer: What happened? Where did the process change? Which offering, location or resource contributed? Is the evidence complete? Which records explain the result? What useful action can I take in the owning screen?

An owner sees their authorized business scope. A location manager sees permitted locations and operational reports. An operator sees explicitly granted work reports. A finance user sees authorized posted financial activity. These are design personas, not new role grants. Permissions are capabilities checked by the reporting server for every read, drill-down and export.

The mobile owner needs a legible summary and an immediate explanation. A desktop manager needs comparisons, offering breakdowns and records. New merchants need setup and history guidance. Established mixed businesses need separate measures for each operation, with consistent shared filters.

## Evidence and source selection

The 21-category, 128-subcategory baseline comes from the reconciled profiles. The offering catalogue adds 21 explicitly approved specialty/template/model routes. The [coverage matrix](coverage.md) retains the baseline and additions separately. Use the effective reconciliation once; do not run superseded historical rules alongside it.

The current `/merchant/analytics` page supports a limited delivered-order report. It does not establish the adaptive report engine, historical funnels, usable capacity, campaign attribution, customer identity stitching or generalized merchant sales. A runtime support audit and the implementation gates appear in [validation-plan.md](validation-plan.md).

Facts in the source, proposed interactions and synthetic examples remain distinguishable. No diagram or screenshot proves that a source exists. A proposed logical reporting event name is an adapter contract to define, not a new operational state transition.

## One adaptive screen

Keep the shared shell: Home, Work, Offerings, Availability, Business, Money, Promotions, Insights, Settings. Insights alone is selected. Use the existing black sidebar, cream canvas, white panels and restrained gold emphasis. The header shows merchant, permitted location context, notifications and Help. Concept scenes carry a small `Sample preview` label.

The page header contains `Insights`, the merchant name and `Export report` when authorized. Below it are `Period`, `Compare`, `Activity` and `Filters`. Period includes timezone and date basis. Location stays in the workspace header; do not duplicate it in another permanent selector. A single permitted location is text. The filter summary remains visible through detail and Back navigation.

The report navigation has `Overview` and `Reports`. Overview contains only the merchant's most useful supported measures, a trend, evidence-backed observations and relevant offering/location breakdowns. Reports opens a report selector grouped by Work, Offerings, Capacity, Customers and feedback, Promotions and Financial activity. Only applicable groups appear. This avoids a long row of empty category tabs. Report and view are preserved in the address state so Back restores the context.

The `Activity` selector is All enabled activities or one actual enabled model, with familiar labels such as Products, Appointments, Rentals and Shipments. It is distinct from the Reports selector, which selects the question. `All enabled activities` shows separate activity sections. Do not add products, booked hours, tonnes and pass redemptions into a headline total. A merchant may pin a small permitted set of reports; configuration cannot expose unavailable data.

Show a compact status such as `Updated 1 Nov, 08:00 EAT · Coverage details`. Affected charts carry their own partial/stale notice. Do not use a green whole-business health badge when only one source is current. Source health and exact last successful ingestion are available through Coverage details.

## The complete journey

| Journey question | Evidence and report | Useful next destination |
| --- | --- | --- |
| Is the offering ready and public? | Owner-confirmed setup, document, publication and intake states. Answers, approval, publication and operational readiness are distinct facts; historic readiness trends require recorded state changes. | Business setup, Offering publication or the specific missing prerequisite. |
| Are people discovering my offerings? | Qualified impressions, offering opens and enquiry starts only if these events exist and their counting rules are defined. Separate events, sessions and people. | Published offering or Promotions report. |
| Are enquiries progressing? | Cohort of requests, response time, quote status and acceptance within a fixed observation window. Distinguish still-open cases. | Matching Work requests or quotes. |
| What was accepted? | Source-confirmed orders, bookings, jobs, places, quote decisions or entitlements, retaining each model's units. | Work list filtered by actual model and acceptance basis. |
| Was work fulfilled? | Model-specific completion, handover, attendance, return, delivery or redemption evidence and exceptions. | Exact records and owner-screen actions. |
| How did capacity perform? | Usable hours, asset intervals, spaces, places or storage quantities with compatible numerator and denominator. | Availability with the same resource/date scope. |
| Which offerings contributed? | Actual item, variant, accepted specification version, location and operational model; compatible unit groups only. | Offering detail and matching work. |
| Do customers return and give feedback? | Approved merchant-scoped identity and published feedback evidence; explicit privacy and sample rules. | Authorized review list or safe aggregate. |
| What did promotions record? | Source-confirmed delivery, qualified actions and attributed outcomes with model, window and coverage. | Selected campaign, preserved period and separate Money permission. |
| What was recorded financially? | Posted merchant credits, refund debits and fee debits from an approved Money view, currency and posting basis. | Exact statement postings. |
| What needs investigation? | An explainable observation with its evidence, exclusions and deterministic rule version. | Affected records, source repair or owner-screen configuration. |

The journey is end to end in the design. Unsupported stages have a named unavailable state. There is no fabricated discovery funnel when instrumentation starts at an accepted order, and no claim that a missing booking proves lost demand.

## Model-specific report composition

| Model | Default report question | Required distinctions |
| --- | --- | --- |
| ORDER | Which confirmed orders and item variants were fulfilled? | Orders versus units; portions/modifiers, picked/delivered outcomes, partial fulfilment and refunds; accepted price/specification versions. |
| APPOINTMENT | How do requests, appointments and usable provider time compare? | Request cohort versus scheduled-date workload; completed/cancelled/no-show/open; administrative data only for health services. |
| FIELD_VISIT | Did visits arrive within the accepted arrival window? | Travel versus on-site time, exact visit duration, rescheduled windows and incomplete visits. Completion timing requires a separately recorded commitment. |
| ASSET_INTERVAL | How much usable asset time was reserved or actually used? | Separate reserved and actual-use hours; maintenance exclusions, extensions, late returns and overlap unions. |
| TRANSFER | Were agreed transfers completed on time? | Route, departure/pickup basis, party versus vehicle counts, waiting/greeting scope and unknown milestones. |
| SESSION_CAPACITY | How did each dated session use its places? | Booked places versus attendance versus usable capacity; shared capacity and ticket tiers. |
| SPACE_RESERVATION | How were tables or event spaces reserved? | Reservation intervals, space-hours and turnover/maintenance exclusions; covers and seats are different units. |
| TOUR | Which departures were confirmed and operated? | Provider confirmation, departure/party/place units and cancellation ownership; enquiry is not a confirmed supplier booking. |
| PRODUCTION_DUE | Were accepted production jobs completed by the agreed due time? | Quote acceptance versus production acceptance, due-date revisions, partial accepted output and material evidence. |
| REQUEST_QUOTE | How do requests progress to an accepted quote? | Request-to-accepted-quote rate uses a request cohort; quote-decision acceptance uses a separately defined quote-issued cohort. Response, revision, decision window and still-open requests remain explicit; enquiry-only provider routes remain enquiry-only. |
| LINKED_WINDOWS | Were collection and return promises both met? | Linked identity and paired windows, quantities after assessment, missing custody events and incomplete cycles. |
| SERVICE_JOB | Which accepted jobs finished and why did others wait? | Diagnosis/assessment, approval, started/completed and rework; do not infer start from creation time. |
| ENTITLEMENT | How were issued rights used during validity? | Issuance/enrolment versus redemptions, distinct pass versus use count, balance, expiry and recurring consent. |
| FREIGHT | Which accepted shipments reached their recorded milestones? | Consignment/piece/mass/volume units, custody, route, promise version and unknown milestones; no invented scan. |
| STORAGE | How was usable storage capacity occupied? | Area, volume, pallet positions or units separately; custody versus reservation, time-weighted intervals and quantity changes. |

The selected actual offering/model determines applicability. A clothing merchant's alteration service can use a service or production report alongside product orders. A gym can have appointment, session and entitlement reports. A restaurant can have table reservations, product orders and a separately enabled catering quote route. Coverage means these combinations are specified, not that every combination is enabled.

## Overview and observations

Show up to four initial measures selected by the merchant's configured primary activity and evidence. Keep units in every card. Use a short definition link and comparable-period label. Zero is displayed only after a successful complete query confirms zero records. Use `Unavailable`, `No history yet`, `Partial` or `Not enough evidence` with a specific explanation for other states.

The mixed example has product orders and appointment activity in separate panels. Its shared financial report is permitted only because the synthetic actor has finance access. No blended conversion rate is created across the two funnels.

An observation says, for example, `18 of 60 cancellations have no recorded reason` with `View 18 records`. It states its calculation and period. It must not say `Customers dislike your price` without evidence. Lower activity is not inherently poor performance, and a note beside a trend is not a verified cause. Merchant notes are labelled notes.

Optional suggestions use source-confirmed evidence, an explainable rule and the applicable owner-screen destination. They do not automatically change stock, schedule, price, promotion, staffing or accepted work. Priority follows a declared severity rule; unknown business impact is not a currency estimate.

## Periods, cohorts and comparisons

Default to the last completed 28 local days, with the exact range shown. On 1 November 2026 this concept selects 4–31 October, Africa/Nairobi. The immediately preceding non-overlapping 28 days are 6 September–3 October. Today or an open current period requires an explicit partial-period label and a matched elapsed comparison if supported.

Presets include Yesterday, Last 7 completed days, Last 28 completed days, Last calendar month and Custom. Custom validation rejects reversed dates and unsupported source coverage. Calendar weeks, months, business days and rolling windows are named explicitly. Date-only commitments and session dates preserve their owner-defined local-day meaning; instants are displayed in the merchant timezone.

Each report shows its date basis: created in period, accepted in period, scheduled in period, completed in period, due in period, occupied interval, or posted in period. Do not place unrelated bases into a single conversion funnel. A request cohort follows the same request identities through a declared cutoff/window; open cases remain open. Period event counts may coexist as separately labelled workload measures.

A comparison requires the same definition version, complete or compatible coverage, compatible units/currency and a valid denominator. Show percentage points for rate differences. If the prior value is zero, show the two counts without an infinite growth claim. If definitions changed, show separate versions without a percentage comparison. Small-sample display follows an approved privacy/statistical policy; until defined, suppress the dependent breakdown or trend claim rather than inventing a threshold.

## Charts, breakdowns and record evidence

Every chart has a question, period, unit, legend and Table view. Use bars for counts and comparable groups, lines for time series and interval views for resource occupancy. No decorative gauge, unexplained score or misleading truncated bar axis. Ratios state numerator and denominator nearby. Gold identifies a selected series; labels and patterns distinguish series without colour alone.

Offering breakdowns retain offering ID, variant/options, accepted specification revision, location and model. Changed names can show the accepted label with current-name context where permitted. Mixed units use separate sections; incompatible values cannot be sorted as one quantity. Missing variant/reason/provider is an explicit Unknown group, and its coverage effect is stated.

Selecting a measure opens its report with the same merchant, location, model, dates, date basis, timezone and definition version. `Definition` opens a panel. `View records` opens authorized contributing records, with numerator/denominator selection where applicable. The server resolves the exact query, not a client-supplied arbitrary filter. A row opens Work, Offering, Availability, Promotions or Money under fresh authorization. Back restores the report and scroll context.

Capacity records include interval boundaries, usable capacity, included reservations/usage and exclusions. Use unions of overlapping intervals per resource; clip to reporting boundaries; do not count the same shared resource once per offering. Separate proposed capacity, confirmed blocks, maintenance and actual usage. An absent denominator blocks utilization, even when booking counts are available.

The metric detail scene uses reserved asset-hours: 1,240 divided by 2,000 usable hours equals 62%. Its table summarizes four resource groups. The 2,240 scheduled hours minus 240 excluded hours equals the denominator. Actual usage is a separate metric. The records are interval evidence, not 42 completed-rental records re-labelled as capacity.

## Promotions and financial activity

Promotion delivery is separate from attributed transactions. Show the actual attribution model/version, qualified event, observation window, timezone and coverage. Exclude duplicate events and explain cross-campaign deduplication. `Attributed` is descriptive and does not claim causality or incremental lift. Without an attribution contract, delivery events can still be reported while outcomes say Unavailable. Promotion-view counts are not unique customers unless the identity and privacy contract supports that measure.

The promotion scene uses synthetic complete attribution evidence: 12,000 qualified impressions, 600 qualified taps and 36 attributed accepted orders. The 5% rate is taps divided by impressions, explicitly an event ratio. The 6% rate is attributed accepted orders divided by those qualified taps within the same eligible cohort. The fixture uses the existing configurable 30-minute tap window, observed through 1 November at 00:30 EAT for the 4–31 October tap cohort. A closed observation window is required. This is synthetic future instrumentation, not a claim that current event ingestion works. Campaign transaction date and actual service/use date remain separate. Charges open Money and retain independent permission checks. Attributed value is Unavailable. No ROAS or uplift is inferred.

Financial activity uses one authoritative statement-compatible source and its definitions. The concept scene has KES 480,000 posted merchant credits, KES 12,000 refund debits and KES 23,400 recorded fee debits. Net posted credit is KES 444,600. These are fictional ledger postings, not a proposed fee policy or an earnings/payout promise. Pending activity, holds, payouts and other currencies remain separate. Unknown amount is never coerced to zero. Posted-period activity is not order-created-period sales.

Do not reuse the current delivered-order `total_cents` sum as merchant recognized sales. The runtime charge envelope can contain delivery/service fees and tips. Report definitions and Money reconciliation must settle ownership and classification before financial implementation.

## Save, export and source recovery

`Save view` saves only report definition, filter choices, comparison and personal visibility. Sharing is available only with a real permission contract; opening a saved view always rechecks current permissions and definitions. Removed capabilities or stale definitions require an explicit review. No stored export is used to bypass access removal.

`Export report` previews scope, format, report/metric versions, date basis, timezone, units, currency, coverage and privacy suppression. Confirm starts one authorized generation request. Show Queued, Preparing, Ready with expiry, Failed or Outcome unknown. An unknown outcome is reconciled by operation ID before retry. Exports inherit field and row restrictions. Export is a proposal until a reporting owner implements it.

Scheduled delivery is deferred because there is no confirmed reporting/notification subscription owner. Do not put an active Schedule button in the concept. A future feature needs explicit recipients, supported channel, visibility, consent, delivery status and revocation behavior.

Coverage details lists source, exact interval coverage, freshness, mapping failures, affected reports and last success. `Open connection` goes to Settings with context when permitted. `Retry` refreshes a scoped read. It does not replay a business mutation or silently recalculate approved Money postings. A source correction produces a traceable report revision with definition/source versions and an updated-as-of time.

## States and responsive behavior

Inherit R01–R12 and applicable A01–A10 from the shared contract. The following requirements make the report-specific behavior reviewable.

| State | Visible behavior and recovery |
| --- | --- |
| First use | Explain which confirmed events start the selected report. Show applicable setup link, no synthetic chart. |
| Filtered empty | Keep filter chips and Clear filters; report successfully confirmed zero matching records. |
| Not applicable | Omit the irrelevant report; Business explains enabled activities. |
| Missing source | Report says which source is absent and what remains available. |
| Insufficient history | Show available dates and omit invalid comparison. |
| Missing denominator | Show supported counts; utilization is Unavailable with a capacity setup link. |
| Partial/stale | Timestamp and incomplete interval beside affected series; prevent unsupported percentage change. |
| Failed read/offline | Retain policy-permitted last-confirmed data with timestamp and Retry. Never present it as current. |
| Permission removed | Stop reads, clear inaccessible cached data and revoke dependent export access. |
| Privacy suppressed | Name the restricted aggregate and safe alternative; prevent reconstruction through filters/exports. |
| Definition changed | Show revision and preserve separately versioned historical meaning. |
| Generation unknown | Keep operation reference and check status before retrying. |
| Expired session | Reauthenticate, recheck scope and restore only permitted report state. |

Desktop uses a calm header, filters, compact metric strip and report workspace. Details use a readable panel without obscuring essential scope. Mobile places the period and activity above two-column or stacked measures, then one report at a time. Reports and filters open labelled sheets; metric/record details use full pages. All navigation destinations remain in the menu. Avoid tiny desktop tables squeezed into a phone.

The mobile scene shows a partial appointment source through 30 October, while the selected period ends 31 October. It disables comparison, marks the count partial and retains complete capacity evidence separately. `Review coverage` is the useful next action. It does not turn a missing day's data into zero.

Charts expose the same values in a semantic table. Keyboard order follows reading order; legends, points and menus have accessible names; focus returns to the initiating control. Announce loading, error and generation state without repeatedly reading the whole report. Provide visible focus, 44 CSS-pixel primary touch targets, text labels and reduced-motion behavior. These are implementation targets, not a claim of tested accessibility compliance.

## End-to-end review journeys

1. A mixed owner opens Overview, selects Products, inspects variant performance, opens a count, reviews matching Work records and returns with the filters intact. Switching to Appointments changes units, date basis and report choices.
2. A rental manager selects utilization, inspects usable-hours exclusions, opens included reservation intervals and then the same Availability interval. The report does not change the calendar.
3. A quote/production business reviews a closed request cohort, distinguishes accepted quotes from accepted production jobs, then examines due-date performance using the accepted due-time version. Open requests are not failures.
4. A freight operator examines a late milestone, sees Unknown separately, opens the shipment and its recorded custody evidence, and follows an authorized Work action. No scan is manufactured.
5. A session business compares booked places with attendance for a dated occurrence, then selects the distinct entitlement report to inspect valid passes and redemptions. A pass sale is not attendance.
6. A promotion owner reads the attribution model and cohort window, reviews contributing accepted orders, then opens campaign context. A finance user separately reconciles posted credit/debit records in Money.
7. A manager with incomplete data opens Coverage details, repairs the allowed connection in Settings, refreshes the report and sees a new report revision. A removed permission blocks saved links and exports.
8. A new category references compatible registered report families. Publication validates metric IDs, units, source adapters, evidence gates and privacy. An unsupported new operation requires a capability extension before a report can appear.

The [validation plan](validation-plan.md) defines review tasks, source reconciliation and implementation sequencing. The [image gallery](images.md) records which populated states were actually pictured and their visual limitations.
