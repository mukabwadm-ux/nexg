# Availability interactions, forms and states

Scope: the complete frontend experience using deterministic local sample sources. All confirmations, failures, roles and external-owner responses here are simulated. Onboarding is deferred.

## Common edit transaction

Every editable object carries business/profile, activity/offering, method, location/resource, revision and effective interval. Draft fields never modify applied data directly.

1. Open an exact scoped form; show inherited/current values and declared source.
2. Edit. Validate field syntax immediately when useful; validate interdependent rules on review. Dirty state is per scope.
3. Choose **Review change**. Show before/after, effective dates, units, target rows and affected existing work from the same sample revision.
4. If conflicting, keep the draft; explain the blocked resource/time/work IDs and offer Open in Work or change the proposed scope. No generic “approve anyway”.
5. Choose **Apply in preview** only when permitted and valid. Disable repeated clicks; preserve the stable operation ID.
6. The sample source returns applied, rejected, partial or outcome-unknown. Reconcile by operation ID before retrying an uncertain result.
7. On applied, show “Saved in this preview”, revision/effective time and local history. Recalculate only local sample displays. No live-system success language.

Saving a local draft and applying it to the local sample snapshot are distinct. The user can save an unresolved draft; it does not turn the schedule green. A persisted pending operation survives refresh. Closing a clean inspector does not prompt.

## Forms and field-level rules

| Form | Required inputs | Validation and result |
| --- | --- | --- |
| Weekly hours | Activity/location, weekday open/closed/unspecified, one or more start/end intervals for open days, effective date | Empty is unspecified, never closed. End after start, or explicit Ends next day. Reject overlap across adjacent days. 24-hour switch is explicit. Show affected future work and inherited values. |
| Template/copy | Source revision, target locations/resources, compatible activity/model, date range/effective date, override policy | Default keep target overrides. Diff every target; explain incompatible methods/units. Applying some targets never reports all succeeded. |
| Pause new intake | Location, activity, enabled method(s), reason, start, end or explicit manual resume | Does not alter published listings, stock or existing commitments. A saved future resume is scheduled; current pause clears only after sample source confirms. Existing hold completion follows its saved policy. |
| Busy mode | Actual supported behaviour and scope, reason, duration | Only render configured effects, e.g. suspend same-day intake or extend a permitted preparation estimate. No default prep-minute field for all merchants. |
| Exception/closure | Scope, date/range, all-day or start/end, reason, optional bounded recurrence | Affects future feasibility; inspect exact existing work. Never silently cancel. Known blocks prevent Apply until work resolution or a valid alternative interval. |
| Staff shift/break/absence | Existing eligible resource, dates, exact intervals, location where applicable | Validate shift/break containment, adjacent-day overlaps and shared-resource conflicts across permitted locations. Private record details can be redacted while its busy constraint remains. |
| Asset maintenance | Identified asset, exact interval, reason, scope | Show overdue actual custody separately. Show all affected future work. Closing a maintenance draft does not release an asset. Remove an applied preview block using a new recorded change. |
| Dated occurrence | Offering, exact date/start/end, declared resources, capacity quantity/unit, booking opening/cutoff | Verify actual dated occurrence and anchor resources. Reserved + valid held + remaining = total for the same pool/snapshot. No negative remaining or booking-count-as-participants error. |
| Capacity edit | Pool/resource, typed quantity/unit/precision, effective interval, reason | Compare distinct obligations once. Reject below obligations. Handle concurrent change with a fresh diff. No automatic kg/cbm or sqm/sqft assumptions. |
| Recurring series | Base intervals, recurrence, end/count, exception dates, scope this/future | Bounded dated preview, explicit count and skipped-date reasons. Preserve edited occurrences and existing rights. A subscription does not pre-reserve child services. |
| Internal availability test | Offering/version, activity/method, location, requested span, party/quantity/unit, applicable customer-area sample | Explains every required dependency and source state. Results may simulate available/request-only/unavailable/unknown/requirements pending. No real customer, payment or reservation. |
| Sample hold | Valid internal test result, actual joint resources/units, mock requirements and expiry policy | Hold occupies the same shared local snapshot used by schedule/Work adapter. A fee requirement is displayed, edited in Offerings and collected only through the appropriate Work/Money preview. |
| Import | CSV file, field mappings, explicit targets/timezone/units, conflict policy | Validate headers, bounded file size, dates, overnight meaning, IDs, unit precision and source ownership. Reject incompatible rows with line reasons. Preview, then explicit selected-row apply. No backend upload. |
| Export | Authorized preview scope, date range, columns | Use local CSV download with escaped values and protection against spreadsheet formula interpretation. Clearly mark sample data; exclude hidden/private fields. Calendar-feed publishing is deferred. |

Rules that belong to Offerings or Business show read-only values and a context-preserving edit link instead of a second local writer.

## State catalogue

| State | What the merchant sees | Available recovery |
| --- | --- | --- |
| Initial loading | Stable shell, scoped skeleton, “Loading sample schedule” | Avoid an empty calendar presented as available |
| No configured activity | Explain no activity is selected/configured | Choose sample activity or open existing Offerings; no onboarding task in this scope |
| Missing required setup | Exact missing duration/resource/unit/authority reference | Open relevant owner or choose a complete sample; no guessed model |
| No resources | “No resources linked to this activity” | Link existing eligible resources in the appropriate editor |
| No dated sessions | “No sessions published for this range” | Add occurrence if permitted; never show invented daily capacity |
| Filtered-empty | Active filters and total context | Clear filters/change date |
| Intentionally closed | Explicit closed interval and applicable intake policy | Edit if permitted; future intake can remain open |
| Unspecified hours | Missing schedule labelled unknown/unconfigured | Complete hours; not “Closed” or “Open” |
| Confirmed unavailable/full | Exact source-confirmed constraint and as-of | View alternatives or responsible work |
| Current sample | Current revision, coverage interval and as-of | Refresh sample or inspect source |
| Stale | Last confirmed snapshot with stale badge and restricted test outcomes | Refresh; failure retains last-confirmed data without pretending current |
| Partial/unmapped/unknown | Affected resources/fields and known coverage | Inspect source/details; do not infer free capacity from absent rows |
| Simulated external read-only | Owner label, values and unavailable edit reason | Open supported sample source details; no fake connection wizard |
| Role read-only | Allowed scope and reason editing unavailable | Inspect permitted fields; fixture role switch only in sample panel |
| Unsaved draft | Inline unsaved indicator and explicit scope | Review/save draft/discard local edits |
| Saved draft | “Draft saved locally; not applied” | Resume/review/discard |
| Validation failure | Summary linked to fields plus inline errors | Focus first relevant error, retain every value |
| Impact review | Before/after, effective time and affected IDs/units | Change scope or Open in Work |
| Known conflict | Exact blocking rule beside affected content | Resolve in Work, return, refresh impact |
| Apply pending | Progress and operation reference; repeated click disabled | Leave safely if operation persisted; inspect result on return |
| Outcome unknown | “Result being checked”; keep last confirmed snapshot | Check operation; retry using same ID only after reconciliation |
| Applied | “Saved in this preview”, revision and effective time | Inspect history; a reversal is a new change |
| Rejected | Specific sample owner reason and current revision | Reload/compare and reapply valid draft |
| Partial bulk result | Successful/failed/unknown targets separately | Retry failed targets with stable per-target IDs; don't repeat successes |
| Cross-tab revision conflict | Your draft versus current applied revision | Reload diff, retain draft, resolve explicitly; no silent overwrite |
| Storage unavailable/quota | “Changes could not be saved locally” | Keep input in memory, export permitted draft or retry; no false persisted success |
| Corrupt saved preview | Explain unusable own preview state without deleting other screens' data | Reset Availability's namespace with explicit scope; retain valid other namespaces |
| Offline simulation | Last-confirmed sample and drafts labelled; simulated authoritative apply restricted | Continue local draft, restore sample source and reconcile |
| Scope changes with dirty edits | Name existing draft scope | Save draft, stay or discard; never apply it to the new profile/location |
| Expiry reached, unconfirmed | “Expiry being checked”; hold still displayed | Release only after simulated owner expiry result |
| Local sample reset | Exact profile/location/reset impact; separate confirmation only for real loss of local edits | Reset own data and coordinated sample scenario, never actual work |

Actual local browser functionality does not require a network connection. “Offline/source unavailable” above is a deliberately selected scenario for the future connected experience. Do not disable local draft editing merely because the browser reports offline.

## Complete merchant journeys

### A. Orders: hours, split intervals and a scoped intake pause

Nairobi Collective → Orders → Westlands → Schedule. Tuesday's hours are open; delivery accepts new orders while collection is paused until 13:00. Existing Work stays intact.

Edit Thursday to 08:00–12:00 and 14:00–21:00. Review before/after, effective date and any commitments. Apply locally. Internal test at 13:00 explains the gap; delivery and collection follow their separately configured intake rules. Test at 15:00 can pass when its inventory/window snapshot is current. No stock is edited here.

Schedule collection resume. Until the mock acknowledgement arrives, retain “Resume pending”. Closed physical doors can still permit tomorrow's scheduled orders if that method explicitly supports advance intake.

### B. Appointments: a joint hold, fee prerequisite and a break

Zuri Studio → On-site appointments → Westlands → Tuesday 3 November 2026. Hold BK-1048 occupies Amina and Treatment Room 1 from 10:00–11:00, with a 15-minute after-buffer. The inspector names one booking and both resource claims; booking counts deduplicate its ID.

At snapshot 09:40, its configured hold expires 09:45 and its reservation fee is awaiting collection. No capacity is confirmed merely by a fee event. At 09:45 show “Expiry being checked” until the sample owner response releases the hold and its buffer. A successful mock prerequisite/commit result instead converts that same allocation to confirmed according to its saved policy.

Adding Faith's 13:00–14:00 break changes only her actual constraints. Filtering out Treatment Room 1 must not make Amina appear bookable when that room is occupied. The internal test explains the hidden dependency.

### C. Rental: overdue custody, maintenance and existing work

Nairobi Mobility → Self-drive rentals → Industrial Area → 2–8 November 2026. RAV4-01 is still physically out after its planned 2 November 18:00 return. Show an open-ended actual-custody bar, bounded only by the visible view edge, labelled ongoing/overdue; future forecast is uncertain.

Propose maintenance for 4 November 08:00–5 November 18:00. Existing confirmed BK-2071 begins 5 November 09:00. Impact shows this booking and warns separately about overdue custody. Apply is unavailable. Save the maintenance draft or open affected Work. A later local Work reassignment/return event updates the same fixture records; returning revalidates before Apply. No silent cancellation or fabricated actual return.

A separate source-unknown Corolla row remains unknown despite no drawn reservations.

### D. Tables and spaces

A restaurant's Orders activity remains hours/intake. Only its explicitly enabled Table reservations activity uses SPACE_RESERVATION. A party of five requires a compatible table or approved combination with correct turnover. Reducing a shared space's capacity below held/confirmed places is rejected. Two compatible tables combined for one party claim both physical resources once; do not offer either individually during that interval.

A reservation fee prerequisite can appear in its hold inspector, with policy link to Offerings. Payment collection stays in Work/Money.

### E. Sessions, remote sessions and memberships

A group class has a real dated occurrence: total 12 places = 7 reserved + 2 valid held + 3 remaining at one snapshot. A request for four is unavailable; reducing total to eight fails with affected work. Instructor and room anchor the occurrence without multiplying participant capacity.

A remote session uses its provider/virtual capacity, never an invented treatment room. Private access details remain hidden.

A gym membership shows access-hours/validity context. A trainer booking consumes the trainer calendar; buying ten credits does not reserve ten appointments.

### F. Production, linked windows and service jobs

Cakes: show due workload in configured units and working days/cutoff; no meeting calendar. A fully configured standard request can simulate automatic confirmation after checks; bespoke customer quotation/approval remains a separate genuine milestone.

Laundry: customer drop-off commits no collection driver. Firm collection/processing/return promises check all required roles; assessment commits only incoming intake and labels later roles uncommitted. Changing one leg revalidates all required future roles.

Car wash/workshop: queue-only, scheduled intake and actual bay/team work remain explicit alternatives. A vehicle waiting for parts occupies custody/holding space only when configured; it must not occupy a mechanic forever by inference. Estimated completion is labelled an estimate.

### G. Travel, freight, storage and enquiries

Tours distinguish shared departure places from private multi-day guide/vehicle roles and supplier state. Airport meet-and-greet without transport consumes only actual greeter capacity. Field-service coverage never guarantees a free team.

Freight shows loading/leg windows and independent weight/volume/carrier constraints. Storage shows exact occupancy units/period and separate access/handling slots; release follows actual sample custody. A quote enquiry consumes no guaranteed cargo/storage capacity until a real configured commitment exists.

Regulated enquiry intake never implies regulatory approval. Customer quote decisions and supported named human exceptions remain visibly different from normal automatic resource confirmation.

## Navigation and recovery details

Deep links carry offeringId, activity/model/workflow, locationId, workId when relevant, date/range, filter and an allowlisted return destination. Revalidate current IDs/revisions on arrival. A stale/deleted reference explains what changed and offers a valid scoped destination.

Work handoff preserves the local Availability draft separately. If the current Work source cannot persist/reconcile the linked fixture action, the frontend must say so and keep Apply blocked; it must not simulate a successful cross-screen resolution using an unrelated record.

Source refresh or another tab must not overwrite a dirty form. Compare revisions, retain input and update the impact preview explicitly. Switching profile must restore only that profile's draft and last selected view.

