# Compact merchant workspace

The user's reference controls element placement and density. Keep sidebar menu styling unchanged. The existing Merchant workspace / Business workspace identity now occupies the former NEXG wordmark position, with no duplicate identity block below it. Desktop and mobile drawer navigation share this naming.

Work has a fixed heading, tabs, search, filters and record count. Its queue owns vertical scrolling and keeps its column headings visible. Selection, workflow steps and actions retain the existing model and source handlers.

`TableViewport` is the shared scroll container for Work, Offerings, Money, Promotions, the UI DataTable and Insights chart tables. It has soft boundaries, a stable narrow gutter, no scrollbar arrow buttons, and a scrollbar that reveals on interaction and fades after idle. Keyboard focus preserves a visible scroll affordance. Use the explicit `@nexg/ui/table-viewport` export in app components to avoid the development barrel cache.

Desktop Insights uses one viewport for its heading, filters, peer tabs, metric row, charts and evidence summary. Tables fit the available height and paginate remaining records. Report collections are also paginated. Standard sample disclosure remains in the shell and Coverage; partial/error notices stay visible. Timing evidence links remain on the readiness metric. Menu and Finance use the existing permitted metric definitions and full filtered exports remain unchanged.

The local preview uses port3141 with `NEXG_NEXT_DIST_DIR=.next-merchant-layout-preview`. Its output stays separate from other preview/build directories. The prior cache served an invalid JavaScript bundle during development; only the verified3141 preview processes were restarted. No business logic was changed to work around that bundle failure.

Verification artifacts are in `docs/audits/merchant-layout-2026-11-01/`. The browser script checkpoints each passing case and skips it on later runs. Set `LAYOUT_CASES` only for cases whose implementation changed or whose previous result failed. Do not repeat the earlier passing reporting/source/workspace model suites for these presentation changes.

The web TypeScript check passed. Changed source lint passed; the native scroll region's keyboard focus is an intentional, documented exception to the noninteractive-tabindex rule. The layout detector found no issues. The 21st static review flagged two existing outline removals, each already paired with a gold focus ring in the same class/block; those are documented false positives, not removed focus indicators. Its remaining suggestions concern existing scoped design literals.

The eight-view review gallery now points to the compact implementation captures. No deployment, new dependency installation, operational data mutation, or backend source rewrite was performed.
