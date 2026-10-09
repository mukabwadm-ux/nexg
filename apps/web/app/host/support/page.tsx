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
import { HostSection, hostContext } from '@/components/host/section';
import { WriteToUs } from '@/components/host/write-client';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

interface TicketRow {
  id: string;
  reference: string;
  topic: string;
  body: string;
  status: string;
  first_reply_at: string | null;
  resolved_at: string | null;
  created_at: string;
  source_form: string | null;
}

const TOPIC: Record<string, string> = {
  order_problem: 'An order went wrong',
  payment_or_refund: 'Payment or refund',
  account: 'My account',
  concierge_request: 'Concierge request',
  partner_rider: 'A rider',
  partner_merchant: 'A merchant',
  hotel_partnership: 'Partnership',
  something_else: 'Something else',
};

/**
 * Host ops, and the record of every time you have asked them
 * something.
 *
 * The response times shown are the ones measured on this
 * account, not a published target. A promise of "under an
 * hour" next to a thread that waited two days is worse than no
 * promise at all.
 */
export default async function HostSupportPage() {
  const { home, live, nav, supabase, photoUrl, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_ticket_v')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = (data as TicketRow[] | null) ?? [];
  const open = rows.filter((t) => t.status !== 'resolved' && t.status !== 'closed');
  const answered = rows.filter((t) => t.first_reply_at !== null);
  const resolved = rows.filter((t) => t.resolved_at !== null);

  const replyTimes = answered
    .map((t) => (new Date(t.first_reply_at as string).getTime() - new Date(t.created_at).getTime()) / 60000)
    .sort((a, b) => a - b);
  const medianReply =
    replyTimes.length >= 3 ? Math.round(replyTimes[Math.floor(replyTimes.length / 2)] as number) : null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/support"
      title="Support"
      lead="Host ops handles anything this portal cannot do yet — scheduling a package, changing a hand-off rule in a hurry, a guest issue that needs a person."
      headlineValue={String(open.length)}
      headlineNote={open.length === 1 ? 'Open thread' : 'Open threads'}
    >
      <KpiRow>
        <Kpi label="Threads" value={String(rows.length)} note="you have opened" />
        <Kpi label="Open" value={String(open.length)} note="with us now" />
        <Kpi label="Resolved" value={String(resolved.length)} note="closed out" tone="good" />
        <Kpi
          label="Median first reply"
          value={
            medianReply === null
              ? DASH
              : medianReply < 60
                ? `${medianReply}m`
                : `${Math.round(medianReply / 60)}h`
          }
          note={
            medianReply === null
              ? `${replyTimes.length} replies — too few`
              : 'measured on your threads'
          }
        />
        <Kpi label="Desk hours" value="7–22" note="daily, Nairobi time" />
        <Kpi label="Out of hours" value="Urgent only" note="a guest with no delivery" />
      </KpiRow>

      <section className="bg-ink rounded-xl p-5 text-white">
        <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Reach host ops</h2>
        <p className="mt-1.5 text-[0.8125rem] font-semibold leading-[1.7] text-white/60">
          One desk, three ways in. Whichever you use, it lands in the same place and shows up in
          the table below — so nothing is lost because it was said on WhatsApp rather than typed
          into a form.
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          <a
            href="https://wa.me/254700000000"
            className="rounded-lg bg-white px-4 py-3 text-center text-[0.8125rem] font-extrabold text-black"
          >
            WhatsApp
          </a>
          <a
            href="tel:+254700000000"
            className="rounded-lg bg-white/10 px-4 py-3 text-center text-[0.8125rem] font-extrabold text-white"
          >
            Call the desk
          </a>
          <WriteToUs hostId={me.id} variant="light" />
        </div>
      </section>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  What host ops can do now
                </h2>
              </div>
              <Fact label="Schedule a package" value="yes" />
              <Fact label="Change a hand-off rule" value="yes" />
              <Fact label="Generate a QR card" value="yes" />
              <Fact label="Reach a rider mid-delivery" value="yes" />
              <Fact label="Refund a guest" value="their bank, not us" />
            </section>

            <HowItWorks title="A guest with no delivery">
              Call, do not write. Out of hours the desk answers a phone and not a form, and a
              guest standing at a gate at eleven is the one case where that difference matters.
            </HowItWorks>

            <HowItWorks title="Why your threads are listed">
              Every route in lands in the same record. A desk that remembers what you asked last
              week is the difference between support and starting again.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Reference', 'Topic', 'Opened', 'First reply', 'Status']}
          empty="You have not needed us yet. When you do, any of the three routes above opens a thread here."
          caption="Threads opened from WhatsApp or a call appear here too, logged by whoever took them."
        >
          {rows.map((t) => (
            <Tr key={t.id}>
              <Td strong note={t.body.slice(0, 64)}>
                {t.reference}
              </Td>
              <Td>{TOPIC[t.topic] ?? t.topic}</Td>
              <Td muted>{when(t.created_at)}</Td>
              <Td muted>{t.first_reply_at ? when(t.first_reply_at) : DASH}</Td>
              <Td>
                {t.status === 'resolved' || t.status === 'closed' ? (
                  <Pill tone="good">Resolved</Pill>
                ) : t.status === 'answered' ? (
                  <Pill tone="info">Answered</Pill>
                ) : t.status === 'assigned' ? (
                  <Pill tone="warn">With an agent</Pill>
                ) : (
                  <Pill tone="warn">Open</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
