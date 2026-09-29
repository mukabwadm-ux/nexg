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

const FROM = process.env.EMAIL_FROM ?? 'NexG <hello@nexgapp.com>';

async function deliver(to: string, subject: string, text: string): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    return {
      status: 'skipped',
      error: 'No RESEND_API_KEY configured — nothing was sent.',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
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
