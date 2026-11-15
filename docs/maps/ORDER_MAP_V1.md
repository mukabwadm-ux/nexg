# Customer order map v1

The signed-in app calls `POST /rest/v1/rpc/rpc_my_order_map` with `{"p_order_id":"<order UUID>"}` when a customer opens the map for an order. Supply the current Supabase bearer token and the project's public API key. The RPC is a read of fixed order locations.

## Account and order scope

The RPC requires a non-anonymous Auth user. It derives the account from `auth.uid()` and joins the order's guest directly to that account with `guest.user_id` and `guest.anonymised_at is null`. Signed-out callers lack execute permission. Missing auth subjects and anonymous Auth users receive SQLSTATE `42501`. Absent orders, orders owned by other accounts and orders without a direct eligible ownership link return the same SQLSTATE `P0002` and message `Order map not found.`

## Result

```ts
type OrderMapStage =
  | "placed" | "confirmed" | "preparing" | "ready" | "picked_up" | "arriving"
  | "delivered" | "cancelled" | "disputed" | "refunded";
type OrderMapPlace = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  role: "pickup" | "dropoff";
};
type OrderMapV1 = {
  contractVersion: "1";
  accountId: string;
  record: { kind: "order"; id: string };
  stage: OrderMapStage;
  courier: null;
} & (
  | { status: "locations-only"; places: OrderMapPlace[] }
  | { status: "unavailable"; places: []; reason: "completed" | "locations-missing" }
);
```

An active order returns one or two valid fixed locations in pickup-then-dropoff order. Pickup uses the single current dispatch job's pickup snapshot when it belongs to the order and city, has a nonterminal state and no end time, and contains a valid point. When that snapshot is absent or invalid, pickup uses the order's identified branch if it belongs to the order's merchant and has both coordinates. A branch explicitly linked to another merchant invalidates the pickup, including a dispatch snapshot derived from that branch. Dropoff uses the order's own stored dropoff point. Coordinates remain valid at zero. Pin IDs are `order:<order UUID>:pickup` and `order:<order UUID>:dropoff`.

Delivered, cancelled, disputed, and refunded orders return `unavailable` with `reason: "completed"`. An active order with no valid fixed point returns `reason: "locations-missing"`. The response uses generic pickup and delivery titles so it does not expose address labels or delivery notes.

## Courier boundary

This version returns `courier: null`. The existing rider position is keyed to the rider globally, and a rider can be assigned stacked orders. Staff access to raw positions goes through the audited live-operations path. A customer courier feature requires an authoritative order-scoped position stream, a freshness window, and an approved customer visibility rule. The fixed-location RPC includes no rider identity, courier timestamp, ETA, or computed route.

## Release and verification

Apply `20261212000200_my_order_map.sql` before enabling the connected app build. It adds a read-only RPC with authenticated execute permission and relies on the existing order, guest, branch, dispatch and anonymous-account schema. It does not add polling or a realtime subscription.

Run `supabase/tests/73_my_order_map.sql` in the migrated isolated database. The test covers ownership, anonymous sessions, equivalent absent and foreign errors, terminal orders, partially available locations, branch mismatches, and absence of rider and address details. The database and device checks remain separate from source verification.
