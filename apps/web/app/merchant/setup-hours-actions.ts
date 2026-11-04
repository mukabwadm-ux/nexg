'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { merchantActionClient } from '@/lib/merchant-action-access';

const resultSchema = z.object({
  ambiguous: z.boolean(),
  version: z.string().regex(/^[a-f0-9]{32}$/),
  rows: z.array(z.object({
    day: z.number().int().min(0).max(6),
    closed: z.boolean(),
    opens: z.string().nullable(),
    closes: z.string().nullable(),
    updatedAt: z.string(),
  })),
});
const daySchema = z.object({
  day: z.number().int().min(0).max(6),
  state: z.enum(['open', 'closed', 'unspecified']),
  opens: z.string().optional(),
  closes: z.string().optional(),
});
export type SavedSetupHours = z.infer<typeof resultSchema>;
type RpcResult = { data: unknown; error: { message: string } | null };

async function callSetupHours(name: string, input: Record<string, unknown>): Promise<RpcResult> {
  const { client, merchantId } = await merchantActionClient({ access: 'setup' });
  // These RPCs are introduced by the adjacent migration. The generated database
  // types can be refreshed once the migration has been applied.
  const rpc = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  return await rpc(name, { ...input, p_merchant_id: merchantId });
}

export async function loadSetupHours(): Promise<{ok: true; value: SavedSetupHours} | {ok: false; message: string}> {
  try {
    const { data, error } = await callSetupHours('rpc_merchant_setup_hours_load', {});
    const parsed = resultSchema.safeParse(data);
    if (error || !parsed.success) return { ok: false, message: 'Could not load your saved opening hours.' };
    return { ok: true, value: parsed.data };
  } catch {
    return { ok: false, message: 'Could not access your opening hours.' };
  }
}

export async function saveSetupHours(days: z.infer<typeof daySchema>[], version: string): Promise<{ok: true; value: SavedSetupHours} | {ok: false; message: string}> {
  const parsed = z.array(daySchema).length(7).safeParse(days);
  if (!parsed.success || !/^[a-f0-9]{32}$/.test(version)) return {ok: false, message: 'Check your opening hours and try again.'};
  try {
    const { data, error } = await callSetupHours('rpc_merchant_setup_hours_save', { p_days: parsed.data, p_version: version });
    const saved = resultSchema.safeParse(data);
    if (error || !saved.success) return {ok: false, message: error?.message ?? 'Could not save your opening hours.'};
    revalidatePath('/merchant');
    return {ok: true, value: saved.data};
  } catch {
    return {ok: false, message: 'Could not save your opening hours. Your edits remain open.'};
  }
}
