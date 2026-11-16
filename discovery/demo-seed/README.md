# Local demo catalogue

A curated demo catalogue for the **local** Supabase (Derrick NexG). It lets each Discovery workflow be built end to end: browse, storefront, then order or booking. The owner approved it on 8 Nov 2026. It's steps D1–D4 of `docs/discovery/END_TO_END_PLAN.md`.

**Never load it into a hosted Supabase project.** The SQL refuses to run unless the session first runs `set nexg.demo_seed_target = 'local';`.

## What's here

| File | What it is |
|---|---|
| `source/demo-api-snapshot.json` | D1: a read-only snapshot of the NEXG-PLATFORM demo API, taken on 8 Nov 2026 over HTTP: 640 merchants, 14,895 items, 20 areas. With it, the Docker demo stack isn't needed to rebuild the seed. |
| `source/gap-fill.json` | New synthetic demo merchants for the nine subcategories that had none (owner decision, 8 Nov 2026). Each group has 5 merchants, M0641–M0685, named in the demo style, with 12 items at five price levels. Only in this seed; the demo API doesn't have them. |
| `source/supabase-merchant-seed.json` | The merchants and branches from Derrick NexG's `supabase/seeds/merchants-seed-catalog.sql`: fixed UUIDs, Supabase category keys, coordinates. The source file was only read, never changed. |
| `subcategory-map.json` | D2, redone for NexG's master category list (owner, 16 Nov 2026): one row per master subcategory (214), with its Supabase keys, its Discovery subcategory, its default journey (from `docs/discovery/MASTER_NAVIGATION.json`) and the demo groups whose merchants land there. Demo keys move the way the migration moves live merchants (`translateKeys` in `scripts/demo-seed/lib.ts`); 129 master subcategories have no demo merchants. Discovery's Supabase provider reads this map. |
| `SUBCATEGORY_MAP.md` | The same map as a table, for review. |
| `catalogue-demo-seed.sql` | D3: one guarded transaction you can re-run. It holds 715 merchants, 715 branches, one section per merchant, 15,360 items (prices in whole shillings) and 60 demo liquor licences. Merchants carry the master list's category and subcategory keys. |

All four outputs are generated. Edit the sources or `scripts/demo-seed/lib.ts`, never the outputs.

## How demo rows are recognised

Supabase has no demo column yet. Until one is added before go-live (plan step W5), demo rows are recognised by their fixed ID ranges:

| Rows | ID range |
|---|---|
| Merchants | `c1000000-0000-4000-8000-<merchant number>` (M0384 is `…000000000384`) |
| Branches | `d1000000-…` |
| Sections | `f2000000-…` (one per merchant) |
| Items | `f1000000-0000-4000-8000-<item number>` (I12476 is `…000000012476`) |
| Demo liquor licences | `f3000000-…` (one per merchant selling adult or alcohol items) |

Contacts can't reach anyone. Emails are `m0001@example.com`, a reserved domain. Phone numbers start `+254 0`, which no Kenyan line can have.

## Known limits

- **Adult and alcohol items:** these 1,800 items are marked age-restricted, and `catalogue_public` shows them only when the merchant has a verified liquor licence. On the owner's instruction (8 Nov), the seed adds one verified demo licence for each of the 60 merchants that sells them. Licence IDs are `f3000000-…`, valid until 31 Dec 2027, with no file behind them, so opening one in the admin console finds nothing.
  - The view knows only liquor licences, so adult and tobacco merchants get one too.
  - Inserting a licence re-runs `fn_partner_recompute_status`, which leaves a live merchant unchanged unless a document is rejected or expired.
- **Photos:** the demo photos are Unsplash links, and `catalogue_public` has no photo column. The catalog bridge (plan step E1) serves them from the snapshot for demo rows only.
- **Opening hours:** none are seeded, so Open now stays unknown.
- **Master category list (16 Nov 2026):** demo merchants moved with their keys, as the migration moves live ones: a retired subcategory goes where the master list's `retiredSubcategories` sends it, and demo-only keys (Play's groups, `salon_barber`, `device_repairs`…) go where `demoKeys` in `docs/discovery/MASTER_CATEGORIES_OVERLAY.json` sends them. Logistics & Shipping now shows as Courier Services and Health Coaching as Stress Management. The demo API's seven Financial Services groups (35 banks, 420 items) are left out of the seed: the master list sends Financial Services to Concierge, which suits live merchants but not demo banks.
- *History:* before the master list, 12 demo subcategories had no Discovery subcategory (Financial Services, Logistics & Shipping, Health Coaching).
- **Gap-fill merchants have no photos yet.** They're on the image list for Codex.

## Commands

```bash
npm run demo-seed:extract
```

Re-reads Derrick NexG's seed file (read-only).

```bash
npm run demo-seed
```

Regenerates the map, the review table and the SQL.

```bash
npm run demo-seed:check
```

Fails if the outputs are out of date. `npm test` also checks the SQL row by row.

Loading (step D4) needs the owner's go-ahead at that moment, with the Docker demo stack stopped first.
