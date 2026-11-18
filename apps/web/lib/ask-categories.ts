import { MERCHANT_TAXONOMY } from '@nexg/contracts';

import type { AskCategory } from './ask-request';

/**
 * NexG's categories as the Ask form offers them: the canonical list from
 * @nexg/contracts, in its display order. Imported on the server only (the
 * page passes it to the form, the server action checks against it), so the
 * taxonomy stays out of the browser's bundle.
 */
export const ASK_CATEGORIES: readonly AskCategory[] = MERCHANT_TAXONOMY.map(
  ({ id, name, desc }) => ({ id, name, desc }),
);
