'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { ReviewResult } from '@/app/merchants/actions';

import { EmptyRow } from './shared';

export interface DeletedMerchantRow {
  id: string;
  trading_name: string | null;
  status: string;
  city_name: string | null;
  deleted_at: string;
  deleted_until: string;
  deletion_reason: string | null;
}

export function DeletedMerchantsTab({
  rows,
  canRestore,
  onRestore,
}: {
  rows: DeletedMerchantRow[];
  canRestore: boolean;
  onRestore: (merchantId: string, reason: string) => Promise<ReviewResult>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const restore = async (merchant: DeletedMerchantRow) => {
    const reason = reasons[merchant.id]?.trim() ?? '';
    if (!reason) return;

    setBusyId(merchant.id);
    const result = await onRestore(merchant.id, reason);
    setBusyId(null);
    toast({
      title: result.ok ? 'Merchant restored' : 'Restore not completed',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });

    if (result.ok) {
      setReasons((current) => ({ ...current, [merchant.id]: '' }));
      router.refresh();
    }
  };

  return (
    <Card className="mt-6 overflow-x-auto p-0">
      <table className="w-full min-w-[58rem] text-left">
        <thead>
          <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
            <th className="px-4 py-3">Merchant</th>
            <th className="px-4 py-3">Deleted</th>
            <th className="px-4 py-3">Recovery ends</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Restore</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((merchant) => {
            const daysRemaining = Math.max(
              0,
              Math.ceil((new Date(merchant.deleted_until).getTime() - Date.now()) / 86_400_000),
            );
            const reason = reasons[merchant.id] ?? '';

            return (
              <tr key={merchant.id} className="border-border border-b align-top last:border-b-0">
                <td className="px-4 py-3">
                  <p className="text-[0.8125rem] font-extrabold">
                    {merchant.trading_name ?? 'Unnamed merchant'}
                  </p>
                  <p className="text-muted-light text-[0.6875rem] font-semibold">
                    {merchant.city_name ?? 'Unassigned'} · {merchant.status}
                  </p>
                </td>
                <td className="px-4 py-3 text-[0.75rem] font-semibold">
                  {new Date(merchant.deleted_at).toLocaleDateString('en-GB')}
                </td>
                <td className="px-4 py-3 text-[0.75rem] font-semibold">
                  {daysRemaining === 0 ? 'Expires today' : `${daysRemaining} days left`}
                </td>
                <td className="px-4 py-3 text-[0.75rem] font-semibold">
                  {merchant.deletion_reason ?? '—'}
                </td>
                <td className="min-w-52 px-4 py-3">
                  {canRestore ? (
                    <>
                      <Input
                        id={`merchant_restore_reason_${merchant.id}`}
                        label="Restore reason"
                        value={reason}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [merchant.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        className="mt-2"
                        variant="outline"
                        loading={busyId === merchant.id}
                        disabled={!reason.trim() || busyId !== null}
                        onClick={() => void restore(merchant)}
                      >
                        Restore
                      </Button>
                    </>
                  ) : (
                    <span className="text-muted-light text-[0.6875rem] font-semibold">
                      Merchant Ops can restore
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <EmptyRow colSpan={5}>Deleted merchants appear here for 90 days.</EmptyRow>
          )}
        </tbody>
      </table>
      <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold">
        {rows.length} merchant{rows.length === 1 ? '' : 's'} in the 90-day recovery window.
        Financial and audit records are retained after profile anonymization.
      </p>
    </Card>
  );
}
