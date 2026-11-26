import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
ALTER TABLE public.booking_sessions ADD COLUMN movies jsonb;
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_movies_v1_shape
CHECK (movies IS NULL OR (
  jsonb_typeof(movies) = 'object'
  AND movies -> 'contractVersion' = '1'::jsonb
  AND jsonb_typeof(movies -> 'filmId') = 'string'
  AND jsonb_typeof(movies -> 'merchantId') = 'string'
  AND jsonb_typeof(movies -> 'showingId') = 'string'
  AND jsonb_typeof(movies -> 'screenId') = 'string'
  AND jsonb_typeof(movies -> 'pricesMinor') = 'object'
  AND CASE WHEN jsonb_typeof(movies -> 'seats') = 'array'
    THEN jsonb_array_length(movies -> 'seats') BETWEEN 1 AND 5000 ELSE false END
) IS TRUE);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $block$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.booking_sessions WHERE movies IS NOT NULL) THEN
        RAISE EXCEPTION 'Archive or migrate the Movies occurrence data before dropping its column.';
      END IF;
    END;
    $block$;
    ALTER TABLE public.booking_sessions DROP COLUMN movies;
  `);
}
