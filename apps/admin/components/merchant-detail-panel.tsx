import { Button, StatusBadge, type StatusKey, VALUE_PLACEHOLDER } from '@nexg/ui';
import { X } from 'lucide-react';
import Link from 'next/link';

import type { Controls } from '@/app/merchants/actions';
import {
  type ControlState,
  MerchantControls,
  MerchantStatusActions,
} from '@/components/merchant-controls';
import { createClient } from '@/lib/supabase/server';

export interface PanelMerchant {
  id: string;
  tradingName: string;
  category: string;
  status: string;
  featured: boolean;
  cityName: string | null;
  wentLiveAt: string | null;
  controls: ControlState;
}

const COMPLIANCE_TONE: Record<string, { label: string; className: string }> = {
  verified: { label: 'Valid', className: 'bg-success-bg text-success' },
  uploaded: { label: 'Check', className: 'bg-warning-bg text-warning' },
  rejected: { label: 'Rejected', className: 'bg-danger-bg text-danger' },
  expired: { label: 'Expired', className: 'bg-danger-bg text-danger' },
  missing: { label: 'Missing', className: 'bg-bg text-muted-light' },
};

/**
 * The right-hand detail panel from the Merchants artboard.
 *
 * The artboard also draws Catalogue, Hours, Payouts, Reviews and Staff tabs.
 * None of those have tables behind them, so they are not rendered: a tab that
 * opens onto nothing is worse than a tab that is not there yet.
 */
export async function MerchantDetailPanel({
  merchant,
  closeHref,
  pendingSuspension,
  onSaveControls,
  onPause,
  onRequestSuspension,
}: {
  merchant: PanelMerchant;
  closeHref: string;
  pendingSuspension: { reason: string; requestedBy: string } | null;
  onSaveControls: (patch: Controls) => Promise<{ ok: boolean; message: string }>;
  onPause: (paused: boolean, reason: string) => Promise<{ ok: boolean; message: string }>;
  onRequestSuspension: (reason: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const supabase = createClient();

  const [{ data: requirements }, { data: documents }, { data: acceptances }] = await Promise.all([
    supabase
      .from('document_requirement')
      .select('id, kind, label, applies_when, required, sort')
      .eq('owner_type', 'merchant')
      .order('sort', { ascending: true }),
    supabase
      .from('document')
      .select('requirement_id, status, expires_at')
      .eq('owner_type', 'merchant')
      .eq('owner_id', merchant.id)
      .is('superseded_at', null),
    supabase
      .from('legal_acceptance')
      .select('version, accepted_at')
      .eq('merchant_id', merchant.id)
      .eq('document', 'merchant_terms')
      .order('accepted_at', { ascending: false })
      .limit(1),
  ]);

  const applicable = (requirements ?? []).filter((requirement) => {
    const when = requirement.applies_when as Record<string, string[]> | null;
    const categories = when?.['category'];
    return !categories || categories.includes(merchant.category);
  });

  const byRequirement = new Map((documents ?? []).map((d) => [d.requirement_id, d]));
  const terms = acceptances?.[0];

  return (
    <aside
      aria-label={`${merchant.tradingName} details`}
      className="border-border bg-surface rounded-2xl border p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight">
            {merchant.tradingName}
            <StatusBadge status={merchant.status as StatusKey} />
            {merchant.featured && (
              <span className="bg-gold text-ink rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                Featured
              </span>
            )}
          </p>
          <p className="text-muted-light mt-1 text-xs font-semibold">
            {merchant.category.replace(/_/g, ' ')}
            {merchant.cityName && ` · ${merchant.cityName}`}
            {merchant.wentLiveAt &&
              ` · live since ${new Date(merchant.wentLiveAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        </div>

        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close"
          className="text-muted-light hover:text-ink transition-colors"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>

      {/*
       * Orders, punctuality, prep time and cancellations all need the orders
       * domain. They are kept on the panel because the shape of the screen is
       * the point, and bracketed because none of them can be computed yet.
       */}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Orders · 30d', VALUE_PLACEHOLDER],
          ['On-time ready', `${VALUE_PLACEHOLDER}%`],
          ['Avg prep', `${VALUE_PLACEHOLDER} min`],
          ['Cancel rate', `${VALUE_PLACEHOLDER}%`],
        ].map(([label, value]) => (
          <div key={label} className="border-border bg-bg/60 rounded-xl border p-3">
            <dt className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              {label}
            </dt>
            <dd className="mt-1 text-base font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wide">Status &amp; controls</h3>
      <div className="mt-3">
        <MerchantControls
          merchantId={merchant.id}
          live={merchant.status === 'live'}
          state={merchant.controls}
          onSave={onSaveControls}
        />
      </div>

      <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wide">Compliance</h3>
      <ul className="mt-3 space-y-2">
        {applicable.map((requirement) => {
          const document = byRequirement.get(requirement.id);
          const state = COMPLIANCE_TONE[document?.status ?? 'missing']!;

          return (
            <li
              key={requirement.id}
              className="border-border flex items-center justify-between gap-3 border-b pb-2 last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] font-bold">
                  {requirement.label}
                </span>
                {document?.expires_at && (
                  <span className="text-muted-light block text-[0.6875rem] font-semibold">
                    expires {document.expires_at}
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide ${state.className}`}
              >
                {state.label}
              </span>
            </li>
          );
        })}

        {/* Backed by legal_acceptance, not a document upload. */}
        <li className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[0.8125rem] font-bold">
              Merchant terms {terms ? `v${terms.version}` : ''}
            </span>
            <span className="text-muted-light block text-[0.6875rem] font-semibold">
              {terms
                ? `signed ${new Date(terms.accepted_at).toLocaleDateString('en-GB')}`
                : 'not accepted yet'}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide ${
              terms ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'
            }`}
          >
            {terms ? 'Valid' : 'Missing'}
          </span>
        </li>
      </ul>

      <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wide">Next payout</h3>
      <div className="border-border bg-bg/60 mt-3 rounded-xl border p-4">
        <p className="text-muted text-xs font-semibold leading-relaxed">
          Gross KES {VALUE_PLACEHOLDER} · commission {VALUE_PLACEHOLDER}% · adjustments −KES{' '}
          {VALUE_PLACEHOLDER}
        </p>
        <p className="mt-2 text-2xl font-extrabold tracking-tight">KES {VALUE_PLACEHOLDER}</p>
        <p className="text-muted-light mt-1 text-xs font-semibold">
          Settlement runs with the finance module.
        </p>
      </div>

      <div className="border-border mt-6 border-t pt-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/merchants/${merchant.id}`}>Review documents</Link>
          </Button>
        </div>

        <div className="mt-3">
          <MerchantStatusActions
            status={merchant.status}
            onPause={onPause}
            onRequestSuspension={onRequestSuspension}
            pendingSuspension={pendingSuspension}
          />
        </div>
      </div>
    </aside>
  );
}
