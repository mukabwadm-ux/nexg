# Phone push for Consumer, Stays and Rider (19 November 2026)

Replaces [PR #151](https://github.com/mukabwadm-ux/nexg/pull/151) (`codex/d8-native-notifications`), rebuilt on main. Migration `20270120000100_native_push.sql`, test `supabase/tests/119_native_push.sql`, edge function `supabase/functions/native-push-dispatch/`.

## What changed from #151

- New migration id after main's latest (#151's `20261220000500` was older than main).
- Guests: a temporary (anonymous) session may register the Consumer or Stays app, so a guest who ordered without an account gets their order's pushes. The Rider app still needs a signed-in rider.
- The customer's choices in `customer_notification_pref` (20270116000700) are read before an alert is queued. Cancellations, refunds, disputes and payment-due alerts are always sent. A live activity the customer started keeps updating.
- New producers: app bookings (`public.booking`: payment due, quote, confirmed, changed, cancelled, a reminder an hour before), stays (dates changed, check-in details 24 h before, check-out 3 h before), support replies (`support_message`), rider offers "about to expire", disposal decisions (`order_disposal`), payout decisions (`rider_payout_request`), rider account state (`rider.status`). Reminders run from a 5-minute cron and are sent once (`native_push.reminder_sent`).
- Consumer bookings can be tracked as a live activity from 12 hours before.
- Every producer trigger catches its own errors, so a push can never fail the order, booking or stay step it observes.
- `rpc_native_push_revision` answers only the installation's own account.
- The Consumer Live Activity props match the app's widget (`icon` is `bag` or `calendar`). Rider offers use the Rider app's `rider.offers` Android channel and are time-sensitive on iPhone.
- The CI job runs the function tests with Node 24, the same way as `maps-routes`.

## App contract

Every call is `POST /rest/v1/rpc/<name>` with the app's Supabase session (an account or a guest session).

- On first install, make an installation id (UUID) and a proof (64 lowercase hex characters, random). Keep both in secure storage, per app and environment. Never log tokens or proofs.
- `rpc_native_push_revision(p_installation, p_proof)` → the current revision, or 0 for a new installation (or another account's).
- `rpc_native_push_register(p_installation, p_proof, p_app, p_platform, p_environment, p_token, p_locale, p_alerts, p_expected_revision, p_rider_device?)` → `{ revision, binding }`. `p_app` is `consumer`, `stays` or `rider`. `p_token` is the raw APNs token (hex) or FCM token from `getDevicePushTokenAsync`, not an Expo token. `p_environment` is `sandbox` for development builds and `production` for store builds. `p_alerts` is whether the user allows alerts. The Rider app passes its `rider_device.id` from `rpc_rider_device_register`. SQLSTATE `40001` means the revision moved: read the revision and retry. Call on sign-in, guest-session creation, token change, permission change and once a day in the foreground. An installation not seen for 30 days is retired.
- `rpc_native_push_revoke(p_installation, p_proof, p_expected_revision)` before sign-out. Registering the same installation under another account changes its binding, so late pushes for the old account no longer match.
- `rpc_native_push_watch(p_installation, p_proof, p_binding, p_watch, p_subject, p_subject_id, p_activity_token?)` starts live updates for one record: Consumer `order` (confirmed to arriving) or `booking` (confirmed, from 12 h before), Stays `stay` (held), Rider `job` (assigned). iPhone passes the ActivityKit push token (hex); Android passes none. Call again with the same watch id when the activity token changes. Updates run for up to 12 hours.
- `rpc_native_push_unwatch(p_installation, p_proof, p_binding, p_watch)` when the user ends the activity.

## Payloads

- iPhone alert: `aps.alert {title, body}`, `thread-id`, and `nexg_d8` (the envelope below). Topic is the bundle id: `com.nexg.app`, `com.nexg.stay`, `com.nexg.rider`.
- iPhone live: topic `<bundle id>.push-type.liveactivity`, `aps.event` `update` or `end`, `aps.content-state = { name, props }` where `name` is `NexgConsumerProgress`, `NexgStaysTracking` or `RiderJobActivity` and `props` is the widget's JSON.
- Android: `data.nexg_d8` (JSON string). Alerts also carry `android.notification` on channel `nexg-service-updates` (Consumer, Stays), `delivery-updates` or `rider.offers` (Rider), `visibility PRIVATE`, tag `<subject>:<id>`. Live updates are data only.
- Envelope: `{ version: 1, eventId, installationId, binding, app, surface: alert|live, subject, subjectId, watchId, stage, terminal, expiresAt, deadline, title, body, progress }`. Subjects: `order`, `booking`, `stay`, `ticket`, `job`, `offer`, `disposal`, `payout`, `account`. Compare `eventId` as a decimal string; drop expired or older events; check installation and binding; reload the record before acting.
- The words are fixed per stage (`payload.ts`, English and Swahili). They never carry a code, an address, a price or a name.

## Turning it on (release owner)

1. Apply the migration with the usual release process.
2. Deploy `native-push-dispatch`. Set `D8_DISPATCH_SECRET` (32+ characters) and put the same value in Vault as `native_push_dispatch_secret`, and the function URL as `native_push_dispatch_url`. Leave `D8_DELIVERY_ENABLED` unset until testing.
3. Apple: `D8_APNS_TEAM_ID`, `D8_APNS_KEY_ID`, `D8_APNS_KEY` (the .p8 key with push enabled for the three bundle ids).
4. Firebase: `D8_FCM_PROJECT` (and `D8_FCM_SANDBOX_PROJECT` if a separate test project is used), `D8_FCM_CLIENT_EMAIL`, `D8_FCM_PRIVATE_KEY` (a service account with the messaging sender role). Each project holds the three Android apps.
5. Set `D8_DELIVERY_ENABLED=true` on a test project, try it on signed builds, then production.

Rollback: unschedule `native-push-dispatch`, `native-push-reminders` and `native-push-retention`, drop the `*_native_push` triggers and the `native_push` schema, and drop the `rpc_native_push_*`, `fn_native_push_*` and `cron_native_push_dispatch` functions.

## Not covered

- Booking-engine bookings (`customer_engine_booking`): the engine keeps their state, so the database never sees a change. Needs a webhook from the engine.
- A guest-to-host message for Stays: main has no such table.
- Customer push for "rider assigned": no wording decided; the live activity moves at the next stage.
- Quiet hours stay on the phone.
- Android progress while the app is closed needs a native FCM receiver in each app.

## Proving the credentials before any phone exists (20 November 2026)

`POST /functions/v1/native-push-dispatch` with the header `x-native-push-secret` and the body `{"probe": true}` returns
`{ delivery: "enabled" | "disabled", providers: { fcm, fcm_sandbox, apns } }`, without touching the queue or any phone.

- **FCM:** the probe gets the OAuth token, then sends a `validate_only` message to a made-up token.
  - `credential_ok` means Firebase accepted the credential and refused only the token (HTTP 400 `INVALID_ARGUMENT`).
  - `credential_refused` (401 or 403) means a wrong key or project, or the Cloud Messaging API is off.
- **APNs:** the probe sends to an all-zeros token on the sandbox.
  - `credential_ok` means `BadDeviceToken` (400).
  - `credential_refused` means `InvalidProviderToken` (403).
- **Without the secret:** the call answers 401.
