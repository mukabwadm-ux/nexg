# Sign-in: one Supabase account for every app (shared services D6)

For the Consumer app, the Stays app, the merchant tools and the website. **Not for the Rider app:** rider sign-in belongs to another developer and isn't changed here.

## The rules

- **One account per person**, in the one Supabase project (NexgApp). The website and every app sign in to it directly, through supabase-js or a native Supabase SDK. There's no other user store, and no app keeps its own passwords.
- **Ways in:** email (code or password, as today), Google, Apple, and a phone number confirmed by an SMS code.
- **Guests:** a guest uses a temporary (anonymous) Supabase session. It can order delivery, keep a basket and pay. Bookings and stay holds still need a full account (`20261223000500`).
- **Turning a guest into an account keeps everything:** link an email, phone, Google or Apple to the anonymous session instead of signing in again. The user id stays the same, so the guest's orders, basket and payments stay on the account.
- **A guest signing in to an existing account** gets a different user id. Merge the basket (`rpc_basket_merge`, see `basket.md`). Past guest orders stay with the guest session. Support can link them, and once phones are confirmed by SMS this can be automatic.

## What's switched on (22 Nov 2026)

| | Production | To switch on (the owner) |
| --- | --- | --- |
| Email | On | |
| Guests (anonymous) | On | |
| Google | Off | Google Cloud OAuth client IDs for web, iOS and Android. Supabase → Auth → Providers → Google: the web client ID and secret, and the iOS and Android client IDs under "Authorized client IDs". Website: `NEXT_PUBLIC_AUTH_GOOGLE=on`. |
| Apple | Off | Apple Developer: a Services ID and a Sign in with Apple key. Supabase → Auth → Providers → Apple: the Services ID, key and team, plus each app's bundle ID. Website: `NEXT_PUBLIC_AUTH_APPLE=on`. |
| Phone by SMS code | Off | An SMS provider. Supabase → Auth → Providers → Phone. |

Every client should check what's on before showing a button. `GET https://<project>.supabase.co/auth/v1/settings` with the publishable key answers `external.google`, `external.apple`, `external.phone` and `external.anonymous_users`. The website already does this.

Redirect URLs for the apps (Supabase → Auth → URL Configuration) are each app's own deep link, for example `nexg://auth-callback`, added next to `https://www.nexgapp.com/**`.

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

- **Automatic linking of past guest orders** when a phone is confirmed. It waits on SMS codes being switched on.
- **The SMS provider.** Africa's Talking needs a small Supabase "send SMS" hook, written once the owner chooses it. Twilio works in Supabase as it is.
