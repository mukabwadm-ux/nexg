'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { setBusinessSuspended } from '@/app/merchant/settings/suspend-actions';

import { Action, Badge, Card, Field, Modal, Note } from './ui';
import s from './settings.module.css';

export interface SuspensionState {
  /** When the owner suspended the business, or null when it is open. */
  suspendedAt: string | null;
  reason: string | null;
  /** Only the owner may suspend or resume. */
  canChange: boolean;
}

/** Settings › Account: the owner takes the business offline, and brings it back. */
export function SuspendBusiness({ initial }: { initial: SuspensionState }) {
  const router = useRouter();
  const [state, setState] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const suspended = state.suspendedAt !== null;

  async function change(suspend: boolean) {
    setBusy(true);
    setError('');
    const result = await setBusinessSuspended({ suspend, reason: reason.trim() || undefined });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setState({
      ...state,
      suspendedAt: suspend ? new Date().toISOString() : null,
      reason: suspend ? reason.trim() || null : null,
    });
    setOpen(false);
    setReason('');
    router.refresh();
  }

  return (
    <Card
      title="Suspend business"
      description={
        suspended
          ? 'Your business is suspended: customers cannot find it in Discovery or place new orders.'
          : 'Take your business offline for a while. Customers cannot find you or place new orders until you resume. Your workspace, catalogue and records stay as they are.'
      }
      action={suspended ? <Badge tone="warning">Suspended</Badge> : undefined}
    >
      <div className={s.form}>
        {suspended && (
          <p>
            Suspended {new Date(state.suspendedAt!).toLocaleString('en-KE')}
            {state.reason ? ` · ${state.reason}` : ''}
          </p>
        )}
        {!state.canChange ? (
          <Note>Only the business owner can suspend or resume the business.</Note>
        ) : suspended ? (
          <>
            {error && <Note tone="danger">{error}</Note>}
            <div className={s.actions}>
              <Action variant="gold" loading={busy} onClick={() => void change(false)}>
                Resume business
              </Action>
            </div>
          </>
        ) : (
          <div className={s.actions}>
            <Action variant="danger" onClick={() => setOpen(true)}>
              Suspend business
            </Action>
          </div>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError('');
        }}
        title="Suspend your business?"
        description="New orders stop and your business is hidden from Discovery straight away. You can resume here at any time."
      >
        <div className={s.form}>
          <Note tone="warning">
            Orders and bookings you have already accepted are not cancelled. Finish them, or contact
            the customers.
          </Note>
          <Field label="Reason (optional)" hint="For your records and NexG support.">
            <input
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Closed for renovations"
            />
          </Field>
          {error && <Note tone="danger">{error}</Note>}
          <div className={s.actions}>
            <Action onClick={() => setOpen(false)}>Cancel</Action>
            <Action variant="danger" loading={busy} onClick={() => void change(true)}>
              Suspend business
            </Action>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
