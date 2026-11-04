import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import {
  merchantJourneyDatabase,
  type Actor,
} from '../../web/lib/test-fixtures/merchant-journey-pg';
import { merchantApplicationReviewHandler } from './merchant-application-review-http';
import { merchantApplicationReviewReader } from './merchant-application-review';
import type { ReviewRpcResult } from './merchant-application-review-contracts';
import { reviewCapture } from './test-fixtures/application-review';

vi.mock('./supabase/server', () => ({ createClient: vi.fn() }));

describe('admin review with actual production PostgreSQL RPCs', () => {
  it('enforces scoped reads and exact submitted decisions, preserves receipts, and leaves publication unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nexg-phase6-review-'));
    let database: Awaited<ReturnType<typeof merchantJourneyDatabase>> | undefined;
    try {
      database = await merchantJourneyDatabase(join(directory, 'postgres'));
      const db = database;
      const migration = await readFile(
        new URL(
          '../../../supabase/migrations/20261102000300_merchant_application_admin_review.sql',
          import.meta.url,
        ),
        'utf8',
      );
      // This block executes the unchanged additive migration with the fixture's
      // administrator. It does not change the default Phase 4/5 fixture schema.
      await db.admin(`do $phase6_migration$ begin ${migration}\n end $phase6_migration$;`);
      const readArguments: Record<string, string[]> = {
        rpc_merchant_application_review_queue: [
          'p_state',
          'p_limit',
          'p_after_updated_at',
          'p_after_merchant_id',
        ],
        rpc_merchant_application_review_detail: ['p_merchant_id'],
        rpc_merchant_application_review_lookup: ['p_merchant_id'],
      };
      const readRpc = async (
        actor: Actor,
        name: string,
        args: Record<string, unknown>,
      ): Promise<ReviewRpcResult> => {
        const keys = readArguments[name];
        if (!keys || Object.keys(args).some((key) => !keys.includes(key)))
          throw new Error('Read outside Phase 6 allowlist');
        try {
          const result = await db.asActor(
            actor,
            `select public.${name}(${keys.map((_, index) => `$${index + 1}`).join(',')}) as value`,
            keys.map((key) => args[key] ?? null),
          );
          return { data: result.rows[0]!.value, error: null };
        } catch (error) {
          const failure = error as { code?: string; message?: string; hint?: string };
          return {
            data: null,
            error: { code: failure.code, message: failure.message, hint: failure.hint },
          };
        }
      };
      const source = (actor: Actor = 'staff') =>
        merchantApplicationReviewReader({
          authenticate: async () => db.ids[actor === 'revokedOwner' ? 'owner' : actor]!,
          rpc: (name, args) => readRpc(actor, name, args),
        });
      const command = async (actor: Actor, name: string, args: Record<string, unknown>) => {
        const result = await db.rpc(actor, name, args);
        expect(result.error, JSON.stringify(result.error)).toBeNull();
        return MerchantApplicationRecord.parse(result.data);
      };
      const start = async (name: string, email: string, actor: Actor = 'owner') => {
        const started = await command(actor, 'rpc_merchant_application_start', {
          p_operation_id: randomUUID(),
          p_payload: reviewCapture(name, email),
          p_merchant_id: null,
        });
        return command(actor, 'rpc_merchant_application_submit', {
          p_merchant_id: started.merchant_id,
          p_expected_revision: 1,
          p_operation_id: randomUUID(),
        });
      };
      const post = async (
        merchantId: string,
        revision: number,
        decision: string,
        reason = '',
        operationId = randomUUID(),
        loseReply = false,
      ) => {
        const handler = merchantApplicationReviewHandler({
          authenticate: async () => db.ids.staff!,
          rpc: async (name, args, signal) => {
            const result = await db.rpc('staff', name, args, signal);
            if (loseReply) throw new Error('Synthetic reply lost after database committed');
            return result;
          },
        });
        const response = await handler(
          new Request('https://console.test/api/merchant-applications/review', {
            method: 'POST',
            headers: {
              origin: 'https://console.test',
              'content-type': 'application/json',
              'x-review-actor-id': db.ids.staff!,
            },
            body: JSON.stringify({
              merchantId,
              expectedRevision: revision,
              decision,
              reason,
              operationId,
            }),
          }),
        );
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        return { response, body: await response.json() };
      };

      const cityless = await start('Unassigned Cafe', 'unassigned@example.test');
      const downtown = await start('Downtown Cafe', 'downtown@example.test', 'stranger');
      const foreign = await start('Foreign Cafe', 'foreign@example.test', 'stranger');
      const city = randomUUID(),
        otherCity = randomUUID();
      await db.admin('update public.merchant set city_id=$2 where id=$1', [
        downtown.merchant_id,
        city,
      ]);
      await db.admin('update public.merchant set city_id=$2 where id=$1', [
        foreign.merchant_id,
        otherCity,
      ]);
      const payout = await db.rpc('owner', 'rpc_merchant_application_payout_save', {
        p_merchant_id: cityless.merchant_id,
        p_expected_version: 0,
        p_operation_id: randomUUID(),
        p_payout: {
          rail: 'bank',
          bankName: 'Fixture bank',
          accountName: 'Private owner',
          accountNumber: 'PRIVATE-123456',
        },
      });
      expect(payout.error).toBeNull();

      const first = await source().queue({ limit: 1 });
      const second = await source().queue({ limit: 1, cursor: first.nextCursor! });
      const third = await source().queue({ limit: 1, cursor: second.nextCursor! });
      expect(
        [...first.items, ...second.items, ...third.items].map((row) => row.businessName).sort(),
      ).toEqual(['Downtown Cafe', 'Foreign Cafe', 'Unassigned Cafe']);
      expect(
        new Set([...first.items, ...second.items, ...third.items].map((row) => row.merchantId))
          .size,
      ).toBe(3);
      expect(third.nextCursor).toBeNull();
      expect((await source().detail(cityless.merchant_id)).canReview).toBe(true);
      expect(await source().managed(cityless.merchant_id)).toBe(true);
      await expect(source('owner').queue()).rejects.toMatchObject({
        status: 403,
        code: 'access_denied',
      });
      await expect(source('stranger').detail(cityless.merchant_id)).rejects.toMatchObject({
        status: 403,
      });
      const invalidCursor = await readRpc('staff', 'rpc_merchant_application_review_queue', {
        p_state: 'pending',
        p_limit: 1,
        p_after_updated_at: '2026-11-02T09:00:00Z',
        p_after_merchant_id: null,
      });
      expect(invalidCursor.error?.code).toBe('22023');

      await db.admin('update public.role_grant set city_id=$1 where staff_user_id=$2', [
        city,
        db.ids.staffId,
      ]);
      expect((await source().queue()).items.map((row) => row.businessName)).toEqual([
        'Downtown Cafe',
      ]);
      expect((await source().detail(downtown.merchant_id)).record.payload.business.name).toBe(
        'Downtown Cafe',
      );
      await expect(source().detail(cityless.merchant_id)).rejects.toMatchObject({ status: 403 });
      await expect(source().detail(foreign.merchant_id)).rejects.toMatchObject({ status: 403 });
      expect((await post(cityless.merchant_id, 1, 'approved')).response.status).toBe(403);
      await db.admin(
        'update public.role_grant set city_id=null,revoked_at=now() where staff_user_id=$1',
        [db.ids.staffId],
      );
      await expect(source().queue()).rejects.toMatchObject({ status: 403 });
      await db.admin(
        "update public.role_grant set revoked_at=null,expires_at=now()-interval '1 second' where staff_user_id=$1",
        [db.ids.staffId],
      );
      await expect(source().detail(cityless.merchant_id)).rejects.toMatchObject({ status: 403 });
      await db.admin('update public.role_grant set expires_at=null where staff_user_id=$1', [
        db.ids.staffId,
      ]);
      await db.admin("update public.staff_user set status='disabled' where id=$1", [
        db.ids.staffId,
      ]);
      await expect(source().queue()).rejects.toMatchObject({ status: 403 });
      await db.admin("update public.staff_user set status='active' where id=$1", [db.ids.staffId]);
      await db.admin("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [
        db.ids.staffSession,
      ]);
      await expect(source().detail(cityless.merchant_id)).rejects.toMatchObject({ status: 403 });
      expect((await post(cityless.merchant_id, 1, 'approved')).response.status).toBe(403);
      await db.admin('update auth.sessions set not_after=null where id=$1', [db.ids.staffSession]);

      const savedPayload = reviewCapture('Unassigned Cafe, updated', 'unassigned@example.test');
      const edited = await command('owner', 'rpc_merchant_application_save', {
        p_merchant_id: cityless.merchant_id,
        p_expected_revision: 1,
        p_operation_id: randomUUID(),
        p_payload: savedPayload,
      });
      expect(edited.revision).toBe(2);
      const stale = await source().detail(cityless.merchant_id);
      expect(stale.record.payload.business.name).toBe('Unassigned Cafe, updated');
      expect(stale.submitted?.payload.business.name).toBe('Unassigned Cafe');
      expect(stale.submitted?.revision).toBe(1);
      expect(stale.canReview).toBe(false);
      expect(JSON.stringify(stale)).not.toContain('PRIVATE-123456');
      expect((await post(cityless.merchant_id, 1, 'approved')).response.status).toBe(409);
      expect((await post(cityless.merchant_id, 2, 'approved')).response.status).toBe(409);
      await command('owner', 'rpc_merchant_application_submit', {
        p_merchant_id: cityless.merchant_id,
        p_expected_revision: 2,
        p_operation_id: randomUUID(),
      });
      expect((await source().detail(cityless.merchant_id)).submitted?.payload.business.name).toBe(
        'Unassigned Cafe, updated',
      );

      const changesOperation = randomUUID();
      const changes = await post(
        cityless.merchant_id,
        2,
        'changes_requested',
        'Please correct your registered business name.',
        changesOperation,
      );
      expect(changes.response.status).toBe(200);
      expect(changes.body.review).toMatchObject({
        state: 'changes_requested',
        reason: 'Please correct your registered business name.',
        submitted_revision: 2,
      });
      expect(changes.body.access.operations).toBe(false);
      expect((await source().detail(cityless.merchant_id)).canReview).toBe(false);
      const replay = await post(
        cityless.merchant_id,
        2,
        'changes_requested',
        'Please correct your registered business name.',
        changesOperation,
      );
      expect(replay.response.status).toBe(200);
      expect(replay.body).toEqual(changes.body);
      expect(
        (
          await post(
            cityless.merchant_id,
            2,
            'changes_requested',
            'Different request.',
            changesOperation,
          )
        ).response.status,
      ).toBe(409);
      expect((await post(cityless.merchant_id, 2, 'approved')).response.status).toBe(422);
      const ownerRead = await command('owner', 'rpc_merchant_application_read', {
        p_merchant_id: cityless.merchant_id,
      });
      expect(ownerRead.review.reason).toBe('Please correct your registered business name.');

      await command('owner', 'rpc_merchant_application_save', {
        p_merchant_id: cityless.merchant_id,
        p_expected_revision: 2,
        p_operation_id: randomUUID(),
        p_payload: reviewCapture('Unassigned Cafe Limited', 'unassigned@example.test'),
      });
      await command('owner', 'rpc_merchant_application_submit', {
        p_merchant_id: cityless.merchant_id,
        p_expected_revision: 3,
        p_operation_id: randomUUID(),
      });
      const approveOperation = randomUUID();
      const unknown = await post(cityless.merchant_id, 3, 'approved', '', approveOperation, true);
      expect(unknown.response.status).toBe(503);
      expect(unknown.body.type).toBe('urn:nexg:application-review:review_unavailable');
      const approved = await post(cityless.merchant_id, 3, 'approved', '', approveOperation);
      expect(approved.response.status).toBe(200);
      expect(approved.body).toMatchObject({
        revision: 3,
        operation_id: approveOperation,
        review: { state: 'approved', submitted_revision: 3 },
        access: { operations: true },
        publication: { status: 'applied', accepting_work: false },
      });
      const ownerAccess = await db.rpc('owner', 'rpc_merchant_workspace_access', {
        p_merchant_id: cityless.merchant_id,
      });
      expect(ownerAccess.data).toMatchObject({ state: 'approved', operations: true, setup: true });
      const publication = await db.admin(
        'select status,accepting_orders from public.merchant where id=$1',
        [cityless.merchant_id],
      );
      expect(publication.rows).toEqual([{ status: 'applied', accepting_orders: false }]);
      const audit = await db.admin(
        "select count(*)::int as count from audit.fixture_event where action='merchant.application_reviewed'",
      );
      expect(audit.rows).toEqual([{ count: 2 }]);

      const rejected = await post(
        downtown.merchant_id,
        1,
        'rejected',
        'This registration cannot be accepted.',
      );
      expect(rejected.response.status).toBe(200);
      const rejectedAccess = await db.rpc('stranger', 'rpc_merchant_workspace_access', {
        p_merchant_id: downtown.merchant_id,
      });
      expect(rejectedAccess.data).toMatchObject({
        state: 'rejected',
        operations: false,
        setup: false,
      });
      expect(
        (await source().queue({ state: 'approved' })).items.map((row) => row.businessName),
      ).toEqual(['Unassigned Cafe Limited']);
      const legacyId = randomUUID();
      await db.admin(
        "insert into public.merchant(id,trading_name,contact_name,contact_phone) values($1,'Legacy Cafe','Legacy owner','+254712345678')",
        [legacyId],
      );
      expect(await source().managed(legacyId)).toBe(false);
      const permissions = await db.admin(
        "select has_function_privilege('anon','public.rpc_merchant_application_review_queue(text,integer,timestamptz,uuid)','execute') as anonymous,has_function_privilege('authenticated','public.rpc_merchant_application_review_detail(uuid)','execute') as signed_in",
      );
      expect(permissions.rows).toEqual([{ anonymous: false, signed_in: true }]);

      await db.reopen();
      const persisted = await source().detail(cityless.merchant_id);
      expect(persisted).toMatchObject({
        canReview: false,
        record: { revision: 3, review: { state: 'approved' } },
        submitted: { revision: 3, payload: { business: { name: 'Unassigned Cafe Limited' } } },
      });
      const persistedReplay = await post(cityless.merchant_id, 3, 'approved', '', approveOperation);
      expect(persistedReplay.response.status).toBe(200);
      expect(persistedReplay.body).toEqual(approved.body);
    } finally {
      await database?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60000);
});
