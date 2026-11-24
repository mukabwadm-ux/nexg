'use client';

import { getCaptchaToken } from '@nexg/ui';
import { Ban, Crown, MailCheck, NotebookPen, RotateCcw } from 'lucide-react';
import * as React from 'react';

import { addNote, resendVerification, setSuspended, setVip } from '@/app/customers/actions';
import { HeaderButton } from '@/components/portal/dash';
import { ConfirmAction, useRunner } from '@/components/portal/client-kit';

/**
 * The profile's staff actions, in the header. Each asks why; the reason is
 * kept with the staff member's name in the audit log. View-only staff see
 * none of them (the database would refuse them anyway).
 */
export function CustomerActions({
  id,
  blocked,
  vip,
  canResend,
}: {
  id: string;
  blocked: boolean;
  vip: boolean;
  /** An account with an email that is not verified yet. */
  canResend: boolean;
}) {
  const { run, busy } = useRunner();

  return (
    <>
      <ConfirmAction
        trigger={
          <span>
            <HeaderButton icon={NotebookPen} disabled={busy}>
              Add note
            </HeaderButton>
          </span>
        }
        title="Add a note"
        body="The customer can ask to see notes under the Data Protection Act. Keep it factual."
        confirmLabel="Add note"
        tone="black"
        reason={{ label: 'Note', required: true, placeholder: 'Called about order NX-…' }}
        onConfirm={(text) => run(() => addNote(id, text))}
      />

      <ConfirmAction
        trigger={
          <span>
            <HeaderButton icon={Crown} disabled={busy}>
              {vip ? 'Remove VIP' : 'Mark VIP'}
            </HeaderButton>
          </span>
        }
        title={vip ? 'Remove VIP' : 'Mark as VIP'}
        confirmLabel={vip ? 'Remove VIP' : 'Mark VIP'}
        tone="black"
        reason={{ label: 'Reason', required: true }}
        onConfirm={(text) => run(() => setVip(id, !vip, text))}
      />

      {canResend && (
        <ConfirmAction
          trigger={
            <span>
              <HeaderButton icon={MailCheck} disabled={busy}>
                Resend verification
              </HeaderButton>
            </span>
          }
          title="Resend the verification email"
          body="Supabase sends the sign-up confirmation email to this account's address again."
          confirmLabel="Send it"
          tone="black"
          reason={{ label: 'Reason', required: true, placeholder: 'Customer asked on chat' }}
          onConfirm={(text) =>
            run(async () => resendVerification(id, text, (await getCaptchaToken()) ?? null))
          }
        />
      )}

      <ConfirmAction
        trigger={
          <span>
            <HeaderButton icon={blocked ? RotateCcw : Ban} gold={!blocked} disabled={busy}>
              {blocked ? 'Reactivate' : 'Suspend'}
            </HeaderButton>
          </span>
        }
        title={blocked ? 'Reactivate this customer' : 'Suspend this customer'}
        body={
          blocked
            ? 'They can order again straight away.'
            : 'They will not be able to place orders until someone reactivates them. Stays and table bookings are not stopped yet.'
        }
        confirmLabel={blocked ? 'Reactivate' : 'Suspend'}
        tone={blocked ? 'black' : 'danger'}
        reason={{ label: 'Reason', required: true }}
        onConfirm={(text) => run(() => setSuspended(id, !blocked, text))}
      />
    </>
  );
}
