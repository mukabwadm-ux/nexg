# Merchant onboarding

Six steps and a status page, at `/merchants/apply/*` and `/merchants/status`.
Written for whoever changes it next.

## The shape of it

Every tap is a write. There is no Submit that saves the form — the draft row
exists from step 1 and each answer is persisted as it is given, so a merchant
can close the tab between two orders and come back to it. The state lives in
`components/onboarding/store.tsx`, which is optimistic locally and debounced
400 ms to the server, with a flush on `pagehide` so the last tap before a tab
closes is not lost.

Nothing the merchant does makes them public. `rpc_merchant_submit` sets
`submitted_at` and recomputes the status; only `rpc_merchant_go_live`, which
needs a staff grant and every essential document verified, sets `live`.

### Why the NOT NULLs moved

`merchant.legal_name`, `category`, `city_id` and `contact_email` used to be
NOT NULL, which meant nothing existed until every field was filled. A draft
has to be allowed to be incomplete, so those became a condition of
*submitting* rather than of existing —
`merchant_submitted_is_complete` says so. `contact_email` stays nullable for
good: a merchant may go through the whole flow on a phone number.

### Ownership

`rpc_merchant_start` creates the row **and** the `merchant_user` row in one
call, so the draft has an owner from the moment it exists and every later
step is an ordinary owner-scoped write. Knowing a phone number gets you
nothing: an existing draft is only resumed for a caller who already owns it.

The two ways to get a draft onto a second device are both credentials:

- **A resume link** (`rpc_merchant_resume_token` → `/m/r/[token]`). Whoever
  holds it becomes an owner, so it is hashed, single use, and expires in seven
  days.
- **Verifying the phone code.** At that moment the caller has proved they hold
  the number, which is exactly the evidence `rpc_merchant_start` lacked, so
  `rpc_merchant_verify_phone_code` adopts the earlier draft and discards the
  stub just created. It only does this when the new row is still at step ≤ 2,
  so nothing with content in it is ever thrown away.

### What a merchant may not write about themselves

`authenticated` holds table-wide UPDATE on `public.merchant`, and a policy
restricts which *rows*, not which *columns*. The trigger
`tg_merchant_protected_columns` covers the gap: `status`, `featured`,
`went_live_*`, `settlement_account`, `submitted_at`, `waitlisted_at`,
`credentials_sent_at`, `password_set_at`, `payout_name_lookup`,
`requires_ops_mapping`, the resume token and the phone-verification columns
are refused for anyone who is not staff.

It tells the three kinds of writer apart by reading `current_user`, which is
`authenticated` on a direct PostgREST call and `postgres` inside a
security-definer RPC. **It must not be `SECURITY DEFINER`** — that rewrites
`current_user` to the function owner and the guard silently passes for
everyone. `supabase/tests/06_rls_onboarding.sql` fails if someone does that.

## How to add a category

One row in `category_config`, by migration:

```sql
insert into public.category_config
  (category, label, icon, card_kind, eta_style, sort, questions, badge_rules)
values ('butchery', 'Butchery', 'Beef', 'products', 'minutes', 10, '[…]', '{…}');
```

- `category` must already exist in the `merchant_category` enum.
- `icon` is a lucide-react name; add it to the `ICONS` map in
  `components/onboarding/controls.tsx` or it falls back to a gift.
- `card_kind` decides whether the merchant is asked for a menu, services or
  products; `eta_style` whether their card says "delivers in 25 min" or
  "back next day".

## How to add a question

Append to that category's `questions` array:

```json
{ "key": "does_catering", "label": "Do you cater for events?", "type": "single",
  "options": [{"value":"yes","label":"Yes"},{"value":"no","label":"No"}],
  "hint": "Shown to guests planning ahead." }
```

`type` is `single`, `multi` or `text`. The answer lands in `merchant.answers`
under `key`. Nothing in the web app needs changing — step 2 renders whatever
is there, and the admin console reads the same labels back.

The questions live in the database rather than in a TypeScript constant for
one reason: the answers decide which documents we demand, and
`fn_merchant_required_docs` cannot consult a web bundle.

## How to add a document rule

Two ways, depending on which direction the question runs.

**Every business of this kind needs it** — put it on the requirement:

```sql
insert into public.document_requirement
  (owner_type, kind, label, why_text, applies_when, has_expiry, required, essential, sort)
values ('merchant', 'cold_chain_cert', 'Cold chain certificate',
        'Because you deliver frozen goods',
        '{"category": ["supermarket"]}', true, true, false, 90);
```

**This answer triggers it** — put it on the category:

```sql
update public.category_config
set extra_doc_rules = extra_doc_rules || '[{"when":{"sells_frozen":"yes"},"doc":"cold_chain_cert"}]'::jsonb
where category = 'supermarket';
```

`applies_when` may carry both `category` and `answer`, and both must hold.
A multi-select answer matches by containment, so `{"services":"express"}` is
true for a laundry that ticked express among others.

`essential` is the difference between "you cannot be verified without this"
and "send it within `setting.doc_grace_days`". Getting it wrong either holds
a whole restaurant up over a food handler certificate or lets someone list
without a business permit.

## How to add a zone

```sql
insert into public.zone (city_id, name, tier, polygon, eta_min, eta_max, cod_allowed)
select c.id, 'Ruiru', 'trial',
       extensions.st_makeenvelope(36.94, -1.17, 37.00, -1.12, 4326)::extensions.geography,
       40, 60, false
from public.city c where c.slug = 'nairobi';
```

The seeded polygons are rectangles drawn around the usual understanding of
each neighbourhood. They are accurate enough to tell Westlands from Kitengela,
which is what the flow asks of them, and not accurate enough to settle which
side of a road a building is on. Replacing them with surveyed boundaries
changes no code.

Zones are read by `zone_for_point`, which is security definer because the
applicant asking is anonymous, and drawn by the coverage map through the
`zone_bounds` view.

## Running it locally

```
pnpm db:reset          # migrations + seeds
pnpm db:test           # pgTAP, including 06_rls_onboarding
pnpm --filter @nexg/web dev
```

Then open `/merchants/apply/start`.

After adding a migration with new RPCs, PostgREST caches the schema and will
answer `404 No function matches the given name` until it reloads:

```
docker exec supabase_db_nexg psql -U postgres -c "notify pgrst, 'reload schema';"
```

## What is not connected yet

Each of these is a seam, not a stub: the database side is real and the
provider is missing. None of them fakes a success.

| Thing | State | What switches it on |
| --- | --- | --- |
| SMS for the phone code | Code is real, hashed, 5 min, 3 attempts. With no sender the flow shows the code on screen and says why. | `setting.sms_provider` + a sender |
| WhatsApp resume link | Token is real and single use; the link is shown to copy. | `setting.whatsapp_provider` |
| WhatsApp document chase | `document_request` and `notification_log` rows are written; nothing is sent. | `setting.whatsapp_provider` |
| Google Places prefill | Falls back to reading OpenGraph tags, which works for Instagram and most shop sites. | `GOOGLE_MAPS_API_KEY` |
| Draggable map pin | Replaced by "Use my location" (real coordinates) plus an area picker, over a coverage diagram drawn from the real polygons. | `GOOGLE_MAPS_API_KEY` |
| Payout name lookup | Records "not checked" and says a person will do it. | `setting.payout_name_provider` |
| Credentials email | Not built; `credentials_sent_at` and `password_set_at` exist for it. | `RESEND_API_KEY` |

The one to be careful with is the phone code. It is shown on screen only when
`setting.sms_provider` is null. Setting that row without a working sender
would stop showing the code **and** fail to send it, which locks every new
merchant out of step 1.
