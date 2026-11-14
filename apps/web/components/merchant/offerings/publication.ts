import {
  saveSetupOffering,
  saveSetupOfferingPublication,
} from '@/app/merchant/offering-setup-actions';
import type { Offering } from './model';

/**
 * Saves an offering and keeps its publication where the merchant asked.
 *
 * Publish, or Save changes on a published offering, keeps it published;
 * Save draft and Unpublish leave it hidden. The Offerings section on setup
 * Home and the Offerings page in the sidebar both save through here, so the
 * two editors cannot drift apart.
 */
export async function saveOfferingPublication(
  item: Offering,
  publication?: Offering['publication'],
): Promise<Offering> {
  const target = publication ?? item.publication;
  if (target === 'archived') throw new Error('Archiving offerings is not available yet.');
  const result =
    target === 'published' || item.publication === 'published'
      ? await saveSetupOfferingPublication(item, target === 'published')
      : await saveSetupOffering(item);
  if (!result.ok) throw new Error(result.message);
  return result.item;
}
