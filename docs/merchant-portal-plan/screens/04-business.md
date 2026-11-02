# Business

Screen ID: SC_BUSINESS. Status: proposed design. Planned after Availability. Inherits the shared screen contract.

## Purpose and boundaries

Maintain the business identity, enabled activities, locations, fulfilment responsibilities, people, documents and readiness that govern the portal. Business reuses the onboarding registry and configuration resolver, so a merchant can revise the original answers without a separate inconsistent setup form.

Settings owns individual account/security preferences and connection credentials/configuration journeys. Business shows the operational effect and prerequisites of those connections. Money owns verified settlement and financial history; Business can show a permission-scoped completion link. Shared Help provides support and cases. Reviews can be managed under Business → Customer feedback if their owner supports replies/moderation; disputes remain linked to the relevant Work/Money case.

## Layout

Header shows business identity and scoped independent statuses. Tabs: Profile, Activities and setup, Locations and coverage, Team, Documents, Customer feedback. Readiness is a precise list of blockers/actions grouped by capability, not a universal checklist for five menu items.

Each tab has a main list/editor and a supporting customer preview or concise explanation. Identity or location edits show who can change the fact and the review consequences. A pending legal-name correction is shown as pending while the confirmed name remains authoritative.

## Feature inventory

| ID | Feature and data | Action, permission and effect |
| --- | --- | --- |
| BU01 | Business overview and independent status | Read account approval, location publication, accepting state and setup coverage with source freshness; inspect each reason. |
| BU02 | Trading/public profile | Edit permitted name, description, media, verified contact presentation and public attributes; review customer preview and save through owner. |
| BU03 | Protected identity/contact changes | Display masked sensitive values as appropriate; request a reviewed change where current contracts require staff. Do not turn existing protected columns into casual edits. |
| BU04 | Activity and specialty configuration | Add/remove supported activities, edit applicable onboarding questions and inspect 'why this appears'. Generate a configuration diff before activation. |
| BU05 | Readiness and guided completion | List requirement, reason, responsible party, status and exact action. Distinguish merchant task, owner review and unsupported dependency. |
| BU06 | Configuration preview | Preview discovery and all relevant portal types for draft answers; compare current/proposed revision without mutating live work. |
| BU07 | Configuration revision/history | Inspect answer/rule versions, actor, explanations and affected entities; propose restore through current validation rather than rewriting history. |
| BU08 | Locations directory | Search permitted locations, types, publication, configured activities and readiness. One location stays simple; all-locations totals disclose coverage. |
| BU09 | Add/edit venue, pickup point or service location | Typed address/pin/contact/timezone and location type; coverage checks apply to applicable fulfilment, not unrelated remote activity. |
| BU10 | Service area and coverage | Define supported regions/radius/polygon or declared destinations through owner-approved models; validate units and method eligibility. |
| BU11 | Location activities and inheritance | Set explicit overrides for declared fields; preview differences and effect on future work. Protected global rules remain inherited. |
| BU12 | Publish/unpublish/close location | Show prerequisites and consequences; request owner transition, retain existing obligations and accurate pending state. Archival requires policy checks. |
| BU13 | Fulfilment responsibilities | Edit enabled methods, responsible teams/providers, instructions and source links; display missing fleet/connection/coverage prerequisites. |
| BU14 | Team directory | Names appropriate to role, membership, location scope, state and operational resource links. Search/filter without exposing unauthorized teams. |
| BU15 | Invite, role/scope assignment and removal | Use identity owner; preview grants, invite/acceptance state and impact on assignments. Prevent privilege escalation and follow approved last-owner policy. |
| BU16 | Staff/driver resource linkage | Link a member to eligible scheduling/dispatch resources only through owner checks; membership and operational qualification remain separate. |
| BU17 | Document requirements and versions | Requirement applicability, reason, essential flag, expiry and confirmed review status; preserve prior versions and audit links. |
| BU18 | Upload, replace and correct documents | Camera/file with allowed type/size/expiry; allow replacement of rejected/expired records, retain useful draft and show upload versus review states. |
| BU19 | Submit/review changes and respond to requests | Submit affected requirement or configuration revision, inspect reviewer requests and correct exact fields. No self-verification. |
| BU20 | Communication preferences for the business | Persist approved business contact/channel choices; delivery capability and account notification preferences are separate. Unsupported channels are not promised. |
| BU21 | Feedback/reviews and public claims | Read consented feedback and verified display status; supported reply/report flows are versioned and permission-scoped. Never edit a customer's review body or invent ratings. |
| BU22 | Support/change/appeal cases | Open existing case channel with selected requirement/location/work context; status/reply delivery through support owner. Do not fabricate support contacts. |
| BU23 | Export/profile audit | Authorized business/setup records with scope, versions and generation status; restrict document and personal-data downloads. |
| BU24 | New specialty/category request | Merchant describes unmet activity and desired workflow. Record request, show current supported alternative and route to category-authoring operators. A free-text category is not immediately published. |

## States and transitions

Business approval, publication, configuration validity, operational acceptance and individual document state are shown separately. Document states include needed, upload in progress, uploaded, review pending, changes requested, verified, expired and unavailable only where the document owner defines them. Old and replacement versions are labelled; a rejected upload remains replaceable.

Activity edits follow draft → validation → impact review → submitted/confirmed according to owner policy. An externally managed setting can be displayed here with a direct permitted connection/source link. Unknown outcome shows the operation reference and read-back recovery. All inherited R/A states apply.

For a material change, show affected offerings, future bookings, staff/resource requirements, fulfilment and publication. Removing a capability stops its future configuration only under the agreed policy; existing work remains visible and versioned. A changed document rule adds an explicit requirement and follows approved grace/restriction rules rather than an invented immediate suspension.

## Journeys and cross-screen effects

1. **Hybrid expansion:** a beauty merchant adds products to appointments → answer stock/fulfilment questions → review offering/work/availability changes → save revision → guided first product/import → applicable publication owner enables it. Existing appointments retain terms.
2. **Rental branch:** add location and supported rental activities → link assets and exact hours → review documents/coverage → submit readiness → display waiting versus actionable tasks. New work remains constrained until confirmed publication/availability.
3. **Rejected document:** open requirement → inspect reason → upload replacement with expiry if required → see uploaded/review pending → later owner verification refreshes readiness and publication prerequisites.
4. **New business category:** submit a category request → operator uses authoring workflow → published registry version makes the approved activity selectable → merchant completes only its new required answers → preview updated portal.

Confirmed changes refresh all eight screen configurations, public discovery and Home readiness under the same version. Team changes invalidate effective permissions and cached sensitive views. Financial setup links do not change settlement authority.

## Mobile and UX rationale

Use a tab/section selector with all destinations reachable. Mobile readiness presents one labelled task with its reason and next action; avoid a compressed all-fields dashboard. Preserve the precise requirement and focus on return from uploads or Settings.

Recognition comes from reusing the same question wording as onboarding. Real progress distinguishes action from waiting. Common region groups each independent status with its explanation. Progressive disclosure keeps detailed identity/document history available while current blockers remain prominent. The merchant can inspect and change the configuration without needing to understand integration internals.

## Acceptance scenarios

- BU-T01: adding home service creates the exact service-area/resource questions and updates Work, Offerings and Availability after a confirmed revision.
- BU-T02: an operator cannot widen their role or change protected identity fields through a configuration answer.
- BU-T03: document replacement works for rejected/expired records and preserves original audit history; an upload is not verification.
- BU-T04: multi-location manager sees only authorized locations; a mixed publication state does not become one misleading toggle.
- BU-T05: new category request remains a request until valid operator publication; a later published activity becomes selectable in both onboarding and portal editing.
- BU-T06: removing rental activity with active rentals creates an impact-resolution requirement and does not hide their returns.

Apply all 128 profiles and inherited states, including review, source outage, conflict and session expiry.
