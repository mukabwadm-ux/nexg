# Turning push on

Written for: whoever finishes the deployment.

The bell works already — it is live in-app over Realtime and needs nothing. This is only about getting those same notifications onto a lock screen with NexG closed.

Two things, in this order — one of them a script.

## 1. The public key must be in a *fresh build*

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined into the JavaScript at build time, not read at runtime. Vercel's **Redeploy** reuses the existing build, so adding the variable and redeploying does nothing — the bundle still has no key.

Either push a commit, or redeploy with **"Use existing build cache" unticked**.

To check it took, open the site and run in the console:

```js
await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
```

or simply open the bell. If the key is missing it says so by name, in place of the "Also show these on my screen" button — a missing variable and somebody declining the browser prompt used to look identical from outside, and now they do not.

## 2 and 3. The function and the clock — one script

```bash
npx supabase login          # once, opens a browser
bash scripts/enable-push.sh
```

That is the whole of it. The script reads the key pair out of the gitignored
`vapid-keys.txt`, deploys `supabase/functions/push-dispatch`, sets the four
secrets on it, generates a fresh `PUSH_DISPATCH_SECRET` and writes that same
value plus the function URL into Vault, then calls `cron_push_dispatch()` once
and prints what came back. Nothing is echoed; the private key never leaves the
pipe between the file and Supabase.

`ok: true` with a `request_id` at the end means the call went out. Re-running it
is safe — the secret is regenerated and both sides are rewritten together, so
they cannot drift apart.

### If you would rather do it by hand

The sender runs inside Supabase rather than in the web app because sending
requires the service role, and the service role must never be an environment
variable on `apps/web` or `apps/admin` — those are built into bundles that reach
browsers.

```bash
supabase functions deploy push-dispatch --project-ref bmrrifvtfvgagkhrmitv --no-verify-jwt

supabase secrets set   VAPID_PUBLIC_KEY=<the public key>   VAPID_PRIVATE_KEY=<from vapid-keys.txt>   VAPID_SUBJECT=mailto:hello@nexgapp.com   PUSH_DISPATCH_SECRET=<any long random string>
```

`--no-verify-jwt` matters: pg_cron calls the function with the shared secret in
`x-push-secret` and no Authorization header, so a function that insists on a JWT
rejects its only caller.

Then, in the SQL editor, tell the clock where to call. `cron_push_dispatch()`
runs every minute and reads two values from Vault; until they exist it sends
nothing and says so rather than raising into a log nobody reads.

```sql
select vault.create_secret(
  'https://bmrrifvtfvgagkhrmitv.supabase.co/functions/v1/push-dispatch',
  'push_dispatch_url');

select vault.create_secret('<the same PUSH_DISPATCH_SECRET>', 'push_dispatch_secret');

select public.cron_push_dispatch();
```

---

## How it behaves

**One notification per thing, updated in place.** An order moving through six stages is one row in the bell and one card on the lock screen that keeps changing — the push carries a `tag` and the service worker shows it with `renotify: false`, so it replaces quietly rather than buzzing six times.

**At-least-once, deliberately.** The dispatcher marks a notification sent after it hands it to the push services. A run that dies halfway resends — and because of the tag, a resend replaces rather than stacks. Nobody is harmed by seeing "your rider is nearly there" twice; somebody is harmed by never seeing it.

**Nothing older than an hour is pushed.** A backlog from an outage is not worth buzzing a phone at 3am. The bell still has it.

**Dead subscriptions retire themselves.** A `404` or `410` from a push service means the browser threw the subscription away — the app was uninstalled, or the endpoint rotated. That is not a failure to retry, so the row is marked `failed_at` and skipped from then on.

**Somebody with no subscription is not a failure either.** They read the bell. The notification is marked sent so it is not retried for ever against a person who never turned push on.

## iPhone

Web push on iOS works only after the person adds NexG to their home screen, and only from iOS 16.4. The PWA manifest and `apple-web-app` metadata are in place, so the install is available — but until someone installs, an iPhone gets the bell and no lock screen. That is a platform rule, not something to work around, and the copy does not promise otherwise.

## What is still missing after this

Nothing drains `notification_log` — the **email and SMS** queue, which is separate from this and still has 9 skipped acknowledgements on production waiting for an email provider. Push and email are two different senders; this document is only the first.
