# Fashion & Apparel: fields and customer screens

Date: 31 October 2026. Status: detailed design for review. The user approved the 21 cross-category workflow additions for inclusion; the individual Fashion field requirements below remain reviewable.

[All categories](README.md) / [Fashion JSON](fashion-review.json) / [Field library](field-library.md) / [Screen design](fashion-screens.md)

## Seven merchant subcategories

These labels suggest offering types. They do not restrict a merchant from adding another relevant type or restrict who may buy it.

| Subcategory | Offering types and full field matrices |
| --- | --- |
| Men's Fashion | [Shirt or structured top](templates/shirt.md); [Trousers or jeans](templates/trousers.md); [Shorts](templates/shorts.md); [Jacket or coat](templates/jacket.md); [Suit or coordinated clothing set](templates/suit.md); [Knitwear or casual top](templates/knitwear.md); [Activewear garment](templates/activewear.md); [Underwear or fitted intimate garment](templates/underwear.md); [Sleepwear or loungewear](templates/sleepwear.md); [Footwear](templates/shoe.md); [Belt](templates/belt.md); [Hat or fitted headwear](templates/hat.md); [Scarf or wrap](templates/scarf.md); [Custom tailoring or made-to-measure garment](templates/tailoring.md); [Styling or fitting appointment](templates/styling.md) |
| Women's Fashion | [Dress](templates/dress.md); [Shirt or structured top](templates/shirt.md); [Trousers or jeans](templates/trousers.md); [Skirt](templates/skirt.md); [Shorts](templates/shorts.md); [Jacket or coat](templates/jacket.md); [Suit or coordinated clothing set](templates/suit.md); [Knitwear or casual top](templates/knitwear.md); [Activewear garment](templates/activewear.md); [Underwear or fitted intimate garment](templates/underwear.md); [Sleepwear or loungewear](templates/sleepwear.md); [Footwear](templates/shoe.md); [Handbag, luggage or backpack](templates/bag.md); [Scarf or wrap](templates/scarf.md); [Custom tailoring or made-to-measure garment](templates/tailoring.md); [Styling or fitting appointment](templates/styling.md); [Ring](templates/ring.md); [Necklace](templates/necklace.md); [Bracelet](templates/bracelet.md); [Earrings](templates/earrings.md) |
| Kids Fashion | [Children's top or outerwear](templates/kids_top.md); [Children's dress](templates/kids_dress.md); [Children's trousers, skirt or shorts](templates/kids_bottom.md); [School or work uniform garment/set](templates/uniform.md); [Footwear](templates/shoe.md); [Hat or fitted headwear](templates/hat.md) |
| Shoes | [Footwear](templates/shoe.md) |
| Bags | [Handbag, luggage or backpack](templates/bag.md) |
| Watches | [Wristwatch](templates/watch.md); [Smartwatch](templates/smartwatch.md) |
| Accessories | [Ring](templates/ring.md); [Necklace](templates/necklace.md); [Bracelet](templates/bracelet.md); [Earrings](templates/earrings.md); [Belt](templates/belt.md); [Hat or fitted headwear](templates/hat.md); [Scarf or wrap](templates/scarf.md) |

## Merchant entry and customer display

The next tables name each specific captured field. Shared listing, price, stock and fulfilment controls are included in the linked full matrices. Publish/conditional/optional are proposed completeness rules; missing facts are never invented. Group conditions appear beside the field requirement.

## Activewear garment

[Complete field matrix](templates/activewear.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section; Browse/search card summary | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Waist measurement by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | State endpoints for trousers, shorts or skirts. |
| Garment construction | Publish; offering | Offering detail page description and inclusions | Upper body, lower body, dress/full-body or explicitly listed set. This selects relevant measurement groups. |
| Included garments and size selection | Required when a set or coordinated outfit is sold; offering | Customer option or variant selector | Keep each piece's fit chart and valid set combinations; a jacket size does not determine a trouser size. |
| Bust measurement by size | Required when applicable to the garment fit; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | Explicit unit and basis from the chart; if not known show not provided rather than estimate. |
| Dress length by size | Publish; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | State measurement endpoints and unit; length descriptors alone do not supply a measurement. |
| Neckline | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Relevant dress neckline or explicitly not provided. |
| Closure or fastening | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Actual fastening, pull-on or adjustable construction. |
| Sleeve style | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Sleeveless is an explicit applicable value. |
| Sleeve length by size | Required when the dress has a measurable sleeve; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | State measurement endpoints and unit; not applicable to a sleeveless design. |
| Lining | Publish; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Merchant-confirmed lined/unlined information; unknown remains labelled. |
| Opacity or transparency description | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Actual merchant-confirmed coverage description; do not infer it from fabric alone. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |
| Dress length style | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Mini, midi, maxi or actual merchant descriptor; numeric length remains in the size guide. |
| Adjustable straps, waist or other fit features | Required when offered; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section; Size guide and measurement chart | Explain what adjusts and include a known measurement range rather than promising universal fit. |
| Slit or special construction detail | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Relevant actual design details with measurements where useful. |

## Handbag, luggage or backpack

[Complete field matrix](templates/bag.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Length, width and height | Publish; offering | Labelled specification section; Browse/search card summary | Explicit units and orientation. |
| Outer and lining materials | Publish; offering | Labelled specification section; Browse/search card summary | Identify actual materials and care instructions. |
| Capacity and compatible device size | Required when advertised; offering | Labelled specification section | Separate litres from compatible laptop diagonal; dimensions must support any fit claim. |
| Compartments, closure and straps | Optional; offering | Labelled specification section | Include adjustable strap range where relevant. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Bag type | Publish; offering | Browse/search card summary; Labelled specification section | Handbag, backpack, travel bag or actual supported type selects relevant features. |
| Strap drop and adjustable length | Required when relevant; offering | Labelled specification section | Named measurement with unit and endpoints; handle drop is not total strap length. |
| Compartments, handles, wheels and closure | Optional; offering | Labelled specification section | Only applicable actual features; distinguish included straps/locks from optional extras. |
| Lining and care information | Optional; offering | Offering detail page description and inclusions | Actual lining/material and confirmed care instructions. |

## Belt

[Complete field matrix](templates/belt.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Belt length or wearer fit by size | Publish; offering | Customer option or variant selector; Size guide and measurement chart | Named measurement method, unit and size rows; total strap length differs from buckle-to-hole measurement. |
| Belt width | Publish; offering | Labelled specification section | Explicit length unit. |
| Hole range, trim-to-fit or adjustment | Required when adjustable; offering | Size guide and measurement chart | Actual supported range and instructions. |
| Buckle and closure | Optional; offering | Labelled specification section | Actual buckle material/type and whether interchangeable. |

## Bracelet

[Complete field matrix](templates/bracelet.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Wrist range or item length by size | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | State body circumference versus item length and unit; adjustable range is explicit. |
| Bracelet width and charm dimensions | Required when relevant; offering | Labelled specification section | Explicit units and applicable dimensions. |
| Clasp or stretch construction | Optional; offering | Labelled specification section | Actual fastening/adjustment mechanism. |

## Dress

[Complete field matrix](templates/dress.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section; Browse/search card summary | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Bust measurement by size | Required when applicable to the garment fit; variant_size | Size guide and measurement chart | Explicit unit and basis from the chart; if not known show not provided rather than estimate. |
| Waist measurement by size | Required when the design defines a waist fit; variant_size | Size guide and measurement chart | Allow an elastic or adjustable range and explain how it was measured. |
| Hip measurement by size | Required when the design defines a hip fit; variant_size | Size guide and measurement chart | Do not reuse waist or bust values as hip measurements. |
| Dress length by size | Publish; variant_size | Size guide and measurement chart | State measurement endpoints and unit; length descriptors alone do not supply a measurement. |
| Neckline | Optional; offering | Labelled specification section | Relevant dress neckline or explicitly not provided. |
| Closure or fastening | Optional; offering | Labelled specification section | Actual fastening, pull-on or adjustable construction. |
| Sleeve style | Optional; offering | Labelled specification section | Sleeveless is an explicit applicable value. |
| Sleeve length by size | Required when the dress has a measurable sleeve; variant_size | Size guide and measurement chart | State measurement endpoints and unit; not applicable to a sleeveless design. |
| Lining | Publish; offering | Labelled specification section | Merchant-confirmed lined/unlined information; unknown remains labelled. |
| Opacity or transparency description | Optional; offering | Labelled specification section | Actual merchant-confirmed coverage description; do not infer it from fabric alone. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Dress length style | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Mini, midi, maxi or actual merchant descriptor; numeric length remains in the size guide. |
| Adjustable straps, waist or other fit features | Required when offered; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section; Size guide and measurement chart | Explain what adjusts and include a known measurement range rather than promising universal fit. |
| Slit or special construction detail | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Relevant actual design details with measurements where useful. |

## Earrings

[Complete field matrix](templates/earrings.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Single, pair or set contents | Publish; offering | Browse/search card summary; Labelled specification section | Actual included piece count; a photo of a pair does not establish that two are sold. |
| Drop, diameter and relevant dimensions | Publish; offering | Labelled specification section | Named measurements with units. |
| Post, hook, clip or other fastening | Publish; offering | Labelled specification section | Actual fastening and material where relevant; no inferred allergy/safety guarantee. |

## Hat or fitted headwear

[Complete field matrix](templates/hat.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Head circumference range by size | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Body fit range and length unit; one-size requires actual guidance or an explicit not-provided state. |
| Adjustment or stretch | Optional; offering | Size guide and measurement chart | Actual mechanism and known range. |
| Brim, crown or relevant dimensions | Required when relevant; offering | Labelled specification section | Named dimensions with explicit units. |

## Jacket or coat

[Complete field matrix](templates/jacket.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Lining, insulation and intended layers | Publish; offering | Labelled specification section; Browse/search card summary | Describe actual construction and fit allowance. |
| Hood, pockets and fastening | Optional; offering | Labelled specification section | Declared features; performance claims need confirmed supporting information. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |

## Children's trousers, skirt or shorts

[Complete field matrix](templates/kids_bottom.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Waist measurement by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart; Browse/search card summary | State endpoints for trousers, shorts or skirts. |
| Indicative age band | Optional; offering | Offering detail page description and inclusions | Age is guidance, not a substitute for actual size and fit measurements. |
| Wearer height range by size | Required when the label uses height sizing; variant_size | Size guide and measurement chart; Browse/search card summary | Explicit units and body-measurement basis. |
| Adjustable features and school requirements | Optional; offering | Labelled specification section | Specify actual fastenings and school/uniform design where applicable. |
| Garment construction | Publish; offering | Offering detail page description and inclusions | Upper body, lower body, dress/full-body or explicitly listed set. This selects relevant measurement groups. |
| Included garments and size selection | Required when a set or coordinated outfit is sold; offering | Customer option or variant selector | Keep each piece's fit chart and valid set combinations; a jacket size does not determine a trouser size. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |

## Children's dress

[Complete field matrix](templates/kids_dress.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Bust measurement by size | Required when applicable to the garment fit; variant_size | Size guide and measurement chart | Explicit unit and basis from the chart; if not known show not provided rather than estimate. |
| Waist measurement by size | Required when the design defines a waist fit; variant_size | Size guide and measurement chart | Allow an elastic or adjustable range and explain how it was measured. |
| Hip measurement by size | Required when the design defines a hip fit; variant_size | Size guide and measurement chart | Do not reuse waist or bust values as hip measurements. |
| Dress length by size | Publish; variant_size | Size guide and measurement chart | State measurement endpoints and unit; length descriptors alone do not supply a measurement. |
| Neckline | Optional; offering | Labelled specification section | Relevant dress neckline or explicitly not provided. |
| Closure or fastening | Optional; offering | Labelled specification section | Actual fastening, pull-on or adjustable construction. |
| Sleeve style | Optional; offering | Labelled specification section | Sleeveless is an explicit applicable value. |
| Sleeve length by size | Required when the dress has a measurable sleeve; variant_size | Size guide and measurement chart | State measurement endpoints and unit; not applicable to a sleeveless design. |
| Lining | Publish; offering | Labelled specification section | Merchant-confirmed lined/unlined information; unknown remains labelled. |
| Opacity or transparency description | Optional; offering | Labelled specification section | Actual merchant-confirmed coverage description; do not infer it from fabric alone. |
| Indicative age band | Optional; offering | Offering detail page description and inclusions | Age is guidance, not a substitute for actual size and fit measurements. |
| Wearer height range by size | Required when the label uses height sizing; variant_size | Size guide and measurement chart | Explicit units and body-measurement basis. |
| Adjustable features and school requirements | Optional; offering | Labelled specification section | Specify actual fastenings and school/uniform design where applicable. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Dress length style | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section; Browse/search card summary | Mini, midi, maxi or actual merchant descriptor; numeric length remains in the size guide. |
| Adjustable straps, waist or other fit features | Required when offered; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section; Size guide and measurement chart | Explain what adjusts and include a known measurement range rather than promising universal fit. |
| Slit or special construction detail | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Relevant actual design details with measurements where useful. |

## Children's top or outerwear

[Complete field matrix](templates/kids_top.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Indicative age band | Optional; offering | Offering detail page description and inclusions | Age is guidance, not a substitute for actual size and fit measurements. |
| Wearer height range by size | Required when the label uses height sizing; variant_size | Size guide and measurement chart; Browse/search card summary | Explicit units and body-measurement basis. |
| Adjustable features and school requirements | Optional; offering | Labelled specification section | Specify actual fastenings and school/uniform design where applicable. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |

## Knitwear or casual top

[Complete field matrix](templates/knitwear.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section; Browse/search card summary | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |

## Necklace

[Complete field matrix](templates/necklace.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Chain length and adjustment range | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Known chain length with units; do not confuse doubled chain length with wearing drop. |
| Pendant dimensions and included pieces | Required when a pendant is included; offering | Labelled specification section | Explicit units and whether a photographed pendant/chain is included. |
| Clasp and construction | Optional; offering | Labelled specification section | Actual fastening and construction. |

## Ring

[Complete field matrix](templates/ring.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Ring size labels and system | Publish; offering | Customer option or variant selector; Size guide and measurement chart | Preserve the actual merchant system; no unverified international conversion. |
| Internal diameter or circumference by size | Required when supplied for fit; offering | Size guide and measurement chart | Exact measurement meaning, unit and actual size row; adjustable rings state a known range. |
| Band width and setting dimensions | Required when relevant; offering | Labelled specification section | Separate band width from ring diameter; explicit units. |
| Stone, setting and declared metal specification | Optional; offering | Labelled specification section | Actual gemstone/plating/metal claims and source; do not infer authenticity or purity. |

## Scarf or wrap

[Complete field matrix](templates/scarf.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Accessory type | Publish; offering | Labelled specification section | Jewellery, belt, hat, scarf or other specific registered type. |
| Material and finish | Publish; offering | Labelled specification section; Browse/search card summary | Separate material from plating or finish. |
| Closure, set contents and care | Optional; offering | Labelled specification section | Make pair versus single and included pieces clear. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Length and width | Publish; offering | Labelled specification section | Named dimensions and unit; distinguish fringe from body length where relevant. |
| Edges, fringe and construction | Optional; offering | Labelled specification section | Actual product construction and included pieces. |

## Shirt or structured top

[Complete field matrix](templates/shirt.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section; Browse/search card summary | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |

## Footwear

[Complete field matrix](templates/shoe.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Shoe size system and labels | Publish; offering | Customer option or variant selector; Size guide and measurement chart; Browse/search card summary | EU, UK, US or merchant system as actually labelled; no invented cross-system equivalence. |
| Foot or internal length by size | Required when measurement guidance is supplied; variant_size | Size guide and measurement chart | Clearly distinguish foot length from shoe internal length and label units. |
| Width or width fitting by size | Optional; variant_size | Size guide and measurement chart | Use actual width scale or measured width with unit. |
| Upper, lining and sole materials | Publish; offering | Labelled specification section; Browse/search card summary | Keep the different materials distinguishable. |
| Heel or sole height | Required when relevant; offering | Labelled specification section | Explicit measurement unit. |
| Fastening and intended use | Optional; offering | Labelled specification section | Describe actual closure and use without unsupported safety/performance claims. |
| Colours and valid size combinations | Required when variants exist; offering | Customer option or variant selector | Real variant matrix with separate price and stock references. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Toe shape and shoe style | Optional; offering | Labelled specification section | Actual footwear shape/style; sizes still use the named system. |
| Fastening | Optional; offering | Labelled specification section | Laces, buckle, zip, slip-on or actual construction. |
| Merchant fit notes | Optional; offering | Size guide and measurement chart | Specific guidance such as width/instep allowance with its source; no automatic size recommendation. |
| Care and material-specific instructions | Optional; offering | Offering detail page description and inclusions | Use confirmed product instructions and accessible text. |

## Shorts

[Complete field matrix](templates/shorts.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Waist measurement by size | Publish; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; variant_size | Size guide and measurement chart; Browse/search card summary | State endpoints for trousers, shorts or skirts. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |

## Skirt

[Complete field matrix](templates/skirt.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section; Browse/search card summary | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Waist measurement by size | Publish; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Overall length by size | Publish; variant_size | Size guide and measurement chart; Browse/search card summary | State endpoints for trousers, shorts or skirts. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |

## Sleepwear or loungewear

[Complete field matrix](templates/sleepwear.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Waist measurement by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | State endpoints for trousers, shorts or skirts. |
| Garment construction | Publish; offering | Offering detail page description and inclusions | Upper body, lower body, dress/full-body or explicitly listed set. This selects relevant measurement groups. |
| Included garments and size selection | Required when a set or coordinated outfit is sold; offering | Customer option or variant selector | Keep each piece's fit chart and valid set combinations; a jacket size does not determine a trouser size. |
| Bust measurement by size | Required when applicable to the garment fit; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | Explicit unit and basis from the chart; if not known show not provided rather than estimate. |
| Dress length by size | Publish; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | State measurement endpoints and unit; length descriptors alone do not supply a measurement. |
| Neckline | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Relevant dress neckline or explicitly not provided. |
| Closure or fastening | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Actual fastening, pull-on or adjustable construction. |
| Sleeve style | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Sleeveless is an explicit applicable value. |
| Sleeve length by size | Required when the dress has a measurable sleeve; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | State measurement endpoints and unit; not applicable to a sleeveless design. |
| Lining | Publish; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Merchant-confirmed lined/unlined information; unknown remains labelled. |
| Opacity or transparency description | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Actual merchant-confirmed coverage description; do not infer it from fabric alone. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |
| Dress length style | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Mini, midi, maxi or actual merchant descriptor; numeric length remains in the size guide. |
| Adjustable straps, waist or other fit features | Required when offered; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section; Size guide and measurement chart | Explain what adjusts and include a known measurement range rather than promising universal fit. |
| Slit or special construction detail | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Relevant actual design details with measurements where useful. |

## Smartwatch

[Complete field matrix](templates/smartwatch.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Movement and power type | Publish; offering | Labelled specification section | Mechanical, quartz, rechargeable or actual specified type. |
| Case dimensions | Publish; offering | Labelled specification section | Case diameter, width and thickness as relevant, each with units; materials are captured separately. |
| Functions and stated resistance rating | Optional; offering | Labelled specification section | Reproduce confirmed manufacturer ratings without inferring a safe activity. |
| Case and glass materials | Publish; offering | Labelled specification section | Materials are separate from the numeric case dimensions. |
| Strap or bracelet material | Publish; offering | Labelled specification section | Identify material, finish and replaceability where known. |
| Wrist fit range | Required when fit guidance is supplied; variant_size | Size guide and measurement chart | Explicit wrist circumference range/unit and adjustable link/buckle scope. |
| Strap width | Required when applicable; offering | Labelled specification section | Known lug/strap width with unit; do not infer replacement compatibility. |
| Care, warranty and service information | Optional; offering | Offering detail page description and inclusions; Applicable terms before commitment | Confirmed product care; manufacturer rating alone does not imply a safe activity. |
| Exact smartwatch model and case version | Publish; offering | Browse/search card summary; Labelled specification section | Actual generation, case dimensions and promised model; not a generic smart-home device. |
| Compatible phone systems and required app | Publish; offering | Labelled specification section; Browse/search card summary | Actual supported versions, region/network limits and subscription needs where relevant. |
| Display type and size | Required when supplied; offering | Labelled specification section | Actual display dimensions/resolution with units where needed. |
| Battery capacity and charging | Required when supplied; offering | Labelled specification section | Rated capacity, charging method and included charger; no invented runtime. |
| Confirmed connectivity and activity features | Optional; offering | Labelled specification section | Manufacturer-described features; no inferred clinical accuracy or diagnosis. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |

## Styling or fitting appointment

[Complete field matrix](templates/styling.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| What the service includes and excludes | Publish; offering | Offering detail page description and inclusions; Applicable terms before commitment | Define the actual task or deliverables and any assessment boundary. |
| Service location or format | Publish; offering | Customer option or variant selector; Delivery, pickup, visit or access information | Merchant venue, customer location or remote where explicitly configured. |
| Service duration and unit | Publish; offering | Browse/search card summary; Supported date, time, duration and capacity selection | Exact duration when bookable; assessment-required is explicit and cannot promise a slot. |
| Eligible provider or resource description | Required when resources or staff are needed; offering | Offering detail page description and inclusions; Supported date, time, duration and capacity selection | Public provider details are an allowed projection; internal staffing records remain private. |
| Customer preparation and prerequisites | Optional; offering | Offering detail page description and inclusions; Applicable terms before commitment | Merchant-approved administrative instructions; no generated clinical or professional advice. |
| Cancellation, reschedule and no-show terms | Publish; offering | Applicable terms before commitment | Use applicable authority and version; no universal thresholds are invented here. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |

## Suit or coordinated clothing set

[Complete field matrix](templates/suit.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section; Browse/search card summary | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Waist measurement by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | State endpoints for trousers, shorts or skirts. |
| Included items and quantities | Publish; offering | Offering detail page description and inclusions | Link actual components, size/quantity and possible substitutions. |
| Wrapping and presentation options | Required when offered; offering | Customer option or variant selector; Selected price and itemized charges | Explicit inclusions and charges. |
| Message or personalization choices | Required when offered; offering | Customer option or variant selector | Allowed lengths/formats and proof approval; recipient messages stay private to the order. |
| Occasion and style descriptors | Optional; offering | Labelled specification section | Discovery descriptors, not substitute product specifications. |
| Garment construction | Publish; offering | Offering detail page description and inclusions | Upper body, lower body, dress/full-body or explicitly listed set. This selects relevant measurement groups. |
| Included garments and size selection | Required when a set or coordinated outfit is sold; offering | Customer option or variant selector | Keep each piece's fit chart and valid set combinations; a jacket size does not determine a trouser size. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |

## Custom tailoring or made-to-measure garment

[Complete field matrix](templates/tailoring.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Customizable features and limits | Publish; offering | Customer option or variant selector | Supported choices, dimensions, materials and compatibility; do not accept arbitrary infeasible configurations. |
| Proof or design approval process | Required when approval is required; offering | Applicable terms before commitment | A submitted design remains pending until the authorized acceptance. |
| Production lead time and acceptance | Publish; offering | Delivery, pickup, visit or access information; Applicable terms before commitment | Unknown scope uses quote/assessment; exact deadline is accepted separately. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Made-to-measure, alteration or garment task | Publish; offering | Browse/search card summary; Offering detail page description and inclusions | Choose the actual garment and supported task; an assessment may precede price/due acceptance. |
| Who supplies fabric and materials | Publish; offering | Offering detail page description and inclusions; Applicable terms before commitment | Merchant-supplied, customer-supplied or agreed after assessment; state inclusions and extra charges. |
| Measurement or fitting method | Publish; offering | Offering detail page description and inclusions; Customer option or variant selector | In-person fitting, submitted measurements or reference garment only if actually supported. |
| Included fittings, revisions and acceptance | Required when fittings or revisions apply; offering | Applicable terms before commitment | Appointment scheduling is separately configured; do not invent a confirmed fitting from a production request. |
| Customer's personal measurements | Required when necessary for the selected tailoring task; transaction | Private customer order, booking or enquiry input | Private transaction data with explicit body/garment basis and units; never publish as a product size chart. |
| Customer design, garment or reference files | Required when needed to agree the work; transaction | Private customer order, booking or enquiry input | Private purpose-limited attachments and approval; no raw personal files on public product pages. |

## Trousers or jeans

[Complete field matrix](templates/trousers.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section; Browse/search card summary | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Waist measurement by size | Publish; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; variant_size | Size guide and measurement chart; Browse/search card summary | State endpoints for trousers, shorts or skirts. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |

## Underwear or fitted intimate garment

[Complete field matrix](templates/underwear.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Actual garment type | Publish; offering | Offering detail page description and inclusions | Brief, bra, bodysuit or other actual construction selects the relevant fit fields. |
| Underbust or band measurement and system | Required when a band-sized garment is sold; variant_size | Size guide and measurement chart | State unit, body/garment basis and the merchant's named system. |
| Cup labels and bust fit guidance | Required when cup sizing is used; variant_size | Customer option or variant selector; Size guide and measurement chart | Cup systems are not universally equivalent; link actual band/cup combinations and known guidance. |
| Bust range by actual band/cup combination | Required when supplied for fit guidance; variant_size | Size guide and measurement chart | Explicit units and measurement basis; never calculate a cup from an unverified conversion. |
| Waist and hip fit by size | Required when a lower-body garment is sold; variant_size | Size guide and measurement chart | Separate waist and hips, units and basis; record actual combination-specific values. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |

## School or work uniform garment/set

[Complete field matrix](templates/uniform.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Fabric composition | Publish; offering | Labelled specification section; Browse/search card summary | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Publish; offering | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Publish; offering | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Required when colour or pattern choices exist; offering | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |
| Size labels and sizing system | Publish; variant_size | Customer option or variant selector; Size guide and measurement chart | Preserve merchant labels and named system; one-size still needs fit guidance. |
| Measurement basis and units | Required when a measurement chart is supplied; variant_size | Size guide and measurement chart | Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels. |
| Chart rows for actual sizes | Required when size-dependent fit is advertised; variant_size | Size guide and measurement chart | Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions. |
| Chest or bust by size | Required when used for sizing; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Label whether body or garment and flat width or circumference. |
| Shoulder width by size | Required when the construction has a defined shoulder; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Unit and measurement endpoints required. |
| Sleeve length by size | Required when sleeves are present and this measure applies; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | State how the sleeve was measured. |
| Body length by size | Publish; group applies when garment_scope.construction includes an upper-body piece; variant_size | Size guide and measurement chart | Explicit unit and measurement endpoints. |
| Collar or neckline style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual construction, not an inferred style. |
| Sleeve style | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Short, long, sleeveless or actual supported type. |
| Fastening or closure | Optional; group applies when garment_scope.construction includes an upper-body piece; offering | Labelled specification section | Actual button, zip, pull-on or other construction. |
| Waist measurement by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Include elastic/adjustable range where applicable; chart unit and basis required. |
| Hip measurement by size | Required when fitted through the hips; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Mark not applicable for a design that does not define this fit. |
| Inseam by size | Required when the item has legs; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Not applicable to skirts; explicit length unit. |
| Rise by size | Required when relevant to trouser fit; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | Use the merchant's measurement method. |
| Overall length by size | Publish; group applies when garment_scope.construction includes a lower-body piece; variant_size | Size guide and measurement chart | State endpoints for trousers, shorts or skirts. |
| Indicative age band | Optional; offering | Offering detail page description and inclusions | Age is guidance, not a substitute for actual size and fit measurements. |
| Wearer height range by size | Required when the label uses height sizing; variant_size | Size guide and measurement chart | Explicit units and body-measurement basis. |
| Adjustable features and school requirements | Optional; offering | Labelled specification section | Specify actual fastenings and school/uniform design where applicable. |
| Garment construction | Publish; offering | Offering detail page description and inclusions | Upper body, lower body, dress/full-body or explicitly listed set. This selects relevant measurement groups. |
| Included garments and size selection | Required when a set or coordinated outfit is sold; offering | Customer option or variant selector | Keep each piece's fit chart and valid set combinations; a jacket size does not determine a trouser size. |
| Bust measurement by size | Required when applicable to the garment fit; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | Explicit unit and basis from the chart; if not known show not provided rather than estimate. |
| Dress length by size | Publish; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | State measurement endpoints and unit; length descriptors alone do not supply a measurement. |
| Neckline | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Relevant dress neckline or explicitly not provided. |
| Closure or fastening | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Actual fastening, pull-on or adjustable construction. |
| Sleeve style | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Sleeveless is an explicit applicable value. |
| Sleeve length by size | Required when the dress has a measurable sleeve; group applies when garment_scope.construction includes a dress or full-body piece; variant_size | Size guide and measurement chart | State measurement endpoints and unit; not applicable to a sleeveless design. |
| Lining | Publish; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Merchant-confirmed lined/unlined information; unknown remains labelled. |
| Opacity or transparency description | Optional; group applies when garment_scope.construction includes a dress or full-body piece; offering | Labelled specification section | Actual merchant-confirmed coverage description; do not infer it from fabric alone. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Silhouette or cut | Optional; offering | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Optional; offering | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Optional; offering | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |
| Leg opening by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Explicit unit and circumference/flat-width basis; not applicable to a skirt. |
| Thigh fit by size | Required when supplied for leg fit; group applies when a lower-body garment or lower-body piece is selected; variant_size | Size guide and measurement chart | Known measurement/range and method; do not derive it from hip measurement. |
| Waistband construction | Publish; group applies when a lower-body garment or lower-body piece is selected; offering | Labelled specification section | Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims. |
| Dress length style | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Mini, midi, maxi or actual merchant descriptor; numeric length remains in the size guide. |
| Adjustable straps, waist or other fit features | Required when offered; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section; Size guide and measurement chart | Explain what adjusts and include a known measurement range rather than promising universal fit. |
| Slit or special construction detail | Optional; group applies when a dress or dress/full-body piece is selected; offering | Labelled specification section | Relevant actual design details with measurements where useful. |

## Wristwatch

[Complete field matrix](templates/watch.md)

| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |
| --- | --- | --- | --- |
| Movement and power type | Publish; offering | Labelled specification section; Browse/search card summary | Mechanical, quartz, rechargeable or actual specified type. |
| Case dimensions | Publish; offering | Labelled specification section; Browse/search card summary | Case diameter, width and thickness as relevant, each with units; materials are captured separately. |
| Functions and stated resistance rating | Optional; offering | Labelled specification section | Reproduce confirmed manufacturer ratings without inferring a safe activity. |
| Brand or maker | Optional; offering | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Optional; offering | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Optional; offering | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Required when used, refurbished or imperfect; offering | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Optional; offering | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |
| Pattern or print | Optional; offering | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Required when a shared chart is used; offering | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Required when colour, batch or construction changes fit; variant | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Required when variants are tracked; variant | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |
| Case and glass materials | Publish; offering | Labelled specification section | Materials are separate from the numeric case dimensions. |
| Strap or bracelet material | Publish; offering | Labelled specification section | Identify material, finish and replaceability where known. |
| Wrist fit range | Required when fit guidance is supplied; variant_size | Size guide and measurement chart | Explicit wrist circumference range/unit and adjustable link/buckle scope. |
| Strap width | Required when applicable; offering | Labelled specification section | Known lug/strap width with unit; do not infer replacement compatibility. |
| Care, warranty and service information | Optional; offering | Offering detail page description and inclusions; Applicable terms before commitment | Confirmed product care; manufacturer rating alone does not imply a safe activity. |

## Customer screen sections

| Section | Display and behavior |
| --- | --- |
| Browse card | Name, actual photo, selected meaningful highlights and accurately labelled price. Full measurement charts stay on the detail page. |
| Product details | Accurate gallery and title, brand/maker, description and included pieces. |
| Specifications | Group material, construction and item-specific facts using readable labels and units. Omit irrelevant fields. |
| Choose size and colour | Only real combinations; retain an unavailable option with a clear reason where appropriate, never silently substitute. |
| Size guide and fit | Highlight the selected size row, with body/garment and circumference/flat-width basis. Explicit units and variant-specific overrides apply. |
| Selected price | Update the actual selected variant price and quantities; separate supported extras and any estimate/quote-only state. |
| Delivery or collection | Show actual location eligibility, lead time and permitted methods from their authority. |
| Care, returns and service terms | Display applicable care, returns, warranty or tailoring/styling terms before commitment. |
| Service scheduling | Only relevant for actual styling/fitting appointments or configured production promises; product stock is separate. |
| Private tailoring request | Customer measurements, reference uploads and contact details remain private transaction input. |

## Merchant screen tabs

| Existing tab | Fashion groups |
| --- | --- |
| Details | Listing and photos; Specific item and construction; Size guide and measurements; Colours and actual variants |
| Pricing | Price basis; Variant prices and applicable charges; Accepted price/policy version |
| Availability | Stock by variant and branch; Supported delivery or collection; Tailoring/styling capacity only when offered |
| Customer preview | Browse card; Product details; Selected options and size guide; Fulfilment and terms |
| History | Changes, chart/policy versions and source conflicts |

## Effects on the eight merchant screens

| Screen | Required design update |
| --- | --- |
| [SC_WORK](../screens/01-work.md) | Show accepted garment/variant, piece, colour/size and chart/policy snapshot; private tailoring inputs only to authorized staff. Preserve product orders versus fitting appointments and accepted production work. |
| [SC_OFFERINGS](../screens/02-offerings.md) | Specific item selection, grouped fashion fields, real variants and units, size charts, scoped defaults, customer preview and missing-information review. |
| [SC_AVAILABILITY](../screens/03-availability.md) | Variant/branch stock for products; separate fitting/styling appointment resources and production/due capacity for tailoring. A product does not gain an appointment calendar. |
| [SC_BUSINESS](../screens/04-business.md) | Maintain brand/maker defaults, location applicability, shared versioned charts and public policy references without treating merchant specialty as a restriction on actual offerings. |
| [SC_MONEY](../screens/05-money.md) | Use accepted variant/quantity/extra prices, applicable policy versions and authoritative refund facts; size-chart edits never rewrite historical charges. |
| [SC_PROMOTIONS](../screens/06-promotions.md) | Target real eligible variants and locations, accurately show from/selected price and stock-dependent eligibility, and preserve the correct colour image. |
| [SC_INSIGHTS](../screens/07-insights.md) | Allow meaningful item/type/variant dimensions where source data exists; missing size, stock or fit-return reasons remain unavailable rather than inferred. |
| [SC_SETTINGS](../screens/08-settings.md) | Declare source/edit ownership for product details, chart versions, prices and stock; map imported size/colour/measurement fields and restrict private tailoring access. |

## Decisions still open for this category

- Which measurements should block publication for each garment type, and when is a clear not-provided state acceptable?
- Which existing merchant size charts can be reused accurately, and who maintains updates and exceptions?
- Are the proposed construction choices and separate ring, necklace, bracelet, earring and smartwatch templates sufficient for the actual ranges?

Review examples use illustrative data only. The customer view must retain actual variant identities, source ownership, private measurement boundaries and the accepted specification/price/policy snapshot.
