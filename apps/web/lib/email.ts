import 'server-only';

import { composeEmailHtml, type EmailContent } from '@nexg/contracts/email-design';

/**
 * Sending email.
 *
 * There is no provider account yet. Rather than pretend, this reports
 * `skipped` when the key is absent — and the caller records that against the
 * notification, so the desk can see exactly who has not been told instead of
 * assuming everyone has.
 *
 * Resend is the provider named in .env.example. Swapping it means changing
 * `deliver` and nothing else.
 *
 * Every email goes as plain text and, alongside it, in NexG's email design
 * (@nexg/contracts/email-design) or the design uploaded for its kind in
 * Admin > Settings > Notifications & templates. If the design cannot be
 * drawn the text goes alone; EMAIL_HTML=off sends text only.
 */

export interface SendOutcome {
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string;
  error?: string;
}

const FALLBACK_FROM = process.env.EMAIL_FROM ?? 'NexG Support <info@nexgapp.com>';
const FALLBACK_REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'info@nexgapp.com';

/**
 * The sender for ticket emails comes from Settings > Email routing ("support"),
 * so it can be changed without a deploy. If the lookup fails the environment
 * values above are used, because a missing setting must not stop a reply.
 */
async function senderFor(
  routeKey: string,
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
            replyTo: r.reply_to ?? FALLBACK_REPLY_TO,
            enabled: r.enabled !== false,
          };
        }
      }
    }
  } catch {
    /* fall through to the environment values */
  }
  return { from: FALLBACK_FROM, replyTo: FALLBACK_REPLY_TO, enabled: true };
}

/** The design made live for this kind of email, or null for the house design. */
async function designFor(purpose: string): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    const res = await fetch(`${url}/rest/v1/rpc/rpc_email_design_public`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_purpose: purpose }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const html = (await res.json()) as unknown;
    return typeof html === 'string' && html.length > 0 ? html : null;
  } catch {
    return null;
  }
}

/** The email's HTML, or null to send the plain text alone. */
async function htmlFor(
  subject: string,
  text: string,
  email: { purpose: string; content?: EmailContent },
): Promise<string | null> {
  if (process.env.EMAIL_HTML === 'off') return null;
  const design = await designFor(email.purpose);
  return composeEmailHtml({
    subject,
    text,
    purpose: email.purpose,
    content: email.content,
    design,
  });
}

async function deliver(
  to: string,
  subject: string,
  text: string,
  email: { purpose: string; content?: EmailContent },
): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    return {
      status: 'skipped',
      error: 'No RESEND_API_KEY configured — nothing was sent.',
    };
  }

  const [sender, html] = await Promise.all([senderFor('support'), htmlFor(subject, text, email)]);
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
        ...(html ? { html } : {}),
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

/*
 * Each email is written twice: as plain text, which every inbox can show and
 * which cannot render broken, and as the parts of the designed email.
 */

export function ticketReceived({
  reference,
  name,
  summary,
}: {
  reference: string;
  name: string | null;
  summary: string;
}): { subject: string; text: string; content: EmailContent } {
  const greeting = name ? `Hi ${name},` : 'Hi,';

  return {
    content: {
      title: 'Your support request is with us',
      greeting,
      intro:
        'Thank you for writing to NexG. A person reads every message, and we will reply on the contact details you gave us.',
      rows: [
        ['Reference', reference],
        ['Status', 'Received'],
      ],
      callout: { title: 'What you told us', body: summary },
      closing: `If anything changes in the meantime, reply to this email or write to us again from nexgapp.com/help and mention ${reference}. You will get another email from us the moment this is closed off.`,
      preheader: `Your reference is ${reference}. A person reads every message.`,
    },
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
  content: EmailContent;
} {
  const greeting = name ? `Hi ${name},` : 'Hi,';

  return {
    content: {
      title: 'Your support request is resolved',
      greeting,
      intro: `We have marked ${reference} as resolved.\n\nIf that matches what you expected, there is nothing for you to do. If it does not, if the problem is still there or our answer missed the point, say so and we will reopen it.`,
      rows: [
        ['Reference', reference],
        ['Status', 'Resolved'],
      ],
      closing: `Write to us from nexgapp.com/help and quote ${reference}; you will not have to explain it again from the start.`,
      preheader: `${reference} is resolved. Tell us if it is not.`,
    },
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
  const { subject, text, content } = ticketReceived(parts);
  return deliver(to, subject, text, { purpose: 'support.received', content });
}

export async function sendTicketResolved(
  to: string,
  parts: Parameters<typeof ticketResolved>[0],
): Promise<SendOutcome> {
  const { subject, text, content } = ticketResolved(parts);
  return deliver(to, subject, text, { purpose: 'support.resolved', content });
}

export function stayConfirmed({
  name,
  property,
  unit,
  checkIn,
  checkOut,
  nights,
  paidKes,
  reference,
}: {
  name: string | null;
  property: string;
  unit: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  paidKes: number;
  reference: string;
}): { subject: string; text: string; content: EmailContent } {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const kes = `KES ${paidKes.toLocaleString('en-KE')}`;

  return {
    content: {
      title: 'Your stay is booked',
      greeting,
      intro: 'Your stay is booked and paid.',
      rows: [
        ['Property', `${property} · ${unit}`],
        ['Check in', checkIn],
        ['Check out', checkOut],
        ['Nights', String(nights)],
        ['Paid', `${kes} by M-Pesa`],
        ['Payment reference', reference],
      ],
      closing: `The exact address and how to get in come from your host before you arrive. Food, drinks, laundry and transfers can be ordered to the door through NexG for the whole of your stay.\n\nIf anything needs changing, write to us from nexgapp.com/help and quote ${reference}.`,
      preheader: `${property}, ${checkIn} to ${checkOut}. Paid ${kes}.`,
    },
    subject: `Your stay is booked: ${property}, ${checkIn}`,
    text: `${greeting}

Your stay is booked and paid.

  ${property} · ${unit}
  Check in   ${checkIn}
  Check out  ${checkOut}
  ${nights} night${nights === 1 ? '' : 's'} · paid ${kes} by M-Pesa
  Payment reference ${reference}

The exact address and how to get in come from your host before you arrive.
Food, drinks, laundry and transfers can be ordered to the door through NexG
for the whole of your stay.

If anything needs changing, write to us from nexgapp.com/help and quote
${reference}.

— The NexG concierge desk
`,
  };
}

export async function sendStayConfirmed(
  to: string,
  parts: Parameters<typeof stayConfirmed>[0],
): Promise<SendOutcome> {
  const { subject, text, content } = stayConfirmed(parts);
  return deliver(to, subject, text, { purpose: 'guest.stay_confirmed', content });
}
