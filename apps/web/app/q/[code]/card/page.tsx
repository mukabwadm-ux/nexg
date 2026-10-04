import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { normaliseCode, PLACEMENT_LABEL, qrSvg, qrUrl } from '@/lib/qr';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = { title: 'Print this card', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The card, at A6, ready for a printer.
 *
 * Deliberately a page rather than a generated PDF. A host in Kilimani
 * prints this on whatever is in the house; a print shop takes the
 * same page at A6 with the browser's own PDF export. A PDF/X with
 * bleed for a 180-room run is a different job and is not pretended
 * at here.
 *
 * What it must get right: the quiet zone around the square, the code
 * in text underneath (people do type it), and a size that still scans
 * at arm's length across a kitchen.
 */
export default async function CardPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams?: { n?: string };
}) {
  const code = normaliseCode(params.code);
  if (!code) notFound();

  const supabase = createPublicClient();
  /*
   * Through an RPC, not a table read. `property_qr` is behind RLS
   * and the anon client would get null rather than an error — so a
   * host printing a pack would have got cards reading "This address"
   * with nothing to say what went wrong.
   */
  const { data } = await supabase.rpc('rpc_qr_card', { p_code: code });
  const row = (data as {
    ok: boolean;
    label: string | null;
    placement: string | null;
    voided: boolean;
  } | null) ?? null;

  if (!row?.ok) notFound();
  const svg = await qrSvg(code, { size: 640 });
  const copies = Math.min(Math.max(Number(searchParams?.n ?? 1) || 1, 1), 12);

  return (
    <>
      <style
        /* Print rules have to be real CSS, not Tailwind classes:
           @page has no utility equivalent. */
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: A6; margin: 0; }
            @media print {
              .no-print { display: none !important; }
              .card { page-break-after: always; box-shadow: none !important; }
              body { background: #fff !important; }
            }
          `,
        }}
      />

      <div className="no-print mx-auto max-w-[40rem] px-5 py-6">
        <h1 className="text-[1.25rem] font-extrabold tracking-tight">Print this card</h1>
        <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
          Print at A6 — that is a quarter of a sheet, and the square still scans from across a
          kitchen. Keep the white border: printers trim, and a QR with nothing around it reads on
          a screen and fails on card.
        </p>
        {row.voided && (
          <p className="bg-danger-bg text-danger mt-3 rounded-lg p-3 text-[0.8125rem] font-bold">
            This code has been replaced. Printing it will put a dead card on somebody&rsquo;s
            counter — use the new one.
          </p>
        )}
        <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
          Add <code className="font-mono">?n=4</code> to the address for four copies on four
          pages.
        </p>
      </div>

      {Array.from({ length: copies }).map((_, i) => (
        <div
          key={i}
          className="card mx-auto flex w-[105mm] flex-col items-center justify-between bg-white px-[9mm] py-[10mm]"
          style={{ height: '148mm' }}
        >
          <div className="text-center">
            <p
              className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em]"
              style={{ color: '#B8901F' }}
            >
              NexG
            </p>
            <p className="mt-3 text-[1.0625rem] font-extrabold leading-tight tracking-tight">
              Scan to order to this door
            </p>
          </div>

          <div
            className="w-[62mm]"
            aria-label={`QR code for ${code}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="w-full text-center">
            <p className="text-[0.9375rem] font-extrabold leading-tight">
              {row.label ?? 'This address'}
            </p>
            {row.placement && (
              <p className="text-muted-light mt-0.5 text-[0.625rem] font-bold uppercase tracking-[0.12em]">
                {PLACEMENT_LABEL[row.placement] ?? row.placement}
              </p>
            )}

            <p className="mt-3 font-mono text-[0.8125rem] font-extrabold tracking-[0.08em]">
              {code}
            </p>
            <p className="text-muted mt-1 text-[0.625rem] font-semibold">
              Or type {qrUrl(code).replace('https://', '')}
            </p>

            <p className="text-muted-light mt-3 text-[0.5625rem] font-semibold leading-snug">
              Food, pharmacy and errands, delivered here. No app, no account.
            </p>
          </div>
        </div>
      ))}
    </>
  );
}
