import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Order to this door',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

const SCAN_HEADER = 'x-nxg-scan';

interface Resolved {
  ok: boolean;
  reason?: string;
  message?: string;
  kind?: string;
  label?: string;
  placement?: string;
  context?: Record<string, unknown> | null;
}

/**
 * Where a scan lands.
 *
 * This is the only page in NexG a complete stranger reaches by
 * pointing a camera at a piece of card, so three things matter more
 * here than anywhere else:
 *
 *   · It must render on a mid-range Android on 3G. The scan was
 *     already resolved in middleware, so this page makes no database
 *     call of its own, loads no map, and has nothing to fetch before
 *     it can paint.
 *   · It must say what was recorded, in one line, without a banner
 *     anybody has to dismiss. A notice you can dismiss is one most
 *     people dismiss without reading.
 *   · It must be useful when the answer is no. A paused unit, a
 *     replaced card, a code that is not ours and a database that
 *     cannot be reached each get a page that says what to do
 *     instead — because the alternative is somebody standing in a
 *     kitchen holding a dead link.
 */
export default function ScanPage() {
  const raw = headers().get(SCAN_HEADER);

  /* Base64 — see the note in middleware.ts: a header is latin-1 and
     this payload carries real typography. */
  let r: Resolved = { ok: false, reason: 'unavailable' };
  try {
    if (raw) r = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Resolved;
  } catch {
    r = { ok: false, reason: 'unavailable' };
  }

  if (!r.ok) {
    const copy: Record<string, { title: string; body: string }> = {
      paused: {
        title: 'This place isn’t taking orders right now.',
        body:
          r.message ??
          'Your host has paused it. You can still order to any other address.',
      },
      replaced: {
        title: 'This card has been replaced.',
        body: r.message ?? 'Ask your host for the new card — or order to any address below.',
      },
      busy: {
        title: 'One moment.',
        body: 'This card is unusually busy. Try again in a few seconds.',
      },
      unavailable: {
        title: 'We couldn’t read that card just now.',
        body: 'Something on our side, not yours. Try again, or order to any address below.',
      },
      not_found: {
        title: 'That code isn’t one of ours.',
        body: 'Check the card — the code is six characters after NXG-. You can still order to any address.',
      },
    };
    const c = copy[r.reason ?? 'not_found'] ?? copy.not_found!;
    return (
      <Shell>
        <Outcome title={c.title} body={c.body} label={r.label} />
      </Shell>
    );
  }

  const ctx = (r.context ?? {}) as Record<string, unknown>;
  const hours = ctx.delivery_hours as { from?: string; to?: string } | null;
  const handoff = ctx.handoff_sentence as string | undefined;
  const chargeToRoom = ctx.charge_to_room === true;
  const hotelName = ctx.hotel_name as string | undefined;
  const areaNote = ctx.delivery_point_note as string | undefined;

  return (
    <Shell>
      <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
        Ordering to
      </p>
      <h1 className="mt-2 text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">
        {r.label}
      </h1>
      {hotelName && <p className="text-muted mt-1 text-[0.875rem] font-bold">{hotelName}</p>}

      <Card className="mt-5 p-5">
        <dl className="space-y-3 text-[0.875rem]">
          <Row
            label="Delivery window"
            value={
              hours?.from && hours?.to
                ? `${hours.from}–${hours.to}`
                : 'Any time we have someone on'
            }
          />
          {handoff && <Row label="Your host’s hand-off" value={handoff} />}
          {areaNote && <Row label="Where to meet" value={areaNote} />}
          {chargeToRoom && <Row label="Payment" value="Charge to your room is available" />}
        </dl>
        <p className="text-muted-light mt-4 text-[0.75rem] font-semibold leading-[1.7]">
          The address and the hand-off rule are already set. You won’t have to type them.
        </p>
      </Card>

      <Link
        href="/explore"
        className="bg-ink mt-5 block rounded-xl px-5 py-4 text-center text-[0.9375rem] font-extrabold text-white"
      >
        See what’s open nearby
      </Link>

      <Link
        href="/concierge"
        className="border-border mt-3 block rounded-xl border bg-white px-5 py-4 text-center text-[0.875rem] font-extrabold"
      >
        Ask a concierge for something specific
      </Link>

      <p className="text-muted-light mt-6 text-[0.75rem] font-semibold leading-[1.7]">
        We note that this card was scanned so your host knows the service is used. No account
        needed.{' '}
        <Link href="/legal/scan-privacy" className="underline">
          What we record
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto min-h-[70vh] max-w-[32rem] px-5 pb-10 pt-8">{children}</main>
      <SiteFooter />
    </>
  );
}

function Outcome({ title, body, label }: { title: string; body: string; label?: string }) {
  return (
    <>
      {label && (
        <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
          {label}
        </p>
      )}
      <h1 className="mt-2 text-[1.5rem] font-extrabold leading-tight tracking-[-0.02em]">
        {title}
      </h1>
      <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.8]">{body}</p>
      <Link
        href="/"
        className="bg-ink mt-6 block rounded-xl px-5 py-4 text-center text-[0.9375rem] font-extrabold text-white"
      >
        Order to another address
      </Link>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-1 font-bold leading-snug">{value}</dd>
    </div>
  );
}
