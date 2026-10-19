'use server';

import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const VERIFICATION_METHODS = ['listing_ownership', 'id_document', 'call'] as const;

export async function verifyHost(input: {
  hostId: string;
  method: string;
  evidence: string;
}): Promise<{ error?: string; success?: boolean }> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.hostId)
  ) {
    return { error: 'The host ID is invalid.' };
  }

  if (!VERIFICATION_METHODS.some((method) => method === input.method)) {
    return { error: 'Choose a valid verification method.' };
  }

  const evidence = input.evidence.trim();
  if (!evidence) return { error: 'Describe the evidence you checked.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_host_verify', {
    p_host_id: input.hostId,
    p_method: input.method,
    p_evidence: { notes: evidence },
  });

  if (error) return { error: `Could not verify this host: ${error.message}` };

  revalidatePath('/hotels');
  revalidatePath(`/hotels/hosts/${input.hostId}/verify`);
  return { success: true };
}
