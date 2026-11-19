import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * Customer bookings keep no contact details (decided 19 Nov 2026).
 *
 * A booking made by a customer (through the public page or the app) is the one
 * that has a private customer token (nexg.customerTokenHash). For those:
 *   - nexg.customer keeps only the name to reserve under, plus `ref`, the
 *     customer's opaque reference, which was already stored as nexg.createdBy;
 *   - Reserve's guest_phone column is emptied and guest_email becomes an
 *     undeliverable placeholder naming the booking (Reserve requires one);
 *   - cached command results for those bookings lose the email and phone.
 * Bookings the shop entered itself are not touched.
 *
 * Data only; no schema change. It cannot be undone: the contact details are
 * gone once this runs.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "reservations"
     SET "guest_email" = 'booking-' || "public_id" || '@guest.nexg.invalid',
         "guest_phone" = NULL,
         "nexg" = jsonb_set("nexg", '{customer}', jsonb_strip_nulls(jsonb_build_object(
                    'name', "nexg"->'customer'->'name',
                    'ref', "nexg"->'createdBy')))
   WHERE "nexg" ? 'customerTokenHash' AND jsonb_typeof("nexg"->'customer') = 'object';

  UPDATE "booking_requests"
     SET "nexg" = jsonb_set("nexg", '{customer}', jsonb_strip_nulls(jsonb_build_object(
                    'name', "nexg"->'customer'->'name',
                    'ref', "nexg"->'createdBy')))
   WHERE "nexg" ? 'customerTokenHash' AND jsonb_typeof("nexg"->'customer') = 'object';

  UPDATE "booking_operations" o
     SET "result" = o."result" #- '{customer,email}' #- '{customer,phone}'
                               #- '{booking,customer,email}' #- '{booking,customer,phone}'
   WHERE coalesce(o."result"->>'id', o."result"->'booking'->>'id') IN (
           SELECT "public_id" FROM "reservations" WHERE "nexg" ? 'customerTokenHash'
           UNION
           SELECT "public_id" FROM "booking_requests" WHERE "nexg" ? 'customerTokenHash');
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // The removed contact details cannot be restored.
}
