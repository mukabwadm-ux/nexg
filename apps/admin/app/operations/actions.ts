'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Operations dashboard writes. Who may raise an incident, the link to the
 * order's rider and the audit entry live in rpc_ops_incident_raise.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

export async function raiseIncident(input: {
  kind: string;
  severity: string;
  orderReference: string;
  description: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_ops_incident_raise', {
    p_kind: input.kind,
    p_severity: input.severity,
    p_description: input.description,
    p_order_reference: input.orderReference.trim() || undefined,
  });
  revalidatePath('/operations');
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Incident raised' };
}
