import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/components/auth/password-recovery';
import { Logo } from '@/components/logo';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your NexG account.',
};

export default function ResetPasswordPage({ searchParams }: { searchParams?: { next?: string } }) {
  const redirectTo =
    searchParams?.next === '/merchant' || searchParams?.next === '/host' ? searchParams.next : '/';
  return (
    <main className="bg-surface flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" aria-label="NexG Concierge home" className="mb-8">
        <Logo className="h-20 w-auto" />
      </Link>
      <ResetPasswordForm redirectTo={redirectTo} />
    </main>
  );
}
