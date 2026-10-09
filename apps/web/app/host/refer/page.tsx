import { DASH, when } from '@/components/host/bits';
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
import { ReferralLink } from '@/components/host/refer-client';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Refer a Host' };
export const dynamic = 'force-dynamic';

interface ReferralRow {
  id: string;
  code: string;
  referred_area: string | null;
  referred_units: number | null;
  created_at: string;
  live_at: string | null;
  reward_amount_kes: number | null;
  reward_status: string;
  stage: string;
}

/**
 * Hosts you sent us, and what they earned you.
 *
 * The thing deliberately missing is the name. Somebody who
 * followed your link has not agreed to be listed to you, and a
 * table of "people who considered NexG and did not sign up" is
 * a list the referrer should never hold. Area and unit count
 * are enough to recognise your own referral; they are not
 * enough to identify a stranger's.
 */
export default async function HostReferPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const [refRes, hostRes] = await Promise.all([
    supabase
      .from('host_referral_v')
      .select('*')
      .eq('referrer_host_id', me.id)
      .order('created_at', { ascending: false }),
    /* The code lives on the host, not on a referral. Reading it
       from `rows[0]` meant a host with no referrals yet — which
       is everyone, at the point they want the link — was told
       they had no code. */
    supabase.from('host').select('referral_code').eq('id', me.id).maybeSingle(),
  ]);

  const rows = (refRes.data as ReferralRow[] | null) ?? [];
  const code =
    (hostRes.data as { referral_code: string | null } | null)?.referral_code ??
    rows[0]?.code ??
    null;
  const liveOnes = rows.filter((r) => r.live_at !== null);
  const settingUp = rows.filter((r) => r.stage === 'setting up');
  const applied = rows.filter((r) => r.stage === 'applied');

  const credited = rows
    .filter((r) => r.reward_status === 'credited' || r.reward_status === 'paid')
    .reduce((a, r) => a + Number(r.reward_amount_kes ?? 0), 0);
  const pending = rows
    .filter((r) => r.reward_status === 'pending')
    .reduce((a, r) => a + Number(r.reward_amount_kes ?? 0), 0);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/refer"
      title="Refer a Host"
      lead="Send another host our way. When their first unit goes live and takes an order, the reward is credited against your account."
      headlineValue={`KES ${credited.toLocaleString('en-KE')}`}
      headlineNote="Credited to you"
    >
      <KpiRow>
        <Kpi label="Referrals" value={String(rows.length)} note="people who used your link" />
        <Kpi label="Live" value={String(liveOnes.length)} note="taking orders" tone="good" />
        <Kpi label="Setting up" value={String(settingUp.length)} note="signed up, not live" />
        <Kpi label="Applied" value={String(applied.length)} note="form started" />
        <Kpi
          label="Credited"
          value={`KES ${credited.toLocaleString('en-KE')}`}
          note="already yours"
          href="/host/earnings"
        />
        <Kpi
          label="Pending"
          value={`KES ${pending.toLocaleString('en-KE')}`}
          note="waiting on their first order"
          tone={pending > 0 ? 'gold' : 'plain'}
        />
      </KpiRow>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  When a reward lands
                </h2>
              </div>
              <Fact label="They apply" value="nothing yet" />
              <Fact label="They set up" value="nothing yet" />
              <Fact label="First unit live" value="still nothing" />
              <Fact label="First order taken" value="credited" />
              <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
                Deliberately at the last step. A reward on sign-up pays for forms, and a referral
                programme that pays for forms gets filled with forms.
              </p>
            </section>

            <HowItWorks title="What you are not told">
              You see the area and how many units, never the name, the phone or the email. They
              followed a link; they did not agree to be listed to you. If they want you to know
              it went through, they will tell you.
            </HowItWorks>
          </>
        }
      >
        <ReferralLink hostId={me.id} code={code} />

        <Table
          head={['Area', '>Units', 'Started', 'Live', '>Reward', 'Stage']}
          empty="Nobody has used your link yet. It is one line in a WhatsApp group of hosts; that is where most of these come from."
          caption="Names are withheld on purpose. Someone who followed your link has not agreed to be listed to you — area and unit count are enough to recognise a referral you made, and not enough to identify a stranger."
        >
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td strong>{r.referred_area ?? 'Not said yet'}</Td>
              <Td right>{r.referred_units ?? DASH}</Td>
              <Td muted>{when(r.created_at)}</Td>
              <Td muted>{r.live_at ? when(r.live_at) : DASH}</Td>
              <Td right>
                {r.reward_amount_kes === null
                  ? DASH
                  : `KES ${Number(r.reward_amount_kes).toLocaleString('en-KE')}`}
              </Td>
              <Td>
                {r.reward_status === 'credited' || r.reward_status === 'paid' ? (
                  <Pill tone="good">Credited</Pill>
                ) : r.stage === 'live' ? (
                  <Pill tone="info">Live · reward pending</Pill>
                ) : r.stage === 'setting up' ? (
                  <Pill tone="warn">Setting up</Pill>
                ) : (
                  <Pill tone="plain">Applied</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
