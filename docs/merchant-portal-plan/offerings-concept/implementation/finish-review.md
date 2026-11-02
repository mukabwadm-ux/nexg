# Disposition

Fix, then recapture once. Keep the implemented visual direction and shared components. No rebuild is warranted.

# Evidence inspected

- Approved `offerings-general.png` and implementation captures at 1568 × 1003, 1280 × 720 and 390 × 844.
- `implementation-brief.md`, Offerings screen specification, Impeccable craft floor and Operate guidance.
- Offerings workspace, editor, CSS, model, schema registry, 128-profile configuration, local source and README; development route and inherited live-preview shell.
- `browser-verification.json`, which records all 128 specialty renders, all 18 editor contracts, the listed local journeys, bounded layouts and no browser errors or backend requests.

# Material findings

1. **P1: Catalogue names collide with prices at 1280 px.** The compact capture visibly merges “Occasion makeup” and “Bridal makeup” with their prices. `workspace.module.css:281` caps cells at 140 px while `workspace.module.css:326` gives the row button a 175 px minimum. Assign a sufficient Offering column or allow its text container to shrink and wrap within the cell. Remove the conflicting minimum. Retain the image and price basis, and verify long names with all optional columns shown.
2. **P2: Invalid stored configuration can crash before recovery appears.** `source.ts:33` accepts any enabled-schema array. `workspace.tsx:523` then dereferences each ID without checking the registry; the empty-catalogue message at `workspace.tsx:653` also assumes a first valid ID. Validate the nonempty enabled-schema list against permitted registered schemas while loading. Reject malformed nested fields needed by rendering, including resource arrays. Route failure through the existing retry/reset state. Verify an unknown schema and a missing nested array without losing the reset control.
3. **P2: The phone Preview button loses its accessible name.** `workspace.module.css:949` hides its text while `editor.tsx:781` supplies only an unnamed eye icon. Add `aria-label="Preview offering"` to the button. Verify the name at the phone breakpoint.

# Quality/brief assessment

The dark navigation, cream workspace, serif Offerings heading, white editor, fine rules and restrained gold actions carry the approved image into the inherited shell. Catalogue selection and the fixed action footer remain clear. Independent catalogue/form scrolling and the phone back control satisfy the viewport strategy shown in the supplied evidence.

The implementation is visibly denser than the approved image. Table text is 10–12 px, and reused category thumbnails repeat across services while products use placeholders. The brief explicitly permits existing imagery and compact Manrope controls, so these differences do not justify a new visual direction. The active-tab underline is a legitimate selection indicator, not a card accent defect.

The adaptive configuration and editor structure fit the frontend-only brief. The supplied verification supports broad rendering coverage and the tested local workflows. It does not establish production integration, which is outside this request.

# Limits

Read-only finish review of the supplied captures and current source. No browser, server, test execution or unrelated screen review. Type/lint and 13 data-test passes were supplied by the implementing agent, not rerun here. The capture comparison predates the corrections above; a single final desktop/compact/phone recapture should confirm them. Supabase, booking allocations and future onboarding are outside this verdict.

## Final verdict after corrections

31 October 2026. This verdict supersedes the initial fix disposition for the three findings above. Disposition: **ship within this review's scope**.

| Finding | Status | Evidence |
| --- | --- | --- |
| Compact name/price collision | Resolved | Final 1280 × 720 capture separates every visible offering name from its price. CSS gives the Offering column a 190 px minimum, removes the row button minimum and permits its text to shrink/wrap. The recorded browser check also asserts name/price separation. |
| Invalid saved-configuration recovery | Resolved | The local source rejects empty, unknown and disallowed enabled-schema IDs and malformed resource/history/variant arrays. Loading clears the previous catalogue before recovery. Final browser evidence records injected invalid-cache recovery with no page errors. |
| Unnamed phone Preview button | Resolved | The footer button has `aria-label="Preview offering"`. `phone-preview-verification.json` records that accessible name and an actual phone click selecting Preview. |

The final desktop, compact and phone captures were opened and inspected. This was a limited verification of these three corrections, with no new broad review, browser session or test run. The implementing agent reports 14 source/model tests, full web typecheck and scoped lint passing; those checks were not rerun by this reviewer. No unresolved finding remains among the three reviewed fixes.

## Added-scope review: discounts and expanded editor actions

31 October 2026. Disposition: **ship within the added scope**. The earlier three resolved findings remain resolved.

Inspected `catalogue-options.tsx`, the discount arithmetic/labels/validation and price ownership checks, local persistence, editor shortcuts and publication actions, expanded-catalogue state/CSS, updated desktop/compact/phone captures, `discount-state.png` and `options-verification.json`.

The discount capture shows the correct 15% reduction from KES 3,500 to KES 2,975, with the original price crossed out and publication visible. Percentage and fixed KES discounts use minor-unit arithmetic; date windows use Nairobi time. Validation limits discounts to supported priced offerings and prevents amounts exceeding the applicable variant prices. Source-owned price changes remain guarded. The recorded journeys cover discount publishing/reload and invalid amounts.

The expanded editor exposes Add offering and retains unsaved-change protection. Closing it clears selection, restores focus to the offering row and widens the catalogue and its controls. The recorded journeys cover close, widen, reopen and creation from the expanded component.

One material issue found during this pass is now **resolved**. Switching a discounted offering to quote pricing originally retained an enabled discount while disabling the control needed to remove it, so validation blocked saving. The pricing-method handler now disables the discount while preserving its settings; the checkbox also permits disabling an existing discount in quote/enquiry mode. Updated browser evidence records `discount-to-quote-disables-discount-and-publishes`, with no browser errors.

No unresolved material finding remains for these additions. This was a bounded source/capture review with no browser, server or test execution. The implementing agent reports 19 source/model tests, type/lint checks and the rerun 128-specialty/18-editor browser matrix passing. Those checks were not independently rerun here.
