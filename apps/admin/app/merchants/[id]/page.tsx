import { Card, StatusBadge, type StatusKey } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { goLive, rejectDocument, setFeatured, verifyDocument } from '@/app/merchants/actions';
import { ActivatePanel } from '@/components/activate-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentReview, type ReviewDocument } from '@/components/document-review';
import { FeatureToggle } from '@/components/feature-toggle';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchant application' };
export const dynamic = 'force-dynamic';

export default async function MerchantApplicationPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  const supabase = createClient();

  const { data: merchant } = await supabase
    .from('merchant')
    .select(
      'id, legal_name, trading_name, category, category_other, contact_name, contact_phone, contact_email, status, featured, created_at, city(name)',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!merchant) notFound();

  const [{ data: requirements }, { data: documents }, { data: branches }] = await Promise.all([
    supabase
      .from('document_requirement')
      .select('id, kind, label, help_text, required, applies_when, sort')
      .eq('owner_type', 'merchant')
      .order('sort', { ascending: true }),
    supabase
      .from('document')
      .select('id, requirement_id, status, storage_path, mime, expires_at, rejection_reason')
      .eq('owner_type', 'merchant')
      .eq('owner_id', params.id)
      .is('superseded_at', null),
    supabase
      .from('merchant_branch')
      .select('name, address_text, is_primary')
      .eq('merchant_id', params.id)
      .order('is_primary', { ascending: false }),
  ]);

  const applicable = (requirements ?? []).filter((requirement) => {
    const when = requirement.applies_when as Record<string, string[]> | null;
    const categories = when?.['category'];
    return !categories || categories.includes(merchant.category);
  });

  const byRequirement = new Map((documents ?? []).map((d) => [d.requirement_id, d]));

  const review: ReviewDocument[] = await Promise.all(
    applicable.map(async (requirement) => {
      const document = byRequirement.get(requirement.id);
      let url: string | null = null;

      if (document) {
        const { data } = await supabase.storage
          .from('partner-documents')
          .createSignedUrl(document.storage_path, 300);
        url = data?.signedUrl ?? null;
      }

      return {
        id: document?.id ?? null,
        kind: requirement.kind,
        label: requirement.label,
        helpText: requirement.help_text,
        required: requirement.required,
        status: (document?.status ?? 'missing') as ReviewDocument['status'],
        expiresAt: document?.expires_at ?? null,
        rejectionReason: document?.rejection_reason ?? null,
        url,
        mime: document?.mime ?? null,
      };
    }),
  );

  const outstanding = review.filter((d) => d.required && d.status !== 'verified');
  const city = merchant.city as { name: string } | null;
  const primary = branches?.[0];

  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title={merchant.trading_name}
        breadcrumb="Merchants → Application"
        action={<StatusBadge status={merchant.status as StatusKey} />}
      />

      <main className="px-4 py-6 sm:px-8">
        <Link
          href="/merchants"
          className="text-muted hover:text-ink text-xs font-bold transition-colors"
        >
          ← Back to the pipeline
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">Documents</h2>
            <p className="text-muted mt-1 text-sm font-semibold">
              {outstanding.length === 0
                ? 'Everything required is verified.'
                : `${outstanding.length} of ${review.filter((d) => d.required).length} still to verify.`}
            </p>

            <div className="mt-4">
              <DocumentReview
                documents={review}
                onVerify={async (documentId) => {
                  'use server';
                  return verifyDocument(documentId, params.id);
                }}
                onReject={async (documentId, reason) => {
                  'use server';
                  return rejectDocument(documentId, params.id, reason);
                }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Business</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Legal name', merchant.legal_name],
                  ['Category', merchant.category_other ?? merchant.category.replace(/_/g, ' ')],
                  ['City', city?.name ?? '—'],
                  ['Contact', merchant.contact_name],
                  ['Phone', merchant.contact_phone],
                  ['Email', merchant.contact_email],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-light shrink-0 font-semibold">{label}</dt>
                    <dd className="truncate text-right font-bold">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="border-border mt-4 border-t pt-3">
                <p className="text-muted-light text-xs font-semibold">Collection address</p>
                <p className="mt-1 text-sm font-bold">
                  {primary ? primary.address_text : 'Not given yet'}
                </p>
              </div>
            </Card>

            <FeatureToggle
              featured={merchant.featured}
              live={merchant.status === 'live'}
              onToggle={async (next) => {
                'use server';
                return setFeatured(params.id, next);
              }}
            />

            <ActivatePanel
              kind="merchant"
              disabled={merchant.status === 'live'}
              outstanding={outstanding.length}
              currentStatus={merchant.status}
              onActivate={async (reason) => {
                'use server';
                return goLive(params.id, reason);
              }}
            />
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}
