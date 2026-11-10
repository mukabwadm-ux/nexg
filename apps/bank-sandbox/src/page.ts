import { TEST_ACCOUNTS } from './accounts.ts';
import type { Collection } from './bank.ts';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const kes = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STYLE = `
:root{--ink:#14110f;--muted:#6b645c;--line:#e7e1d8;--bg:#f7f4ef;--card:#fff;--gold:#c9a24b;--ok:#1f7a4d;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--ink:#f3efe8;--muted:#a59e94;--line:#2c2823;--bg:#12100e;--card:#1b1815}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:30rem;margin:0 auto;padding:24px 16px 48px}
.banner{background:#fff3cd;color:#664d03;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;text-align:center}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:16px}
h1{font-size:20px;margin:0}.muted{color:var(--muted);font-size:13px}
.amount{font-size:30px;font-weight:800;margin:6px 0}
label.acc{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:8px;cursor:pointer}
label.acc:has(input:checked){border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
.row{display:flex;gap:8px;margin-top:16px}
button{flex:1;border:0;border-radius:10px;padding:12px;font-weight:800;font-size:15px;cursor:pointer}
.approve{background:var(--gold);color:#14110f}.cancel{background:transparent;border:1px solid var(--line);color:var(--ink)}
.status{font-weight:800}.succeeded{color:var(--ok)}.failed,.expired,.cancelled{color:var(--bad)}
a{color:inherit}
`;

function shell(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><style>${STYLE}</style></head>
<body><main><p class="banner">Sandbox bank. No real money moves.</p>${body}</main></body></html>`;
}

export function checkoutPage(c: Collection) {
  if (c.status !== 'pending') return resultPage(c, null);
  const accounts = TEST_ACCOUNTS.map(
    (
      a,
      i,
    ) => `<label class="acc"><input type="radio" name="account" value="${a.id}" ${i === 0 ? 'checked' : ''} required>
<span><strong>${esc(a.holder)}</strong> · ${esc(a.number)}<br><span class="muted">${esc(a.note)}</span></span></label>`,
  ).join('');
  return shell(
    'Approve payment · NexG Sandbox Bank',
    `<div class="card">
<p class="muted">NexG Sandbox Bank asks you to approve a payment</p>
<h1>${esc(c.description ?? 'Payment')}</h1>
<p class="amount">${kes(c.amount)}</p>
<p class="muted">To NexG · reference ${esc(c.merchant_reference)}</p>
</div>
<form class="card" method="post">
<p class="muted" style="margin:0">Pay from</p>
${accounts}
<div class="row">
<button class="cancel" name="action" value="cancel" formnovalidate>Cancel</button>
<button class="approve" name="action" value="approve">Approve ${kes(c.amount)}</button>
</div>
</form>`,
  );
}

export function resultPage(c: Collection, returnUrl: string | null) {
  const label: Record<string, string> = {
    succeeded: 'Paid',
    processing: 'Processing',
    failed: 'Declined',
    expired: 'Expired',
    cancelled: 'Cancelled',
    pending: 'Waiting for approval',
  };
  return shell(
    `${label[c.status]} · NexG Sandbox Bank`,
    `<div class="card"><p class="status ${c.status}">${label[c.status]}</p>
<p class="amount">${kes(c.amount)}</p>
<p class="muted">Reference ${esc(c.merchant_reference)}${c.bank_reference ? ` · bank reference ${esc(c.bank_reference)}` : ''}</p>
${c.failure_reason ? `<p>${esc(c.failure_reason)}</p>` : ''}
${returnUrl ? `<p><a href="${esc(returnUrl)}">Back to NexG</a></p>` : ''}</div>`,
  );
}
