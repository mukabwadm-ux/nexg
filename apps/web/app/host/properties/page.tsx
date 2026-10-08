import { DASH } from '@/components/host/bits';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'My Properties' };
export const dynamic = 'force-dynamic';

interface PropertyRow {
  id: string;
  name: string;
  kind: string | null;
  area: string | null;
  listed: boolean | null;
  check_in_from: string | null;
  check_out_by: string | null;
  units: { count: number }[] | null;
}

/**
 * The buildings, as opposed to the units inside them.
 *
 * A host with one flat does not need this distinction; a
 * property manager with forty cannot work without it. So the
 * page is quiet when there is one and useful when there are
 * several, rather than insisting on the structure either way.
 */
export default async function HostPropertiesPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('property')
    .select('id, name, kind, area, listed, check_in_from, check_out_by, units:unit(count)')
    .eq('host_id', me.id)
    .order('created_at');

  const rows = (data as PropertyRow[] | null) ?? [];

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/properties"
      title="My Properties"
      lead="A property is a building or compound. The units inside it each have their own hand-off rule and their own QR card."
      headlineValue={String(rows.length)}
      headlineNote={`Propert${rows.length === 1 ? 'y' : 'ies'} on your account`}
    >
      {rows.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border p-8 text-center">
          <p className="text-[0.9375rem] font-extrabold">No properties grouped yet</p>
          <p className="text-muted mx-auto mt-2 max-w-md text-[0.8125rem] font-semibold leading-[1.7]">
            Your units sit directly against your account, which is fine for a handful. Grouping
            them into properties starts to earn its keep past that.
          </p>
        </div>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-2">Property</th>
                <th className="px-4 py-2">Area</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2">Check-in</th>
                <th className="px-4 py-2">Check-out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="font-extrabold">{p.name}</span>
                    {p.kind ? (
                      <span className="text-muted-light block text-[0.6875rem]">{p.kind}</span>
                    ) : null}
                  </td>
                  <td className="text-muted px-4 py-3">{p.area ?? DASH}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.units?.[0]?.count ?? 0}</td>
                  <td className="text-muted px-4 py-3">{p.check_in_from ?? DASH}</td>
                  <td className="text-muted px-4 py-3">{p.check_out_by ?? DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HostSection>
  );
}
