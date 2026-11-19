'use server';

import { revalidatePath } from 'next/cache';

import type { Outcome } from '@/app/merchant/actions';
import { ITEM_KINDS, type ItemKind } from '@/lib/catalogue-kinds';
import { merchantActionClient } from '@/lib/merchant-action-access';

/**
 * Choices, add-ons and units on the Menu page.
 *
 * Groups are written through rpc_merchant_option_group_save and attached to
 * items through rpc_merchant_item_option_groups_set
 * (20270111000100_catalogue_selling); checkout prices them from the same rows.
 */

export interface OptionInput {
  id?: string;
  name: string;
  /** Extra price in whole shillings. */
  extraKes: number;
  available: boolean;
}

export interface OptionGroupInput {
  id?: string;
  name: string;
  required: boolean;
  maxChoices: number;
  archived?: boolean;
  options: OptionInput[];
}

export interface ItemUnitInput {
  soldBy: 'each' | 'pack' | 'weight' | 'volume';
  unitLabel: string | null;
  unitStep: number;
  unitMin: number | null;
  unitMax: number | null;
  priceIsEstimate: boolean;
}

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath('/merchant/menu');
  revalidatePath('/discover');
}

export async function saveOptionGroup(group: OptionGroupInput): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient({ access: 'setup' });
  const name = group.name?.trim();
  if (!name) return { ok: false, message: 'Name the group, for example "Size" or "Extras".' };
  const options = (group.options ?? []).filter((o) => o.name?.trim());
  if (options.length === 0) return { ok: false, message: 'Add at least one option.' };
  if (
    options.some((o) => !Number.isInteger(o.extraKes) || o.extraKes < 0 || o.extraKes > 1_000_000)
  )
    return { ok: false, message: 'Enter each extra price in whole shillings, 0 or more.' };
  const maxChoices = Math.max(1, Math.min(options.length, Math.trunc(group.maxChoices || 1)));
  const { error } = await client.rpc('rpc_merchant_option_group_save', {
    p_merchant_id: merchantId,
    p_group: {
      ...(group.id && uuid.test(group.id) ? { id: group.id } : {}),
      name,
      required: group.required,
      min_choices: group.required ? 1 : 0,
      max_choices: maxChoices,
      archived: Boolean(group.archived),
      options: options.map((o) => ({
        ...(o.id && uuid.test(o.id) ? { id: o.id } : {}),
        name: o.name.trim(),
        extra_cents: o.extraKes * 100,
        available: o.available,
      })),
    },
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  return {
    ok: true,
    message: group.archived ? 'Group removed.' : 'Saved. New orders use these choices.',
  };
}

export async function setItemOptionGroups(itemId: string, groupIds: string[]): Promise<Outcome> {
  const { client } = await merchantActionClient({ access: 'setup' });
  if (!uuid.test(itemId) || groupIds.some((id) => !uuid.test(id)))
    return { ok: false, message: 'Choose a valid item and groups.' };
  const { error } = await client.rpc('rpc_merchant_item_option_groups_set', {
    p_item_id: itemId,
    p_group_ids: groupIds,
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'Choices updated for this item.' };
}

export async function setItemUnit(itemId: string, unit: ItemUnitInput): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient({ access: 'setup' });
  if (!uuid.test(itemId)) return { ok: false, message: 'Choose a valid item.' };
  if (!['each', 'pack', 'weight', 'volume'].includes(unit.soldBy))
    return { ok: false, message: 'Choose how this item is sold.' };
  const measured = unit.soldBy === 'weight' || unit.soldBy === 'volume';
  const label = unit.unitLabel?.trim() || null;
  if (measured && !label) return { ok: false, message: 'Say the unit, for example kg or litre.' };
  const step = measured ? unit.unitStep : 1;
  if (!(step > 0) || step > 1000) return { ok: false, message: 'Enter a step above 0.' };
  if (unit.unitMin != null && unit.unitMax != null && unit.unitMax < unit.unitMin)
    return { ok: false, message: 'The most must be at least the least.' };
  const { data, error } = await client
    .from('catalogue_item')
    .update({
      sold_by: unit.soldBy,
      unit_label: measured || unit.soldBy === 'pack' ? label : null,
      unit_step: step,
      unit_min: measured ? unit.unitMin : null,
      unit_max: measured ? unit.unitMax : null,
      price_is_estimate: measured && unit.priceIsEstimate,
    })
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'This item is not in your current workspace.' };
  refresh();
  return {
    ok: true,
    message: measured
      ? `Saved. The price is per ${label}; customers buy in steps of ${step} ${label}.`
      : 'Saved.',
  };
}

/**
 * How customers get an item: bought through checkout, or booked through one of
 * the shop's booking offerings (the app then books it with the booking engine).
 */
export async function setItemBooking(
  itemId: string,
  kind: ItemKind,
  offeringId: string | null,
): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient({ access: 'setup' });
  if (!uuid.test(itemId)) return { ok: false, message: 'Choose a valid item.' };
  if (!(ITEM_KINDS as readonly string[]).includes(kind))
    return { ok: false, message: 'Choose how customers get this item.' };
  const offering = offeringId?.trim() || null;
  if (kind !== 'buy' && !offering)
    return { ok: false, message: 'Choose which booking this item opens.' };
  if (offering && !/^[A-Za-z0-9_-]{1,128}$/.test(offering))
    return { ok: false, message: 'Choose a booking from your list.' };
  const { data, error } = await client
    .from('catalogue_item')
    .update({ kind, booking_offering_id: kind === 'buy' ? null : offering })
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'This item is not in your current workspace.' };
  refresh();
  return {
    ok: true,
    message:
      kind === 'buy'
        ? 'Saved. Customers add this item to the basket.'
        : 'Saved. Customers book this item instead of adding it to the basket.',
  };
}
