# Shared portal components

Status: proposed design, 29 October 2026. This catalogue covers the 128 profiles and future categories. Existing components need behaviour and accessibility verification.

## Component contracts and configuration

Use shared controls, domain components and specialist components. A manifest selects registered variants and schemas, with no JSX, remote scripts, raw provider payloads or new permissions. Keep specialist interactions where generic forms would misrepresent the task.

Every component receives `PortalContext`: business and tenant reference, permitted location scope, locale, time zone, role/grant decision reference, resolved configuration version and navigation return context. UI scope comes from the authenticated server decision. Changing a selector cannot widen it.

Data contracts provide values separately from quality: confirmed/unknown, freshness and coverage, authoritative source, version and permitted actions. A `FieldDefinition` references a typed question/offering schema, label, unit, dependency, validation, purpose and visibility. A `CommandAction` references a registered command, subject, preconditions, expected version, scope, consequence, confirmation policy and operation state. Source adapters never choose the merchant's permissions.

Shared state set `U` is loading, partial, populated, true empty, filtered empty, unconfigured, unsupported, stale, offline, access denied, permission changed and failed with recovery. Shared action set `A` is idle, validating, pending, confirmed, rejected, conflict, unknown outcome and retry/reconciliation. Use applicable states rather than rendering every state at once. Missing data is never a false zero; a partial list cannot claim a complete total.

## Shared controls

| Component ID | Contract and behaviour | Variants and states | Screen feature families |
| --- | --- | --- | --- |
| `CMP_PORTAL_SHELL` | Resolved navigation, location selector, help, notices and return context | Single/multiple locations; expanded/compact; permission refresh | All `SC_*`; WK/OF/AV/BU/MO/PR/IN/SE |
| `CMP_ACTION` | Link or registered command; label, consequence and operation state | Primary/secondary/destructive; disabled with reason; `A` | All |
| `CMP_FIELD` | Typed value, description, required condition, error and dependency | Text, integer/decimal with unit, boolean, date, zoned time, reference, single/multiple choice | All forms |
| `CMP_FIELD_GROUP` | Related fields with a named purpose; hidden-value retention policy | Inline, disclosure, step; conditional errors and missing dependency | OF, AV, BU, PR, SE |
| `CMP_FILTER_BAR` | Query, explicit filters, count coverage and named reset | One/many work types; location/period; filtered empty, saved view failure | WK, OF, MO, PR, IN |
| `CMP_DATA_LIST` | Stable row key, columns/cards, pagination cursor, sort and selected rows | Table/card; bounded bulk selection; `U`; cross-page selection explicit | WK, OF, BU, MO, PR, IN, SE |
| `CMP_STATUS` | Domain status definition, text, relevant time and next permitted action | Neutral/progress/attention; unknown/stale; no colour-only meaning | All |
| `CMP_DETAIL_CONTAINER` | Title, subject, hierarchy, close/back and draft state | Desktop panel, mobile destination; focus restore and unsaved changes | All |
| `CMP_CONFIRMATION` | Exact subject, scope, consequence and confirm/cancel | Reversible action or irreversible command; pending/unknown; no blind repeat | All mutations that need confirmation |
| `CMP_UPLOAD` | Requirement, allowed type/size, upload reference and validation | Camera/file; progress, retry, rejected replacement, expiration | OF, BU, SE |
| `CMP_SOURCE_NOTICE` | Source label, last confirmation, freshness, coverage and permitted recovery | Readonly, externally managed, partial sync, reconnect | All connected records |
| `CMP_VALUE` | Explicit money/quantity/duration/time contract | Currency, unit, zone; masked financial value, unknown, zero | All |
| `CMP_FEEDBACK` | Scoped operation result, next action and announcement priority | Inline error/success, brief toast, persistent blocker | All |

Existing `packages/ui` has buttons, fields, inputs, selects, chip groups, tables, status badges, detail panels, file drop, empty states, switches, skeletons and toasts. Reuse their useful behaviours after reviewing contracts. New source, scope and domain behaviour must not be implied by their present component names.

## Domain components

| Component ID | Data contract | Actions and adaptation | Required additional states | Screen |
| --- | --- | --- | --- | --- |
| `CMP_WORK_QUEUE` | Work reference/type, workflow version, location, due context, current stage, primary action, source freshness | Filter by enabled work family, search, open, permitted assign/accept; omit irrelevant food stages | Mixed families, partial source, no actionable work, time-sensitive confirmed exception | `SC_WORK` WK |
| `CMP_WORK_DETAIL` | Customer information by purpose, ordered offering lines, service facts, notes, amounts and linked records | Inspect, contact through supported channel, open applicable execution component | Restricted contact, amended request, source record removed, history-only | `SC_WORK` WK |
| `CMP_TRANSITION_BAR` | Owner-defined allowed transitions and their actor/guard | One clear next action; request reason or evidence; confirm cancellation | Invalid state, permission loss, missing resource, conflict, unknown outcome | `SC_WORK` WK |
| `CMP_WORK_TIMELINE` | Confirmed domain events with actor/source/time; pending command shown separately | Expand evidence, open linked case or operation | Gaps, external event not confirmed, corrected event | `SC_WORK` WK |
| `CMP_OFFERING_EDITOR` | Registered offering schema, stable IDs, publication, external ownership | Product/menu/service/asset/event variants; draft, validate, preview, publish where authorized | Unsupported price model, missing dependency, readonly external record, rejected publication | `SC_OFFERINGS` OF |
| `CMP_PRICE_EDITOR` | Fixed, unit, variant, quotation, rental or approved package pricing contract | Edit authorized rates; show included/excluded scope and currency | Unpriced quotation, invalid scale/unit, external price lock | `SC_OFFERINGS` OF |
| `CMP_STOCK_VIEW` | On-hand/reserved/available, unit, location, effective time and authority | Supported adjust/count/reserve; source link; substitutions only with contract | Unknown quantity, oversubscription, partial count, pending reconciliation | `SC_OFFERINGS`, `SC_AVAILABILITY` OF/AV |
| `CMP_CALENDAR` | Resource/session slots, time zone, holds and reservations | Inspect, select, propose booking, reschedule through owner commands | Conflict, DST/zone boundary, expired hold, partially loaded range | `SC_AVAILABILITY`, `SC_WORK` AV/WK |
| `CMP_AVAILABILITY_RULES` | Weekly hours, exceptions, duration, buffers, lead time and capacity | Configure applicable model; preview resulting dates before save | No schedule, contradictory rule, capacity below committed work | `SC_AVAILABILITY` AV |
| `CMP_RESOURCE_PICKER` | Permitted staff/assets/rooms/vehicles with suitability and available period | Automatic/manual/unassigned mode; show reason when unavailable | Resource unknown, unavailable, moved location, concurrent allocation | `SC_AVAILABILITY`, `SC_WORK` AV/WK |
| `CMP_FULFILMENT` | Method, responsibility, route/service address, milestones and proof requirements | Delivery, collection/return, visit, digital or venue execution | Handoff declined, failed attempt, missing proof, source outage | `SC_WORK` WK |
| `CMP_BUSINESS_RECORD` | Legal/display identity, locations, service areas and configured capabilities | Edit scoped facts, preview customer display, request reviewed change | Verification pending, publication blocked, unpublished location | `SC_BUSINESS` BU |
| `CMP_REQUIREMENTS` | Applicable requirement, reason, evidence, review status and expiry | Upload, replace rejected evidence, open actual support route | Waiting review, rejected, expired, waived only by authority | `SC_BUSINESS` BU |
| `CMP_TEAM_ACCESS` | Member, scoped grants, invitation and server-evaluated action allowance | Invite/change/remove where permitted; preview affected locations | Invitation expired, last-owner restriction, mid-session revocation | `SC_BUSINESS` BU |
| `CMP_TRANSACTION_BREAKDOWN` | Currency/period/scope; amount, fees, refunds and state definitions from finance | Inspect references, open refund/dispute where supported | Partial ledger, unsettled amount, held payout, finance access denied | `SC_MONEY` MO |
| `CMP_STATEMENT` | Finance-owned totals, included records, period and document generation status | Request/download supported statement; retain scope | Pending generation, unavailable period, incomplete reconciliation | `SC_MONEY` MO |
| `CMP_PROMOTION_EDITOR` | Registered promotion type, funding/rules, eligibility and approval | Draft, validate, schedule/pause only supported types | Ineligible, conflict, rejected, budget pending, ended | `SC_PROMOTIONS` PR |
| `CMP_REPORT` | Metric definition, dimensions, period, comparison and completeness | Filter, inspect contributing records, accessible table/export | No comparable period, partial source, zero versus unavailable | `SC_INSIGHTS` IN |
| `CMP_CONNECTION` | Connector declaration, authority decisions, authorization/setup/sync states | Connect, map, validate, sync, reconnect or disconnect within scope | Expired authorization, unmapped class, readonly, partial and unknown | `SC_SETTINGS` SE; contextual notices elsewhere |
| `CMP_SYNC_ISSUES` | Affected data/operation references, reason and permitted resolution | Inspect, correct mapping, reconcile, controlled replay | Conflicting authority, exhausted retry, unresolved unknown outcome | `SC_SETTINGS`, `SC_WORK`, `SC_MONEY` SE/WK/MO |
| `CMP_PREFERENCES` | Account/profile/security/notification preference and actual delivery capability | Save preference, supported security journey, review device/session | Save failed, verification required, channel not connected | `SC_SETTINGS` SE |

Bulk commands use explicit row scope and per-record results. A success count must not hide failures or apply a transition to an unauthorized record. Cross-screen links retain permitted location, time range and source filters.

## Specialist components

| Component ID | Contract and variant | State/action requirements | Screen |
| --- | --- | --- | --- |
| `CMP_PICKUP_RETURN` | Collection and return legs, item counts/condition and turnaround | Separate possession, inspection and delivery confirmation; missing item and failed collection recovery | `SC_WORK` WK |
| `CMP_RENTAL` | Asset, date range, handover, deposit reference, return and condition | Availability hold is not confirmed booking; late/damaged return requires approved policy | `SC_WORK`, `SC_OFFERINGS`, `SC_AVAILABILITY` WK/OF/AV |
| `CMP_FREIGHT` | Measurements/units, cargo details, route, quote and shipment milestones | Validate dimensions; quote before dispatch where required; customs uncertainty remains explicit | `SC_WORK`, `SC_OFFERINGS` WK/OF |
| `CMP_STORAGE` | Capacity unit, location, occupancy period, intake and release | Overlapping commitments, unknown measured capacity, release evidence | `SC_WORK`, `SC_AVAILABILITY` WK/AV |
| `CMP_EVENT_SESSION` | Session, attendance/group size, capacity, reservation and issuer reference | Booking, attendance and issued ticket remain distinct; cancellation and partial group changes | `SC_WORK`, `SC_OFFERINGS`, `SC_AVAILABILITY` WK/OF/AV |
| `CMP_REGULATED_ENQUIRY` | Approved enquiry fields, verified service scope and document requirements | Explicit confidentiality, limited contact exposure, appointment/enquiry only where no transaction authority | `SC_WORK`, `SC_BUSINESS` WK/BU |
| `CMP_REMOTE_SESSION` | Confirmed schedule, attendance and approved connection method | Link not ready, provider outage, no-show, authorized reschedule; protect access details | `SC_WORK`, `SC_AVAILABILITY` WK/AV |
| `CMP_SERVICE_JOB` | Assessment, approved quote, task checklist, materials and completion evidence | Distinguish estimate from consented work; additional cost needs supported approval | `SC_WORK` WK |

A new specialist component requires its contract and behaviour to be implemented and verified before a category can enable it. A metadata label cannot manufacture the capability.

## Layout, accessibility and validation

Operational priority determines placement. On Work, queue and task actions dominate; Money gives totals their precise scope; Availability keeps calendar and constraints together. Progressive disclosure places supporting detail behind named controls while preserving decision-critical information. No fixed choice limit follows from a named UX law.

Desktop detail panels become mobile destinations when width is insufficient. Keep one coherent focus order, labelled controls, status text beyond colour, keyboard-operable menus, announced validation and focus restoration. Tables offer readable card or scroll behaviour without dropping important fields. Charts have a table alternative. These are targets, not an audit claim.

Verification uses real merchant fixtures: complete task with keyboard, long name/label, multi-location scope, unknown versus zero, permission removed during a draft, stale external value, failed mutation, duplicate submission and return navigation. Component contract tests support each applicable screen's acceptance cases; they do not replace the 128-profile mapping or connector-specific evidence.
