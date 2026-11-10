import { createApp } from './app.ts';

/*
 * NexG Sandbox Bank. Settings, all from the environment:
 *
 *   SANDBOX_API_KEY         the key NexG sends as "Authorization: Bearer"; 24+ characters
 *   SANDBOX_WEBHOOK_SECRET  signs every event; the same value as NexG's BANK_WEBHOOK_SECRET; 32+ characters
 *   PUBLIC_URL              where customers reach this service (approval page links), e.g. https://bank-sandbox.example.com
 *   PORT                    default 4010
 *   HOST                    default 127.0.0.1 (0.0.0.0 in a container)
 *   DATA_FILE               optional JSON file that keeps state across restarts
 *   COLLECTION_TTL_MINUTES  how long a collection waits for approval, default 30
 *   SLOW_APPROVAL_SECONDS   how long the "Delayed approval" account takes, default 20
 */
const env = process.env;
const apiKey = env.SANDBOX_API_KEY?.trim() ?? '';
const webhookSecret = env.SANDBOX_WEBHOOK_SECRET?.trim() ?? '';
if (apiKey.length < 24) throw new Error('Set SANDBOX_API_KEY (24 or more characters).');
if (webhookSecret.length < 32)
  throw new Error('Set SANDBOX_WEBHOOK_SECRET (32 or more characters).');

const port = Number(env.PORT ?? 4010);
const host = env.HOST ?? '127.0.0.1';
const publicUrl = env.PUBLIC_URL?.trim() || `http://localhost:${port}`;

const { server } = createApp({
  apiKey,
  webhookSecret,
  publicUrl,
  dataFile: env.DATA_FILE?.trim() || undefined,
  collectionTtlMs: Number(env.COLLECTION_TTL_MINUTES ?? 30) * 60_000,
  slowApprovalMs: Number(env.SLOW_APPROVAL_SECONDS ?? 20) * 1000,
  log: (line) => console.log(`[bank-sandbox] ${line}`),
});

server.listen(port, host, () => {
  console.log(
    `[bank-sandbox] NexG Sandbox Bank listening on http://${host}:${port} (public ${publicUrl}). No real money moves.`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
