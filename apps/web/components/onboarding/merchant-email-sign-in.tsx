'use client';

import { Button, Card, Input } from '@nexg/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { EmailVerificationCard } from './email-verification-card';
import { EMAIL_RATE_LIMIT_MESSAGE } from '@/lib/merchant-welcome';
import { createClient } from '@/lib/supabase/client';

/** Do not abandon an application owned by the current temporary identity. */
async function checkCurrentApplication() {
  const client = createClient();
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError')
    throw new Error('We could not check your current session. Please try again.');
  if (!data.user?.is_anonymous) return;
  const home = await client.rpc('fn_partner_home');
  if (home.error || !home.data)
    throw new Error('We could not check your saved application. Return to Home and try again.');
  if ((home.data as { kind?: string }).kind === 'merchant')
    throw new Error('Your application is saved in this browser. Verify your email from Home to keep it connected.');
}

async function sendSignInCode(email: string) {
  await checkCurrentApplication();
  const { error } = await createClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  // Respond the same way for a missing account so addresses cannot be enumerated.
  if (error && error.code !== 'user_not_found' && error.code !== 'otp_disabled')
    throw new Error(error.status === 429 ? EMAIL_RATE_LIMIT_MESSAGE : 'We could not send a code. Please try again.');
}

export function MerchantEmailSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const address = email.trim().toLowerCase();
      await sendSignInCode(address);
      setSentTo(address);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not send a code. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (sentTo)
    return (
      <>
        <EmailVerificationCard
          email={sentTo}
          submitLabel="Sign in"
          descriptionPrefix="If you have an account, a 6-digit code has been sent to "
          resendNotice="If you have an account, a new code has been sent."
          onResend={() => sendSignInCode(sentTo)}
          onVerify={async (code) => {
            await checkCurrentApplication();
            const { data, error: verificationError } = await createClient().auth.verifyOtp({ type: 'email', email: sentTo, token: code });
            if (verificationError || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at ||
                data.user.email?.toLowerCase() !== sentTo)
              throw new Error('That code is invalid or has expired. Request another code and try again.');
            router.replace('/merchant');
            router.refresh();
          }}
        />
        <button type="button" onClick={() => setSentTo('')} className="text-ink mt-5 w-full text-center text-sm font-bold underline underline-offset-4">Use a different email</button>
      </>
    );

  return (
    <Card className="p-7 sm:p-8">
      <p className="text-gold-text text-center text-sm font-extrabold uppercase tracking-[0.16em]">Merchant workspace</p>
      <h1 className="text-ink mt-1 text-center text-2xl font-extrabold">Sign in with email</h1>
      <p className="text-muted mt-2 text-center text-sm leading-6">We’ll send a code to the email you verified for your account.</p>
      <form onSubmit={submit} className="mt-6">
        <Input id="merchant-sign-in-email" name="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        {error ? <p role="alert" className="text-danger mt-3 text-sm">{error}</p> : null}
        <Button type="submit" variant="gold" size="lg" block loading={pending} loadingText="Sending…" className="mt-5">Send code</Button>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/sign-in?role=merchant" className="text-ink font-bold underline underline-offset-4">Sign in with a password</Link></p>
    </Card>
  );
}
