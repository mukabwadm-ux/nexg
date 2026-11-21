# NexG-managed Stays: Booking Engine authority

For a NexG-managed room, Booking Engine owns availability, reservations, and confirmed reservation status. Supabase may authenticate the guest and supply public listing metadata; it is not an alternate occupancy read, Activity source, checkout writer, or failure fallback for that room.

The signed Stays reads in this draft remain synthetic-fixture-only:

- **Search** checks all mapped rooms inside one business scope (optionally one property) in a read-only coherent PostgreSQL snapshot. It returns only available rooms, with an exact search echo and a completeness marker for that business. This is not city-wide or nationwide enumeration. Unknown scope, an invalid binding, or overflow is unavailable, not an empty successful match. The read creates no quote, hold, audit record or outbox item.
- **Activity** reads only the signed-in customer's confirmed engine reservations in that business, using the same verified projector as the single-reservation read. An unpaid hold or a stranger's reservation is never included. No legacy records are re-labelled as engine records.

The app can enrich returned room IDs with public display content. The metadata source cannot add rooms or change prices supplied by the engine. The app must keep independent Activity sources distinct and must not derive trusted merchant scopes from the local checkout journal.

Before any live rollout, establish a trusted complete search scope, reconcile current reservations, and enforce the single-writer switch for the exact room across all old booking paths. The test path does not change any live room or turn on M-Pesa.
