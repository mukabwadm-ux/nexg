# Putting NexG online

Goal: a shareable link for testers. Sections 1–4 put the public site online
and keep the staff console on your machine. Section 5 gives the console its
own URL, which you need once other people are testing and registrations
arrive while you are away from your laptop. Section 6 puts the public API and
its developer docs at `api.nexgapp.com`.

There are two accounts to create and roughly forty minutes of work, plus
twenty for the console and twenty for the API. Supabase first: Vercel is useless without it, because
the site has no database of its own.

---

## 1. Supabase — already done

The project exists and the schema is on it:

| | |
| --- | --- |
| Project URL | `https://bmrrifvtfvgagkhrmitv.supabase.co` |
| Region | `eu-west-1` (Ireland) |
| Pooler host | `aws-1-eu-west-1.pooler.supabase.com` — note the `aws-1` prefix; newer projects are not on `aws-0`, and the direct `db.<ref>.supabase.co` host is IPv6-only |

All 29 migrations are applied: 16 tables, RLS on 15 of them, 11 cities, 8
roles, 13 document requirements and the private `partner-documents` bucket.
No seed ran, which is correct — `seed.sql` creates the `dev.admin` account and
demo merchants, and neither belongs here.

Verified against it directly: the public reads the site needs all work, the
raw `merchant` table is denied to anonymous callers, `rider` and `staff_user`
return nothing, and a careers application inserts.

### Supabase Auth settings

Both are in **Authentication → Sign In / Providers**. Without them the site
looks broken in ways that give no useful error.

1. **Anonymous sign-ins → ON.** Currently off. Every document upload fails
   without it: the storage policies ask whether the caller owns the
   application, and an applicant with no session owns nothing.
2. **Configure custom Auth SMTP before enabling email confirmations.** Merchant
   registration and email-code sign-in rely on Supabase Auth sending OTPs.
   The web app's `RESEND_API_KEY` does not configure Supabase Auth delivery.
   For Resend, verify a sender domain and set the hosted project's SMTP host to
   `smtp.resend.com`, port `465` or `587`, username `resend`, password to the
   Resend API key, and sender address to an address on that verified domain.
   Store the key only in Supabase's protected SMTP settings.
3. **Authentication → Sign In / Providers → Email → Confirm email → ON** after
   SMTP works. Set the **Change email address** template to include
   `{{ .Token }}` for merchant registration, and the separate **Magic link or
   OTP** template to `{{ .Token }}` for email-code sign-in. The registration
   form accepts six- or eight-digit Auth tokens. Keep the password-recovery email as a one-time
   `{{ .ConfirmationURL }}` link. See the [merchant email verification
   guide](./merchant-email-otp.md) for the full setup and acceptance checklist.

### A gotcha worth knowing

Supabase rejects `@example.com` and similar as invalid addresses. Testers must
use a real domain. This is Supabase's validation, not ours.

### Re-pushing the schema later

```bash
npx supabase db push --db-url   "postgresql://postgres.bmrrifvtfvgagkhrmitv:<URL-ENCODED-PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
```

The password contains an `@`, which must be percent-encoded as `%40` or it
terminates the userinfo part of the URL and the connection fails with a
confusing host error.

## 2. Vercel: the public site (~15 min)

1. The project already exists and is connected to the repo.
2. **Root Directory: `apps/web`.** This is the setting people miss. Leave it at
   the repo root and the build fails, because the root is a Turborepo
   workspace, not a Next.js app.
3. Framework Preset: **Next.js** (auto-detected).
4. Build and install commands: leave as detected. Vercel understands pnpm
   workspaces and will install from the repo root.
5. **Environment Variables** — add all three for Production *and* Preview:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://bmrrifvtfvgagkhrmitv.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **publishable** key (`sb_publishable_…`) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` |

   The anon key is meant to be public — it is in the browser bundle either way.
   Row-level security is what protects the data, not the key. The
   **service-role key is not needed and must not be added**: nothing in
   `apps/web` uses it, and on Vercel it would be one misconfigured route away
   from bypassing every policy.
6. **Deploy.**

### If the build fails

- **`Unsupported pnpm version` or corepack errors.** `package.json` pins
  `pnpm@11.4.0`, which Vercel may not carry yet. Fix: Project Settings →
  General → Node.js Version **22.x**, and if it still fails, change
  `packageManager` to the newest pnpm Vercel lists and commit that.
- **`Module not found: @nexg/ui`.** Root Directory is not `apps/web`, or
  "Include files outside the root directory" is off. Both live in Project
  Settings → General.
- **`supabaseUrl is required`.** The environment variables are missing or were
  added after the build. Add them, then **Redeploy** — Vercel does not rebuild
  on an env change by itself.

---

## 3. Check it before you share the link

Five minutes, in order. Each one exercises a different layer.

1. `/` loads and the city carousel shows photographs → **static assets fine**
2. `/explore` lists nothing at all → **database reachable, and correctly
   empty**, since no seed ran
3. `/sign-in?tab=create` → create an account with a **real** email domain,
   receive and confirm the email, then sign in → **auth and email delivery
   working**. If the confirmation message does not arrive, check Supabase Auth
   and email-provider delivery logs before continuing.
4. `/riders/apply` → complete step one, upload one document → **storage and
   RLS working**. This is the one that catches a missed anonymous-sign-ins
   setting.
5. `/careers` → apply for a role → **public insert working**

If step 4 fails with a policy error, anonymous sign-ins are off. If step 3
fails, inspect Supabase Auth SMTP settings, email templates, and provider
delivery logs.

---

## 4. Giving testers something to look at

A live site with an empty `/explore` and no featured merchants looks broken
rather than new. Before sharing, run one merchant through so there is
something on screen:

1. Register a business at `/merchants/apply` and upload its documents.
2. Approve it from your **local** console. The console reads whichever
   Supabase its `.env.local` points at, so to review the hosted data, point
   `apps/admin/.env.local` at the hosted project, restart `pnpm dev`, and sign
   in as a staff user.
3. You will need a staff account on the hosted project, which the seed did not
   create. Two steps:

   **In Supabase Studio → Authentication → Users → Add user:** your email, a
   password from a password manager, "Auto Confirm User" ticked. The password
   is set here and nowhere else.

   **Then in SQL Editor:** paste `supabase/bootstrap-staff.sql`, edit the two
   values at the top, and run it. It is idempotent and it prints what it made.

   Do not hand-write the grants. An earlier version of this page granted
   `ops_manager` alone, which is not enough: `can_manage_merchants` wants
   `merchant_ops` or `super_admin`, so that account could open the pipeline
   and verify nothing. The script grants the four roles the console actually
   reads — `ops_manager`, `merchant_ops`, `rider_ops`, `growth`.

   It deliberately does not grant `super_admin`, and cannot: a trigger refuses
   that role without a second approver who is not the granter. You do not need
   it to run the console — it only gates editing cities, changing which
   documents we demand, and adding staff. The script's footer has the
   two-person version for when a colleague has an account.

4. Take the merchant live and feature it. It now shows on the homepage and in
   Explore.

---

## 5. Putting the console online (~20 min)

Section 4 assumes you are at your own machine when a registration comes in.
Once other people are testing, that stops being true: someone registers a
business on Tuesday evening and nobody can approve it until you are back at
your laptop. This gives the console its own URL.

It is a **separate Vercel project** pointing at the same repository. Do not
try to serve both apps from one — they have different root directories and
different audiences.

### Is it safe to put a staff console on the internet?

Yes, and not because of the sign-in page. Every table the console reads is
behind RLS that checks `staff_user` and `role_grant`, and the console holds
**no service role key** — it reads as the signed-in staff member and nothing
more. A stranger who finds the URL gets a sign-in form; a stranger who forges
a session cookie gets an empty console rather than somebody's documents. The
middleware redirect is convenience, not the fence.

Two things you must get right, because they are the fence:

- **No `devpassword` anywhere.** That account comes from `seed.sql`, which has
  never run on the hosted project and must not. Check before you share the
  URL: `select email from public.staff_user;` should list only real people.
- **Never add `SUPABASE_SERVICE_ROLE_KEY`.** Nothing in the console uses it,
  and it bypasses every policy above.

### Steps

1. **New Vercel project**, same GitHub repository, with:

   | Setting | Value |
   | --- | --- |
   | Root Directory | `apps/admin` — the setting people miss |
   | Framework | Next.js (detected) |
   | Build command | leave default |

2. **Environment variables** (Production and Preview):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://bmrrifvtfvgagkhrmitv.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<the publishable key>
   STAFF_EMAIL_DOMAIN=nexgapp.com
   ```

   `STAFF_EMAIL_DOMAIN` refuses any sign-in that is not a work address before
   it reaches Supabase. Set it to whatever domain your team's email is on. Set
   `RESEND_API_KEY` and `EMAIL_FROM` too once Resend exists, or ticket replies
   will be recorded and never sent.

3. **Create your staff account** on the hosted project, using the SQL in
   section 4. Give it a real password from a password manager, not one you
   will type from memory.

4. **Check it**, in this order, before telling anyone the URL:

   - Open the URL signed out → you land on `/sign-in`.
   - Sign in with a personal email → refused by the domain check.
   - Sign in properly → the merchant pipeline loads.
   - Open `/merchants` in a private window → redirected to sign-in.

`apps/admin/vercel.json` already pins the console to `dub1` (Dublin), beside
the database. Without it Vercel picks a US region and every page pays a
transatlantic round trip per query — the console makes a lot of them.

### Before real traffic

Add a second factor. Supabase Auth supports TOTP, and a console that can take
a merchant live and read uploaded national IDs deserves more than a password.
That is a change to `apps/admin/app/sign-in`, not a setting.

---

## 6. The API and developer docs (~20 min)

`apps/api` serves the public API (`/v1`), its developer docs (`/docs`) and the
developer console (`/developers`), where people sign in and issue keys. It is
a **third Vercel project** on the same repository, `nexg-api`, at
`https://api.nexgapp.com`.

### The one project that holds the service-role key

Sections 2 and 5 say never to add `SUPABASE_SERVICE_ROLE_KEY`. The API is the
exception. Every `/v1` request spends tokens from the PostgreSQL rate limiter
(`fn_api_request_spend`), and merchant order reads go through
`rpc_order_read_api`. Both run as the service role, from server code only
(`apps/api/lib/auth.ts`, `apps/api/lib/orders.ts`). Without the key, every
`/v1` call answers `503`, "The API is temporarily unavailable."

Give it to **Production only**. Preview builds run unmerged branch code, and
none of them needs it: on a preview, `/v1` answers `503` and the docs still
render.

### Steps

1. **New Vercel project**, same GitHub repository, named `nexg-api`:

   | Setting                    | Value                              |
   | -------------------------- | ---------------------------------- |
   | Root Directory             | `apps/api`                         |
   | Framework                  | Next.js (detected)                 |
   | Build and install commands | leave default                      |
   | Node.js Version            | the same as the other two projects |

   In the Root Directory settings, keep "Include files outside the root
   directory" on (the API imports `@nexg/ui`, `@nexg/contracts` and
   `@nexg/db`), and tick "Skip deployments when there are no changes to the
   root directory or its dependencies", as on the other two.
   `apps/api/vercel.json` already pins the functions to `dub1`, beside the
   database.

2. **Environment variables** (Project Settings → Environment Variables):

   | Name                             | Value                                                                                                  | Environments    |
   | -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`       | `https://bmrrifvtfvgagkhrmitv.supabase.co`                                                             | Production      |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | the **publishable** key (`sb_publishable_…`)                                                           | Production      |
   | `SUPABASE_SERVICE_ROLE_KEY`      | Supabase → Project Settings → API Keys → **Legacy API Keys** → `service_role`, marked **Sensitive** | Production only |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the same site key as the `nexg` project                                                                | Production      |
   | `API_TRUSTED_PROXY_IP_HEADER`    | optional: `x-real-ip`                                                                                  | Production      |

   - Take the Supabase values from Supabase (Project Settings → API Keys). The
     other two projects store theirs as Sensitive, so Vercel will not show
     them.
   - For previews that can reach the database, tick Preview as well on the
     two `NEXT_PUBLIC_SUPABASE_*` variables. Never on the service-role key.
   - `API_TRUSTED_PROXY_IP_HEADER` decides how callers without a key are
     rate-limited. Unset, they all share one bucket of 120 requests a minute.
     Set to `x-real-ip`, each IP gets its own. Vercel overwrites that header,
     so callers cannot forge it, as long as the Cloudflare record stays DNS
     only.
   - Not needed: `NEXT_PUBLIC_SITE_URL` (nothing in `apps/api` reads it,
     though `.env.example` lists it) and a Turnstile secret (Supabase Auth
     holds it).

3. **Domain.** Project Settings → Domains → add `api.nexgapp.com`. Then in
   Cloudflare, `nexgapp.com` → DNS → Records:

   | Type  | Name      | Content                                                     | Proxy status |
   | ----- | --------- | ----------------------------------------------------------- | ------------ |
   | CNAME | `api`     | `cname.vercel-dns.com`                                      | DNS only     |
   | TXT   | `_vercel` | the `vc-domain-verify=api.nexgapp.com,…` value Vercel shows | —            |

   **Add** the TXT record next to the `_vercel` records already there; do not
   edit them. There is one per verified name (`nexgapp.com`, `www`, `admin`),
   because the Vercel team has no team-wide domain. Once Cloudflare serves
   the record, Vercel marks the domain verified and issues its certificate.

4. **Turnstile.** Cloudflare → Turnstile → the existing widget (the one whose
   site key you used above) → Settings → Hostname Management → add
   `api.nexgapp.com`. Do not create a second widget: Supabase checks every
   sign-in token against this widget's secret, so a new widget's tokens
   would be refused.

5. **Redeploy** (Deployments → the latest deployment → ⋯ → Redeploy).
   `NEXT_PUBLIC_` values are fixed when the site is built, and a project's
   first deploy is never skipped: any merge to `main` builds it, with or
   without variables. Redeploy whenever a variable changes.

### Check it

In order:

1. `https://api.nexgapp.com/docs` loads → **domain, certificate and build
   fine**.
2. `curl -i https://api.nexgapp.com/v1/zones` → `200` with `"ok":true` →
   **Supabase reachable and the service-role key working**. A `503` means a
   Supabase variable is missing, or was added after the build.
3. `curl -i "https://api.nexgapp.com/v1/catalog/merchants?limit=101"` →
   `400` `invalid_request` with an `X-Request-Id` header → **errors come back
   as JSON**.
4. Open `/developers` signed out → redirected to `/sign-in`.
5. Sign in with your own NexG account → your merchants appear by name →
   **Turnstile, Supabase Auth and the console working**. If a correct
   password is refused with "That email and password do not match", check
   the Turnstile hostname first. The form shows that message for every
   refusal, including a failed bot check; the browser console shows
   Turnstile's error code.

---

## What testers will not be able to do

Say this when you share the link, so nobody reports it as a bug:

- **No SMS codes.** Sign-in is email and password. The phone field explains it.
- **No Google or Apple sign-in.** Those need OAuth credentials.
- **No map pin** on the merchant address — text only until the Maps key exists.
- **No orders.** Nothing can be bought. Every figure that would come from an
  order renders `[—]`, deliberately: none of them has been agreed, and a
  plausible number in a demo is how invented numbers end up in a pitch deck.
- **No published legal text** beyond the Terms, which is marked draft.
- **An application belongs to the browser that started it.** Same device
  resumes it; a different one cannot, until the applicant creates an account.
  That is what SMS verification will replace.

## Cost

Both free tiers are enough for this. Supabase free pauses a project after a
week of no activity — if the link goes quiet and then breaks, that is why;
un-pause it from the dashboard.
