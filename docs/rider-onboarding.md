# Rider onboarding

Five steps and a status page, at `/riders/apply/*` and `/riders/status`.
Written for whoever changes it next. It shares the shell, the chips, the
readiness ring, the document components and the resume mechanism with
[merchant onboarding](merchant-onboarding.md) — read that first; this page
only covers what differs.

## The shape of it

The vehicle decides the size of the application. A bicycle rider is asked for
three photos and never sees a question about insurance or a logbook; a rider
on a rented motorbike is asked for seven. Getting that right on step 2 is why
a bicycle rider does not abandon at the documents screen.

Everything else is the merchant pattern: a draft row from the first tap,
optimistic state debounced 400 ms to the server, flushed on `pagehide`, and
`rpc_rider_*` security-definer RPCs rather than PostgREST updates.

### The readiness ring

Six checks, computed by `fn_rider_readiness` so the rider and the console read
the same number. Two of them are stricter than they look, deliberately:

- **`documents`** counts every *required* photo, not only the essential ones.
  A rider waiting on a good conduct certificate sees five of six ticks and an
  honest 66%. They can still be activated — good conduct has a grace period —
  and the ring is not claiming they are finished.
- **`kit_onboarding`** is the kit actually handed over at the hub
  (`kit_issued_at`), not a slot being booked. Booking is a plan; the bag and
  the jacket are the thing.

What the ring does **not** contain is the M-Pesa name check. That was there at
first, and it was wrong: a rider who had done everything they could still saw
a tick missing, with nothing they could do to earn it, because the outstanding
work was ours. A progress bar should only hold things the person can act on.
The name check is a gate on activation instead, where the consequence is.

### What a rider may not set about themselves

`authenticated` holds table-wide UPDATE on `public.rider`, and the owner policy
restricts which *rows*, not which *columns* — so a rider could set
`kit_issued_at` and `payout_name_lookup`, two of the three things
`rpc_activate_rider` checks. `tg_rider_protected_columns` refuses those, plus
status, activation, verification timestamps, the resume token, the cash cap
and `employer_merchant_id`.

It tells writers apart by reading `current_user`, so it **must not be
`SECURITY DEFINER`** — that rewrites `current_user` to the function owner and
the guard passes for everyone, silently.
`supabase/tests/07_rls_rider_onboarding.sql` fails if someone does that.

### What stops an activation

`rpc_activate_rider` is the only path to `active`. It refuses:

1. a motorised rider with no plate;
2. any essential document not verified;
3. an M-Pesa line not confirmed as registered to the rider;
4. a rider who has not been handed a kit.

(3) and (4) are overridable with a written reason, which goes into the audit
trail with the staff member's name. That is deliberate rather than lax: there
is no name-lookup provider connected, so rider ops confirms the M-Pesa name
against the ID at the hub — and the override records that a person did, which
a silent skip would not. Paying a line in somebody else's name is how a rider
loses a week's earnings.

## How to add a vehicle type

Add the value to the `vehicle_type` enum, then add a tile to `VEHICLES` in
`components/rider-onboarding/types.ts` and an icon branch in `VehicleIcon`
(`step-ride.tsx`). lucide has no motorbike, so that one is drawn inline.

Then decide what it implies. Anything motorised should appear in the
`applies_when` of `driving_licence`, `logbook_or_plate` and `insurance`:

```sql
update public.document_requirement
set applies_when = jsonb_set(applies_when, '{vehicle}',
      (applies_when -> 'vehicle') || '"scooter"')
where owner_type = 'rider'
  and kind in ('driving_licence', 'logbook_or_plate', 'insurance');
```

## How to add a document rule

Rider `applies_when` takes two keys, and both must hold:

```json
{ "vehicle": ["motorbike", "car"], "answer": { "insurance": ["third_party"] } }
```

`vehicle` lists the vehicles it applies to. `answer` lists the **acceptable
values** for a rider column — `insurance`, `ownership` or `vehicle`. Note this
is the opposite direction from the merchant evaluator, where the condition is
a single expected value tested against a possibly-multi answer. Hence
`fn_rider_condition_matches` rather than a shared function bent to cover both.

An unanswered question matches nothing. That took a fix: `to_jsonb` of a SQL
NULL is SQL NULL, so the containment test was NULL, `bool_and` was NULL, and
an outer `coalesce(..., true)` turned "unanswered" into "matches" — every
rider who had not yet said who owns the bike was asked for a permission letter
from an owner they had not named.

`essential` is the difference between blocking activation and a grace period
(`setting.doc_grace_days`). Good conduct takes weeks from the DCI, so it is
not essential; holding riders out of work for it would cost us every rider who
needs the money this month.

### Two-sided documents

A national ID is one requirement and two photos. `document.side` is `front` or
`back`, and the requirement counts as satisfied only when both exist. Two
indexes had to learn about this — `document_current_version` and the
per-version unique constraint both assumed one document per requirement, and
uploading the back of an ID retired the front.

## How to add a city's kit sessions

```sql
insert into public.onboarding_slot (city_id, hub_name, starts_at, capacity)
select c.id, 'Nyali hub',
       (((current_date + d.ahead)::timestamp + t.at::time) at time zone 'Africa/Nairobi'),
       6
from public.city c
cross join generate_series(1, 14) as d(ahead)
cross join (values ('09:00'), ('14:00')) as t(at)
where c.slug = 'mombasa'
  and extract(isodow from current_date + d.ahead) between 1 and 6;
```

Convert the wall time with `at time zone` as above. Writing a bare timestamp
lets the server's UTC read `09:00` as 09:00 UTC, and the flow offers riders a
hub session at noon.

Capacity is enforced by `rpc_book_slot`, which locks the row while it counts —
two riders tapping the last Tuesday slot must not both get it, or one turns up
to a hub with no kit for them.

## Running it locally

```
pnpm db:reset
pnpm db:test            # includes 07_rls_rider_onboarding
pnpm --filter @nexg/web dev
```

Then open `/riders/apply/start`.

After adding a migration with new RPCs, PostgREST caches the schema:

```
docker exec supabase_db_nexg psql -U postgres -c "notify pgrst, 'reload schema';"
```

**A trap worth knowing.** Adding a parameter with `create or replace function`
does not replace anything — it declares an overload. If the new parameter has
a default, a call without it matches both, and PostgREST answers `300 Multiple
Choices`. In the browser that arrives as an upload that silently does nothing:
the file reaches the bucket and no row is written. Drop the old signature
explicitly.

## What is not connected yet

Each is a seam with the database side real and the provider missing. None
fakes a success.

| Thing | State | What switches it on |
| --- | --- | --- |
| SMS for the phone code | Real code, hashed, 5 min, 3 attempts. With no sender the flow shows it on screen and says why. | `setting.sms_provider` |
| WhatsApp resume / "snap on your phone" | Real single-use token; the link is shown to copy. Opening it on a phone makes the document buttons open the camera. | `setting.whatsapp_provider` |
| Document chase | `document_request` and `notification_log` rows written; nothing sent. | `setting.whatsapp_provider` |
| M-Pesa name lookup | Records "not checked" and blocks activation without a written reason. | `setting.payout_name_provider` |
| In-app camera with blur check and plate OCR | Not built. `fn_plate_matches` and `document.ocr` exist for it; capture uses the phone's own camera via `capture="environment"`. | an OCR provider, then a `readDocument` server action |

The one to be careful with is the phone code: it is shown on screen only when
`setting.sms_provider` is null. Setting that row without a working sender
would stop showing the code **and** fail to send it, locking every new rider
out of step 1.
