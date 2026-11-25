import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

import { VerifyForm } from './form';

export const metadata: Metadata = {
  title: 'Verify a document',
  description: 'Check that a NexG tax invoice, receipt, settlement statement or report is genuine.',
};

/** Verify: type a document reference, or arrive from its QR code at /verify/<reference>. */
export default function VerifyPage({ searchParams }: { searchParams: { ref?: string } }) {
  const ref = searchParams.ref?.trim().toUpperCase();
  if (ref) redirect(`/verify/${encodeURIComponent(ref)}`);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-14 sm:py-20">
        <ShieldCheck className="text-gold-text h-10 w-10" aria-hidden />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Verify a NexG document</h1>
        <p className="text-muted mt-3 text-[0.9375rem] leading-relaxed">
          Every tax invoice, receipt, settlement statement and financial report from Nexgenius
          Concierge Limited carries a reference such as NEXG-INV-2026-00001. Enter it to check that
          we issued it. Scanning the QR code on the document also shows who it was issued to and the
          amount.
        </p>
        <VerifyForm />
      </main>
      <SiteFooter />
    </>
  );
}
