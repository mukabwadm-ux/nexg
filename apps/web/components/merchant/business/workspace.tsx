'use client';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertCircle, Download, FileText, MapPin, Package } from 'lucide-react';
import { MerchantLivePreviewShell } from '../live-preview-shell';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import { ActivityEditor, DocumentEditor, LocationEditor, MemberEditor } from './editors';
import {
  blockingImpact,
  category,
  changeImpact,
  createActivity,
  parseEditorDraft,
  profiles,
  sections,
  validateBusiness,
  type Activity,
  type Business,
  type BusinessDocument,
  type Location,
  type Member,
  type Section,
} from './model';
import { Button, Empty, Field, Modal, Note } from './primitives';
import {
  BusinessConflict,
  localBusinessSource,
  readDraft,
  writeDraft,
  type BusinessSource,
} from './source';
import {
  ActivitiesView,
  DocumentsView,
  FeedbackView,
  LocationsView,
  ProfileView,
  TeamView,
  type ViewProps,
} from './views';
import styles from './workspace.module.css';
import type { MerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

type Scenario =
  | 'normal'
  | 'viewer'
  | 'external'
  | 'stale'
  | 'offline'
  | 'unavailable'
  | 'empty'
  | 'conflict';
type Editor = { section: Section; id: string; value: unknown; baseRevision: number };
type Dialog = 'sample' | 'editor' | 'impact' | 'preview' | 'request' | 'history' | 'reset' | null;
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BusinessWorkspace({
  initialProfileId = 'haircare',
  initialTab = 'activities',
  source: providedSource,
  demoContext,
  liveData,
  liveTools,
  liveMemberTools,
}: {
  initialProfileId?: string;
  initialTab?: Section;
  source?: BusinessSource;
  demoContext?: MerchantOnboardingDemoContext | null;
  liveData?: Business;
  liveTools?: Partial<Record<Section, ReactNode>>;
  liveMemberTools?: Record<string, ReactNode>;
}) {
  const inheritedDemo = useMerchantOnboardingDemoContext();
  const live = Boolean(liveData);
  const activeDemo = live ? null : demoContext ?? inheritedDemo;
  const [profileId, setProfileId] = useState(
    category(initialProfileId) ? initialProfileId : 'haircare',
  );
  const [data, setData] = useState<Business | null>(liveData ?? null);
  const [profileDraft, setProfileDraft] = useState<Business['profile'] | null>(liveData?.profile ?? null);
  const [tab, setTab] = useState<Section>(
    sections.some((s) => s.id === initialTab) ? initialTab : 'activities',
  );
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [candidate, setCandidate] = useState<{ next: Business; action: string } | null>(null);
  const [preview, setPreview] = useState({ title: '', description: '' });
  const [request, setRequest] = useState({ kind: '', text: '' });
  const [loading, setLoading] = useState(!live);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const demoProfileId = activeDemo?.profileId;
  const demoBusinessName = activeDemo?.businessName;
  useEffect(() => {
    if (!demoContext && demoProfileId && category(demoProfileId))
      setProfileId(demoProfileId);
  }, [demoContext, demoProfileId]);
  const [locationScope, setLocationScope] = useState('all');
  const source = useMemo(
    () =>
      providedSource ??
      (live || typeof window === 'undefined' ? null : localBusinessSource(window.localStorage)),
    [live, providedSource],
  );
  const readOnly =
    live || ['viewer', 'external', 'offline', 'unavailable', 'empty'].includes(scenario) || busy;
  const accountSummary = data
    ? {
        Approved: ['Business approved', 'Account approval confirmed.'],
        'Review pending': ['Business under review', 'Account review is pending.'],
        'Changes requested': [
          'Business changes requested',
          'Review the requested account corrections.',
        ],
        Paused: ['Business paused', 'Account operations are paused.'],
      }[data.accountStatus]
    : ['Business status unavailable', 'Waiting for confirmed account status.'];
  useEffect(() => {
    if (liveData) {
      setData(liveData);
      setProfileDraft(liveData.profile);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    setNotice('');
    setData(null);
    setLocationScope('all');
    if (!source) return;
    source
      .load(profileId)
      .then((value) => {
        if (!active) return;
        setData(value);
        let restored: Business['profile'] | null = null;
        try {
          const draft = readDraft(localStorage, profileId);
          const p = draft?.value as Business['profile'] | undefined;
          if (
            p &&
            ['name', 'description', 'email', 'contact', 'logo', 'cover'].every(
              (key) => typeof p[key as keyof typeof p] === 'string',
            )
          )
            restored = p;
        } catch {
          setNotice('Browser drafts are unavailable. Confirmed sample data is still displayed.');
        }
        setProfileDraft({ ...(restored ?? value.profile), ...(demoBusinessName !== undefined ? { name: demoBusinessName } : {}) });
        if (restored) setNotice('Recovered your unsaved public-profile draft.');
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Business could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profileId, source, reload, demoBusinessName, liveData]);
  const showPreview = useCallback((title: string, description: string) => {
    setPreview({ title, description });
    setDialog('preview');
  }, []);
  function message(text: string) {
    setNotice(text);
  }
  function storeDraft(next: Editor) {
    try {
      writeDraft(localStorage, profileId, next);
    } catch {
      setNotice('This draft could not be stored. Keep this page open or export a recovery copy.');
    }
  }
  function edit(section: Section, id: string, value: unknown) {
    if (!data || readOnly) return;
    let next = value;
    if (id === 'new') {
      const key = crypto.randomUUID();
      if (section === 'activities') next = createActivity(category(profileId)!, undefined, key);
      if (section === 'locations')
        next = {
          id: key,
          name: '',
          type: 'physical',
          address: '',
          contact: '',
          activityIds: [],
          published: false,
          commitments: 0,
          coverage: '',
        } satisfies Location;
      if (section === 'team')
        next = {
          id: key,
          name: '',
          email: '',
          role: 'Viewer',
          locationIds: [],
          state: 'Invitation pending',
          resource: '',
          activityId: '',
        } satisfies Member;
      if (section === 'documents')
        next = {
          id: key,
          name: '',
          scope: 'Business',
          optional: true,
          current: 'Needed',
          version: 0,
          replacement: 'None',
          reason: 'Optional supporting evidence.',
          filename: '',
          size: 0,
          expires: '',
          note: '',
        } satisfies BusinessDocument;
    }
    let baseRevision = data.revision;
    try {
      const recovered = readDraft(localStorage, profileId, section, id);
      const parsed = recovered ? parseEditorDraft(section, recovered.value) : null;
      if (parsed) {
        next = parsed;
        baseRevision = recovered!.baseRevision;
        setNotice(
          baseRevision === data.revision
            ? 'Recovered your local draft.'
            : 'Recovered an older draft. Review it against the current configuration.',
        );
      }
    } catch {
      setNotice('Draft recovery was unavailable.');
    }
    setEditor({ section, id, value: next, baseRevision });
    setError('');
    setDialog('editor');
  }
  function updateEditor(value: unknown) {
    if (!editor) return;
    const next = { ...editor, value };
    setEditor(next);
    storeDraft(next);
  }
  async function commit(next: Business, action: string) {
    if (!source || !data || readOnly) return;
    setBusy(true);
    setError('');
    try {
      if (scenario === 'conflict') {
        await source.save(data, data.revision, 'Simulated change from another preview tab');
        setScenario('normal');
        throw new BusinessConflict();
      }
      const saved = await source.save(next, data.revision, action);
      setData(saved);
      if (action === 'Public profile updated') setProfileDraft(saved.profile);
      setNotice(`${action}. Saved in this browser only.`);
      if (editor) {
        writeDraft(localStorage, profileId, null, editor.section, editor.id);
        setEditor(null);
      }
      if (action === 'Public profile updated') writeDraft(localStorage, profileId, null);
      for (const review of saved.reviews)
        if (review.reply !== data.reviews.find((r) => r.id === review.id)?.reply)
          writeDraft(localStorage, profileId, null, 'feedback', review.id);
      setCandidate(null);
      setDialog(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The change could not be saved. Your draft is retained.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(next: Business, action: string, review = false) {
    if (!data || readOnly) return;
    setError('');
    const issues = validateBusiness(next);
    if (issues.length) {
      setError(issues.join('\n'));
      return;
    }
    if (review || blockingImpact(data, next)) {
      setCandidate({ next, action });
      setDialog('impact');
      return;
    }
    await commit(next, action);
  }
  async function submitEditor() {
    if (!editor || !data) return;
    const next = structuredClone(data);
    const value = editor.value;
    if (editor.section === 'activities') {
      const a = value as Activity;
      const { validateBookingAnswer } = await import('@nexg/booking-config');
      const errors = Object.entries(a.answers).flatMap(([id, v]) =>
        validateBookingAnswer(id, v).issues.map((issue) => issue.message),
      );
      if (errors.length) {
        setError(errors.join('\n'));
        return;
      }
      next.activities = next.activities.some((x) => x.id === a.id)
        ? next.activities.map((x) => (x.id === a.id ? a : x))
        : [...next.activities, a];
      next.locations = next.locations.map((l) => ({
        ...l,
        activityIds: a.locationIds.includes(l.id)
          ? [...new Set([...l.activityIds, a.id])]
          : l.activityIds.filter((id) => id !== a.id),
      }));
    } else if (editor.section === 'locations') {
      const l = value as Location;
      next.locations = next.locations.some((x) => x.id === l.id)
        ? next.locations.map((x) => (x.id === l.id ? l : x))
        : [...next.locations, l];
      next.activities = next.activities.map((a) => ({
        ...a,
        locationIds: l.activityIds.includes(a.id)
          ? [...new Set([...a.locationIds, l.id])]
          : a.locationIds.filter((id) => id !== l.id),
      }));
    } else if (editor.section === 'team') {
      const m = value as Member;
      next.members = next.members.some((x) => x.id === m.id)
        ? next.members.map((x) => (x.id === m.id ? m : x))
        : [...next.members, m];
    } else if (editor.section === 'documents') {
      const d = value as BusinessDocument;
      if (!d.name.trim()) {
        setError('Enter a supporting document title.');
        return;
      }
      next.documents = [...next.documents, d];
    }
    await save(
      next,
      editor.section === 'team' && editor.id === 'new'
        ? 'Preview invitation created'
        : `${sections.find((s) => s.id === editor.section)?.label} updated`,
      true,
    );
  }
  function setProfile(value: Business['profile']) {
    setProfileDraft(value);
    if (data)
      try {
        writeDraft(localStorage, profileId, {
          section: 'profile',
          id: 'profile',
          value,
          baseRevision: data.revision,
        });
      } catch {
        setNotice('The profile draft could not be stored in this browser.');
      }
  }
  function requestChange(kind: string) {
    setRequest({ kind, text: '' });
    setError('');
    setDialog('request');
  }
  function switchTab(section: Section) {
    setTab(section);
    setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('tab', section);
    window.history.replaceState(null, '', url);
  }
  function tabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? sections.length - 1
          : (index + (e.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length;
    switchTab(sections[next]!.id);
    document.getElementById(`business-tab-${sections[next]!.id}`)?.focus();
  }
  const display = useMemo(() => {
    if (!data) return null;
    if (scenario === 'empty')
      return { ...data, activities: [], locations: [], members: [], documents: [], reviews: [] };
    if (locationScope === 'all') return data;
    return {
      ...data,
      activities: data.activities.filter((a) => a.locationIds.includes(locationScope)),
      locations: data.locations.filter((l) => l.id === locationScope),
      members: data.members.filter((m) => m.locationIds.includes(locationScope)),
      documents: data.documents.filter(
        (d) =>
          d.scope === 'Business' ||
          d.scope === data.locations.find((l) => l.id === locationScope)?.name,
      ),
      reviews: data.reviews.filter((r) => r.locationId === locationScope),
    };
  }, [data, scenario, locationScope]);
  const scopedReadOnly = readOnly || locationScope !== 'all';
  const viewProps: ViewProps | null = display
    ? {
        data: display,
        readOnly: scopedReadOnly,
        live,
        liveMemberTools,
        edit,
        save,
        message,
        preview: showPreview,
        request: requestChange,
      }
    : null;
  const sampleControl = (
    <button
      className="text-gold-text text-xs font-bold underline underline-offset-2"
      onClick={() => setDialog('sample')}
    >
      ▸ Choose sample state
    </button>
  );
  const locationControl = (
    <label className="border-border flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-bold">
      <MapPin size={15} />
      <span className="sr-only">Business location scope</span>
      <select
        aria-label="Business location scope"
        className="bg-transparent"
        value={locationScope}
        onChange={(e) => setLocationScope(e.target.value)}
      >
        <option value="all">All locations</option>
        {data?.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
  const content = (
      <div className={styles.root}>
        <div className="bu-title">
          <div>
            <h1>Business</h1>
            <p className="bu-subtitle">{activeDemo?.businessName ?? data?.profile.name ?? 'Your business'}</p>
          </div>
          {notice && (
            <div className="bu-banner bu-notice" role="status">
              <span>{notice}</span>
              <button className="bu-link" onClick={() => setNotice('')}>
                Dismiss
              </button>
            </div>
          )}
          {live ? locationControl : <button
            className="bu-link bu-small"
            aria-label="View configuration history"
            onClick={() => setDialog('history')}
          >
            Revision {data?.revision ?? '—'}
          </button>}
        </div>
        <div className="bu-summary">
          <div>
            <FileText />
            <span>
              <strong>{accountSummary[0]}</strong>
              <p>{accountSummary[1]}</p>
            </span>
          </div>
          <div>
            <Package />
            <span>
              <strong>
                {live
                  ? `${data?.activities.length ?? 0} declared activities`
                  : `${data?.activities.filter((a) => a.enabled).length ?? '—'} configured activities`}
              </strong>
              <p>{live ? 'From your saved registration.' : 'Active in your workspace.'}</p>
            </span>
          </div>
          {!live && <div>
            <AlertCircle color="#e36c00" />
            <span>
              <strong>
                {data?.activities.filter((a) => !a.enabled).length ?? '—'} activity setup task
              </strong>
              <p>Complete setup to activate.</p>
            </span>
          </div>}
        </div>
        <div className="bu-tabs" role="tablist" aria-label="Business sections">
          {sections.map((s, i) => (
            <button
              key={s.id}
              id={`business-tab-${s.id}`}
              role="tab"
              aria-controls={`business-content-${s.id}`}
              aria-selected={tab === s.id}
              tabIndex={tab === s.id ? 0 : -1}
              onKeyDown={(e) => tabKey(e, i)}
              onClick={() => switchTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scenario !== 'normal' && (
          <div className="bu-banner">
            {scenario === 'viewer'
              ? 'Viewer access: business edits are unavailable.'
              : scenario === 'external'
                ? 'This business configuration is externally managed. Fields are read-only here.'
                : scenario === 'offline'
                  ? 'Source offline. Showing cached sample data; edits are unavailable.'
                  : scenario === 'stale'
                    ? 'Source data is stale. Check the source before applying changes.'
                    : scenario === 'empty'
                      ? 'Empty-state preview. Switch to Normal to edit.'
                      : scenario === 'conflict'
                        ? 'The next save will demonstrate a revision conflict.'
                        : 'Source unavailable.'}
            {scenario === 'external' && (
              <button
                className="bu-link"
                onClick={() =>
                  showPreview(
                    'Source ownership',
                    'Connection settings and credentials are managed in Settings. This preview does not connect an external system.',
                  )
                }
              >
                Source details
              </button>
            )}
          </div>
        )}
        {locationScope !== 'all' && (
          <div className="bu-banner">
            Location-scoped view. Select All locations for the full business.
          </div>
        )}
        {error && !dialog && (
          <div className="bu-error" role="alert">
            {error}{' '}
            <button className="bu-link" onClick={() => setReload((x) => x + 1)}>
              Reload current version
            </button>
          </div>
        )}
        {loading ? (
          <div role="status" className="bu-card">
            Loading Business…
          </div>
        ) : !data || scenario === 'unavailable' ? (
          <Empty
            title="Business could not be loaded"
            text="Use the sample controls to retry or reset this sample."
          />
        ) : (
          display &&
          viewProps &&
          profileDraft && (
            <div
              id={`business-content-${tab}`}
              role="tabpanel"
              aria-labelledby={`business-tab-${tab}`}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
              key={`${profileId}-${tab}`}
            >
              {liveTools?.[tab] && <div className="mb-3">{liveTools[tab]}</div>}
              {tab === 'profile' ? (
                <ProfileView
                  data={display}
                  readOnly={scopedReadOnly}
                  live={live}
                  draft={profileDraft}
                  onChange={setProfile}
                  onSave={() =>
                    save({ ...data, profile: profileDraft }, 'Public profile updated', true)
                  }
                  onCancel={() => {
                    setProfileDraft({ ...data.profile, ...(activeDemo ? { name: activeDemo.businessName } : {}) });
                    writeDraft(localStorage, profileId, null);
                    setNotice('Profile draft discarded.');
                  }}
                  request={requestChange}
                  preview={showPreview}
                  message={message}
                />
              ) : tab === 'activities' ? (
                <ActivitiesView {...viewProps} />
              ) : tab === 'locations' ? (
                <LocationsView {...viewProps} />
              ) : tab === 'team' ? (
                <TeamView {...viewProps} />
              ) : tab === 'documents' ? (
                <DocumentsView {...viewProps} />
              ) : (
                <FeedbackView {...viewProps} />
              )}
            </div>
          )
        )}
        {dialog === 'sample' && (
          <Modal
            title="Business preview controls"
            description="Test shared components with different specialties and source states. Changes remain in your browser."
            onClose={() => setDialog(null)}
            footer={
              <Button primary onClick={() => setDialog(null)}>
                Done
              </Button>
            }
          >
            <div className="bu-fields">
              <Field label="Sample specialty">
                <select
                  value={profileId}
                  onChange={(e) => {
                    setProfileId(e.target.value);
                    setScenario('normal');
                    setEditor(null);
                    setCandidate(null);
                  }}
                >
                  {[...new Set(profiles.map((p) => p.categoryName))].map((name) => (
                    <optgroup key={name} label={name}>
                      {profiles
                        .filter((p) => p.categoryName === name)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Source and access state">
                <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
                  {[
                    'normal',
                    'viewer',
                    'external',
                    'stale',
                    'offline',
                    'unavailable',
                    'empty',
                    'conflict',
                  ].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="bu-split-row">
                <Button
                  onClick={() => {
                    download('business-recovery.json', {
                      data,
                      drafts: localStorage.getItem(`nexg.business.preview.v1.${profileId}.draft`),
                    });
                  }}
                >
                  <Download />
                  Export recovery
                </Button>
                <Button onClick={() => setDialog('reset')}>Reset this sample</Button>
              </div>
              <button className="bu-link" onClick={() => requestChange('New category request')}>
                Request another category
              </button>
              <Note>
                No backend, onboarding, messages or provider records are changed by these controls.
              </Note>
            </div>
          </Modal>
        )}
        {dialog === 'editor' && editor && data && (
          <Modal
            title={
              editor.id === 'new'
                ? `Add ${editor.section === 'activities' ? 'activity' : editor.section === 'locations' ? 'location' : editor.section === 'team' ? 'team member' : 'supporting document'}`
                : `Edit ${editor.section === 'activities' ? 'activity setup' : editor.section === 'locations' ? 'location' : editor.section === 'team' ? 'team access' : 'document'}`
            }
            description="Draft changes are recovered locally. Review the effects before saving."
            onClose={() => {
              setDialog(null);
              setEditor(null);
              setError('');
            }}
            footer={
              <>
                <Button
                  onClick={() => {
                    writeDraft(localStorage, profileId, null, editor.section, editor.id);
                    setEditor(null);
                    setDialog(null);
                  }}
                >
                  Discard draft
                </Button>
                <Button
                  onClick={() => {
                    setDialog(null);
                    setEditor(null);
                    setNotice('Draft kept in this browser.');
                  }}
                >
                  Keep draft
                </Button>
                <Button primary disabled={busy} onClick={submitEditor}>
                  Review changes
                </Button>
              </>
            }
          >
            {error && (
              <div role="alert" className="bu-error" style={{ marginBottom: 10 }}>
                {error}
              </div>
            )}
            {editor.section === 'activities' ? (
              <ActivityEditor
                value={editor.value as Activity}
                onChange={updateEditor}
                data={data}
              />
            ) : editor.section === 'locations' ? (
              <LocationEditor
                value={editor.value as Location}
                onChange={updateEditor}
                data={data}
              />
            ) : editor.section === 'team' ? (
              <MemberEditor value={editor.value as Member} onChange={updateEditor} data={data} />
            ) : (
              <DocumentEditor
                value={editor.value as BusinessDocument}
                onChange={updateEditor}
                data={data}
              />
            )}
          </Modal>
        )}
        {dialog === 'impact' && candidate && data && (
          <Modal
            title="Review configuration changes"
            description="Compare the proposed update with the current configuration. Existing work retains its agreed terms."
            onClose={() => setDialog(editor ? 'editor' : null)}
            footer={
              <>
                <Button
                  onClick={() => {
                    setDialog(editor ? 'editor' : null);
                    setError('');
                  }}
                >
                  Back
                </Button>
                {error && (
                  <Button
                    onClick={() => {
                      setDialog(null);
                      setReload((x) => x + 1);
                      setCandidate(null);
                      setNotice('Reloaded current data. Your local draft is retained.');
                    }}
                  >
                    Reload current
                  </Button>
                )}
                <Button
                  primary
                  disabled={busy || blockingImpact(data, candidate.next)}
                  onClick={() => commit(candidate.next, candidate.action)}
                >
                  {busy ? 'Saving…' : 'Confirm preview changes'}
                </Button>
              </>
            }
          >
            {error && (
              <div role="alert" className="bu-error">
                {error}
              </div>
            )}
            <p>
              <strong>{candidate.action}</strong>
            </p>
            <ul style={{ paddingLeft: 18, margin: '12px 0' }}>
              {changeImpact(data, candidate.next).map((note) => (
                <li key={note} style={{ marginBottom: 8 }}>
                  {note}
                </li>
              ))}
            </ul>
            {blockingImpact(data, candidate.next) ? (
              <Note warning>
                Existing commitments need an operational review before disabling this activity or
                location. Return to the editor to keep it active, or submit a change request.
              </Note>
            ) : (
              <Note>
                This confirms a local preview revision only. It does not publish, send a message,
                verify evidence or change live bookings.
              </Note>
            )}
            {blockingImpact(data, candidate.next) && (
              <Button onClick={() => requestChange('Operational closure review')}>
                Request review
              </Button>
            )}
          </Modal>
        )}
        {dialog === 'preview' && (
          <Modal
            title={preview.title}
            description="Display preview only."
            onClose={() => setDialog(null)}
            footer={<Button onClick={() => setDialog(null)}>Close</Button>}
          >
            <p style={{ whiteSpace: 'pre-line' }}>{preview.description}</p>
          </Modal>
        )}
        {dialog === 'request' && data && (
          <Modal
            title={request.kind}
            description="Create a local review request. Confirmed identity and configuration remain unchanged."
            onClose={() => setDialog(null)}
            footer={
              <>
                <Button onClick={() => setDialog(null)}>Cancel</Button>
                <Button
                  primary
                  disabled={!request.text.trim() || readOnly}
                  onClick={() =>
                    save(
                      {
                        ...data,
                        requests: [
                          ...data.requests,
                          {
                            id: crypto.randomUUID(),
                            kind: request.kind,
                            text: request.text,
                            state: 'Review pending',
                          },
                        ],
                      },
                      'Review request recorded in preview',
                    )
                  }
                >
                  Submit preview request
                </Button>
              </>
            }
          >
            <Field label="Describe the requested change">
              <textarea
                value={request.text}
                maxLength={2000}
                onChange={(e) => setRequest({ ...request, text: e.target.value })}
              />
            </Field>
            <Note>Requests here are stored locally. No message is sent to a reviewer.</Note>
          </Modal>
        )}
        {dialog === 'history' && data && (
          <Modal
            title="Configuration history"
            description="Business changes saved in this browser. Earlier baseline records are sample data."
            onClose={() => setDialog(null)}
            footer={<Button onClick={() => setDialog(null)}>Close</Button>}
          >
            <div className="bu-fields">
              {data.history.length ? (
                data.history
                  .slice()
                  .reverse()
                  .map((h) => (
                    <div key={h.revision}>
                      <strong>
                        Revision {h.revision} · {h.action}
                      </strong>
                      <p className="bu-small bu-muted">
                        {new Intl.DateTimeFormat('en-KE', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Africa/Nairobi',
                        }).format(new Date(h.at))}{' '}
                        EAT
                      </p>
                    </div>
                  ))
              ) : (
                <p>Revision 12 · Initial sample configuration</p>
              )}
              {data.requests.map((r) => (
                <Note key={r.id}>
                  {r.kind} · {r.state}: {r.text}
                </Note>
              ))}
            </div>
          </Modal>
        )}
        {dialog === 'reset' && (
          <Modal
            title="Reset this sample?"
            description="This removes local Business changes and drafts for this specialty. Other screens and specialties are unaffected."
            onClose={() => setDialog(null)}
            footer={
              <>
                <Button onClick={() => setDialog(null)}>Cancel</Button>
                <Button
                  primary
                  onClick={async () => {
                    if (!source) return;
                    try {
                      await source.reset(profileId);
                      setDialog(null);
                      setScenario('normal');
                      setReload((x) => x + 1);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Reset failed.');
                    }
                  }}
                >
                  Reset sample
                </Button>
              </>
            }
          >
            {error && <p className="bu-error">{error}</p>}
            <p>You can export a recovery copy from the sample controls first.</p>
          </Modal>
        )}
      </div>
  );
  if (live) return content;
  return (
    <MerchantLivePreviewShell
      active="Business"
      businessName={activeDemo?.businessName}
      accountInitials={activeDemo?.initials}
      demoContext={activeDemo}
      sampleControl={sampleControl}
      locationControl={locationControl}
    >
      {content}
    </MerchantLivePreviewShell>
  );
}
