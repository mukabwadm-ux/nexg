'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

export interface ApplyResult {
  ok: boolean;
  message: string;
  merchantId?: string;
}

const merchantSchema = z.object({
  legal_name: z.string().trim().min(2, 'Enter the registered legal name.').max(200),
  trading_name: z.string().trim().min(2, 'Enter the name customers know you by.').max(200),
  category: z.enum([
    'restaurant',
    'bar_liquor',
    'laundry',
    'florist',
    'beauty_fashion',
    'pharmacy',
    'supermarket',
    'gift_shop',
    'other',
  ]),
  category_other: z.string().trim().max(120).optional(),
  contact_name: z.string().trim().min(2, 'Enter a contact person.').max(120),
  contact_phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid phone number.'),
  contact_email: z.string().trim().email('Enter a valid email address.'),
  city_id: z.string().uuid('Choose your city.'),
});

/** Step 1 of the merchant application (section 4.3). */
export async function submitMerchantApplication(_prev: ApplyResult | null, formData: FormData) {
  const parsed = merchantSchema.safeParse({
    legal_name: formData.get('legal_name'),
    trading_name: formData.get('trading_name'),
    category: formData.get('category'),
    category_other: formData.get('category_other') || undefined,
    contact_name: formData.get('contact_name'),
    contact_phone: formData.get('contact_phone'),
    contact_email: formData.get('contact_email'),
    city_id: formData.get('city_id'),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  // "Other" is only meaningful with the free text that explains it — the
  // database enforces this too, but a clear message beats a constraint error.
  if (parsed.data.category === 'other' && !parsed.data.category_other) {
    return { ok: false, message: 'Tell us what your business sells.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_merchant_apply', {
    p_legal_name: parsed.data.legal_name,
    p_trading_name: parsed.data.trading_name,
    p_category: parsed.data.category,
    p_category_other: parsed.data.category_other ?? undefined,
    p_contact_name: parsed.data.contact_name,
    p_contact_phone: parsed.data.contact_phone,
    p_contact_email: parsed.data.contact_email,
    p_city_id: parsed.data.city_id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: 'Application saved.', merchantId: data as unknown as string };
}
