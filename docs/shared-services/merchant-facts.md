# Merchant facts for the apps (R8) and shops on Explore stops (R9)

For the Consumer app and Discovery. Migrations: `supabase/migrations/20270227000100_merchant_facts_for_apps.sql` (R8) and `20270227000200_plan_block_merchant.sql` (R9). Tests: `supabase/tests/146_merchant_facts_for_apps.sql` and `147_plan_block_merchant.sql`.

These follow the plan's defaults, which the owner approved on 23 Nov 2026. If the app needs different traits or band limits, ask and they change in one place.

## Traits and popularity: `merchant_traits_public`

A public view: the publishable key can read it. It has one row per listed shop (live and shown on Explore):

| Column | Type | Meaning |
| --- | --- | --- |
| `merchant_id` | uuid | The shop, the same id as in `merchant_public` |
| `traits` | text[] | Short facts for a shop card (below). Empty when none apply. |
| `popularity_band` | smallint 0–3 | From paid orders in the last 30 days: 0 is under 5, 1 is 5–19, 2 is 20–59, 3 is 60 or more. No raw counts are shown. |

| Trait | When |
| --- | --- |
| `pay_on_delivery` | The shop takes payment on delivery |
| `open_late` | The shop has late-night hours |
| `own_riders` | The shop delivers with its own riders |
| `new` | Live for less than 30 days |
| `top_rated` | 4.5 stars or more from at least 10 NexG ratings |
| `vegetarian_options`, `vegan_options`, `halal_options` | At least one item on sale carries that label |
| `alcohol` | Licensed, with age-restricted items on sale |

```ts
const { data } = await supabase
  .from('merchant_traits_public')
  .select('merchant_id, traits, popularity_band')
  .in('merchant_id', ids);
```

Treat a trait the app doesn't know as one it can ignore: new ones may be added.

## The customer's recent categories: `rpc_my_recent_categories(p_limit)`

For a signed-in session, including a guest's temporary one. It returns the categories the caller has used in the last 180 days, most recent first. It counts:

- **orders**, under the shop's category;
- **bookings**, on the website or in the apps through the booking engine, under the shop's category;
- **stays**, under `stays`.

Cancelled ones don't count, and neither do forgotten app bookings.

```json
[
  { "category": "stays", "last_at": "2026-11-23T11:02:11Z", "count": 1, "orders": 0, "bookings": 0, "stays": 1, "last_ordered_at": null },
  { "category": "restaurant", "last_at": "2026-11-22T18:40:03Z", "count": 5, "orders": 5, "bookings": 0, "stays": 0, "last_ordered_at": "2026-11-22T18:40:03Z" }
]
```

- **`last_at` and `count`** cover everything in the category.
- **`orders`, `bookings` and `stays`** split the count by kind.
- **`last_ordered_at`** is the newest order's time, or `null` when the category has only bookings or stays.
- **`p_limit`:** defaults to 5, between 1 and 20.
- **Empty:** `[]` when the caller has none of these. The publishable key alone gets `42501`.

## A branch's Google place ID (staff and server only)

`merchant_branch_place` holds a branch's Google place ID, for matching branches to maps. Customers and shops can't read it. Staff who manage merchants in the branch's city can read it, and so can the server.

- **To set it:** `rpc_staff_branch_place_set(p_branch_id, p_place_id)`.
- **To clear it:** pass `null` or an empty string.
- Every change is audited as `merchant.branch_place_set`.
- There's no admin screen for it yet.

## Which shop an Explore stop is at (R9)

`plan_block.merchant_id` is the shop a plan's stop is at. It's optional.

- **The app sets it** when it saves a stop: the plan's owner can write its own draft plan's blocks.
- **A stop linked to an experience component** gets its merchant filled in from the component's partner.
- **`fn_plan_view(plan_id)`**, the plan read the website and apps use, now gives each block `merchant_id` and `merchant_name`, the shop's public name. Use them to open the shop's page.

```ts
await supabase.from('plan_block').insert({
  plan_id, slot: 'midday', kind: 'meal', title_snapshot: 'Lunch', merchant_id, sort: 1,
});
```

A `merchant_id` that doesn't exist is refused (`23503`). If the shop is deleted later, the stop keeps its title and loses the link.
