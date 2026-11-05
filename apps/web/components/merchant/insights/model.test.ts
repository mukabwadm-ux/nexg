import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  compareMetric,
  csvCell,
  exportInsightsCsv,
  localDateInNairobi,
  MODEL_REPORTS,
  parseDateRange,
  previousDateRange,
  profiles,
  resolveInsightTabs,
} from './model';
import {
  createModelSnapshot,
  createRestaurantSnapshot,
  createUnavailableSnapshot,
  DEFAULT_FILTERS,
  SAMPLE_POLICY,
} from './fixtures';
import type { BookingModel } from './types';

describe('canonical restaurant reporting', () => {
  it('computes all eight areas from the same dated work, line-item, identity, event and posting evidence', () => {
    const view = buildInsights(createRestaurantSnapshot(), DEFAULT_FILTERS, SAMPLE_POLICY);
    expect(view.tabs.map((tab) => tab.label)).toEqual([
      'Overview',
      'Orders',
      'Menu',
      'Customers',
      'Operations',
      'Promotions',
      'Finance',
      'Reports',
    ]);
    expect(
      [
        'work_requested',
        'order_completed',
        'order_cohort_completed',
        'order_cancelled',
        'order_open',
        'order_units',
        'order_item_sales',
        'order_average_item_sales',
      ].map((id) => view.metrics[id]!.value),
    ).toEqual([1248, 1176, 1176, 54, 18, 1764, 117600000, 100000]);
    expect(view.weekly.map((week) => [week.completed, week.units, week.itemSalesMinor])).toEqual([
      [252, 378, 25200000],
      [280, 420, 28000000],
      [308, 462, 30800000],
      [336, 504, 33600000],
    ]);
    expect(view.menuRows.map((row) => [row.label, row.units, row.itemSalesMinor])).toEqual([
      ['Beef burger', 420, 42000000],
      ['Chicken pilau', 360, 28800000],
      ['Veggie wrap', 300, 18000000],
      ['Chips', 240, 9600000],
      ['Fruit juice', 180, 5400000],
      ['Grilled chicken', 120, 9600000],
      ['Garden salad', 96, 2880000],
      ['Tea', 48, 1320000],
    ]);
    expect(
      ['identified_customers', 'first_time_customers', 'returning_customers'].map(
        (id) => view.metrics[id]!.value,
      ),
    ).toEqual([840, 600, 240]);
    expect(view.metrics.returning_share!.value).toBeCloseTo(28.57142857);
    expect(
      view.customerRows.slice(0, 5).map((row) => [row.id, row.orders, row.itemSalesMinor]),
    ).toEqual([
      ['C-0101', 8, 800000],
      ['C-0102', 7, 700000],
      ['C-0103', 6, 600000],
      ['C-0104', 6, 600000],
      ['C-0105', 5, 500000],
    ]);
    expect(view.metrics.order_ready_on_time!.numerator).toBe(1098);
    expect(view.metrics.order_ready_on_time!.denominator).toBe(1168);
    expect(view.metrics.preparation_median!.value).toBe(28);
    expect(view.operationRows.sort((a, b) => a.method.localeCompare(b.method))).toEqual([
      { method: 'Delivery', eligible: 584, onTime: 547, late: 37, missingPromise: 4 },
      { method: 'Dine-in', eligible: 234, onTime: 222, late: 12, missingPromise: 1 },
      { method: 'Pickup', eligible: 350, onTime: 329, late: 21, missingPromise: 3 },
    ]);
    expect(
      [
        'qualified_impressions',
        'qualified_taps',
        'attributed_orders',
        'tap_impression_ratio',
        'orders_per_tap_ratio',
      ].map((id) => view.metrics[id]!.value),
    ).toEqual([12000, 600, 36, 5, 6]);
    expect(
      ['merchant_credits', 'refund_debits', 'fee_debits', 'net_posted_credit'].map(
        (id) => view.metrics[id]!.value,
      ),
    ).toEqual([117600000, 1764000, 5880000, 109956000]);
    expect(view.reportRecords.RPT_ORDER_OUTCOMES!.length).toBe(1248);
    expect(view.reports.map((report) => report.id).sort()).toEqual(
      [
        'RPT_SOURCE_COVERAGE',
        'RPT_WORK_OUTCOMES',
        'RPT_ORDER_OUTCOMES',
        'RPT_ORDER_VARIANTS',
        'RPT_ORDER_READINESS',
        'RPT_REPEAT_ACTIVITY',
        'RPT_CAMPAIGN_MEASUREMENT',
        'RPT_POSTED_MERCHANT_ACTIVITY',
        'RPT_PUBLISHED_FEEDBACK',
      ].sort(),
    );
  });

  it('changes every relevant report when branch, date or record keyword changes, and exports that exact scope', () => {
    const snapshot = createRestaurantSnapshot();
    const week = buildInsights(snapshot, { ...DEFAULT_FILTERS, to: '2026-10-10' }, SAMPLE_POLICY);
    const branch = buildInsights(
      snapshot,
      { ...DEFAULT_FILTERS, locationId: 'westlands' },
      SAMPLE_POLICY,
    );
    const exact = buildInsights(
      snapshot,
      { ...DEFAULT_FILTERS, keyword: 'ORD-1248' },
      SAMPLE_POLICY,
    );
    expect([
      week.metrics.order_completed!.value,
      week.metrics.order_units!.value,
      week.metrics.order_item_sales!.value,
    ]).toEqual([252, 378, 25200000]);
    expect([
      branch.metrics.order_completed!.value,
      branch.metrics.order_units!.value,
      branch.metrics.order_item_sales!.value,
    ]).toEqual([3, 3, 120000]);
    expect(exact.records.map((row) => row.reference)).toEqual(['ORD-1248']);
    expect(exact.menuRows.map((row) => [row.label, row.units, row.itemSalesMinor])).toEqual([
      ['Beef burger', 1, 100000],
    ]);
    const csv = exportInsightsCsv(exact);
    expect(csv).toContain('"Keyword","ORD-1248"');
    expect(csv).toContain('"ORD-1248","ORDER","karen"');
    expect(csv).not.toContain('"ORD-1247"');
    expect(csv).not.toContain('WEST-1');
    expect(exportInsightsCsv(branch, 'RPT_ORDER_VARIANTS')).toContain(
      '"Chips","Standard","3","each","120000","KES"',
    );
    const cancelled = buildInsights(
      snapshot,
      { ...DEFAULT_FILTERS, keyword: 'cancelled' },
      SAMPLE_POLICY,
    );
    expect(cancelled.records).toHaveLength(54);
    expect(cancelled.metrics.order_cancelled!.value).toBe(54);
  });

  it('keeps request cohorts separate from completion-date work and contributor exports', () => {
    const source = createRestaurantSnapshot();
    source.records = [
      {
        ...source.records[0]!,
        id: 'carry-in',
        reference: 'CARRY-IN',
        requestedOn: '2026-09-30',
        completedOn: '2026-10-10',
      },
      {
        ...source.records[1]!,
        id: 'new-open',
        reference: 'NEW-OPEN',
        requestedOn: '2026-10-10',
        completedOn: null,
        outcome: 'open',
      },
    ];
    source.lineItems = [];
    const view = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      view.metrics.work_requested!.value,
      view.metrics.order_cohort_completed!.value,
      view.metrics.order_completed!.value,
      view.metrics.order_open!.value,
    ]).toEqual([1, 0, 1, 1]);
    expect(view.reportRecords.RPT_ORDER_OUTCOMES!.map((row) => row.reference)).toEqual([
      'NEW-OPEN',
    ]);
    expect(view.metricRecords.order_completed!.map((row) => row.reference)).toEqual(['CARRY-IN']);
    expect(exportInsightsCsv(view)).toContain('"NEW-OPEN"');
    expect(exportInsightsCsv(view)).not.toContain('CARRY-IN');
    expect(exportInsightsCsv(view, 'RPT_ORDER_OUTCOMES', 'order_completed')).toContain(
      '"CARRY-IN"',
    );
    expect(exportInsightsCsv(view, 'RPT_ORDER_OUTCOMES', 'order_completed')).not.toContain(
      'NEW-OPEN',
    );
  });

  it('drills counts into contributing outcomes and timing rates into their eligible denominator', () => {
    const source = createRestaurantSnapshot();
    const view = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      view.metricRecords.order_cancelled!.length,
      view.metricRecords.order_open!.length,
      view.metricRecords.order_cohort_completed!.length,
      view.metricRecords.missing_ready_promises!.length,
      view.metricRecords.order_ready_on_time!.length,
    ]).toEqual([54, 18, 1176, 8, 1168]);
    expect(view.metricRecords.order_cancelled!.every((row) => row.outcome === 'cancelled')).toBe(
      true,
    );
    expect(
      view.metricRecords.order_ready_on_time!.every((row) => row.promiseAt && row.readyAt),
    ).toBe(true);
    const csv = exportInsightsCsv(view, 'RPT_ORDER_OUTCOMES', 'order_cancelled');
    expect(csv.split('\r\n')).toHaveLength(56);
    expect(csv).not.toContain(view.metricRecords.order_open![0]!.reference);
    expect(exportInsightsCsv(view, 'RPT_ORDER_READINESS', 'order_ready_on_time')).toContain(
      '"promiseAt","readyAt"',
    );
    source.records[0]!.startedAt = undefined;
    const partial = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect(partial.metricRecords.preparation_median).toHaveLength(1175);
    expect(
      partial.metricRecords.preparation_median!.some((row) => row.id === source.records[0]!.id),
    ).toBe(false);
    const first = exportInsightsCsv(view, 'RPT_REPEAT_ACTIVITY', 'first_time_customers');
    expect(first.split('\r\n')).toHaveLength(602);
    expect(first).not.toContain('"Returning"');
    expect(
      exportInsightsCsv(view, 'RPT_POSTED_MERCHANT_ACTIVITY', 'refund_debits').split('\r\n'),
    ).toHaveLength(3);
    expect(exportInsightsCsv(view, 'RPT_CAMPAIGN_MEASUREMENT', 'qualified_taps')).not.toContain(
      'Impressions',
    );
  });

  it('distinguishes complete confirmed zero from missing source, partial coverage, missing quantities and incompatible units', () => {
    const source = createRestaurantSnapshot();
    const zero = buildInsights(
      source,
      { ...DEFAULT_FILTERS, from: '2026-09-15', to: '2026-09-16' },
      SAMPLE_POLICY,
    );
    expect([zero.metrics.order_completed!.value, zero.metrics.order_completed!.status]).toEqual([
      0,
      'ready',
    ]);
    const unavailable = buildInsights(
      createUnavailableSnapshot({ enabledModels: ['ORDER'], locations: source.locations }),
      DEFAULT_FILTERS,
      SAMPLE_POLICY,
    );
    expect([
      unavailable.metrics.order_completed!.value,
      unavailable.metrics.order_completed!.status,
    ]).toEqual([null, 'unavailable']);
    source.coverage = source.coverage.map((coverage) =>
      coverage.kind === 'work' ? { ...coverage, to: '2026-10-30' } : coverage,
    );
    const partial = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      partial.metrics.order_completed!.value,
      partial.metrics.order_completed!.status,
    ]).toEqual([1176, 'partial']);
    source.lineItems[0]!.quantity = null;
    expect(
      buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY).metrics.order_units!.value,
    ).toBeNull();
    source.lineItems[0]!.quantity = 1;
    source.lineItems[0]!.unit = 'kg';
    expect(
      buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY).metrics.order_units!.reason,
    ).toContain('units cannot be combined');
    expect(
      buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY).menuRows.some(
        (row) => row.unit === 'kg' && row.units === 1,
      ),
    ).toBe(true);
    expect(
      buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY).metrics.order_completed!.value,
    ).toBe(1176);
  });

  it('enforces supplied permissions and privacy through metrics, fields, tabs, reports and export', () => {
    const source = createRestaurantSnapshot();
    const policy = {
      ...SAMPLE_POLICY,
      canReadFinance: false,
      canReadCustomers: false,
      canReadPromotions: false,
    };
    const view = buildInsights(source, DEFAULT_FILTERS, policy);
    expect([
      view.metrics.order_completed!.value,
      view.metrics.merchant_credits!.value,
      view.metrics.identified_customers!.value,
    ]).toEqual([1176, null, null]);
    expect(view.menuRows[0]!.itemSalesMinor).toBeNull();
    expect(view.records[0]).toMatchObject({
      customerId: undefined,
      customerFirstCompletedOn: undefined,
      itemAmountMinor: undefined,
    });
    expect(view.tabs.map((tab) => tab.label)).toEqual([
      'Overview',
      'Orders',
      'Menu',
      'Operations',
      'Reports',
    ]);
    expect(() => exportInsightsCsv(view, 'RPT_POSTED_MERCHANT_ACTIVITY')).toThrow(
      'authorized report',
    );
    const noThreshold = buildInsights(source, DEFAULT_FILTERS, {
      ...SAMPLE_POLICY,
      privacyMinimum: undefined,
    });
    expect([
      noThreshold.metrics.identified_customers!.value,
      noThreshold.metrics.order_completed!.value,
    ]).toEqual([null, 1176]);
    expect(noThreshold.records[0]!.customerId).toBeUndefined();
    const denied = buildInsights(
      source,
      { ...DEFAULT_FILTERS, locationId: 'westlands' },
      { ...SAMPLE_POLICY, allowedLocationIds: ['karen'] },
    );
    expect(denied.metrics.order_completed!.value).toBeNull();
    expect(() => exportInsightsCsv(denied)).toThrow('not permitted');
  });

  it('does not turn missing completion dates or missing line evidence into confirmed zero', () => {
    const source = createRestaurantSnapshot();
    source.records = [{ ...source.records[0]!, completedOn: null }];
    source.lineItems = [];
    const unknown = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      unknown.metrics.work_requested!.value,
      unknown.metrics.order_completed!.value,
      unknown.metrics.order_completed!.status,
    ]).toEqual([1, null, 'unavailable']);
    source.records[0]!.completedOn = '2026-10-04';
    const missingItems = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      missingItems.metrics.order_completed!.value,
      missingItems.metrics.order_units!.value,
    ]).toEqual([1, null]);
    expect(missingItems.metrics.order_units!.reason).toContain('lack item evidence');
  });
});

describe('adaptive model and source evidence', () => {
  it('resolves every existing profile/model binding through actual configured sample evidence', () => {
    const observed = profiles.flatMap((profile) =>
      profile.candidateModels.map((model) => {
        const source = createModelSnapshot(profile.subcategoryId, model);
        const view = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
        expect(
          Object.values(view.metrics)
            .filter((metric) => metric.status !== 'unavailable')
            .every((metric) => view.reports.some((report) => report.id === metric.reportId)),
        ).toBe(true);
        return {
          profile: profile.subcategoryId,
          model,
          models: view.models,
          work: view.metrics.work_requested!.value,
          peer: view.tabs.find((tab) => tab.key === MODEL_REPORTS[model].tab)?.label,
        };
      }),
    );
    expect(new Set(observed.map((row) => row.profile)).size).toBe(141);
    expect(observed.length).toBe(206);
    expect(new Set(observed.map((row) => row.model)).size).toBe(15);
    expect(
      observed.find((row) => row.profile === 'restaurant' && row.model === 'SPACE_RESERVATION'),
    ).toEqual({
      profile: 'restaurant',
      model: 'SPACE_RESERVATION',
      models: ['SPACE_RESERVATION'],
      work: 12,
      peer: 'Bookings',
    });
    expect(
      observed.find((row) => row.profile === 'self_drive' && row.model === 'ASSET_INTERVAL'),
    ).toEqual({
      profile: 'self_drive',
      model: 'ASSET_INTERVAL',
      models: ['ASSET_INTERVAL'],
      work: 12,
      peer: 'Rentals',
    });
    expect(observed.every((row) => row.work === 12 || row.profile === 'restaurant')).toBe(true);
  });

  it('keeps model semantics, source gaps and hybrid peer deduplication explicit', () => {
    const appointmentProfile = profiles.find((profile) =>
      profile.candidateModels.includes('APPOINTMENT'),
    )!;
    const source = createModelSnapshot(appointmentProfile.subcategoryId, 'APPOINTMENT');
    const appointment = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      appointment.metrics.appointment_outcomes!.value,
      appointment.metrics.provider_reserved_util!.value,
      appointment.metrics.order_units!.value,
      appointment.metrics.net_posted_credit!.value,
    ]).toEqual([9, 75, null, null]);
    const empty = createUnavailableSnapshot({
      subcategoryId: 'restaurant',
      locations: source.locations,
    });
    expect(resolveInsightTabs(empty, SAMPLE_POLICY).map((tab) => tab.label)).toEqual([
      'Overview',
      'Reports',
    ]);
    const models: BookingModel[] = ['SESSION_CAPACITY', 'SPACE_RESERVATION', 'TOUR'];
    source.enabledModels = models;
    source.offerings = models.map((model) => ({
      id: model,
      label: model,
      model,
      enabled: true,
      locationIds: ['karen'],
      presentation: model === 'SPACE_RESERVATION' ? 'spaces' : 'experiences',
    }));
    const tabs = resolveInsightTabs(source, SAMPLE_POLICY);
    expect(tabs.filter((tab) => tab.key === 'bookings')).toEqual([
      { key: 'bookings', label: 'Bookings', models },
    ]);
    expect(tabs.filter((tab) => tab.key === 'reports')).toEqual([
      { key: 'reports', label: 'Reports', models: [] },
    ]);
  });

  it('keeps hybrid item arithmetic and available report evidence inside the owning model', () => {
    const source = createRestaurantSnapshot();
    source.enabledModels.push('APPOINTMENT');
    const foreign = {
      ...source.records[0]!,
      id: 'appointment-work',
      reference: 'APT-1',
      model: 'APPOINTMENT' as const,
    };
    source.records.push(foreign);
    source.lineItems.push({
      ...source.lineItems[0]!,
      id: 'appointment-line',
      recordId: foreign.id,
      quantity: 999,
      unit: 'minutes',
      itemAmountMinor: 9999999,
    });
    const view = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect(view.metrics.work_requested!.value).toBeNull();
    expect([
      view.metrics.order_units!.value,
      view.metrics.order_item_sales!.value,
      view.metrics.order_average_item_sales!.value,
    ]).toEqual([1764, 117600000, 100000]);
    expect(view.reportRecords.RPT_ORDER_OUTCOMES).toHaveLength(1248);
    expect(exportInsightsCsv(view, 'RPT_ORDER_OUTCOMES').split('\r\n')).toHaveLength(1250);
    expect(exportInsightsCsv(view, 'RPT_ORDER_VARIANTS')).not.toContain('"minutes"');
  });

  it('exports only the selected resource model and uses work evidence for attendance drilldowns', () => {
    const source = createModelSnapshot('self_drive', 'ASSET_INTERVAL');
    const sessionProfile = profiles.find((row) =>
      row.candidateModels.includes('SESSION_CAPACITY'),
    )!;
    const session = createModelSnapshot(sessionProfile.subcategoryId, 'SESSION_CAPACITY');
    source.enabledModels.push('SESSION_CAPACITY');
    source.records.push(...session.records);
    source.capacity.push(...session.capacity);
    source.coverage.push(...session.coverage);
    const view = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
    const rental = exportInsightsCsv(view, 'RPT_ASSET_UTILIZATION', 'asset_reserved_util');
    expect(rental.split('\r\n')).toHaveLength(14);
    expect(rental).toContain('"minutes"');
    expect(rental).not.toContain('"SESSION_CAPACITY"');
    const attendance = exportInsightsCsv(view, 'RPT_SESSION_PLACES', 'session_attendance');
    expect(attendance).toContain('"attendedPlaces"');
    expect(attendance).toContain('"scheduled"');
    expect(attendance).not.toContain('"Usable"');
    expect(attendance.split('\r\n')).toHaveLength(14);
    const places = exportInsightsCsv(view, 'RPT_SESSION_PLACES', 'booked_place_fill');
    expect(places).toContain('"places"');
    expect(places).not.toContain('"ASSET_INTERVAL"');
  });

  it('retains complete cohort denominators and excludes unknown timing from operational rate evidence', () => {
    const rates = [
      ['FIELD_VISIT', 'visit_on_time', 'arrivalAt'],
      ['ASSET_INTERVAL', 'rental_on_time_return', 'returnAt'],
      ['TRANSFER', 'transfer_on_time', 'arrivalAt'],
      ['FREIGHT', 'freight_milestone_on_time', 'arrivalAt'],
      ['LINKED_WINDOWS', 'linked_windows_on_time', 'returnAt'],
    ] as const;
    for (const [model, id, missing] of rates) {
      const profile = profiles.find((row) => row.candidateModels.includes(model))!;
      const source = createModelSnapshot(profile.subcategoryId, model);
      source.records[0]![missing] = undefined;
      const view = buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY);
      expect(view.metrics[id]!.denominator).toBe(10);
      expect(view.metricRecords[id]).toHaveLength(10);
      const csv = exportInsightsCsv(view, view.metrics[id]!.reportId, id);
      expect(csv.split('\r\n')).toHaveLength(12);
      expect(csv).not.toContain(`"${source.records[0]!.reference}"`);
    }
    for (const [model, id] of [
      ['REQUEST_QUOTE', 'request_with_accepted_quote_rate'],
      ['APPOINTMENT', 'appointment_confirmed_rate'],
      ['PRODUCTION_DUE', 'production_on_time'],
    ] as const) {
      const profile = profiles.find((row) => row.candidateModels.includes(model))!;
      const view = buildInsights(
        createModelSnapshot(profile.subcategoryId, model),
        DEFAULT_FILTERS,
        SAMPLE_POLICY,
      );
      expect(view.metrics[id]!.denominator).toBe(12);
      expect(view.metricRecords[id]).toHaveLength(12);
    }
  });

  it('deduplicates repeated evidence and refuses contradictory identities', () => {
    const source = createRestaurantSnapshot();
    source.records.push({ ...source.records[0]! });
    expect(
      buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY).metrics.order_completed!.value,
    ).toBe(1176);
    source.records.push({ ...source.records[0]!, outcome: 'cancelled' });
    expect(() => buildInsights(source, DEFAULT_FILTERS, SAMPLE_POLICY)).toThrow(
      'Conflicting evidence',
    );
  });

  it('keeps quote acceptance separate from completed work and refuses duplicated resource pools or mixed currencies', () => {
    const profile = profiles.find((row) => row.candidateModels.includes('REQUEST_QUOTE'))!;
    const quote = buildInsights(
      createModelSnapshot(profile.subcategoryId, 'REQUEST_QUOTE'),
      DEFAULT_FILTERS,
      SAMPLE_POLICY,
    );
    expect([
      quote.metrics.request_with_accepted_quote_rate!.value,
      quote.metrics.work_completed!.value,
      quote.metrics.net_posted_credit!.value,
    ]).toEqual([50, 0, null]);
    const rental = createModelSnapshot('self_drive', 'ASSET_INTERVAL');
    rental.capacity.push({ ...rental.capacity[0]!, id: 'duplicate-pool' });
    const invalid = buildInsights(rental, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([
      invalid.metrics.asset_reserved_util!.value,
      invalid.metrics.asset_reserved_util!.status,
    ]).toEqual([null, 'unavailable']);
    expect(invalid.metrics.asset_reserved_util!.reason).toContain('owner-confirmed pool');
    const restaurant = createRestaurantSnapshot();
    restaurant.postings[0]!.currency = 'USD';
    const mixed = buildInsights(restaurant, DEFAULT_FILTERS, SAMPLE_POLICY);
    expect([mixed.metrics.net_posted_credit!.value, mixed.metrics.order_completed!.value]).toEqual([
      null,
      1176,
    ]);
    expect([...new Set(mixed.postingRows.map((row) => row.currency))].sort()).toEqual([
      'KES',
      'USD',
    ]);
    expect(exportInsightsCsv(mixed, 'RPT_POSTED_MERCHANT_ACTIVITY')).toContain('"USD"');
  });
});

describe('date-only scope, comparison and CSV safety', () => {
  it('preserves Nairobi calendar dates and inclusive bounds without UTC day shifts', () => {
    expect(localDateInNairobi('2026-10-03T21:00:00Z')).toBe('2026-10-04');
    expect(localDateInNairobi('2026-10-31T21:00:00Z')).toBe('2026-11-01');
    expect(parseDateRange('2026-10-04', '2026-10-31')).toEqual({
      from: '2026-10-04',
      to: '2026-10-31',
    });
    expect(previousDateRange({ from: '2026-10-04', to: '2026-10-31' })).toEqual({
      from: '2026-09-06',
      to: '2026-10-03',
    });
    expect(() => parseDateRange('2026-02-30', '2026-03-01')).toThrow('valid ordered');
    expect(() => localDateInNairobi('2026-10-04T00:00:00')).toThrow('explicit-offset');
    const day = buildInsights(
      createRestaurantSnapshot(),
      { ...DEFAULT_FILTERS, from: '2026-10-31', to: '2026-10-31', keyword: 'ORD-1248' },
      SAMPLE_POLICY,
    );
    expect(day.metrics.order_completed!.value).toBe(1);
  });

  it('compares only matched complete scopes and does not invent infinite growth over zero', () => {
    const source = createRestaurantSnapshot();
    const current = buildInsights(
      source,
      { ...DEFAULT_FILTERS, from: '2026-10-11', to: '2026-10-17' },
      SAMPLE_POLICY,
    );
    const previous = buildInsights(
      source,
      { ...DEFAULT_FILTERS, from: '2026-10-04', to: '2026-10-10' },
      SAMPLE_POLICY,
    );
    expect(
      compareMetric(current.metrics.order_completed!, previous.metrics.order_completed!),
    ).toMatchObject({ status: 'ready', absoluteChange: 28, percentChange: 11.11111111111111 });
    const zero = buildInsights(
      source,
      { ...DEFAULT_FILTERS, from: '2026-09-27', to: '2026-10-03' },
      SAMPLE_POLICY,
    );
    expect(
      compareMetric(previous.metrics.order_completed!, zero.metrics.order_completed!),
    ).toMatchObject({ status: 'ready', absoluteChange: 252, percentChange: null });
    source.coverage = source.coverage.map((row) =>
      row.kind === 'work' ? { ...row, status: 'partial' } : row,
    );
    const partial = buildInsights(
      source,
      { ...DEFAULT_FILTERS, from: '2026-10-11', to: '2026-10-17' },
      SAMPLE_POLICY,
    );
    expect(
      compareMetric(partial.metrics.order_completed!, previous.metrics.order_completed!),
    ).toMatchObject({ status: 'unavailable', absoluteChange: null, percentChange: null });
  });

  it('quotes CSV text and protects formula-like cells while retaining numeric negatives', () => {
    expect(csvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
    expect(csvCell('  +CMD')).toBe('"\'  +CMD"');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(-1200)).toBe('"-1200"');
    const source = createRestaurantSnapshot();
    source.records[0]!.reference = '=HYPERLINK("bad")';
    const view = buildInsights(source, { ...DEFAULT_FILTERS, keyword: 'HYPERLINK' }, SAMPLE_POLICY);
    expect(view.records.length).toBe(1);
    expect(exportInsightsCsv(view)).toContain('"\'=HYPERLINK(""bad"")"');
  });
});
