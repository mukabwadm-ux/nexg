# NEXG calendar and booking plan

Date: 31 October 2026. Status: earlier product design and library research. The current decision is end-to-end delivery using Payload Reserve and fixed Kenya time. Read the [current plan and all-128 coverage](payload-reserve-plan/README.md) for the selected foundation, category mappings, semantic corrections, integration and production completion criteria. This document supplies prior product/calendar context. It extends [Availability](screens/03-availability.md), [Work](screens/01-work.md), [onboarding configuration](onboarding-and-configuration.md) and the [128 specialty profiles](profiles-128.md). It does not mean all 128 variations have been implemented or individually tested as booking systems.

## Product and scope

Give each merchant business a private NEXG calendar and a booking experience appropriate to its activities. Staff, branch and resource views are controlled views of the same business commitments, not independent copies that can diverge. A merchant may operate multiple businesses; each business has separate data and authorized membership. A business can combine scheduling models. Where no scheduling is relevant, show the applicable orders, opening hours or request-only workflow rather than an invented appointment calendar.

Google Calendar is optional. The NEXG calendar remains the business workspace. A merchant may authorize creation of a separate Google calendar for NEXG events; their existing calendars remain separate. Personal busy-time checks are opt-in and can expose busy intervals without personal event details. A staff member can connect their own account only with consent. Google ownership and disconnect behavior must be explained before connection.

## Configuration from onboarding and offerings

Use the existing category and specialty profile as a starting suggestion, then confirm each enabled activity and its actual offerings. Do not infer that a category automatically supports every possible service. For each bookable activity configure: intake type (instant, merchant approval, request/quote), duration or date range, applicable location and timezone, service or resource eligibility, capacity and quantity, opening hours and shifts, breaks and closures, lead time, booking horizon, setup/cleanup/travel buffers, fulfilment method, customer information, cancellation and rescheduling policies, and optional payment requirements. Missing values remain unknown and prompt setup; do not present an uncertain interval as available.

The category registry binds activities to reusable capability definitions, terminology and screen variants. Adding a category combines already supported models and prompts; a new kind of operation requires a reviewed capability definition and implementation. A hybrid merchant can have rentals and separately enabled transfers. A with-driver rental alone must not turn on standalone transfers.

| Scheduling model | Example | What is reserved or scheduled |
| --- | --- | --- |
| Time slot | Salon, consultation | Eligible staff, room or equipment for a duration and applicable buffers |
| Exclusive interval | Car rental, equipment hire | A specific asset across start/end times, including handover, return and maintenance |
| Linked resources | Airport transfer | An eligible vehicle and driver for the same trip; pickup and drop-off |
| Group capacity | Class, experience | A dated session and a number of places within available capacity |
| Space reservation | Restaurant, venue | An eligible table or space for a party and time, only if this service is enabled |
| Multi-day itinerary | Safari, tour | Dates plus required guides, vehicles or spaces and shared capacity |
| Collection and return windows | Laundry | Feasible linked collection and return windows and turnaround |
| Service request | Freight, concierge | Intake and response dates; no instant confirmation until permitted |

Retail orders and quote workflows can use operating or fulfilment windows where relevant without becoming appointments. These examples are patterns, not a guarantee that every current specialty already supports the illustrated capability. Review all 128 profiles against selected capabilities and confirm proposed exceptions before claiming coverage.

## Merchant calendar experience

The Availability screen owns schedule rules and shows the calendar. Work owns booking details and actions. Offerings defines what can be booked; Business owns locations and resources; Settings owns access and connections; Insights reports relevant outcomes. Keep one identifiable booking linked between screens.

- Header: business/location, timezone, date navigation, today, view selector and an action appropriate to the user's role. Show connection freshness only when applicable.
- Views: day, week, month and accessible agenda; resource/asset timeline, session-capacity list and multi-day view only where applicable. Mobile starts with agenda and date selection. Drag is optional and has a keyboard and form alternative.
- Filters: activity, location, person/resource, status and source when useful. Do not let filters conceal a conflict or falsely imply availability.
- Calendar items: title, time/date range, status, assigned resource and relevant capacity. Selecting one opens details and next permitted actions. Private external events appear as busy blocks if the merchant opts in.
- Scheduling controls: weekly hours and shifts, breaks, closures, temporary blocks, lead time and buffers, recurring patterns and exceptions. Preview affected bookings before changes. Closing time does not cancel existing bookings.
- Booking creation and management: select offering, fulfilment, time/range, quantity and resource as applicable; show price and policy if known; check availability; create a request or confirmation as configured. Provide reschedule, cancel, decline, assign, complete and no-show actions only where permitted.
- Customer-facing booking flow: offering, location/method, resource preference where applicable, available times/capacity, customer details, policy and price, confirmation or request status. Payment is shown only when configured and supported.
- Security and privacy: business-scoped access, role-appropriate details and actions; avoid putting sensitive information in Google event titles, notifications or unrelated team views. Record meaningful changes and who made them.

### States and recovery

Design empty/no business hours, setup incomplete, no bookable offerings, no matching filtered results, loading, offline, stale/unknown availability, success, permission denied, pending approval, cancellation, rejected or expired hold, full capacity, conflicting assignment, provider disconnected, sync pending/failed and retry. Provide a reason and next action. Unknown capacity is not free; failed synchronization is not reported as success. A conflict never silently removes an existing booking.

Booking statuses are proposed: draft, requested, temporarily held, confirmed, in progress, completed, cancelled, declined, expired and no-show where applicable. Holds have a trusted expiration; payment state is separate from booking state. Each workflow defines its valid transitions. Do not claim a confirmed reservation on a failed or indeterminate request.

## Google connection design

1. Merchant chooses Connect Google, signs in, grants the minimum permissions needed, and reviews the destination calendar and direction of synchronization.
2. Create a separate secondary Google calendar under the intended merchant owner, or allow a deliberately selected existing business calendar if supported. Keep personal calendars outside portal display by default.
3. The merchant chooses NEXG-to-Google event sync and, separately, whether selected calendars provide busy-time blocks. More extensive two-way editing is a separate opt-in with explicit mapping and conflict rules.
4. Show connection, selected calendar, scope, last successful sync and errors. Disconnect stops future sync; explain what happens to already created Google events before confirmation. NEXG records remain available subject to the eventual data contract.
5. Map each NEXG booking to its corresponding Google event and protect against duplicate writes and sync loops. Changes or cancellations in Google must not silently cancel, refund or reassign a NEXG booking; show the discrepancy and route it to an approved action. Handle revoked permission, rate limits, unavailable service, deleted events, missed notifications and recovery.

Google free/busy checks and event sync are not an atomic lock across external systems. A race is possible when another calendar changes at the same time. The booking service must use atomic reservation of NEXG-controlled resources, detect external conflicts, state freshness and provide reconciliation; it cannot promise to prevent every third-party conflict.

## End-to-end delivery

1. Agree the activity models, ownership and domain contracts, refine the Availability specification, and map all 128 proposed profiles to supported behavior. Preserve the shared portal shell and merchant-specific wording.
2. Select reusable libraries against the exact resource, time, access, accessibility, maintenance and license requirements. Calendar components remain replaceable.
3. Implement persistent configuration, availability and transactional booking/allocation, together with real customer and merchant flows. Include approval, holds, changes, cancellation and relevant payment behavior.
4. Implement durable notifications, audit history, Google integration and explicitly supported existing-system adapters, including authorization, freshness, conflict and recovery behavior.
5. Verify end-to-end journeys, concurrency, access isolation, all configured specialties, timezones, accessibility and operations before production readiness. Sample data remains useful for development and regression coverage but is not the delivery outcome. Follow the linked architecture plan for release, monitoring and recovery requirements.

## Acceptance scenarios

- Two merchants with similar offerings see only their own bookings; authorized staff see only permitted details and actions.
- Car rental reserves a vehicle over a range and displays return and maintenance; adding a driver does not create an airport transfer.
- A transfer needs a compatible vehicle and driver; a shared resource cannot be assigned to two NEXG bookings at the same time.
- A class booking cannot exceed capacity, including active holds; the final place cannot be confirmed twice during simultaneous attempts.
- A location closure shows its effect on confirmed bookings and does not cancel them automatically. Recurrence exceptions and timezone changes preserve the intended local time.
- An unknown or stale external schedule cannot be presented as confirmed available. A Google edit triggers a visible reconciliation path.
- Merchant can use NEXG without Google, connect a distinct business calendar, opt into personal busy blocks, revoke consent, and see a clear disconnected state.
- Frontend fixtures show each state without presenting sample confirmations as live. A new configured specialty reuses a supported model; unsupported operations remain unavailable until implemented.

## Open-source assessment, 31 October 2026

Open source is licensed software. If the requirement means no purchase, royalty or per-merchant resale fee, permissive licenses such as MIT can fit while requiring retention of license and copyright notices. Review the precise version, dependencies, trademarks, integrations and deployment arrangement before adoption. Never assume a repository's root license covers every component.

| Candidate | What it provides | License and limitation |
| --- | --- | --- |
| [FullCalendar Standard](https://fullcalendar.io/license) | Calendar UI and standard views | MIT. Its separate Premium resource/timeline plugins have different terms and can require payment for commercial use; standard alone is not a booking engine. |
| [React Big Calendar](https://github.com/bigcalendar/react-big-calendar/blob/master/package.json) | React calendar UI | MIT. Verify required resources, accessibility, mobile and time-zone behavior; it is not a complete booking engine. |
| [Schedule-X](https://github.com/schedule-x/schedule-x) | Calendar UI and framework integrations | Repository is MIT; its [Premium](https://schedule-x.dev/premium) resource views and other additions have separate paid terms. |
| [Cal.diy](https://github.com/calcom/cal.diy) | Scheduling application worth studying for appointment use | Current repository root [LICENSE](https://github.com/calcom/cal.diy/blob/main/LICENSE) is MIT. Its maintainers recommend personal, non-production use and say team and organization features were removed. Audit the exact release, dependencies and third-party services; it is not proven suitable for NEXG's multi-merchant production. |
| [Easy!Appointments](https://easyappointments.org/) | Self-hosted appointment scheduling | GPL-3.0, no self-hosted license fee; redistribution obligations differ from MIT. Its published features do not demonstrate coverage of all NEXG models. |

Current selection: adapt Payload Reserve with NEXG extensions and a compatible runtime, as specified in the linked current plan. Reuse its calendar components where suitable and add the required NEXG views; a second calendar library is not an immediate dependency. The comparisons above are earlier research. Hosting, messages, payments and integration usage can still cost money.

References: [MIT license](https://opensource.org/license/mit), [Google calendar creation](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert), [Google authorization scopes](https://developers.google.com/workspace/calendar/api/auth), [Google API usage limits](https://developers.google.com/workspace/calendar/api/guides/quota).
