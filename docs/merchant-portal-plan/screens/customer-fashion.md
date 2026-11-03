# Customer Fashion & Apparel screens

Status: category-specific design for review, 31 October 2026.

The [Fashion screen designs](../offering-map/fashion-screens.md) define the browse card, product detail page, size-guide sheet and private service request. The [field review](../offering-map/fashion-review.md) maps each merchant entry to its destination; [Fashion JSON](../offering-map/fashion-review.json) is the generated structured view.

Customer requirements:

- CF01: browse cards show actual identity/media, meaningful highlights and accurately labelled price/availability.
- CF02: details group material, construction, fit, care, inclusions and applicable terms by the selected item type.
- CF03: size/colour selectors refer to actual combinations and do not manufacture unsupported variants.
- CF04: selecting a variant updates its applicable photo, price, stock and specification overrides together.
- CF05: Size guide is adjacent to size selection and identifies the actual selected chart row, basis, unit and instructions.
- CF06: garment measurements, body measurements, flat widths and circumferences have explicit distinct meanings.
- CF07: unit display conversion preserves known source values and declared precision; it does not create unknown measurements or size-system equivalences.
- CF08: fitting and size fields differ for garments, shoes, rings, headwear and other items; irrelevant fields are omitted.
- CF09: the order review retains the actual selected variant, quantity and accepted specification/price/policy references.
- CF10: tailoring measurements, references and contact details are private transaction inputs, while supported options and instructions are public definitions.
- CF11: unknown, unavailable, not applicable, pending and source-conflict states remain distinct with a useful next step.
- CF12: the detail/guide/selection journey supports keyboard and mobile use with labelled controls, useful error associations and focus return.

These are design acceptance criteria for future implementation. The current review changes planning data and specifications only.
