'use client';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@nexg/ui';
import { Download, ExternalLink, Landmark, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export: the settlements on screen's filters, as a spreadsheet. */
export function ExportSettlements({
  rows,
  period,
}: {
  rows: {
    name: string;
    category: string;
    gmv: number;
    commission: number;
    vat: number;
    payout: number;
    status: string;
    payoutDate: string;
    run: string;
  }[];
  period: string;
}) {
  function download() {
    const head = [
      'Merchant',
      'Category',
      'GMV (KES)',
      'Commission ex VAT (KES)',
      'VAT on commission (KES)',
      'Payout (KES)',
      'Status',
      'Payout date',
      'Settlement run',
    ];
    const body = rows.map((r) => [
      r.name,
      r.category,
      String(r.gmv),
      String(r.commission),
      String(r.vat),
      String(r.payout),
      r.status,
      r.payoutDate,
      r.run,
    ]);
    const csv = [head, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}\r\n`], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-settlements-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={download}
      className="bg-ink inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[0.9375rem] font-bold text-[#F5B400] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]"
    >
      <Download aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.9} />
      Export
    </button>
  );
}

/** The "…" on a settlement row. */
export function SettlementMenu({
  merchantId,
  name,
  canFinance,
}: {
  merchantId: string;
  name: string;
  canFinance: boolean;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More for ${name}`}
          className="text-ink rounded-md p-1 hover:text-[#B57A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]"
        >
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          icon={<ExternalLink />}
          onSelect={() => router.push(`/merchants/${merchantId}`)}
        >
          Open merchant record
        </DropdownMenuItem>
        {canFinance && (
          <DropdownMenuItem
            icon={<Landmark />}
            onSelect={() => router.push('/finance/settlements?tab=merchants')}
          >
            Merchant settlements in Finance
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
