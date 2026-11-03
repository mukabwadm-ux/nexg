# Offerings implementation brief

31 October 2026. Mode: Operate. User-approved extension of the existing NEXG merchant workspace, based on `offerings-general.png`.

## Direction contract

THESIS: Let a merchant maintain their actual catalogue with the relevant details, price and capacity semantics. One shared screen adapts through scoped configuration and 18 specialist editor contracts.

OWN-WORLD: Preserve the existing NEXG dark sidebar, cream workspace, white editor, fine neutral rules, compact Manrope controls and gold actions with dark text. The Offerings title follows the approved image’s serif face.

STORY: Scan and filter the catalogue, select an offering, edit the applicable fields, inspect source ownership and availability, preview the customer listing, then save or publish in the local frontend preview.

FIRST VIEWPORT: Existing nine-item sidebar and compact header; Offerings title and creation/import actions above the catalogue. Catalogue occupies the larger left column, selected editor the right. Editor actions remain visible while its body scrolls. Phone uses the same frame with one active pane and a back control.

FORM: User-pinned catalogue / detail composition. No concept tournament or new generated image. Seed key: user-approved `offerings-general.png`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints and evidence

Frontend only, Supabase untouched. Inspect and reuse booking-engine foundations while preserving its implementation. The first post-onboarding screen and existing Home are outside the redesign boundary. Onboarding remains last. Browser samples are labelled and saved only locally. No customer transactions or real external source changes occur.

Existing category imagery is reused; no new shipping raster is generated. Source credits remain in `apps/web/public/images/categories/CREDITS.md`. The one approved general concept image remains a planning reference. Browser captures are verification evidence.

Current implementation and integration boundary: `apps/web/components/merchant/offerings/README.md`. Validation evidence and screenshots: `implementation/`. The token-bearing incumbent design record belongs to the finish documentation pass; no replacement product world is authorized.

## Mechanical review

The one detector pass flagged the active tab underline (`border-bottom: 3px`) as a rounded-card accent. These are tab indicators, not cards; retained to match the approved concept and make selection visible. No accent-card treatment was introduced.
