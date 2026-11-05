'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { EmailVerificationCard } from './email-verification-card';
import {
  requestMerchantEmailCode,
  resendMerchantEmailCode,
  verifyMerchantEmailCode,
} from '@/lib/merchant-email-otp';
import { createClient } from '@/lib/supabase/client';

export function MerchantEmailVerification({ actorId, email }: { actorId: string; email: string }) {
  const router = useRouter();
  const started = useRef(false);
  const busy = useRef(false);
  const [status, setStatus] = useState<'sending' | 'ready' | 'error'>('sending');
  const [message, setMessage] = useState('');

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setStatus('sending');
    try {
      const result = await requestMerchantEmailCode(createClient().auth, actorId, email);
      if (result === 'verified') {
        router.replace('/merchant');
        router.refresh();
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
    // The saved application and actor are fixed for this visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EmailVerificationCard
      email={email}
      requestStatus={status}
      requestMessage={message}
      onRetryRequest={() => void start()}
      onResend={() => resendMerchantEmailCode(createClient().auth, actorId, email)}
      onVerify={async (code) => {
        await verifyMerchantEmailCode(createClient().auth, actorId, email, code);
        router.replace('/merchant');
        router.refresh();
      }}
    />
  );
}
