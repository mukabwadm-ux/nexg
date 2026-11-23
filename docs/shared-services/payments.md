# Payments: one way to pay, for every app (shared services D2 and D3)

For the Consumer app, the Stays app and the website. The website's checkout and pay page use exactly these two routes; there is no other way to start paying for an order.

Code: `apps/web/lib/payment-methods.ts` (the list) and `apps/web/lib/order-payment.ts` (the route). Base URL: `https://www.nexgapp.com`.

## What the owner decided

- **One payment route, on the website's server, for every client** (D2). It isn't an Edge Function.
- **One company Paystack account** for card, M-Pesa and Airtel Money (21 Nov 2026), plus bank transfer (D3). Paystack stays in test mode until the owner switches it live.
- **Cash on delivery** is not offered on customer orders (20 Nov 2026). Staff can still record cash orders they place themselves.
- **M-Pesa while Paystack isn't live:** it goes straight to Safaricom (Daraja), as the website did before, so M-Pesa keeps working. Once the owner switches Paystack live (`NEXG_PAYSTACK_LIVE=1` with the live key), M-Pesa moves to Paystack. Apps change nothing.

## 1. What can be paid with: `GET /api/customer/checkout/payment-methods`

No sign-in. It answers:

```json
{
  "methods": [
    { "method": "mpesa_stk", "provider": "daraja", "label": "M-Pesa" },
    { "method": "airtel_money", "provider": "paystack", "label": "Airtel Money", "test": true },
    { "method": "card", "provider": "paystack", "label": "Card", "test": true },
    { "method": "saved_card", "provider": "paystack", "label": "Saved card", "test": true },
    { "method": "bank_transfer", "provider": "bank", "label": "Bank" }
  ]
}
```

- **Show only the methods listed, in this order.** An empty list means paying isn't switched on: say so, and keep the order, because it stays saved.
- **`test: true`:** Paystack's test keys are in use. Only shops marked for test payments accept them; any other shop gets `PAYMENT_REFUSED`.
- **Production on 22 Nov 2026:** M-Pesa through Safaricom only.

## 2. Paying: `POST /api/customer/checkout/orders/{orderId}/payment`

**Sign-in:** send `Authorization: Bearer <Supabase access token>`, including a guest's anonymous session. The website sends its session cookie instead.

**Body, one of:**

```json
{ "method": "mpesa_stk", "phone": "0712 345 678" }
{ "method": "airtel_money", "phone": "+254733123456" }
{ "method": "card", "saveCard": true }
{ "method": "saved_card", "cardId": "…" }
{ "method": "bank_transfer" }
```

- **Phone:** a Kenyan mobile number in any common form: `07…`, `01…`, `2547…` or `+2547…`.
- **Amount:** always taken from the order in the database, never from the app.

**Answer (200):**

```json
{ "status": "pending", "reference": "NXP-…", "retryAfterSeconds": 60 }
{ "status": "pending", "reference": "NXP-…", "url": "https://…" }
{ "status": "paid", "reference": "NXP-…" }
```

- **`url`:** a page to open in an in-app browser. It is Paystack's checkout for a card, or the bank's page for a bank transfer. Coming back from it never counts as paid.
- **`retryAfterSeconds`:** how long before offering "send the prompt again".
- **Repeating a request is safe:** a tap twice, or a retry, reuses the open payment. A new M-Pesa prompt waits a minute after the last one.

**Refusals** are `application/problem+json` with `title` (show it to the customer), `code`, and `reference` when the payment already exists:

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | No session. Sign in, or continue as a guest. |
| 404 | `NOT_FOUND` | Not this caller's order. |
| 409 | `PAYMENT_REFUSED` | Already paid, cancelled, a test key on a real shop, or the provider declined. |
| 422 | `INVALID_REQUEST` | Unknown method or a bad phone number. |
| 429 | `PAYMENT_REFUSED` | A prompt was just sent. Wait `retryAfterSeconds`. |
| 503 | `PAYMENT_UNAVAILABLE` | That method isn't switched on. Offer another from the list. |
| 503 | `SERVICE_UNAVAILABLE` | Try again shortly. |

## 3. Has it been paid?

- **Only the provider marks an order paid**, through its signed callback or an answer the server fetched. Paystack is checked again at least every 10 seconds while a payment is pending.
- **Apps:** `GET /api/customer/checkout/orders/{orderId}/payment` answers `{status, reference?, url?, test?}` for Paystack payments. It needs the Paystack migration `20270129000200`, which wasn't in production on 22 Nov.
- **Every payment:** the order's own `payment_status`, and its `order_event` rows (`paid`), say when it's paid. The order steps follow from there (see `order-steps.md`).
- **Website:** shows `/pay/{reference}`.

## Bookings and stays

This page covers orders. Bookings are paid through the booking engine's bridge, and stays in the apps through `/api/customer/checkout/stays/holds/{operationId}/payment`. Both use Paystack and are documented with langs4u's Paystack work.

The website's own stay checkout still sends M-Pesa through `/api/payments/mpesa/stay`. Moving it onto the stays route is not done yet.
