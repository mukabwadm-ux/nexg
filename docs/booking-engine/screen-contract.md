# Shared screen and interaction contract

Status: proposed. Each screen specification inherits these rules and adds domain-specific behaviour. Feature IDs identify assessable interactions; references to this contract are deliberate reuse rather than omitted state planning.

## Shell and scope

Navigation order: Home, Work, Offerings, Availability, Business, Money, Promotions, Insights, Settings. Keep Help and notifications in the header. Business/location context, role and current source freshness remain available without competing with operational work. A single permitted location displays its name without a pointless selector. All locations is available only with appropriate scope.

The shared shell uses the existing NEXG ink, cream, white and gold palette. Existing tokens are a starting point; coloured text and focus contrast require measurement before a compliance claim. Use gold selectively for current navigation and primary actions, never as the only status cue. Do not use images or decorative cards to displace task data.

## Common feature metadata

Each feature's contract identifies: feature ID, selected merchant/location/capability, data owner, view permission, command permission, typed inputs, validation, preconditions, operation ID, pending and confirmed outcomes, refresh targets and recovery. The server remains authoritative. A visible control is not an authorization boundary.

Role examples used in design are owner, location manager, operator, finance and configuration administrator. These are proposed bundles of capabilities, not new grants. Final bundles must align with the identity owner. A manager may have no financial permission and a finance user may have no dispatch permission.

## Universal read states

| Code | State | Presentation and recovery |
| --- | --- | --- |
| R01 | Initial/loading | Preserve heading, scope and known layout; skeleton only the requested region; announce busy state. |
| R02 | Populated/current | Identify period, units and relevant freshness; render confirmed values. |
| R03 | First use/no records | Explain what is missing and give the applicable add/import/configure action. |
| R04 | Filtered empty | Show active filters and Clear; distinguish from no underlying records. |
| R05 | Not configured | Show specific prerequisite and direct edit/setup link; retain saved drafts. |
| R06 | Not applicable | Omit irrelevant controls while retaining a clear way to inspect configured capabilities in Business. |
| R07 | Unsupported | Explain the supported alternative or request path. Do not create an empty working-looking editor. |
| R08 | Partial/stale | Keep separately confirmed regions, show their timestamp/coverage, label affected data and offer scoped refresh. |
| R09 | Offline/unavailable | Explain affected actions and last confirmed data if retention permits; retry the read, not an unconfirmed mutation. |
| R10 | No access/access removed | Show neutral scope-appropriate message; stop reads/actions, clear unauthorized caches and return safely. |
| R11 | Expired session | Preserve nonsensitive draft where policy permits; reauthenticate and recheck revision/scope. |
| R12 | Source conflict/unmapped | Show the affected record/field and owner or operator resolution path; never silently coerce a value. |

Unknown is not zero. Missing is not an empty string. Unavailable source is not no business activity. A partial aggregate must name its coverage.

## Universal write states

| Code | State | Contract |
| --- | --- | --- |
| A01 | Editing | Label scope; validate useful constraints locally; collect exact inputs and show consequences. |
| A02 | Invalid | Field-level message and linked summary; keep input and focus near the first relevant issue. |
| A03 | Submitting | Acknowledge once, show pending and prevent accidental duplicate submission. |
| A04 | Awaiting owner | Display operation reference and what is pending; do not imply a submitted external change has been applied. |
| A05 | Confirmed | Show owner-confirmed result and next action; refresh affected screens under the same scope. |
| A06 | Rejected/failed | Explain a safe reason and recoverable correction; keep draft where appropriate. |
| A07 | Outcome unknown | Read operation/source state and reconcile before any retry. |
| A08 | Concurrent change | Show original and latest confirmed values, ask for an informed revised edit and revalidate. |
| A09 | Permission/state changed | Abort before mutation; refresh grants/state and explain the currently available path. |
| A10 | Cancel/close | Exit without a business mutation; warn only if actual unsaved work would be lost. |

Each workflow in the catalogue adds its actual domain states. Loading, payment processing and a rental being in use are distinct kinds of state.

## Interactions and navigation

Search and filters apply within authorized scope; preserve them in URL or agreed state. Clear resets a named safe default. Show result count only when known. Sort explains the criterion and does not guess urgency across unlike deadlines. Pagination retains filters and indicates incomplete coverage. Bulk actions show eligible and ineligible counts, explicit location scope and per-record outcomes.

Links navigate; buttons act. An expandable summary exposes expanded state. A row opens one unambiguous detail destination; nested actions remain individually named. Panels/dialogs have labelled close controls, focus management, appropriate Escape behaviour and return to the invoking control. Never trap focus in a nonmodal panel.

Confirm consequential actions using their real impact, such as stopping new availability or requesting a refund. Prefer reversible changes and undo when the owner supports it. A confirmation is not a substitute for safe commands and concurrency controls.

## Responsive and accessibility design

Desktop: consistent contextual header, one main task region and contextual details where they help. Wide operational tables may scroll horizontally with persistent row identification; do not reduce text to unreadable sizes. Mobile: retain primary fields and statuses, expose secondary fields in labelled details, use a full-page task editor where a drawer would become cramped. Keep all navigation destinations accessible through the main menu rather than truncating the list.

Keyboard order follows reading order. Visible labels, error associations, announcements for meaningful asynchronous results, text in addition to colour, reflow, zoom and reduced motion are specified targets. Primary touch actions aim for 44 CSS pixels; evaluate WCAG 2.2 AA requirements and exceptions separately. See [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## Data and component reuse

Common components consume normalized domain view models with data provenance, typed units and permitted action references. No screen reads arbitrary provider payloads or creates state transitions from a status label. Optional fields require schema and display metadata. Specialist components preserve asset calendars, custody, session capacity, dimensional freight and other meaningful differences.

## Acceptance scenario convention

Screen scenarios include fixture/profile, answers, source mode, actor/scope, initial state, steps, expected visible components, owner command, confirmed result and cross-screen refresh. Every screen must exercise R01–R12 and A01–A10 where applicable; record N/A with a reason. The 128 fixture set extends these examples, and the future-category suite checks newly published configuration against the same screens.
