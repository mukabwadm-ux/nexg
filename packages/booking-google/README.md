# Optional Google Calendar adapter

Server-only, dependency-free HTTP adapter for a separate NEXG-created Google calendar. Native NEXG bookings work without this package, Google credentials or a connected account. Google is a projection and optional source of private busy intervals, never the booking authority.

`GoogleCalendarAdapter` accepts server OAuth configuration and injected `fetch`/clock for deterministic testing. `authorizationUrl`, `exchangeCode`, `refreshAccessToken`, `createPortalCalendar`, `upsertBookingEvent`, `deleteBookingEvent` and `readBusyIntervals` are exported with typed inputs. Importing the package performs no network requests and reads no environment variables.

## Connection lifecycle

1. Authenticate the merchant and authorize the business. Mint OAuth state, persist its nonce with the business/user/expiry, then redirect to `authorizationUrl`. Request `calendar.app.created` alone by default. The additional `calendar.freebusy` scope requires explicit merchant opt-in. Persist that consent and the explicitly selected calendar IDs.
2. In the callback, require the same authenticated business and user, verify the HMAC state, atomically consume its nonce, then exchange the code. Never take business IDs, free/busy consent or calendar ownership from untrusted callback query parameters. Confirm the granted scopes before enabling the relevant feature. OAuth consent/client configuration remains a deployment step.
3. Encrypt token objects using a secret-manager 32-byte encryption key and the business/user binding. Store only the authenticated ciphertext. Never expose token records, signing keys, OAuth client secrets or refresh tokens to the browser. Secret rotation must decrypt old records with the corresponding old key and re-encrypt with the new key.
4. Create a secondary calendar once, using the intended merchant Google user's authorization. Persist its returned `PortalCalendarReference`. Calendar creation itself is not idempotent: use a connection provisioning lock/state and repair an uncertain network result before retrying creation. A caller must load the reference from its authorized server-side connection record, rather than accept `createdByNexg` from a client.
5. Publish committed booking events through a durable outbox. Serialize events by booking, retain the highest projected booking revision including cancellation tombstones, and reject stale jobs before calling the adapter. Stable event IDs make insertion retries safe; owned revision checks and Google ETags protect updates. A deleted Google mirror does not cancel a native booking. Reconcile or repair conflicts explicitly.
6. Free/busy checking uses only explicitly selected calendar IDs. Failures, missing calendar results, malformed intervals, rate limits and revoked authorization return `UNKNOWN` with **no intervals**. Callers must apply their configured external-calendar availability policy; `UNKNOWN` cannot mean free. Successful empty results alone return `CURRENT` with an empty interval list. Cache freshness and reservation-time rechecks belong to the booking service.

The adapter projects timed intervals with explicit RFC3339 offsets and the fixed `Africa/Nairobi` display timezone. Model-specific date-only stays, recurrence expansion, booking ownership, holds, capacity, entitlements, payment decisions and cancellation rules remain native engine responsibilities. A booking's `revision` must increase when its projected content changes. Equal revisions are treated as idempotent; an outbox worker must not use different content for the same revision. Default events contain the generic title `NEXG booking`, start/end and opaque booking references, without attendees or customer contact information. No invitations are sent.

HTTP errors are sanitized, do not contain Google response bodies or tokens, and include retry metadata where provided. The adapter does not retry automatically. Durable workers should use bounded exponential backoff with jitter for retryable failures, reconnect on revoked authorization and preserve visible sync errors independently from native booking success.

## Verification and primary references

Mock HTTP tests verify requests, minimal scopes, one-use state, binding, encryption, stable IDs, conditional writes, duplicate insertion races, idempotent deletion, rate limits/revocation and unknown availability. These tests require no credentials and are not a live Google account integration test.

- [Google Calendar authorization scopes](https://developers.google.com/workspace/calendar/api/auth)
- [OAuth web server flow and offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Create secondary calendars](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert)
- [Event insertion and custom IDs](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Conditional writes using ETags](https://developers.google.com/workspace/calendar/api/guides/version-resources)
- [Free/busy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)

Reviewed against official documentation on 2026-10-31. No Google SDK or client code is bundled.
