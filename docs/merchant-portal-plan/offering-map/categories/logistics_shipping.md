# Logistics & Shipping

Status: proposed offering and field mapping. Each type is a selectable template, not a statement that every merchant offers it.

[All categories](../README.md) / [All screens and workflows for this category](logistics_shipping-screens.md) / [Coverage](../coverage-128.md) / [Review decisions](../review-decisions.md)

## Sea Freight

Existing identity: `sea_freight`. Effective profile: `MP_sea_freight`.

Sea route, container/consolidated load basis, port/door legs, piece dimensions, carrier charges and clearance/insurance scope need explicit intake and quote.

Existing onboarding context: `Q_SHIPPING_WAYS`, `Q_PRICE_PER_CONTAINER`, `Q_PRICE_PER_CBM`, `Q_PRICE_PER_KG`, `Q_PORT_TO_WAREHOUSE_TRANSPORT`, `Q_WAREHOUSE_TO_CLIENT_TRANSPORT`, `Q_SHIPPING_TIMES`, `Q_INSURANCE_INCLUDED`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Sea freight or container service](../templates/sea_freight.md) | Freight mode and load service; Supported origin, destination and legs; Cargo classes, restrictions and handling; Chargeable weight, volume or container basis; Transit estimate, clearance and charge inclusions; Quote validity and carrier confirmation; Goods, piece count and declared value; Dimensions, mass and unit per piece; Collection, delivery and required dates; Applicable carrier/customs document references; Actual load, container or vehicle service type; Per-piece and service load limits; Rate validity, included legs and carrier calculation reference | Card highlights: Supported origin, destination and legs, Chargeable weight, volume or container basis; Selected price and itemized charges: Chargeable weight, volume or container basis, Transit estimate, clearance and charge inclusions, How the price is calculated, Published price or quote status, Included and additional charges, Rate validity, included legs and carrier calculation reference; Delivery, pickup, visit or access information: Applicable branches or channels, Supported origin, destination and legs; Applicable terms before commitment: Cargo classes, restrictions and handling, Transit estimate, clearance and charge inclusions, Quote validity and carrier confirmation, Included and additional charges, Per-piece and service load limits, Rate validity, included legs and carrier calculation reference; Private customer order, booking or enquiry input: Goods, piece count and declared value, Dimensions, mass and unit per piece, Collection, delivery and required dates, Applicable carrier/customs document references |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Air Freight

Existing identity: `air_freight`. Effective profile: `MP_air_freight`.

Air route, piece constraints, actual carrier chargeable-weight rule, collection/delivery legs and acceptance/quote validity are required; no guessed volumetric factor.

Existing onboarding context: `Q_SHIPPING_WAYS`, `Q_PRICE_PER_CBM`, `Q_PRICE_PER_KG`, `Q_PORT_TO_WAREHOUSE_TRANSPORT`, `Q_WAREHOUSE_TO_CLIENT_TRANSPORT`, `Q_SHIPPING_TIMES`, `Q_CUSTOM_CLEARANCE`, `Q_INSURANCE_INCLUDED`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Air cargo service](../templates/air_freight.md) | Freight mode and load service; Supported origin, destination and legs; Cargo classes, restrictions and handling; Chargeable weight, volume or container basis; Transit estimate, clearance and charge inclusions; Quote validity and carrier confirmation; Goods, piece count and declared value; Dimensions, mass and unit per piece; Collection, delivery and required dates; Applicable carrier/customs document references; Actual load, container or vehicle service type; Per-piece and service load limits; Rate validity, included legs and carrier calculation reference | Card highlights: Supported origin, destination and legs, Chargeable weight, volume or container basis; Selected price and itemized charges: Chargeable weight, volume or container basis, Transit estimate, clearance and charge inclusions, How the price is calculated, Published price or quote status, Included and additional charges, Rate validity, included legs and carrier calculation reference; Delivery, pickup, visit or access information: Applicable branches or channels, Supported origin, destination and legs; Applicable terms before commitment: Cargo classes, restrictions and handling, Transit estimate, clearance and charge inclusions, Quote validity and carrier confirmation, Included and additional charges, Per-piece and service load limits, Rate validity, included legs and carrier calculation reference; Private customer order, booking or enquiry input: Goods, piece count and declared value, Dimensions, mass and unit per piece, Collection, delivery and required dates, Applicable carrier/customs document references |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Road Freight & Trucking

Existing identity: `road_freight`. Effective profile: `MP_road_freight`.

Truck/load type, route, pieces/dimensions/weight, loading/access and included legs determine the actual accepted freight service.

Existing onboarding context: `Q_SHIPPING_WAYS`, `Q_PRICE_PER_CONTAINER`, `Q_PRICE_PER_CBM`, `Q_PRICE_PER_KG`, `Q_PORT_TO_WAREHOUSE_TRANSPORT`, `Q_WAREHOUSE_TO_CLIENT_TRANSPORT`, `Q_SHIPPING_TIMES`, `Q_FLEET_SIZE`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Road freight or truck-load service](../templates/road_freight.md) | Freight mode and load service; Supported origin, destination and legs; Cargo classes, restrictions and handling; Chargeable weight, volume or container basis; Transit estimate, clearance and charge inclusions; Quote validity and carrier confirmation; Goods, piece count and declared value; Dimensions, mass and unit per piece; Collection, delivery and required dates; Applicable carrier/customs document references; Actual load, container or vehicle service type; Per-piece and service load limits; Rate validity, included legs and carrier calculation reference | Card highlights: Supported origin, destination and legs, Chargeable weight, volume or container basis; Selected price and itemized charges: Chargeable weight, volume or container basis, Transit estimate, clearance and charge inclusions, How the price is calculated, Published price or quote status, Included and additional charges, Rate validity, included legs and carrier calculation reference; Delivery, pickup, visit or access information: Applicable branches or channels, Supported origin, destination and legs; Applicable terms before commitment: Cargo classes, restrictions and handling, Transit estimate, clearance and charge inclusions, Quote validity and carrier confirmation, Included and additional charges, Per-piece and service load limits, Rate validity, included legs and carrier calculation reference; Private customer order, booking or enquiry input: Goods, piece count and declared value, Dimensions, mass and unit per piece, Collection, delivery and required dates, Applicable carrier/customs document references |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Warehousing & Storage

Existing identity: `warehousing`. Effective profile: `MP_warehousing`.

Storage unit dimensions/capacity, environment, accepted goods, period, handling and custody/access rules differ from available capacity and stock ownership.

Existing onboarding context: `Q_PRICE_PER_SQM`, `Q_PRICE_PER_SQFT`, `Q_WAREHOUSE_CAPACITY_SQFT`, `Q_INSURANCE_INCLUDED`, `Q_OPERATING_HOURS_TEXT`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Warehouse storage and handling service](../templates/storage.md) | Storage type, dimensions and capacity unit; Accepted goods and environment; Occupancy, billing and access rules; Receiving, picking, dispatch and cover scope; Actual compatible unit/capacity source; Goods, piece count and declared value; Dimensions, mass and unit per piece; Collection, delivery and required dates; Applicable carrier/customs document references; Actual storage conditions and controls; Customer access, receiving and release process | Card highlights: Storage type, dimensions and capacity unit, Occupancy, billing and access rules; Selected price and itemized charges: Occupancy, billing and access rules, Receiving, picking, dispatch and cover scope, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Customer access, receiving and release process; Supported date, time, duration and capacity selection: Actual compatible unit/capacity source; Applicable terms before commitment: Accepted goods and environment, Occupancy, billing and access rules, Receiving, picking, dispatch and cover scope, Included and additional charges, Actual storage conditions and controls, Customer access, receiving and release process; Private customer order, booking or enquiry input: Goods, piece count and declared value, Dimensions, mass and unit per piece, Collection, delivery and required dates, Applicable carrier/customs document references, Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.
