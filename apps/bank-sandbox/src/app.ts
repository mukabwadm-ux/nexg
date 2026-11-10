import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { TEST_ACCOUNTS } from './accounts.ts';
import { BankError, type BankOptions, SandboxBank } from './bank.ts';
import { checkoutPage } from './page.ts';
import { SIGNATURE_HEADER, sign } from './signing.ts';

export interface AppOptions extends BankOptions {
  apiKey: string;
}

const MAX_BODY = 64 * 1024;

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new BankError(413, 'body_too_large', 'The request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(text);
  return text;
}

function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    'x-frame-options': 'DENY',
  });
  res.end(body);
}

/**
 * The sandbox bank's HTTP surface.
 *
 *   POST /v1/collections                       open a collection (API key, Idempotency-Key)
 *   GET  /v1/collections/:id                   read it (API key)
 *   GET  /v1/collections/:id/event             its latest state as a signed event (API key)
 *   POST /v1/collections/:id/cancel            cancel a pending one (API key)
 *   POST /v1/collections/:id/simulate          drive an outcome in tests (API key)
 *   GET  /v1/webhook-deliveries?collection_id= delivery log (API key)
 *   POST /v1/webhook-deliveries/:id/retry      send one again (API key)
 *   GET  /v1/test-accounts                     the accounts on the approval page (API key)
 *   GET  /checkout/:id, POST /checkout/:id     the customer's approval page
 *   GET  /health
 */
export function createApp(options: AppOptions) {
  const bank = new SandboxBank(options);
  const key = Buffer.from(options.apiKey);

  const authorised = (req: IncomingMessage) => {
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
    return given.length === key.length && timingSafeEqual(given, key);
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://sandbox.local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';

    if (path === '/health')
      return json(res, 200, { ok: true, bank: 'NexG Sandbox Bank', livemode: false });

    const checkout = /^\/checkout\/(col_[A-Za-z0-9_-]+)$/.exec(path);
    if (checkout) {
      const collectionId = checkout[1]!;
      if (method === 'GET') return html(res, 200, checkoutPage(bank.read(collectionId)));
      if (method === 'POST') {
        const form = new URLSearchParams(await readBody(req));
        if (form.get('action') === 'cancel') bank.cancel(collectionId);
        else bank.approve(collectionId, form.get('account') ?? '');
        res.writeHead(303, { location: bank.returnUrl(collectionId), 'cache-control': 'no-store' });
        res.end();
        return;
      }
      throw new BankError(405, 'method_not_allowed', 'Use GET or POST.');
    }

    if (!path.startsWith('/v1/')) throw new BankError(404, 'not_found', 'Nothing here.');
    if (!authorised(req))
      throw new BankError(401, 'unauthorised', 'Send Authorization: Bearer <sandbox API key>.');

    if (path === '/v1/collections' && method === 'POST') {
      let input: unknown;
      try {
        input = JSON.parse(await readBody(req));
      } catch {
        throw new BankError(400, 'invalid_json', 'The body must be JSON.');
      }
      if (typeof input !== 'object' || input === null)
        throw new BankError(400, 'invalid_json', 'The body must be a JSON object.');
      const result = bank.create(
        input,
        (req.headers['idempotency-key'] as string | undefined) ?? null,
      );
      return json(res, result.created ? 201 : 200, result.collection);
    }

    if (path === '/v1/test-accounts' && method === 'GET')
      return json(res, 200, { data: TEST_ACCOUNTS });

    if (path === '/v1/webhook-deliveries' && method === 'GET') {
      return json(res, 200, {
        data: bank.deliveries(url.searchParams.get('collection_id') ?? undefined),
      });
    }
    const retry = /^\/v1\/webhook-deliveries\/(dlv_[A-Za-z0-9_-]+)\/retry$/.exec(path);
    if (retry && method === 'POST') return json(res, 200, bank.retryDelivery(retry[1]!));

    const one = /^\/v1\/collections\/(col_[A-Za-z0-9_-]+)(?:\/(event|cancel|simulate))?$/.exec(
      path,
    );
    if (one) {
      const [, collectionId, action] = one as unknown as [string, string, string | undefined];
      if (!action && method === 'GET') return json(res, 200, bank.read(collectionId));
      if (action === 'event' && method === 'GET') {
        const body = JSON.stringify(bank.latestEvent(collectionId));
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          [SIGNATURE_HEADER]: sign(body, options.webhookSecret),
        });
        res.end(body);
        return;
      }
      if (action === 'cancel' && method === 'POST')
        return json(res, 200, bank.cancel(collectionId));
      if (action === 'simulate' && method === 'POST') {
        let outcome = '';
        try {
          outcome = String(
            (JSON.parse(await readBody(req)) as { outcome?: unknown }).outcome ?? '',
          );
        } catch {
          throw new BankError(400, 'invalid_json', 'Send {"outcome": "..."}.');
        }
        return json(res, 200, bank.simulate(collectionId, outcome));
      }
    }
    throw new BankError(404, 'not_found', 'Nothing here.');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const e =
        error instanceof BankError
          ? error
          : new BankError(500, 'internal_error', 'Something went wrong in the sandbox.');
      if (!(error instanceof BankError))
        options.log?.(`error: ${error instanceof Error ? error.stack : String(error)}`);
      if (res.headersSent) return res.end();
      if ((req.url ?? '').startsWith('/checkout/')) {
        return html(
          res,
          e.status,
          `<!doctype html><title>Sandbox bank</title><p>${e.message.replace(/</g, '&lt;')}</p>`,
        );
      }
      json(res, e.status, { error: { code: e.code, message: e.message } });
    });
  });
  server.on('close', () => bank.close());
  return { server, bank };
}
