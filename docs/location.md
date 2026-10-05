# The delivery location layer

Written for: an engineer touching anything that reads or sets where an order is going.

Almost everything a visitor sees depends on one fact: where the order is going. Which merchants are in reach, what delivery costs, how long it takes, whether charge-to-room is available, whether we deliver there at all. Until that fact exists the site is guessing — and a guess rendered confidently is how somebody gets quoted a price we cannot honour.

---

## The one rule

**`navigator.geolocation` is called only inside the click handler of "Use my current location".** Never on load, never on a route change, never on scroll, never on a timer, never because a modal opened.

This is not a privacy nicety. Chrome degrades and then auto-blocks sites that prompt without a user gesture, and a Block is close to permanent — most people never find the padlock menu. **Prompting badly once costs the ability to prompt at all, for every visitor, afterwards.**

It is enforced three ways, because a code review cannot keep it true — the natural thing to write when a page needs a location is to ask for one:

1. `packages/location/src/geolocation.ts` is the only module that touches the API.
2. An ESLint rule (`no-restricted-properties`) fails the build on `navigator.geolocation` anywhere in `apps/web`, and anywhere in `packages/location` except that one file.
3. `apps/web/tests/location-consent.spec.ts` loads every public route with a spy installed before any script runs, and fails if anything touched the API without a click. It also asserts nothing ever starts a `watchPosition` — a watch is a location history, and choosing a delivery address does not need one.

A corollary that is easy to miss: **even when permission was already granted, nothing is read on load.** A returning visitor is placed from their saved pin and offered the button. Re-reading GPS because permission exists is tracking, whatever it is called.

---

## What *is* automatic

The resolution ladder runs on every load with no prompt and no interaction. First match wins, and **the step that answered travels with the place**, because "we worked this out from your connection" and "you dropped this pin" are different promises.

| # | Step | Where it resolves | Chip |
|---|---|---|---|
| 1 | QR scan token (unit or room) | route handler | `qr` / `room` |
| 2 | Deep link (`?lat&lng`, address, Plus Code) | route handler | `set` |
| 3 | Signed-in guest's last place, within 30 days | `rpc_resolve_location` | `set` |
| 4 | This device's last confirmed pin (90 days) | browser storage | `set` |
| 5 | Nothing known → the sheet, once per visit | browser | `empty` |
| 6 | IP city, from the edge headers | `cityFromConnection()` | `city` |

Step 6 is deliberately the weakest. It is a city, not a place; it is labelled "from your connection" everywhere it appears; and **no price is ever locked against it** — checkout asks again.

---

## The four honest states

Each is one banner under the nav and one chip variant. **No state blocks the page and no state re-prompts the browser.**

| State | Chip | Banner |
|---|---|---|
| Skipped → IP city | `Nairobi · from your connection` | city-wide estimates, we ask again at checkout |
| Blocked in the browser | `Choose a delivery location` | shown once, padlock hint, search stays the control |
| Confirmed pin, outside coverage | `[Estate], Syokimau · Outside coverage` | nearest covered zone with the **real** distance, waitlist |
| City not launched | `Kampala · Not live yet` | readable pages, ordering closed, waitlist |

The status dot mirrors precision, not coverage: gold = nothing set, gold = city only, green = a confirmed pin. A visitor can tell at a glance whether the prices in front of them are real.

---

## Accuracy

The confirm view always draws the accuracy circle and states its radius. Above **100 m** the pin cannot be confirmed as-is — it has to be moved or explicitly acknowledged. A laptop fix is routinely several hundred metres wide; a visitor who can see that moves the pin, one shown a confident marker does not.

Nudge buttons exist alongside dragging because a drag-only control is unusable without a mouse, and this is on the path to paying for something.

---

## Where data lives, and why

**An anonymous visitor's saved places are not in the database.** The spec gives `guest_place` a nullable `device_id`, but a device id is not authentication — it is a string the client sends, which anyone can send. A row holding a gate code, a floor and a phone number, readable by whoever claims the right id, is a directory of how to get into people's homes.

So: signed-in guests' places are rows under RLS; an anonymous visitor's places stay in their own browser, which is what the spec's own "encrypted local storage" step describes. `device_id` is kept as provenance and is never an access key. On sign-in the browser hands its local places over.

`anon` is **revoked** from `guest_place` and `location_consent_event` rather than left to RLS. RLS would return an empty set, and an empty set is indistinguishable from "this guest has saved nothing" — so a policy that silently stopped matching would read as a quiet month rather than as a breach. A refusal cannot be mistaken for an answer.

`location_consent_event` holds **no coordinates**, by schema and by test. It answers how often we ask and how people respond. A table that could answer that *and* locate a person is a table that will eventually be asked to.

---

## Contracts

```sql
rpc_resolve_location(context jsonb)  -- the ladder, as far as SQL can see it
rpc_coverage_lookup(lat, lng)        -- covered | outside | unlaunched | unknown
rpc_place_confirm(payload jsonb)     -- saves for a guest; echoes for anonymous
rpc_place_list() / rpc_place_delete(id)
rpc_location_event(session, surface, action, band, step)
fn_geo_cell(lat, lng, precision)     -- cache key; plain rounding, NOT H3
```

`fn_geo_cell` is named for what it is. The platform spec says H3 throughout and this is not H3 — there is no h3 extension here and adding one to key a geocode cache would be a large dependency for a small job. When H3 arrives for the dispatch supply index, this stays: the two solve different problems.

---

## Known gaps

- **Address search needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.** Without it, `/api/location/search` returns only merchant branches NexG already knows about, plus the reason. It deliberately does **not** fall back to plausible invented addresses — somebody would order to one.
- **The confirm view draws a schematic, not a map,** for the same reason the rest of the console does: an illustrative map reads as the real city. It becomes a real map when the key is set.
- **Reverse geocoding is not wired.** `geocode_cache` and the cell function exist; the lookup that fills them does not, so the confirm view shows the zone and coordinates rather than a street address.
- **Explore does not yet re-query on change.** The chip updates everywhere and the cart/fee re-validation hooks are specified, but Explore still renders from its own city parameter. That is the next piece.
