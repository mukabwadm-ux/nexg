# Basket: one per account (shared services D4)

For the Consumer app, the Stays app and anything else that sells from a shop's catalogue. The website uses the same functions (`apps/web/components/cart/cart-provider.tsx`).

Migration: `supabase/migrations/20270216000100_account_basket.sql`. Tests: `supabase/tests/140_account_basket.sql`.

## The rules

- **One basket per sign-in, from one shop.** Writing lines from another shop replaces the basket.
- **Guests too.** A guest's temporary (anonymous) Supabase session has a basket like any account. If the guest later makes the sign-in permanent (link an email, phone, Google or Apple), the user id stays the same and so does the basket.
- **Signing in merges.** When someone who built a basket while signed out signs in to an existing account, send that basket to `rpc_basket_merge`. Same shop: lines are added together. Another shop: the signed-out basket replaces the account's, because it is what the person was just doing.
- **Placing an order empties it.** When `rpc_order_place_web` places an order from the basket's shop, the database empties the caller's basket. You don't need to clear it yourself, but clearing it is harmless.
- **Signing out:** the basket stays on the account. Drop your device copy, so the next person on the device doesn't see it.
- **Kept per line:** `catalogue_item_id`, `quantity` (1 to 50), and optionally `variant_id`, `options`, `note` and `message`. At most 60 lines.
- **Dropped without an error:** lines from another shop, lines for something booked rather than bought (`catalogue_item.kind` other than `buy`), lines with a bad id, and lines with a quantity under 1. Quantities over 50 become 50. Your screen should show the basket the function returns, not the one you sent.
- **Not checked here:** choices, stock, prices, opening hours. `rpc_order_quote_web` checks those at checkout, as before.

## Functions

All are Supabase RPCs for the `authenticated` role: a signed-in session, including a guest's anonymous one. With only the anon key, they answer `42501`. With no session, they raise `P0001` with hint `basket_needs_session`.

| Function | Arguments | Does |
| --- | --- | --- |
| `rpc_basket_get` | none | Reads the basket. |
| `rpc_basket_put` | `p_merchant_id uuid`, `p_lines jsonb` | Replaces the basket. A null shop or no lines left empties it. |
| `rpc_basket_merge` | `p_merchant_id uuid`, `p_lines jsonb` | Adds a signed-out basket at sign-in. The answer also has `outcome`: `added`, `replaced` or `kept` (nothing usable came in). |
| `rpc_basket_clear` | none | Empties the basket. |

Errors: more than 60 lines raises `P0001` with hint `basket_too_long`; lines that are not a JSON array raise hint `basket_not_a_list`.

Every function answers with the basket:

```json
{
  "merchant": { "id": "…", "name": "Mama Oliech" },
  "updated_at": "2026-11-22T18:04:11.52+00:00",
  "lines": [
    {
      "line_id": "…",
      "catalogue_item_id": "…",
      "quantity": 2,
      "note": "no onions",
      "name": "Pilau",
      "price_kes": 500,
      "photo_path": "…",
      "available": true
    }
  ]
}
```

An empty basket is `{"merchant": null, "updated_at": null, "lines": []}`.

- **`price_kes`** is the menu price in whole shillings, for display. Checkout prices the order again.
- **`available`** is false when the shop has taken the item off sale or marked it sold out. Show it, and let the customer remove it. Checkout will refuse it.
- **`variant_id`, `options`, `note` and `message`** appear only when set.

## Checkout

The lines are already in the shape `rpc_order_quote_web` and `rpc_order_place_web` take for `p_payload.items`. Send them as they come back; the extra display keys are ignored:

```ts
const { data: basket } = await supabase.rpc('rpc_basket_get');
await supabase.rpc('rpc_order_quote_web', {
  p_payload: { merchant_id: basket.merchant.id, items: basket.lines, payment_method: 'mpesa_stk' /* … */ },
});
```

## Suggested app flow

1. **App start, signed in or guest:** `rpc_basket_get`, and show what it returns.
2. **Every change:** update the screen at once, then `rpc_basket_put` with the whole basket, debounced by about half a second. Show what the answer returns.
3. **Signed out, with no session:** keep the basket on the device only.
4. **At sign-in:** if the device has a basket, `rpc_basket_merge` with it, then drop the device copy. Otherwise `rpc_basket_get`.
5. **At sign-out:** drop the device copy.
6. **When the app returns to the foreground:** `rpc_basket_get` again, since the website may have changed the basket.

Group orders ("Order together", `20270130009000`) keep their own shared basket in `group_order_item`. They are separate from this one.
