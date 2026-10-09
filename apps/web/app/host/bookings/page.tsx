import { DASH, when } from '@/components/host/bits';
import {
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Pill,
  Segmented,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import {
  AddBooking,
  Calendars,
  CancelBooking,
  type CalendarRow,
} from '@/components/host/booking-client';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Bookings & Guests' };
export const dynamic = 'force-dynamic';

interface StayRow {
  id: string;
  unit_name: string | null;
  property_name: string | null;
  guest_first_name: string | null;
  party_adults: number;
  party_children: number;
  check_in: string;
  check_out: string;
  source: string;
  status: string;
  conflict_flagged: boolean;
  phone_masked: string | null;
  stay_rating: number | null;
  stay_review: string | null;
  scans: number;
  orders: number;
  in_stay: boolean;
}

const SOURCE: Record<string, { label: string; tone: 'gold' | 'info' | 'good' | 'plain' }> = {
  airbnb: { label: 'Airbnb', tone: 'gold' },
  booking_com: { label: 'Booking.com', tone: 'info' },
  entered: { label: 'Entered', tone: 'good' },
  ical: { label: 'iCal', tone: 'plain' },
  pms: { label: 'PMS', tone: 'plain' },
  walk_in: { label: 'Walk-in', tone: 'plain' },
};

/**
 * Who is staying where, and when.
 *
 * This is the table that makes attribution possible: an order
 * from a QR card lands in a unit, and only a stay turns that
 * into "Sarah ordered dinner on her third night". Without it
 * the whole card story stops at the door.
 *
 * Guest contact is first name and a masked phone, and that is
 * a schema rule rather than a display one — a calendar sync
 * will offer a full name and an email, and the column to put
 * them in does not exist.
 */
export default async function HostBookingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const [stayRes, unitRes, calRes, propRes] = await Promise.all([
    supabase
      .from('host_stay_v')
      .select('*')
      .eq('host_id', me.id)
      .order('check_in', { ascending: false }),
    supabase
      .from('host_unit_list_v')
      .select('id, name, property_name')
      .eq('host_id', me.id)
      .order('name'),
    supabase.from('calendar_connection_v').select('*').eq('host_id', me.id).order('created_at'),
    supabase.from('host_property_list_v').select('id, name').eq('host_id', me.id),
  ]);

  const all = (stayRes.data as StayRow[] | null) ?? [];
  const units = (unitRes.data as { id: string; name: string; property_name: string | null }[] | null) ?? [];
  const calendars = (calRes.data as CalendarRow[] | null) ?? [];
  const properties = (propRes.data as { id: string; name: string }[] | null) ?? [];
  const tab = searchParams?.tab ?? 'all';

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const isToday = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) === today;

  const inHouse = all.filter((s) => s.in_stay);
  const arrivals = all.filter((s) => isToday(s.check_in));
  const departures = all.filter((s) => isToday(s.check_out));
  const conflicts = all.filter((s) => s.conflict_flagged);
  const reviewed = all.filter((s) => s.stay_rating !== null);

  const rows =
    tab === 'arrivals'
      ? arrivals
      : tab === 'departures'
        ? departures
        : tab === 'in_house'
          ? inHouse
          : all;

  const nights = all.reduce(
    (a, s) =>
      a +
      Math.max(
        1,
        Math.round(
          (new Date(s.check_out).getTime() - new Date(s.check_in).getTime()) / 86400000,
        ),
      ),
    0,
  );

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/bookings"
      title="Bookings & Guests"
      lead="Stays across your properties, entered by you or synced from a calendar. Linking a stay to a unit is what lets an order be attributed to a guest rather than a room."
      headlineValue={String(inHouse.length)}
      headlineNote="Guests in-house"
    >
      <KpiRow>
        <Kpi label="Bookings" value={String(all.length)} note="on this account" />
        <Kpi label="Room nights" value={String(nights)} note="across all stays" />
        <Kpi label="In-house" value={String(inHouse.length)} note="right now" />
        <Kpi
          label="Arrivals today"
          value={String(arrivals.length)}
          note={departures.length > 0 ? `${departures.length} departing` : 'none departing'}
        />
        <Kpi
          label="Orders by guests"
          value={String(all.reduce((a, s) => a + Number(s.orders), 0))}
          note="through your cards"
        />
        <Kpi
          label="Stay rating"
          value={
            reviewed.length >= 3
              ? (reviewed.reduce((a, s) => a + Number(s.stay_rating), 0) / reviewed.length).toFixed(
                  1,
                )
              : DASH
          }
          note={
            reviewed.length < 3
              ? `${reviewed.length} reviews — too few`
              : `${reviewed.length} reviews`
          }
        />
      </KpiRow>

      {conflicts.length > 0 ? (
        <div className="border-danger/40 bg-danger/5 rounded-xl border p-4">
          <p className="text-danger text-[0.875rem] font-extrabold">
            {conflicts.length} booking{conflicts.length === 1 ? '' : 's'} overlap another in the
            same unit
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
            Flagged, not resolved. Two bookings in one unit usually means a calendar sync and a
            host entered the same guest — and guessing which to keep is how a real booking
            disappears.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          base="/host/bookings"
          param="tab"
          current={tab}
          options={[
            { key: 'all', label: 'All', count: all.length },
            { key: 'in_house', label: 'In-house', count: inHouse.length },
            { key: 'arrivals', label: 'Arrivals today', count: arrivals.length },
            { key: 'departures', label: 'Departures today', count: departures.length },
          ]}
        />
        <AddBooking hostId={me.id} units={units} />
      </div>

      <TwoColumn
        rail={
          <>
            <Calendars hostId={me.id} connections={calendars} properties={properties} />

            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  Guest sentiment
                </h2>
              </div>
              {reviewed.length === 0 ? (
                <p className="text-muted-light px-4 py-6 text-center text-[0.75rem] font-semibold">
                  No stay reviews yet.
                </p>
              ) : (
                <>
                  <Fact
                    label="Average"
                    value={
                      reviewed.length >= 3
                        ? `${(
                            reviewed.reduce((a, s) => a + Number(s.stay_rating), 0) /
                            reviewed.length
                          ).toFixed(1)} ★`
                        : 'too few to average'
                    }
                  />
                  <Fact label="Reviews" value={String(reviewed.length)} />
                  <div className="px-4 py-3">
                    <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                      Most recent
                    </p>
                    <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
                      “{reviewed[0]?.stay_review ?? DASH}”
                    </p>
                  </div>
                </>
              )}
            </section>

            <HowItWorks title="What we never import">
              A calendar gives us dates, a unit and sometimes a first name. We do not import a
              guest&apos;s phone, email, ID or payment details, and there is no column to put them
              in. The optional phone on a booking is one you typed, used once to send the QR link.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Guest', 'Unit', 'Dates', 'Source', '>Orders', 'Rating', 'Status', '>Action']}
          empty="No bookings yet. Add one, or connect a calendar once that lands."
          caption="Guests are shown by first name. The phone, when there is one, is masked everywhere including exports."
        >
          {rows.map((s) => {
            const src = SOURCE[s.source] ?? { label: s.source, tone: 'plain' as const };
            return (
              <Tr key={s.id} tone={s.conflict_flagged ? 'danger' : 'plain'}>
                <Td
                  strong
                  note={`${s.party_adults} adult${s.party_adults === 1 ? '' : 's'}${
                    s.party_children > 0 ? ` · ${s.party_children} child` : ''
                  }`}
                >
                  {s.guest_first_name ?? 'Guest'}
                </Td>
                <Td note={s.property_name ?? undefined}>{s.unit_name ?? DASH}</Td>
                <Td>
                  {when(s.check_in)} → {when(s.check_out)}
                </Td>
                <Td>
                  <Pill tone={src.tone}>{src.label}</Pill>
                </Td>
                <Td right>{s.orders}</Td>
                <Td>{s.stay_rating ? `${s.stay_rating} ★` : DASH}</Td>
                <Td>
                  {s.conflict_flagged ? (
                    <Pill tone="danger">Conflict</Pill>
                  ) : s.in_stay ? (
                    <Pill tone="good">In-stay</Pill>
                  ) : s.status === 'departed' ? (
                    <Pill tone="plain">Departed</Pill>
                  ) : (
                    <Pill tone="info">Booked</Pill>
                  )}
                </Td>
                <Td right>
                  {s.status === 'cancelled' ? (
                    <span className="text-muted-light text-[0.6875rem] font-semibold">
                      Cancelled
                    </span>
                  ) : (
                    <CancelBooking stayId={s.id} guest={s.guest_first_name ?? 'this'} />
                  )}
                </Td>
              </Tr>
            );
          })}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
