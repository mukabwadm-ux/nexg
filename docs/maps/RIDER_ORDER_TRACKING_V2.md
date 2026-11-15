# Foreground courier sharing

The rider starts sharing for one current assignment. The app starts location capture only through an explicit foreground action with device permission. Backgrounding, signing out, changing assignments, or choosing Stop ends capture and sends the stop request. The server collects points through rider submissions only.

## Assignment read

Call `POST /rest/v1/rpc/rpc_my_rider_map_assignments` with an empty JSON object and the rider's existing signed-in Supabase bearer and public API key.

The response contains `contractVersion: "1"`, the verified `accountId`, and `assignments: [{ orderId, assignmentId, assignedAt, stage, canShare }]`. Each assignment requires agreement between the order's rider and the current assigned dispatch job in the same city. The account must be non-anonymous and linked to an active rider. The listed stages are placed, confirmed, preparing, ready, picked_up and arriving. Sharing requires picked_up or arriving, a current non-anonymous customer and a single unambiguous active order for the rider. Another active order or job for that rider suppresses sharing, including when only one assignment link has been written.

`assignmentId` is the dispatch job ID. `assignedAt` identifies the assignment generation when a job is reused. Forward its exact text when starting the share to keep its database timestamp precision.

## Start, publish and stop

All calls use the same signed-in rider bearer.

| POST RPC | Parameters | Success |
| --- | --- | --- |
| `rpc_rider_map_share_start` | `p_order_id`, `p_assignment_id`, `p_assigned_at` | `{contractVersion:"1",shareId,leaseExpiresAt}` |
| `rpc_rider_map_share_publish` | `p_share_id`, `p_sequence`, `p_observed_at`, `p_latitude`, `p_longitude` | `{contractVersion:"1",shareId,sequence,observedAt,expiresAt,leaseExpiresAt}` |
| `rpc_rider_map_share_stop` | `p_share_id` | `{contractVersion:"1",ok:true}` |

A start replaces the rider's previous share and grants a 60-second lease. Publish checks the current assignment and receiver again, accepts an increasing positive integer sequence and strictly increasing capture time, and renews the lease for 60 seconds. Capture time must fall within the past 30 seconds through server receipt. Latitude and longitude preserve the submitted point if finite and in range. A fix expires 30 seconds after capture. Once a fix or lease expires, publishing requires a new foreground sharing action.

SQLSTATE `42501` denies a caller without an active rider account. `P0002` covers an unavailable assignment or a missing, foreign, revoked, or expired share. `22023` covers an invalid, stale, future, or out-of-order sample. Stop is idempotent for the authenticated rider and gives the same acknowledgement for an absent or foreign share.

## Customer map v2

Continue using `POST /rest/v1/rpc/rpc_my_order_map` with `p_order_id` and explicitly add `p_contract_version: "2"` to opt in. A call containing only `p_order_id` keeps the existing [fixed-location v1 contract](./ORDER_MAP_V1.md).

The V2 response uses the same verified account, order record, stage and fixed places. It sets `contractVersion: "2"`. When a source pose is current, it returns `status: "live"` and `courier: { latitude, longitude, observedAt, expiresAt, vehicle }`. Vehicle is one of motorbike, bicycle, car, tuktuk or unknown. An eligible live courier can appear before either fixed point is published. When no pose can be shown, V2 retains the same fixed-location status and reason as V1, with `courier: null`. Missing and foreign order IDs still return the same error. V2 exposes no rider identity, assignment identity, share identity, historical fixes, route or ETA.

The customer explicitly refreshes this read. The app removes the entire courier marker at `courier.expiresAt`. Revocation makes the pose unavailable on the next read. A client holding an earlier response can display its pose only until that response's hard deadline.

## Storage and revocation

One private row per rider holds the current lease and latest accepted point. Assignment changes, a competing order or job, a rewind out of the sharing window, a changed order guest, and a changed or disabled rider link revoke sharing. Publish and revoke serialize through the same per-rider transaction lock. Customer reads recheck current source ownership, assignment, rider account and expiry. The scheduled database cleanup deletes expired rows even if the device disappears before sending Stop.

Deploy migration `20261220000400_maps_rider_sharing.sql` after the three Maps backend migrations. Run `supabase/tests/78_maps_rider_sharing.sql` against the migrated test database. It covers account ownership, assignment identity, timing, order and actor revocation, stacking and legacy response compatibility. Device and hosted verification are separate release checks.
