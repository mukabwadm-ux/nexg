# Running the NexG demo

Everything below works against local Supabase. No third-party account is
needed: there is no SMS provider, no Google OAuth and no Maps key in this
path, and nothing in the demo pretends otherwise.

## Start it

```bash
# 1. Docker Desktop must be running. The CLI is not on PATH by default:
export PATH="$PATH:$LOCALAPPDATA/Programs/DockerDesktop/resources/bin"

# 2. Database, storage and auth
npx supabase start
npx supabase db reset      # migrations + seed, from scratch

# 3. Both apps
pnpm dev                   # web on :3000, admin on :3001
```

| What | Where |
| --- | --- |
| Public site | http://localhost:3000 |
| Staff console | http://localhost:3001 |
| Supabase Studio | http://localhost:54323 |

Staff sign-in: `dev.admin@nexgapp.com` / `devpassword`. It is seeded by
`supabase/seed.sql` and exists only locally.

## The story to walk through

### 1. A rider applies — 3 minutes

1. http://localhost:3000/riders → fill the card in the hero → **Continue**.
2. On `/riders/apply`, complete the details. The number must be a real-looking
   Kenyan mobile; the form emits E.164.
3. **Continue** creates the application. Watch the status: it is `applied`.
4. Upload the six documents. Any image or PDF under 10 MB will do — photograph
   anything. Each one saves on its own as you attach it; the two with expiry
   dates wait for the date before saving.
5. The status moves itself: `applied` → `documents_pending` → `under_review`.
   Nothing in the app does that, the database does.

### 2. Staff review and activate — 2 minutes

1. http://localhost:3001 → sign in.
2. **Riders** → the new application is in **Under review** with a progress bar.
3. Open it. Every required document is listed with a **View file** button — a
   signed URL that expires five minutes after the page was rendered.
4. **Verify** each one. Try **Reject** on one first with a reason: the applicant
   sees that reason on their own page and can upload a replacement.
5. **Activate rider**. Press it before everything is verified to see the refusal
   name the missing document; the database decides, not the button.

### 3. A merchant, end to end — 5 minutes

Same shape, with two extra steps worth showing:

1. `/merchants/apply` collects the business, then **where a rider collects
   from**, then five documents.
2. In the console, the collection address appears on the application — that is
   what a dispatcher needs and what go-live checks for.
3. Verify the documents → **Take live**.
4. **Feature on homepage** → reload http://localhost:3000. The business is in
   the Featured Merchants band, labelled Sponsored.
5. It is also on http://localhost:3000/explore, which lists every live business
   whether or not it is featured.

### 4. The part worth pointing at

Open Studio → `audit` → `audit_event`, or:

```sql
select created_at, actor_type, action, target_type
from audit.audit_event order by id desc limit 20;
```

Every state change in the demo is there — upload, verify, go-live, feature —
written in the same transaction as the change itself, on a hash chain.
`select * from audit.verify_chain();` proves it has not been edited.

## What is deliberately not there

Worth saying out loud before someone asks:

- **No SMS.** Section 4.2 puts an OTP in front of document upload. There is no
  provider account, so applicants get an anonymous Supabase session that can
  own exactly one application and write only inside its own storage prefix.
- **No Google Workspace sign-in.** Staff sign-in is email and password against
  the same project, with the domain rule from section 5.1 applied in the app.
- **No map pin.** The collection address is text until the Maps key exists.
- **No prices, commissions or delivery times.** Everything that would be a
  business number renders as `[—]`. None of them has been agreed, and inventing
  one for a screenshot is how invented numbers end up in a pitch deck.
- **No published legal text.** `/legal/*` says the documents are with advisers
  rather than showing a draft that reads like a commitment.

## If something looks wrong

| Symptom | Cause |
| --- | --- |
| Sign-in says "Database error querying schema" | The seeded auth row is missing its token columns. `npx supabase db reset`. |
| Upload fails with a policy error | The applicant lost their session. The application is claimed by the browser that created it; use the same one, or apply again. |
| A featured merchant is not on the homepage | The band has four slots and the seed fills them. Newest featured wins; unfeature one of the seeded four. |
| The site is unstyled | A production build ran against the dev server's directory. `apps/*/next.config.mjs` splits `distDir`, so this should not recur. |
