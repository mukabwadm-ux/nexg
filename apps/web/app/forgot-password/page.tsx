import type { Metadata } from 'next';
import Link from 'next/link';

import { ForgotPasswordForm } from '@/components/auth/password-recovery';
import { Logo } from '@/components/logo';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Get a secure link to reset your NexG password.',
};

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return (
    <main className="bg-surface flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" aria-label="NexG Concierge home" className="mb-8">
        <Logo className="h-20 w-auto" />
      </Link>
      <ForgotPasswordForm invalidLink={searchParams?.error === 'invalid-link'} />
    </main>
  );
}
