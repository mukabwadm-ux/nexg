import { workerPost } from '@/lib/cinema/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* The worker stops taking new work after 40 s (WORKER_BUDGET_MS). */
export const maxDuration = 60;

/*
 * Called every minute by the database (cron_cinema_worker, through pg_net,
 * with the x-cinema-worker-secret header) when a cinema has something due: a
 * programme to sync, a paid hold to confirm, a hold that has lapsed. It runs
 * once the owner sets CINEMA_WORKER_SECRET and SUPABASE_SERVICE_ROLE_KEY on the
 * website, and cinema_worker_url and cinema_worker_secret in Vault.
 */
export const POST = workerPost;
