import type { ReviewDocument } from '@/components/document-review';
import type { createClient } from '@/lib/supabase/server';

type Client = ReturnType<typeof createClient>;

interface Requirement {
  id: string;
  kind: string;
  label: string;
  why_text: string | null;
  required: boolean;
  essential: boolean;
}

type ChaseState = Record<
  string,
  {
    last_sent_at: string | null;
    last_channel: string | null;
    by: string | null;
    by_applicant: boolean;
    times: number | null;
    can_send_again: boolean;
    next_allowed_at: string | null;
  }
>;

/**
 * Every document a merchant is asked for, with the file on record for each
 * (a five-minute link to view it), its review state and when it was last
 * chased. The merchant page and the application Review page both show this,
 * so they read it the same way.
 *
 * The list comes from the same function the merchant's own documents step
 * calls, rather than a second copy of the rules here: a reviewer looking at
 * a shorter list than the applicant was shown is how a licence goes
 * unasked for.
 */
export async function loadMerchantDocuments(supabase: Client, merchantId: string) {
  const [{ data: requirements }, { data: documents }, { data: chases }, { data: chaseState }] =
    await Promise.all([
      supabase.rpc('fn_merchant_required_docs', { p_merchant_id: merchantId }),
      supabase
        .from('document')
        .select(
          'id, requirement_id, status, storage_path, mime, expires_at, rejection_reason, created_at',
        )
        .eq('owner_type', 'merchant')
        .eq('owner_id', merchantId)
        .is('superseded_at', null),
      supabase
        .from('document_request')
        .select('requirement_id, sent_at, channel')
        .eq('owner_type', 'merchant')
        .eq('owner_id', merchantId)
        .is('fulfilled_document_id', null),
      supabase.rpc('fn_document_chase_state', {
        p_owner_type: 'merchant',
        p_owner_id: merchantId,
      }),
    ]);

  const applicable = (requirements as Requirement[] | null) ?? [];
  const byRequirement = new Map((documents ?? []).map((d) => [d.requirement_id, d]));
  const chasedIds = new Set(
    ((chases as { requirement_id: string }[] | null) ?? []).map((c) => c.requirement_id),
  );
  const chaseByKind = (chaseState ?? {}) as ChaseState;

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
        helpText: chasedIds.has(requirement.id)
          ? `${requirement.why_text ?? ''} · the merchant asked us to chase this on WhatsApp`.trim()
          : requirement.why_text,
        /* Essential is what blocks going live; the rest have a grace period. */
        required: requirement.essential,
        status: (document?.status ?? 'missing') as ReviewDocument['status'],
        expiresAt: document?.expires_at ?? null,
        rejectionReason: document?.rejection_reason ?? null,
        url,
        mime: document?.mime ?? null,
        chase: chaseByKind[requirement.kind] ?? null,
      };
    }),
  );

  const outstanding = review.filter((d) => d.required && d.status !== 'verified');
  const onFile = review.filter((d) => d.id !== null).length;
  return { review, outstanding, onFile };
}
