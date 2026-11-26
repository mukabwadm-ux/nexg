import {
  Documents,
  type Asked,
  type OnFile,
  type Requirement,
} from '@/components/partner/documents';
import {
  AgreementPanel,
  type AgreementStatus,
  type SignedAgreementCopy,
} from '@/components/merchant/agreement-panel';
import type { AgreementDetailsRecord } from '@/components/merchant/agreement-details';
import { DpaPanel, type DpaRecord } from '@/components/merchant/dpa-panel';
import { PageHead } from '@/components/merchant/frame';
import { OnboardingDetailsPanel } from '@/components/merchant/onboarding-details-panel';
import { parseOnboardingDetails } from '@nexg/contracts/merchant-onboarding-details';
import { requireMerchant, setupPageOrWorkspace } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

export default async function MerchantDocuments() {
  const me = await setupPageOrWorkspace(
    () => requireMerchant({ access: 'setup' }),
    '/merchant/business?tab=documents',
  );
  const supabase = createClient();

  const [
    { data: reqs, error },
    { data: docs },
    { data: asked },
    { data: agreement },
    { data: details },
    { data: signed },
    { data: onboarding, error: onboardingError },
    { data: dpa },
  ] = await Promise.all([
    supabase.rpc('fn_merchant_required_docs', { p_merchant_id: me.id }),
    supabase
      .from('document')
      .select('requirement_id, status, rejection_reason, expires_at, side, created_at')
      .eq('owner_type', 'merchant')
      .eq('owner_id', me.id)
      .is('superseded_at', null),
    supabase
      .from('document_request')
      .select('requirement_id, note')
      .eq('owner_type', 'merchant')
      .eq('owner_id', me.id)
      .is('fulfilled_document_id', null),
    supabase.rpc('rpc_merchant_agreement_status', { p_merchant_id: me.id }),
    // Null until 20270103000100 runs: the panel then works as before.
    supabase.rpc('rpc_merchant_agreement_details_read', { p_merchant_id: me.id }),
    supabase.rpc('rpc_merchant_agreement_signed_list', { p_merchant_id: me.id }),
    // Null until 20270110410100 runs: the panel then stays hidden.
    supabase.rpc('rpc_merchant_onboarding_read', { p_merchant_id: me.id }),
    // Null until 20270327000100 runs: the DPA panel then stays hidden.
    supabase.rpc('rpc_merchant_dpa_read', { p_merchant_id: me.id }),
  ]);

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Documents"
        lead="The documents NexG needs for your category, their review state and expiry. Documents you already verified are carried over and never re-requested unless they expire."
      />

      <div id="onboarding-details" className="scroll-mt-20">
        <OnboardingDetailsPanel
          merchantId={me.id}
          details={onboardingError || !onboarding ? null : parseOnboardingDetails(onboarding)}
        />
      </div>

      <div id="agreement" className="scroll-mt-20">
        <AgreementPanel
          merchantId={me.id}
          status={agreement as unknown as AgreementStatus | null}
          details={(details as unknown as AgreementDetailsRecord | null) ?? null}
          signed={(signed as unknown as SignedAgreementCopy[] | null) ?? null}
        />
      </div>

      <div id="dpa" className="scroll-mt-20">
        <DpaPanel
          merchantId={me.id}
          record={(dpa as unknown as DpaRecord | null) ?? null}
          legalName={
            (details as unknown as AgreementDetailsRecord | null)?.details?.legal_name ?? null
          }
        />
      </div>

      <div id="documents-list" className="scroll-mt-20">
        {error ? (
          <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
            We could not read what we need from you: {error.message}
          </p>
        ) : (
          <Documents
            ownerType="merchant"
            ownerId={me.id}
            requirements={(reqs as Requirement[] | null) ?? []}
            onFile={(docs as OnFile[] | null) ?? []}
            asked={(asked as Asked[] | null) ?? []}
          />
        )}
      </div>
    </div>
  );
}
