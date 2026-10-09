import { DASH } from '@/components/host/bits';
import {
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Pill,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import {
  CreatePackage,
  PackageCardActions,
  type PackageForEdit,
} from '@/components/host/package-client';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Packages & Amenities' };
export const dynamic = 'force-dynamic';

interface CatalogueRow {
  id: string;
  name: string;
  description: string | null;
  /* jsonb. Seeded empty today, so the guard below is not
     defensive padding — it is the case that actually renders. */
  items: unknown;
  /* Nullable. The NexG catalogue is seeded without prices in
     some cities, and rendering that as KES 0 reads as free. */
  price: number | null;
  lead_hours: number;
  city_id: string | null;
  sort: number;
  host_id: string | null;
}

interface OrderRow {
  id: string;
  unit_name: string | null;
  package_name: string | null;
  price_kes: number | null;
  lead_hours: number | null;
  for_checkin_at: string;
  status: string;
  has_photo: boolean;
}

/**
 * Welcome packages a host can have placed before a guest arrives.
 *
 * The lead time is on every card and is not decoration: a
 * package ordered four hours before check-in that needs twelve
 * cannot be placed, and discovering that at check-in is worse
 * than being told now. Nothing here can be scheduled inside its
 * own lead time.
 */
export default async function HostPackagesPage() {
  const { home, live, nav, supabase, me, photoUrl } = await hostContext();
  if (!home) return null;

  const [catRes, ordRes, cityRes, unitRes] = await Promise.all([
    /* The table, not `host_package_catalogue_v`: that view
       predates host-owned packages and filters to the NexG
       catalogue, so a host's own would never appear in it. */
    supabase
      .from('welcome_package')
      .select('id, name, description, items, price, lead_hours, city_id, sort, host_id, status')
      .is('archived_at', null)
      .eq('status', 'live')
      .order('sort'),
    supabase
      .from('host_package_order_v')
      .select('*')
      .eq('host_id', me.id)
      .order('for_checkin_at', { ascending: false }),
    supabase.from('host').select('city_id').eq('id', me.id).maybeSingle(),
    supabase.from('host_unit_list_v').select('id, name').eq('host_id', me.id).order('name'),
  ]);

  /* The catalogue is per city, and a host in Nairobi should not
     be offered a Mombasa package they cannot be delivered. A
     package with no city is national and shown to everyone. */
  const cityId = (cityRes.data as { city_id: string | null } | null)?.city_id ?? null;
  const units = (unitRes.data as { id: string; name: string }[] | null) ?? [];
  const allCat = (catRes.data as CatalogueRow[] | null) ?? [];
  /* A host's own packages are theirs wherever they are; NexG
     ones are shown only where we can actually deliver them. */
  const catalogue = allCat.filter(
    (c) => c.host_id === me.id || c.city_id === null || c.city_id === cityId,
  );
  const orders = (ordRes.data as OrderRow[] | null) ?? [];

  const scheduled = orders.filter((o) => o.status === 'scheduled');
  const placed = orders.filter((o) => o.status === 'placed' || o.status === 'delivered');
  const confirmed = orders.filter((o) => o.status === 'photo_confirmed');
  const spentKes = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'scheduled')
    .reduce((a, o) => a + Number(o.price_kes ?? 0), 0);

  const priced = catalogue.filter((c) => c.price !== null);
  const cheapest = priced.length > 0 ? Math.min(...priced.map((c) => Number(c.price))) : null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/packages"
      title="Packages & Amenities"
      lead="Things we can put in a unit before a guest walks in. You pick it, we place it, and a photo goes on the record so you can see it was done."
      headlineValue={String(scheduled.length)}
      headlineNote="Scheduled for arrival"
    >
      <KpiRow>
        <Kpi
          label="Available"
          value={String(catalogue.length)}
          note={home.city_name ? `in ${home.city_name}` : 'in your city'}
        />
        <Kpi
          label="From"
          value={cheapest === null ? DASH : `KES ${cheapest.toLocaleString('en-KE')}`}
          note={priced.length === 0 ? 'none priced yet' : 'cheapest package'}
        />
        <Kpi label="Scheduled" value={String(scheduled.length)} note="not yet billed" />
        <Kpi label="Placed" value={String(placed.length)} note="in the unit" />
        <Kpi
          label="Photo confirmed"
          value={String(confirmed.length)}
          note="proof on file"
          tone="good"
        />
        <Kpi
          label="Spent"
          value={`KES ${spentKes.toLocaleString('en-KE')}`}
          note="on packages placed"
          href="/host/earnings"
        />
      </KpiRow>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">How it works</h2>
              </div>
              <Fact label="You pick" value="a package and a check-in" />
              <Fact label="We place it" value="before the guest arrives" />
              <Fact label="You get" value="a photo on the record" />
              <Fact label="You are billed" value="only once it is placed" />
            </section>

            <HowItWorks title="Lead time">
              Every package has a lead time, and it is the real one — how long it takes to buy,
              assemble and get into a unit across this city on a weekday. A package cannot be
              scheduled inside it. We would rather tell you now than tell a guest at check-in.
            </HowItWorks>

            <section className="bg-ink rounded-xl p-5 text-white">
              <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                Your own packages
              </h2>
              <p className="mt-2 text-[1.0625rem] font-extrabold leading-snug tracking-tight">
                Make one that suits your guests
              </p>
              <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
                Name it, list what goes in, set a price and the lead time you can actually meet.
                A NexG package cannot be edited — it is shared across every host in the city —
                but you can copy one and change your copy.
              </p>
              <div className="mt-4">
                <CreatePackage hostId={me.id} />
              </div>
            </section>
          </>
        }
      >
        <section className="border-border bg-surface rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-[0.875rem] font-extrabold tracking-tight">The catalogue</h2>
              <span className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                {catalogue.length} available ·{' '}
                {catalogue.filter((c) => c.host_id === me.id).length} yours
              </span>
            </div>
            <CreatePackage hostId={me.id} />
          </div>
          {catalogue.length === 0 ? (
            <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
              No packages are available in {home.city_name ?? 'your city'} yet. We list one only
              where we can actually deliver it.
            </p>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {catalogue.map((c) => (
                <article key={c.id} className="border-border rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[0.9375rem] font-extrabold leading-tight tracking-tight">
                      {c.name}
                    </h3>
                    <span className="shrink-0 text-[0.9375rem] font-extrabold tabular-nums">
                      {c.price === null ? (
                        <span className="text-muted-light">Price on request</span>
                      ) : (
                        `KES ${Number(c.price).toLocaleString('en-KE')}`
                      )}
                    </span>
                  </div>
                  {c.description ? (
                    <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.6]">
                      {c.description}
                    </p>
                  ) : null}
                  {Array.isArray(c.items) && c.items.length > 0 ? (
                    <ul className="text-muted-light mt-2.5 space-y-1">
                      {c.items.map((i, n) => (
                        <li key={n} className="text-[0.75rem] font-semibold">
                          · {typeof i === 'string' ? i : JSON.stringify(i)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-muted-light mt-3 text-[0.6875rem] font-extrabold uppercase tracking-wide">
                    {c.lead_hours}h lead time · {c.host_id === me.id ? 'yours' : 'NexG'}
                  </p>
                  <div className="mt-3">
                    <PackageCardActions
                      hostId={me.id}
                      units={units}
                      pkg={{
                        id: c.id,
                        name: c.name,
                        description: c.description,
                        price_kes: c.price === null ? 0 : Number(c.price),
                        lead_hours: c.lead_hours,
                        items: c.items,
                        mine: c.host_id === me.id,
                      } satisfies PackageForEdit}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <Table
          head={['Package', 'Unit', 'For check-in', '>Price', 'Status']}
          empty="Nothing scheduled. Pick a package above and ask host ops to place it."
          caption="A scheduled package can be cancelled free before its lead time starts. After that it has usually been bought."
        >
          {orders.map((o) => (
            <Tr key={o.id}>
              <Td strong>{o.package_name ?? DASH}</Td>
              <Td>{o.unit_name ?? DASH}</Td>
              <Td muted>
                {new Date(o.for_checkin_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  timeZone: 'Africa/Nairobi',
                })}
              </Td>
              <Td right>
                {o.price_kes === null ? DASH : `KES ${Number(o.price_kes).toLocaleString('en-KE')}`}
              </Td>
              <Td>
                {o.status === 'photo_confirmed' ? (
                  <Pill tone="good">Photo confirmed</Pill>
                ) : o.status === 'delivered' ? (
                  <Pill tone="good">Delivered</Pill>
                ) : o.status === 'placed' ? (
                  <Pill tone="info">Placed</Pill>
                ) : o.status === 'cancelled' ? (
                  <Pill tone="plain">Cancelled</Pill>
                ) : (
                  <Pill tone="warn">Scheduled</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
