import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveOnboardingSelection } from '@nexg/booking-config/onboarding';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import type { MerchantApplicationCapture } from '@nexg/contracts/merchant-application';
import ConnectedMerchantHome from '../../../merchant-onboarding/src/ConnectedMerchantHome';
import { applicationHandler } from './merchant-application-http';
import { loadMerchantHomeSource } from './merchant-home-source';
import { merchantJourneyDatabase, type Actor } from './test-fixtures/merchant-journey-pg';

const capture: MerchantApplicationCapture = {
  registryRevision: 'nexg-booking-2026-10-31.1',
  business: {
    name: 'Maua Cafe',
    firstName: 'Amina',
    lastName: 'Owino',
    email: 'amina@example.test',
    phone: '+254712345678',
    branchCount: 8,
    registered: true,
    sameBusinessPhone: true,
    businessPhone: '',
    marketing: false,
  },
  categoryId: 'restaurants_food',
  subcategories: ['cafe'],
  answersBySubcategory: {},
  policies: { terms: true },
};
type SavedHome = Awaited<ReturnType<typeof loadMerchantHomeSource>>;
const task = (saved: SavedHome, id: string) =>
  saved.home.projection.rows.find((row) => row.id === id);
function renderHome(saved: SavedHome) {
  return renderToStaticMarkup(
    createElement(ConnectedMerchantHome, {
      previewMode: false,
      embedded: true,
      savedHome: saved.home,
      form: saved.record.payload,
      files: {},
      selection: resolveOnboardingSelection(
        saved.record.payload.categoryId ?? '',
        saved.record.payload.subcategories,
      ),
      onEdit: () => undefined,
      onRegistration: () => undefined,
      applicationStatus: saved.record.review.state,
      onExitDemo: undefined,
    }),
  );
}

describe('persisted real merchant journey', () => {
  it('keeps actual Home tasks and revision-bound review truthful across database reopen', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nexg-phase5-journey-'));
    let database: Awaited<ReturnType<typeof merchantJourneyDatabase>> | undefined;
    try {
      database = await merchantJourneyDatabase(join(directory, 'postgres'));
      const db = database;
      // authenticate models a server-verified identity. PGlite still executes the
      // real session-row, ownership, revision, role and RLS checks for every call.
      const post = async (
        command: Record<string, unknown>,
        actor: Actor = 'owner',
        expectedStatus = 200,
      ) => {
        const handler = applicationHandler({
          enabled: true,
          authenticate: async () => true,
          rpc: (name, args, signal) => db.rpc(actor, name, args, signal),
        });
        const response = await handler(
          new Request('https://merchant.example.test/api/merchant/application', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'https://merchant.example.test',
            },
            body: JSON.stringify({ operationId: randomUUID(), ...command }),
          }),
        );
        const body = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(expectedStatus);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        return body;
      };
      const started = MerchantApplicationRecord.parse(
        (await post({ command: 'start', capture })).data,
      );
      const merchantId = started.merchant_id;
      expect(started.revision).toBe(1);
      const editedCapture = structuredClone(capture);
      editedCapture.business.name = 'Maua Kitchen';
      const saved = MerchantApplicationRecord.parse(
        (await post({ command: 'save', merchantId, expectedRevision: 1, capture: editedCapture }))
          .data,
      );
      expect(saved.revision).toBe(2);
      const unchanged = MerchantApplicationRecord.parse(
        (await post({ command: 'save', merchantId, expectedRevision: 2, capture: saved.payload }))
          .data,
      );
      expect(unchanged.revision).toBe(2);
      const submitted = MerchantApplicationRecord.parse(
        (await post({ command: 'submit', merchantId, expectedRevision: 2 })).data,
      );
      expect(submitted.review).toMatchObject({
        state: 'pending',
        submitted_revision: 2,
        needs_resubmission: false,
      });

      const empty = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(empty.home.source).toBe('saved');
      expect(empty.home.projection.businessName).toBe('Maua Kitchen');
      expect(empty.home.summary.locations).toMatchObject({ state: 'known', total: 0 });
      expect(task(empty, 'location')).toMatchObject({
        status: 'missing',
        statusLabel: 'Add location',
      });
      expect(task(empty, 'offerings')).toMatchObject({
        status: 'missing',
        statusLabel: 'Add offerings',
      });
      expect(task(empty, 'launch')).toMatchObject({
        status: 'waiting',
        statusLabel: 'Waiting for review',
      });
      expect(empty.home.access).toMatchObject({ setup: true, operations: false });
      const initialHtml = renderHome(empty);
      expect(initialHtml).toContain('Welcome, Maua Kitchen');
      expect(initialHtml).toContain('A declared branch count does not create locations.');
      expect(initialHtml).toContain('Waiting for admin approval');

      const [sectionId, branchId, closedId, deletedId, requirementId, expiredRequirementId] =
        Array.from({ length: 6 }, () => randomUUID());
      await db.asActor(
        'owner',
        'insert into public.catalogue_section(id,merchant_id,name) values($1,$2,$3)',
        [sectionId, merchantId, 'Lunch'],
      );
      await db.asActor(
        'owner',
        'insert into public.catalogue_item(section_id,merchant_id,name,price_kes,available) values($1,$2,$3,$4,true),($1,$2,$5,null,false)',
        [sectionId, merchantId, 'Bean stew', 350, 'Seasonal meal'],
      );
      await db.asActor(
        'owner',
        `insert into public.merchant_branch(id,merchant_id,name,address_text,latitude,longitude,is_primary,closed_at,paused_at,deleted_at)
        values($1,$2,'Central','Kenyatta Avenue',-1.28,36.82,true,null,null,null),
        ($3,$2,'West','West Road',null,null,false,now(),now(),null),
        ($4,$2,'Retired','Old Road',null,null,false,null,null,now())`,
        [branchId, merchantId, closedId, deletedId],
      );
      await db.asActor(
        'owner',
        `insert into public.merchant_hours(merchant_id,branch_id,day_of_week,service,opens,closes,closed)
        values($1,$2,1,'Dinner','18:00','01:00',false),($1,$2,1,'Lunch','09:00','12:00',false),
        ($1,$3,2,'Late','10:00','24:00',false),($1,$4,3,'Retired','08:00','17:00',false)`,
        [merchantId, branchId, closedId, deletedId],
      );
      // Requirement metadata and past reviewer decisions are fixture facts. This
      // check does not emulate file storage or claim to verify an uploaded file.
      await db.admin(
        "insert into public.document_requirement(id,owner_type,kind,label) values($1,'merchant','journey_id','ID'),($2,'merchant','journey_permit','Permit')",
        [requirementId, expiredRequirementId],
      );
      await db.asActor(
        'owner',
        `insert into public.document(owner_type,owner_id,requirement_id,side,storage_path,mime,size_bytes,version,superseded_at)
        values('merchant',$1,$2,'front','fixture/old-front.pdf','application/pdf',256,1,now()),
        ('merchant',$1,$2,'front','fixture/current-front.pdf','application/pdf',256,2,null),
        ('merchant',$1,$2,'back','fixture/back.pdf','application/pdf',256,1,null),
        ('merchant',$1,$3,null,'fixture/permit.pdf','application/pdf',256,1,null)`,
        [merchantId, requirementId, expiredRequirementId],
      );
      await db.admin(
        "update public.document set status='verified',reviewed_at=now(),expires_at=case when requirement_id=$2 then date '2000-01-01' else date '2099-01-01' end where owner_id=$1 and (side='back' or requirement_id=$2)",
        [merchantId, expiredRequirementId],
      );
      await post({
        command: 'payout',
        merchantId,
        expectedVersion: 0,
        payout: { rail: 'mpesa_till', tillNumber: '001234' },
      });

      const withSetup = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(withSetup.home.summary).toEqual({
        catalogue: {
          state: 'known',
          total: 2,
          available: 1,
          priced: 1,
          activityLinks: 'not_recorded',
        },
        locations: {
          state: 'known',
          total: 2,
          addressed: 2,
          pinned: 1,
          closed: 1,
          paused: 1,
          primaryName: 'Central',
          primaryAddress: 'Kenyatta Avenue',
        },
        hours: {
          state: 'known',
          total: 3,
          openWindows: 3,
          days: 2,
          bookableSchedules: 'not_checked',
        },
        documents: {
          state: 'known',
          total: 3,
          uploaded: 1,
          verified: 1,
          rejected: 0,
          expired: 1,
          requirements: 'not_assessed',
        },
        payout: { state: 'declared', rail: 'mpesa_till', version: 1, verification: 'declared' },
      });
      expect(withSetup.payout.payout).toEqual({ rail: 'mpesa_till', tillNumber: '001234' });
      expect(task(withSetup, 'documents')).toMatchObject({
        status: 'invalid',
        statusLabel: 'Evidence needs attention',
      });
      expect(task(withSetup, 'payout')).toMatchObject({
        status: 'provided',
        statusLabel: 'Declaration saved',
      });
      const setupHtml = renderHome(withSetup);
      expect(setupHtml).toContain('2 catalogue entries saved, 1 with a price.');
      expect(setupHtml).toContain('2 location records saved, 2 with an address and 1 with a pin.');
      expect(setupHtml).toContain('3 opening windows saved across 2 weekdays.');
      expect(setupHtml).toContain('1 awaiting review, 1 verified, 0 rejected and 1 expired.');
      expect(setupHtml).toContain('Declaration saved');
      expect(setupHtml).not.toContain('Demo · sample data');
      expect(setupHtml).not.toContain('Registration preview');
      expect(setupHtml).not.toContain('href="/merchant-live-preview');
      await db.reopen();
      const reopened = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(reopened.home.summary).toEqual(withSetup.home.summary);
      expect(reopened.record.payload.business.name).toBe('Maua Kitchen');
      expect(reopened.home.review).toMatchObject({
        state: 'pending',
        currentRevision: true,
        submittedRevision: 2,
      });

      // A section failure remains unavailable while the other saved sections render.
      const partial = await loadMerchantHomeSource(
        db.client('owner', 'catalogue_item'),
        merchantId,
      );
      expect(task(partial, 'offerings')).toMatchObject({
        status: 'waiting',
        statusLabel: 'Unavailable',
      });
      expect(partial.home.summary.locations).toMatchObject({ state: 'known', total: 2 });
      expect(renderHome(partial)).toContain('Saved details could not be loaded.');
      await expect(loadMerchantHomeSource(db.client('stranger'), merchantId)).rejects.toThrow(
        'Your saved application could not be loaded.',
      );
      expect(
        (
          await post(
            { command: 'save', merchantId, expectedRevision: 2, capture: saved.payload },
            'stranger',
            403,
          )
        ).title,
      ).toBe('access_denied');
      await expect(loadMerchantHomeSource(db.client('revokedOwner'), merchantId)).rejects.toThrow(
        'Your saved application could not be loaded.',
      );
      const foreignRows = await db.asActor(
        'stranger',
        'select name from public.catalogue_item where merchant_id=$1',
        [merchantId],
      );
      const ownRows = await db.asActor(
        'owner',
        'select name from public.catalogue_item where merchant_id=$1 order by name',
        [merchantId],
      );
      expect(ownRows.rows).toEqual([{ name: 'Bean stew' }, { name: 'Seasonal meal' }]);
      expect(foreignRows.rows).toEqual([]);
      expect(
        (
          await db.rpc('owner', 'rpc_merchant_application_review', {
            p_merchant_id: merchantId,
            p_expected_revision: 2,
            p_operation_id: randomUUID(),
            p_decision: 'approved',
          })
        ).error?.code,
      ).toBe('42501');
      const review = async (
        revision: number,
        decision: string,
        expectedError: string | null = null,
      ) => {
        const response = await db.rpc('staff', 'rpc_merchant_application_review', {
          p_merchant_id: merchantId,
          p_expected_revision: revision,
          p_operation_id: randomUUID(),
          p_decision: decision,
          p_reason: decision === 'changes_requested' ? 'Confirm the registered name.' : null,
        });
        expect(response.error?.code ?? null).toBe(expectedError);
        return response.data;
      };
      await review(2, 'changes_requested');
      const changes = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(task(changes, 'launch')).toMatchObject({
        status: 'invalid',
        statusLabel: 'Changes requested',
      });
      expect(changes.home.access).toMatchObject({
        state: 'changes_requested',
        setup: true,
        operations: false,
      });
      expect(renderHome(changes)).toContain('Update your application');
      expect(changes.home.review.reason).toBe('Confirm the registered name.');
      expect(renderHome(changes)).toContain('Confirm the registered name.');
      const corrected = structuredClone(changes.record.payload);
      corrected.business.name = 'Maua Kitchen Limited';
      await post({ command: 'save', merchantId, expectedRevision: 2, capture: corrected });
      const stillCorrecting = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(stillCorrecting.home.review).toMatchObject({
        state: 'pending',
        submittedRevision: 2,
        needsResubmission: true,
        reason: 'Confirm the registered name.',
      });
      expect(renderHome(stillCorrecting)).toContain('Confirm the registered name.');
      await review(2, 'approved', '40001');
      await post({ command: 'submit', merchantId, expectedRevision: 3 });
      await review(3, 'approved');
      const approved = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(approved.home.review).toEqual({
        state: 'approved',
        currentRevision: true,
        submittedRevision: 3,
        needsResubmission: false,
        reason: null,
      });
      expect(approved.home.access).toMatchObject({
        state: 'approved',
        setup: true,
        operations: true,
      });
      expect(approved.home.publication).toEqual({ status: 'applied', acceptingWork: false });
      expect(task(approved, 'launch')).toMatchObject({
        status: 'waiting',
        statusLabel: 'Approved, activation pending',
      });
      const approvedHtml = renderHome(approved);
      expect(approvedHtml).toContain('Workspace approved');
      expect(approvedHtml).toContain('Your business is not published.');
      expect(approvedHtml).toContain('Not yet');
      const approvedNoop = MerchantApplicationRecord.parse(
        (
          await post({
            command: 'save',
            merchantId,
            expectedRevision: 3,
            capture: approved.record.payload,
          })
        ).data,
      );
      expect(approvedNoop).toMatchObject({
        revision: 3,
        review: { state: 'approved' },
        access: { operations: true },
      });
      const changedAgain = structuredClone(approved.record.payload);
      changedAgain.business.name = 'Maua Kitchen West';
      await post({ command: 'save', merchantId, expectedRevision: 3, capture: changedAgain });
      const newer = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(newer.home.review).toMatchObject({
        currentRevision: false,
        submittedRevision: 3,
        needsResubmission: true,
      });
      expect(newer.home.access.operations).toBe(false);
      expect(task(newer, 'launch')).toMatchObject({
        status: 'waiting',
        statusLabel: 'Resubmission needed',
      });
      expect(renderHome(newer)).toContain('Resubmit your saved changes');
      await post({ command: 'submit', merchantId, expectedRevision: 4 });
      await review(4, 'approved');
      await db.reopen();
      const final = await loadMerchantHomeSource(db.client('owner'), merchantId);
      expect(final.home.review).toEqual({
        state: 'approved',
        currentRevision: true,
        submittedRevision: 4,
        needsResubmission: false,
        reason: null,
      });
      expect(final.home.summary).toEqual(withSetup.home.summary);
      expect(final.home.publication).toEqual({ status: 'applied', acceptingWork: false });
      expect(renderHome(final)).toContain('Welcome, Maua Kitchen West');
    } finally {
      await database?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60000);
});
