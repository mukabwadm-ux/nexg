# Settings

Screen ID: SC_SETTINGS. Status: proposed design. Planned after Insights. Inherits the shared screen contract.

## Purpose and boundaries

Manage personal account/security preferences, notifications, display preferences and permitted system connections. Business owns business activities, locations, team scopes, documents and the answers that configure operations. Settings shows technical connection setup and supported preferences without duplicating business facts.

Platform category authoring is a separately authorized operator workspace. It may share components with Settings, but an ordinary merchant cannot publish global capabilities or give themselves permissions. A new category selected by a merchant follows the published registry and Business configuration flow.

## Layout

Sections: Account and security, Notifications, Preferences, Connections, API access where supported, and Data/access requests. Show business-level versus personal scope explicitly. Each section has current confirmed values and its own save/operation feedback. Connections show business function, source owner, supported operations and health in merchant language.

## Feature inventory

| ID | Feature/data | Interaction and outcome |
| --- | --- | --- |
| SE01 | Personal account | Display verified login identity and permitted personal fields. Protected owner/business identity changes link to their approved Business/identity flow. |
| SE02 | Login and recovery | Change supported credential/recovery method with reauthentication and owner policy; distinguish requested verification from confirmed change. |
| SE03 | Additional authentication | Enrol/manage supported factors and recovery methods through identity provider; no unsupported security claim or custom token storage in ordinary answers. |
| SE04 | Sessions and trusted devices | List permitted session/device records, last activity and supported revoke actions. Recheck grants after revocation; do not fabricate a trust system absent a contract. |
| SE05 | Account activity | Authorized security/audit events with clear time, scope and safe details; link a real support path for disputed activity. |
| SE06 | Notification rules | Event/channel preferences by personal/business scope, supported channels and operational policy. Quiet preferences do not promise delivery or override mandatory approved notices. |
| SE07 | Quiet hours and escalation | Timezone-aware intervals and exception explanations. Merchant can inspect which urgent work alerts follow approved operational rules. |
| SE08 | Notification verification/test | Verify destination or explicitly request a supported test; show queued/sent/delivered/failed as actual channel supports. Never claim a selected channel is connected. |
| SE09 | Language, timezone and display | Supported language, date/time format, display density and accessibility preferences; business timezone changes use configuration impact review. Historic instants/currency do not change. |
| SE10 | Connections directory | Systems grouped by catalogue, inventory, booking, resources, accounting, fulfilment or other approved function; mode, authority summary and health. |
| SE11 | Add connection/provider request | Choose supported connector or request/import alternative. Identify instance/location/functions and required permissions before secure authorization. |
| SE12 | Secure authorization | Provider consent/credentials through approved secret storage and callback validation; show pending/revoked/expired. The ordinary onboarding answer store receives references, not secrets. |
| SE13 | Data authority and direction | Per-data-class NEXG/external/shared/read-only owner, supported read/write operations and conflict rules; missing authority blocks activation. |
| SE14 | Field, enum, unit and identifier mappings | Typed mapping preview using actual allowed fields; preserve external references; unmapped values need resolution. Arbitrary scripts/URLs are not mapping expressions. |
| SE15 | Validate and initial import | Verify scopes/operations, preview matched/new/invalid records and effects, then confirm supported non-destructive import. Handle partial outcome per record. |
| SE16 | Synchronization and freshness | Last confirmed success, affected data classes, sync lag/coverage and next scheduled action where known. Manual refresh respects rate/ownership policy. |
| SE17 | Connection failure/reconciliation | Clear expired-auth, mapping, quota, outage, conflict and unknown-operation states with authorized repair actions. Reconcile before replay. |
| SE18 | Disconnect/change owner | Preview data/actions/work affected and safe fallback. Stop applicable future access through owner; preserve historical provenance. No silent swap of authoritative inventory/calendar. |
| SE19 | API access | Link existing developer access where supported; approved key/scopes/location/version, rotation and revocation flows with secrets handled securely. Creating an account does not grant broad API writes. |
| SE20 | Supported webhooks | Configure only allowed destinations/events and verification with proper secrets/access; show confirmed delivery state and sanitized error/replay controls for authorized users. |
| SE21 | Data export/access request | Purpose/scope, allowed records, generation state and expiry; document/team/financial restrictions still apply. |
| SE22 | Closure/deletion request | Explain approved policy and existing obligations, verify actor and route a request. Do not erase financial/operational history through a local preference change. |
| SE23 | Business configuration link | Open Business activities/setup or location configuration with current scope, rather than maintaining duplicated fields here. |
| SE24 | Help, support and change history | Contextual supported cases and relevant setting/connection audit; expose no secret values or raw unfiltered provider payloads. |

## Connection lifecycle and governance

Use the connection model in integrations.md: discovered/requested, authorization needed, configured, validation pending, ready for permitted operations, degraded, revoked/disconnected and other explicit owner-defined outcomes. Initial import state, ongoing sync state and an individual mutation's unknown result are separate.

A source can supply read-only stock while bookings use NEXG and accounting syncs elsewhere. The screen shows this per function/data class rather than one global 'ERP connected' badge. Capability, platform permission, actor scope and current state all constrain actions. A working read does not prove write support.

Role/grant configuration remains in Business Team/identity owner. Connection setup cannot widen user grants or enable an unimplemented capability. Global category publication is authorized separately and validates both form and portal projections atomically.

## States and recovery

All inherited read/write states apply to each section independently. Save success is local to the changed preference or confirmed owner operation. A language preference failure does not hide a functioning booking connection. A pending provider authorization can be resumed without losing the business-function choices.

Credential expiration explains affected actions and leaves appropriate confirmed data available with freshness. A mapping edit previews incompatible records and downstream reports. A disconnect operation with uncertain outcome is reconciled; retries must not revoke a different connection instance or repeat an irreversible migration.

Security-sensitive flows reauthenticate according to identity policy, preserve safe return context and never expose raw credentials in logs, history, screenshots or exports. Retention and account closure rules are policy dependencies, not invented durations.

## Journeys and cross-screen effects

1. **Connect a rental fleet system:** choose assets/availability functions → inspect required permissions → authorize → choose per-class ownership → map IDs/units/states → preview initial import → validate → show supported reads/writes. Offerings, Availability and Work update their effective action sets after confirmed connection state.
2. **External calendar outage:** see affected booking class and last confirmation → retry read or reauthorize → reconcile outstanding reservation → restore supported action state. A green account badge never conceals unknown capacity.
3. **Move one function to native NEXG:** preview ownership/mappings/open work → complete explicit migration/reconciliation → activate versioned owner change → retain old external references. Other functions remain on their existing systems.
4. **Change notifications:** choose supported work event/channel → save preference → verify destination if needed → show confirmed preference separately from message delivery.

## Mobile and UX rationale

Mobile uses a section list and readable full-page forms. Connection summaries show business function and needed action first; advanced mapping and diagnostics remain labelled and permission-scoped. Secrets are never made visible merely to fit a desktop screenshot.

Recognition uses business names such as 'Stock managed by your inventory system'. Progressive disclosure reserves technical diagnostics for users who can act. Proximity associates permission requests and data consequences with Connect or Disconnect. Explicit feedback distinguishes saved preferences, provider authorization and completed synchronization.

## Acceptance scenarios

- SE-T01: booking and inventory connections have separate owners/states; a read-only connection cannot expose local edit controls.
- SE-T02: authorization expiry constrains only affected operations and retains safe confirmed information with freshness.
- SE-T03: mapping change preserves identifiers and shows incompatible fields before activation; a timeout produces unknown outcome and reconciliation.
- SE-T04: merchant operator cannot publish a global category, request excessive API scopes or reveal connection secrets.
- SE-T05: locale change affects display only; operational timezone change follows Business impact review and preserves historical instants.
- SE-T06: new-category selection reuses published connections and supported operations; novel data-class references fail validation before activation.

Apply all 128 source/permission variants and inherited states. Real authorization, provider delivery and migration execution require future implementation tests.
