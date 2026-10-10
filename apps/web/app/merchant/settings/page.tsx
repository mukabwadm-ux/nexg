import { Panel, Row } from '@/components/merchant/bits';
import { MerchantSettings } from '@/components/merchant/board-client';
import { Board, PageHead, merchantContext } from '@/components/merchant/frame';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

interface SettingsRow {
  merchant_id: string;
  trading_name: string | null;
  legal_name: string | null;
  category: string | null;
  status: string;
  city_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  phone_verified_at: string | null;
  notification_rules: Record<string, string[]> | null;
  quiet_hours: { from?: string; to?: string } | null;
  accepting_orders: boolean | null;
  payout_rail: string | null;
  health_band: string | null;
}

/** Masked the same way a guest phone is, for the same reason. */
function mask(p: string | null): string {
  if (!p) return '—';
  if (p.length <= 6) return '•••';
  return `${p.slice(0, 4)}${'•'.repeat(Math.max(0, p.length - 7))}${p.slice(-2)}`;
}

/**
 * The account, and who hears about what.
 *
 * The parts staff change are shown with the reason rather than
 * as a greyed-out field. A disabled input invites a click and
 * the conclusion that something is broken; a sentence saying
 * who changes it does not.
 */
export default async function SettingsPage() {
  const { m } = await merchantContext();
  if (!m) return null;

  const { data } = await createClient()
    .from('merchant_settings_v')
    .select('*')
    .eq('merchant_id', m.merchant_id)
    .maybeSingle();

  const s = data as SettingsRow | null;
  if (!s) return null;

  return (
    <Board>
      <PageHead
        title="Settings"
        lead="Your business profile, how you are notified, and your data. Your existing profile and payout details are carried over."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Business profile">
            <Row label="Business name" value={s.trading_name ?? '—'} />
            <Row label="Legal name" value={s.legal_name ?? '—'} />
            <Row label="Category" value={s.category ?? '—'} />
            <Row label="City" value={s.city_name ?? '—'} />
            <Row label="Owner" value={s.contact_name ?? '—'} />
            <Row
              label="Owner phone"
              value={`${mask(s.contact_phone)}${s.phone_verified_at ? ' · verified' : ''}`}
            />
            <Row label="Owner email" value={s.contact_email ?? '—'} />
            <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
              Your phone is shown masked even to you — it is the number we verified you on and
              the one a rider calls, and a page that prints it in full is a page somebody
              screenshots. Changing the name, category or phone is a staff action with a reason
              recorded, because a quiet change here is indistinguishable from an account
              takeover.
            </p>
          </Panel>

          <Panel title="Notifications">
            <div className="p-4">
              <MerchantSettings
                merchantId={m.merchant_id}
                rules={s.notification_rules ?? {}}
                quiet={s.quiet_hours}
              />
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Account">
            <Row
              label="Status"
              value={s.status === 'live' ? 'Live' : s.status.replace(/_/g, ' ')}
            />
            <Row
              label="Accepting orders"
              value={s.accepting_orders ? 'Yes' : 'No'}
              tone={s.accepting_orders ? 'plain' : 'muted'}
            />
            <Row label="Health band" value={s.health_band ?? '—'} />
            <Row label="Payout rail" value={s.payout_rail ?? 'Not set'} />
          </Panel>

          <Panel title="Data & privacy">
            <Row label="What we hold" value="Business, team, catalogue" />
            <Row label="Guest data you see" value="First name only" />
            <Row label="Payment details" value="Never" />
            <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
              You never see a guest&apos;s surname, phone, email or payment details. That is a
              database rule, not a screen rule — the columns are not on anything this portal can
              read, so no future page or export can leak one.
            </p>
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Quiet hours and new orders
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Quiet hours never silence a new order while you are Open. A setting that did would
              cost you the order and the acceptance rate with it — if you do not want orders at
              night, close the hours rather than muting the phone.
            </p>
          </section>
        </aside>
      </div>
    </Board>
  );
}
