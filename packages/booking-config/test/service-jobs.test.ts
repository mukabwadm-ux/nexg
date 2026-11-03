import { describe, expect, it } from 'vitest';
import {
  planSpecialistCommitment,
  transitionSpecialist,
  specialistPublicDescriptor,
  specialistPublicSummary,
  type ServiceJobSetup,
  type SpecialistState,
  type SpecialistTransitionInput,
} from '../src/specialists';

const now = Date.parse('2026-11-02T06:00:00Z');
const setup: ServiceJobSetup = {
  model: 'SERVICE_JOB',
  version: 1,
  supplierComponents: [],
  jobSchedulingMode: 'scheduled_work',
  assessmentMode: 'fixed_scope',
  resourceIds: ['wash-bay', 'wash-team'],
  durationMinutes: 60,
  partsRequired: false,
  partsEvidenceKind: 'authorized_manual_reference',
  custodyMode: 'customer_retains',
  custodyResourceIds: [],
  custodyDurationMinutes: 1440,
};
const approval = {
  version: 1,
  acceptedBy: 'customer-a',
  acceptedAt: new Date(now).toISOString(),
  priceMinor: 150000,
};
const evidence = { evidence: 'Actual authorized operator evidence' };
const planned = { startTime: '2026-11-03T06:00:00Z', endTime: '2026-11-03T07:00:00Z' };
function create(
  config: ServiceJobSetup = setup,
  input: Record<string, unknown> = { requestedInterval: planned },
) {
  return planSpecialistCommitment({
    model: 'SERVICE_JOB',
    setup: config,
    input: {
      model: 'SERVICE_JOB',
      jobDescription: 'Car wash for the specified customer vehicle',
      ...input,
    },
    now,
  });
}
function move(
  current: SpecialistState,
  command: string,
  input: SpecialistTransitionInput = evidence,
  at = now,
) {
  return transitionSpecialist({
    current,
    command,
    input,
    now: at,
    actor: 'merchant',
    paymentSatisfied: true,
  });
}

describe('resource-backed service jobs retain the actual SERVICE_JOB root', () => {
  it('reserves the explicit fixed-scope bay/team work interval, starts only after actual intake, and releases work after quality checks', () => {
    const plan = create(setup, {
      requestedInterval: planned,
      completionPromise: '2026-11-03T12:00:00+03:00',
    });
    expect(plan.roles).toMatchObject([
      {
        role: 'job_work',
        resourceIds: ['wash-bay', 'wash-team'],
        startTime: new Date(planned.startTime).toISOString(),
        endTime: new Date(planned.endTime).toISOString(),
      },
    ]);
    expect(plan.roles[0]?.endTime).not.toBe('2026-11-03T09:00:00.000Z');
    let state = move(plan.acceptedTerms, 'AcceptFixedScopeServiceJob', { approval }).next;
    const booked = move(state, 'ConfirmServiceWorkSlot', {});
    state = booked.next;
    expect(booked.effects[0]?.type).toBe('allocate');
    expect(() => move(state, 'StartNoPartsService')).toThrow(/actual item/i);
    state = move(state, 'AcceptServiceIntake', evidence, Date.parse(planned.startTime)).next;
    const started = move(state, 'StartNoPartsService', evidence, Date.parse(planned.startTime));
    state = started.next;
    expect(started.effects).toEqual([{ type: 'begin', roleIds: ['job-work'] }]);
    state = move(state, 'SubmitServiceResult', evidence, Date.parse(planned.endTime)).next;
    const released = move(state, 'ApproveServiceRelease', evidence, Date.parse(planned.endTime));
    expect(released.effects).toEqual([{ type: 'release', roleIds: ['job-work'] }]);
    state = move(
      released.next,
      'ConfirmServiceHandover',
      evidence,
      Date.parse(planned.endTime),
    ).next;
    expect(
      move(state, 'CompleteServiceJob', evidence, Date.parse(planned.endTime)).next.state,
    ).toBe('COMPLETED');
  });
  it('keeps queued work nonblocking until an actual current-time diagnosis/work claim, and requires diagnostic approval', () => {
    const config = {
      ...setup,
      jobSchedulingMode: 'queue' as const,
      assessmentMode: 'diagnosis_required' as const,
    };
    const plan = create(config, {});
    expect(plan.roles).toEqual([]);
    let state = move(plan.acceptedTerms, 'AcceptServiceIntake').next;
    expect(() => move(state, 'StartDiagnosis')).toThrow();
    const diagnosis = move(state, 'StartDiagnosis', { ...evidence, approval });
    state = diagnosis.next;
    expect(diagnosis.effects).toMatchObject([
      {
        type: 'allocate',
        roles: [{ role: 'job_diagnosis', startTime: new Date(now).toISOString() }],
      },
      { type: 'begin', roleIds: ['job-diagnosis'] },
    ]);
    const quoted = move(state, 'IssueServiceQuote', {
      ...evidence,
      scopeVersion: 1,
      findings: 'Assessed worn drive belt; exact replacement scope',
      partsRequired: true,
    });
    expect(quoted.effects).toEqual([{ type: 'release', roleIds: ['job-diagnosis'] }]);
    expect(quoted.next.approval).toBeUndefined();
    state = move(quoted.next, 'ApproveServiceJob', { approval }).next;
    expect(() => move(state, 'StartNoPartsService')).toThrow(/requires its actual parts/i);
    state = move(state, 'RequestServiceParts').next;
    expect(() => move(state, 'StartRepair')).toThrow();
    const repair = move(state, 'StartRepair', {
      ...evidence,
      partsConfirmation: {
        reference: 'Authorized parts owner counted and released exact belt',
        verification: 'merchant_asserted',
      },
    });
    expect(repair.effects).toMatchObject([
      { type: 'allocate', roles: [{ role: 'job_work', startTime: new Date(now).toISOString() }] },
      { type: 'begin', roleIds: ['job-work'] },
    ]);
  });
  it('reserves an intake slot alone and swaps intake for real diagnostic capacity rather than reserving the whole repair', () => {
    const config = {
      ...setup,
      jobSchedulingMode: 'scheduled_intake' as const,
      assessmentMode: 'diagnosis_required' as const,
    };
    let state = move(create(config).acceptedTerms, 'ConfirmServiceIntakeSlot', {}).next;
    state = move(state, 'AcceptServiceIntake', evidence, Date.parse(planned.startTime)).next;
    const diagnosis = move(
      state,
      'StartDiagnosis',
      { ...evidence, approval },
      Date.parse(planned.startTime),
    );
    expect(diagnosis.effects.map((effect) => effect.type)).toEqual([
      'release',
      'allocate',
      'begin',
    ]);
    expect(diagnosis.effects[0]).toEqual({ type: 'release', roleIds: ['job-intake'] });
    expect(diagnosis.next.model).toBe('SERVICE_JOB');
  });
  it('holds customer goods separately from staff/bay work until actual authorized handover', () => {
    const config = {
      ...setup,
      jobSchedulingMode: 'queue' as const,
      custodyMode: 'merchant_holds' as const,
      custodyResourceIds: ['holding-space'],
      custodyDurationMinutes: 1440,
    };
    let state = move(create(config, {}).acceptedTerms, 'AcceptServiceIntake').next;
    expect(state.custody).toBe('held');
    expect(state.roles).toMatchObject([{ role: 'job_custody', resourceIds: ['holding-space'] }]);
    state = move(state, 'AcceptFixedScopeServiceJob', { approval }).next;
    state = move(state, 'StartNoPartsService').next;
    state = move(state, 'SubmitServiceResult').next;
    const checked = move(state, 'ApproveServiceRelease');
    expect(checked.effects).toEqual([{ type: 'release', roleIds: ['job-work'] }]);
    expect(checked.next.custody).toBe('held');
    expect(() => move(checked.next, 'RequestSpecialistCancellation')).toThrow(/cannot erase/i);
    const handedOver = move(checked.next, 'ConfirmServiceHandover');
    expect(handedOver.effects).toEqual([{ type: 'release', roleIds: ['job-custody'] }]);
    expect(handedOver.next.custody).toBe('released');
  });
  it('rejects fake queue appointments, mismatched durations, diagnostic bypass and invented parts-provider verification', () => {
    expect(() =>
      create({ ...setup, jobSchedulingMode: 'queue' }, { requestedInterval: planned }),
    ).toThrow(/queue entry/i);
    expect(() =>
      create(setup, { requestedInterval: { ...planned, endTime: '2026-11-03T08:00:00Z' } }),
    ).toThrow(/exact configured duration/i);
    const config = {
      ...setup,
      jobSchedulingMode: 'queue' as const,
      assessmentMode: 'diagnosis_required' as const,
      partsRequired: true,
      partsEvidenceKind: 'provider_api' as const,
    };
    let state = move(create(config, {}).acceptedTerms, 'AcceptServiceIntake').next;
    expect(() => move(state, 'AcceptFixedScopeServiceJob', { approval })).toThrow(
      /requires diagnosis/i,
    );
    state = move(state, 'StartDiagnosis', { ...evidence, approval }).next;
    state = move(state, 'IssueServiceQuote', {
      ...evidence,
      scopeVersion: 1,
      findings: 'Exact required parts identified',
      partsRequired: true,
    }).next;
    state = move(state, 'ApproveServiceJob', { approval }).next;
    state = move(state, 'RequestServiceParts').next;
    expect(() =>
      move(state, 'StartRepair', {
        ...evidence,
        partsConfirmation: { reference: 'Fake API result', verification: 'provider_verified' },
      }),
    ).toThrow(/verified parts provider/i);
    expect(() =>
      move(state, 'StartRepair', {
        ...evidence,
        partsConfirmation: { reference: 'Manual note', verification: 'merchant_asserted' },
      }),
    ).toThrow(/provider confirmation/i);
  });
  it('keeps internal bay/team, holding resource and parts reference details out of public choices', () => {
    const descriptor = specialistPublicDescriptor({
      ...setup,
      custodyMode: 'merchant_holds',
      custodyResourceIds: ['holding-secret'],
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/wash-bay|wash-team|holding-secret|resourceIds/);
    const pending = create().acceptedTerms;
    expect(specialistPublicSummary(pending).availableCommands).toContain(
      'AcceptFixedScopeServiceJob',
    );
    expect(specialistPublicSummary(pending).availableCommands).not.toContain(
      'ConfirmServiceIntakeSlot',
    );
  });
});
