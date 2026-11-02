import { parseCsv, localOfferingsSource } from '../offerings/source';
import {
  LOCATIONS,
  addMinutes,
  applyProposal,
  clone,
  evaluate,
  overlaps,
  previewImpact,
  scopeKey,
  seedSnapshot,
  stamp,
  validateHours,
  type AvailabilityRequest,
  type Context,
  type Commitment,
  type History,
  type Proposal,
  type Snapshot,
} from './model';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type Operation = {
  id: string;
  state: 'applied' | 'pending' | 'rejected' | 'partial';
  expectedRevision?: number;
  scope: string;
  proposal: Proposal;
  reason?: string;
  targets?: { location: string; state: 'applied' | 'rejected'; reason?: string }[];
};
type Document = {
  format: 1;
  profileId: string;
  revision: number;
  scopes: Record<string, Snapshot>;
  drafts: Record<string, Proposal>;
  operations: Operation[];
};
export const storageKey = (profileId: string) => 'nexg.availability.preview.v1.' + profileId;
export interface AvailabilitySource {
  load(c: Context): Promise<Snapshot>;
  saveDraft(c: Context, p: Proposal): Promise<void>;
  draft(c: Context): Promise<Proposal | null>;
  discardDraft(c: Context): Promise<void>;
  impact(c: Context, p: Proposal, revision: number): Promise<ReturnType<typeof previewImpact>>;
  apply(
    c: Context,
    p: Proposal,
    revision: number,
    mode?: 'normal' | 'reject' | 'unknown',
  ): Promise<Operation>;
  reconcile(c: Context, id: string): Promise<Operation>;
  operations(c: Context): Promise<Operation[]>;
  refresh(c: Context, acknowledgeExpiry?: boolean): Promise<Snapshot>;
  setClock(c: Context, now: string): Promise<Snapshot>;
  resolveWork(
    c: Context,
    workId: string,
    action: 'return' | 'reassign' | 'reschedule' | 'fee',
    payload: { resourceId?: string; start?: string; end?: string; referenceEventId?: string },
    revision: number,
  ): Promise<Snapshot>;
  reset(c: Context): Promise<Snapshot>;
}
function validSnapshot(s: Snapshot) {
  return (
    s &&
    typeof s.scope === 'string' &&
    Number.isSafeInteger(s.revision) &&
    Number.isSafeInteger(s.offeringVersion) &&
    Array.isArray(s.hours) &&
    s.hours.length === 7 &&
    s.hours.every(
      (h) =>
        Number.isInteger(h.day) &&
        ['open', 'closed', 'unspecified'].includes(h.state) &&
        Array.isArray(h.intervals) &&
        h.intervals.every(
          (i) =>
            typeof i.start === 'string' &&
            typeof i.end === 'string' &&
            typeof i.nextDay === 'boolean',
        ),
    ) &&
    Array.isArray(s.resources) &&
    s.resources.every(
      (r) =>
        r &&
        typeof r.id === 'string' &&
        typeof r.name === 'string' &&
        ['current', 'unknown'].includes(r.state),
    ) &&
    Array.isArray(s.events) &&
    s.events.every(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        typeof e.workId === 'string' &&
        typeof e.title === 'string' &&
        Array.isArray(e.resources) &&
        e.resources.every((r) => typeof r === 'string') &&
        Number.isFinite(stamp(e.start)) &&
        Number.isFinite(stamp(e.end)) &&
        [
          'confirmed',
          'held',
          'in_use',
          'overdue',
          'block',
          'break',
          'tentative',
          'completed',
        ].includes(e.status),
    ) &&
    Array.isArray(s.pools) &&
    s.pools.every(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.unit === 'string' &&
        Number.isFinite(p.total) &&
        p.total >= 0,
    ) &&
    Array.isArray(s.occurrences) &&
    s.occurrences.every(
      (o) =>
        typeof o.id === 'string' &&
        Number.isFinite(stamp(o.start)) &&
        Number.isFinite(stamp(o.end)) &&
        Array.isArray(o.resources),
    ) &&
    Array.isArray(s.pauses) &&
    s.pauses.every(
      (p) =>
        typeof p.method === 'string' &&
        typeof p.reason === 'string' &&
        Number.isFinite(stamp(p.start)) &&
        (!p.end || Number.isFinite(stamp(p.end))),
    ) &&
    Array.isArray(s.history) &&
    s.settings &&
    Number.isFinite(s.settings.noticeMinutes) &&
    Number.isFinite(s.settings.horizonDays) &&
    typeof s.settings.cutoff === 'string' &&
    Number.isFinite(stamp(s.now)) &&
    Number.isFinite(stamp(s.observedAt)) &&
    Number.isFinite(stamp(s.coverageStart)) &&
    Number.isFinite(stamp(s.coverageEnd))
  );
}
export function localAvailabilitySource(storage: StorageLike): AvailabilitySource {
  function read(c: Context): Document {
    let raw: string | null;
    try {
      raw = storage.getItem(storageKey(c.profile.id));
    } catch {
      throw new Error(
        'This browser cannot read local preview storage. Your open edits are retained.',
      );
    }
    if (!raw)
      return {
        format: 1,
        profileId: c.profile.id,
        revision: 0,
        scopes: {},
        drafts: {},
        operations: [],
      };
    try {
      const d = JSON.parse(raw) as Document;
      if (
        d.format !== 1 ||
        d.profileId !== c.profile.id ||
        !Number.isSafeInteger(d.revision) ||
        d.revision < 0 ||
        !d.scopes ||
        !d.drafts ||
        !Array.isArray(d.operations) ||
        Object.values(d.scopes).some((s) => !validSnapshot(s)) ||
        Object.values(d.drafts).some(
          (p) => !p || typeof p.id !== 'string' || typeof p.kind !== 'string',
        ) ||
        d.operations.some(
          (o) =>
            !o ||
            typeof o.id !== 'string' ||
            !['applied', 'pending', 'rejected', 'partial'].includes(o.state) ||
            !o.proposal,
        )
      )
        throw new Error('invalid');
      return d;
    } catch {
      throw new Error(
        'The saved Availability preview could not be read. Reset this specialty’s Availability sample to recover. Offerings and other previews will be kept.',
      );
    }
  }
  function write(c: Context, d: Document) {
    try {
      storage.setItem(storageKey(c.profile.id), JSON.stringify(d));
    } catch {
      throw new Error(
        'Changes could not be saved locally. Your current inputs are still open. Free browser storage or export your draft and retry.',
      );
    }
    if (typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('nexg:availability-preview', {
          detail: { profileId: c.profile.id, revision: d.revision },
        }),
      );
  }
  function snapshot(c: Context, d: Document): Snapshot {
    const own = clone(d.scopes[scopeKey(c)] ?? seedSnapshot(c));
    own.revision = d.revision;
    own.pendingOperationIds = d.operations
      .filter(
        (o) =>
          o.state === 'pending' &&
          (o.scope === scopeKey(c) || o.proposal.targets?.includes(c.location)),
      )
      .map((o) => o.id);
    own.events = own.events.filter((e) => !e.ownerScope);
    // Other saved activities/locations can constrain the same identified resource.
    const ids = new Set(own.resources.map((r) => r.id));
    for (const [key, s] of Object.entries(d.scopes))
      if (key !== scopeKey(c)) {
        for (const e of s.events)
          if (!e.ownerScope && e.status !== 'completed' && e.resources.some((id) => ids.has(id)))
            own.events.push({
              ...clone(e),
              id: key + '::' + e.id,
              poolId: undefined,
              ownerScope: {
                offeringId: JSON.parse(key)[1],
                location: JSON.parse(key)[0],
                method: JSON.parse(key)[2],
                workId: e.workId,
              },
              title: e.location === c.location ? e.title : 'Busy at another location',
              role: e.role === 'Session anchor' ? 'Session anchor' : 'Shared resource constraint',
            });
      }
    return own;
  }
  function checkRevision(d: Document, expected: number) {
    if (d.revision !== expected)
      throw new Error(
        'This schedule changed in another tab or activity. Your draft is retained. Reload the current revision and review the differences before applying.',
      );
  }
  function persist(c: Context, d: Document, s: Snapshot, p: Proposal) {
    d.revision++;
    const describe = (state: Snapshot) =>
      [
        ...state.hours.map(
          (day) =>
            ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
              day.day
            ] +
            ': ' +
            (day.state === 'open'
              ? day.intervals
                  .map((i) => i.start + '–' + i.end + (i.nextDay ? ' next day' : ''))
                  .join(', ')
              : day.state),
        ),
        'Notice ' +
          state.settings.noticeMinutes +
          ' min; horizon ' +
          state.settings.horizonDays +
          ' days',
        ...state.pools.map((pool) => pool.label + ': ' + pool.total + ' ' + pool.unit),
        ...state.pauses.map(
          (pause) =>
            pause.method + ': paused ' + pause.start + ' until ' + (pause.end ?? 'manual resume'),
        ),
        ...state.events
          .filter((e) => !e.ownerScope)
          .map(
            (e) =>
              e.workId +
              ' · ' +
              e.status +
              ' · ' +
              e.start +
              ' → ' +
              e.end +
              ' · ' +
              e.resources
                .map((id) => state.resources.find((r) => r.id === id)?.name ?? id)
                .join(' + '),
          ),
      ].join('\n');
    const h: History = {
      operationId: p.id,
      title: p.title,
      at: s.now,
      revision: d.revision,
      before: describe(d.scopes[scopeKey(c)] ?? seedSnapshot(c)),
      after: describe(s),
      effectiveFrom: p.effectiveFrom ?? p.date ?? p.start ?? s.now,
    };
    // Shared constraints remain owned by their original scope.
    const currentIds = new Set((d.scopes[scopeKey(c)] ?? seedSnapshot(c)).events.map((e) => e.id));
    s.events = s.events.filter(
      (e) => !e.ownerScope && (currentIds.has(e.id) || e.id.startsWith(p.id)),
    );
    s.revision = d.revision;
    s.history = [h, ...s.history].slice(0, 100);
    d.scopes[scopeKey(c)] = s;
    if (d.drafts[scopeKey(c)]?.id === p.id) delete d.drafts[scopeKey(c)];
  }
  function permitted(c: Context) {
    if (c.role !== 'manager' || c.location === 'All locations')
      throw new Error('Choose an editable location and manager sample role.');
  }
  async function checkOffering(c: Context) {
    const catalog = await localOfferingsSource(storage).load(c.profile);
    const current = catalog.offerings.find((o) => o.id === c.offering.id);
    if (
      !current ||
      current.version !== c.offering.version ||
      current.schemaId !== c.offering.schemaId
    )
      throw new Error(
        'The offering changed or was removed. Keep the draft, reload Offerings and review the current definition before applying.',
      );
  }
  function targetImpact(c: Context, d: Document, p: Proposal) {
    const targets = p.targets ?? [];
    if (
      !targets.length ||
      new Set(targets).size !== targets.length ||
      targets.some((l) => !LOCATIONS.includes(l as (typeof LOCATIONS)[number]))
    )
      throw new Error('Select unique, explicit compatible target locations.');
    const results = targets.map((location) => ({
      location,
      impact: previewImpact(snapshot({ ...c, location }, d), p, { ...c, location }),
    }));
    return results;
  }
  function applyTargets(c: Context, d: Document, p: Proposal, op: Operation) {
    const targets = targetImpact(c, d, p);
    if (targets.some((t) => t.impact.errors.length) && !p.allowPartial)
      throw new Error(
        'Some targets have conflicts. Review all results and explicitly choose whether to apply only eligible targets.',
      );
    op.targets = [];
    for (const t of targets) {
      if (t.impact.errors.length)
        op.targets.push({
          location: t.location,
          state: 'rejected',
          reason: t.impact.errors.join(' '),
        });
      else {
        const target = { ...c, location: t.location };
        persist(target, d, applyProposal(snapshot(target, d), p, target), p);
        op.targets.push({ location: t.location, state: 'applied' });
      }
    }
    op.state = op.targets.every((t) => t.state === 'applied')
      ? 'applied'
      : op.targets.some((t) => t.state === 'applied')
        ? 'partial'
        : 'rejected';
  }
  const source: AvailabilitySource = {
    async load(c) {
      if (c.scenario === 'error')
        throw new Error(
          'The sample source could not be loaded. Retry or choose another sample state.',
        );
      const s = snapshot(c, read(c));
      if (c.scenario === 'empty') {
        s.events = [];
        s.occurrences = [];
      }
      if (c.scenario === 'unconfigured') s.resources = [];
      if (c.scenario === 'unknown')
        s.resources = s.resources.map((r) => ({ ...r, state: 'unknown' }));
      if (c.scenario === 'partial' && s.resources.length)
        s.resources[s.resources.length - 1]!.state = 'unknown';
      return s;
    },
    async draft(c) {
      return clone(read(c).drafts[scopeKey(c)] ?? null);
    },
    async saveDraft(c, p) {
      const d = read(c);
      d.drafts[scopeKey(c)] = clone(p);
      write(c, d);
    },
    async discardDraft(c) {
      const d = read(c);
      delete d.drafts[scopeKey(c)];
      write(c, d);
    },
    async impact(c, p, revision) {
      await checkOffering(c);
      const d = read(c);
      checkRevision(d, revision);
      if (p.targets) {
        const targets = targetImpact(c, d, p),
          bad = targets.filter((t) => t.impact.errors.length);
        return {
          errors:
            bad.length && !p.allowPartial
              ? [
                  'Some targets are blocked. Resolve them or explicitly allow eligible targets only.',
                ]
              : targets.every((t) => t.impact.errors.length)
                ? ['No selected target is eligible.']
                : [],
          affected: targets.flatMap((t) => t.impact.affected),
          warnings: [],
          occurrences: [],
          targets: targets.map((t) => ({ location: t.location, errors: t.impact.errors })),
        };
      }
      return previewImpact(snapshot(c, d), p, c);
    },
    async apply(c, p, revision, mode = 'normal') {
      await checkOffering(c);
      permitted(c);
      const d = read(c),
        existing = d.operations.find((o) => o.id === p.id);
      if (existing) {
        if (JSON.stringify(existing.proposal) !== JSON.stringify(p))
          throw new Error(
            'This operation reference belongs to a different proposal. Reload its result or start a new change.',
          );
        return clone(existing);
      }
      checkRevision(d, revision);
      const s = snapshot(c, d),
        impact = previewImpact(s, p, c);
      if (!p.targets && impact.errors.length) throw new Error(impact.errors.join(' '));
      if (p.targets) {
        const targets = targetImpact(c, d, p);
        if (
          targets.every((t) => t.impact.errors.length) ||
          (targets.some((t) => t.impact.errors.length) && !p.allowPartial)
        )
          throw new Error(
            'Existing commitments are retained. Review target conflicts before applying.',
          );
      }
      const op: Operation = {
        id: p.id,
        scope: scopeKey(c),
        proposal: clone(p),
        expectedRevision: d.revision,
        state: mode === 'unknown' ? 'pending' : mode === 'reject' ? 'rejected' : 'applied',
        reason:
          mode === 'reject'
            ? 'Simulated source rejection. No schedule change was applied.'
            : undefined,
      };
      if (mode === 'normal') {
        if (p.targets?.length) {
          applyTargets(c, d, p, op);
        } else persist(c, d, applyProposal(s, p, c), p);
      }
      d.operations = [op, ...d.operations].slice(0, 100);
      write(c, d);
      return clone(op);
    },
    async operations(c) {
      return clone(read(c).operations.filter((o) => o.scope === scopeKey(c)));
    },
    async reconcile(c, id) {
      await checkOffering(c);
      permitted(c);
      const d = read(c),
        op = d.operations.find((o) => o.id === id);
      if (!op || op.scope !== scopeKey(c))
        throw new Error('This operation does not belong to the current scope.');
      if (op.state !== 'pending') return clone(op);
      const s = snapshot(c, d);
      if (op.expectedRevision !== undefined && op.expectedRevision !== d.revision) {
        op.state = 'rejected';
        op.reason =
          'The schedule changed while this result was unknown. Retain the draft and review the new revision before applying.';
        write(c, d);
        return clone(op);
      }
      try {
        if (op.proposal.targets?.length) applyTargets(c, d, op.proposal, op);
        else {
          const next = applyProposal(s, op.proposal, c);
          persist(c, d, next, op.proposal);
          op.state = 'applied';
        }
      } catch (e) {
        op.state = 'rejected';
        op.reason = e instanceof Error ? e.message : 'The proposal is no longer valid.';
      }
      write(c, d);
      return clone(op);
    },
    async refresh(c, acknowledgeExpiry = false) {
      if (['error', 'offline', 'unknown'].includes(c.scenario))
        throw new Error(
          'The simulated source is unavailable. The last confirmed snapshot is retained.',
        );
      const d = read(c),
        s = snapshot(c, d);
      if (acknowledgeExpiry) {
        permitted(c);
        const ended = s.events.filter(
          (e) => e.status === 'held' && e.expiresAt && stamp(e.expiresAt) <= stamp(s.now),
        );
        s.events = s.events.map((e) =>
          ended.includes(e) ? { ...e, status: 'completed', title: e.title + ' · Hold expired' } : e,
        );
        if (ended.length)
          persist(c, d, s, {
            id: 'expiry-' + s.now,
            kind: 'settings',
            title: 'Sample owner confirmed ' + ended.length + ' expired hold(s)',
            reason: 'Authoritative expiry response',
          });
      }
      s.observedAt = s.now;
      d.scopes[scopeKey(c)] = {
        ...s,
        events: s.events.filter((e) => !e.ownerScope),
        revision: d.revision,
      };
      write(c, d);
      return snapshot(c, d);
    },
    async setClock(c, now) {
      if (!Number.isFinite(stamp(now))) throw new Error('Enter a valid Nairobi date and time.');
      const d = read(c),
        s = snapshot(c, d);
      s.now = now;
      d.scopes[scopeKey(c)] = { ...s, events: s.events.filter((e) => !e.ownerScope) };
      write(c, d);
      return s;
    },
    async resolveWork(c, workId, action, payload, revision) {
      await checkOffering(c);
      permitted(c);
      const d = read(c);
      checkRevision(d, revision);
      const s = snapshot(c, d);
      const indices = s.events.map((e, i) => (e.workId === workId ? i : -1)).filter((i) => i >= 0);
      if (!indices.length) throw new Error('That work record is not in this Availability scope.');
      const record = payload.referenceEventId
        ? s.events.find((e) => e.id === payload.referenceEventId && e.workId === workId)
        : s.events[indices[0]!]!;
      if (!record) throw new Error('The selected work allocation no longer exists in this scope.');
      const current: Context = { ...c, scenario: 'current' };
      if (
        c.scenario !== 'current' ||
        c.offering.sources.availability === 'external' ||
        c.offering.sync !== 'current'
      )
        throw new Error('The sample source must be current and locally managed.');
      if (action === 'return') {
        if (!record.ongoing) throw new Error('This record has no outstanding physical return.');
        for (const i of indices)
          s.events[i] = {
            ...s.events[i]!,
            status: 'completed',
            ongoing: false,
            end: s.now,
            title: record.title + ' · Returned',
          };
      } else if (action === 'fee') {
        if (record.status !== 'held' || !record.fee)
          throw new Error('This record has no pending reservation fee.');
        if (record.expiresAt && stamp(record.expiresAt) <= stamp(s.now))
          throw new Error(
            'The hold deadline has passed. Check its source result before collecting or confirming.',
          );
        const without = { ...s, events: s.events.filter((e) => e.workId !== workId) };
        // Existing accepted holds retain their original service terms; never infer a new allocation from payment alone.
        const conflict = without.events.some(
          (e) =>
            e.status !== 'completed' &&
            e.resources.some((id) => record.resources.includes(id)) &&
            overlaps(record.start, record.end, e.start, e.ongoing ? s.coverageEnd : e.end),
        );
        if (conflict)
          throw new Error(
            'A resource conflict prevents the sample confirmation. Payment alone does not confirm capacity.',
          );
        for (const i of indices)
          s.events[i] = {
            ...s.events[i]!,
            fee: { amount: record.fee.amount, state: 'recorded' },
            status: 'confirmed',
          };
      } else if (
        action === 'reschedule' &&
        c.offering.schemaId === 'PICKUP_RETURN_V1' &&
        indices.length > 1
      ) {
        if (
          !payload.start ||
          !payload.end ||
          !Number.isFinite(stamp(payload.start)) ||
          Math.abs(
            stamp(payload.end) - stamp(payload.start) - (stamp(record.end) - stamp(record.start)),
          ) > 1
        )
          throw new Error(
            'Move the linked schedule without changing its accepted processing duration.',
          );
        const shift = (stamp(payload.start) - stamp(record.start)) / 60000;
        const moved = indices.map((i) => ({
          ...s.events[i]!,
          start: addMinutes(s.events[i]!.start, shift),
          end: addMinutes(s.events[i]!.end, shift),
        }));
        const incoming = moved.find(
            (e) => e.role === 'Collection' || e.role === 'Customer drop-off',
          ),
          outgoing = moved.find((e) => e.role === 'Return' || e.role === 'Customer pickup'),
          processing = moved.find((e) => e.role === 'Processing');
        if (!incoming || !processing) throw new Error('The linked role information is incomplete.');
        if (moved.some((e) => stamp(e.end) > stamp(s.coverageEnd)))
          throw new Error('A linked role extends beyond confirmed source coverage.');
        const checked = evaluate(
          { ...s, events: s.events.filter((e) => e.workId !== workId) },
          {
            ...current,
            offering: {
              ...c.offering,
              publication: 'published',
              priceMode: 'fixed',
              availabilityLinked: true,
            },
          },
          {
            start: incoming.start,
            end: incoming.end,
            resourceIds: [...new Set(moved.flatMap((e) => e.resources))],
            quantity: processing.quantity ?? 1,
            poolId: processing.poolId,
            outgoingStart: outgoing?.start,
            outgoingEnd: outgoing?.end,
          },
        );
        if (checked.state !== 'available') throw new Error(checked.reasons.join(' '));
        indices.forEach((i, k) => {
          s.events[i] = moved[k]!;
        });
      } else {
        const start = action === 'reschedule' ? payload.start : record.start,
          end = action === 'reschedule' ? payload.end : record.end;
        const resources =
          action === 'reassign'
            ? [payload.resourceId ?? '', ...record.resources.slice(1)]
            : record.resources;
        const q: AvailabilityRequest = {
          start: start ?? '',
          end: end ?? '',
          quantity: record.quantity ?? 1,
          resourceIds: resources,
          poolId: record.poolId,
        };
        const check = evaluate(
          { ...s, events: s.events.filter((e) => e.workId !== workId) },
          {
            ...current,
            offering: {
              ...c.offering,
              publication: 'published',
              priceMode: 'fixed',
              availabilityLinked: true,
            },
          },
          q,
        );
        if (check.state !== 'available') throw new Error(check.reasons.join(' '));
        for (const i of indices)
          s.events[i] = { ...s.events[i]!, start: start!, end: end!, resources };
      }
      const p: Proposal = {
        id: 'work-' + workId + '-' + action + '-' + d.revision,
        kind: 'settings',
        title: 'Work ' + workId + ': ' + action,
        reason: 'Explicit local Work action',
      };
      persist(c, d, s, p);
      write(c, d);
      return snapshot(c, d);
    },
    async reset(c) {
      const d = read(c);
      delete d.scopes[scopeKey(c)];
      delete d.drafts[scopeKey(c)];
      d.operations = d.operations.filter((o) => o.scope !== scopeKey(c));
      d.revision++;
      write(c, d);
      return snapshot(c, d);
    },
  };
  return source;
}
export function resetMalformedProfile(storage: StorageLike, profileId: string) {
  storage.removeItem(storageKey(profileId));
}
export function scheduleCsv(s: Snapshot) {
  const safe = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\t\r-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    ['sample_day', 'state', 'start', 'end', 'ends_next_day'],
    ...s.hours.flatMap((h) =>
      h.state === 'open'
        ? h.intervals.map((i) => [h.day, h.state, i.start, i.end, String(i.nextDay)])
        : [[h.day, h.state, '', '', 'false']],
    ),
  ]
    .map((row) => row.map(safe).join(','))
    .join('\r\n');
}
export function importHours(text: string): { hours: Snapshot['hours']; errors: string[] } {
  const rows = parseCsv(text),
    errors: string[] = [];
  if (rows[0]?.join(',') !== 'sample_day,state,start,end,ends_next_day')
    return {
      hours: [],
      errors: ['Use the exported headers: sample_day,state,start,end,ends_next_day.'],
    };
  const hours: Snapshot['hours'] = Array.from({ length: 7 }, (_, day) => ({
    day,
    state: 'unspecified',
    intervals: [],
  }));
  const seen = new Set<number>();
  rows.slice(1).forEach((row, i) => {
    const day = Number(row[0]),
      state = row[1];
    if (
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6 ||
      !['open', 'closed', 'unspecified'].includes(state ?? '')
    ) {
      errors.push('Row ' + (i + 2) + ': invalid day or state.');
      return;
    }
    if (seen.has(day) && hours[day]!.state !== state) {
      errors.push('Row ' + (i + 2) + ': conflicting day states.');
      return;
    }
    seen.add(day);
    hours[day]!.state = state as Snapshot['hours'][number]['state'];
    if (state === 'open') {
      if (!['true', 'false'].includes(row[4] ?? ''))
        errors.push('Row ' + (i + 2) + ': ends_next_day must be true or false.');
      hours[day]!.intervals.push({
        start: row[2] ?? '',
        end: row[3] ?? '',
        nextDay: row[4] === 'true',
      });
    }
  });
  if (seen.size !== 7)
    errors.push('Include all seven weekdays; missing is not the same as closed.');
  errors.push(...validateHours(hours));
  return { hours, errors };
}
export function workHref(c: Context, workId: string, owner?: Commitment['ownerScope']) {
  const params = new URLSearchParams({
    availabilityProfile: c.profile.id,
    offering: owner?.offeringId ?? c.offering.id,
    location: owner?.location ?? c.location,
    method: owner?.method ?? c.method,
    work: owner?.workId ?? workId,
    role: c.role,
    scenario: c.scenario,
    returnTo:
      typeof window !== 'undefined' &&
      window.location.pathname === '/merchant-live-preview/availability'
        ? window.location.pathname + window.location.search
        : '/merchant-live-preview/availability?' +
          new URLSearchParams({
            profile: c.profile.id,
            offering: c.offering.id,
            location: c.location,
            method: c.method,
          }),
  });
  return '/merchant-live-preview/work?' + params.toString();
}
export function offeringHref(c: Context) {
  return (
    '/merchant-live-preview/offerings?' +
    new URLSearchParams({
      profile: c.profile.id,
      offering: c.offering.id,
      returnTo:
        '/merchant-live-preview/availability?' +
        new URLSearchParams({
          profile: c.profile.id,
          offering: c.offering.id,
          location: c.location,
          method: c.method,
        }).toString(),
    }).toString()
  );
}
