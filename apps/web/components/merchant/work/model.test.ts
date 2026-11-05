import { listBookingProfiles } from '@nexg/booking-config/profiles';
import { describe, expect, it } from 'vitest';
import { candidateWorkflows, createSampleRecords, defaultWorkflow, inTab, sampleSource, templates, workActivitiesFromBooking } from './model';

describe('Work preview configuration', () => {
  it('offers a supported explicitly selected activity for each of the 141 shared booking profiles', () => {
    const profiles = listBookingProfiles();
    expect(profiles).toHaveLength(141);
    for (const profile of profiles) {
      expect(candidateWorkflows(profile).length, profile.subcategoryId).toBeGreaterThan(0);
      expect(defaultWorkflow(profile), profile.subcategoryId).toBeDefined();
      expect(candidateWorkflows(profile)).toContain(defaultWorkflow(profile));
    }
  });

  it('treats an ordinary stock order as already confirmed and advances its fulfilment locally', async () => {
    const order = createSampleRecords('WF_ORDER')[0]!;
    expect(order.history[0]).toContain('Confirmed automatically');
    expect(templates.WF_ORDER.actions.join(' ')).not.toMatch(/accept|decline/i);
    const updated = await sampleSource.advance(order, order.nextAction!.id);
    expect(updated.stage).toBe(order.stage + 1);
    expect(updated.history).toContain('Mark ready for pickup');
    expect(order.stage).toBe(1);
  });

  it('provides twelve distinct active orders and separate upcoming and historical samples', () => {
    const records = createSampleRecords('WF_ORDER');
    expect(records.filter((record) => inTab(record, 'progress'))).toHaveLength(12);
    expect(records.filter((record) => inTab(record, 'upcoming'))).toHaveLength(2);
    expect(records.filter((record) => inTab(record, 'history'))).toHaveLength(2);
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    expect(new Set(records.slice(0, 12).map((record) => record.customer)).size).toBe(12);
  });

  it('keeps a self-drive rental separate from transfers and places completed work in history', async () => {
    const rental = createSampleRecords('WF_RENTAL')[0]!;
    expect(rental.context).toContain('Self-drive');
    expect(templates.WF_RENTAL.actions).not.toContain('Start trip');
    const returned = await sampleSource.advance(rental, rental.nextAction!.id);
    expect(returned.history).toContain('Record return');
    expect(inTab(returned, 'history')).toBe(false);
    expect(inTab(await sampleSource.advance(returned, returned.nextAction!.id), 'history')).toBe(true);
  });

  it('does not advance a read-only record', async () => {
    const record = { ...createSampleRecords('WF_APPOINTMENT')[0]!, readOnly: true };
    expect(await sampleSource.advance(record, record.nextAction!.id)).toEqual(record);
  });

  it('uses only ready, active booking bindings for the selected offering', () => {
    const config = { isReady: false, activeModels: ['ASSET_INTERVAL'] as const, workflowBindings: [{ modelId: 'ASSET_INTERVAL' as const, workflowId: 'WF_RENTAL', variantId: null, linkedExecution: false, createsWork: false as const }], configurationRevision: 'revision-1' };
    expect(workActivitiesFromBooking('vehicle-1', { ...config, activeModels: [...config.activeModels] }).activities).toEqual([]);
    const resolved = workActivitiesFromBooking('vehicle-1', { ...config, isReady: true, activeModels: [...config.activeModels] });
    expect(resolved.activities).toEqual([{ offeringId: 'vehicle-1', workflowId: 'WF_RENTAL', modelId: 'ASSET_INTERVAL', linkedExecution: false, configurationRevision: 'revision-1' }]);
    expect(resolved.activities.some((activity) => activity.workflowId === 'WF_TRANSFER')).toBe(false);
    const unknown = workActivitiesFromBooking('vehicle-1', { ...config, isReady: true, activeModels: [...config.activeModels], workflowBindings: [{ ...config.workflowBindings[0]!, workflowId: 'WF_FUTURE' }] });
    expect(unknown.activities).toEqual([]);
    expect(unknown.unsupported).toEqual(['WF_FUTURE']);
  });

  it('suggests registered models for a future declarative category without activating it', () => {
    const original = listBookingProfiles()[0]!;
    const future = { ...original, subcategoryId: 'future-example', defaultModelId: 'ASSET_INTERVAL' as const, candidateModels: ['ASSET_INTERVAL' as const] };
    expect(candidateWorkflows(future)).toEqual(['WF_RENTAL']);
    expect(defaultWorkflow(future)).toBe('WF_RENTAL');
  });
});
