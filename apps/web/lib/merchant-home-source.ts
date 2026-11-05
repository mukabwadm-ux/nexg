import { z } from 'zod';
import { projectOnboardingHome } from '@nexg/booking-config/onboarding-home';
import type {
  OnboardingHomeProjection,
  OnboardingHomeRow,
} from '@nexg/booking-config/onboarding-home';
import type {
  MerchantApplicationRecord,
  MerchantPayoutRecord,
} from '@nexg/contracts/merchant-application';
import { loadApplicationView } from './merchant-application-load';
import { loadMerchantWorkspaceAccess, type MerchantWorkspaceAccess } from './merchant-access';

type Known<T> = { state: 'known' } & T;
type Unavailable = { state: 'unavailable' };
export type MerchantHomeSection<T> = { state: 'known'; records: T[] } | Unavailable;

const identifier = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const text = z.string().max(4096);
const catalogueSchema = z.object({
  id: identifier,
  merchant_id: identifier,
  name: text.trim().min(1),
  price_kes: z.number().int().min(1).max(1000000).nullable(),
  available: z.boolean(),
});
const branchSchema = z.object({
  id: identifier,
  merchant_id: identifier,
  name: text.nullable(),
  address_text: text.nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  is_primary: z.boolean(),
  deleted_at: instant.nullable(),
  closed_at: instant.nullable(),
  paused_at: instant.nullable(),
});
const hoursSchema = z.object({
  id: identifier,
  merchant_id: identifier,
  branch_id: identifier.nullable(),
  day_of_week: z.number().int().min(0).max(6),
  service: text,
  opens: text.nullable(),
  closes: text.nullable(),
  closed: z.boolean(),
});
const documentSchema = z
  .object({
    id: identifier,
    owner_type: z.literal('merchant'),
    owner_id: identifier,
    requirement_id: identifier,
    side: z.enum(['front', 'back']).nullable(),
    status: z.enum(['uploaded', 'verified', 'rejected', 'expired']),
    reviewed_at: instant.nullable(),
    expires_at: date.nullable(),
    superseded_at: instant.nullable(),
  })
  .refine(
    (value) => !['verified', 'rejected'].includes(value.status) || value.reviewed_at !== null,
  );

export type MerchantHomeCatalogue = z.infer<typeof catalogueSchema>;
export type MerchantHomeBranch = z.infer<typeof branchSchema>;
export type MerchantHomeHours = z.infer<typeof hoursSchema>;
export type MerchantHomeDocument = z.infer<typeof documentSchema>;
export type MerchantSavedHomeSource = {
  source: 'saved';
  merchantId: string;
  revision: number;
  projection: OnboardingHomeProjection;
  summary: {
    catalogue:
      | Known<{ total: number; available: number; priced: number; activityLinks: 'not_recorded' }>
      | Unavailable;
    locations:
      | Known<{
          total: number;
          addressed: number;
          pinned: number;
          closed: number;
          paused: number;
          primaryName: string | null;
          primaryAddress: string | null;
        }>
      | Unavailable;
    hours:
      | Known<{
          total: number;
          openWindows: number;
          days: number;
          bookableSchedules: 'not_checked';
        }>
      | Unavailable;
    documents:
      | Known<{
          total: number;
          uploaded: number;
          verified: number;
          rejected: number;
          expired: number;
          requirements: 'not_assessed';
        }>
      | Unavailable;
    payout: {
      state: 'declared' | 'not_provided';
      rail: string | null;
      version: number;
      verification: 'declared';
    };
  };
  review: {
    state: MerchantApplicationRecord['review']['state'];
    currentRevision: boolean;
    submittedRevision: number | null;
    needsResubmission: boolean;
    reason: string | null;
  };
  publication: { status: string; acceptingWork: false };
  access: MerchantWorkspaceAccess;
};

type SavedHomeInput = {
  record: MerchantApplicationRecord;
  payout: MerchantPayoutRecord;
  access: MerchantWorkspaceAccess;
  catalogue: MerchantHomeSection<MerchantHomeCatalogue>;
  branches: MerchantHomeSection<MerchantHomeBranch>;
  hours: MerchantHomeSection<MerchantHomeHours>;
  documents: MerchantHomeSection<MerchantHomeDocument>;
  now?: Date;
};
const unavailable: Unavailable = { state: 'unavailable' };
const present = (value: string | null) => Boolean(value?.trim());
// PostgreSQL accepts seconds, fractional seconds, overnight windows and 24:00.
const validTime = (value: string | null) =>
  value !== null &&
  /^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?|24:00(?::00(?:\.0+)?)?)$/.test(value);

/** Saved facts remain distinct from declared activities, approval and activation. */
export function projectMerchantSavedHome(input: SavedHomeInput): MerchantSavedHomeSource {
  const { record, payout, access } = input;
  const projection = projectOnboardingHome({
    ...record.payload,
    categoryId: record.payload.categoryId ?? undefined,
    business: {
      ...record.payload.business,
      branchCount: record.payload.business.branchCount ?? undefined,
    },
  });
  // Category-specific answers are useful application context, but the saved
  // Home must not reopen the onboarding editor as a second setup surface.
  // Merchants complete those details inside the workspace module that owns
  // the resulting record (catalogue, branches, hours, documents, or calendar).
  const rows = projection.rows.filter((row) => !row.id.startsWith('specialty:'));
  // Reaching the saved Home means the business details were submitted.
  const business = rows.find((row) => row.id === 'business');
  if (business?.status === 'complete' && record.review.submitted_revision !== null)
    Object.assign(business, { statusLabel: 'Details submitted', actionLabel: 'Edit details' });
  const replace = (row: OnboardingHomeRow) => {
    const index = rows.findIndex((item) => item.id === row.id);
    if (index < 0) rows.splice(Math.max(0, rows.length - 3), 0, row);
    else rows[index] = row;
  };
  const sectionRow = (
    id: string,
    title: string,
    icon: OnboardingHomeRow['icon'],
    step: number,
    required = false,
  ): OnboardingHomeRow => ({
    id,
    title,
    icon,
    editorStep: step,
    required,
    status: 'waiting',
    statusLabel: 'Unavailable',
    actionLabel: 'Review details',
    description: 'Saved details could not be loaded. Refresh before deciding what is missing.',
  });

  const catalogue =
    input.catalogue.state === 'known'
      ? {
          state: 'known' as const,
          total: input.catalogue.records.length,
          available: input.catalogue.records.filter((item) => item.available).length,
          priced: input.catalogue.records.filter((item) => item.price_kes !== null).length,
          activityLinks: 'not_recorded' as const,
        }
      : unavailable;
  const catalogueRow = sectionRow('offerings', 'Offerings', 'offerings', 1);
  if (catalogue.state === 'known')
    Object.assign(catalogueRow, {
      status: catalogue.total ? 'provided' : 'missing',
      statusLabel: catalogue.total ? 'Offerings saved' : 'Add offerings',
      actionLabel: catalogue.total ? 'Review offerings' : 'Add offerings',
      description: catalogue.total
        ? `${catalogue.total} catalogue ${catalogue.total === 1 ? 'entry' : 'entries'} saved, ${catalogue.priced} with a price. Activity links and live readiness have not been established.`
        : 'No catalogue entries are saved. Add offerings through your catalogue task.',
    });
  replace(catalogueRow);

  const activeBranches =
    input.branches.state === 'known'
      ? input.branches.records.filter((branch) => branch.deleted_at === null)
      : [];
  const primary = activeBranches.find((branch) => branch.is_primary) ?? activeBranches[0];
  const locations =
    input.branches.state === 'known'
      ? {
          state: 'known' as const,
          total: activeBranches.length,
          addressed: activeBranches.filter((branch) => present(branch.address_text)).length,
          pinned: activeBranches.filter(
            (branch) => branch.latitude !== null && branch.longitude !== null,
          ).length,
          closed: activeBranches.filter((branch) => branch.closed_at !== null).length,
          paused: activeBranches.filter((branch) => branch.paused_at !== null).length,
          primaryName: primary?.name ?? null,
          primaryAddress: primary?.address_text ?? null,
        }
      : unavailable;
  const locationRow = sectionRow('location', 'Location and coverage', 'location', 2);
  if (locations.state === 'known')
    Object.assign(locationRow, {
      status: locations.total ? 'provided' : 'missing',
      statusLabel: locations.total ? 'Locations saved' : 'Add location',
      actionLabel: locations.total ? 'Review locations' : 'Add location',
      description: locations.total
        ? `${locations.total} location ${locations.total === 1 ? 'record' : 'records'} saved, ${locations.addressed} with an address and ${locations.pinned} with a pin. ${locations.closed} closed and ${locations.paused} paused. Visibility and service coverage are checked separately.`
        : 'No location records are saved. A declared branch count does not create locations.',
    });
  replace(locationRow);

  const branchIds = new Set(activeBranches.map((branch) => branch.id));
  const hourRows = input.hours.state === 'known' ? input.hours.records : [];
  const hoursKnown =
    input.hours.state === 'known' &&
    (input.branches.state === 'known' || hourRows.every((row) => row.branch_id === null));
  const relevantHours = hourRows.filter(
    (row) => row.branch_id === null || branchIds.has(row.branch_id),
  );
  const openWindows = relevantHours.filter((row) => !row.closed);
  const invalidHours = openWindows.some(
    (row) => !validTime(row.opens) || !validTime(row.closes) || row.opens === row.closes,
  );
  const hours = hoursKnown
    ? {
        state: 'known' as const,
        total: relevantHours.length,
        openWindows: openWindows.length,
        days: new Set(relevantHours.map((row) => row.day_of_week)).size,
        bookableSchedules: 'not_checked' as const,
      }
    : unavailable;
  const hoursRow = sectionRow(
    'hours',
    'Opening hours and availability',
    'hours',
    3,
    rows.find((row) => row.id === 'hours')?.required,
  );
  if (hours.state === 'known')
    Object.assign(hoursRow, {
      status: invalidHours ? 'invalid' : hours.total ? 'provided' : 'missing',
      statusLabel: invalidHours ? 'Check saved hours' : hours.total ? 'Hours saved' : 'Add hours',
      actionLabel: hours.total ? 'Review hours' : 'Add hours',
      description: invalidHours
        ? 'Some saved opening windows need correction. Review them in your hours task.'
        : hours.total
          ? `${hours.openWindows} opening windows saved across ${hours.days} weekdays. These are weekly opening hours. Effective opening times, bookable schedules and capacity have not been checked.`
          : 'No weekly opening-hour records are saved. Set your hours in the hours task.',
    });
  replace(hoursRow);

  const today = (input.now ?? new Date()).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Nairobi',
  });
  const currentDocs =
    input.documents.state === 'known'
      ? input.documents.records.filter((document) => document.superseded_at === null)
      : [];
  const effectiveStatus = (document: MerchantHomeDocument) =>
    document.expires_at !== null && document.expires_at < today ? 'expired' : document.status;
  const documents =
    input.documents.state === 'known'
      ? {
          state: 'known' as const,
          total: currentDocs.length,
          uploaded: currentDocs.filter((document) => effectiveStatus(document) === 'uploaded')
            .length,
          verified: currentDocs.filter((document) => effectiveStatus(document) === 'verified')
            .length,
          rejected: currentDocs.filter((document) => effectiveStatus(document) === 'rejected')
            .length,
          expired: currentDocs.filter((document) => effectiveStatus(document) === 'expired').length,
          requirements: 'not_assessed' as const,
        }
      : unavailable;
  const documentsRow = sectionRow('documents', 'Documents and evidence', 'documents', 4);
  if (documents.state === 'known')
    Object.assign(documentsRow, {
      status:
        documents.rejected || documents.expired
          ? 'invalid'
          : documents.uploaded
            ? 'waiting'
            : documents.verified
              ? 'provided'
              : 'waiting',
      statusLabel:
        documents.rejected || documents.expired
          ? 'Evidence needs attention'
          : documents.uploaded
            ? 'Pending review'
            : documents.verified
              ? 'Reviewed records'
              : 'Add if requested',
      actionLabel: documents.total ? 'Review evidence' : 'Add if requested',
      description: documents.total
        ? `${documents.total} current uploaded file ${documents.total === 1 ? 'record' : 'records'}: ${documents.uploaded} awaiting review, ${documents.verified} verified, ${documents.rejected} rejected and ${documents.expired} expired. File sides count separately. Required evidence and application approval are checked separately.`
        : 'No current uploaded evidence records are saved. Add evidence when the review task requests it.',
    });
  replace(documentsRow);
  replace({
    ...sectionRow('payout', 'Payout details', 'payout', 5),
    status: payout.payout ? 'provided' : 'waiting',
    statusLabel: payout.payout ? 'Declaration saved' : 'Add when needed',
    actionLabel: payout.payout ? 'Review payout' : 'Add payout details',
    description: payout.payout
      ? 'Your payout declaration is saved. Account ownership and payout readiness remain unverified.'
      : 'No payout declaration is saved. Add a destination when needed. Verification is separate.',
  });
  const currentRevision =
    record.review.submitted_revision === record.revision && !record.review.needs_resubmission;
  const reviewedCurrent =
    currentRevision &&
    record.review.state === 'approved' &&
    access.state === 'approved' &&
    access.review_state === 'approved';
  const launch = sectionRow('launch', 'Review and launch', 'launch', 0, true);
  launch.editorStep = null;
  launch.actionLabel =
    record.review.state === 'draft' || record.review.needs_resubmission
      ? 'Review application'
      : 'Review status';
  launch.status = ['rejected', 'changes_requested'].includes(record.review.state)
    ? 'invalid'
    : 'waiting';
  launch.statusLabel = reviewedCurrent
    ? access.operations
      ? 'Approved, activation pending'
      : 'Approved, account restricted'
    : record.review.needs_resubmission
      ? 'Resubmission needed'
      : record.review.state === 'changes_requested'
        ? 'Changes requested'
        : record.review.state === 'rejected'
          ? 'Application rejected'
          : record.review.state === 'draft'
            ? 'Not submitted'
            : 'Waiting for review';
  launch.description = reviewedCurrent
    ? access.operations
      ? 'This saved application revision is approved. Publication, service activation and accepting work require their separate checks.'
      : 'This saved application revision is approved. The account currently restricts operations. Contact support about the account status.'
    : record.review.needs_resubmission
      ? 'Saved changes are newer than the submitted revision. Submit the current application for review.'
      : record.review.state === 'changes_requested'
        ? 'The reviewer requested changes. Review the application before submitting again.'
        : record.review.state === 'rejected'
          ? 'The application was rejected. Contact support about the saved decision.'
          : record.review.state === 'draft'
            ? 'Your application is saved as a draft. Submit it when the entry details are ready.'
            : 'The submitted application is awaiting review. Saved setup does not approve or activate your business.';
  replace(launch);
  const required = rows.filter((row) => row.required);
  const done = required.filter((row) => row.status === 'complete').length;
  return {
    source: 'saved',
    merchantId: record.merchant_id,
    revision: record.revision,
    projection: {
      ...projection,
      rows,
      progress: {
        done,
        total: required.length,
        remaining: required.length - done,
        percent: required.length ? Math.round((done / required.length) * 100) : 0,
      },
    },
    summary: {
      catalogue,
      locations,
      hours,
      documents,
      payout: {
        state: payout.payout ? 'declared' : 'not_provided',
        rail: payout.payout?.rail ?? null,
        version: payout.version,
        verification: 'declared',
      },
    },
    review: {
      state: record.review.state,
      currentRevision,
      submittedRevision: record.review.submitted_revision,
      needsResubmission: record.review.needs_resubmission,
      reason:
        typeof record.review.reason === 'string' && record.review.reason.length <= 2000
          ? record.review.reason.trim() || null
          : null,
    },
    publication: { status: record.publication.status, acceptingWork: false },
    access,
  };
}

type Result = { data: unknown; error: unknown };
type Query = PromiseLike<Result> & {
  select: (columns: string) => Query;
  eq: (column: string, value: string) => Query;
  is: (column: string, value: null) => Query;
  order: (column: string) => Query;
  limit: (count: number) => Query;
  abortSignal?: (signal: AbortSignal) => Query;
};
type Client = {
  from: (table: string) => Query;
  rpc: (name: string, args: { p_merchant_id: string }) => Query;
};

/** No section read starts until both private owner RPCs and current authority succeed. */
export async function loadMerchantHomeSource(
  client: unknown,
  merchantId: string,
  options: { includePayout?: boolean } = {},
) {
  const database = client as Client;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Your saved Home could not be loaded. Refresh before continuing.'));
    }, 10000);
  });
  const load = async () => {
    const saved = await loadApplicationView(database, merchantId, {
      signal: controller.signal,
      includePayout: options.includePayout,
    });
    const readAccess = () =>
      loadMerchantWorkspaceAccess(
        {
          rpc: (name: string, args: { p_merchant_id: string }) => {
            const request = database.rpc(name, args);
            return request.abortSignal ? request.abortSignal(controller.signal) : request;
          },
        },
        merchantId,
      );
    const consistent = (authority: MerchantWorkspaceAccess) =>
      authority.state !== 'legacy' &&
      authority.setup &&
      saved.record.access.setup &&
      authority.revision === saved.record.revision &&
      authority.review_state === saved.record.review.state &&
      authority.needs_resubmission === saved.record.review.needs_resubmission &&
      authority.state === saved.record.access.state &&
      authority.operations === saved.record.access.operations;
    const access = await readAccess();
    if (
      !consistent(access) ||
      (saved.record.review.submitted_revision !== null &&
        saved.record.review.submitted_revision > saved.record.revision)
    )
      throw new Error(
        'Your current application permissions could not be confirmed. Refresh before continuing.',
      );
    const read = async <T>(
      table: string,
      columns: string,
      schema: z.ZodType<T>,
      max: number,
      document = false,
    ): Promise<MerchantHomeSection<T>> => {
      try {
        let query = database
          .from(table)
          .select(columns)
          .eq(document ? 'owner_id' : 'merchant_id', merchantId);
        if (document) query = query.eq('owner_type', 'merchant').is('superseded_at', null);
        if (table === 'merchant_branch') query = query.is('deleted_at', null);
        query = query.order('id').limit(max + 1);
        if (query.abortSignal) query = query.abortSignal(controller.signal);
        const response = await query;
        if (response.error || !Array.isArray(response.data) || response.data.length > max)
          return unavailable;
        const parsed = z.array(schema).safeParse(response.data);
        if (
          !parsed.success ||
          parsed.data.some((row) => {
            const owner = row as { merchant_id?: string; owner_id?: string };
            return (document ? owner.owner_id : owner.merchant_id) !== merchantId;
          })
        )
          return unavailable;
        return { state: 'known', records: parsed.data };
      } catch {
        return unavailable;
      }
    };
    const [catalogue, branches, hours, documents] = await Promise.all([
      read('catalogue_item', 'id,merchant_id,name,price_kes,available', catalogueSchema, 500),
      read(
        'merchant_branch',
        'id,merchant_id,name,address_text,latitude,longitude,is_primary,deleted_at,closed_at,paused_at',
        branchSchema,
        100,
      ),
      read(
        'merchant_hours',
        'id,merchant_id,branch_id,day_of_week,service,opens,closes,closed',
        hoursSchema,
        500,
      ),
      read(
        'document',
        'id,owner_type,owner_id,requirement_id,side,status,reviewed_at,expires_at,superseded_at',
        documentSchema,
        200,
        true,
      ),
    ]);
    // Revocation can make a successful RLS read empty. Recheck authority before
    // interpreting those arrays as confirmed missing setup.
    const finalAccess = await readAccess();
    if (controller.signal.aborted || !consistent(finalAccess))
      throw new Error(
        'Your application permissions changed while Home was loading. Refresh before continuing.',
      );
    return {
      ...saved,
      home: projectMerchantSavedHome({
        ...saved,
        access: finalAccess,
        catalogue,
        branches,
        hours,
        documents,
      }),
    };
  };
  try {
    return await Promise.race([load(), deadline]);
  } finally {
    clearTimeout(timer!);
  }
}
