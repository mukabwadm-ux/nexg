# Promotions frontend sample

`/merchant-live-preview/promotions` is a development-only, browser-persisted Promotions workspace. It uses the same merchant preview shell as Offerings, Availability, Business and Money. Campaigns and History are the only tabs; Featured placement is a campaign type, and the selected promotion has a customer-app preview.

The specialty selector is driven by the existing 21-category / 128-subcategory Offering registry. The actual offering schema, selected variant, price mode and unit determine the promotion's context. The sample supports drafts, review, percentage or fixed discounts, start and end dates, pause, resume, end, duplication, Featured sample requests, and discovery/detail customer previews. Customer snapshots include selected variants, compatible choices and explicitly public offering details; arbitrary operational and customer fields are excluded.

The sample shares browser-stored discounts with the Offerings preview. It checks revisions and does not silently replace an external or changed discount. Sample data is kept per specialty, only in this browser. No payment, customer order, booking or real placement request is created. Browser Web Locks coordinate promotion commands when available, but do not make independent Offerings editor operations transactional across tabs.

## Verify

Run `pnpm --filter @nexg/web exec vitest run components/merchant/promotions/model.test.ts` for the model and lifecycle tests. With the web development server running on port 3129, run `node scripts/smoke-promotions-preview.cjs` to exercise the screen, all specialty selections, Offerings handoff, lifecycle, customer preview, recovery and phone layout in an isolated browser context.

Implementation plan: `docs/merchant-portal-plan/promotions-implementation/plan.md`.
