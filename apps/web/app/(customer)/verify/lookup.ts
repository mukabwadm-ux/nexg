import { createPublicClient } from '@/lib/supabase/public';

export interface Verdict {
  found: boolean;
  kind?: 'invoice' | 'credit_note' | 'receipt' | 'settlement' | 'report';
  reference?: string;
  issued_on?: string;
  status?: 'issued' | 'void';
  /** True when the check code matched, so party and amount are given. */
  details?: boolean;
  party?: string | null;
  amount_cents?: number | null;
}

export const KIND_LABELS: Record<NonNullable<Verdict['kind']>, string> = {
  invoice: 'Tax invoice',
  credit_note: 'Credit note',
  receipt: 'Payment receipt',
  settlement: 'Settlement statement',
  report: 'Monthly financial report',
};

/** Asks the database whether a NexG document reference is genuine; null when it cannot say. */
export async function lookUp(reference: string, code: string | null): Promise<Verdict | null> {
  const { data, error } = await createPublicClient().rpc(
    'rpc_document_verify' as never,
    { p_reference: reference, p_code: code } as never,
  );
  if (error) return null;
  return data as unknown as Verdict;
}
