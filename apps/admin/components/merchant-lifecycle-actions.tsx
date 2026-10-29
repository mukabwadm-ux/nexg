'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { ReviewResult } from '@/app/merchants/actions';

export function MerchantLifecycleActions({
  merchantId,
  merchantName,
  status,
  isDeactivated,
  onSetDeactivated,
  onDelete,
}: {
  merchantId: string;
  merchantName: string;
  status: string;
  isDeactivated: boolean;
  onSetDeactivated: (deactivated: boolean, reason: string) => Promise<ReviewResult>;
  onDelete: (confirmationName: string, reason: string) => Promise<ReviewResult>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [confirmationName, setConfirmationName] = React.useState('');
  const [busy, setBusy] = React.useState<'deactivate' | 'delete' | null>(null);

  const run = async (action: 'deactivate' | 'delete', work: () => Promise<ReviewResult>) => {
    setBusy(action);
    const result = await work();
    setBusy(null);
    toast({
      title: result.ok ? 'Done' : 'Not completed',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });

    if (result.ok) {
      setReason('');
      setConfirmationName('');
      if (action === 'delete') {
        router.push('/merchants?tab=deleted');
      } else {
        router.refresh();
      }
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Merchant access</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        Deactivation keeps the merchant’s records and can be reversed. Reactivating a live merchant
        leaves order intake off until it is reviewed.
      </p>

      <div className="mt-4">
        <Input
          id={`merchant_lifecycle_reason_${merchantId}`}
          label="Reason"
          hint="Required and recorded in the audit trail."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <Button
        block
        className="mt-3"
        variant={isDeactivated ? 'outline' : 'danger'}
        loading={busy === 'deactivate'}
        disabled={!reason.trim() || busy !== null}
        onClick={() => void run('deactivate', () => onSetDeactivated(!isDeactivated, reason))}
      >
        {isDeactivated ? 'Reactivate merchant' : 'Deactivate merchant'}
      </Button>

      <div className="border-border mt-5 border-t pt-4">
        <h3 className="text-sm font-extrabold">Delete merchant</h3>
        <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
          This immediately removes the merchant from public listings and active operations and
          revokes team access. The record stays in Deleted for 90 days and can be restored during
          that window. Financial and audit history is retained; after 90 days, eligible profile
          details are anonymized.
        </p>
        <div className="mt-3">
          <Input
            id={`merchant_delete_confirmation_${merchantId}`}
            label="Type the merchant name to confirm"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
          />
        </div>
        <Button
          block
          className="mt-3"
          variant="danger"
          loading={busy === 'delete'}
          disabled={
            busy !== null ||
            !confirmationName.trim() ||
            confirmationName !== merchantName ||
            !reason.trim()
          }
          onClick={() => {
            if (
              !window.confirm(
                `Move “${merchantName}” to Deleted for 90 days? You can restore it during that period.`,
              )
            ) {
              return;
            }
            void run('delete', () => onDelete(confirmationName, reason));
          }}
        >
          Delete merchant
        </Button>
      </div>

      <p className="text-muted-light mt-3 text-xs font-semibold">
        Current status: <span className="font-bold">{status}</span>
      </p>
    </Card>
  );
}
