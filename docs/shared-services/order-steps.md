# Order steps: who moves an order (shared services D5)

For the Consumer app, the merchant tools, the Rider app and the website. Migration: `supabase/migrations/20270221000100_order_steps.sql`. Tests: `supabase/tests/141_order_steps.sql`.

## The stages

`placed` → `preparing` → `ready` → `picked_up` → `arriving` → `delivered`, plus `cancelled` and `refunded`. A pickup order goes from `ready` straight to `delivered` when the shop enters the customer's code. A digital order goes to `delivered` when the shop has sent its codes. `confirmed` and `disputed` exist but nothing writes them today.

Paying confirms an order (owner, 18 Nov 2026). There is no separate "accept" step: the shop's first step is to start preparing a paid order.

## Who does what

The full list is the table `public.order_step_rule`, readable by anyone. In short:

| Who | Step | From | To | Function |
| --- | --- | --- | --- | --- |
| Customer | `cancel` | placed, nothing paid | cancelled | `rpc_order_cancel_mine(p_order_id, p_reason)` |
| Shop | `start` | placed (paid, if paid online) | preparing | `rpc_merchant_order_step(p_order_id, 'start')` |
| Shop | `ready` | preparing | ready | `rpc_merchant_order_step(p_order_id, 'ready')`; a delivery's rider search starts by itself |
| Shop | `rider_code` | ready (delivery) | picked_up | `rpc_merchant_handover_code_enter(p_order_id, p_code)` |
| Shop | `customer_code` | ready (pickup) | delivered | `rpc_merchant_handover_code_enter(p_order_id, p_code)` |
| Shop | `send_codes` | placed to ready (digital, paid) | delivered | `rpc_merchant_order_send_codes` |
| Rider | `at_pickup` | before picked_up | (no change) | `rpc_rider_order_step(p_order_id, 'at_pickup')` |
| Rider | `picked_up` | ready | picked_up | `rpc_rider_order_step(p_order_id, 'picked_up')` |
| Rider | `arriving` | picked_up | arriving | `rpc_rider_order_step(p_order_id, 'arriving')` |
| Rider | `delivered` | picked_up, arriving | delivered | `rpc_rider_order_step(p_order_id, 'delivered', p_handed_to, p_code, p_photo_path)`, with the customer's code or a photo |
| Rider | `cash_collected` | picked_up to delivered (cash orders) | (no change) | `rpc_rider_cash_collected(p_order_id, p_amount_cents)` |
| Staff | `mark_delivered`, `cancel`, `disposal`, `refund` | see the table | | console only |

After a customer has paid, they can't cancel. They report a problem (`rpc_my_support_ticket_create`, topic `order_problem`), and support refunds them.

**The database refuses any other move.** A change of `order.stage` that no row in the table allows fails with `22023`, hint `stage_move_not_allowed`. A new kind of step needs a new row first.

## Which buttons to show: `rpc_order_next_steps`

Every app asks the database, so they all show the same buttons:

```ts
const { data } = await supabase.rpc('rpc_order_next_steps', { p_order_id: orderId });
```

It needs a signed-in session, including a guest's anonymous one. It answers for the caller only:

```json
{
  "order_id": "…",
  "stage": "placed",
  "fulfilment": "delivery",
  "payment_status": "pending",
  "you": ["merchant"],
  "steps": [
    {
      "actor": "merchant",
      "step": "start",
      "to_stage": "preparing",
      "call": "rpc_merchant_order_step",
      "args": { "p_order_id": "…", "p_step": "start" },
      "needs": "An order paid online is started only once it is paid.",
      "waiting_for": "payment"
    }
  ]
}
```

- **`you`** is who the caller is for this order: `customer`, `merchant` (the shop's team), `rider` (the assigned rider) and/or `staff` (live operations for the order's city).
- **`steps`** are the steps the caller can take from the current stage. Show one button per step.
- **`waiting_for`** is null when the step can be taken now. Otherwise it says what the step waits for:
  - `payment`: the order is paid online and not paid yet;
  - `rider`: no rider is assigned yet.

  Show these buttons as disabled, with that reason.
- **`call` and `args`** name the function and its arguments. Arguments set to `null` are for the app to fill in, such as a code, a reason or an amount.
- **Errors:** someone who isn't one of these people gets `P0002`, "Order not found." With only the anon key, the call is refused with `42501`.

Ask again after each step, and when the order changes. The customer's app already follows changes through `order_event` and push.
