# Flights and cinema backend

The Flights merchant category uses the existing catalogue and booking APIs. The
four specialties are `helicopter_charters`, `scenic_flights`, `safari_flights`,
and `private_charters`. Operators publish their own offerings. Use capacity
resources and departure slots for scheduled flights. Configure charters as
quote requests so the operator can review the route, passenger count, baggage,
and proposed departure before confirming.

## Cinema programme and seats

Register each cinema merchant under Experiences with the `cinemas` specialty.
A trusted operator integration calls `rpc_cinema_publish_showing` with a
merchant ID, a film, a screen, a showing, and the rows for a new screen. Use
stable UUIDs. A film ID is shared across all cinemas showing that title.

- Film fields use the database names `id`, `title`, `classification`,
  `languages`, `genres`, `runtime_minutes`, `release_date`, `synopsis`,
  `poster_url`, `preview_video_url`, `preview_poster_url` and `trailer_url`.
  Only ID and title are required.
- The screen has `id` and `name`. A seat row has `position`, `label` and
  `seats`. Each seat has `code`, `column_position`, `number` and `seat_type`
  (`standard`, `vip`, or `wheelchair`). Skip a column for an aisle.
- The showing has `id`, `starts_at`, `ends_at`, `format`, optional `language`,
  and optional KES minor-unit prices `standard_minor`, `vip_minor`, and
  `wheelchair_minor`. Use `status: "on_sale"` to publish it. Close or cancel
  sales by republishing that showing with `closed` or `cancelled`.
- Public reads use `rpc_cinema_programme` (up to seven Nairobi days) and
  `rpc_cinema_seat_map`. Discovery can read these with
  `VITE_CINEMA_SOURCE=supabase` after the migrations and operator setup.

A signed-in customer can hold one to ten seats using `rpc_cinema_hold_seats`.
Send the showing ID, seat codes, reviewed total in KES minor units, and a new
UUID request ID. Reuse that ID for retries of the same selection. The hold
expires in five minutes or at the sales cutoff, whichever comes first.
`rpc_cinema_release_hold` releases the customer's own hold. The trusted cinema
integration calls `rpc_cinema_confirm_hold` with its confirmation reference
after accepting the sale. Confirmation records the cinema's decision.

The operator must keep the showings and seat inventory authoritative when using
these RPCs. External cinema feeds, collection of payment and ticket delivery
require their respective integrations. Web and native booking flows can call
the hold APIs when their signed-in checkout is connected.
