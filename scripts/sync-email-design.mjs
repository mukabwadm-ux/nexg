#!/usr/bin/env node
/**
 * Keeps the copies of the email design in step with
 * packages/contracts/src/email-design.ts:
 *
 *   - supabase/functions/notify-dispatch/email-design.ts, the same file for
 *     the edge function that sends queued emails (Deno cannot import the
 *     workspace package);
 *   - supabase/templates/otp-code.html and password-recovery.html, the
 *     emails Supabase sends itself. Locally config.toml points at them; in
 *     production they are pasted into Supabase > Authentication > Emails
 *     (Admin > Settings > Notifications & templates has a Copy button).
 *
 *   node scripts/sync-email-design.mjs
 *
 * Run it after changing email-design.ts (and `pnpm format` first, so the
 * copy matches the formatted file). packages/contracts' tests fail while
 * any copy differs.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'packages/contracts/src/email-design.ts');

copyFileSync(source, join(root, 'supabase/functions/notify-dispatch/email-design.ts'));

const design = await import(pathToFileURL(source).href);
writeFileSync(join(root, 'supabase/templates/otp-code.html'), `${design.supabaseCodeTemplate()}\n`);
writeFileSync(
  join(root, 'supabase/templates/password-recovery.html'),
  `${design.supabaseRecoveryTemplate()}\n`,
);

console.log('Email design copied to notify-dispatch; Supabase templates written.');
