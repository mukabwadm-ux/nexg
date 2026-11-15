# D8 native notifications plan and handoff

The [D8 decision in the shared-services handoff](https://github.com/mukabwadm-ux/nexg/pull/146#issuecomment-6891769426) covers Consumer, Stays and Rider. This change follows current main. [PR #148](https://github.com/mukabwadm-ux/nexg/pull/148) proposes native Stays checkout, [PR #149](https://github.com/mukabwadm-ux/nexg/pull/149) carries Maps, and [PR #150](https://github.com/mukabwadm-ux/nexg/pull/150) carries consented courier sharing. D8 consumes confirmed lifecycle states without depending on courier observations or unmerged checkout routes.

| Area                                | Decision                                                                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective and scope                 | Deliver native alerts and updates to an explicitly tracked activity. Cover Consumer orders, Stays guest checkout holds and reservations, and Rider dispatch offers and assigned jobs.                                                                                   |
| Producers and boundaries            | Observe the existing order, stay and dispatch transitions in the same transaction. Keep the account inbox, browser VAPID sender and operational state machines intact. Host tasks, airport driver states and live Explore changes need verified producers.              |
| Persistence and events              | Store installations, one active watch per installation, and per-device deliveries in a private schema. Use ordered revisions for replaceable streams. Push carries a bounded versioned reference and safe copy.                                                         |
| API and commands                    | Authenticated PostgREST RPCs use one installation ID and proof, explicit binding revision, and audited register, revoke, watch and unwatch operations. Only the service role claims and settles deliveries.                                                             |
| Authorization and offline           | Derive the account from auth. Use ownership and Rider job-device/assignment checks. Reject anonymous sessions. The app revalidates a target after a tap. Loading an earlier local snapshot never asserts current delivery or acceptance.                                |
| Device integration                  | APNs app tokens and per-activity tokens are separate. FCM sends data for native progress. Signed builds, provider credentials and app adapters are required to verify delivery.                                                                                         |
| Failure, security and observability | Expire old events, bound retries and claims, replace superseded revisions, recheck live targets, and retire only the provider-rejected token. Logs and audit fields omit tokens and private details.                                                                    |
| Migration and rollback              | Reserve a migration number after #150. Apply schema before scheduling the disabled worker. To roll back, disable the worker, unschedule delivery, and revoke client entry points as needed. Existing local reminders and inbox delivery still function.                 |
| Verification and acceptance         | Isolated SQL checks cover scope, ordering and lifecycle. Inject provider responses for send, retry, invalid token and expiry. Regenerate database types. Verify all three apps on signed devices before enabling production.                                            |
| Ownership and exit                  | Shared release owners configure provider secrets and delivery. Each app owner binds the same versioned contract. D8 production acceptance includes successful background delivery and end on both platforms, permission denial, account switches and device retirement. |

## App contract

All RPC arguments and the delivery envelope are documented below. Provider credentials are server-side. The default deployment leaves delivery disabled.

### Registration and sign-out

Use the signed-in user's Supabase session for each `POST /rest/v1/rpc/<command>`. A caller supplies its app identity, never the account or role. Generate an opaque UUID and 32 bytes of cryptographically random proof on first install. Store the ID and lowercase hex proof in platform secure storage, distinct for each app and environment. Tokens, proofs and credentials must stay out of logs.

- `rpc_native_push_revision(p_installation, p_proof)` returns the current revision or zero for a new installation. Call it after an interrupted registration or rotation.
- `rpc_native_push_register(p_installation, p_proof, p_app, p_platform, p_environment, p_token, p_locale, p_alerts, p_expected_revision, p_rider_device?)` returns `{ revision, binding }`. Send a native APNs or FCM token from the signed build. Pass `consumer`, `stays` or `rider`, `ios` or `android`, `sandbox` or `production`, and `en` or `sw`. Report the user's service alert preference with `p_alerts`. Rider supplies the verified `rider_device.id` from its existing session. A stale changed write returns SQLSTATE `40001`. Reload and retry against the same intended account. Identical retries reuse the binding.
- `rpc_native_push_revoke(p_installation, p_proof, p_expected_revision)` removes the binding's permission to send. Call it before dropping authentication on sign-out or OS permission revocation. Clear the local activity, local binding and notification UI immediately. Retry a failed revoke when the authorized account reconnects. Registration with the same proof changes the binding on account switch, so the app rejects delayed deliveries from the old account.
- Refresh registrations on sign-in, permission or preference changes, token rotation and periodic foreground refresh. An inactive registration retires after 30 days. Supabase errors return the existing PostgREST envelope. The proof-based lookup only returns a revision.

### Live activity

Start through the app's existing track action. Allocate a new watch UUID per tracked activity. `rpc_native_push_watch(p_installation, p_proof, p_binding, p_watch, p_subject, p_subject_id, p_activity_token?)` accepts the owning Consumer order, active Stays guest hold or current Rider assignment. Bind an iOS ActivityKit token from `getPushToken()` or `addPushTokenListener`, and repeat with the same watch UUID when that token rotates. Android uses the installation's FCM token and omits `p_activity_token`. Registration queues the current verified state and schedules updates for up to 12 hours. The app can render its authorized snapshot while it waits for delivery. `rpc_native_push_unwatch(p_installation, p_proof, p_binding, p_watch)` ends delivery when the user closes or replaces that activity. End the local OS activity as well.

APNs Live Activity updates use the app bundle ID plus `.push-type.liveactivity` and the existing Expo Widgets state representation. They update or end a running watch. This version uses user-initiated start. The platform eventually removes expired or dismissed activities. [Apple ActivityKit](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications) · [Expo Widgets setup](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/)

### Android receiver and tap contract

Plain push carries a `nexg_d8` reference on APNs, or a JSON-encoded `data.nexg_d8` on FCM. FCM live updates carry data only. A native receiver can update a current progress notification when the React Native screen is absent. Have a single receiver for FCM and delegate other message formats to the existing handler. Create `nexg-service-updates` for Consumer and Stays before registration and use Rider's existing `delivery-updates` channel.

```json
{
  "version": 1,
  "eventId": "108",
  "installationId": "d8000000-0000-7000-8000-000000000001",
  "binding": 2,
  "app": "consumer",
  "surface": "live",
  "subject": "order",
  "subjectId": "d8000000-0000-7000-8000-000000000002",
  "watchId": "d8000000-0000-7000-8000-000000000003",
  "stage": "picked_up",
  "terminal": false,
  "expiresAt": "2026-11-15T09:15:00Z",
  "deadline": null,
  "title": "Your rider has your order",
  "body": "Open NexG for details.",
  "progress": 65
}
```

Match the message to the persisted app, installation, binding, watch and subject. Compare `eventId` as an unsigned decimal string so long IDs retain ordering. Discard expired or out-of-order messages. Update the existing native notification for the same watch, and remove it on `terminal`. Android 16 promotion depends on eligibility and OS settings. Keep the shade progress fallback. Resolve the authenticated record before opening a notification or taking any action. [FCM Android receiving](https://firebase.google.com/docs/cloud-messaging/android/receive-messages) · [Android Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update)

### Activation and remaining app work

1. Apply the migration to the intended project using the existing Supabase release process.
2. Deploy `native-push-dispatch` with its custom secret check and leave `D8_DELIVERY_ENABLED` off until testing is ready. Configure `D8_DISPATCH_SECRET` and the matching Vault `native_push_dispatch_secret`, plus `native_push_dispatch_url` for this project's Edge Function. The 5-second scheduler skips requests when either Vault entry is absent. The worker uses normal Supabase service-role credentials.
3. Configure `D8_APNS_TEAM_ID`, `D8_APNS_KEY_ID` and `D8_APNS_KEY` for the three existing bundle IDs. Configure `D8_FCM_CLIENT_EMAIL` and `D8_FCM_PRIVATE_KEY` with the send role on `D8_FCM_PROJECT` and `D8_FCM_SANDBOX_PROJECT`. Each Firebase project must contain the three Android app IDs used in that environment. The deployment can provision one platform at a time. Missing provider configuration is a retryable result until the item's deadline.
4. Bind the contract in each app's signed build. Enable the iOS app's push entitlement and Expo Widgets token support, wire the Android FCM receiver to the existing progress notification, and use real permissions and a verified app session. Coordinate Rider's production identity and job-device binding with its owner. Incoming lifecycle changes come from the backend, while locally scheduled plan/stay reminders still run on the phone.
5. Enable the sender in the test project and exercise ordinary alerts, updates and terminal events while foregrounded and backgrounded. Also check stale offers, denied permissions, sign-out, token rotation, a fresh install and classic Android shade progress. Attach signed-build/device evidence before production activation.

This branch covers the backend and payload contract. Signed builds, provider credentials, app integration and physical-device acceptance remain release work. Host turnover, airport/Explore events and any remaining catalogue entries require their verified source events. [D8 developer handoff on #146](https://github.com/mukabwadm-ux/nexg/pull/146#issuecomment-6891769426) · [Pointer on #150](https://github.com/mukabwadm-ux/nexg/pull/150#issuecomment-6891801194)
