import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'QR Cards' };
export const dynamic = 'force-dynamic';

interface UnitCard {
  unit_id: string;
  unit_name: string;
  status: string;
  qr_placed: boolean;
  ready_count: number;
  ready_of: number;
}

/**
 * The cards guests scan.
 *
 * One rule is worth repeating on this page: a card is generated
 * only once the host is verified. That is not an arbitrary
 * gate — a card printed before then points at a unit nobody has
 * checked is real, and it would be sitting on a counter with
 * our name on it.
 */
export default async function HostQrPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('unit_readiness_v')
    .select('unit_id, unit_name, status, qr_placed, ready_count, ready_of')
    .eq('host_id', me.id)
    .order('created_at');

  const units = (data as UnitCard[] | null) ?? [];
  const placed = units.filter((u) => u.qr_placed).length;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/qr"
      title="QR Cards"
      lead="One card per unit. A guest scans it, lands on that unit's page, and whatever they order is attributed to you."
      headlineValue={`${placed} / ${units.length}`}
      headlineNote="Cards placed"
    >
      {!live ? (
        <div className="border-gold/40 bg-gold-soft rounded-xl border p-5">
          <p className="text-gold-text text-[0.9375rem] font-extrabold">
            Cards are generated after verification
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
            Once you are verified the pack is built and posted within two working days — card,
            tent, door sticker or key fob.
          </p>
        </div>
      ) : null}

      <div className="border-border bg-surface overflow-x-auto rounded-xl border">
        <table className="w-full text-left">
          <thead className="border-border bg-bg border-b">
            <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Unit state</th>
              <th className="px-4 py-2">Card</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                    No units yet, so no cards.
                  </p>
                </td>
              </tr>
            ) : (
              units.map((u) => (
                <tr
                  key={u.unit_id}
                  className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                >
                  <td className="px-4 py-3 font-extrabold">{u.unit_name}</td>
                  <td className="text-muted px-4 py-3">
                    {u.status.replace('_', ' ')} · {u.ready_count} of {u.ready_of} ready
                  </td>
                  <td className="px-4 py-3">
                    {u.qr_placed ? (
                      <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        Placed
                      </span>
                    ) : live ? (
                      <span className="bg-danger/10 text-danger rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        Not placed — guests cannot order
                      </span>
                    ) : (
                      <span className="bg-bg text-muted rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        After verification
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-muted-light text-[0.75rem] font-semibold leading-[1.7]">
        Generating, printing and marking a card placed are the next piece of this build. The
        concierge desk can send a pack today — Get Help reaches them with your units attached.
      </p>
    </HostSection>
  );
}
