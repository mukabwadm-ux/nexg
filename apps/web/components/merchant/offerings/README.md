# Adaptive Offerings frontend

Open **Offerings** from the existing Home / Work preview sidebar, or go to `/merchant-live-preview/offerings` on the running web development server. The isolated Offerings preview currently uses port 3140. The route is development-only, like the existing Home and Work previews.

This is a working frontend with isolated browser storage. It does not call Supabase, the booking API, a payment provider, an ERP or a webhook. “Publish” changes the browser preview, not a live public listing. The initial post-onboarding screen, Home content and booking engine were preserved.

## What is implemented

- A shared catalogue and selected editor matching the approved dark / cream / gold NEXG concept.
- All 128 current specialty bindings, 17 primary editor types and the conditional space editor: 18 registered editor contracts in total.
- Scoped merchant configuration, explicit enabled offering types, inheritance of listing attributes, and optional category extensions.
- Search, type / publication / source filters, name / recency sorting, optional columns, multi-selection, CSV export, archive and restore.
- Create, duplicate, edit, local save and reload, draft / published / archived states, validation, customer display preview and version history.
- Schema-specific fields, KES pricing, quote / enquiry wording, units, product variants, photo upload and alternative text, listing descriptors, fulfilment and handover.
- Percentage or fixed KES discounts per offering, optional dates, original/discounted prices, validation and Publish changes. Source-owned prices remain read-only. Discount policy is preserved in CSV export/import.
- Quantity precision/limits, optional choice groups and variant compatibility, bundle references with cycle/availability/fulfilment checks, sections/tags and visibility windows/channels.
- Add offering and Add discount actions inside the expanded editor. Closing the editor expands the catalogue/search/filter area to full available width; choosing a row restores the split layout.
- Stock versus resource / asset / space / dated-session / storage links. Zero stock, unknown quantity, unlinked setup and stale / offline / pending source states stay distinct.
- Field ownership for details, price and availability; externally owned fields are read-only. The connection controls are clearly labelled simulations.
- Import preview with quoted CSV support, bounded rows / file size, duplicate checks, decimal validation and draft-only creation. Imported specialist fields are completed in the editor before publishing.
- Unsaved-change protection, storage failure recovery, stale-tab offering-save protection, keyboard tabs, accessible dialogs and phone catalogue / editor navigation.

## Configuration and new categories

`config.json` is a compact projection of the audited primary schemas and **current reconciled** booking/question definitions. Rebuild it from the workspace root with `node scripts/sync-offerings-config.mjs`. It does not replay legacy profile rules or manufacture verified claims from descriptive answers.

The screen accepts `MerchantOfferingConfiguration` and an `OfferingsSource`. When onboarding is built, it supplies `subcategoryId`, explicitly enabled schemas and inherited listing attributes. Candidate models alone do not activate a workflow. Listing overrides remain attached to that offering. The preview selector is a testing tool, not the proposed merchant onboarding experience.

An `additionalProfiles` entry can bind a new category/subcategory to an existing registered editor and model. `extendOfferingProfiles` rejects duplicate IDs, unknown schemas/models and attributes without catalogue scope. A genuinely new operational behavior needs a new schema/model implementation. No fixed 128-page architecture is introduced. Onboarding form changes remain deferred as requested.

The browser source is preview-only and keyed by specialty. A future real source must provide authenticated business/location scope, source permissions, transaction/version rules, canonical resource references and authoritative results. Do not use preview resource names or a merchant-declared licensing answer as live authority.

## Booking-engine reuse and boundary

Inspected the implemented booking workspace, management / specialist forms, `BookingOffering` / `BookingResource` / occurrence / pricing types, `packages/booking-config`, and the reconciled profile, question and domain snapshot. The existing engine already owns scheduling, resource allocation, dated-session capacity, closures and booking commitments, including its specialist workflows. It is not replaced here.

Offerings reuses the booking `SchemaField` renderer for scoped typed attributes and compatible booking model/type vocabulary. `bookingOfferingProjection` documents a future adapter seam; it does not create reservations or assert resource readiness. The 18 listing editor contracts and 15 booking models are different layers.

Standard stock/resource-backed confirmation remains automatic after actual source checks. Missing or unavailable sources never create a generic merchant acceptance queue. Quotes, custom specification agreement and administrative provider handoff keep their own meaning.

## Layout

Desktop keeps catalogue and editor in the available viewport, with independent scrolling for long lists and forms and always-reachable editor actions. At narrow widths the editor occupies the same screen and provides **Back to catalogue**. Necessary information stays reachable through the five editor sections and applicable disclosures. Long records are not shrunk or cut off to force all content into one static view.

The approved image is `docs/merchant-portal-plan/offerings-concept/offerings-general.png`. The existing shell and Manrope typography are retained; the Offerings title follows the image’s serif treatment. Sample thumbnails reuse existing project category imagery; real listing media uses the upload field.

## Verification

From the workspace root:

```
pnpm --filter @nexg/web exec tsc --noEmit --pretty false
pnpm --filter @nexg/web exec vitest run components/merchant/offerings/model.test.ts
node scripts/smoke-offerings-preview.cjs
node scripts/smoke-offerings-options.cjs
```

The browser script uses `http://localhost:3129` by default; override `OFFERINGS_PREVIEW_URL` for another existing web development server. It records the actual 128 specialty renders, observed editor types, local interaction journeys and desktop / compact / phone bounds under `docs/merchant-portal-plan/offerings-concept/implementation/`.

These checks cover the implemented frontend. They do not claim that all 128 production merchant journeys, real ERP adapters or real booking allocations have been exercised.

Discount amounts are calculated in integer KES minor units, with percentage discounts rounded once to the nearest cent. Scheduled discounts use Africa/Nairobi inputs. This calculation is a frontend preview; a future checkout/ERP adapter must authoritatively revalidate the policy, price and time. Previously accepted bookings/prices are not edited by this workspace.

The expanded editor now uses a visible outlined Add discount button with a percent icon, alongside Add offering. Header actions are 32px high. The discount button opens the relevant Pricing controls; the table reclaims the editor width on close. Desktop, compact and phone checks for these controls are recorded in `button-viewport-verification.json`.

The compact catalogue now accommodates ten complete standard rows at the tested 1280 × 633 desktop viewport, using smaller thumbnails and tighter spacing while retaining text sizes. The editor, filtering, source details and existing five sample records are preserved.
