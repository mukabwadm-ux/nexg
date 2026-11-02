# NEXG Availability — frontend plan

Status: design specification, 31 October 2026. No application implementation or live integration is included in this package.

The merchant uses Availability to answer: **What can customers arrange, when, at which location, and against which real capacity?** The screen adapts to the selected activity and fulfilment method. One shared workspace produces different sensible views; it does not require 128 separately built portals.

## Scope and reading order

The latest user instruction governs this package: **frontend end to end; onboarding last**. Buildable scope means layouts, populated sample data, forms, navigation, local state, simulated source responses, validation, responsive behaviour and recovery. Existing category definitions are read-only display inputs. This package does not redesign onboarding, alter its questions or implement its persistence.

1. This document: ownership, information architecture and all AV01–AV24 features.
2. [Interactions and states](interactions-and-states.md): forms, journeys and failure recovery.
3. [Frontend implementation and acceptance](frontend-and-acceptance.md): components, local source boundary and verification gates.
4. [All 128 subcategories](profiles-128.md), [machine-readable matrix](profiles-128.json) and [view catalogue](view-catalogue.json): each category's default suggestion, conditional candidates, specialty needs and existing rule references.
5. [Three concept briefs and prompts](concept-prompts.md): exact screen content, frozen before image generation.
6. [Final concept images](images/README.md) and [image review](image-manifest.json).
7. [Source manifest](source-manifest.json): inputs and hashes; [verification](verification.json): structural checks, not runtime acceptance.

The three generated images demonstrate visual direction and information hierarchy. They cannot prove functioning controls, accessibility, booking correctness or backend integration. Those require the future frontend acceptance work.

## Current evidence and reconciled decisions

The current shell is MerchantLivePreviewShell, with Home, Work, Offerings, Availability, Business, Money, Promotions, Insights and Settings. Current Work and Offerings previews use local/sample sources. Availability still points at the legacy Hours screen, whose food-specific meal periods and Supabase access must not be copied into this frontend.

The existing registry contains **128 subcategories, 21 parent categories, 15 booking primitives and 193 candidate model bindings**. The Offerings frontend has **18 editor schemas**. Work's 18 workflow views are a separate namespace. Fifty-eight profiles default to ORDER and nineteen to REQUEST_QUOTE; a blank appointment calendar would misrepresent most default profiles.

The later [confirmation correction](../order-confirmation.md) governs the design: ordinary source-confirmed work advances automatically once its actual requirements pass. A named, enabled, applicable exception can require human judgment. Checking, pending, unknown, unavailable and stale source data must never become a generic merchant “Accept/Decline” queue.

This frontend will simulate that policy explicitly. The existing booking engine is not fully aligned with every later confirmation rule. Connecting it is outside this package; a polished frontend must not imply that gap is already resolved.

This package carries forward AV01–AV24 from [the earlier Availability plan](../screens/03-availability.md). Its older discovery-update journeys are superseded **for this frontend scope**: changes update only the local preview and its internal sample results. No discovery, customer app, website, Home production summary or external system is mutated.

## Ownership: where each task belongs

| Destination | Owns | Availability can show |
| --- | --- | --- |
| Availability | Hours, future schedules, dated exceptions, applicable intake pauses, resource-time rules and capacity displays | Draft/edit permitted preview rules; inspect commitments and their constraints |
| Offerings | Listing identity, description, media, publication, prices, reservation-fee/deposit terms, service definition and resource links | Read their current versions; deep-link to the correct editor |
| Work | A specific order, booking, quote, job, handover, return, reassignment, reschedule or operational exception | Read a compact commitment summary and open the same record in Work |
| Business | Locations, resource identities, staff identity, verified qualifications and service coverage | Read/choose existing permitted resources; link to identity or coverage edits |
| Money | Payment collection, evidence, refund, settlement and payout actions | Explain a required fee's current sample status and link to Work/Money |
| Settings | Connection configuration and account/permission administration | Show ownership/freshness; simulated connection details only |

Service duration, buffers or booking horizon that already belong to an Offering remain defined there. The Rules tab shows them with provenance. “Edit in Offerings” preserves return context. Resource-wide shift/absence rules can be edited in Availability when locally managed. This avoids two contradictory editors for the same field.

## Independent facts the screen must preserve

A location's opening hours, new-work intake, offering publication, stock availability, resource capacity, physical custody, source freshness and payment prerequisites are separate facts.

Examples:
- Doors closed now can coexist with permitted future booking intake.
- Pausing collection does not pause delivery unless explicitly selected.
- A published product is not proof of stock; stock remains inventory-owned.
- A staff member free at 10:00 cannot make a joint appointment available if its required room is occupied.
- A rental's planned end does not prove actual return; overdue custody continues to block release.
- Paid reservation fees do not prove a resource is reserved.
- A Google event alone cannot confirm operational capacity.
- Membership credits are not session places.
- An empty cell can mean unknown data, not free capacity.

Effective display precedence is explicit: resolve the selected activity/method and applicable scope; apply its current effective rule revisions and dated exceptions; intersect every required resource/eligibility constraint; retain existing valid commitments/holds; then display the current simulated source result. Unknown required inputs remain unresolved. No guessed default order/appointment fallback is allowed.

## Shared screen structure

### Shell and header

Match the supplied Home screenshot: charcoal #141414 sidebar, gold #d4a72c NEXG wordmark and primary actions, cream #f6f3ec canvas, white bordered surfaces, Manrope-style sans-serif and restrained semantic tints. Availability has the active navigation treatment. No new visual language or serif heading.

Keep Merchant workspace, Sample preview, Choose sample state, location scope, notifications, Help and account in the common header. Use the existing sample-panel convention. New Availability controls must not change Work/Offerings state accidentally.

The page begins with:
- **Availability** and a context-specific sentence.
- Activity/offering selector using actual configured vocabulary.
- Location scope; one selected location for ordinary edits.
- Relevant source state and “As of … EAT” text, with refresh.
- One primary contextual action: Edit hours, Add time block, Add occurrence or Add exception.

“All locations” is a read aggregation. A bulk edit is a separate action with explicitly selected compatible target locations/resources, before/after results and per-target outcomes. An edit must never inherit ambiguous scope from a global header.

### Summary and tabs

Use a compact labelled status strip only for relevant facts. Do not add a second analytics dashboard. A rental might show actual custody and source warnings; an order activity might show location hours, delivery intake and collection intake.

Stable destinations:
- **Schedule:** the appropriate renderer, date navigation and list/agenda alternative.
- **Rules:** effective intervals, eligibility, booking restrictions and their inherited/overridden/source provenance.
- **Resources:** only when that activity actually uses resources; list eligibility, schedule ownership and blockers.
- **Exceptions:** dated changes, breaks/absence, pauses and maintenance applicable to this scope.

History, copy/export and source details are secondary actions. Critical conflicts, unknown capacity and pending changes remain visible beside the affected content. Unused tabs are omitted with a stable reason available in the sample inspection panel; never present a nonfunctional empty resource calendar.

A right-hand inspector shows one selected reservation, rule or exception. Wide screens keep its context visible. At narrow widths it becomes a full-page sheet with a clear Back action and preserved scroll/date selection. Avoid opening one drawer over another.

### Schedule rendering by actual activity

| Primitive | Main view and necessary context | Must not imply |
| --- | --- | --- |
| ORDER | Weekly operating/intake intervals; enabled collection/delivery windows; stock/source status as read-only context | Inventory editing, appointment slots or blanket merchant acceptance |
| APPOINTMENT | Day/week staff and required room/equipment lanes; agenda; exact duration, buffers, notice and horizon | Every employee is eligible; remote sessions need a physical room or travel |
| FIELD_VISIT | Team/visit agenda; actual travel/setup windows, address/coverage and relevant vehicle constraints | Service-area coverage guarantees a free team or emergency arrival |
| ASSET_INTERVAL | Identified asset timeline, handover/return windows, turnaround, maintenance and actual custody | A listing is an individual asset; planned return frees an overdue asset |
| TRANSFER | Trip/greeter agenda, passenger/luggage fit and required driver/vehicle allocation | Meet-and-greet always includes transport; airline seats are controlled here |
| SESSION_CAPACITY | Published dated occurrences, participant units, held/reserved/remaining and shared staff/room anchor | Blank weekly cells are published sessions; booking count equals place count |
| SPACE_RESERVATION | Tables/spaces, party fit, allowed combinations, exclusive/shared modes, dining duration and turnover | Restaurant orders automatically enable tables |
| TOUR | Dated shared departures or private/multi-day itinerary resource roles and supplier states | Shared places and exclusive private resources have identical rules |
| PRODUCTION_DUE | Workload and due-date schedule, typed production units, cutoff, lead time and working days | A due promise is a customer appointment |
| REQUEST_QUOTE | Intake/response hours, responder coverage and tentative milestones | An enquiry reserves resources or grants regulated approval |
| LINKED_WINDOWS | Incoming → processing → outgoing roles, exact windows, turnaround and feasibility | Customer drop-off/collection creates transport; incoming assessment guarantees all later roles |
| SERVICE_JOB | Queue, scheduled intake or actual bay/team work lanes, separately labelled completion estimate and custody | Queue position is a fixed appointment or estimated completion reserves a bay |
| ENTITLEMENT | Access-hours and validity/credits context, actual child-booking links | A membership purchase itself reserves a class/trainer |
| FREIGHT | Cargo leg/loading schedule, carrier/source state and separate kg/cbm/pallet/container capacities | Transit estimates confirm a carrier leg; unlike units can be totalled |
| STORAGE | Occupancy quantity and period, actual release, separate access/handling appointments and explicit unit conversion | Floor area, volume and handling time are interchangeable |

The view catalogue specifies the required fields, blockers, units and shared components for every primitive. The category matrix carries each specialty's existing needs; for example car wash queue/bay, laundry drop-off/collection, photography studio/customer location and private/group training remain different branches of shared components.

### How 128 profiles and future categories adapt

Resolve a view from **selected offering + editor schema + actual workflow + selected method + required resources + location + source ownership + policy revision**. Category name alone is insufficient. Default and candidate models are suggestions until that specific activity is configured.

The bridge is explicit:
- PRODUCT_CATALOG_V1 → ORDER.
- SERVICE_APPOINTMENT_V1 and REMOTE_SESSION_V1 → APPOINTMENT, with their own variant constraints.
- FIELD_SERVICE_V1 → FIELD_VISIT.
- RENTAL_ASSET_V1 → ASSET_INTERVAL.
- TRANSFER_ROUTE_V1 → TRANSFER.
- EVENT_TICKET_V1 and GROUP_SESSION_V1 → SESSION_CAPACITY.
- SPACE_RESERVATION_V1 → SPACE_RESERVATION.
- TOUR_PACKAGE_V1 → TOUR.
- MADE_TO_ORDER_V1 → PRODUCTION_DUE.
- REQUEST_QUOTE_V1 and REGULATED_ENQUIRY_V1 → REQUEST_QUOTE.
- PICKUP_RETURN_V1 → LINKED_WINDOWS.
- MEMBERSHIP_PLAN_V1 → ENTITLEMENT.
- FREIGHT_SHIPMENT_V1 → FREIGHT.
- STORAGE_SPACE_V1 → STORAGE.
- SERVICE_JOB_V1 → SERVICE_JOB, with actual field-work variants resolved explicitly.

A hybrid merchant gets a named activity switcher, not the union of every possible form. Preserve each activity's selected date/filter and draft scope. Shared resources still constrain other activities; filtering them out must not remove their blocking effect. Multiple merchants/profiles never share preview storage accidentally.

A later new category supplies a versioned descriptor: stable category/subcategory ID, display vocabulary, referenced registered editor/workflow/model, permitted variants, field provenance, unit definitions and sample fixtures. An existing primitive reuses the same renderer. A new operational primitive requires a typed renderer/validator and acceptance scenarios before activation. Unsupported or contradictory descriptors show “Availability setup unresolved” with exact missing references; never guess.

The sample selector can exercise these descriptors now. **The onboarding UI, new questions, onboarding flow, category-admin UI and their eventual connection are deferred until last.** Nothing here claims the existing in-memory category registration is durable self-service administration.

## Complete feature inventory

All preview mutations below are local. “Apply” means **Apply in preview**, followed by an explicit local result.

| ID | Feature | Controls, result and safeguards |
| --- | --- | --- |
| AV01 | Activity, location and model context | Search configured offerings/activities; display selected schema/workflow in sample details; permitted location selector; incompatible/unconfigured selections explain the missing input. Preserve return context. |
| AV02 | Date and view navigation | Today, previous/next, labelled date picker, day/week/range where useful, agenda/list and timezone EAT. Changing view never edits data. “Today” uses the controlled demo clock in sample mode. |
| AV03 | Operating intervals | Edit open/closed/unspecified days; add/remove multiple intervals; explicit next-day end for overnight; optional 24-hour mode only if supported. Validate overlaps, zero length and next-day collisions. |
| AV04 | Templates and inheritance | Select a compatible template, choose target/effective date, compare before/after and keep local overrides by default. Show inherited source. Reset override is a new preview change, not silent deletion. |
| AV05 | Dated exceptions | Date/range, all-day or interval, affected activity/resources, reason, recurrence end if supported; show exact affected work before Apply. No automatic public-holiday closure without explicit configuration. |
| AV06 | Appointment rules | Inspect duration, before/after buffers, slot step, notice and horizon with owner/source. Edit each field at its declared owner; show joint-resource feasibility and exact unavailable reasons. Slot step never truncates the service. |
| AV07 | Resource eligibility | Search existing staff/room/equipment, inspect service/location eligibility and shared constraints. Offering-to-resource associations edit in Offerings with return context. Availability edits only its declared schedule/eligibility constraints; identity/qualification edits go to Business. |
| AV08 | Rosters and absence | Add shift, split shift, break or absence for exact dates/resources. Copy only compatible schedules; overlapping blocks validated; source-owned roster fields remain read-only. |
| AV09 | Asset timeline | Search named assets, zoom compatible date range, show held/reserved/in-use/overdue/maintenance/unknown with text and legend. Expand one asset's commitments. No free-looking gap when snapshot coverage is missing. |
| AV10 | Asset block/release | Maintenance reason, start/end/effective scope and affected commitments. Release only a local preview block owned here. Actual vehicle/item return is a Work action; deleting maintenance does not release custody. |
| AV11 | Dated sessions | Add occurrence with exact date/start/end, pool units and shared anchors; edit future occurrence through declared owner. Capacity breakdown uses one revision. Cancel/reschedule existing work through Work, not by deleting a row. |
| AV12 | Linked fulfilment windows | Incoming/processing/outgoing role labels, selected customer drop-off vs merchant collection and delivery vs collection. Firm promise checks all required roles; assessment marks later roles uncommitted. Show which leg blocks the promise. |
| AV13 | Coverage/transport context | Read relevant service areas, travel and vehicle dependencies; display inapplicable for remote/customer-collection methods. Edit coverage through Business with return context. Coverage readiness and actual capacity stay distinct. |
| AV14 | Holds/reservations | Inspector with work ID, quantities/resources, interval, owner snapshot, expiry and fee prerequisite. Hold timer never releases capacity by itself. Create a sample hold only through the internal test drawer; release only supported scoped preview actions. |
| AV15 | Capacity adjustment | Typed quantity/unit, effective date and source; before/after obligations and remaining capacity. Reject a reduction below valid held + reserved + applicable in-use commitments. Never mix units or double-count shared booking IDs. |
| AV16 | Accepting/busy/pause | Select activity/method/location, supported reason, now/future start and explicit end/manual resume. Existing work retained. Busy exposes only configured behaviour; no universal kitchen/preparation controls. Resume stays pending until sample owner acknowledgement. |
| AV17 | Recurrence/series | Frequency, days, start/end/count, bounded occurrence preview and exclusions. Edit this occurrence/future series explicitly; inspect affected work. Membership renewal is not a series of reserved places. |
| AV18 | Conflicts | Name exact resource/time/unit, permitted affected work IDs and blocked action; route reassignment/reschedule to Work. Revalidate on return. No silent cancellation, invented overbooking permission or approval fallback. |
| AV19 | Internal availability test | Offering, date/time, location, method, party/quantity/unit and required resources. Show available/request-only/unavailable/unknown and reasons. Can simulate a hold/requirements result in local preview. No discovery route, real booking or customer notification. |
| AV20 | Copy/import/export | Explicit source/targets, model/unit/timezone compatibility, validated before/after preview and row-level errors. Apply valid rows only after explicit selection; report per-target results. Export authorized preview data safely. No “Connect Google” action pretending to work. |
| AV21 | Search/filter/grouping | Resource/offering/status/source filters, clear-all and counts with defined units. Filtered-empty differs from unconfigured. Shared blocking dependencies remain in the inspector even if hidden from lanes. |
| AV22 | History/pending operations | Local actor “You (sample)”, revision, effective date, before/after and pending/result. Inspect operation by stable reference after refresh; retries reuse the same local operation ID. Do not call local history an immutable production audit. |
| AV23 | Ownership/refresh | Show native sample vs simulated external owner, editable/read-only, as-of, coverage and current/stale/partial/unknown/unmapped state. Refresh has busy/success/error outcomes. Google is optional and unconnected; no OAuth or live provider calls. |
| AV24 | Draft/review/apply/discard | Inline validation, review impact and Apply in preview. State “Unsaved”, “Saved locally” or failure precisely. Dirty close offers Keep editing/Discard local changes; discard never reverses applied work. Save failure retains all input. |

Detailed form fields, transitions and recovery are specified in the companion states document. Every visible enabled action in the future frontend must produce a meaningful local result; deferred actions use an explanatory unavailable state.

## UX and visual decisions

Use familiar calendars where time allocation is the merchant's task. Use interval tables, capacity lists or due schedules where they communicate the work more clearly. Group fields by the decision they support: exact service span beside buffers, scope beside a pause, affected work beside an exception. This applies proximity and common-region principles to actual merchant decisions.

Keep frequent controls visible and put advanced recurrence, template inheritance and import mappings in secondary panels. Never hide an active blocker, affected commitment, source ownership or unresolved save. This follows [progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) while preserving critical information.

Choose readable gold text on cream/white and dark text on gold primary actions; do not assume the decorative gold itself is suitable for small body text. Use border, icon, pattern and text with semantic colour. Unknown is visibly labelled, not a pale version of available. Calendar event labels include enough identity/time to inspect without hovering.

Provide labelled keyboard controls for every drag operation and an agenda equivalent. Aim for comfortable 44 CSS-pixel primary touch targets; [WCAG 2.2's minimum target criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) is 24 CSS pixels with defined spacing/exceptions, not a universal 44-pixel AA rule. Announce save, refresh and validation status appropriately without repeatedly interrupting the user, following [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

These are design decisions to verify with actual users and frontend checks. A named UX principle does not prove the screen usable or justify removing needed information.


## Implementation evidence

The frontend implementation is recorded separately in [implementation/acceptance.md](implementation/acceptance.md), with actual browser reports and screenshots. The earlier design verification remains design-only.
