'use client';

import { Button, DetailPanel, DetailRow } from '@nexg/ui';
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Database,
  FileDown,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { MerchantLivePreviewShell as SharedMerchantLivePreviewShell } from '../live-preview-shell';
import styles from './workspace.module.css';

const tabs = [
  { id: 'account', label: 'Account & security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'connections', label: 'Connections' },
] as const;
type Tab = (typeof tabs)[number]['id'];
type EditableTab = Exclude<Tab, 'connections'>;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.');
const schema = z
  .object({
    version: z.literal(1),
    account: z.object({
      displayName: z
        .string()
        .trim()
        .min(2, 'Enter at least 2 characters for the display name.')
        .max(80, 'Use 80 characters or fewer.'),
    }),
    notifications: z.object({
      email: z.boolean(),
      browser: z.boolean(),
      newWork: z.boolean(),
      workChanges: z.boolean(),
      money: z.boolean(),
      documents: z.boolean(),
      campaignSummary: z.boolean(),
      quietEnabled: z.boolean(),
      quietFrom: time,
      quietTo: time,
    }),
    preferences: z.object({
      density: z.enum(['comfortable', 'compact']),
      textSize: z.enum(['standard', 'large']),
      dateFormat: z.enum(['dmy', 'iso']),
    }),
    updatedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.notifications.quietEnabled &&
      value.notifications.quietFrom === value.notifications.quietTo
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifications', 'quietTo'],
        message: 'Choose different quiet-hour start and end times. Overnight ranges are allowed.',
      });
  });
type Values = z.infer<typeof schema>;
const defaults = (): Values => ({
  version: 1,
  account: { displayName: 'Nairobi Collective' },
  notifications: {
    email: true,
    browser: false,
    newWork: true,
    workChanges: true,
    money: true,
    documents: true,
    campaignSummary: false,
    quietEnabled: false,
    quietFrom: '22:00',
    quietTo: '07:00',
  },
  preferences: { density: 'comfortable', textSize: 'standard', dateFormat: 'dmy' },
  updatedAt: null,
});
const STORAGE_KEY = 'nexg:merchant-live-preview:settings:v1:sample-nairobi-collective';
const notificationEvents = [
  { key: 'newWork', label: 'New work', description: 'Orders, requests and booking activity.' },
  {
    key: 'workChanges',
    label: 'Changes and cancellations',
    description: 'Changes to accepted work and its timing.',
  },
  {
    key: 'money',
    label: 'Money activity',
    description: 'Posted financial activity and statement updates.',
  },
  {
    key: 'documents',
    label: 'Business documents',
    description: 'Review updates and document reminders.',
  },
  {
    key: 'campaignSummary',
    label: 'Campaign summaries',
    description: 'Summary updates for your promotions.',
  },
] as const;
type Connection = {
  id: string;
  name: string;
  use: string;
  source: string;
  status: string;
  lastKnown: string;
  owner: string;
  classes: string;
  description: string;
  href?: string;
  action?: string;
};
const connections: Connection[] = [
  {
    id: 'catalogue',
    name: 'Offering catalogue',
    use: 'Products, services and catalogue information',
    source: 'Local preview workspace',
    status: 'Read-only here',
    lastKnown: 'Not requested on this screen',
    owner: 'Offerings',
    classes: 'Offering details, variants and catalogue visibility',
    description:
      'Settings does not change catalogue ownership or publication. Open Offerings to inspect the current sample catalogue. No live catalogue snapshot or external provider connection is established here.',
    href: '/merchant-live-preview/offerings',
    action: 'Open Offerings',
  },
  {
    id: 'accounting',
    name: 'Accounting exports',
    use: 'Scope and download financial records',
    source: 'Money export workflow',
    status: 'Manual export',
    lastKnown: 'No export checked',
    owner: 'Money',
    classes: 'Authorized transaction and statement exports',
    description:
      'Choose the exact report and scope in Money before exporting. A downloaded file does not establish an accounting-provider connection, synchronization or ledger posting.',
    href: '/merchant-live-preview/money',
    action: 'Open Money',
  },
  {
    id: 'notifications',
    name: 'Notification delivery',
    use: 'Email and browser delivery',
    source: 'Source not supplied',
    status: 'Unavailable',
    lastKnown: 'No delivery evidence supplied',
    owner: 'Notification service',
    classes: 'Recipient consent, device registration and delivery outcomes',
    description:
      'The switches in Notifications save a local preference only. They do not register this device, grant browser permission, subscribe an address or confirm delivery.',
  },
  {
    id: 'calendar',
    name: 'External calendar',
    use: 'Calendar and availability synchronization',
    source: 'Provider not supplied',
    status: 'Unavailable',
    lastKnown: 'No successful sync supplied',
    owner: 'Availability and the authorized calendar provider',
    classes: 'Permitted calendar and availability records',
    description:
      'No external calendar account or synchronization source has been supplied to this preview. A declared provider name is not proof of connection or reservation authority.',
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}
function Choice({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={styles.choice}>
      <span>
        <strong>{label}</strong>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
function ReadRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.readRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function SettingsWorkspace({ initialTab = 'account' }: { initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(
    tabs.some((item) => item.id === initialTab) ? (initialTab as Tab) : 'account',
  );
  const [saved, setSaved] = useState<Values>(defaults);
  const [draft, setDraft] = useState<Values>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [validation, setValidation] = useState<{
    tab: EditableTab;
    message: string;
    field?: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [location, setLocation] = useState('all');
  const [detail, setDetail] = useState<Connection | 'security' | null>(null);
  const [browserPermission, setBrowserPermission] = useState('Not checked');
  const dirty = (section: EditableTab) =>
    JSON.stringify(saved[section]) !== JSON.stringify(draft[section]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = schema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new Error('Unsupported saved settings.');
        setSaved(parsed.data);
        setDraft(parsed.data);
      }
    } catch {
      setStorageError(
        'Saved preferences could not be read on this device. Your current changes will stay in this tab until saving can be confirmed.',
      );
    } finally {
      setLoaded(true);
    }
    setBrowserPermission(
      'Notification' in window
        ? {
            granted: 'Granted by this browser',
            denied: 'Blocked by this browser',
            default: 'Not granted',
          }[window.Notification.permission]
        : 'Not supported by this browser',
    );
  }, []);

  const change = <K extends EditableTab>(section: K, value: Values[K]) => {
    setDraft((previous) => ({ ...previous, [section]: value }));
    setMessage('');
    if (validation?.tab === section) setValidation(null);
  };
  const save = (section: EditableTab) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const result = schema.safeParse({
      ...saved,
      [section]: draft[section],
      updatedAt: new Date().toISOString(),
    });
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const field = issue.path.join('-');
      setValidation({ tab: section, message: issue.message, field });
      document.getElementById(`settings-${field}`)?.focus();
      return;
    }
    setValidation(null);
    try {
      const serialized = JSON.stringify(result.data);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      if (window.localStorage.getItem(STORAGE_KEY) !== serialized)
        throw new Error('Save could not be confirmed.');
      setSaved(result.data);
      setDraft((previous) => ({
        ...previous,
        [section]: result.data[section],
        updatedAt: result.data.updatedAt,
      }));
      setStorageError('');
      setMessage('Saved on this device.');
    } catch {
      setStorageError(
        'Saving on this device could not be confirmed. Your unsaved changes are still here. Check browser storage settings, then try Save changes again.',
      );
    }
  };
  const discard = (section: EditableTab) => {
    setDraft((previous) => ({ ...previous, [section]: saved[section] }));
    setValidation(null);
    setMessage('Unsaved changes in this section were discarded.');
  };
  const checkStorage = () => {
    try {
      window.localStorage.getItem(STORAGE_KEY);
      setStorageError('');
      setMessage(
        'Browser storage is readable. Your draft is unchanged; choose Save changes to confirm a save.',
      );
    } catch {
      setStorageError(
        'This browser still blocks access to local storage. Keep this tab open to retain your unsaved changes.',
      );
    }
  };
  const selectTab = (value: Tab) => {
    setTab(value);
    setMessage('');
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState(window.history.state, '', url);
  };
  const tabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((item) => item.id === tab);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[index]!.id;
    selectTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  };
  const stamp = (value: string) => {
    if (draft.preferences.dateFormat !== 'iso')
      return (
        new Intl.DateTimeFormat('en-KE', {
          timeZone: 'Africa/Nairobi',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(value)) + ' EAT'
      );
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(value));
    const read = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${read('year')}-${read('month')}-${read('day')} · ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }).format(new Date(value))} EAT`;
  };
  const actions = (section: EditableTab) => (
    <footer className={styles.formActions}>
      <span className={storageError ? styles.saveIssue : undefined}>
        {!loaded
          ? 'Loading device preferences…'
          : storageError
            ? 'Save not confirmed. Your draft is retained.'
            : dirty(section)
              ? 'Unsaved changes'
              : saved.updatedAt
                ? 'Saved on this device'
                : 'Nothing saved on this device yet'}
      </span>
      <div>
        <Button
          variant="outline"
          onClick={() => discard(section)}
          disabled={!loaded || !dirty(section)}
        >
          Discard
        </Button>
        <Button
          type="submit"
          disabled={!loaded || !dirty(section)}
          leadingIcon={<Check size={16} aria-hidden="true" />}
        >
          Save changes
        </Button>
      </div>
    </footer>
  );
  const formError = (section: EditableTab) =>
    validation?.tab === section ? (
      <p className={styles.formError} id={`settings-error-${section}`} role="alert">
        {validation.message}
      </p>
    ) : null;
  const initials = (
    draft.account.displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join('') || 'NC'
  ).toUpperCase();
  const scopeLabel =
    location === 'all'
      ? 'All sample locations'
      : location === 'karen'
        ? 'Karen branch'
        : 'Westlands branch';

  return (
    <SharedMerchantLivePreviewShell
      active="Settings"
      businessName="Nairobi Collective"
      accountInitials={initials}
      sampleControl={<span className={styles.deviceHeader}>Device preferences</span>}
      locationControl={
        <label className={styles.scopeControl}>
          <MapPin size={15} aria-hidden="true" />
          <select
            aria-label="Settings location scope"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="all">All sample locations</option>
            <option value="karen">Karen branch</option>
            <option value="westlands">Westlands branch</option>
          </select>
        </label>
      }
    >
      <div
        className={styles.root}
        data-density={draft.preferences.density}
        data-text-size={draft.preferences.textSize}
        data-settings-workspace
        aria-busy={!loaded}
      >
        <header className={styles.heading}>
          <div>
            <h1>Settings</h1>
            <p>Manage your account, notifications and workspace preferences.</p>
          </div>
          <div className={styles.saveScope}>
            <span className={styles.deviceBadge}>
              {saved.updatedAt ? 'Saved on this device' : 'Device-only preferences'}
            </span>
            <small>{saved.updatedAt ? stamp(saved.updatedAt) : 'Local preview preferences'}</small>
          </div>
        </header>
        <p className={styles.scopeNote}>
          Changes here apply to this device&apos;s preview. Your verified business profile, account
          security and delivery rules keep their own controls.
        </p>
        <div
          className={styles.tabs}
          role="tablist"
          tabIndex={-1}
          aria-label="Settings sections"
          onKeyDown={tabKeys}
        >
          {tabs.map((item) => (
            <button
              type="button"
              role="tab"
              key={item.id}
              id={`settings-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`settings-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              disabled={!loaded}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
              {item.id !== 'connections' && dirty(item.id) && (
                <span className={styles.dirtyDot} aria-label="Unsaved changes" />
              )}
            </button>
          ))}
        </div>
        {storageError && (
          <div className={styles.storageError} role="alert">
            <div>
              <strong>Preferences need attention</strong>
              <p>{storageError}</p>
            </div>
            <Button
              variant="outline"
              onClick={checkStorage}
              leadingIcon={<RefreshCw size={15} aria-hidden="true" />}
            >
              Retry storage check
            </Button>
          </div>
        )}
        {message && (
          <p className={styles.message} role="status">
            {message}
          </p>
        )}
        <div
          role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          className={styles.tabPanel}
        >
          {tab === 'account' && (
            <div className={styles.layout}>
              <div className={styles.mainColumn}>
                <Section
                  title="Your display name"
                  description="Choose how this sample account is named in Settings on this device."
                >
                  <form onSubmit={save('account')} noValidate>
                    <div className={styles.formBody}>
                      <label className={styles.field} htmlFor="settings-account-displayName">
                        <span id="settings-display-name-label">Preview display name</span>
                        <input
                          id="settings-account-displayName"
                          aria-labelledby="settings-display-name-label"
                          value={draft.account.displayName}
                          onChange={(event) =>
                            change('account', { displayName: event.target.value })
                          }
                          minLength={2}
                          maxLength={80}
                          autoComplete="off"
                          aria-invalid={validation?.tab === 'account'}
                          aria-describedby={
                            validation?.tab === 'account'
                              ? 'settings-error-account'
                              : 'settings-account-hint'
                          }
                          disabled={!loaded}
                        />
                        <small id="settings-account-hint">
                          This does not change the verified business or account name.
                        </small>
                      </label>
                      {formError('account')}
                    </div>
                    {actions('account')}
                  </form>
                </Section>
                <Section
                  title="Account & security"
                  description="Security changes use the account service, not a local preference."
                >
                  <div className={styles.securityRow}>
                    <div>
                      <h3>Password recovery</h3>
                      <p>Open the existing recovery flow to request access to your real account.</p>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href="/forgot-password">
                        Open recovery <ArrowUpRight size={15} aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                  <div className={styles.securityRow}>
                    <div>
                      <h3>Two-step verification</h3>
                      <p>No account-security source was supplied to this preview.</p>
                    </div>
                    <span className={styles.unavailable}>Unavailable</span>
                  </div>
                  <div className={styles.securityRow}>
                    <div>
                      <h3>Active sessions</h3>
                      <p>Session information is not loaded on this screen.</p>
                    </div>
                    <Button variant="ghost" onClick={() => setDetail('security')}>
                      Inspect access <ChevronRight size={15} aria-hidden="true" />
                    </Button>
                  </div>
                </Section>
              </div>
              <aside className={styles.sideColumn}>
                <Section title="Sample account details">
                  <dl className={styles.facts}>
                    <ReadRow label="Workspace" value="Nairobi Collective" />
                    <ReadRow label="Account" value="Sample owner" />
                    <ReadRow label="Email" value="owner@example.test" />
                    <ReadRow label="Scope" value="This device, across sample locations" />
                    <ReadRow label="Source" value="Illustrative record" />
                  </dl>
                  <div className={styles.sectionFoot}>
                    <p>
                      Actual business details and account notification rules are managed in the
                      authenticated merchant workspace.
                    </p>
                    <Link href="/merchant/settings" className={styles.textLink}>
                      Open merchant settings <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </Section>
              </aside>
            </div>
          )}

          {tab === 'notifications' && (
            <div className={styles.layout}>
              <Section
                title="Notification preferences"
                description="Save which updates you prefer. These choices do not subscribe an address or register a device."
              >
                <form onSubmit={save('notifications')} noValidate>
                  <div className={styles.formBody}>
                    <fieldset className={styles.group}>
                      <legend>Preferred channels</legend>
                      <Choice
                        checked={draft.notifications.email}
                        onChange={(email) =>
                          change('notifications', { ...draft.notifications, email })
                        }
                        label="Email"
                        description="A local preference; delivery status is not supplied."
                        disabled={!loaded}
                      />
                      <Choice
                        checked={draft.notifications.browser}
                        onChange={(browser) =>
                          change('notifications', { ...draft.notifications, browser })
                        }
                        label="Browser alerts"
                        description="Does not request permission or register this browser."
                        disabled={!loaded}
                      />
                    </fieldset>
                    <fieldset className={styles.group}>
                      <legend>Updates you prefer</legend>
                      {notificationEvents.map((item) => (
                        <Choice
                          key={item.key}
                          checked={draft.notifications[item.key]}
                          onChange={(checked) =>
                            change('notifications', { ...draft.notifications, [item.key]: checked })
                          }
                          label={item.label}
                          description={item.description}
                          disabled={!loaded}
                        />
                      ))}
                    </fieldset>
                    <fieldset className={styles.group}>
                      <legend>Quiet hours for summaries</legend>
                      <Choice
                        checked={draft.notifications.quietEnabled}
                        onChange={(quietEnabled) =>
                          change('notifications', { ...draft.notifications, quietEnabled })
                        }
                        label="Prefer quieter summary hours"
                        description="The account service still controls urgent work and actual delivery rules."
                        disabled={!loaded}
                      />
                      <div className={styles.twoFields}>
                        <label className={styles.field} htmlFor="settings-notifications-quietFrom">
                          <span>From</span>
                          <input
                            id="settings-notifications-quietFrom"
                            type="time"
                            value={draft.notifications.quietFrom}
                            onChange={(event) =>
                              change('notifications', {
                                ...draft.notifications,
                                quietFrom: event.target.value,
                              })
                            }
                            disabled={!loaded || !draft.notifications.quietEnabled}
                          />
                        </label>
                        <label className={styles.field} htmlFor="settings-notifications-quietTo">
                          <span>Until</span>
                          <input
                            id="settings-notifications-quietTo"
                            type="time"
                            value={draft.notifications.quietTo}
                            onChange={(event) =>
                              change('notifications', {
                                ...draft.notifications,
                                quietTo: event.target.value,
                              })
                            }
                            disabled={!loaded || !draft.notifications.quietEnabled}
                            aria-invalid={validation?.tab === 'notifications'}
                            aria-describedby={
                              validation?.tab === 'notifications'
                                ? 'settings-error-notifications'
                                : undefined
                            }
                          />
                        </label>
                      </div>
                      <p className={styles.hint}>
                        Africa/Nairobi · East Africa Time. Overnight ranges are allowed.
                      </p>
                    </fieldset>
                    {formError('notifications')}
                  </div>
                  {actions('notifications')}
                </form>
              </Section>
              <aside className={styles.sideColumn}>
                <Section
                  title="Delivery status"
                  description="A saved preference is separate from actual notification delivery."
                >
                  <dl className={styles.facts}>
                    <ReadRow label="Browser permission" value={browserPermission} />
                    <ReadRow label="Device registration" value="Not supplied" />
                    <ReadRow label="Email delivery" value="Not supplied" />
                    <ReadRow label="Last delivery" value="Unavailable" />
                  </dl>
                  <div className={styles.sectionFoot}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setDetail(connections.find((item) => item.id === 'notifications')!)
                      }
                      leadingIcon={<Bell size={15} aria-hidden="true" />}
                    >
                      Inspect delivery source
                    </Button>
                  </div>
                </Section>
              </aside>
            </div>
          )}

          {tab === 'preferences' && (
            <div className={styles.layout}>
              <Section
                title="Workspace preferences"
                description="These settings change this Settings preview and are saved only on this device."
              >
                <form onSubmit={save('preferences')}>
                  <div className={styles.formBody}>
                    <fieldset className={styles.group}>
                      <legend>Layout density</legend>
                      <div className={styles.radios}>
                        {(['comfortable', 'compact'] as const).map((value) => (
                          <label key={value}>
                            <input
                              type="radio"
                              name="settings-density"
                              value={value}
                              checked={draft.preferences.density === value}
                              onChange={() =>
                                change('preferences', { ...draft.preferences, density: value })
                              }
                              disabled={!loaded}
                            />
                            <span>
                              <strong>{value === 'comfortable' ? 'Comfortable' : 'Compact'}</strong>
                              <small>
                                {value === 'comfortable'
                                  ? 'More space between settings.'
                                  : 'Closer rows with full-size controls.'}
                              </small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className={styles.group}>
                      <legend>Text size</legend>
                      <div className={styles.radios}>
                        {(['standard', 'large'] as const).map((value) => (
                          <label key={value}>
                            <input
                              type="radio"
                              name="settings-text-size"
                              value={value}
                              checked={draft.preferences.textSize === value}
                              onChange={() =>
                                change('preferences', { ...draft.preferences, textSize: value })
                              }
                              disabled={!loaded}
                            />
                            <span>
                              <strong>{value === 'standard' ? 'Standard' : 'Larger'}</strong>
                              <small>
                                {value === 'standard'
                                  ? 'The workspace reading size.'
                                  : 'Larger Settings labels and copy.'}
                              </small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className={styles.field} htmlFor="settings-date-format">
                      <span id="settings-date-format-label">Date display in Settings</span>
                      <select
                        id="settings-date-format"
                        aria-labelledby="settings-date-format-label"
                        value={draft.preferences.dateFormat}
                        onChange={(event) =>
                          change('preferences', {
                            ...draft.preferences,
                            dateFormat: event.target.value as Values['preferences']['dateFormat'],
                          })
                        }
                        disabled={!loaded}
                      >
                        <option value="dmy">1 Nov 2026</option>
                        <option value="iso">2026-11-01</option>
                      </select>
                      <small>The saved timestamp and example use this format.</small>
                    </label>
                    <dl className={styles.platformFacts}>
                      <ReadRow label="Timezone" value="Africa/Nairobi" />
                      <ReadRow label="Currency" value="KES" />
                    </dl>
                    {formError('preferences')}
                  </div>
                  <div className={styles.defaultsRow}>
                    <Button
                      variant="ghost"
                      onClick={() => change('preferences', defaults().preferences)}
                      disabled={!loaded}
                    >
                      Use defaults
                    </Button>
                  </div>
                  {actions('preferences')}
                </form>
              </Section>
              <aside className={styles.sideColumn}>
                <Section title="Preview your preferences">
                  <div className={styles.preferencePreview}>
                    <span className={styles.previewBadge}>Settings preview</span>
                    <h3>A view that works for you</h3>
                    <p>
                      Text and row spacing update as you choose. Save changes to keep them on this
                      device.
                    </p>
                    <dl>
                      <ReadRow
                        label="Example date"
                        value={draft.preferences.dateFormat === 'iso' ? '2026-11-01' : '1 Nov 2026'}
                      />
                      <ReadRow label="Applies to" value="This Settings preview" />
                    </dl>
                  </div>
                </Section>
              </aside>
            </div>
          )}

          {tab === 'connections' && (
            <Section
              title="Connections & data functions"
              description={`Inspect the function, owner and source evidence for ${scopeLabel.toLowerCase()}. This screen does not connect providers.`}
            >
              <ul className={styles.connections}>
                {connections.map((connection) => (
                  <li key={connection.id}>
                    <div className={styles.connectionHeading}>
                      <div>
                        <h3>{connection.name}</h3>
                        <p>{connection.use}</p>
                      </div>
                      <span
                        className={
                          connection.status === 'Unavailable'
                            ? styles.unavailable
                            : styles.neutralBadge
                        }
                      >
                        {connection.status}
                      </span>
                    </div>
                    <dl className={styles.connectionFacts}>
                      <ReadRow label="Source" value={connection.source} />
                      <ReadRow label="Last known" value={connection.lastKnown} />
                      <ReadRow label="Scope" value={scopeLabel} />
                    </dl>
                    <div className={styles.connectionAction}>
                      <Button
                        variant="outline"
                        onClick={() => setDetail(connection)}
                        leadingIcon={
                          connection.id === 'accounting' ? (
                            <FileDown size={15} aria-hidden="true" />
                          ) : (
                            <Database size={15} aria-hidden="true" />
                          )
                        }
                      >
                        Inspect details <ChevronRight size={15} aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <DetailPanel
          open={detail !== null}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
          title={detail === 'security' ? 'Account access' : detail?.name || 'Connection details'}
          subtitle={
            detail === 'security' ? 'Sample account · read-only access information' : scopeLabel
          }
          meta={<span className={styles.panelMarker}>Read-only preview</span>}
          footer={
            <>
              <Button variant="outline" onClick={() => setDetail(null)}>
                Close
              </Button>
              {detail && detail !== 'security' && detail.href && (
                <Button asChild>
                  <Link href={detail.href}>
                    {detail.action} <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </>
          }
        >
          <div className={styles.panelContent}>
            {detail === 'security' ? (
              <>
                <ShieldCheck size={26} aria-hidden="true" />
                <h3>Account security is managed separately</h3>
                <p>
                  No active-session, two-step verification or account-security source has been
                  supplied to this preview. This screen cannot enable security features or revoke a
                  session.
                </p>
                <p>
                  The recovery link opens the existing account flow. It sends nothing until you
                  enter your email and submit that form.
                </p>
                <dl>
                  <DetailRow label="Session source">Unavailable</DetailRow>
                  <DetailRow label="Security changes">No action performed</DetailRow>
                </dl>
              </>
            ) : (
              detail && (
                <>
                  <p>{detail.description}</p>
                  <dl>
                    <DetailRow label="Function">{detail.name}</DetailRow>
                    <DetailRow label="Owner">{detail.owner}</DetailRow>
                    <DetailRow label="Source">{detail.source}</DetailRow>
                    <DetailRow label="Status">{detail.status}</DetailRow>
                    <DetailRow label="Last known">{detail.lastKnown}</DetailRow>
                    <DetailRow label="Scope">{scopeLabel}</DetailRow>
                    <DetailRow label="Data">{detail.classes}</DetailRow>
                  </dl>
                  <p className={styles.hint}>
                    No credentials are requested or stored by this screen. Destination screens use
                    their own scope and access controls.
                  </p>
                </>
              )
            )}
          </div>
        </DetailPanel>
      </div>
    </SharedMerchantLivePreviewShell>
  );
}
