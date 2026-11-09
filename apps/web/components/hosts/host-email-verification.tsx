'use client';

import { useEffect, useRef, useState } from 'react';

import { sendHostPasswordSetupLink } from '@/app/(customer)/sign-in/actions';
import { EmailVerificationCard } from '@/components/onboarding/email-verification-card';
import {
  requestMerchantEmailCode,
  resendMerchantEmailCode,
  verifyMerchantEmailCode,
} from '@/lib/merchant-email-otp';
import { createClient } from '@/lib/supabase/client';

/**
 * Turns the applicant's anonymous session into their host login.
 *
 * The code is an email-change OTP on the same user, so the host they just
 * created stays theirs. Once the code is accepted the welcome email (with
 * the set-password link) is sent and `onDone` gets its outcome.
 */
export function HostEmailVerification({
  actorId,
  email,
  onDone,
}: {
  actorId: string;
  email: string;
  onDone: (result: { ok: boolean; message: string }) => void;
}) {
  const started = useRef(false);
  const busy = useRef(false);
  const [status, setStatus] = useState<'sending' | 'ready' | 'error'>('sending');
  const [message, setMessage] = useState('');

  async function finish() {
    onDone(await sendHostPasswordSetupLink());
  }

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setStatus('sending');
    try {
      const result = await requestMerchantEmailCode(createClient().auth, actorId, email);
      if (result === 'verified') {
        await finish();
        return;
      }
      setStatus('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not send a verification code.');
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void start();
    }
    // The applicant and email are fixed for this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EmailVerificationCard
      email={email}
      eyebrow="NexG Hosts"
      requestStatus={status}
      requestMessage={message}
      onRetryRequest={() => void start()}
      onResend={() => resendMerchantEmailCode(createClient().auth, actorId, email)}
      onVerify={async (code) => {
        await verifyMerchantEmailCode(createClient().auth, actorId, email, code);
        await finish();
      }}
    />
  );
}
