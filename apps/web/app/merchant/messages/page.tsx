import { Empty, Panel, ago } from '@/components/partner/bits';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import { markMessagesRead } from '../actions';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

/**
 * Messages.
 *
 * Read on arrival rather than on a button: a badge that only clears
 * when somebody presses something is a badge people learn to ignore.
 *
 * There is no reply box. Nothing drains the notification queue yet,
 * so a reply typed here would sit unread and the merchant would
 * believe they had told us something. The page says where to reach
 * a person instead.
 */
export default async function MerchantMessages() {
  const me = await requireMerchant();
  const supabase = createClient();

  const { data, error } = await supabase
    .from('merchant_message')
    .select('id, direction, channel, subject, body, created_at, read_at')
    .eq('merchant_id', me.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data as Row[] | null) ?? [];
  if (rows.some((r) => r.direction === 'out' && !r.read_at)) {
    await markMessagesRead(me.id);
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your messages could not be read: {error.message}
        </p>
      )}

      <Panel title="Messages" note={rows.length > 0 ? `${rows.length} on file` : undefined}>
        {rows.length === 0 ? (
          <Empty
            title="Nothing here yet."
            body="Anything we need to tell you about your account lands here, and stays."
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((msg) => (
              <li key={msg.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[0.875rem] font-extrabold">
                    {msg.subject ?? (msg.direction === 'out' ? 'From NexG' : 'From you')}
                  </p>
                  <span className="text-muted-light text-[0.6875rem] font-semibold">
                    {msg.direction === 'out' ? 'NexG' : 'You'} · {ago(msg.created_at)}
                  </span>
                </div>
                <p className="text-muted mt-0.5 whitespace-pre-line text-[0.8125rem] font-semibold">
                  {msg.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Reaching a person">
        <p className="text-muted text-[0.8125rem] font-semibold">
          There is no reply box here yet, and one that queued your message without sending it would
          be worse than none. Call or WhatsApp the number on your onboarding email and you will get
          somebody.
        </p>
      </Panel>
    </div>
  );
}

interface Row {
  id: string;
  direction: string;
  channel: string;
  subject: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}
