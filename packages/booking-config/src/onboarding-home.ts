import {
  assessOnboardingAnswers,
  listOnboardingCategories,
  resolveOnboardingSelection,
} from './onboarding';
import type { OnboardingAnswers, OnboardingAssessment, OnboardingProfile } from './onboarding';
import { registry } from './registry';
import type { BookingModel } from './types';

/** Captured declarations only. This input cannot establish authentication or approval. */
export type OnboardingHomeCapture = {
  business?: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    registered?: boolean | null;
    branchCount?: number | string;
    type?: string;
  };
  categoryId?: string;
  subcategories?: readonly string[];
  answersBySubcategory?: OnboardingAnswers;
  offers?: readonly {
    id?: string;
    name?: string;
    description?: string;
    subcategory?: string;
    price?: number | string | null;
  }[];
  location?: {
    address?: string;
    serviceAreas?: string;
    county?: string;
    coverageModes?: readonly string[];
  };
  operations?: {
    hours?: Record<string, { open?: boolean; from?: string; to?: string }>;
    bookingEnabled?: boolean;
    acceptsScheduledBookings?: boolean;
  };
  payout?: {
    method?: string;
    tillNumber?: string;
    paybillNumber?: string;
    accountReference?: string;
    holderName?: string;
    mobileProvider?: string;
    mobileNumber?: string;
    bankName?: string;
    bankBranch?: string;
    bankAccount?: string;
  };
};

/** Metadata supplied separately from capture. Never pass browser File objects here. */
export type OnboardingHomeEvidence = {
  id?: string;
  name: string;
  size?: number;
  type?: string;
  status?: 'selected' | 'uploaded' | 'pending_review' | 'rejected';
};
export type OnboardingHomeStatus = 'complete' | 'missing' | 'provided' | 'waiting' | 'invalid';
export type OnboardingHomeRow = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  status: OnboardingHomeStatus;
  statusLabel?: string;
  editorStep: number | null;
  icon:
    | 'business'
    | 'hours'
    | 'team'
    | 'offerings'
    | 'documents'
    | 'payout'
    | 'launch'
    | 'specialty'
    | 'location';
  required: boolean;
};
export type OnboardingHomeModel = {
  id: BookingModel;
  requiredSetup: string[];
  calendar: string;
  resources: string[];
  /** Registry candidates describe future setup, never a live booking workflow. */
  active: false;
};
export type OnboardingHomeProfile = OnboardingProfile & {
  models: OnboardingHomeModel[];
  questions: OnboardingAssessment[];
  missingQuestionIds: string[];
  invalidQuestionIds: string[];
};
export type OnboardingHomeProjection = {
  businessName: string;
  categoryId: string;
  subcategoryIds: string[];
  registryRevision: string;
  rows: OnboardingHomeRow[];
  progress: { done: number; total: number; remaining: number; percent: number };
  profiles: OnboardingHomeProfile[];
};

const present = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== '';
const phonePattern = /^(?:\+?254|0)?[17]\d{8}$/;
const validPhone = (value: string | undefined): boolean =>
  phonePattern.test((value || '').replace(/[\s()-]/g, ''));
const modelDefinitions = new Map(registry.models.map((model) => [model.id, model]));
const categories = listOnboardingCategories();

function businessRow(capture: OnboardingHomeCapture): OnboardingHomeRow {
  const business = capture.business || {};
  const supplied = Object.values(business).some(present);
  const missing =
    [business.name, business.firstName, business.lastName, business.email, business.phone].some(
      (value) => !present(value),
    ) ||
    business.registered == null ||
    !present(business.branchCount);
  const invalid =
    (present(business.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.email!)) ||
    (present(business.phone) && !validPhone(business.phone)) ||
    (present(business.branchCount) &&
      (!Number.isInteger(Number(business.branchCount)) || Number(business.branchCount) < 1)) ||
    (business.registered != null && typeof business.registered !== 'boolean');
  return {
    id: 'business',
    title: 'Business profile',
    icon: 'business',
    editorStep: 0,
    required: true,
    status: invalid ? 'invalid' : missing ? 'missing' : 'complete',
    statusLabel: invalid ? 'Check details' : missing ? 'Add details' : 'Details supplied',
    actionLabel: supplied ? 'Review details' : 'Add details',
    description: invalid
      ? 'Check the contact details and branch count you entered.'
      : missing
        ? 'Add your business name, contact details, registration declaration and branch count.'
        : 'Your entry details are supplied. Business identity and contact ownership still need verification.',
  };
}

function specialtyRow(profile: OnboardingHomeProfile): OnboardingHomeRow {
  const required = profile.questions.filter((question) => question.required);
  const provided = profile.questions.filter((question) => question.state === 'provided').length;
  const invalid = profile.invalidQuestionIds.length;
  const missing = profile.missingQuestionIds.length;
  const complete = missing === 0 && invalid === 0 && required.length > 0;
  return {
    id: `specialty:${profile.subcategoryId}`,
    title: `${profile.name} setup`,
    icon: 'specialty',
    editorStep: 1,
    required: required.length > 0,
    status: invalid
      ? 'invalid'
      : missing
        ? 'missing'
        : complete
          ? 'complete'
          : provided
            ? 'provided'
            : 'waiting',
    statusLabel: invalid
      ? 'Check answers'
      : missing
        ? `${missing} answers needed`
        : complete || provided
          ? 'Details supplied'
          : 'Review setup',
    actionLabel: invalid ? 'Check answers' : missing ? 'Add details' : 'Review details',
    description: invalid
      ? `${invalid} supplied answer${invalid === 1 ? ' needs' : 's need'} correction. ${provided} answer${provided === 1 ? '' : 's'} supplied.`
      : missing
        ? `${missing} applicable answer${missing === 1 ? '' : 's'} still needed. ${provided} answer${provided === 1 ? '' : 's'} supplied.`
        : `${provided} answer${provided === 1 ? '' : 's'} supplied. These declarations do not activate services or verify permissions.`,
  };
}

/** Projects future setup from captured data without creating an account or activating models. */
export function projectOnboardingHome(
  capture: OnboardingHomeCapture,
  options: { evidence?: readonly OnboardingHomeEvidence[]; preview?: true } = {},
): OnboardingHomeProjection {
  const categoryId = capture.categoryId || '';
  const selection = resolveOnboardingSelection(categoryId, capture.subcategories || []);
  // This evaluates prospective task requirements only. It does not assert a real session.
  const assessments = assessOnboardingAnswers(selection, capture.answersBySubcategory || {}, {
    otpVerified: true,
    signedIn: true,
  });
  const profiles: OnboardingHomeProfile[] = selection.profiles.map((profile) => {
    const questions = assessments.filter(
      (assessment) => assessment.subcategoryId === profile.subcategoryId,
    );
    return {
      ...profile,
      models: profile.candidateModelIds.flatMap((id) => {
        const model = modelDefinitions.get(id);
        return model
          ? [
              {
                id,
                requiredSetup: [...model.requiredSetup],
                calendar: model.calendar,
                resources: [...model.resources],
                active: false as const,
              },
            ]
          : [];
      }),
      questions,
      missingQuestionIds: questions
        .filter((question) => question.required && question.state !== 'provided')
        .map((question) => question.questionId),
      invalidQuestionIds: questions
        .filter((question) => question.state === 'invalid')
        .map((question) => question.questionId),
    };
  });
  const rows: OnboardingHomeRow[] = [businessRow(capture)];
  if (selection.issues.length) {
    const knownCategory = categories.some((category) => category.id === categoryId);
    rows.push({
      id: 'activities',
      title: 'Business activities',
      icon: 'specialty',
      editorStep: 1,
      required: true,
      status:
        categoryId && (!knownCategory || (capture.subcategories || []).length > 0)
          ? 'invalid'
          : 'missing',
      statusLabel: 'Choose activities',
      actionLabel: 'Choose activities',
      description: selection.issues.join(' '),
    });
  }
  rows.push(...profiles.map(specialtyRow));

  if (profiles.length) {
    const offers = (capture.offers || []).filter((offer) =>
      [offer.name, offer.description, offer.price].some(present),
    );
    const invalidOffers = offers.filter(
      (offer) =>
        !profiles.some((profile) => profile.subcategoryId === offer.subcategory) ||
        (present(offer.price) &&
          (!Number.isFinite(Number(offer.price)) || Number(offer.price) < 0)),
    );
    rows.push({
      id: 'offerings',
      title: 'Offerings',
      icon: 'offerings',
      editorStep: 1,
      required: false,
      status: invalidOffers.length ? 'invalid' : offers.length ? 'provided' : 'missing',
      statusLabel: invalidOffers.length
        ? 'Check drafts'
        : offers.length
          ? 'Drafts supplied'
          : 'Add when ready',
      actionLabel: offers.length ? 'Review drafts' : 'Add offerings',
      description: invalidOffers.length
        ? `${invalidOffers.length} draft${invalidOffers.length === 1 ? '' : 's'} need a valid selected activity and price.`
        : offers.length
          ? `${offers.length} draft${offers.length === 1 ? '' : 's'} supplied. Prices and availability still need setup before publishing.`
          : 'Add the products or services you intend to offer. Drafts do not enable live work.',
    });
  }

  const location = capture.location || {};
  const locationSupplied =
    [location.address, location.serviceAreas, location.county].some(present) ||
    !!location.coverageModes?.length;
  const locationApplicable = profiles.some((profile) =>
    profile.models.some((model) =>
      model.requiredSetup.some((item) => /area|location|pickup\/dropoff/.test(item)),
    ),
  );
  if (locationSupplied || locationApplicable)
    rows.push({
      id: 'location',
      title: 'Location and coverage',
      icon: 'location',
      editorStep: 2,
      required: false,
      status: locationSupplied ? 'provided' : 'missing',
      statusLabel: locationSupplied ? 'Details supplied' : 'Set up when relevant',
      actionLabel: locationSupplied ? 'Review coverage' : 'Add coverage',
      description: locationSupplied
        ? 'Location or coverage details supplied. Actual service locations and fulfilment still need review.'
        : 'Add the places or service areas relevant to the offerings you choose.',
    });

  const hours = Object.values(capture.operations?.hours || {});
  const openDays = hours.filter((day) => day.open === true);
  const validTime = (value: string | undefined): boolean =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
  const invalidHours = openDays.some(
    (day) => !validTime(day.from) || !validTime(day.to) || day.from === day.to,
  );
  const sourceHours = assessments.filter((assessment) =>
    selection.questions.some(
      (question) =>
        question.id === assessment.questionId &&
        question.canonicalTarget === 'availability.hours_description',
    ),
  );
  const queueHoursRequired = profiles.some((profile) =>
    /\bhours\b/.test(modelDefinitions.get(profile.defaultModelId)?.calendar || ''),
  );
  const schedulingRequested =
    capture.operations?.bookingEnabled === true ||
    capture.operations?.acceptsScheduledBookings === true;
  const sourceHoursProvided =
    sourceHours.length > 0 && sourceHours.every((question) => question.state === 'provided');
  const sourceHoursInvalid = sourceHours.some((question) => question.state === 'invalid');
  const hoursRequired = queueHoursRequired || sourceHours.some((question) => question.required);
  if (hoursRequired || sourceHours.length || openDays.length || schedulingRequested)
    rows.push({
      id: 'hours',
      title: 'Opening hours and availability',
      icon: 'hours',
      editorStep: 3,
      required: hoursRequired,
      status:
        invalidHours || sourceHoursInvalid
          ? 'invalid'
          : openDays.length || sourceHoursProvided
            ? 'complete'
            : 'missing',
      statusLabel:
        invalidHours || sourceHoursInvalid
          ? 'Check hours'
          : openDays.length || sourceHoursProvided
            ? 'Details supplied'
            : 'Add hours',
      actionLabel: openDays.length || sourceHoursProvided ? 'Review hours' : 'Add hours',
      description:
        invalidHours || sourceHoursInvalid
          ? 'Check your supplied opening hours.'
          : openDays.length
            ? `Opening hours supplied for ${openDays.length} day${openDays.length === 1 ? '' : 's'}. Booking schedules and capacity need separate setup.`
            : sourceHoursProvided
              ? 'Operating hours supplied as a description. Bookable schedules and capacity need separate setup.'
              : schedulingRequested && !hoursRequired
                ? 'Scheduling was requested. Define actual offering schedules before accepting bookings.'
                : 'Add the operating hours relevant to your selected activities.',
    });

  // Keep guidance tied to each profile and registry model. Candidates never imply active inventory.
  for (const profile of profiles) {
    const defaultModel = profile.models.find((model) => model.id === profile.defaultModelId);
    if (defaultModel)
      rows.push({
        id: `model:${profile.subcategoryId}`,
        title: `${profile.name} operating setup`,
        icon: 'specialty',
        editorStep: 3,
        required: false,
        status: 'waiting',
        statusLabel: 'Review setup',
        actionLabel: 'Review setup',
        description: `Before enabling ${profile.name.toLowerCase()}, review ${defaultModel.requiredSetup.join('; ')}. No workflow is active.`,
      });
  }
  const teamRelevant = profiles.some((profile) =>
    profile.models.some((model) =>
      model.resources.some((resource) =>
        /provider|team|technician|driver|instructor|guide|greeter/.test(resource),
      ),
    ),
  );
  if (teamRelevant)
    rows.push({
      id: 'team',
      title: 'People and resources',
      icon: 'team',
      editorStep: 3,
      required: false,
      status: 'waiting',
      statusLabel: 'Set up if relevant',
      actionLabel: 'Review resources',
      description:
        'Assign eligible people or resources if your chosen offerings need them. A declared branch count does not create a team.',
    });

  const evidence = options.evidence || [];
  const evidenceRejected = evidence.some((item) => item.status === 'rejected');
  const evidencePending = evidence.some(
    (item) => item.status === 'uploaded' || item.status === 'pending_review',
  );
  rows.push({
    id: 'documents',
    title: 'Documents and evidence',
    icon: 'documents',
    editorStep: 4,
    required: false,
    status: evidenceRejected
      ? 'invalid'
      : evidencePending
        ? 'waiting'
        : evidence.length
          ? 'provided'
          : 'waiting',
    statusLabel: evidenceRejected
      ? 'Review evidence'
      : evidencePending
        ? 'Pending review'
        : evidence.length
          ? 'Selected locally'
          : 'If requested',
    actionLabel: evidence.length ? 'Review evidence' : 'Add if requested',
    description: evidenceRejected
      ? 'Evidence needs attention. Review the request before providing a replacement.'
      : evidencePending
        ? `${evidence.length} evidence record${evidence.length === 1 ? '' : 's'} supplied for review. No approval is confirmed.`
        : evidence.length
          ? `${evidence.length} file${evidence.length === 1 ? '' : 's'} selected locally. Upload and review are still pending.`
          : 'Supply evidence when an authoritative review request identifies what is needed for your activities.',
  });
  const payout = capture.payout || {};
  // Default method/provider values alone are not an entered payout account.
  const payoutSupplied = [
    payout.tillNumber,
    payout.paybillNumber,
    payout.accountReference,
    payout.holderName,
    payout.mobileNumber,
    payout.bankAccount,
    payout.bankName,
    payout.bankBranch,
  ].some(present);
  const payoutInvalid =
    (payout.method === 'mpesa_till' &&
      present(payout.tillNumber) &&
      !/^\d{1,20}$/.test(payout.tillNumber!)) ||
    (payout.method === 'mpesa_paybill' &&
      present(payout.paybillNumber) &&
      !/^\d{1,20}$/.test(payout.paybillNumber!)) ||
    (payout.method === 'mobile_money' &&
      present(payout.mobileNumber) &&
      !validPhone(payout.mobileNumber));
  rows.push(
    {
      id: 'payout',
      title: 'Payout details',
      icon: 'payout',
      editorStep: 5,
      required: false,
      status: payoutInvalid ? 'invalid' : payoutSupplied ? 'provided' : 'waiting',
      statusLabel: payoutInvalid
        ? 'Check details'
        : payoutSupplied
          ? 'Details supplied'
          : 'Add when needed',
      actionLabel: payoutSupplied ? 'Review payout' : 'Add payout details',
      description: payoutInvalid
        ? 'Check the mobile number entered for payouts.'
        : payoutSupplied
          ? 'Payout details supplied. Account ownership and payout readiness remain unverified.'
          : 'Add a payout destination when needed. Account verification and payment setup are separate.',
    },
    {
      id: 'launch',
      title: 'Review and launch',
      icon: 'launch',
      editorStep: null,
      required: true,
      status: 'waiting',
      statusLabel: 'Waiting for review',
      actionLabel: 'Await review',
      description:
        'Real account verification, admin review and applicable live setup must finish before launch. This preview cannot approve or publish your business.',
    },
  );

  const requiredRows = rows.filter((row) => row.required);
  const done = requiredRows.filter((row) => row.status === 'complete').length;
  const total = requiredRows.length;
  return {
    businessName: capture.business?.name?.trim() || 'Your business',
    categoryId,
    subcategoryIds: profiles.map((profile) => profile.subcategoryId),
    registryRevision: selection.revision,
    rows,
    progress: {
      done,
      total,
      remaining: total - done,
      percent: total ? Math.round((done / total) * 100) : 0,
    },
    profiles,
  };
}
