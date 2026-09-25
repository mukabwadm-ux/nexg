'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

export interface ApplyResult {
  ok: boolean;
  message: string;
  riderId?: string;
}

const riderSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter your first name.').max(80),
  last_name: z.string().trim().min(1, 'Enter your last name.').max(80),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid M-Pesa number.'),
  city_id: z.string().uuid('Choose the city you will ride in.'),
  vehicle: z.enum(['motorbike', 'bicycle', 'car', 'tuktuk']),
  plate_no: z.string().trim().max(20).optional(),
});

/**
 * Step 1 of the rider application (section 4.2).
 *
 * The spec puts an SMS OTP in front of this. The provider is still a [DECIDE]
 * in section 8 and no account exists yet, so the application is created
 * unverified — which the schema allows, rider.user_id being nullable until the
 * phone is verified. M4 adds the OTP in front of this call; nothing here has
 * to change when it does, because status stays `applied` either way and
 * nothing is visible or dispatchable until an admin verifies the documents.
 */
export async function submitRiderApplication(_prev: ApplyResult | null, formData: FormData) {
  const parsed = riderSchema.safeParse({
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    phone: formData.get('phone'),
    city_id: formData.get('city_id'),
    vehicle: formData.get('vehicle'),
    plate_no: formData.get('plate_no') || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  // A motorised rider needs a plate before activation; ask for it up front so
  // the console is not chasing it later (section 5.2).
  if (parsed.data.vehicle !== 'bicycle' && !parsed.data.plate_no) {
    return { ok: false, message: 'Enter your number plate.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_rider_apply', {
    p_first_name: parsed.data.first_name,
    p_last_name: parsed.data.last_name,
    p_phone: parsed.data.phone,
    p_city_id: parsed.data.city_id,
    p_vehicle: parsed.data.vehicle,
    p_plate_no: parsed.data.plate_no ?? undefined,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: 'Application saved.',
    riderId: data as unknown as string,
  };
}
