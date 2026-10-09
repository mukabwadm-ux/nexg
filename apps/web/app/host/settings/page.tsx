import { DASH, when } from '@/components/host/bits';
import { Fact, HowItWorks, Pill, Table, Td, Tr, TwoColumn } from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

interface HostRow {
  kind: string;
  display_name: string | null;
  contact_name: string | null;
  phone: string;
  email: string | null;
  areas: string[] | null;
  tier: string;
  status: string;
  default_handoff: string | null;
  packages_enabled: boolean;
  billing_method: string | null;
  referral_code: string | null;
  listing_link: string | null;
  superhost_claimed: boolean;
  verified_at: string | null;
  went_live_at: string | null;
  created_at: string;
}

interface TeamRow {
  user_id: string;
  role: string;
  units: string[] | null;
  accepted_at: string | null;
  created_at: string;
}

const HANDOFF: Record<string, string> = {
  guest_meets_at_gate: 'Guest meets at gate',
  leave_with_askari: 'Leave with askari',
  lockbox: 'Lockbox',
  call_guest_first: 'Call guest first',
  reception: 'Reception',
  caretaker: 'Caretaker',
};

const BILLING: Record<string, string> = {
  mpesa: 'M-Pesa',
  card_on_file: 'Card on file',
  invoice: 'Invoice, 14 days',
};

/** Masked the same way a guest phone is, for the same reason. */
function maskPhone(p: string | null): string {
  if (!p) return DASH;
  if (p.length <= 6) return '•••';
  return `${p.slice(0, 4)}${'•'.repeat(Math.max(0, p.length - 7))}${p.slice(-2)}`;
}

/**
 * The account, and who can reach it.
 *
 * Changing any of this is a staff action today, and the page
 * says so rather than offering a disabled field. A greyed-out
 * input is an invitation to click it and conclude something is
 * broken; a sentence saying who changes it and how is not.
 */
export default async function HostSettingsPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const [hostRes, teamRes, userRes] = await Promise.all([
    supabase.from('host').select('*').eq('id', me.id).maybeSingle(),
    supabase.from('host_user').select('*').eq('host_id', me.id).order('created_at'),
    supabase.auth.getUser(),
  ]);

  const myUserId = userRes.data.user?.id ?? null;

  const h = hostRes.data as HostRow | null;
  const team = (teamRes.data as TeamRow[] | null) ?? [];
  const pending = team.filter((t) => t.accepted_at === null);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/settings"
      title="Settings"
      lead="Your account, how we reach you, how you are billed and who else can sign in. Most of this is changed by host ops rather than here, and each one says which."
      headlineValue={h?.tier ? h.tier.replace(/_/g, ' ') : DASH}
      headlineNote="Your tier"
    >
      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">Account</h2>
              </div>
              <Fact
                label="Status"
                value={
                  h?.status === 'live' ? (
                    <Pill tone="good">Live</Pill>
                  ) : (
                    <Pill tone="warn">{(h?.status ?? DASH).replace(/_/g, ' ')}</Pill>
                  )
                }
              />
              <Fact label="Verified" value={h?.verified_at ? when(h.verified_at) : 'not yet'} />
              <Fact label="Live since" value={h?.went_live_at ? when(h.went_live_at) : DASH} />
              <Fact label="Joined" value={h ? when(h.created_at) : DASH} />
            </section>

            <HowItWorks title="Why you cannot edit most of this">
              Your phone is the one we verified you on and the one a rider calls; your billing
              method is on an agreement. Changing either is a staff action with a reason recorded
              against it, because a quiet change here is indistinguishable from an account
              takeover.
            </HowItWorks>

            <HowItWorks title="Leaving">
              Ask host ops to close the account and your units stop accepting orders the same
              day. Orders already placed finish; cards already in rooms stop working. Nothing is
              deleted immediately — records we have to keep for tax stay, with you detached.
            </HowItWorks>
          </>
        }
      >
        <section className="border-border bg-surface rounded-xl border">
          <div className="border-border border-b px-4 py-3">
            <h2 className="text-[0.875rem] font-extrabold tracking-tight">Who you are to us</h2>
          </div>
          <Fact label="Display name" value={h?.display_name ?? DASH} />
          <Fact label="Contact" value={h?.contact_name ?? DASH} />
          <Fact label="Phone" value={maskPhone(h?.phone ?? null)} />
          <Fact label="Email" value={h?.email ?? DASH} />
          <Fact
            label="Kind"
            value={(h?.kind ?? DASH).replace(/_/g, ' ')}
          />
          <Fact label="City" value={home.city_name ?? DASH} />
          <Fact
            label="Areas"
            value={h?.areas && h.areas.length > 0 ? h.areas.join(', ') : DASH}
          />
          <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
            Your phone is shown masked even to you. It is the number we verified you on and the
            one a rider calls; a page that prints it in full is a page somebody screenshots.
            Changed by host ops, with a reason recorded.
          </p>
        </section>

        <section className="border-border bg-surface rounded-xl border">
          <div className="border-border border-b px-4 py-3">
            <h2 className="text-[0.875rem] font-extrabold tracking-tight">
              Defaults and billing
            </h2>
          </div>
          <Fact
            label="Default hand-off"
            value={
              h?.default_handoff ? (HANDOFF[h.default_handoff] ?? h.default_handoff) : 'none set'
            }
          />
          <Fact
            label="Welcome packages"
            value={h?.packages_enabled ? 'enabled' : 'not enabled'}
          />
          <Fact
            label="Billing method"
            value={h?.billing_method ? (BILLING[h.billing_method] ?? h.billing_method) : DASH}
          />
          <Fact label="Referral code" value={h?.referral_code ?? 'not issued'} />
          <Fact
            label="Listing"
            value={h?.listing_link ? 'on file' : DASH}
          />
          <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
            The default hand-off applies to a new unit only. Changing it here never rewrites a
            rule you already set on a unit — see Guest Operations for those, which is where a
            rider actually reads them from.
          </p>
        </section>

        <Table
          head={['Member', 'Role', 'Scope', 'Joined']}
          empty="Nobody but you."
          caption="A manager scoped to some units sees only those units everywhere — bookings, deliveries, requests and analytics. Scope is a database rule, not a filter on a page."
        >
          {team.map((t) => (
            <Tr key={t.user_id} tone={t.accepted_at === null ? 'warn' : 'plain'}>
              <Td strong note={t.user_id === myUserId ? 'you' : undefined}>
                {t.user_id === myUserId ? (h?.contact_name ?? 'You') : 'Team member'}
              </Td>
              <Td>
                {t.role === 'owner' ? <Pill tone="gold">Owner</Pill> : <Pill tone="info">Manager</Pill>}
              </Td>
              <Td muted>
                {t.units === null
                  ? 'Every unit'
                  : `${t.units.length} unit${t.units.length === 1 ? '' : 's'}`}
              </Td>
              <Td muted>
                {t.accepted_at ? when(t.accepted_at) : <Pill tone="warn">Invite pending</Pill>}
              </Td>
            </Tr>
          ))}
        </Table>

        {pending.length > 0 ? (
          <div className="border-gold/40 bg-gold-soft rounded-xl border p-4">
            <p className="text-[0.875rem] font-extrabold">
              {pending.length} invitation{pending.length === 1 ? '' : 's'} not yet accepted
            </p>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
              An invitation grants nothing until it is accepted. Until then that person cannot
              sign in and sees none of your units.
            </p>
          </div>
        ) : null}
      </TwoColumn>
    </HostSection>
  );
}
