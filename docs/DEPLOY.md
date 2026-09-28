# Putting NexG online

Goal: a shareable link for testers. Public site only — the staff console stays
on your machine, so nothing with staff powers is exposed and the seeded
`dev.admin` password never reaches the internet.

There are two accounts to create and roughly forty minutes of work. Supabase
first: Vercel is useless without it, because the site has no database of its
own.

---

## 1. Supabase: a hosted project (~15 min)

The site currently talks to `127.0.0.1`. Vercel cannot.

1. Go to https://supabase.com → **New project**.
   - Organisation: yours.
   - Name: `nexg-staging`.
   - **Region: `eu-central-1` (Frankfurt)** — the closest Supabase region to
     Kenya. There is no East African region; Frankfurt is about 150 ms from
     Nairobi, Singapore and Mumbai are further in practice.
   - Database password: generate one and put it in your password manager, not
     in a file in the repo.
2. Wait for it to finish provisioning.
3. From **Project Settings → API**, copy:
   - `Project URL`
   - `anon` `public` key
4. From **Project Settings → General**, copy the **Reference ID**.

Then push the schema from your machine:

```bash
npx supabase link --project-ref <REFERENCE_ID>     # asks for the db password
npx supabase db push                               # runs all 29 migrations
```

`db push` applies migrations only. It does **not** run `seed.sql`, which is
correct — that file creates the `dev.admin` account and demo merchants, and
neither belongs on a hosted project.

You do need cities, roles and document requirements, but those live in
migrations rather than the seed, so `db push` brings them.

**Enable anonymous sign-ins** — the apply flows depend on them:
Authentication → Providers → **Anonymous sign-ins: on**.

**Email confirmations**: Authentication → Providers → Email. Confirmations are
off by default on a new project, which is what you want for testers — with
them on, nobody can sign in until you configure SMTP.

---

## 2. Vercel: the public site (~15 min)

1. https://vercel.com → **Add New → Project** → import
   `mukabwadm-ux/nexg`.
2. **Root Directory: `apps/web`.** This is the setting people miss. Leave it at
   the repo root and the build fails, because the root is a Turborepo
   workspace, not a Next.js app.
3. Framework Preset: **Next.js** (auto-detected).
4. Build and install commands: leave as detected. Vercel understands pnpm
   workspaces and will install from the repo root.
5. **Environment Variables** — add all three for Production *and* Preview:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key from step 1 |
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
   empty**, since `db push` seeds no merchants
3. `/sign-in?tab=create` → create an account with a real email → you land on
   `/` → **auth working**
4. `/riders/apply` → complete step one, upload one document → **storage and
   RLS working**. This is the one that catches a missed anonymous-sign-ins
   setting.
5. `/careers` → apply for a role → **public insert working**

If step 4 fails with a policy error, anonymous sign-ins are off. If step 3
fails, email confirmations are on.

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
   create. Make one:

```sql
-- Supabase Studio → SQL Editor, after creating the user in
-- Authentication → Users (email + password, "Auto Confirm User" ticked).
insert into public.staff_user (user_id, email, display_name)
values ('<the new auth user id>', 'you@yourdomain.com', 'Your Name');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, r.id, null, s.id
from public.staff_user s, public.role r
where s.email = 'you@yourdomain.com' and r.key = 'ops_manager';
```

4. Take the merchant live and feature it. It now shows on the homepage and in
   Explore.

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
