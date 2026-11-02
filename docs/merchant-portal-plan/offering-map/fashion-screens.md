# Fashion & Apparel screen designs

Date: 31 October 2026. Status: design and specification review. Working application screens are outside this round, as the user requested. The [Fashion field review](fashion-review.md) and [Fashion JSON](fashion-review.json) provide the specific fields used here.

## Merchant catalogue and offering editor

Keep the existing catalogue/editor arrangement and the Details, Pricing, Availability, Customer preview and History tabs. Retain a labelled Add offering action and a resumable draft. The specific offering type controls the field groups, not the merchant's primary identity alone.

The catalogue identifies the actual item type, name, meaningful price basis, publication state, operational availability and location/source scope. A dress is not labelled only Women's Fashion. Variant stock can be mixed; do not report every size as available from one item-level switch.

Details groups:

1. Listing identity and photos. Name, summary, brand/maker if supplied, item type, condition, actual included pieces and public style reference. Associate colour-specific media and relevant construction/defect closeups without deriving claims from images.
2. Specifications. Fabric/materials, fit and actual type-specific construction. A dress exposes neckline, closure, sleeve style, lining and applicable adjustments. Footwear, bags, watches and jewellery expose their own fields.
3. Sizes and fit. Choose the actual sizing system or merchant labels. Reference an accurate shared chart or enter item-specific rows. State body versus garment, circumference versus flat width, units and how to measure. Reveal only measurements applicable to the chosen construction.
4. Colours, patterns and variants. Create the actual combinations, stable references, appropriate photo associations and any specification/measurement overrides. An unavailable combination is not manufactured by a size/colour cross-product.

Pricing identifies the actual variant price, price basis, charge currency and any applicable adjustments. Availability owns the permitted stock-by-variant/branch view. When a source owns price, stock or a chart, explain the source and supported editing route. An item can be listed at multiple branches with different actual stock.

Service offerings branch appropriately. Styling uses scope, method, duration, provider and scheduling. Tailoring captures the actual garment task, materials supplier, supported customization, fitting/measurement method and production acceptance. Personal measurements and customer reference uploads are private request data. A production request does not silently reserve a fitting appointment.

## Merchant size-guide editor

The chart header contains its name, version/source, measurement basis, units, measurement instructions and applicability. Each row references an actual size/variant/piece. Each relevant measurement column has an explicit meaning and unit. A body measurement must not share an unlabelled column with a garment measurement.

For a dress, relevant columns are size, bust, waist, hips and length, plus sleeve length when applicable. Adjustable/elastic ranges and not-applicable values are explicit. A skirt excludes inseam; trousers can include inseam, rise, thigh or leg opening where supplied. Sets preserve separate upper/lower piece rows. Ring, footwear and headwear guides have their own meanings.

Actions are Add size, edit a known value/range, inspect actual variants, select an accurate saved chart and review affected listings before a shared update. Unit conversion preserves the known measurement and precision. It never generates a body size, ring-size equivalence or new measurement from a letter label.

## Customer browse card

Show an accurate image, product name, brand/maker if relevant, brief useful highlights and meaningful price. Selected card highlights must not require a random unselected size; a dress can show fabric/fit and a price range where variants differ. Available sizes can be summarized from actual variant data with correct location/source scope.

Do not place the full size chart or every construction field on the card. Opening the item leads to the detailed product view. A promotional card retains the correct variant image, eligibility and from/selected price basis.

## Customer product detail page

The hierarchy is gallery and identity, meaningful price, colour/size choices, Size guide beside the size control, quantity and supported order action, fulfilment, grouped details and applicable terms. On a narrow screen, keep a clear reading order and a visible route back to the choices.

Group specifications by meaning. A dress shows fabric, fit, length style, neckline, closure, sleeve style, lining and relevant construction. Its numeric size measurements remain in the labelled guide. Shoes show their size system, materials, width/fit and fastening. Bags show actual dimensions, material, compartments and strap measurements. Watches show movement, case dimensions/materials, wrist fit and sourced features; smartwatches add exact model/system compatibility. Rings, necklaces, bracelets, earrings, belts, hats and scarves show their own dimensions, fit and actual piece counts.

Choosing a real variant updates its image where associated, price, stock and relevant specifications/guide row. Keep an unavailable choice understandable and do not silently substitute another size. Show the selected variant before order commitment. Unknown stock, missing fit information and unconfirmed delivery remain accurately labelled.

## Customer size guide

Open a labelled sheet/dialog or page with the current item name, selected size, measurement basis, units, relevant chart and measurement instructions. The selected size row is visibly identified using text as well as styling. The customer can compare other actual sizes. Close/back returns focus and selection to the product's size control.

The illustrative chart in the review material is fictional. Known centimetre values can be displayed in inches with declared precision; the underlying values and measurement basis do not change. An unavailable measurement says Not provided or Not applicable as appropriate. A shared chart with variant overrides shows the actual applicable values.

## Private tailoring and styling request

Public pages describe the supported task and process. A customer only enters personal measurements, private garment/reference files, contact and relevant preferences when needed for the selected service. Show who receives this information and keep it out of public specifications and ordinary product exports. Draft/submitted/accepted outcomes remain distinct.

## States and review criteria

Drafts retain missing information without invented values. A review summary links each proposed publication gap to its field. Type changes preview incompatible fields; retained historical values cannot leak into the new public page. Stale/conflicting source data retains its source state and recovery route. Owner permission and confirmed availability remain necessary for future runtime actions.

Review each of the seven specialties with actual merchant samples, including size/colour stock differences, a one-size adjustable item, a set with different piece sizes, a sourced chart, a private tailoring request and a source-owned price/stock field. Future runtime checks include keyboard operation, labelled errors, focus return, zoom/reflow and accurate public/private projections. These design specifications do not establish accessibility conformance or a completed application.
