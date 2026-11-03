# Phase 0: short registration and portal setup rules

Date: 1 November 2026, Africa/Nairobi. Status: SPECIFIED. Product rules recorded; application implementation and runtime verification have not started. This refines the [integration plan](README.md) before P1.

Amendment, 2 November 2026: the user explicitly asked to keep the existing additional form sections as optional capture before verified OTP/sign-in, and to connect email OTP last. This supersedes the statements below that remove optional operational capture from registration. The [implemented increment](implementation/acceptance.md) records the current behavior. Basic fields/category remain required; actual setup requirements and approval remain separate.

Later Phase 2 clarification, 2 November 2026: the user returned to the short-entry principle, explicitly listing six basic registration groups and deferring anything enterable in the portal. That is now the implemented behavior. The original detailed sections are Home-only task editors. See [Phase 2 acceptance](implementation/phase-2-acceptance.md) for the current state; the optional-wizard increment above is historical.

## 1. Direction and scope

The user supplied two Glovo registration screenshots as a simplicity reference and clarified that category and subcategory membership should determine the initial portal. Use the visible basic business/contact fields plus NEXG category/subcategory selection. The screenshots are a field/complexity reference; they do not establish Glovo's complete onboarding, approval or legal requirements.

Registration is not operational setup. Do not render the 323-question registry, listing editor, scheduling rules or document/payout workflow before entry. Keep those as relevant Home tasks and their existing destination editors.

Business identity versus the person signed in on its behalf needs a later presentation pass. Preserve separate records now, but defer greetings, header naming, business switching, role presentation and account menu redesign until the end. This is not permission to defer authentication, membership or access enforcement.

### Decisions superseding earlier recommendations

- Category and at least one subcategory are required for a new registration. The earlier recommendation to skip category selection is superseded by this user clarification.
- Category/subcategories supply the starting portal configuration. They select registered defaults and candidate workflows, editors, relevant task groups and terminology. Detailed operating questions are not compulsory at registration.
- Initial basic business/contact information follows the supplied screenshots, adapted to Kenya. No duplicate legal-entity question or registration certificate is added to the short form.
- Optional setup groups are removed from the entry path entirely. They belong in Home rather than a second long list of skippable entry steps.
- Home remains usable while admin approval is pending. The operational sections stay safely blurred/locked. Home setup changes do not publish the business or enable live work.

## 2. Entry field rules

The table below is the implementation baseline derived from the user's supplied screenshots and category requirement. It records defaults for P1/P2, not evidence of an existing backend contract.

| Field | Entry rule | Meaning and validation |
| --- | --- | --- |
| Business name | Required | Merchant-facing trading/display name. Trim whitespace; do not claim legal-name verification or public-name approval |
| Your first name | Required | Person completing the application, not a declaration that they are the legal owner |
| Your last name | Required baseline, following reference | Applicant contact name. Reuse existing contact identity where available; do not overwrite the signed-in user's profile or infer a role from a name |
| Business category | Required | One primary canonical category. This replaces the reference's generic Business Type selector; it is not legal entity type |
| Subcategories | Required | At least one canonical subcategory belonging to the selected category. Multiple relevant subcategories allowed. Use the first selection for initial ordering without adding a separate primary-specialty question |
| Number of branches | Required value, default 1 | Positive whole-number declaration. A merchant can have one digital/service-base operation without a public storefront. This does not create actual branches, addresses, schedules or grants. Existing coarse `branch_count_band` values must not be imported as invented exact counts |
| Business email | Required baseline, following reference | Communication contact. Validate format; entering it is not evidence of mailbox ownership. A later verified-channel policy may reduce duplication, but do not invent a second mandatory email OTP in this phase |
| Mobile phone | Required | Kenyan mobile contact, normalized to +254 through the existing `normaliseMsisdn`/`Msisdn` contracts. Complete verification required by the existing identity policy; reuse valid session proof for the same contact. A phone field alone is not verification. P0 does not add a second or unsupported OTP gate |
| Same business contact number | Initially selected | If selected, derive it from the current mobile value without asking twice. If cleared, require a business contact number; use an appropriate phone contract rather than imposing a mobile-only regex on a supported landline. Do not publish a personal number or treat a copied number as independently verified |
| Do you have business registration? | Required Yes/No declaration, initially unanswered | Either answer may continue. No certificate, company number, KRA PIN, legal-entity selector or permit upload required at entry. The answer can create a later applicable evidence task |
| Required privacy/terms acknowledgement | Privacy acknowledgement required, initially unchecked; additional terms only under actual platform entry policy | Reuse approved policy references and record their versions and acceptance time. Do not invent legal copy from the screenshot |
| WhatsApp updates/promotions | Optional, unchecked | Separate opt-in, unrelated to application approval or operational notices. Store preference; do not claim a WhatsApp integration or send messages |

Keep the form on one short page with clear groups, followed only by verification required by the existing identity policy and submission confirmation. Do not add an additional-category entry control; later activity setup can reuse the model's supported mixed-business capabilities. No Google link import, extra operating quiz, mandatory marketing or provider connection step is needed to enter Home. If a name format cannot fit the reference's first/last pattern, retain a full-name-compatible path rather than fabricating names; presentation detail is handled in P2.

Required means required to submit, not required to save a draft. Invalid supplied input receives a clear correction; drafts remain recoverable.

The exact policy document references, supported phone-verification provider, retry controls and existing identity session behavior must be checked against actual identity services during P1/P4. Do not simulate OTP success or add an unimplemented authentication path.

## 3. How categories guide the portal

1. Save the selected canonical category/subcategory IDs, primary selection and registry revision.
2. Resolve a portal starting configuration from the current shared taxonomy and reconciled definitions. Preserve the common nine-section navigation and visual shell.
3. Select applicable offering editor candidates, work families, availability setup, evidence/setup tasks and supported Home/Insights definitions. Do not ask the merchant to choose internal model IDs.
4. Display the personalized setup Home using the business/contact fields and selected specialties. Initial configuration is possible without hours, stock, assets, staff or a payout account.
5. Ask further questions only through the relevant task when needed. Later answers refine or suppress the proposed model and fill actual records. Changing a category previews the impact and preserves previous answers/history for supported recovery.

Category membership is sufficient to choose the initial portal template. It is not evidence that the business offers every possible activity in that category, has confirmed stock/capacity, is licensed, has a connected ERP, or may accept customer work. Model defaults remain candidates until actual configuration supports them. Unknown answers remain unknown, not false or a convenient category-wide guess.

Examples:

| Initial selection | Portal starting point | Asked later from Home |
| --- | --- | --- |
| Restaurant | Food offering editor, relevant order/availability setup tasks | Menu, preparation rules, hours, fulfilment, actual source and evidence |
| Salon/service specialty | Service/appointment setup candidates | Actual services, whether bookings are enabled, duration, staff/resources and schedule |
| Vehicle rentals | Rental offering and asset/availability setup candidates | Actual vehicles, exact rental intervals, policies and resources. Drivers/transfers are not assumed |
| Product plus service specialties | Compatible product and service task groups | Which activities and offerings are actually enabled; distinct stock and appointment capacity |

Where several defaults are compatible, show the relevant guided choices. Do not activate all candidate workflows automatically. A currently unsupported combination has an explained setup state, never an arbitrary restaurant fallback.

## 4. Home holds the deferred work

The initial form does not request products/services, prices, photos, operating addresses, map pins, delivery zones, hours, resource capacity, staff invitations, permits, tax fields, bank/M-Pesa details or existing-system credentials.

Home creates applicable tasks for those details and uses the existing editor owners. Requirements are tagged by when they matter: review evidence, activation, or optional enhancement. Do not make every deferred task an approval prerequisite simply because it exists in the registry.

Business name, contact details, category/subcategories and declarations already supplied are prefilled wherever reused. Do not mark Business profile fully verified from those details alone. The sole act of registration does not mark hours, team/devices, offerings, documents or payouts complete. Calculate truthful supplied/pending/verified states and progress from the same applicable task rows.

Branch count is a declaration. Home can say **Add your locations** and let the merchant create the relevant real records. Do not instantiate the declared number of empty branches, claim a public address exists or grant all-location access from that number.

Detailed financial data belongs in its protected setup task, not general registration JSON. Uploads use private storage and versioned evidence. Neither the short form nor Home is a new booking engine or ledger.

## 5. Approval and access rules

| State | What the merchant can do | What stays blocked |
| --- | --- | --- |
| Draft | Edit/save registration and complete required verification | No operational portal or public listing |
| Submitted / awaiting review | Read personalized Home, application status and summary; complete permitted setup tasks; contact support; use account recovery/sign-out | Operational portal sections, operational data/actions, public visibility and accepting work |
| Changes requested | Same Home access; edit/resubmit the specifically requested fields/evidence, with other permitted setup tasks retained | The same operational restrictions until a confirmed approval |
| Approved account scope | Access the approved portal sections and finish operational setup | Publication or live work whose actual prerequisites remain unmet; unsupported modules/providers |
| Activated scope | Use actual supported operations under role/location/capability/schedule/source rules | Any unapproved or unready scope, including later-added activities |
| Rejected/declined | Read decision/status and permitted help or reconsideration route | Operational portal and live activity; do not silently delete the application |

The blur is a clear visual gate over a safe placeholder. No restricted live data is fetched or hidden underneath it. Home task editing uses narrowly authorized setup commands rather than unlocking every Business/Offerings/Money API while pending.

Admin may begin review from the short submission. Their initial decision is account/workspace access, not a claim that all operational evidence is complete. If additional information is genuinely needed for that decision, request that exact information through Home. Do not require every merchant to submit a menu, permit or payout account before staff can see the application.

Approval unlocks permitted scope; it does not call the current publication-producing go-live RPC. Publication and accepting work remain separate, with applicable verified prerequisites. A registration declaration of No is not automatic rejection; a declaration of Yes is not automatic verification.

Edits while under review carry revisions. Admin sees the submitted snapshot and changes; a stale decision cannot approve materially changed facts. Record scoped decisions and reasons. Retries or unknown network outcomes resolve to one application/operation, never duplicate merchants.

## 6. Identity work deferred to the final pass

Keep these separate now:

- The business entity and its display/trading name.
- The authenticated person/account and its actual granted membership.
- The applicant/contact details supplied for this application.

Do not set applicant contact equal to authenticated profile automatically, infer Owner because someone filled the form, or grant another person access based on a matching name/email. Use the existing proven membership/identity path; any new invitation or authority model needs its own later decision.

Defer the presentation decisions: greeting by person or business, header hierarchy, avatar labels, business selection, role labels and how a person moves between businesses. Add an identity/presentation review at the end of P8, before final acceptance. Security and tenant isolation stay prerequisites in P4 and P5.

## 7. Implementation handoff

P0 has specified the product rules and the changed baseline; it has not implemented or approved new database contracts. P1 translates these rules into shared typed contracts, canonical selections, applicable task resolution and validation. P2 implements the short form, and P3 connects its initial personalized Home with a labelled test adapter.

P1 explicitly maps separate contact first/last values to the existing single `contact_name` contract without guessing how to split legacy names. Preserve raw source names and derive display text as needed. A newly captured exact branch count may provide a compatible derived legacy band, but an existing band cannot supply an exact count. Existing phone-only applications remain recoverable even though the new reference-based entry requests business email.

P4 revises existing submit constraints and server enforcement rather than using fabricated city, legal-name, offering, permit or payout values to satisfy legacy rules. Existing category-save resets must become a reviewed, recoverable change rather than discarding answers. P5 confirms the real form-to-Home journey. P6 implements the separate admin approval/unlock. P7 connects activation and actual source adapters. P8 verifies the full journey and completes the deferred identity presentation pass.

Any residual scope-specific policy such as document verification, payout ownership or regulated activation is supplied by its existing owner when the corresponding task is implemented. It is not an unresolved reason to re-expand the initial form.

## 8. Phase 0 acceptance and limits

- The required baseline is basic business/contact information, category/subcategories, declarations and policy acknowledgements as specified above. No operational setup field blocks entry.
- Canonical taxonomy IDs and parent/child selection rules are explicit. Primary category/specialty are retained, and multiple specialties are supported.
- The distinction between initial portal configuration and operational activation is explicit.
- Submission enters the real Home journey; approval is not inferred from registration.
- Home can complete deferred tasks while other portal sections remain safely restricted.
- Business versus person presentation is explicitly deferred, with identity/security separation preserved from the start.
- The existing integration plan's earlier category-skip/minimum-name-only recommendations are amended rather than left as competing instructions.

Planning verification checks this artifact, its references, field inventory and consistency with the amended integration plan. It does not prove application behavior, OTP delivery, database policies or admin decisions. No services, runtime tests, application changes or migrations are part of P0.

The existing integration plan's 34-section phase coverage applies. P0 changes scope/UI/contract inputs and resolved product rules; its database/API/event/authorization implementations remain P1/P4 deliverables. No new hardware, provider, event or migration is created by this document. Master-spec compliance remains unclaimed because the referenced master/contracts directories were not present in this checkout.
