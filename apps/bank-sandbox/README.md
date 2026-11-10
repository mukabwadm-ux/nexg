# NexG Sandbox Bank

A stand-in bank for testing pay-by-bank at checkout end to end. It behaves like a bank: NexG
opens a collection, the guest approves it on the bank's page, and the bank sends NexG a signed
event. **No real money moves**, and the NexG web app refuses to use it on the production
deployment.

The full contract (endpoints, events, signatures, what NexG checks) is in the developer docs:
`apps/api/app/docs/bank-transfers/page.tsx`, served at `/docs/bank-transfers`.

## Run it

Generate the two values on the machine that runs the sandbox. Never paste them into chat or
commit them.

```bash
export SANDBOX_API_KEY=$(openssl rand -hex 24)
export SANDBOX_WEBHOOK_SECRET=$(openssl rand -hex 32)
export PUBLIC_URL=http://localhost:4010
pnpm --filter @nexg/bank-sandbox dev
```

Or in a container, from the repository root (copy `.env.example` to `.env` next to this file
and fill it in on the server):

```bash
docker build -f apps/bank-sandbox/Dockerfile -t nexg-bank-sandbox .
docker run -d --name nexg-bank-sandbox --restart unless-stopped \
  -p 127.0.0.1:4010:4010 -v nexg-bank-sandbox:/data \
  --env-file apps/bank-sandbox/.env nexg-bank-sandbox
```

Put it behind HTTPS (for example Caddy, `bank-sandbox.<your domain>` → `127.0.0.1:4010`) and
set `PUBLIC_URL` to that address so the approval links work from a phone.

| Setting                  | Meaning                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `SANDBOX_API_KEY`        | 24+ characters. NexG sends it as `Authorization: Bearer`.  |
| `SANDBOX_WEBHOOK_SECRET` | 32+ characters. Signs every event.                         |
| `PUBLIC_URL`             | Where guests reach the approval page.                      |
| `PORT`, `HOST`           | Default `4010`, `127.0.0.1` (`0.0.0.0` in the container).  |
| `DATA_FILE`              | Optional JSON file that keeps state across restarts.       |
| `COLLECTION_TTL_MINUTES` | How long a collection waits for approval. Default 30.      |
| `SLOW_APPROVAL_SECONDS`  | How long the "Delayed approval" account takes. Default 20. |

## Connect NexG to it

In the web app's server environment (Vercel, or `apps/web/.env.local`), never with a
`NEXT_PUBLIC_` prefix:

```
BANK_PROVIDER=sandbox
BANK_API_URL=<the sandbox address>
BANK_API_KEY=<same value as SANDBOX_API_KEY>
BANK_WEBHOOK_SECRET=<same value as SANDBOX_WEBHOOK_SECRET>
```

and once in the Supabase SQL editor, typing the value there:

```sql
select vault.create_secret('<same value as BANK_WEBHOOK_SECRET>', 'bank_webhook_secret');
```

after running `supabase/migrations/20261130000100_bank_collections.sql`. The **Bank** option then
appears at checkout. The sandbox must be able to reach
`<NexG web address>/api/payments/bank/webhook`.

## Test accounts

| Account                           | Behaviour                                                    |
| --------------------------------- | ------------------------------------------------------------ |
| Wanjiru Kamau · 0110 0000 4821    | KES 500,000 available. Pays.                                 |
| Otieno Achieng · 0110 0000 1177   | KES 150 available. Fails with `insufficient_funds` above it. |
| Blocked Account · 0110 0000 9020  | Fails with `account_blocked`.                                |
| Delayed Approval · 0110 0000 3315 | Processing for a while, then pays.                           |

Automated tests can skip the page: `POST /v1/collections/{id}/simulate` with
`{"outcome": "succeed" | "insufficient_funds" | "decline" | "cancel" | "expire"}`. Webhook
deliveries are listed at `GET /v1/webhook-deliveries?collection_id=…` and can be resent with
`POST /v1/webhook-deliveries/{id}/retry`. Failed deliveries are retried after 2 s, 10 s, 1 min,
5 min and 30 min.

## Tests

```bash
pnpm --filter @nexg/bank-sandbox test
```
