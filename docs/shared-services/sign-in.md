# Sign-in: one Supabase account for every app (shared services D6)

For the Consumer app, the Stays app, the merchant tools and the website. **Not for the Rider app:** rider sign-in belongs to another developer and isn't changed here.

## The rules

- **One account per person**, in the one Supabase project (NexgApp). The website and every app sign in to it directly, through supabase-js or a native Supabase SDK. There's no other user store, and no app keeps its own passwords.
- **Ways in:** email (code or password, as today), Google, Apple, and a phone number confirmed by an SMS code.
- **Guests:** a guest uses a temporary (anonymous) Supabase session. It can order delivery, keep a basket and pay. Bookings and stay holds still need a full account (`20261223000500`).
- **Turning a guest into an account keeps everything:** link an email, phone, Google or Apple to the anonymous session instead of signing in again. The user id stays the same, so the guest's orders, basket and payments stay on the account.
- **A guest signing in to an existing account** gets a different user id. Merge the basket (`rpc_basket_merge`, see `basket.md`). Past guest orders follow when the account confirms the phone they were placed with: when Supabase confirms an account's phone by SMS code, the customer record with that number joins the account, with its orders, payments and saved places (`20270225000100`). It never takes a record from another full account. If the account already has a customer record with its own history, the two are not merged automatically: support is told (audit `customer.phone_link_needs_support`) and links them.

## What's switched on (25 Nov 2026)

| | Production | To switch on (the owner) |
| --- | --- | --- |
| Email | On | |
| Guests (anonymous) | On | |
| Google | On (website, 24 Nov 2026) | Done for the website: Google Cloud web OAuth client, Supabase → Auth → Providers → Google, `NEXT_PUBLIC_AUTH_GOOGLE=on` in Vercel. For the apps: add the iOS and Android client IDs under "Authorized client IDs". |
| Apple | Off | See "Apple on the website" below. Website: `NEXT_PUBLIC_AUTH_APPLE=on`. For the apps, add each bundle ID to the Apple provider's client IDs, after the Services ID. |
| Phone by SMS code | Off | An SMS provider. Supabase → Auth → Providers → Phone. |

Every client should check what's on before showing a button. `GET https://<project>.supabase.co/auth/v1/settings` with the publishable key answers `external.google`, `external.apple`, `external.phone` and `external.anonymous_users`. The website already does this.

Redirect URLs for the apps (Supabase → Auth → URL Configuration) are each app's own deep link, for example `nexg://auth-callback`, added next to `https://www.nexgapp.com/**`.

## Apple on the website

The owner does every Apple and Supabase step. No key or secret goes in this repo or in chat.

1. **Apple Developer Program** (paid, yearly). A free Apple ID can't create Services IDs or keys.
2. **App ID** (Certificates, Identifiers & Profiles → Identifiers → App IDs) with the **Sign in with Apple** capability ticked. The web sign-in hangs off it as its "primary App ID".
3. **Services ID** (Identifiers → Services IDs), for example `com.nexgapp.web`. Its identifier is the **client ID** Supabase uses. Under Sign in with Apple → Configure: the App ID from step 2 as primary; **Domains** `bmrrifvtfvgagkhrmitv.supabase.co` (Apple returns to Supabase, not to nexgapp.com; adding `nexgapp.com` as well does no harm); **Return URL** `https://bmrrifvtfvgagkhrmitv.supabase.co/auth/v1/callback`.
4. **Key** (Keys) with Sign in with Apple, linked to the App ID. Download the `.p8` (Apple allows it once) and keep it private and safe. Note its Key ID, and the account's Team ID (top right of the developer account).
5. **Secret.** Apple's web flow doesn't take the `.p8` itself. Supabase's Apple guide ("Login with Apple" → "Using the OAuth flow for web") has a generator that turns the Team ID, Key ID, Services ID and `.p8` into a signed secret, in the browser. **The secret expires after 6 months.** Make a new one from the same `.p8` and paste it in before then, or Apple sign-in stops.
6. **Supabase** → Authentication → Sign In / Providers → Apple: switch on; **Client IDs**: the Services ID, first (Supabase uses the first one for the web); **Secret Key (for OAuth)**: the generated secret. Save.
7. **Vercel** → nexg → Settings → Environment Variables: `NEXT_PUBLIC_AUTH_APPLE=on` for Production, then redeploy **without the build cache** (the flag is read at build time). Mind the Hobby cap on deploys per 24 hours.

**Checks:** `/auth/v1/settings` reports `"apple": true`; `/auth/v1/authorize?provider=apple` redirects to `appleid.apple.com`; "Continue with Apple" shows on /sign-in, /sign-up and in the side menu.

### How the website handles Apple's quirks

- **The name.** Apple's token never carries the name, and Apple shares it only on the very first sign-in. `/auth/callback` sends anyone without a `first_name` to `/sign-up/finish`, which asks for it and saves it on the account.
- **"Hide my email".** The account's email is then `…@privaterelay.appleid.com`. The finish page says so, and offers to sign out and use an existing NexG account instead, because a relay address never matches an existing account.
- **Same email already on NexG.** Supabase links Apple to an existing account with the same confirmed email automatically, so the person keeps one account and its orders.
- **Emails to relay addresses.** Apple only forwards mail from sources registered under Certificates, Identifiers & Profiles → Services → **Sign in with Apple for Email Communication**. Register the domain `nexgapp.com` and each address NexG sends from (the addresses in Settings → Email routing, and the Supabase auth email sender). The domain must pass SPF and DKIM, which the Resend domain setup already gives it. Until this is done, order and account emails to relay addresses bounce.

## Recipes

**Google or Apple, native:** take the ID token from the platform's own sign-in sheet and hand it to Supabase. Use `nonce` for Apple, and for Google where the SDK gives one.

```ts
await supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce: rawNonce });
await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
```

**Guest to account, keeping the same user:**

```ts
// Email: sends a confirmation code to the address.
await supabase.auth.updateUser({ email });
// Google or Apple, from the web or the system browser:
await supabase.auth.linkIdentity({ provider: 'google' });
```

**Confirm a phone on a signed-in account:** the website's account page does this, in `apps/web/components/account/phone-confirm.tsx`.

```ts
await supabase.auth.updateUser({ phone: '+254712345678' }); // sends the SMS
await supabase.auth.verifyOtp({ phone: '+254712345678', token: '123456', type: 'phone_change' });
```

**Sign in with a phone:**

```ts
await supabase.auth.signInWithOtp({ phone: '+254712345678' });
await supabase.auth.verifyOtp({ phone: '+254712345678', token: '123456', type: 'sms' });
```

Send numbers as `+254…`. The account's `phone` and `phone_confirmed_at` on the Supabase user say what's confirmed.

**Turnstile:** Supabase checks a Turnstile token on email and phone sign-up and sign-in (`captchaToken` in `options`). Apps get the token from the Turnstile widget with the app's site key. OAuth and ID-token sign-in don't need one.

## Not done yet

- **The SMS provider.** Africa's Talking needs a small Supabase "send SMS" hook, written once the owner chooses it. Twilio works in Supabase as it is.
