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
  canDeleteDraft,
  onSetDeactivated,
  onDeleteDraft,
}: {
  merchantId: string;
  merchantName: string;
  status: string;
  isDeactivated: boolean;
  canDeleteDraft: boolean;
  onSetDeactivated: (deactivated: boolean, reason: string) => Promise<ReviewResult>;
  onDeleteDraft: (confirmationName: string, reason: string) => Promise<ReviewResult>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [confirmationName, setConfirmationName] = React.useState('');
  const [busy, setBusy] = React.useState<'deactivate' | 'delete' | null>(null);

  const run = async (
    action: 'deactivate' | 'delete',
    work: () => Promise<ReviewResult>,
  ) => {
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
        router.push('/merchants');
      } else {
        router.refresh();
      }
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Merchant access</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        Deactivation keeps the merchant’s records and can be reversed. Reactivating a live
        merchant leaves order intake off until it is reviewed.
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
        onClick={() =>
          void run('deactivate', () => onSetDeactivated(!isDeactivated, reason))
        }
      >
        {isDeactivated ? 'Reactivate merchant' : 'Deactivate merchant'}
      </Button>

      {canDeleteDraft && (
        <div className="border-border mt-5 border-t pt-4">
          <h3 className="text-sm font-extrabold">Permanently delete draft</h3>
          <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
            Only an unsubmitted draft with no orders, financial history, compliance files, or
            uploaded images can be removed. Otherwise, deactivate it to preserve the record.
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
              confirmationName !== merchantName ||
              !reason.trim()
            }
            onClick={() => {
              if (
                !window.confirm(
                  `Permanently delete the unsubmitted draft “${merchantName}”? This cannot be undone.`,
                )
              ) {
                return;
              }
              void run('delete', () => onDeleteDraft(confirmationName, reason));
            }}
          >
            Delete draft permanently
          </Button>
        </div>
      )}

      <p className="text-muted-light mt-3 text-xs font-semibold">
        Current status: <span className="font-bold">{status}</span>
      </p>
    </Card>
  );
}
