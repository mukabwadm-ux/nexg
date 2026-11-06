import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function hostWorkspaceHtml() {
  try {
    const html = await readFile(join(process.cwd(), 'public', 'nexg-hosts-workspace', 'index.html'), 'utf8');
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch {
    return new Response('The workspace is temporarily unavailable.', { status: 503 });
  }
}
