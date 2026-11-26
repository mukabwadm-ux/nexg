import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { ReportActions } from '@/components/messaging/report-actions';
import { Empty, ago, clock } from '@/components/messaging/shared';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Chat reports' };
export const dynamic = 'force-dynamic';

const REASON: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  sexual: 'Sexual content',
  violence: 'Violence or threats',
  scam: 'Scam or fraud',
  other: 'Something else',
};

const SIDE: Record<string, string> = {
  member: 'group member',
  guest: 'guest',
  host: 'host',
  nexg: 'NexG',
};

interface SharedCard {
  type?: string;
  title?: string;
  summary?: string;
  snapshot?: unknown;
}

interface Report {
  id: string;
  created_at: string;
  status: 'open' | 'actioned' | 'dismissed';
  context: 'trip_group' | 'stay_chat';
  conversation_id: string;
  subject: string;
  reason: string;
  note: string | null;
  message_id: string | null;
  reporter_name: string;
  reported_name: string;
  reported_side: string;
  reports_about_them: number;
  snapshot: { message_id: string; at: string; body: string | null; links: SharedCard[] | null }[];
  can_remove_message: boolean;
  can_remove_member: boolean;
  is_organiser: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  message_removed: boolean;
  member_removed: boolean;
}

interface ReportsResult {
  reports: Report[];
  counts: { open: number; resolved: number };
}

/**
 * Operate → Messaging → Chat reports.
 *
 * What people reported in trip groups and stay chats (20270330000100), oldest open first, with the reported words as
 * they were. Who may see a report is decided in the database: anyone else reaching this page gets nothing.
 */
export default async function ChatReportsPage({
  searchParams,
}: {
  searchParams?: { status?: string; id?: string };
}) {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'messaging' || m.key === 'hotels')) {
    redirect('/?denied=messaging');
  }
  const status = searchParams?.status === 'resolved' ? 'resolved' : 'open';
  const { data, error } = await createClient().rpc('rpc_chat_reports', {
    p_status: status,
    p_limit: 100,
  });
  const refused = error?.code === '42501';
  const result = (data as unknown as ReportsResult | null) ?? null;
  /* A report opened from the bell goes to the top. */
  const list = [...(result?.reports ?? [])].sort(
    (a, b) => Number(b.id === searchParams?.id) - Number(a.id === searchParams?.id),
  );

  return (
    <ConsoleShell staff={staff} current="messaging">
      <ConsoleHeader
        title="Chat reports"
        breadcrumb="Messages and people reported in trip groups and stay chats · oldest first, so nobody waits"
      />

      <div className="space-y-5 px-4 py-5 sm:px-8">
        <p className="text-[0.8125rem] font-semibold">
          <Link href="/messaging" className="underline">
            Back to the Messaging desk
          </Link>
        </p>

        {refused ? (
          <Empty>Only the Concierge desk and hospitality operations can open chat reports.</Empty>
        ) : error ? (
          <Empty>Chat reports could not be loaded. Refresh to try again.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(['open', 'resolved'] as const).map((key) => (
                <Link
                  key={key}
                  href={`/messaging/reports?status=${key}`}
                  aria-current={key === status ? 'page' : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                    key === status
                      ? 'bg-ink text-white'
                      : 'border-border-strong bg-surface hover:border-ink border'
                  }`}
                >
                  {key === 'open' ? 'Open' : 'Resolved'} · {result?.counts[key] ?? 0}
                </Link>
              ))}
            </div>

            {list.length === 0 ? (
              <Empty>
                {status === 'open' ? 'No report is waiting.' : 'No report has been resolved yet.'}
              </Empty>
            ) : (
              <ul className="max-w-3xl space-y-4">
                {list.map((r) => (
                  <li
                    key={r.id}
                    className={`bg-surface space-y-3 rounded-xl border p-4 ${
                      r.id === searchParams?.id ? 'border-ink' : 'border-border'
                    }`}
                  >
                    <div>
                      <h2 className="text-[0.9375rem] font-extrabold">
                        {REASON[r.reason] ?? r.reason} · {r.reported_name} (
                        {SIDE[r.reported_side] ?? r.reported_side})
                      </h2>
                      <p className="text-muted text-[0.75rem] font-semibold">
                        {r.subject} · reported by {r.reporter_name} {ago(r.created_at)}
                        {r.reports_about_them > 1
                          ? ` · ${r.reports_about_them} reports about this person`
                          : ''}
                      </p>
                      {r.context === 'stay_chat' ? (
                        <Link
                          href={`/messaging/stays?chip=all&id=${r.conversation_id}`}
                          className="text-[0.75rem] font-extrabold underline"
                        >
                          Open the stay chat
                        </Link>
                      ) : null}
                    </div>

                    {r.note ? (
                      <p className="whitespace-pre-wrap text-[0.8125rem] font-semibold">
                        “{r.note}”
                      </p>
                    ) : null}

                    <div>
                      <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                        {r.message_id ? 'The reported message' : 'Their latest messages'}
                      </p>
                      {r.snapshot.length === 0 ? (
                        <p className="text-muted text-[0.75rem] font-semibold">
                          They had written nothing here.
                        </p>
                      ) : (
                        <ol className="mt-1 space-y-1.5">
                          {r.snapshot.map((m) => (
                            <li
                              key={m.message_id}
                              className="bg-bg rounded-lg px-3 py-2 text-[0.8125rem] font-semibold"
                            >
                              <p className="text-muted-light text-[0.6875rem]">{clock(m.at)}</p>
                              {m.body ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
                              {(m.links ?? []).map((card, i) => (
                                <p key={i} className="whitespace-pre-wrap">
                                  Shared {card.type}: {card.title}
                                  {card.summary ? `. ${card.summary}` : ''}
                                  {card.snapshot ? ` ${JSON.stringify(card.snapshot)}` : ''}
                                </p>
                              ))}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>

                    {r.status === 'open' ? (
                      <ReportActions
                        id={r.id}
                        canRemoveMessage={r.can_remove_message}
                        canRemoveMember={r.can_remove_member}
                        isOrganiser={r.is_organiser}
                      />
                    ) : (
                      <p className="border-border text-muted border-t pt-3 text-[0.75rem] font-semibold">
                        {r.status === 'dismissed' ? 'Dismissed' : 'Resolved'}
                        {r.resolved_by ? ` by ${r.resolved_by}` : ''}
                        {r.resolved_at ? ` ${ago(r.resolved_at)}` : ''}
                        {r.message_removed ? ' · message removed' : ''}
                        {r.member_removed ? ' · removed from the group' : ''}
                        {r.resolution_note ? ` · ${r.resolution_note}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </ConsoleShell>
  );
}
