import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DELETED_WITH_THE_ACCOUNT, KEPT_AFTER_DELETION, PRIVACY_EMAIL } from './account-deletion';
import { privacy } from './legal/privacy';

const sql = readFileSync(
  fileURLToPath(
    new URL(
      '../../../supabase/migrations/20270327000200_chat_report_block_and_deletion.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('what the deletion page promises', () => {
  it('lists exactly what the app is told is deleted and kept', () => {
    for (const item of [...DELETED_WITH_THE_ACCOUNT, ...KEPT_AFTER_DELETION]) {
      expect(sql, item).toContain(`'${item.replaceAll("'", "''")}'`);
    }
  });

  it('uses the privacy contact the Privacy Policy names, and the policy links to the page', () => {
    expect(privacy.request?.email).toBe(PRIVACY_EMAIL);
    expect(privacy.request?.link?.href).toBe('/account/delete');
  });
});
