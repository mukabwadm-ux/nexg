import { loadSetupHours } from '@/app/merchant/setup-hours-actions';
import { LiveAvailability } from '@/components/merchant/availability/live';
import type { DayHours } from '@/components/merchant/availability/model';
import type { HolidayRow } from '@/components/merchant/hours-vocab';
import { weekFromSaved } from '@/components/merchant/availability/saved-hours';
import { profiles } from '@/components/merchant/offerings/model';
import { bookingEngineEnabledForMerchant } from '@/lib/booking/bridge';
import { legacyBookingState, loadBookingBoard } from '@/lib/booking/board-data';
import { loadApplicationView } from '@/lib/merchant-application-load';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Availability' };

export default async function MerchantAvailabilityPage({
  searchParams,
}: {
  searchParams?: { booking?: string };
}) {
  const merchant = await requireMerchant();
  const initialBookingId =
    typeof searchParams?.booking === 'string' && searchParams.booking.length <= 128
      ? searchParams.booking
      : undefined;
  const client = createClient();
  const canEdit = merchant.access.state !== 'legacy' && merchant.access.setup;
  const now = new Date().toISOString();
  const engine =
    bookingEngineEnabledForMerchant(merchant.id, process.env) &&
    (process.env.NODE_ENV !== 'production' ||
      (await legacyBookingState(client, merchant.id)) === 'clear');
  const [saved, application, overrides, readOnlyWeek, board, holidayRes] = await Promise.all([
    canEdit ? loadSetupHours() : null,
    canEdit ? loadApplicationView(client, merchant.id, { includePayout: false }) : null,
    client
      .from('merchant_override_v')
      .select('date,opens,closes,closed')
      .eq('merchant_id', merchant.id)
      .is('branch_id', null),
    canEdit
      ? null
      : client
          .from('merchant_hours')
          .select('day_of_week,closed,opens,closes,updated_at,weekday_convention')
          .eq('merchant_id', merchant.id)
          .is('branch_id', null)
          .eq('service', 'All day'),
    engine ? null : loadBookingBoard(client, merchant.id),
    client.rpc('rpc_merchant_holidays', { p_merchant_id: merchant.id }),
  ]);
  const taggedRows = readOnlyWeek?.data;
  const hasAmbiguousWeek = taggedRows?.some((row) => row.weekday_convention !== 'monday_zero');
  const knownWeek =
    saved?.ok && !saved.value.ambiguous
      ? saved.value
      : taggedRows && !hasAmbiguousWeek
        ? {
            rows: taggedRows.map((row) => ({
              day: row.day_of_week,
              closed: row.closed,
              opens: row.opens,
              closes: row.closes,
              updatedAt: row.updated_at,
            })),
          }
        : null;
  const hours = knownWeek && !overrides.error ? weekFromSaved(knownWeek) : null;
  const dateHours: Record<string, DayHours> = {};
  for (const override of overrides.data ?? []) {
    if (!override.date || (!override.closed && (!override.opens || !override.closes))) continue;
    const weekday = (new Date(`${override.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = override.opens?.slice(0, 5) ?? '';
    const end = override.closes?.slice(0, 5) ?? '';
    dateHours[override.date] = {
      day: weekday,
      state: override.closed ? 'closed' : 'open',
      intervals: override.closed ? [] : [{ start, end, nextDay: end <= start }],
    };
  }
  /* Null when the database has no holiday calendar yet: code goes live
     before its migration is applied by hand. */
  const holidays = holidayRes.error ? null : ((holidayRes.data as HolidayRow[] | null) ?? []);
  /* A holiday the business closes for is a closed date, unless a date
     override already speaks for the day, which wins in the database too. */
  for (const holiday of holidays ?? []) {
    if (holiday.closed !== true || dateHours[holiday.date]) continue;
    dateHours[holiday.date] = {
      day: (new Date(`${holiday.date}T12:00:00Z`).getUTCDay() + 6) % 7,
      state: 'closed',
      intervals: [],
      label: holiday.label,
    };
  }
  return (
    <LiveAvailability
      key={initialBookingId ?? 'availability'}
      initialBookingId={initialBookingId}
      hours={hours}
      dateHours={dateHours}
      now={now}
      activities={
        application?.record.payload.subcategories.map((id) => ({
          id,
          name: profiles.find((profile) => profile.id === id)?.name ?? id,
        })) ?? []
      }
      canEdit={canEdit}
      board={board ?? undefined}
      holidays={holidays}
      legacyHoursHref={merchant.access.state === 'legacy' ? '/merchant/hours' : undefined}
      hoursMessage={
        (saved?.ok && saved.value.ambiguous) || hasAmbiguousWeek
          ? 'The existing weekday format needs review.'
          : 'Shared opening hours could not be loaded here.'
      }
    />
  );
}
