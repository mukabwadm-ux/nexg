# Migrations on `main` not yet in production (23 November 2026)

For the owner and langs4u to agree and apply together. Nothing here has been applied; this note only lists what is waiting, why it matters, and a safe way to apply it.

**Status:** production (NexgApp) is missing 22 migrations that are on `main`, all from langs4u's work between 21 and 23 Nov. Production already has migrations numbered after them (`20270216000100` basket, `20270220000100` every unit in a property, `20270221000100` order steps, `20270222100100` make super admin, `20270223000100` shop decline). So these are applied out of version order.

Checked against production read-only on 23 Nov 2026, and against `main` at `f48d4f68`.

## Why it matters

The website code for several of these is already live, so these features fail in production until the SQL is in:

- **Checkout:** pickup and scheduled orders (`order.fulfilment`, `scheduled_for`) and order together, from `20270130009000`.
- **Menus:** sold-out labels (`catalogue_item.sold_out`, `20270129000100`), item details and messages (`20270130000100`, `0200`), and a shop's minimum order (`0300`).
- **Work page:** sending a digital order's codes (`20270130000400`, `0500`, `9200`).
- **The apps:** "has it been paid?" (`GET /api/customer/checkout/orders/{id}/payment`) needs `rpc_order_payment_state` from `20270129000200`. Paying by M-Pesa through Safaricom already works without it.
- **Explore:** guest road times, bulk opening hours and NexG-only ratings (`20270130009400`, `9500`, `9600`).
- **Merchants:** exact branch pins, and going live only with the main location pinned and hours set (`20270203009700`).

The seven Paystack migrations add tables and functions but take no money until the Paystack keys are set. They stay in test mode until `NEXG_PAYSTACK_LIVE=1`.

## The 22, in the order to apply them

| Version | Name | What it adds | Bytes | md5 |
| --- | --- | --- | --- | --- |
| `20270128000600` | app_email_templates | The Consumer app's email designs (generated) | 679,560 | `78d2d7c01f664bee21f009d4f8bb196e` |
| `20270128000700` | app_email_templates | The same, second sync (generated) | 682,456 | `de935e3717c7a75ac91ae0fb83d79c18` |
| `20270129000100` | sold_out_items | An item can show as sold out (R31) | 16,986 | `2b0b12c71f98d0e121c61636126b5c6a` |
| `20270129000200` | paystack_collections | Orders paid by card, M-Pesa or Airtel through Paystack (slice 1) | 34,942 | `5fceddfe92da202903320abb10d60a0a` |
| `20270130000100` | catalogue_details | How an item is priced, how long it takes, who it is for, its offer (R32, R35) | 24,355 | `5d4e52ddd292973e2e54ea148042cac6` |
| `20270130000200` | signup_choices_and_messages | Sign-up answers become real choices; an item can carry a message (R33) | 32,036 | `a2a4abe16feaae9b55e1a6da60c4a255` |
| `20270130000300` | min_order_and_public_answers | Minimum order; public sign-up answers on the shop page (R34, R36) | 27,788 | `d46538290e69d000db4ab2deb51dbfe5` |
| `20270130000400` | digital_delivery | Digital orders delivered as a code, e.g. eSIMs (R37) | 35,756 | `28419423a7a011a21c368113fd28f327` |
| `20270130000500` | buyer_id | An eSIM sale takes the buyer's ID (R37) | 32,773 | `6b8184a25641d0a6b05270f666a7cc6f` |
| `20270130009000` | order_together | Group orders; pickup and scheduled web orders | 88,299 | `a16584d89a31db89acfe801ff6aa865f` |
| `20270130009200` | digital_orders_for_shops | The Work page sends a digital order's code (R38) | 2,508 | `214dd57384d2b8cf89173cfa4ed2c40f` |
| `20270130009300` | editor_booking_link | The offerings editor links an item to its booking (R38) | 17,885 | `0e728129c85ba407e0c7c488b8d55b55` |
| `20270130009400` | guest_road_times | Guests route one complete Explore plan (R42) | 5,631 | `adafea0a7804e66ba5e5f2bc55851380` |
| `20270130009500` | bulk_opening_hours | Opening hours for many shops on a date (R39) | 3,000 | `6944bdb54ffa55fa7c4c2c188577a3bf` |
| `20270130009600` | nexg_ratings | Shops' stars from NexG customers only (R41) | 3,354 | `7334b43c43c68e560c1fa607d9439ed6` |
| `20270203009700` | precise_branch_locations | Exact branch pins; live only when pinned and with hours | 25,640 | `b5a6803d783732cffad30dc5163694bc` |
| `20270215000100` | paystack_saved_cards | "Save this card" (Paystack) | 21,818 | `bbeb26d8f603aaf14cf4fde50942bc51` |
| `20270222000100` | paystack_bookings | Booking-engine bookings and deposits through Paystack | 24,309 | `e7b61f81ab7eab0c5dde772acd4db0d0` |
| `20270222000200` | paystack_stays | Stays paid in full at booking (Paystack) | 13,665 | `625ad1b307003fce42ffdaf1f8827344` |
| `20270222000300` | stay_cancellation_policies | Each host's cancellation policy | 21,130 | `2bf541aed7be87bd6aafee8d0f7e7b95` |
| `20270222000400` | paystack_refunds | Refunds back through Paystack | 16,551 | `d7788f4cb8e96bda2aee7d4746c388a4` |
| `20270222000500` | paystack_review | Apple's reviewer pays in test mode on the live backend | 4,857 | `f6e64390c8fb352b50fc45b2e1b2a58d` |

The md5 is of each file as it is on `main` (LF line endings).

## What was checked (23 Nov, read-only)

- **No collisions with newer migrations already in production.** No function, view or trigger defined in these 22 is also defined by a migration production already has with a later number. Applying them now does not overwrite anything newer (basket, order steps, shop decline, make super admin, every unit in a property).
- **Compatible with the order-stage guard** (`20270221000100`). The only direct stage change in these 22 is digital delivery's "send the codes", which moves an order to `delivered`. The rule table already allows that move (`merchant`/`send_codes`).
- **Tests:** on a local database with every migration on `main` up to `20270223000100` (except `20270222100100`, applied incrementally rather than rebuilt from zero), the full pgTAP suite passed: 176 files, 3,659 tests. CI's database job rebuilds from zero on every push to `main`.

## How to apply

Apply from an up-to-date `main`, oldest first, one at a time. After each, check that the history row is there before going on.

- **With the CLI:**
  1. Dry run first: `supabase db push --dry-run --include-all`.
  2. Then apply: `supabase db push --include-all`.

  `--include-all` is needed because production already has later versions. The dry run should list exactly these 22 and nothing else.
- **By hand**, in the SQL editor: run each file, then record it:
  ```sql
  insert into supabase_migrations.schema_migrations (version, name) values ('<version>', '<name>');
  ```
  The two email-template files are about 680 KB each, too big to paste comfortably. Use the CLI or `psql` for those two.

Afterwards, check:

- `select count(*) from public.fn_wiring_check()` is 0.
- Each function the files define matches the file, ignoring CR line endings.
- PostgREST reloads its schema (`notify pgrst, 'reload schema'`).

## For langs4u

- Confirm all 22 are meant for production now, or say which to hold back.
- Say whether any needs a Vault secret or setting at the same time. The Paystack ones name `paystack_test_secret_key`, `payments_worker_url` and the webhook URL; slice 1's PR (#178) has the list.
