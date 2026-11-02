# Settings across the merchant journey

Date: 1 November 2026. Screen: SC_SETTINGS. Status: proposed experience, not implemented functionality. The [coverage matrix](coverage.md) accounts for every baseline specialty and approved additional route.

## Purpose, people and boundaries

A merchant should be able to find a preference, understand its scope, change what they are permitted to change, see when it is confirmed and recover if it fails. Connection administrators also need to understand which system owns each business fact, what access it has and which work is affected by a failure.

An owner may manage permitted business connections and requests. A location manager may manage specifically granted local routing or connections. An operator may change their own preferences without access to business credentials. A finance user may inspect an accounting connection only with the relevant connection grant. These are task personas, not role grants. Every read and command requires the real identity owner's tenant, membership, location, capability and operation checks.

| Merchant task or fact | Owner and destination |
| --- | --- |
| Personal identity, login, recovery, supported factors, permitted session records | Settings → Account & security, through the identity provider. Protected business-owner identity follows the approved identity/Business flow. |
| Personal delivery preferences and authorized business notification routing | Settings → Notifications. Event support, delivery policy and channels remain owned by their actual services. |
| Language, date/time format and supported accessibility/display preferences | Settings → Preferences. Kenya time is fixed by the effective time contract. |
| Secure connector setup, authority, mappings and synchronization | Settings → Connections, through the registered integration owner. |
| Supported API credentials and webhook subscriptions | Settings → API & webhooks, through the developer-access owner. |
| Authorized data access/export and closure requests | Settings → Data & privacy, through the request and records owners. |
| Trading/legal identity, business contacts, categories, activities, locations, team access, documents | Business, with a scoped return link. Do not create duplicate editors in Settings. |
| Opening hours, resources, lead times, service duration and cancellation policy | Business/Availability/Offerings according to the existing owner. All merchant display, entry and recurrence use Africa/Nairobi; there is no timezone picker. |
| Prices, financial rails, payouts, settlement, merchant fees or financial disputes | Money or the authorized owner. A connection can export approved postings; it cannot change postings or payout authority. |
| Global category publication, city fees, platform dispatch and retention policy | Separately authorized platform staff tools. No merchant Settings path grants these powers. |

## Evidence and current implementation

The current merchant page is `apps/web/app/merchant/settings/page.tsx`. It displays a Business profile, Notifications, Account summary and privacy text. `MerchantSettings` in `apps/web/components/merchant/board-client.tsx` uses a fixed owner/managers/counter notification matrix and quiet-hour inputs. The update action calls `rpc_merchant_settings_update`; its definition in migration `20260101020300_what_the_merchant_boards_read.sql` permits a merchant member to update trading name, notification rules and quiet hours and records `merchant.settings_changed`.

This does not establish personal preference isolation, location-specific notification grants, generalized notification events, factor/session management, connectors, API keys, webhooks or export/closure jobs. Those are proposed contracts. Existing delivery-oriented alert copy is evidence of the current flow, not an approved policy for appointments, freight, healthcare or every other activity. The separate `settings.*` staff registry and its approval/rollback SQL cannot be reused as merchant authorization.

The effective `payload-reserve-plan/models.json` time contract supersedes older generic timezone suggestions in SC_SETTINGS: all merchant display, entry and recurrence use Kenya time, Africa/Nairobi; timed commitments persist as UTC instants and local dates remain dates. There is no timezone picker in this design. External mappings must normalize supported source timestamps correctly without changing accepted instants or treating a date as midnight UTC.

## Shared shell and navigation

Retain Home, Work, Offerings, Availability, Business, Money, Promotions, Insights, Settings. Select Settings only. Use the existing ink sidebar, cream canvas, white work areas and restrained gold emphasis. Keep Help, notifications and the signed-in account in the header. Do not add a Settings dashboard of scores, metrics or decorative cards.

The page heading is `Settings`, with `Manage your account, preferences and connected systems.` A compact `Search settings` field finds allowed destinations by label and synonym, for example alerts → Notifications and POS → Connections. Cross-screen results identify their owner, for example `Opening hours · Availability`. Search reveals destinations, not secret values, inaccessible providers, event names or counts. Keyboard users can open results, clear the query and return to their previous section. A no-match state says `No settings found` and offers Clear search and Help. It is separate from a missing source or access denial.

Use the same six section names in a stable order:

1. Account & security
2. Notifications
3. Preferences
4. Connections
5. API & webhooks
6. Data & privacy

These are destinations in the written route design, so implement them as links with the current-page state. Do not apply tab semantics to routed pages. Default first entry opens Account & security; a valid deep link opens its exact section. Unsupported developer access has one honest explanation if the actor can discover it, without an active key editor. If the actor cannot discover an area, omit it and do not expose it through search. Remaining destinations retain their order.

At wide sizes the six links fit beneath the heading. At narrower sizes use a labelled `Settings section` selector with the current section and all discoverable destinations. This is navigation and never an editable preference requiring Save. Avoid a second permanent sidebar beside the portal sidebar. Details open in the section workspace, with a breadcrumb and Back to list. Use a modal only for a short decision or reauthentication handoff, not an entire mapping editor.

Proposed route state contains a stable section ID, optional connection/request identifier, allowed business/location scope and safe return target. These are design references, not implemented endpoints. Never place tokens, verification codes, private intake, secret values or unrestricted external return URLs in route state.

## Scope, inheritance and change contract

The header's business/location context remains visible. One permitted location appears as text; multiple permitted locations use the shared selector. A section-level scope label explains what that context means for this setting:

| Scope label | Behavior |
| --- | --- |
| `Your account` | Personal preference applies to this signed-in user wherever that preference is supported. It does not become business-wide when the header location changes. |
| `Business · [name]` | Applies only to the selected tenant and explicitly supported locations/functions. The editor names the affected scope before saving. |
| `Location · [name]` | Applies to that authorized location. A connection can have a narrower function/data-class scope. |
| `Managed in Business` or `Managed by [source]` | Show confirmed value/summary and owner link where allowed. Do not offer an editable duplicate. |

Personal defaults and business routing are different records. Proposed location overrides are offered only when the owning service supports explicit inheritance and grants. A supported override displays effective value, source and `Use business default`. Removing it previews the actual inherited value. There is no assumed category → city → global precedence from the staff registry. If overrides are unsupported, describe the actual scope without a fake selector.

Each independent preference group has its own `Save changes` and `Cancel`. Do not autosave security, authority, destination or destructive changes. Native form controls can update a draft immediately; success appears only after the owner confirms the exact revision. An unsaved-change bar appears inside the active task region with the scope, not over unrelated pages. Cancel restores the latest confirmed values. Warn on navigation only when a real draft would be lost; allow Stay or Discard. Changing tenant/location never applies an existing draft to the new context.

Command design includes actor, tenant, resource/scope, expected revision, exact fields, operation/idempotency reference, preconditions and owner. Sensitive operations reauthenticate according to the identity owner's policy. A timeout shows `We could not confirm this change` and `Check status`; reconcile before allowing a retry. Concurrent edits display original, latest confirmed and proposed values for permitted fields, then require a fresh explicit submission. Never echo a secret in comparison, history or error messages.

## Account & security

Purpose: identify the signed-in account, maintain supported ways to sign in and recover access, and inspect permitted security activity. Business verification and merchant operational readiness are not account-security scores.

| ID | Content, fields and actions | Validation, source and outcome |
| --- | --- | --- |
| SE01 | Personal profile: permitted display name and verified login identities; `Edit profile` if supported. Separate link to Business identity. | Identity owner defines editable fields. Mask protected destinations appropriately. Changing a personal display name does not change a legal or trading name. |
| SE02 | Sign-in and recovery: current supported method, masked recovery destination, verification state; `Change` or `Manage sign-in`. | Reauthenticate as policy requires; validate provider-supported formats; pending destination verification leaves the existing confirmed method active. Expired challenges can be restarted through the owner. |
| SE03 | Additional authentication: factor type, enrollment state, permitted recovery options; `Set up`, `Manage`, `Remove` only if supported. | Identity-provider enrollment and confirmation govern state. A request is not an enabled factor. Explain consequences before removing a required/last method; enforce actual policy. Show recovery material only in its supported protected flow. |
| SE04 | Sessions: safe device/browser description, current session, last confirmed activity and supported revoke action. | Do not infer precise location or trusted status from an IP address. Revoke through the session owner, then refresh. Revoking the current session explains sign-out. No invented idle-expiry duration. |
| SE05 | Security activity: permitted event, timestamp/timezone, actor summary and safe outcome; filters only if supported; `Get help` for disputed activity. | Paginate authorized events. Do not display tokens, raw IP/provider payloads or another member's sessions without a grant. Empty means no matching permitted records, not proof that nothing occurred. |
| SE24 | Contextual security help and relevant history. | Return to the same section after the actual support or identity flow; recheck scope/revision. |

Desktop uses a readable main column of identity/sign-in groups and a smaller session/activity region when there is enough room. Do not use a large green `Secure` badge that claims more than the source verifies. Current-session text and verified-identity text describe specific facts. Mobile stacks the same groups; enrollment, recovery and session detail use full pages. Loading/failure of sessions does not block a permitted display preference elsewhere.

## Notifications

Purpose: choose supported alerts without confusing preference, verified channel, business recipient routing and actual delivery.

Begin with `Your notifications` or, for a granted actor, a separately labelled `Business routing` view. Switching views preserves their separate drafts and explicitly warns if one would be discarded. Do not silently change other team members' preferences. Team membership and escalation ownership link to Business → Team.

| ID | Content, fields and actions | Rules and outcome |
| --- | --- | --- |
| SE06 | Group events by actual activity and task: account/security, work needing attention, progress/outcomes, connection issues and supported summaries. Each event has available channels and a short effect description. | Resolve the actual event registry and grants. Show real channel labels, not a universal email/SMS/WhatsApp promise. Preference-on and destination-verified are independent. Events do not appear merely because a specialty can theoretically support them. |
| SE07 | Quiet hours: enabled flag, start/end Kenya time, applicable days if supported; fixed `Africa/Nairobi · EAT` label and explicit overnight summary such as `22:00–07:00, next day`. Separate mandatory/urgent policy explanation. | Validate owner-supported intervals and overnight boundaries. Do not infer 24-hour silence when start equals end. Display the owner's actual exception policy beside the setting; a personal quiet period does not change opening hours, availability, deadlines or financial policy. No timezone picker. |
| SE08 | Destination: masked value, actual verification state, `Verify`, `Change`, and `Send test` where supported. | Limit test access according to the service; do not invent rate limits. Queued, provider-accepted, sent, delivered where evidenced, failed and unknown remain distinct. Test success does not guarantee future delivery. |
| SE24 | Relevant preference history and contextual help; business-routing change history only with permission. | Show safe changed-field names, scope, time and confirmed outcome. Mandatory policy changes are read-only explanations. |

A salon selling products can have Appointments and Product orders groups. Appointment confirmation/cancellation and low-stock events need their own registered sources. A rental return due alert is not a delivery alert with a renamed heading. Enquiry-only providers receive supported enquiry events without a fake booking-accepted event. A membership credit alert requires the entitlement owner, not a recurring order flag. Clinical or sensitive purchase details never appear in a lock-screen preview just because the event can be delivered.

Desktop uses grouped event rows with channel controls, followed by a separately bounded quiet-hours group. The whole row is not a toggle. Labels identify event and channel, including for assistive technology. If a channel is unsupported, show a reason rather than an ambiguous disabled switch. Mobile uses event details with labelled controls, not a squeezed event-by-channel matrix. Save confirms only the edited preference group; verified destination and delivery retain their own states.

For the personal-notification concept fixture, event/channel choices and quiet hours are two fieldsets of one personal notification preference bundle, submitted atomically to the proposed notification-preference owner with one Save/Cancel region. The scope and dirty state name that bundle. Destination verification and business routing are separate operations and are not saved by that button. If an actual service cannot save the bundle atomically, give each owned group its own action and status rather than implying partial success is a complete save.

## Preferences

Purpose: make the portal readable in the user's context without altering accepted business facts.

| ID | Fields and actions | Rules and outcome |
| --- | --- | --- |
| SE09 | Supported language, date format, 12/24-hour format; supported display density and motion preference. Show a Kenya date/time preview. | Enumerate actual supported locales/options. Store formatting separately from canonical instants. Save language with understandable confirmation and a reversible return path. Do not imply an unsupported translation exists. |
| SE09 | Fixed `Kenya time · Africa/Nairobi (EAT)` informational row; supported device preference for motion if available. | Merchant display, input and recurrence remain Kenya time even when a device uses another zone. A device preference cannot override this time contract or quiet-hours interpretation. |
| SE23 | `Manage opening hours in Availability` and scoped Business setup links. | Formatting changes leave scheduling rules, commitments, posted financial dates and historic instants under their owners. No business-timezone editor or alternate-zone preference is offered. |

Default to a readable existing appearance. Offer only supported density/motion modes; do not add theme, text-size or currency controls without a product contract. Reduced-motion behavior should respect the supported system preference even before a persistent override exists. Any currency formatting preference must preserve original currency and exact monetary value; currency conversion and default sale currency are outside this proposal.

On mobile, show `Your account` directly beneath Preferences, then supported language/date/time format inputs, fixed Kenya-time information and a preview. Opening hours link to Availability separately. A bottom action region respects safe areas and keyboard space and cannot obscure focused fields or errors.

## Connections

Purpose: connect a supported system to an actual business function, establish precise data authority and keep affected operations understandable. A merchant without an ERP can use supported native or manual capabilities; no connector is a prerequisite merely to use Settings.

The list shows function, instance/provider display name, location scope, exact business-readable access summary, authorization state and data freshness. One connector instance can support several classes with different authority. Separate instance setup, ongoing synchronization and individual operations; a general `Connected` label cannot certify stock, bookings and accounting together.

| ID | Content and actions | Rules and outcome |
| --- | --- | --- |
| SE10 | Connection list; function/state filters, search by permitted instance/function; `Open` and `Add connection` if granted. | Keep failed instances discoverable. Read-only viewers can inspect safe summaries without credential access. First use explains native/manual options and supported connector setup. |
| SE11 | Choose business function, supported provider/method, instance label, authorized location and allowed data classes. Unsupported provider has `Request a connector` only if a real request path exists. | Category identity only suggests functions. Explicitly identify one instance. Do not claim compatibility with arbitrary vendors, URLs or imports. |
| SE12 | Inspect requested access and authorize using the secure owner flow. Resume a pending callback from a saved nonsensitive setup draft. | Credentials use approved secret storage; ordinary answers hold references. Callback validation, nonce/state, tenant binding and actual provider scopes are owner requirements. A consent return is not validated operational support. |
| SE13 | `Who manages this data?` table: class, authoritative source, supported reads/writes, direction, conflict rule and downstream use. | Native, external, read-only external or shared only with a registered conflict rule. No universal two-way switch or last-write-wins. Missing/ambiguous authority blocks activation of the affected class. |
| SE14 | Mappings workspace: permitted source field, target typed field, identifier, enum/unit/timezone/currency constraints, public/private class and sample validation. | Preserve external IDs and typed units. Unknown values remain unresolved. No arbitrary scripts/URLs as expressions. Sanitized samples exclude sensitive intake and secrets. Mapping version is distinct from sync state. |
| SE15 | Validate and preview initial import: source snapshot, rows assessed, matched/new/invalid/excluded counts when known, affected locations and write effects. `Confirm import` only when prerequisites pass. | No destructive replacement by default. Preserve per-record results. Preview cannot guarantee current source state; command rechecks revision/authorization before execution. Partial outcomes show exact failed subset without repeating completed writes. |
| SE16 | Overview/Activity and Mappings destinations; last confirmed success and class-specific coverage; `Refresh data` or `Validate` if supported. | A refresh is a scoped read/import operation with its actual semantics. Do not replay business writes. Display timestamp and timezone; unknown freshness is not Today. |
| SE17 | Expired access, validation error, unmapped values, quota, outage, conflict and outcome unknown; relevant `Reconnect`, `Review mappings`, `Check status` or Help. | Show affected classes and actions plus unaffected confirmed functions. Reconcile in-flight operations before replay. Do not substitute unknown capacity with zero/free inventory. |
| SE18 | `Disconnect` or `Change source` in the connection action menu. Preview exact functions, future access, open work and fallback; require actual confirmation. | Route authority migration through its owner and impact review. Disconnect does not erase history or revoke unrelated instances. A native fallback must itself be supported/configured; never silently take ownership. |
| SE24 | Safe connection history, contextual help and authorized diagnostics. | Explain errors in business language first. Restrict raw diagnostics; secret/token/provider payload values never enter screenshots or history. |

### Setup journey

Function and location → supported connector/method → requested access → secure authorization → per-class authority and mapping → validate → import preview and review → confirmed activation and coverage. Use named step progress and Back. Steps depend on the connector: omit an irrelevant import, explain an absent write operation and keep a file import distinct from a live connection. Persist nonsensitive draft identifiers, choices and mappings according to policy. Do not persist credential material as a draft.

Before the final action, show a readable summary: which instance, which location, who owns each class, which operations are allowed, which records may change and what remains unresolved. `Finish setup` cannot imply all data has synchronized. Confirmation may lead to `Import queued` or `Validation pending` with an operation reference; only the owner-confirmed state is Ready for the specific supported operations.

### Recovery example

Savanna Mobility has a read-only external fleet catalogue for Westlands. Rental availability is managed by NEXG. Catalogue authorization expired; last successful catalogue sync was 1 November 2026, 08:05 EAT. The page says `Catalogue updates paused` and `Reconnect fleet catalogue`. Existing safe catalogue facts retain their timestamp. A separate ownership row says `Bookings & availability · NEXG`; the error does not claim those functions failed. It also does not promise new reservations are possible without their independent capacity checks. Reconnect restores only this instance's supported read access. Future writes remain unavailable.

Desktop uses a connection list and a selected-instance workspace when both are readable. The detail begins with the business function, scope and action needed, then data authority, access, freshness and history. Mobile starts with the list and opens full-page detail. Advanced mappings have a full-page editor and preserved Back context, not a tiny nested drawer.

## API & webhooks

Purpose: manage explicitly supported programmatic access without making the merchant an administrator of platform policy.

| ID | Content and actions | Rules and outcome |
| --- | --- | --- |
| SE19 | Permitted credential list: safe label, environment if supported, allowed operations/location scope, version, last use if evidenced, expiry if defined and status. `Create`, `Rotate`, `Revoke` only with real support. | Preview minimal requested scope; actor cannot grant more than permitted. Deliver secrets only through the owner's protected reveal-once flow if supported. Do not store them in answers, URLs, logs or the visible list. Rotation overlap/expiry follows an explicit policy, not an invented duration. |
| SE20 | Supported webhook subscriptions: permitted destination, event set, scope, verification/signing state and safe delivery activity; `Add`, `Verify`, `Pause`, `Rotate secret`, `Retry` only as actually supported. | Endpoint validation, destination restrictions, signing and challenge behavior belong to the developer owner. Recheck event grants and payload privacy. Delivery attempt/replay cannot re-execute the business action. Show individual attempt status and unknown separately. |

Read and write support are distinct. An inventory-read key cannot change bookings. A credential valid for one location does not grant all-location access. Revocation confirmation explains affected integrations and future access and refreshes the exact credential record. Existing in-flight operations follow owner reconciliation. If no service exists, show `Developer access is not available for this workspace` with a real supported request/help path, rather than an active Create key button.

## Data & privacy

Purpose: explain permitted data and let an authorized person request access, export or closure through the proper owner.

| ID | Content and actions | Rules and outcome |
| --- | --- | --- |
| SE21 | Choose personal versus authorized business request, purpose if required, supported record types, location/date scope and format. `Review request` then `Submit request`. Permitted request history and actual artifact expiry. | Explain included/excluded data before submission. Exports retain row/field/tenant/privacy restrictions; they cannot widen access to customer contacts, clinical data, payment data or team records. Financial reports link to the approved Money/Insights export owner. |
| SE22 | Distinct `Close my account` and `Request business closure` where each is supported. Explain impact, ownership/continuity and unresolved obligations; verify actor and submit a request. | Account sign-out, personal erasure and business closure are different operations. No instant deletion promise or invented retention/response deadline. Business continuity, records, financial obligations and applicable policy determine eligibility. |
| SE24 | Request detail: reference, scope, requested time, actual status, next actor/action and supported cancellation/support path. | Submitted, reviewing, action needed, preparing, ready with expiry, declined, cancelled, completed and unknown only as the request service supports. A received request is not an approved deletion or completed export. |

History lists permitted requests, not a global audit feed. A ready file has the approved access control and expiry; a missing file is not a reason to regenerate without checking its request. Recheck permission before download. Previously downloaded material cannot be recalled by a UI badge. Closure belongs in a clearly separated consequential-actions group with explanatory text, away from routine preference saves.

## Every category, subcategory and mixed business

The shared six sections remain stable. The [coverage source](coverage.json) preserves each effective profile's guards and exact workflow/intake references. Fifteen operational model families compose only the applicable notification events and connection data classes; actual adapters/events must still exist. Native, external, hybrid-by-class and manual source modes retain their actual prerequisites. No source mode invents missing operational capability.

| Actual configured operation | Conditional Settings concerns; operational editor remains with its owner |
| --- | --- |
| Product orders | Catalogue/variant/stock class ownership and mappings; supported order/stock alerts; sensitive purchase preview controls. |
| Appointments and field visits | Provider/resource/calendar authority, external timestamp conversion into fixed Kenya time and supported request/appointment/arrival alerts; no clinical records in ordinary notifications or connector samples. |
| Rental intervals and transfers | Asset identifiers versus reservation/calendar authority; driver/vehicle joint constraints remain operational. Greeter-only transfer routes do not imply a rental fleet. |
| Sessions, spaces and entitlements | Dated capacity, space intervals and access/credit data remain separate classes. Pass enrollment is not a session reservation or attendance. |
| Requests, production and service jobs | Enquiry versus accepted commitment, specification versions, due-time mappings and supported approval alerts; enquiry-only specialty gates remain intact. |
| Collection/return, tours, freight and storage | Paired windows/custody, supplier confirmation, shipment milestones and dimension/quantity units keep their own identifiers, permission and freshness. Unknown evidence is explicit. |

A mixed merchant sees the union of actual configured functions. Deduplicate only identical scopes: notification identity retains registered event, activity, location, recipient scope and channel; connection identity retains instance, activity/location and leaf data class. Never collapse two locations or recipients because their event/class IDs match. Show each relevant scope/source. Do not duplicate personal settings for every specialty. Do not merge stock quantity, seats, provider-hours and storage volume into an ambiguous `Capacity` mapping. A connector shared across locations shows per-class/location results and partial failure, not a global healthy badge. A manager restricted to one outlet cannot infer another outlet's providers or counts from search or bulk summaries.

Future category authoring references existing setting modules, registered event/data-class IDs, actual supported commands and source guards. Publication validates known references, payload privacy, scope, typed mappings and permission requirements alongside onboarding and the other screens. Unknown events/classes fail validation. A new business behavior needs an explicit contract/adapter extension before it can become active. A merchant cannot publish platform capability through a Settings toggle. Preserve old configuration and accepted-work versions during changes and supported rollback; external migrations cannot be undone by merely reverting the displayed value.

## States, recovery and cross-screen effects

Inherit R01–R12 and A01–A10 from the shared screen contract. Apply them to each independent region, not as a whole-page failure whenever one provider is unavailable.

| State or interruption | Visible treatment and next action |
| --- | --- |
| Initial read | Stable heading, scope and labelled busy region; no fake selected switches. |
| First use / not configured | Explain the missing setup and show only an actual permitted setup/owner link. |
| Filtered empty | Retain filters/search and Clear; distinguish from no underlying connections/requests. |
| Not applicable / unsupported | Omit irrelevant controls; expose the supported alternative when discovery is allowed. Never show an empty working editor. |
| Invalid edit | Keep values, inline associated errors and a linked summary; focus the first relevant issue. |
| Saving / awaiting verification or provider | Acknowledge input promptly, then show the exact pending operation; protect against duplicate submissions. |
| Confirmed save | Persistent local confirmation beside the group, updated value/revision and timestamp where relevant; a toast is optional reinforcement. |
| Partial/stale source | Keep policy-permitted confirmed data with class/location timestamp; name unavailable operations. |
| Failed/offline | Keep safe draft where supported; Retry read or correction without replaying an unknown write. Do not cache secrets for offline access. |
| Outcome unknown | Check status by operation reference and reconcile before a new command. |
| Concurrent change | Review latest versus proposed permitted values and resubmit against a fresh revision. |
| Access removed | Stop reads/writes, clear unauthorized caches and provide a safe destination without leaking hidden details. |
| Expired session / interrupted reauthentication | Resume safe context after identity verification, then recheck grants, source and revision. |
| Cancel/back/switch scope | Restore list filters/selection/scroll; discard only actual draft when confirmed by the user. No business mutation. |

A confirmed personal display save refreshes the shell without changing operational data. A connection change refreshes the effective action/source state in Offerings, Availability, Work and Insights as relevant. A notification save confirms a preference, not a message. An API revoke invalidates future permitted access through its owner. A request updates request history, not the underlying data until its responsible owner confirms completion.

## UX decisions and tradeoffs

The user-created UX Decision Design skill treats principles as decision aids. The following are hypotheses to test with realistic tasks.

| Problem | Design decision | Principle and tradeoff / validation |
| --- | --- | --- |
| Merchants cannot predict where a setting lives. | Stable six named destinations, familiar form controls and links to owning screens. | Jakob's Law and mental models; test where merchants first look for quiet hours, opening hours and payout changes. |
| Every possible category option would overwhelm a merchant. | Show actual enabled operations inside common sections; use search and labelled advanced mapping. | Hick's Law, chunking and selective attention; do not remove essential consequences or force a seven-item navigation limit. [Hick's Law](https://lawsofux.com/hicks-law/) describes the choice-complexity concern. |
| Scope and source authority are easy to misread. | Put scope, authority and pending/confirmed feedback next to the related value/action. | Proximity, common region and recognition; a compact form must still show the consequence of a business-wide edit. |
| Different connectors carry unavoidable complexity. | Resolve known types and scopes, preserve identifiers, validate mappings and explain exceptions in business language. | Tesler's Law and Occam's Razor; simplify the task without hiding ownership or failure. [Tesler's Law](https://lawsofux.com/teslers-law/) motivates moving manageable complexity into the system. |
| Touch users miss small actions. | Usable target size/spacing; full-page mobile editors; reachable Save that does not cover content. | Fitts's Law; test with touch, keyboard and zoom rather than assuming a screenshot proves reachability. |
| External work takes time and can fail. | Immediate acknowledgement, truthful pending states, resumable safe draft and explicit final result/recovery. | Doherty threshold, flow and Peak-End Rule; prompt feedback is a target, not proof of completion or a universal 400 ms guarantee. |
| Routine controls compete with consequential changes. | Restrained emphasis on the current task; clearly separated disconnect/revoke/closure review. | Von Restorff effect and selective attention; no artificial urgency, shame text or default consent. |

Accessibility targets follow applicable [WCAG 2.2 criteria](https://www.w3.org/WAI/WCAG22/quickref/): keyboard and focus order, visible/unobscured focus, names and relationships, status announcements, error identification, contrast and reflow. Primary touch targets aim for 44 CSS pixels; evaluate the actual AA target-size requirement and exceptions separately. At 320 CSS pixels and zoom, forms reflow and tables have a labelled readable alternative. Do not use gold/green/red as the only meaning. Prefer a labelled select to an unexplained gear. Use text status, reduced motion and stable focus after asynchronous results. Screenshot review cannot certify conformance.

The [validation plan](validation-plan.md) defines the realistic tasks, contract gates, unresolved decisions and acceptance evidence needed before implementation can be called complete.
