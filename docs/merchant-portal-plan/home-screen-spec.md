# NEXG Merchant Portal — Home screen: end-to-end interaction and state map

**Status:** Draft for discussion, 28 October 2026. This describes the proposed redesign, not a claim that the live portal has these capabilities. It does not authorize implementation or release.

**Scope:** Screen 1: Home, including its shared header/navigation and the panels, menus, dialogs and actions opened from Home. Other destination screens are named and their return path is described; their internal controls will be mapped when we cover those screens. This is a complete inventory for this proposed Home design, not a verified inventory of every control in the deployed portal. Original screenshots show a desktop pre-live restaurant account, not every role, device, status or interaction.

**Evidence:** [Original dashboard overview](01%20Dashboard/01-dashboard-overview.png), [setup](01%20Dashboard/02-setup-progress.png), [branches and orders](01%20Dashboard/03-branches-and-orders.png), [quick actions and money](01%20Dashboard/04-actions-and-money.png), [redesign plan](Merchant%20portal%20redesign%20plan%20-%20128%20subcategories.md), [UX review](Merchant%20portal%20UX%20review%20and%20adaptation%20plan.md), and [dashboard concept](NEXG%20merchant%20dashboard%20concept.png). The image is illustrative, not an approved screen or evidence of implementation. This map uses the general UX Decision Design skill.

## 1. What Home is for

At a glance a merchant can answer: Which business or location am I viewing? Can customers see it? Can it accept work now? What needs me next? What has happened today? Where can I get help? Home is a starting place and summary; the authoritative destination still handles the detailed workflow.

Home adjusts to the merchant's verified role, allowed locations, account and branch states, and enabled capabilities. A restaurant might see orders, a grocery shop stock issues, and a salon bookings. A mixed merchant can see several types, labelled. Categories suggest what might be relevant; they do not enable unapproved services or override permissions.

## 2. Screen layout and priority

1. **Shared shell:** NEXG identity, navigation, selected business/location, notifications, help and account menu.
2. **Identity and status:** greeting, active scope, account/publication/acceptance status and controls the user is allowed to use.
3. **Action needed:** urgent authorised work and genuine blockers, with a clear next action and due time only when confirmed.
4. **Setup:** for accounts or locations not ready, completed and remaining requirements and a resumable checklist. For live merchants, show only relevant unresolved setup or renewal requirements.
5. **Current work:** orders, bookings, requests or other enabled work, with real statuses and source freshness.
6. **Locations and availability:** current status, next change where known, branch selection and relevant shortcuts.
7. **Business overview:** carefully scoped period, metrics, money summary where permitted, and growth or review summaries only when available and useful.
8. **Help:** a context-sensitive route to a verified support channel and relevant open cases.

On mobile the navigation becomes a labelled menu and the above order remains task-first; cards stack, controls do not overlap and details open as full-height panels where appropriate. Exact layout, alert ordering and wording are design hypotheses for merchant testing. Avoid a permanent sales promotion or floating contact button covering important work.

## 3. Home controls: every proposed entry point

**Key:** `Panel` = expandable drawer/sheet or menu; `Destination` = opens another screen; `Inline` = changes what Home shows; `Dialog` = asks for a decision; `Information` = not clickable. A control is available only where its action is supported and the user is permitted. A disabled action explains why and, where permitted, offers a real route to resolve it. Controls not relevant to a capability are omitted; essential unavailable information is explained rather than silently hidden.

### 3.1 Shared header and navigation

| ID / visible element | Type and click result | Expanded contents / next action | States and recovery |
|---|---|---|---|
| H01 NEXG logo / Home | Destination | Opens Home for the currently permitted business and location; active Home is labelled. | Loading, access lost, error/retry. The logo does not reset location silently. |
| H02 Navigation menu | Panel on mobile; grouped navigation on desktop | Proposed top-level navigation: Home, Work, Offerings, Availability, Business, Money, Promotions, Insights and Settings. Promotions has its own section; Settings follows Insights. Access is role and capability aware. Help remains available in the shared header and via contextual support. Each link opens its destination. | Active item, expanded/collapsed, unavailable with reason when appropriate, permission changed. Screen-reader labels and focus return on close. |
| H03 Business / location selector | Panel | Current business; searchable list of permitted locations, All locations only if allowed, each with a name and meaningful status. Select a location to refresh Home in that scope; close without changing. | One location: show name without a pointless selector. Loading, no authorised location, unknown/stale status, access removed, refresh failure. Confirm context change if a pending action would lose user input. Never expose another tenant's locations. |
| H04 Notifications bell | Panel | Unread/recent authorised notifications, each with subject, time, branch, status and a link to the actual task; optional mark read/mark all read only if implemented. Close returns focus. | None, new/unread, loading, unavailable, old data, access changed, failed read marker. A notification is not proof of completion. Announce important updates without stealing focus. |
| H05 Help / question mark | Panel | Search help if available; issue topics such as current work, offerings, account, payments and devices; contextual link; verified call/message channel and cases where supported. Each item opens a relevant article, contact route or case. | No channel configured, out of hours when known, unavailable, interrupted network, failed handoff. Never display an invented number or promise a response time. |
| H06 Account avatar / name | Panel | Signed-in identity; business/role and permitted account/settings links; switch business if authorised; sign out. Sign out invokes the confirmed sign-out flow and returns to sign-in. | Session expired, account removed, multiple businesses, single business, sign-out error. Avoid exposing sensitive contact information. |
| H07 Search | Inline or panel, only if actual search is available | Search permitted work, offerings and help, with clearly labelled result types and scope; select a result to open it. | Empty query, results, no match, loading, failed, unavailable, permission filtered. Do not imply universal search without a supported index. |
| H08 Connection / data freshness indicator | Information with expandable detail | Opens a panel explaining connected, reconnecting, offline, stale or unavailable data, last successful update if known, affected sections and Retry. | No timestamp if unknown. Offline Home is read-only; no silent queue for changes. On reconnection re-fetch authoritative status. |

### 3.2 Greeting and status

| ID / element | Type and click result | Expanded contents / next action | States and recovery |
|---|---|---|---|
| H09 Greeting and business name | Information | Shows user and selected business or location, with a neutral fallback if a name is unavailable. | Loading, partial or missing identity. No action implied by decorative text. |
| H10 Business account status | Panel | Explains business approval separately: for example setup needed, submitted, under review, approved or restricted if those are actual owner-defined states. Shows reason, next action, scope and last update where authorised. Link to the precise setup or support destination. | Unknown, stale, unavailable, denied. Do not infer approval from an open-hours schedule. Actual transitions and names require owner confirmation. |
| H11 Location publication status | Panel | Explains whether selected location is visible to customers, why, and what is needed. For All locations, show counts only when sourced and allow location list expansion. Link to location/readiness. | Draft, pending review, visible, paused/unpublished, restricted or unknown *where supported*. Business approval and publication are separate; do not label a location live when its publication status cannot be confirmed. |
| H12 Accepting-work control | Panel → Dialog for a change, only for authorised single-location capability | Shows current accepting state, affected location/capability, current scheduled hours, consequences and available choices such as pause/resume or busy adjustment **only if supported**. Ask for duration/reason only when contract requires it. Confirm applies; Cancel closes. | Open/accepting, paused, busy, outside hours, not yet live, scheduled, pending change, conflict, failed, outcome unknown, permission denied and stale. Do not equate opening hours with live status. A resume request cannot promise acceptance if business/location is not eligible. Read back the owner-confirmed result. |
| H13 Status explanation | Panel | In plain language: business approval, location visibility, scheduled hours and accepting work are distinct. Provide links to the relevant settings where accessible. | Hide/close on request; unknown data explicitly marked. Do not make users read it to operate basic controls. |

### 3.3 Action needed and current work

| ID / element | Type and click result | Expanded contents / next action | States and recovery |
|---|---|---|---|
| H14 Action needed summary | Inline expansion | List actual prioritised tasks with type, location, due time only if known, status, short reason and primary next action. Expand/collapse; Show all opens Work or the relevant case list. | None: “Nothing needs your attention right now” only if sources are current. Loading, partial, stale, error, access limited. Do not merge unrelated deadlines into an invented countdown. |
| H15 Task row | Panel or Destination | Select a row to open a scoped detail panel with current state, time, affected item and authorised next action; Open full details opens the owning work/case screen. | New, in progress, awaiting someone else, completed, cancelled, expired, escalated, unavailable or access denied when the owning service reports them. If another user updates it, refresh and explain before any action. |
| H16 Primary task action | Dialog or Destination | Acknowledge/accept/resolve only when the specific work owner's contract and actor role allow it; show consequences, required input and cancel. The action must never be inferred solely from a merchant category. | Immediate acknowledgement → submitting → confirmed / rejected / failed / outcome unknown. Re-read after timeout; retry only when safe and supported. No optimistic “completed” for an unconfirmed operation. |
| H17 Work type selector | Inline | All permitted work, or specific enabled types such as Orders, Bookings and Requests, with correct labels and counts. Clear filter returns to the combined view. | One type: omit unnecessary filter. Empty type, loading, failed, mixed and permission-scoped. No false combined total when a source is unavailable. |
| H18 View all work | Destination | Opens the relevant Work queue with selected location, work type and other relevant filters; Back returns to Home and restores context. | Unsupported, access denied, unavailable source, empty queue. Do not display preview orders as real. |
| H19 Current-work row | Panel or Destination | Shows an actual item, work type, status, time and location; opens detail or owning queue. Each source must support its own stages rather than a universal food delivery timeline. | Loading, no work, disconnected, source unavailable, filtered empty, stale, update conflict, completed/cancelled. Samples, if deliberately offered in a separate preview, carry a persistent SAMPLE label. |

### 3.4 Setup and readiness

| ID / element | Type and click result | Expanded contents / next action | States and recovery |
|---|---|---|---|
| H20 Setup progress | Inline expansion | “X of Y required steps completed; Z remaining” using one authoritative scoped list. Expand list with name, reason, status and action. Optional tasks are separate and do not quietly change the denominator. | Loading, no requirements, partial, complete, waiting on review, rejected, expired, changed requirements, unavailable, stale. Never count submitted or review-pending items as approved unless the agreed policy says so. |
| H21 Continue setup | Destination | Goes to the highest-priority actionable outstanding requirement for the selected scope; preserves the return-to-Home route. If several matter equally, show a choice with reasons. | User lacks permission; waiting on others; no actionable tasks; error. “Continue” must not lead to a non-existent form. |
| H22 Individual setup step | Panel → Destination | Explain requirement, business vs location scope, required/optional, current state, what is needed and who can act. Action opens correct business profile, hours, team/device, offerings, documents, payout, or test/go-live flow **if applicable and available**. | Not started, in progress, saved, submitted, under review, approved, changes requested, rejected, expired, blocked, not applicable and unavailable when contract supports them. Rejection includes a safe route to fix or contact support. |
| H23 Go-live readiness | Panel | List satisfied, outstanding and pending-review conditions; distinguish business and location readiness and which person/owner acts next. Link to each actionable item. | Not ready, awaiting review, ready for review, approved/visible, restricted or unknown. Do not assert instant go-live or an approval time without confirmed policy. |
| H24 Setup guide / human help | Panel → verified channel | Explain available help; present real chat, call, ticket, WhatsApp or appointment links only when actually supported and authorised. Selecting a route hands off with clear confirmation/status. | No live chat, channel unavailable, out of hours if verified, unanswered, case pending, escalation, failed send. Do not label a link “Message ops” if there is no message composer. |

**Original seven steps as a starting point, not universal policy:** business profile; hours; team and devices; catalogue started; documents; payout method; test order and go live. Different capabilities may require different steps: a booking merchant may require a test booking, while a quotation service may not have an order. Whether team/device, documents, payout or a test is mandatory remains an owner decision; a step appears only when its requirement and owner are verified. Completion and visibility must not be simulated.

### 3.5 Locations, availability and offerings

| ID / element | Type and click result | Expanded contents / next action | States and recovery |
|---|---|---|---|
| H25 Locations summary | Inline expansion → Destination | List allowed locations with name, publication and acceptance indicators; expand to see relevant next action, then View all opens Business → Locations. | One location, many, no location, partially loaded, unknown, permission limited. Keep business and branch states distinct. |
| H26 Location row | Panel or Destination | Shows address/service area where available, account/branch status, current schedule and relevant actions; Open location enters its detail. | Setup incomplete, awaiting review, visible, paused, closed, restricted, unknown. A branch can be in scheduled hours yet not accept work. |
| H27 Add location | Destination | Opens the authorised add-location flow with required business context; review before submission where supported. | Not permitted, limit reached, unavailable, incomplete data, duplicate, saving, review pending or failed. No pretense that a newly created location is visible before confirmation. |
| H28 Hours / availability shortcut | Destination | Opens Availability scoped to selected location and enabled capability; may represent hours, slots, sessions or resource capacity. | No schedule, closed, unavailable, unknown or mixed. Explain the relevant model rather than showing breakfast/lunch to all merchants. |
| H29 Offerings summary / manage | Destination | Opens Offerings as Menu, Products, Services, Events or another relevant label; show only supported counts and statuses. | None added, draft, published, unavailable, pending review, partial count or source failure. Add an offering leads to an editor only if supported/authorised. |
| H30 Stock / capacity exception | Panel → Destination | Shows affected item/slot/resource and branch; View details opens the relevant editor, inventory, or availability screen. Adjustment is made only through an enabled, authorised owner-confirmed flow. | Low/unavailable, restored, data stale, unavailable, pending confirmation. Low-stock thresholds and capacity semantics must be defined by their owner. |

### 3.6 Money, insights, growth and support

| ID / element | Type and click result | Expanded contents / next action | States and recovery |
|---|---|---|---|
| H31 Money summary | Panel → Destination | For authorised users, show finance-sourced amount, label, period, location, currency, relevant deductions or definition, last update and View money. A summary is not a payout confirmation. | No transactions, processing, payable, paid, failed, on hold, reversed, source unavailable or stale **only as Finance defines them**. Do not present an unknown value as KES 0. Hide values and related details from unauthorised roles. |
| H32 Payout setup / issue | Panel → Destination | Explain missing or pending payout setup, or a finance-reported issue; link to the actual verified setup/change/support path. Show next payout date only if confirmed for that merchant. | Not configured, submitted, verifying, verified, failed, change pending, permission denied or unknown as Finance defines. No blanket Friday/Monday promise; resolve the contradictory source policies first. |
| H33 Performance / date selector | Inline | Select approved date range and authorised scope; cards display definitions and comparison only if supported; View insights opens the relevant report with context. | No data, insufficient data, filtered empty, partial, source delayed, error or stale. Do not compare a partial period to a complete period without explanation. |
| H34 Reviews summary | Panel → Destination | Show authorised recent review summary, unanswered count if reliable, and Open reviews. Review replies follow the review service's policy. | None, new, response pending/moderated, unavailable or insufficient data. Avoid exposing customer details beyond approved permissions. |
| H35 Growth / featured opportunity | Panel → Destination | Display only if eligibility and service are real; explain sponsored placement, cost, duration and cancellation terms before commitment; open actual growth screen. | Not eligible, not configured, pending, active, expired, unavailable or permission denied. No pressure or paid upsell ahead of urgent work. |
| H36 Quick actions | Destination / relevant panel | Context-appropriate actions, e.g. upload required document, add offering, manage hours, open work, set up payout, or contact support. Each must link to a functioning permitted flow; explain why it is suggested. | No action available, prerequisites unmet, permission denied, owner service down. Do not advertise future work as available. |
| H37 Help / support case | Panel → Destination | Open verified support channels and permitted cases, with case status and reference if available; connect to actual case. | No cases, waiting for merchant/support, resolved, reopened, channel outage, no route configured, access limited. Support and financial/order disputes remain distinct workflows. |
| H38 Emergency help | Panel, if a verified emergency route exists | Show the verified contact method prominently and clarify any operational hours. Activate call only after user selects it. | Number unavailable or not verified: do not invent one; direct to the approved fallback if it exists. An urgent safety issue must not depend solely on a slow form. |

### 3.6.1 Home graphs, direct cards and Promotions — expanded map

**Revision:** Promotions is its own top-level section. Insights is for performance and reporting. Settings follows Insights. The shared Help control remains available in the header; support is not removed. The final wording and order can be refined with the owner.

**When graphs appear:** the setup and review Home prioritise requirements, with no invented trading chart. A live Home may show a compact performance chart when the merchant has permission and the analytics source provides reliable data. A newly live merchant with no transactions sees an explanatory empty state instead of a fabricated line. When a merchant is paused, historical charts may still appear for an available period, clearly labelled; operational status and historical sales are separate facts. Some category-specific capabilities and data may not exist until their owners support them.

| ID / visible element | Click / what opens | States, permissions and recovery |
|---|---|---|
| H45 Today at a glance | Container with heading and separate controls; the entire outer card is not an invisible link competing with its child cards. View insights is a clear link to Insights with authorised scope and selected period retained when supported. | Loading, no activity, partial data, stale, unavailable; zero is shown only when confirmed. Money values require finance permission. |
| H46 Orders metric card | Opens the Work orders list filtered to the displayed location and time period. | Real count or unavailable; accessible keyboard target; if no orders, open a relevant empty list. Only shown for an enabled, authorised work type. |
| H47 Bookings metric card | Opens the Work bookings list filtered to the displayed location and time period. | Same behaviour as orders; the booking capability and its permissions must exist. Requests and confirmed bookings have distinct owner-defined definitions. |
| H48 Net sales metric card | Opens Money with the displayed period, scope, currency and breakdown, where Finance supports it. | Hide from users without permission; explain fees/refunds and pending versus settled figures; no implied payout. |
| H49 Performance mini-chart | Compact chart on Home with a title, metric, time period and location. Selecting View report opens the relevant full Insights report; selecting a point only reveals its date and value if an interactive chart is actually supported. Provide an accessible text/table alternative. | Sufficient data, no data, partial, loading, stale, unavailable and permission denied; identify source, scope and last update. Never infer trends from invented or incomparable periods. |
| H50 Metric and date controls | Choose among permitted supported measures, e.g. orders or sales, and available periods. Home's chart and totals update together only if they truly share the same scope and definitions; otherwise label differences. | Confirmed selected state, unavailable selection, filtered empty, failed update and retry. Show real period/time-zone definitions. No default percentage comparison until supported and comparable. |
| H51 Promotions navigation | Opens the dedicated Promotions section. That section is the proposed home for campaign setup, active and past promotions, and existing Featured placements. | Present to eligible and authorised merchants, or explain why a visible option is unavailable when appropriate; no promise of service availability. |
| H52 Promotions card on Home | A compact secondary card, below operational priorities. It may show an active promotion and genuine status or an available next step. View promotions opens the dedicated section; Create promotion opens the eligible creation flow if supported. | Not live/not eligible, no campaign, draft, pending, scheduled, active, paused, completed, rejected, unavailable or status unknown only when the campaign owner supports that state. Avoid persistent sales pressure. |
| H53 Create promotion | Opens Promotions → Create. Where supported, select offering(s) or the relevant store/location, promotion type, amount or discount, start/end, eligibility conditions, budget and who funds it; review scope, cost, customer-facing offer and terms before explicit submission. Actual available controls and whether approval is required are product decisions. | Save draft only if supported; invalid fields, conflicts, permission denial, unavailable budget/cost, pending submission, confirmed submission, rejection and unknown outcome. Do not claim a promotion is live until the campaign owner confirms. |
| H54 Promotion detail | Selecting an active/scheduled promotion opens its details and relevant actions, such as edit, pause or cancel, only where supported. Show affected locations/offerings, schedule, cost/funding and any confirmed result. | Show transition and fees/terms before confirmation; reflect owner-confirmed outcome; reconcile timeouts rather than silently resubmitting. Performance measures require reliable definitions and sufficient data. |
| H55 Featured placement | In Promotions, open Featured placements with eligibility, placement, period, price, funding and cancellation terms available before purchase or commitment, if this service exists for that merchant. | Retain access to the original Featured feature; awaiting eligibility, unavailable, pending, scheduled, active, completed or cancelled only as confirmed. Do not assume discounts and Featured share the same policy or contract. |
| H56 Location summary | Each named location opens its detail; View locations opens the full list. Status is informational unless accompanied by a labelled permitted action. | Mixed locations, no location, partial/unknown state, no access, loading and refresh failure. Preserve selected scope. |
| H57 View setup | Opens or expands the complete setup checklist; on setup Home the checklist can already be visible. Each requirement has its own action and accurate state. | Incomplete, waiting for review, changes requested, complete or unavailable. An already-live merchant only sees applicable outstanding requirements. |
| H58 Settings navigation | Opens Settings for authorised profile/account, notification and other approved preferences; Business retains its profile, locations, team and documents. Avoid duplicating settings without a clear purpose. | Denied, unsaved changes, save pending/confirmed/error, unavailable. The detailed Settings screen will be specified separately. |

Promotion types such as percentage discounts, bundles, sponsored placement or coupons are **proposals to evaluate**, not claims of currently supported features. The original screenshots show Featured placements, while the supplied competitor references show additional promotion patterns. Define NEXG eligibility, types, funding, rules, metrics and ownership before promising these options or building them.

### 3.7 Controls common to all panels

| ID | Control | Behaviour / states |
|---|---|---|
| H39 Close / Back | Close the current panel or return to its parent and restore focus and scope. Warn about unsaved changes only when there is something to lose. Escape works where appropriate; an accessible labelled close button is always present. |
| H40 Expand / collapse | Show or hide details without performing a business action. Expose current expanded state to assistive technology and preserve user context. |
| H41 Retry / Refresh | Refresh the affected data source; show loading and last confirmed data. Do not repeat a potentially completed mutation until its outcome is checked and retry is safe. |
| H42 Confirm / Cancel | Confirm only after clear scope and consequences; cancel exits without changing the owner system. Pending requests are not presented as finished. |
| H43 Filter / Clear | Apply visible filter and location scope; make filtered-empty different from no underlying data. Clear restores a named default, not a broader unauthorised scope. |
| H44 Links / buttons | Use links for navigation and buttons for actions; focus states, readable labels and keyboard use. Never make a decorative card look clickable if it is not. |

## 4. End-to-end Home journeys

### A. First visit / in setup

Sign in → resolve authorised business and scope → load Home and each source → show business approval, location publication and acceptance separately → show real setup progress → merchant opens a requirement → completes or submits it in its destination → returns Home → status refreshes from the owner → show submitted, under review or confirmed as appropriate → show the next actionable step or waiting state → when requirements are satisfied, show the agreed review/activation path. If a reviewer requests changes, return to that exact requirement. Never show “live” merely because a form was submitted.

### B. Live, single location

Sign in → Home shows chosen location, verified publication and accepting state → current work and genuine urgent issues appear → open a real task or work queue → perform only an authorised supported action → see pending then owner-confirmed result → return Home with updated queue and scope. If no active work and sources are current, show a calm empty state with useful shortcuts.

### C. Multi-location owner or manager

Select All locations if permitted → see scoped counts and exceptions with location labels → select a branch or task → operate within that branch → confirm any change's scope → return with branch context retained. If permission changes mid-journey, stop the action, refresh permissions and explain without revealing other branches. A combined view cannot use one ambiguous “open” toggle to change every branch.

### D. Frontline staff

Sign in → see permitted branch and work → handle permitted tasks or open help → finance, team or payout content remains inaccessible if role rules deny it → if direct link is denied, show a neutral access message and a legitimate contact path. Role names and exact permissions need approval; the original screenshot's owner/manager/cashier labels are starting evidence, not universal policy.

### E. Temporarily pause or resume work

Open the status control for a single relevant location → inspect current state, impact and available options → choose pause/resume/busy only if supported → confirm → show pending → owner confirms → refresh customer-visible acceptance and show the result. If request times out, show “We could not confirm the change”, read back state and prevent unsafe repeat. If outside hours or not published, show why resume cannot yet make it accepting.

### F. Network loss or service failure

Home labels affected information offline/stale/unavailable → user can review only available cached information within privacy rules → change controls requiring the service are disabled or explain the issue → Retry reconnects and refreshes → pending changes reconcile against their owner → never silently send queued mutations or say work completed without a response. Sensitive cached content and draft retention need explicit review.

### G. Mixed-capability business

An authorised merchant sees distinct Orders and Bookings, for example → the combined list labels each type and branch, with service-specific due times and actions → selecting a task opens its own owner-defined flow. Menu changes, stock adjustments and appointment capacity remain separate; one failing source cannot fabricate a whole-business zero or hide a working source.

## 5. State model and precedence

**Four independent questions:** (1) Is the business account approved? (2) Is this location/capability published? (3) Is it inside scheduled hours or has relevant capacity? (4) Is it currently accepting work? Owners define the real states and transitions. Avoid creating a single “live” flag that pretends these always agree.

| Condition | Home presentation | What may happen next |
|---|---|---|
| Setup incomplete | “Not ready to go live”; list true requirements. | Complete or submit the relevant requirement. |
| Review pending | “Awaiting review” plus known outstanding merchant actions. | Wait, correct requested changes or contact supported help. |
| Approved but branch unpublished | Business approved; branch not visible. | Complete branch requirements or follow approved publication flow. |
| Branch visible but outside hours | Visible; currently closed / not accepting if confirmed. | Change schedule only when allowed, or wait for next opening. |
| Branch visible and manually paused | Visible; paused / not accepting. | Resume if eligible and supported. |
| Branch accepting | Visible; accepting work, with source freshness. | Manage live work and availability. |
| Restricted or suspended | State clearly, with the approved reason and appeal/contact path if authorised. | Follow owner-defined resolution; do not imply a button can override restrictions. |
| Several branches differ | Display counts or a list by branch; do not collapse to one status. | Select a branch to act on. |
| Data missing, stale or conflicting | Mark affected source or value unknown/stale, show last update and retry; do not infer from another source. | Refresh or contact support; reconcile contradictory records at their owner. |

**Display precedence:** urgent safety or confirmed time-sensitive work first; then genuine blocking setup/operational issues; then active work and routine summaries. Access control applies before display. If sources disagree, show the independent facts with their sources/times where available and an issue message; never resolve the conflict by guessing. Priority ordering needs merchant testing and operational approval.

## 6. Universal interaction and failure states

Each module and action must specify, where applicable: initial/loading; skeleton or partial result; populated; true empty; filtered empty; not configured; not applicable; preview/sample; pending; confirmed; failed; outcome unknown; stale; offline; access denied; permission changed; expired session; and recovery. Preserve the difference between zero, no data and unknown. Display times in the agreed locale/time zone and distinguish last-updated from event time. For multi-source Home, a failure in one card must not suppress other confirmed cards or imply the whole dashboard is current.

For all changes: validate scope and permission on the responsible service → show immediate acknowledgement → show a clear pending state → show the owner-confirmed result or an honest failure/unknown outcome → refresh relevant summaries. Prevent accidental duplicate submissions; on conflict, show the latest confirmed value and require an informed retry. Exact transport, retry and idempotency policies require owner contracts.

## 7. Adaptation across 128 subcategories

One shared Home structure, with configurable capabilities and vocabulary; not 128 separate designs. Configuration is based on the actual enabled service, role, branch and owner contract, not the category label alone.

| Example | Priority/current work | Offering and availability language | Important distinction |
|---|---|---|---|
| Restaurant | New orders and genuine preparation issues. | Menu, items, hours. | Only show preparation/hand-off stages supported by the order owner. |
| Supermarket or shop | Orders and confirmed stock exceptions. | Products, stock, hours. | Substitutions or weighed goods appear only where supported. |
| Beauty service | Upcoming confirmed appointments. | Services, staff/slots. | A requested appointment is not automatically confirmed. |
| Event provider | Confirmed sessions and relevant capacity alerts. | Events, sessions, tickets if supported. | A booking is not an issued ticket until its issuer confirms it. |
| Rental or transfer | Confirmed bookings, pickups and return exceptions. | Fleet/assets, dates, availability. | Do not display a food preparation countdown. |
| Logistics / quote-based service | Requests, quotes and confirmed shipment milestones. | Services, service areas, quote availability. | Do not imply a shipment exists just because an enquiry was sent. |
| Financial or regulated service | Approved enquiries or appointments, if available. | Approved services and verified contact. | A category must never imply licence, payment or regulated transaction authority. |

For all 128, consult the coverage matrix and validate each mapping with the relevant domain owner and representative merchants. Unsupported or not-yet-launched capabilities receive a truthful unavailable state and a real route for help where one exists.

## 8. Original Home: retention crosswalk

| Original visible Home element | Proposed home or destination | Status of mapping |
|---|---|---|
| Greeting, merchant identity, “Not live yet” | H09–H13; distinguish identity and each actual status. | Proposed redesign. |
| Setup counts and seven-step checklist | H20–H23; applicable requirements with real counts and actions. | Preserve intent; exact requirements unverified. |
| Catalogue count, missing documents, payout warning | H29, H20/H22, H31/H32 and H36. | Preserve intent; verify authoritative counts and real actions. |
| Onboarding guide and Message ops | H24/H37; offer only supported contact routes. | Preserve help intent; existing reply capability uncertain. |
| Branches and add branch | H25–H27. | Preserve existing intent; permissions/branch policy to confirm. |
| Live orders and sample rows | H17–H19; real work, clearly separate labelled preview if offered. | Preserve live-work purpose; do not mistake sample for real. |
| Quick actions: documents, catalogue, counter phone, setup call | H36/H24, capability and permission permitting. | Inventory each original action; verify device pairing and booking exist before claiming support. |
| This week's money and payouts | H31/H32. | Preserve authorised finance overview; dates, totals and account actions require finance confirmation. |
| Featured slot promotion | H35/H55 and dedicated Promotions section. | Preserve access where supported and eligible; avoid competing with urgent work. |
| Notifications, help, account, sidebar, WhatsApp | H02/H04–H06/H37. | Preserve functions that actually exist; verify destinations and channels. |
| Consumer delivery-location banner visible in first screenshot | Assess why it appears on a merchant page; retain only if relevant to merchant tasks and correctly scoped. | Investigate, no silent removal decision. |

This crosswalk covers what is visible in the four supplied Home screenshots. It cannot guarantee retention of unseen, hidden, mobile, role-specific, or deployed functionality. Before implementation, inspect the actual deployed source and map all existing functionality and relevant requirements one by one.

## 9. Accessibility, UX principles and validation

- **Recognition and focus:** clearly name the selected location and next action; keep labels visible and group related state with its action. Do not force a fixed number of menu items based on Miller's Law.
- **Progress and motivation:** show truthful completed and remaining steps; no artificial deadlines or manipulative reminders. Make success and recovery clear.
- **Prompt feedback:** acknowledge interaction promptly; the often-cited 400 ms is a design heuristic, not proof of service completion.
- **Accessibility:** test keyboard, meaningful focus order, screen reader names and announcements, reflow/zoom, contrast, text labels in addition to colour, touch targets and reduced motion. WCAG 2.2 AA is a proposed target pending acceptance; no audit has yet been done.
- **Responsive and real-world:** prototype phone, tablet and desktop; long names, weak connections, mixed languages and multiple locations. Avoid controls that obstruct work. Test the actual devices and channels used by merchants.
- **Research scenarios:** observe setup, finding a blocker, acting on a real urgent task, switching branches, opening an unavailable source, pausing/resuming, and locating a missing payout using owner, manager and frontline roles. Include restaurant, retail, booking and mixed-capability merchants. Record completion, errors, recovery and confidence; agree success thresholds before evaluation.

## 10. Decisions and evidence needed before implementation

1. Identify the source/version of the deployed screenshot portal and inventory real Home actions, responsive states, routes, and the existing requirements; screenshots alone are insufficient.
2. Product, Operations and the relevant service owners define account, branch, approval, publication, schedule and acceptance states and conflicts; identify which actor can change each.
3. Compliance and Merchant define the scoped, category/capability-specific readiness requirements, document counts, reuse and review rules.
4. Finance settles payout schedule, scope, money definitions, setup/change and authoritative status; the supplied sources currently differ.
5. Work, Inventory, Booking, Event, Logistics and other owners confirm supported capabilities, task state machines, freshness and action contracts; do not turn proposals into implied live services.
6. Identity and Merchant approve role, scope, branch and session rules, including status-control permissions. Security/Privacy review sensitive information and cached/offline data.
7. Support confirms real channels, numbers, hours, message/ticket capability and escalation; notifications owner confirms delivery and read status.
8. Design/Product decide navigation labels, optional cards, whether to provide safe labelled previews, priorities, and the required mobile layout with merchants.
9. Establish pilot scope, test data, measurable completion and accessibility targets, explicit owners, acceptance and rollout plan before implementation.

## 11. Screen completion checklist

- [ ] Approve a complete inventory of original Home features and their new locations.
- [ ] Review H01–H58 with the product owner, merchants and each relevant service owner.
- [ ] Agree exact status wording, transitions, permissions, source freshness and fallback.
- [ ] Review each panel, dialog, empty/loading/error and recovery state on desktop and mobile.
- [ ] Validate representative food, retail, appointment and mixed workflows; then cover remaining 128 mappings through the agreed matrix and owner checks.
- [ ] Test a prototype with real merchants, including accessibility and low-connectivity scenarios.
- [ ] Accept a detailed implementation plan and owner contracts before building; report actual evidence separately.

**Next screen:** Work. This Home map intentionally does not claim to have mapped every internal state of Work, Offerings, Business, Money, Promotions, Insights, Settings or Help; those will be specified screen by screen.

## Statistics amendment, 31 October 2026

The [adaptive statistics specification](stats/README.md), [128 Home mappings](stats/profiles-128.md) and [collection contract](stats/collection-contract.md) extend H20,H33,H45-H50 and section7 with explicit bindings. Operational as-of counts, scheduled milestones, historic outcomes, resource denominators and financial figures remain distinct. Exact labels/cards/chart choices follow resolved onboarding answers, source support and viewer scope. This amendment replaces the earlier incomplete assumption that general Home adaptation alone specified all128 metric choices. Current screenshots are illustrative and predate these bindings.

## Automatic confirmation correction

[order-confirmation.md](order-confirmation.md) supersedes any generic per-order merchant acceptance implication. Normal native/API/webhook stock/resource-confirmed work proceeds automatically. Exceptional review cards/actions require an enabled matching rule and a concrete reason; source uncertainty and out-of-stock do not create approval tasks. Global accepting-work/open-pause controls are separate from accepting individual orders.
