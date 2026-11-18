import 'server-only';

/**
 * Sending email.
 *
 * There is no provider account yet. Rather than pretend, this reports
 * `skipped` when the key is absent — and the caller records that against the
 * notification, so the desk can see exactly who has not been told instead of
 * assuming everyone has.
 *
 * Resend is the provider named in .env.example. Swapping it means changing
 * `deliver` and nothing else: the templates below are plain strings.
 */

export interface SendOutcome {
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string;
  error?: string;
}

const FALLBACK_FROM = process.env.EMAIL_FROM ?? 'NexG Support <info@nexgapp.com>';
const FALLBACK_REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'info@nexgapp.com';

/* Finance's sender when Settings > Email routing ("finance") cannot be read. */
const FINANCE_FROM = 'NexG Finance <finance@nexgapp.com>';
const FINANCE_REPLY_TO = 'finance@nexgapp.com';

/**
 * The sender for ticket emails comes from Settings > Email routing ("support"),
 * so it can be changed without a deploy. If the lookup fails the fallback
 * values are used, because a missing setting must not stop a reply.
 */
async function senderFor(
  routeKey: string,
  fallback: { from: string; replyTo: string } = {
    from: FALLBACK_FROM,
    replyTo: FALLBACK_REPLY_TO,
  },
): Promise<{ from: string; replyTo: string; enabled: boolean }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anon) {
      const res = await fetch(`${url}/rest/v1/rpc/rpc_email_route_public`, {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_key: routeKey }),
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        const r = (await res.json()) as {
          from?: string;
          reply_to?: string | null;
          enabled?: boolean;
        } | null;
        if (r?.from) {
          return {
            from: r.from,
            replyTo: r.reply_to ?? fallback.replyTo,
            enabled: r.enabled !== false,
          };
        }
      }
    }
  } catch {
    /* fall through to the fallback values */
  }
  return { ...fallback, enabled: true };
}

async function deliver(to: string, subject: string, text: string): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    return {
      status: 'skipped',
      error: 'No RESEND_API_KEY configured — nothing was sent.',
    };
  }

  const sender = await senderFor('support');
  if (!sender.enabled) {
    return {
      status: 'skipped',
      error: 'Support emails are switched off in Settings > Email routing.',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender.from,
        to: [to],
        reply_to: sender.replyTo,
        subject,
        text,
      }),
      // A slow provider must not hold a guest's form open.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { status: 'failed', error: `${response.status}: ${detail.slice(0, 300)}` };
    }

    const body = (await response.json()) as { id?: string };
    return { status: 'sent', ...(body.id ? { providerMessageId: body.id } : {}) };
  } catch (cause) {
    return { status: 'failed', error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export interface EmailAttachment {
  filename: string;
  /** The file's bytes, or the same already in base64. */
  content: Uint8Array | string;
}

/**
 * An email from Finance, with attachments: a client invoice and its PDF.
 * Sent from Settings > Email routing ("finance"), normally
 * NexG Finance <finance@nexgapp.com>. Like every send here it is `skipped`,
 * not failed, when there is no RESEND_API_KEY, so the console can say email
 * is not set up and offer the download instead.
 */
export async function sendFinanceEmail({
  to,
  cc = [],
  subject,
  text,
  attachments = [],
}: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { status: 'skipped', error: 'No RESEND_API_KEY configured — nothing was sent.' };
  }

  const sender = await senderFor('finance', { from: FINANCE_FROM, replyTo: FINANCE_REPLY_TO });
  if (!sender.enabled) {
    return {
      status: 'skipped',
      error: 'Finance emails are switched off in Settings > Email routing.',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender.from,
        to,
        ...(cc.length ? { cc } : {}),
        reply_to: sender.replyTo,
        subject,
        text,
        ...(attachments.length
          ? {
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content:
                  typeof a.content === 'string'
                    ? a.content
                    : Buffer.from(a.content).toString('base64'),
              })),
            }
          : {}),
      }),
      // An attachment takes longer than a plain reply; still never forever.
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { status: 'failed', error: `${response.status}: ${detail.slice(0, 300)}` };
    }

    const body = (await response.json()) as { id?: string };
    return { status: 'sent', ...(body.id ? { providerMessageId: body.id } : {}) };
  } catch (cause) {
    return { status: 'failed', error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/*
 * Plain text, not HTML. A support acknowledgement read on a phone in a hotel
 * lift does not need a layout, and text cannot render broken.
 */

export function ticketReceived({
  reference,
  name,
  summary,
}: {
  reference: string;
  name: string | null;
  summary: string;
}): { subject: string; text: string } {
  const greeting = name ? `Hi ${name},` : 'Hi,';

  return {
    subject: `We have your message — ${reference}`,
    text: `${greeting}

Thank you for writing to NexG. Your reference is ${reference} — quote it if you call us.

This is what you told us:

  "${summary}"

A person reads every message. We will reply on the contact details you gave
us, and you will get another email from us the moment this is closed off.

If anything changes in the meantime, reply to this message or write to us
again from nexgapp.com/help and mention ${reference}.

— The NexG concierge desk
`,
  };
}

export function ticketResolved({ reference, name }: { reference: string; name: string | null }): {
  subject: string;
  text: string;
} {
  const greeting = name ? `Hi ${name},` : 'Hi,';

  return {
    subject: `Closed off — ${reference}`,
    text: `${greeting}

We have marked ${reference} as resolved.

If that matches what you expected, there is nothing for you to do. If it does
not — if the problem is still there, or our answer missed the point — say so
and we will reopen it. Write to us from nexgapp.com/help and quote ${reference};
you will not have to explain it again from the start.

— The NexG concierge desk
`,
  };
}

export async function sendTicketReceived(
  to: string,
  parts: Parameters<typeof ticketReceived>[0],
): Promise<SendOutcome> {
  const { subject, text } = ticketReceived(parts);
  return deliver(to, subject, text);
}

export async function sendTicketResolved(
  to: string,
  parts: Parameters<typeof ticketResolved>[0],
): Promise<SendOutcome> {
  const { subject, text } = ticketResolved(parts);
  return deliver(to, subject, text);
}
