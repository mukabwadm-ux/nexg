import { Card } from '@nexg/ui';
import Link from 'next/link';

import { EmptyRow } from './shared';

export interface DeactivatedMerchantRow {
  id: string;
  trading_name: string | null;
  status: string;
  city_name: string | null;
  deactivated_at: string;
  deactivation_reason: string | null;
}

export function DeactivatedMerchantsTab({ rows }: { rows: DeactivatedMerchantRow[] }) {
  return (
    <Card className="mt-6 overflow-x-auto p-0">
      <table className="w-full min-w-[42rem] text-left">
        <thead>
          <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
            <th className="px-4 py-3">Merchant</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Deactivated</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Record</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((merchant) => (
            <tr key={merchant.id} className="border-border border-b last:border-b-0">
              <td className="px-4 py-3">
                <p className="text-[0.8125rem] font-extrabold">
                  {merchant.trading_name ?? 'Unnamed merchant'}
                </p>
                <p className="text-muted-light text-[0.6875rem] font-semibold">
                  {merchant.city_name ?? 'Unassigned'}
                </p>
              </td>
              <td className="px-4 py-3 text-[0.75rem] font-bold">{merchant.status}</td>
              <td className="px-4 py-3 text-[0.75rem] font-semibold">
                {new Date(merchant.deactivated_at).toLocaleDateString('en-GB')}
              </td>
              <td className="px-4 py-3 text-[0.75rem] font-semibold">
                {merchant.deactivation_reason ?? '—'}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/merchants/${merchant.id}`}
                  className="text-gold-text hover:text-ink rounded-sm text-[0.75rem] font-extrabold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Review / reactivate
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <EmptyRow colSpan={5}>There are no deactivated merchants.</EmptyRow>
          )}
        </tbody>
      </table>
      <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold">
        {rows.length} deactivated merchant{rows.length === 1 ? '' : 's'}
      </p>
    </Card>
  );
}
