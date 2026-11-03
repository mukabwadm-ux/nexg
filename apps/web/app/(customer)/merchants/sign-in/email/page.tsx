import { notFound } from 'next/navigation';

import { MerchantEmailSignIn } from '@/components/onboarding/merchant-email-sign-in';

export const metadata = { title: 'Sign in with email' };
export const dynamic = 'force-dynamic';

export default function MerchantEmailSignInPage() {
  if (process.env.MERCHANT_EMAIL_OTP_ENABLED === 'false') notFound();
  return (
    <main className="bg-bg flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-[460px]"><MerchantEmailSignIn /></div>
    </main>
  );
}
