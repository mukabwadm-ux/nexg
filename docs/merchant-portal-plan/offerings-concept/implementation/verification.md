# Offerings frontend verification

31 October 2026. This evidence concerns the frontend preview in the existing Desktop merchant workspace.

The actual browser journey rendered all 128 specialty profiles, observed 17 primary editors and the explicitly configured conditional space editor, and exercised local editing, saving, reload persistence, publication and unpublication, unsaved-change protection, externally owned stock, source-unavailable state, search, validated CSV import, blocked incomplete publication, and a published item with zero stock.

Viewport checks: 1568 × 1003 desktop, 1280 × 720 compact desktop, and 390 × 844 phone. The document stays inside the viewport, editor actions stay visible, long forms/lists scroll internally, and phone navigation returns to the catalogue. Captures are `desktop.png`, `compact.png` and `mobile.png`.

The final clean run records browser errors and backend/Next-action POST requests in `browser-verification.json`. Public delivery-location initialization is passive on this route; the shopper location sheet, floating customer chat and populated customer cart are excluded from the merchant Offerings screen.

The 19 model/source tests cover all current profile bindings, publication for each of the 18 editors, an additional category using existing components, incomplete drafts, source ownership, monetary precision, unknown versus zero stock, normal automatic confirmation, conflicting tabs, storage write failure, quoted CSV and invalid imports, scope restrictions and handover validation. TypeScript and scoped lint checks are recorded in the implementation session.

The approved picture is a design reference. Browser screenshots show the implemented interface. Neither is evidence of actual external inventory, live provider verification, real customer bookings or production acceptance of all 128 merchant journeys. No backend or Supabase implementation was performed for Offerings.

The correction pass added recovery for unknown saved editor IDs and malformed resource arrays, removed compact name/price overlap, and named the phone Preview action. `phone-preview-verification.json` records a direct phone click opening the Preview tab. Final layout captures replace the earlier inspection captures.

The user’s added discount and expanded-panel requirements are recorded in `options-verification.json`: percentage discount published and retained after reload, fixed KES discount published, excessive discount rejected, creation from the expanded panel, table widening after close and split-view restoration after row selection. The same run exercises quantities/options, bundle references, visibility scheduling and archive/restore. `discount-state.png` is a browser verification capture, not another generated concept image. The all-128 browser matrix and type/lint checks were rerun after those additions.

Final button refinement: Add discount is an outlined percent-icon button in the expanded component. `button-viewport-verification.json` confirms its visible dimensions and bounded publication controls at all three viewport sizes. The added-scope browser run also confirms discount-to-quote recovery and publishing.
