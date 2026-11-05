import activities from '../../contracts/src/activities.json';
import type { ProfileDefinition } from './types';

const models = {
  SPACE_RESERVATION: {
    workflow: 'WF_SPACE_RESERVATION_V1',
    work: 'reservation',
    questions: ['booking_required', 'advance_booking_hrs', 'equipment_provided'],
  },
  SESSION_CAPACITY: {
    workflow: 'WF_GROUP_ACTIVITY',
    work: 'activity booking',
    questions: ['booking_required', 'max_group_size', 'equipment_provided'],
  },
  APPOINTMENT: {
    workflow: 'WF_APPOINTMENT',
    work: 'lesson booking',
    questions: ['booking_required', 'session_duration_text', 'advance_booking_hrs'],
  },
  REQUEST_QUOTE: {
    workflow: 'WF_REQUEST_QUOTE',
    work: 'activity request',
    questions: ['min_headcount', 'max_headcount', 'advance_booking_hrs'],
  },
} as const;

export const activityProfiles: ProfileDefinition[] = activities.subcategories.map((activity) => {
  const model = activity.model as keyof typeof models;
  const profile = models[model];
  return {
    categoryId: activities.id,
    categoryName: activities.name,
    subcategoryId: activity.id,
    name: activity.name,
    group: activity.group,
    sourceWorkflowId: profile.workflow,
    defaultModelId: model,
    sourceQuestionIds: profile.questions.map((key) => `Q_${key.toUpperCase()}`),
    sourceQuestionKeys: [...profile.questions],
    candidateModelIds: [model],
    enablementGuard: {
      all: [
        { op: 'eq', path: 'context.offering_selected', value: true },
        { op: 'eq', path: 'context.offering_setup_complete', value: true },
        { op: 'eq', path: 'context.required_authority_resolved', value: true },
        { op: 'eq', path: 'context.offering_model', value: model },
      ],
    },
    bindings: [],
    rules: [],
    specialtyNeeds: activity.needs,
    vocabulary: {
      workSingular: profile.work,
      offeringSingular: activity.unit,
      memberOrCustomer: 'guest',
    },
  };
});
