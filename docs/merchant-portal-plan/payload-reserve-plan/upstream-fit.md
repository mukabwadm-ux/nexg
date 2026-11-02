# Payload Reserve fit and extension plan

Date: 31 October 2026. Status: researched implementation plan. Payload Reserve is the selected booking foundation. The NEXG portal remains the merchant interface, with a NEXG adapter between its business commands and the Payload booking runtime. This document specifies reuse and engineering work; it does not claim that the package is installed, that reservations are live, or that all merchant configurations have passed runtime checks.

## Inspected upstream baseline

- Package: `payload-reserve`, published npm `latest` version **4.4.2**, verified through the [npm registry](https://registry.npmjs.org/payload-reserve/latest).
- Inspected Git main HEAD: **`fd937bdb6222ff469687b6c91bf88e4f262c6f0a`**, obtained with read-only `git ls-remote`; its [package manifest](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/package.json) also identifies version 4.4.2.
- License: [MIT](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/LICENSE). It permits commercial use, modification, distribution and sale, subject to retaining the copyright and permission notice in copies or substantial portions. It provides no warranty. Check dependencies and separately used services under their own licenses and terms.
- Pin the actual production artifact and dependency lockfile at implementation. A mutable `latest` tag or main branch is not a deployment version. Record the package artifact integrity, associated source and NEXG patch revision; verify any difference between the published package and inspected Git snapshot.

## Runtime and portal boundary

The inspected manifest requires `payload`, `@payloadcms/ui` and `@payloadcms/translations` at `^3.86.0`. Its development stack records Next 15.4.11 and React 19.2.1; these development versions describe upstream's environment, not an independently verified compatibility statement for every host. The existing NEXG portal uses Next 14 and React 18. Treat this as a dependency boundary to resolve deliberately.

Run the Payload booking module in a compatible, separately packaged runtime within the NEXG platform and expose it through the NEXG adapter. Preserve the portal's public booking and merchant interfaces, identities and business vocabulary. Do not install Payload admin components directly into the older portal or upgrade the whole portal implicitly. Confirm the supported Payload host and database adapter versions before implementation. This is an architecture boundary, not a request to deploy an additional service now.

The adapter must enforce business, branch, role, configuration revision and booking authority. It translates NEXG commands into permitted reservation operations and returns meaningful results and reasons. Neither a tenant cookie supplied by a client nor a hidden portal button is sufficient authorization. Existing external reservation systems can remain authoritative; their requests must remain pending until that authority confirms them.

## Reuse, configure and extend

| Area | Upstream evidence | NEXG implementation |
| --- | --- | --- |
| Booking records and availability | Services, resources, schedules, reservations and customer records are the core model. | Reuse and bind stable NEXG identities; extend with business/location, versioned offering and policy, fulfilment and authority references. |
| Time-slot appointments | Fixed-duration offerings, buffers and active schedules. | Configure eligible resources and exact offering duration; add intake, lead-time and horizon policy. |
| Rentals and multi-day work | Flexible windows and full-day duration modes. | Extend exact pickup/return, maintenance, overnight and multi-day semantics; enforce bounded duration per offering. |
| Resource combinations | `items[]`, per-item windows, required-resource expansion and capacity checks. | Bind compatible staff/rooms/equipment or vehicles/drivers; preserve one shared resource identity across activities. |
| Capacity | `per-reservation` and `per-guest` counting. | Configure session/space capacity; extend non-person quantity units such as storage area explicitly rather than relabelling guest count. |
| Booking lifecycle | One configured plugin status machine with blocking and terminal states. | Reuse a common allocation lifecycle and maintain NEXG's category-specific work, payment and synchronization states separately. |
| Temporary holds | Opt-in short-lived holds and conversion/release operations. | Add command idempotency, anti-abuse, merchant policy and payment/expiry reconciliation. |
| Merchant calendar | CSS-grid month, week, day, lanes and pending views, exported primitives and component replacements. | Keep a custom NEXG portal and adapt useful patterns. Extend multi-day asset and accessible agenda views where required. No immediate React Big Calendar dependency is selected. |
| Google and other systems | An external-busy resolver accepts locally available intervals. | Build real authorization, synchronization, mapping, freshness, external command support and reconciliation. |
| Money and messages | Lifecycle hooks support application integration. | Implement NEXG price/deposit/payment/refund rules and durable notification/sync processing; examples are not complete services. |

Sources: pinned [booking features](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/booking-features.md), [configuration](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/configuration.md), [status machine](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/status-machine.md) and [admin interface](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/admin-ui.md).

## Defaults that need explicit NEXG treatment

1. **Kenya time.** Set `timezone: 'Africa/Nairobi'` and make it the platform policy for all businesses. The upstream default is UTC and supports tenant overrides. NEXG should not expose a timezone picker or permit an arbitrary tenant override. Preserve correct instants, local dates and external conversions internally.
2. **Duration limits.** `maxFlexibleDuration` defaults to 1,440 minutes. Multi-day rentals and tours need a deliberately bounded ceiling plus offering-specific validation. Upstream day mode ends at 23:59:59; it must not substitute for pickup-to-return intervals or be assumed to implement every overnight promise.
3. **One lifecycle configuration.** The configured status machine and cancellation notice period are plugin-level options. NEXG's different merchant workflows and policies need scoped enforcement around the shared reservation lifecycle. Do not create 128 plugin instances or permit category configuration to grant arbitrary transitions.
4. **Missing schedule and privileged paths.** A resource with no schedule is unconstrained upstream, and public schedule enforcement exempts staff and userless Local API calls. NEXG must enforce completed setup, resource eligibility, permitted overrides and audit on every real command path.
5. **External failures.** `getExternalBusy` catches errors and treats them as no busy intervals. It blocks the entire resource, including all its capacity units. Required external constraints therefore need a NEXG freshness/failure guard and explicit unknown/request-only behavior; pooled external capacity needs a quantity-aware allocation model. A resolver should read synchronized local data rather than make remote calls for each slot.
6. **Guest and hold abuse.** Slot holds are disabled by default; their public endpoint does not require authentication unless configured. Configure allowed guest journeys and hold limits, and apply rate limiting, identity rules and trusted hold expiry.
7. **Idempotency semantics.** The booking endpoint rejects an already-used idempotency key; NEXG must provide a stable operation outcome and lookup/recovery for retries and timeouts, not assume the upstream response replays the prior result.
8. **View limits.** Resource availability queries are capped at 90 days. The upstream lanes view is a selected-day resource timeline, not evidence of a multi-day rental timeline. Respect limits with bounded queries and explicit display coverage.

Sources: pinned [configuration](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/configuration.md), [types](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/src/types.ts), [booking features](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/booking-features.md) and [REST contract](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/rest-api.md).

## Tenancy, transactions and side effects

Resource-owner mode scopes individual ownership; it is not the complete NEXG business/branch/team permission model. The upstream multi-tenant setup requires the reservation plugin before the tenancy plugin and explicit inclusion of all relevant collections. Its documentation warns that omitted collections can remain readable across tenants. NEXG must enforce scope on services, resources, schedules, reservations, customer searches, linked records, exports and background jobs, then verify cross-business rejection.

The pinned README documents a resource `bookingLock` written inside the reservation transaction, adapter requirements and concurrent-booking checks. The pinned `docs/advanced.md` still describes hook-level checks as best effort with potential races. These accounts are inconsistent. Review and verify the pinned implementation's transaction boundaries, all write paths, multi-resource locking and capacity behavior. Treat successful simultaneous final-place and exclusive-resource tests as delivery evidence. Reconciliation must not replace preventing invalid NEXG-controlled confirmations.

Upstream lifecycle callbacks run before transaction commit, including hooks whose names start with `after`. Their names do not promise post-commit delivery. Preserve the reservation transaction and write durable outbox work in that same transaction; only committed work may send notifications, request external writes or initiate money movements. Handle retries and uncertain provider outcomes using stable references and reconciliation. Confirm that failures writing required outbox work abort the booking write; logging an after-hook error is insufficient.

Sources: pinned [README concurrency, tenancy and timing sections](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/README.md), [advanced guidance](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/advanced.md) and [hooks API](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/docs/hooks-api.md).

## Modification policy and completion evidence

Use supported configuration, collection field/access overrides, lifecycle hooks and component replacement slots first. Keep the package's conflict, resource-expansion and lifecycle checks enabled. A caller must never control `skipReservationHooks`, administrative impersonation or other bypass context through ordinary request data.

If a necessary rule cannot be enforced safely through these extension points, maintain a small source-controlled patch or fork pinned to this baseline. Record the changed behavior, upstream issue/reference, regression evidence, merge strategy and license notices. Do not remove safeguards to make one specialty fit. A new upstream release requires review of the patch and relevant contracts before adoption.

Completion requires the NEXG customer and merchant journeys, supported external ownership modes, atomic allocations, exact Kenya date/time behavior, payment and notification recovery, permissions and category-specific rules to work together. Each current subcategory must be mapped to supported behavior and acceptance scenarios; request-only and non-booking activities should retain their appropriate workflows. This document alone establishes neither live operation nor complete category fitness.
