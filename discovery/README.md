# NexG Discovery

> **On the NexG website.** `apps/web` builds this app into `public/discover` (`scripts/build-for-web.mjs`) and serves
> it at `/discover`, reading Supabase's public views from the browser (`VITE_DISCOVERY_PROVIDER=supabase`). For now
> `/discover` is reachable only by its address: the home search and the site's links still go to `/explore`.
>
> - **Stores with no subcategory** are listed under their category (most live stores have none yet). On a category
>   page they're on the last rail, "More stores", or "All stores" when no type has a rail of its own.
> - **Play and Flights are hidden** (`HIDDEN_CATEGORY_IDS` in `src/data/taxonomy.ts`) until the platform has
>   categories for them.
> - **The Discovery Engine (`discovery-engine/`) isn't in this repository yet.** It comes in its own PR with the
>   original icon pack it checks. The website only needs `src/providers/catalogBridge.ts`, moved here from the engine.
>   The opt-in engine provider keeps a copy of the engine's contract in `src/providers/engineContract/` and needs the
>   engine service to run.
> - **The site's own header is on top** (owner, 12 Nov 2026). `/discover` is a page of the website
>   (`apps/web/app/discover`): it renders the site header, without the account icon, and Discovery renders into
>   `#discovery-root` under it (`window.nexgDiscovery.mount`, `src/main.tsx`). Discovery's own bar keeps the catalog
>   area and the search, pinned under the site header. Every Discovery style is scoped to `#discovery-root` at build
>   time (`src/styleScope.ts`), and `styles.css` undoes the site's base styles inside it.
> - CI runs `npm --prefix discovery test`.

Independent Discovery frontend and repository, V1.1. This project owns its screens/components and will be merged into NEXG-PLATFORM after standalone development and review.

The final icon pack governs **16 categories and 98 subcategories**, their labels, taxonomy order and artwork. The homepage has a separate priority order in the discovery configuration; it does not change category IDs or L2/L3 order. Adults Only and Alcohol & Beverages appear near the end. The initial ranking is a product judgment because current revenue and usage analytics are not available here. The earlier 99-entry chat baseline is preserved in documentation history. Original source images are used unchanged.

The 16/98 counts describe the current release. The owner's 16 October update requires ongoing taxonomy editing, preview and per-screen arrangement through [Discovery Studio](discovery-studio/README.md). Future published versions may change the tree and layout while preserving node/source identities. The Studio editor is planned; the existing runtime still uses the baseline files.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5180`. The default platform provider proxies reads to the existing NexG API on port 3001. Set `API_PORT` and `DISCOVERY_PORT` if needed; defaults are in `.env.example`. No merchant database is created here. The existing API is currently reachable; unavailable reads retain the selected constraints.

F10 adds an explicit engine provider (`VITE_DISCOVERY_PROVIDER=engine`) through the independent service on port 5190. It preserves bounded counts, stable paging and typed recovery in the existing screens. The engine service and its integration docs come back with the engine's own PR. The default remains `platform` while offering/source activation and broad-category latency are unresolved. Errors never switch providers automatically. The user's local environment file is not changed.

`npm test` checks provider/recovery behavior. `npm run build` checks TypeScript and creates a build; `npm run preview` serves that build locally with the same API proxy. A production host/proxy has not been configured or deployed.

## Current scope

- Standalone L1/L2 navigation from the final taxonomy/icon pack.
- One shared L3 results component, one non-wrapping filter bar and nested Category options.
- One adaptive MerchantCard and an L4 storefront/item-detail reader using original IDs.
- Read-only platform adapter with explicit unmapped/outage states and deterministic name/ID ordering.
- Preliminary catalog-group rows when real API data supports them. These are an extraction baseline; approved intent-led L2 merchandising still needs executable fact predicates.
- Ordering, booking and payment integration remain pending. Eleven current taxonomy entries need catalog mapping, with partial hospital coverage. The shell does not simulate a successful transaction.

## Documentation and source lineage

Start with [docs/discovery/README.md](docs/discovery/README.md), [the standalone plan](docs/discovery/STANDALONE_IMPLEMENTATION_PLAN.md) and [the extraction manifest](docs/discovery/EXTRACTION_MANIFEST.md). Exact extracted files live in `extracted/platform/` as reference material; they are excluded from the application dependency graph.

The broader Discovery Engine (not in this repository yet; see the note at the top) has its own implementation docs, V1-V3 roadmap, low-cost/maximum-quality profiles and benchmark plan. Its recommendation module is one of six cooperating engines. Foundation, read service, indexing, query, ranking, collections and bounded frontend integration are implemented; source activation, publication and measured V1 acceptance remain open.

The final original icon pack belongs to this repository in `ICONS/`. Its duplicate documentation copy is ignored by Git. The app serves/emits only 114 navigation PNGs from the original pack, excluding reference master sheets. Existing NexG fonts and their licenses are extracted under `assets/fonts/`. The runtime uses Quicksand and the original dark-surface wordmark; other extracted typography/brand variants remain references.

Current verification and remaining implementation work are recorded in [STANDALONE_HANDOFF.md](docs/discovery/STANDALONE_HANDOFF.md).
