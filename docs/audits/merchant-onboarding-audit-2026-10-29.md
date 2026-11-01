# Merchant onboarding audit

Date: 29 October 2026. Scope: the current repository's merchant application, taxonomy, question generator, migration-defined server rules and portal consumers. This is a source audit. It does not establish which migrations are deployed or prove successful live onboarding for all merchant types.

The user confirmed the intended sequence: complete the design plans, then generate the pictures. Application implementation and external-system connection are outside this audit.

## Finding

The form has a useful foundation for automatic configuration. Today it collects a business profile and specialty answers, derives some document requirements and preview content, and saves a persistent draft. It does not resolve those answers into a complete operational configuration consumed by the portal.

The intended requirement is:

> Completing the applicable onboarding questions automatically resolves the merchant's discovery presentation, portal modules, terminology, offering fields, workflow definitions, availability model and fulfilment methods. The merchant does not need a developer to configure their individual portal.

External authorization, document approval and missing operational records remain explicit prerequisites. A form answer cannot establish a live ERP connection or create stock, staff, schedules or listings that the merchant has not provided.

## Coverage of all 128 specialties

The machine-readable inventory is `docs/audits/merchant-onboarding-128-taxonomy.json`. It includes every subcategory, its source line, taxonomy fields, workflow and fulfilment hints, effective questions, generator coverage and SQL comparison.

| Measure | Source audit result |
| --- | --- |
| Categories and subcategories | 21 and 128 |
| TypeScript taxonomy versus canonical SQL taxonomy | All category and subcategory definitions align in the comparison |
| Categories using generated specialty questions | 13 |
| Subcategories using generated specialty questions | 84 |
| Subcategories using the other category-question path | 44 across 8 categories |
| Taxonomy field occurrences | 558, with 235 unique field names |
| Active generated question occurrences | 364 |
| Unsupported field occurrences in the active generated path | 0 |
| Field occurrences with no active generated question or exact-key category question | 187, representing 109 unique keys |
| Specialties with no effective category or generated questions | Sea freight, air freight, road freight and warehousing |
| Empty default workflow descriptions | All 9 concierge specialties |

The 44 specialties outside the generated path are not all questionless. They use older database category questions. The 187 exact-key mismatches need a semantic crosswalk because an older question can collect a related concept under another key. They are not evidence that 187 independent questions must be added.

Sources: `packages/contracts/src/taxonomy.ts`; `apps/web/components/onboarding/step-category.tsx:16`; `apps/web/components/onboarding/subcategory-questions.ts`; `supabase/migrations/20260101003500_category_config.sql`; `20260101021001_merchant_taxonomy_data.sql`; `20260101021002_merchant_taxonomy_onboarding_rules.sql`.

## Complete form inventory

### 1. Start and contact

- Start from a public business link or enter details manually.
- Public source URL and confirmation of imported listing details.
- Trading name, contact name, phone and optional email.
- Phone verification code.
- Local choice to add email, use WhatsApp or skip email. WhatsApp and skip both clear the saved email; they do not create a separate persisted communication preference.
- A draft is created and associated with its owner.

Sources: `apps/web/components/onboarding/step-start.tsx`; `apps/web/app/merchants/apply/actions.ts`.

### 2. Category and specialty

- One selected category and one selected subcategory.
- Database-defined category questions.
- Generated specialty-field questions for the 13 enabled categories.
- Question types are single choice, multiple choice and text.
- A specialty workflow preview, rendered by splitting a descriptive string.
- Answer-dependent document requirements and eligibility information.

The shared question type has no general dependency or conditional-visibility schema. In the combined question list every rendered question is checked for a nonempty answer. Category and specialty changes save through separate calls; the UI clears the specialty when changing the category.

Sources: `apps/web/components/onboarding/types.ts:9`; `step-category.tsx:63`; `step-category.tsx:132`; `step-category.tsx:168`; `step-category.tsx:320`.

### 3. Location and branches

- Primary street address, browser location, area selection and map pin.
- Branch-count band: one, 2–3, 4–10 or more than 10.
- Additional branches with address, area and whether hours are inherited.
- Pickup instructions: front counter, side or kitchen door, security, or call on arrival.
- Rider parking: easy, tight or call ahead, or none.
- Landmark.
- Delivery coverage result or waitlist path.

Only pinned branch rows persist. Incomplete additional rows can remain local. The primary Continue path requires served delivery coverage. The page asks where riders collect from for every category. It lacks an alternative location model for a digital service, customer visit, appointment venue or service area.

Sources: `apps/web/components/onboarding/step-location.tsx:239`; `:283`; `:310`; `:418`; `:626`.

### 4. Hours and operations

- Same hours daily, weekday/weekend hours, or a custom weekly pattern.
- Opening and closing times, plus late-closing choices.
- Preparation time, 5–60 minutes in increments of 5.
- Order channels: dashboard, WhatsApp, phone and POS.
- Busy behaviour: pause, extend preparation automatically, or never pause.
- Packaging: merchant packs, NEXG bags needed, or unsure.
- Whether the merchant has riders.
- Rider names, phone numbers, vehicle types and number plates where applicable.
- Fleet dispatch: own riders first, own riders only, or closest rider.

These controls render across categories without capability guards. Custom hours promise a break in the subtitle, while the available day model has one interval. POS is a selected channel string, not an authenticated system connection. A 24-hour late choice is stored as 23:59 and needs explicit business-calendar semantics in the redesign.

Sources: `apps/web/components/onboarding/step-hours.tsx:19`; `:26`; `:32`; `:151`; `:213`; `:256`; `:273`; `:288`; `:350`.

### 5. Documents

- Requirements derived from category and answers.
- Camera capture or file upload.
- Expiry date when required.
- Request to send a document later.

The existing conditional requirement resolver is useful and should be preserved. The UI's progress counts saved records rather than confirmed verification. A rejected record shows replacement instructions, but upload controls are in the branch rendered only when no saved record exists. The later-send action records a request; its toast acknowledges that message delivery is not connected.

Sources: `apps/web/components/onboarding/step-documents.tsx:143`; `:240`; `:307`; `supabase/migrations/20260101003700_onboarding_functions.sql:42`.

### 6. Payout and first offerings

- M-Pesa till, M-Pesa paybill or bank account.
- Till number; paybill and account; or bank, branch, account number and account name.
- Initial offering rows: name, description, whole-number KES price and detected alcohol flag.
- Five initial blank rows, with add, remove and skip actions.
- Optional login email.
- Payout name-check request and submission.

The noun changes between services, menu items and products. The editor still lacks operational fields such as SKU, units, variants, duration, resources, quotation pricing, rental periods and external identifiers. Five initial rows are not a meaningful universal readiness rule.

The save path deletes the merchant's catalogue rows and reinserts named rows, which would break stable external identifier relationships. It also ignores the delete/insert errors in that path. This must be addressed in the later implementation plan before linking an external catalogue. The reload does not preserve the age-restriction field in this editor's local state.

Sources: `apps/web/components/onboarding/step-payout.tsx:70`; `:94`; `:101`; `:134`; `:159`; `:208`; `:345`; `:359`; `:388`.

### 7. Status and guided setup

- Progress timeline, document issues, readiness and suggested next steps.
- Preferred onboarding-call time or another-time option.
- First-offering and branch suggestions.

Copy remains menu and order oriented. The cover-photo task points to payout, which has no cover-photo upload control in the audited component. Requested onboarding-call time and confirmed appointment must remain distinct.

Sources: `apps/web/components/onboarding/step-status.tsx:80`; `:85`; `:177`; `:200`.

## How answers currently affect behaviour

| Input | Existing effect | Remaining design work |
| --- | --- | --- |
| Category and specialty | Follow-up questions, labels, workflow preview and saved classification | Complete business capability and operational configuration |
| Category answers | Some document requirements, preview badges, price band and operations-mapping flag | Typed answer semantics and explicit effects across screens and workflows |
| Location and hours | Branch records, coverage and opening-hour rows | Capability-specific venue, service-area, resource and scheduling models |
| Preparation and rider preferences | Delivery-oriented operational values | Appropriate models for appointments, rentals, requests, digital work and freight |
| First offerings | Basic catalogue rows | Specialised offering schemas and stable external mappings |
| POS channel | Saved preference in `order_channels` | Provider discovery, secure authorization, capabilities, data ownership and sync |

The preview uses category labels, specialty names, answer choices and badge rules. Its timing vocabulary is still limited to delivery minutes or return turnaround. Workflow hints and prose are not executable state machines.

Sources: `apps/web/components/onboarding/preview.tsx:85`; `:98`; `:117`; `supabase/migrations/20260101003900_onboarding_rpcs.sql:149`.

## Server and portal gaps

1. **No resolved business configuration.** The category RPC stores answers and derives a small number of values. No configuration resolver for all eight screens was found in the onboarding path. Merchant navigation takes live state and counts, while its consumer does not pass a category, specialty or resolved business profile. See `apps/web/components/merchant/frame.tsx:26` and `shell.tsx:60`.
2. **Single specialty.** Draft and persistence use a scalar category and subcategory. Multi-choice answer arrays do not establish support for a hybrid merchant with multiple specialties. See `types.ts:92` and `supabase/migrations/20260101021000_merchant_taxonomy_enum.sql:34`.
3. **Shallow answer validation.** The latest readiness definition checks key presence and nonempty content. It does not establish correct types, allowed choices, units or operational constraints. See `supabase/migrations/20260101021003_subcategory_readiness.sql:33`.
4. **Universal readiness assumptions.** The latest definition requires a zoned primary branch, hours and preparation time, payout and at least five catalogue entries for every merchant. Its zone-only location check omits the serving-city radius alternative in the preceding `20600` definition. See `21003_subcategory_readiness.sql:64` and `20260101020600_deliver_wherever_the_guest_is.sql:837`.
5. **Submission differs from readiness.** `rpc_merchant_submit` checks category, city and essential document records; it returns readiness without requiring every readiness check. Form progress must not be mistaken for complete server validation. See `20260101003900_onboarding_rpcs.sql:625`.
6. **Portal remains broadly delivery-oriented.** Orders use cooking and rider vocabulary; Hours always adds Breakfast, Lunch and Dinner; Catalogue uses a basic menu editor. See `apps/web/app/merchant/orders/page.tsx:10`, `hours/page.tsx:60` and `menu/page.tsx`.
7. **No merchant ERP discovery in the audited form.** Provider, instance, authorization state, supported read/write operations, authority per data class, mappings and sync policy are absent. Existing API-service booking and platform integration records do not establish onboarding-driven ERP adapters.

## Precision problems to resolve

- `equipment_provided` appears in both the boolean and multiple-choice registries. The boolean branch wins, losing the partial-equipment choice in six active specialties. The richer configuration is unreachable through this field's generated rendering.
- `deposit_policy_text` appears in the text and single-choice registries. The text branch wins for four rental specialties. The plan must choose an intentional typed policy and preserve any useful explanatory text.
- Booking lead-time and duration bands express broad business preferences. They cannot supply an exact bookable calendar without exact values, supported defaults or an explicit remaining setup task.
- License claims, publication, document verification, acceptance, available capacity and connection health need separate meanings and states.
- Existing question tests check supported keys in the 13 enabled categories. They do not prove semantic completeness, correct types or complete portal behaviour for all 128.

## Required design decisions

1. Create one typed, versioned answer registry and reconcile existing category questions with specialty fields. Declare visibility, dependencies, units, validation and the effect of each answer.
2. Design a deterministic business-configuration resolver. Inputs include validated answers, approved capability definitions, location scope, integration capability and permission rules. The output must explain why each module, field, workflow and action applies.
3. Define capability-specific offering, workflow, fulfilment, location, availability and readiness models. Keep immutable historical work associated with the configuration it started under.
4. Plan hybrid merchants and later capability changes explicitly.
5. Add relevant system-discovery questions and secure connection journeys, including merchants with no existing ERP. Declare authority per data class and preserve external references.
6. Make shared portal components consume the same business contracts whether data comes from external software or future NEXG ERP modules.
7. Show the merchant a truthful configuration preview and the exact remaining prerequisites. Avoid repeated entry of already supplied information.
8. Complete a traceable 128-by-8 screen mapping and acceptance scenarios before producing the eight reference images.

## Verification boundaries

The JSON inventory was read back and checked against the repository definitions. All 128 unique IDs and their order match the TypeScript source. Seven recorded source hashes match the current files. Actual generator functions were executed and their outputs compared with all 439 supported field occurrences in the inventory.

The existing generated-question suite passed its one test, and the existing contracts suite passed all 20 tests. These are supporting checks, not evidence of complete onboarding or workflow coverage. See `docs/audits/merchant-onboarding-verification-2026-10-29.json` for results and commands.

The first test attempts both initiated dependency setup and collided on Windows file links before tests could run. A single offline, frozen-lockfile dependency setup completed successfully; direct test-runner invocations then passed. No dependency manifest or lockfile changes were made.

No live merchant account was created, no ERP was connected and no application source behaviour was changed by this audit.
