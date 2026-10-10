import { Panel, Row, Tile } from '@/components/merchant/bits';
import { MerchantPage, merchantContext } from '@/components/merchant/frame';
import { CloseEarly, CopyHours, HoursSlot } from '@/components/merchant/hours-client';
import { DAYS, hhmm, type HoursRow } from '@/components/merchant/hours-vocab';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Hours' };
export const dynamic = 'force-dynamic';

interface OverrideRow {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  date: string;
  opens: string | null;
  closes: string | null;
  closed: boolean;
  reason: string | null;
  active_today: boolean;
  past: boolean;
}

/**
 * When guests can order from each branch.
 *
 * The grid is the page. Everything else — overrides, busy
 * presets, the other branches — is context for the one
 * question a merchant opens this to answer, which is "are we
 * shown as open right now".
 */
export default async function HoursPage({
  searchParams,
}: {
  searchParams?: { branch?: string };
}) {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  const supabase = createClient();
  const [hoursRes, overrideRes, branchRes] = await Promise.all([
    supabase.from('merchant_hours_v').select('*').eq('merchant_id', m.merchant_id),
    supabase
      .from('merchant_override_v')
      .select('*')
      .eq('merchant_id', m.merchant_id)
      .order('date'),
    supabase
      .from('merchant_branch_list_v')
      .select('id, name, state, paused_at')
      .eq('merchant_id', m.merchant_id)
      .order('is_primary', { ascending: false }),
  ]);

  const allHours = (hoursRes.data as HoursRow[] | null) ?? [];
  const overrides = (overrideRes.data as OverrideRow[] | null) ?? [];
  const branches =
    (branchRes.data as { id: string; name: string; state: string; paused_at: string | null }[] | null) ??
    [];

  /* Null branch means the shared week. A merchant with one set
     of hours keeps them there, which is why it is the default
     rather than "the first branch". */
  const branchId = searchParams?.branch ?? null;
  const rows = allHours.filter((h) => h.branch_id === branchId);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? 'All branches';

  /* The services actually in use, plus the three the board
     draws, so an empty week still has rows to click. */
  const services = [
    ...new Set([...rows.map((r) => r.service), 'Breakfast', 'Lunch', 'Dinner']),
  ].slice(0, 6);

  const at = (day: number, service: string) =>
    rows.find((r) => r.day_of_week === day && r.service === service);

  const openHours = rows
    .filter((r) => !r.closed && r.opens && r.closes)
    .reduce((a, r) => {
      const o = Number(r.opens!.slice(0, 2)) * 60 + Number(r.opens!.slice(3, 5));
      const c = Number(r.closes!.slice(0, 2)) * 60 + Number(r.closes!.slice(3, 5));
      return a + Math.max(0, c - o);
    }, 0);

  const thisWeek = overrides.filter((o) => !o.past);
  const activeToday = overrides.find((o) => o.active_today);
  const nextHoliday = thisWeek.find((o) => o.reason?.toLowerCase().includes('holiday'));

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/hours"
      title="Hours"
      lead="When guests can order from each branch. Carried over from your current listing; Nairobi public holidays follow the city default unless you override them."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Open now"
          value={m.accepting_orders ? 'Yes' : 'No'}
          note={m.accepting_orders ? 'taking orders' : 'not accepting'}
          noteTone={m.accepting_orders ? "good" : "danger"}
        />
        <Tile
          label="Weekly open hours"
          value={openHours > 0 ? `${Math.round(openHours / 60)} h` : '—'}
          note={`across ${new Set(rows.map((r) => r.service)).size || 0} service(s)`}
        />
        <Tile
          label="Overrides this week"
          value={String(thisWeek.length)}
          note={activeToday ? `${hhmm(activeToday.closes)} today` : 'none active'}
          noteTone={activeToday ? "gold" : "plain"}
        />
        <Tile
          label="Next holiday"
          value={nextHoliday ? nextHoliday.date.slice(5) : '—'}
          note={nextHoliday?.reason ?? 'none scheduled'}
        />
        <Tile label="Guests see" value={m.accepting_orders ? 'Open' : 'Closed'} note="from live state" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="border-border-strong bg-bg flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
          <a
            href="/merchant/hours"
            aria-current={branchId === null ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold ${
              branchId === null ? 'bg-ink text-white' : 'text-muted hover:text-ink'
            }`}
          >
            All branches
          </a>
          {branches.map((b) => (
            <a
              key={b.id}
              href={`/merchant/hours?branch=${b.id}`}
              aria-current={branchId === b.id ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold ${
                branchId === b.id ? 'bg-ink text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {b.name}
            </a>
          ))}
        </div>
        <CloseEarly merchantId={m.merchant_id} branchId={branchId} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title={`Weekly hours · ${branchName}`}>
            <div className="overflow-x-auto p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                    <th className="w-24 px-1 pb-2 text-left">Service</th>
                    {DAYS.map((d) => (
                      <th key={d} className="px-1 pb-2 text-center">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => (
                    <tr key={svc}>
                      <td className="px-1 py-1 text-[0.8125rem] font-extrabold">{svc}</td>
                      {DAYS.map((_, day) => (
                        <td key={day} className="px-1 py-1">
                          <HoursSlot
                            merchantId={m.merchant_id}
                            branchId={branchId}
                            day={day}
                            service={svc}
                            row={at(day, svc)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              Click a slot to edit. Services can overlap; guests see one open window per day. Last
              orders are taken 20 minutes before close.
            </p>
          </Panel>

          <Panel title="Overrides & holidays">
            {overrides.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                None set. Public holidays follow the city default until you override one.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Hours</th>
                      <th className="px-4 py-2">Reason</th>
                      <th className="px-4 py-2">Branch</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((o) => (
                      <tr
                        key={o.id}
                        className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                          o.active_today ? 'bg-warning-bg/50' : o.past ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-extrabold">{o.date}</td>
                        <td className="text-muted px-4 py-2.5">
                          {o.closed ? 'Closed' : `until ${hhmm(o.closes)}`}
                        </td>
                        <td className="text-muted px-4 py-2.5">{o.reason ?? '—'}</td>
                        <td className="text-muted px-4 py-2.5">
                          {o.branch_name ?? 'All'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                              o.active_today
                                ? 'bg-warning-bg text-warning'
                                : o.past
                                  ? 'bg-bg text-muted-light'
                                  : 'bg-info-bg text-info'
                            }`}
                          >
                            {o.active_today ? 'Active today' : o.past ? 'Past' : 'Scheduled'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Busy mode presets">
            <p className="text-muted px-4 py-3 text-[0.75rem] font-semibold leading-[1.65]">
              Busy adds prep minutes without closing. It ends automatically and shows on the
              dashboard control — use it when the kitchen is full rather than letting orders time
              out, which costs you acceptance.
            </p>
            <Row label="Presets" value="15 · 30 · 45 min" />
          </Panel>

          <Panel title="Other branches">
            {branches.length <= 1 ? (
              <p className="text-muted-light px-4 py-5 text-center text-[0.75rem] font-semibold">
                One branch, so nothing to copy to.
              </p>
            ) : (
              <>
                {branches
                  .filter((b) => b.id !== branchId)
                  .map((b) => {
                    const has = allHours.some((h) => h.branch_id === b.id);
                    return (
                      <Row
                        key={b.id}
                        label={b.name}
                        value={has ? 'Hours set' : 'Hours not set'}
                        tone={has ? 'plain' : 'muted'}
                      />
                    );
                  })}
                <div className="border-border border-t p-4">
                  <CopyHours
                    merchantId={m.merchant_id}
                    fromBranch={branchId}
                    branches={branches.filter((b) => b.id !== branchId)}
                  />
                </div>
              </>
            )}
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Hours are not the same as open
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              These say when guests <em>can</em> order. Whether you are taking orders right now is
              the Open / Busy / Paused control at the top — a branch inside its hours but paused
              shows as closed, and that is the setting people forget.
            </p>
          </section>
        </aside>
      </div>
    </MerchantPage>
  );
}
