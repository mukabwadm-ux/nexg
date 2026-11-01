# NEXG adaptive merchant portal: final design prompt

Copy the prompt below into a chat with this repository and its existing references available.

---

Plan NEXG's adaptive merchant onboarding and portal end to end, then generate the reference pictures. Complete the design specifications first. Do not implement application code or connect real external systems during this assignment.

The required outcome is that completing the relevant onboarding form automatically configures a sensible portal and its workflows for any of our 128 merchant subcategories. Merchants must not need a developer to hand-configure their individual portal.

The design must also support future categories and subcategories. Define one versioned category manifest and an authorized authoring, validation, preview and publication process that updates onboarding, discovery and all eight portal screens together. Reuse existing implemented capabilities through configuration. Define an explicit contract/component/workflow extension path for genuinely new behaviour before it can be enabled. Include a new-category example, migration/rollback, historical-work preservation and negative validation cases. The current count of 128 is a coverage baseline, not a hard-coded platform limit.

Use shared components and shared workflows wherever the business behaviour is genuinely shared. Give each merchant the terminology, fields, actions, discovery presentation, operational steps, availability and fulfilment configuration their answers require.

## 1. Read the actual project before designing

Start with the existing Home specification, product notes, merchant onboarding, taxonomy, question definitions, database rules, merchant screens, reusable UI and available integration contracts. Also read:

- `docs/audits/merchant-onboarding-audit-2026-10-29.md`
- `docs/audits/merchant-onboarding-128-taxonomy.json`

Verify these audit findings against current files before relying on them. Inspect later function definitions and distinguish repository rules from the deployed database. Follow available approved contracts and identify referenced documents that are unavailable.

Preserve established useful decisions. Label existing implementation, existing plans, proposed changes, assumptions and unresolved decisions separately. The audit is evidence of current gaps, not an approved replacement architecture.

Known gaps to resolve in the design include the split between generated and older questions, four logistics specialties without effective tailored questions, nine empty concierge workflow descriptions, delivery-oriented steps applied to every merchant, single-specialty storage, weakly typed answers, generic readiness and the missing connection between answers and operational portal configuration.

## 2. Design onboarding as the configuration input

Audit every field and question across all onboarding steps and all 128 subcategories. Reconcile older category questions with specialty fields by meaning rather than exact spelling. Reuse captured information and remove duplicate requests for the same fact.

Create one typed, versioned question registry. For each question, specify its stable ID, merchant-facing wording, purpose, type, allowed values, units, default if justified, required condition, dependencies, validation, save behaviour and downstream effects.

Classify each answer as operational configuration, customer-facing information, compliance evidence or another named purpose. An informational answer must not silently become an executable rule.

Define capability-specific follow-up questions for relevant business models, including:

- Immediate orders, scheduled work, appointments, reservations, requests, quotations, rentals, events, memberships and recurring work.
- Product, service, asset, package, session, unit-based and quotation-based offerings.
- Delivery, customer collection, collection and return, customer visits, merchant visits, digital service and coordinated fulfilment.
- Hours, slots, sessions, staff, assets, rooms, vehicles and capacity.
- Confirmation, lead time, duration, deposits, cancellation and fulfilment responsibilities where applicable.
- Physical locations, venues, service areas and digital-only operation.
- Businesses combining several capabilities or specialties.

Collect precise operational values where required. A duration band cannot silently become an exact appointment length. Where further records are needed, such as staff or inventory, define a short guided setup step and its truthful readiness state.

Preserve draft saving, resume, ownership, review and conditional documents. Design correction and replacement flows. Make readiness and submission requirements explicit and capability-specific. Submission, verification, publication and acceptance of work must remain distinguishable.

## 3. Specify the business-configuration resolver

Design a deterministic, versioned resolver using validated onboarding answers and the approved capability registry. Apply integration capabilities, location scope, permissions, approval and runtime state as explicit action constraints.

Specify the configuration it produces, including enabled modules, vocabulary, offering schemas, workflow definitions, fulfilment methods, availability models, resource requirements, discovery presentation, readiness checks and relevant cross-screen links.

For every rule, show:

Answer or condition → resolved configuration → affected component and screen → permitted action or workflow transition → owner system → acceptance scenario.

Describe defaults, precedence, conflicting answers, missing answers, unsupported combinations and hybrid businesses. Explain why each resolved capability applies. Do not derive the whole portal from a category label.

Workflow prose is supporting information. Define executable behaviour separately through explicit states, actors, transitions, preconditions, commands, outcomes and recovery rules.

Explain safe configuration changes after onboarding, including retained answers, obsolete fields, new requirements, affected listings, existing bookings and work already in progress. Existing work must preserve the rules and history needed to explain its original behaviour.

## 4. Plan external systems and the future NEXG ERP

Merchants may already use ERP, POS, inventory, accounting, booking, CRM, logistics or other systems. Design onboarding questions that identify their actual systems by business function, which data they want to connect and the desired direction of data flow.

Plan secure authorization and connection journeys separately from ordinary questionnaire answers. A selected POS chip or supplied provider name does not prove a working connection. Distinguish configuration complete, authorization needed, connection validated and live capability available.

Define shared NEXG business contracts for the relevant domains. External adapters translate supported provider data and actions into those contracts. The portal consumes domain-specific display models. Future native ERP modules must support the same contracts so merchants can adopt them gradually.

For each data class, declare its authoritative owner, permitted reads and writes, external identifiers, mappings, units, currencies, time zones, freshness, conflict handling and reconciliation. Do not use universal last-write-wins or merge unrelated domain concepts into one generic record.

Connector capability, platform permission, user role, location scope and current state must all permit an action. Define supported connection methods individually, including API, webhook, polling, file import or manual entry where appropriate.

Plan mapping failures, initial import, partial synchronization, stale data, expired authorization, disconnected systems, duplicate delivery, pending changes and unknown outcomes. Prevent duplicated actions and reconcile uncertain outcomes before retrying. Keep useful unaffected capabilities available when one integration fails.

Design a usable path for merchants without an existing ERP. Identify the minimum supported NEXG capability needed now and future ERP dependencies. Verify integrations connector by connector rather than claiming compatibility with every possible vendor.

## 5. Define reusable components

Create a component catalogue covering shared controls, business components and specialist components for meaningful exceptions.

Include work queues and detail panels; offering editors; calendars and capacity views; staff and asset selectors; workflow timelines; fulfilment details; document requirements; transaction breakdowns; reporting controls; and connection status and recovery.

For each component, define its contract, configuration, display rules, supported actions, validation, permissions, states, responsive behaviour and extension points. Identify which parts already exist and can be reused.

Configurable fields must still have useful grouping, readable labels and domain validation. Preserve specialised interactions where generic controls would misrepresent the merchant's work.

## 6. Plan the eight screens one by one

Use this order: Work, Offerings, Availability, Business, Money, Promotions, Insights, Settings. Preserve the agreed Home and navigation context. Keep Help accessible and map existing messages, documents, team, reviews, disputes and other functions to clear destinations.

Finish each screen's specification before moving to the next. Generate no pictures until all eight specifications and their cross-screen consistency review are complete.

For every screen, provide:

1. Its purpose, merchant tasks, boundaries, entry points and destinations.
2. A complete feature inventory with stable IDs, fields, data sources, conditions and permissions.
3. Every action, including secondary controls, row menus, filtering, search, sorting, save, cancel, back, retry and relevant bulk operations.
4. Interaction details, validation, feedback, side effects and return paths.
5. Screen states and operational state transitions, including loading, populated, first use, true empty, filtered empty, missing configuration, partial data, pending, success, failure, stale, offline, conflict, unknown outcome, permission changes and recovery where applicable.
6. Relevant end-to-end journeys and exception paths.
7. Desktop layout and mobile behaviour, including focus, reading order, overflow and retained scope.
8. Its shared components and merchant-specific adaptations.
9. Acceptance scenarios and remaining design dependencies.

Cover the screen's actual context. Work needs appropriate operational queues and steps. Offerings needs relevant listing and pricing models. Availability needs hours, scheduling or capacity as applicable. Business owns business configuration and readiness. Money needs precise supported financial definitions. Promotions needs explicit eligibility and campaign rules. Insights needs meaningful metrics and data coverage. Settings needs clear account, preference and integration boundaries.

Do not invent financial rules, unsupported operations or service guarantees. Define newly proposed capabilities and their required contracts explicitly.

## 7. Use UX principles in service of the work

The merchant's tasks and information needs govern the design. Use relevant UX laws and principles to organise information and interaction.

Keep necessary information accessible and informative. Use clear hierarchy, grouping, recognition, predictable placement, restrained colour and understandable language. Do not hide important work or impose arbitrary choice limits to satisfy a named law.

For major decisions, briefly identify the merchant problem, proposed design, relevant principle and tradeoff. Define what is visible immediately and how supporting details are discovered.

Plan keyboard access, meaningful focus, screen-reader names, text status labels, contrast, touch targets and responsive layouts. Distinguish accessibility targets from tested compliance.

## 8. Account for every subcategory and answer

Maintain a complete matrix with one named row per actual subcategory ID and coverage across all eight screens. Each row must identify its configuration, workflow family, vocabulary, fields, actions, fulfilment, availability, integration needs, exceptions and test references.

Define shared variants once and reference them explicitly. Every subcategory must map to a variant and declare its differences. Include within-subcategory variation caused by onboarding answers, plus hybrid merchants and location-specific configuration.

Plan acceptance scenarios with onboarding inputs, user role, location, connected-system mode, expected configuration, action, state transitions, restrictions, outcome and cross-screen effects. Include changes to relevant answers and recovery from integration failures.

Keep design coverage, source verification and executed runtime tests separate. Missing evidence is a gap. A taxonomy row, passing key-coverage test or picture does not establish working end-to-end behaviour.

## 9. Complete the plan, then produce the pictures

Save the onboarding redesign, answer-to-behaviour rules, integration design, component catalogue, eight screen specifications, 128-subcategory matrix, acceptance scenarios and an ordered future implementation plan as readable project documents. Reuse a single source for shared definitions and generate or validate derived matrices.

Include the future-category manifest schema, shared domain registry, authoring journey, worked category example and validation evidence in those deliverables. Preserve an explicit distinction between a declared capability, implemented support, merchant configuration, permissions, external authorization and live readiness.

Complete a consistency review for all eight screens before image generation. Resolve routine design choices using the existing context. Record genuine business-policy decisions explicitly and ask focused questions only where an answer materially changes the design. Do not mark dependent behaviour final while a required decision remains unresolved.

Once the design plans are complete, generate exactly eight reference images, one for each screen. Each image shows only the finished application screen, with one coherent, realistic, populated representative merchant configuration and readable sample data.

Show applicable functionality through meaningful enabled controls and clear navigation. Account for functions reached through tabs, drawers and later steps in the written specification. Do not combine mutually exclusive states, mix unrelated merchants or open every dialog together.

Use consistent NEXG styling and navigation. No device frames, collages, external annotations, presentation slides or additional state/merchant images. Plan mobile behaviour in writing while using the agreed reference viewport for the single image per screen.

Start by verifying the existing onboarding audit and producing the full foundation design. Then complete the eight screen plans in sequence, review coverage and consistency, and finally generate the eight pictures. Carry out the planning work; do not stop at a high-level proposal.
