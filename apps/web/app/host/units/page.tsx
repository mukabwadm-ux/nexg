import { Check, Ring } from '@/components/host/bits';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Units & Rooms' };
export const dynamic = 'force-dynamic';

interface UnitRow {
  unit_id: string;
  unit_name: string;
  status: string;
  handoff: string | null;
  address_done: boolean;
  handoff_done: boolean;
  contact_confirmed: boolean;
  hours_done: boolean;
  qr_placed: boolean;
  ready_count: number;
  ready_of: number;
  caretaker_name: string | null;
  caretaker_confirmed_at: string | null;
  caretaker_token_sent_at: string | null;
}

const HANDOFF: Record<string, string> = {
  guest_meets_at_gate: 'Guest meets at the gate',
  leave_with_askari: 'Leave with the askari',
  lockbox: 'Lockbox',
  call_guest_first: 'Call the guest first',
  reception: 'Reception',
  caretaker: 'Caretaker',
};

const STATUS: Record<string, string> = {
  live: 'bg-success/10 text-success',
  setting_up: 'bg-gold-soft text-gold-text',
  paused: 'bg-warn/10 text-warn',
  archived: 'bg-bg text-muted-light',
};

/**
 * Every unit and how close it is to taking orders.
 *
 * The five readiness flags are shown per unit rather than
 * summed into a percentage, because they are not
 * interchangeable: a unit missing its QR card needs a printer,
 * one missing a caretaker confirmation needs a phone call, and
 * "80%" tells you neither.
 */
export default async function HostUnitsPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('unit_readiness_v')
    .select('*')
    .eq('host_id', me.id)
    .order('created_at');

  const units = (data as UnitRow[] | null) ?? [];
  const ready = units.filter((u) => u.ready_count === u.ready_of).length;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/units"
      title="Units & Rooms"
      lead="Each unit needs five things before a guest can order from it. They are listed separately because they need different people to fix them."
      headlineValue={`${ready} / ${units.length}`}
      headlineNote="Units with all five done"
    >
      {units.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border p-8 text-center">
          <p className="text-[0.9375rem] font-extrabold">No units yet</p>
          <p className="text-muted mx-auto mt-2 max-w-md text-[0.8125rem] font-semibold leading-[1.7]">
            A unit is one flat, room or house a guest can order to. Adding the first one is step
            two of setting up.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {units.map((u) => (
            <section key={u.unit_id} className="border-border bg-surface rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Ring done={u.ready_count} of={u.ready_of} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[1.0625rem] font-extrabold tracking-tight">
                        {u.unit_name}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                          STATUS[u.status] ?? 'bg-bg text-muted'
                        }`}
                      >
                        {u.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
                      {u.handoff ? (HANDOFF[u.handoff] ?? u.handoff) : 'No hand-off rule yet'}
                      {u.caretaker_name ? ` · ${u.caretaker_name}` : ''}
                    </p>
                    {u.caretaker_token_sent_at && !u.caretaker_confirmed_at ? (
                      <p className="text-warn mt-1 text-[0.75rem] font-extrabold">
                        Waiting on the caretaker to confirm by SMS
                      </p>
                    ) : null}
                  </div>
                </div>

                <ul className="min-w-[14rem] space-y-1.5">
                  <Check done={u.address_done} label="Address & pin confirmed" />
                  <Check done={u.handoff_done} label="Hand-off rule set" />
                  <Check
                    done={u.contact_confirmed}
                    label="Person receiving confirmed"
                    note={
                      u.contact_confirmed
                        ? undefined
                        : u.caretaker_token_sent_at
                          ? 'awaiting SMS reply'
                          : 'not asked yet'
                    }
                  />
                  <Check done={u.hours_done} label="Delivery hours set" />
                  <Check
                    done={u.qr_placed}
                    label="QR card placed"
                    note={u.qr_placed ? undefined : 'after verification'}
                  />
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-muted-light text-[0.75rem] font-semibold leading-[1.7]">
        Editing a unit — the address pin, the hand-off rule, the delivery hours — is handled by the
        concierge desk for now; Get Help at the top of this page reaches them with this unit
        attached. The in-portal editor is the next piece of this build.
      </p>
    </HostSection>
  );
}
