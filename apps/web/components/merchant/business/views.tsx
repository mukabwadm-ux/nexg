'use client';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
  CarFront,
  ChevronRight,
  Eye,
  Factory,
  FileText,
  Flag,
  Home,
  KeyRound,
  MapPin,
  Package,
  Plus,
  Scissors,
  Ticket,
  Truck,
  Upload,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ReviewReply } from '@/components/merchant/board-client';
import { readDraft, writeDraft } from './source';
import {
  activityIssues,
  methodLabels,
  modelLabels,
  type Activity,
  type Business,
  type BusinessDocument,
  type Member,
  type Model,
  type Review,
  type Section,
} from './model';
import {
  Button,
  Empty,
  Facts,
  Field,
  initials,
  Note,
  Panel,
  SearchBox,
  Status,
} from './primitives';

const activityIcons: Record<Model, LucideIcon> = {
  ORDER: Package,
  APPOINTMENT: CalendarDays,
  FIELD_VISIT: Home,
  ASSET_INTERVAL: KeyRound,
  TRANSFER: CarFront,
  SESSION_CAPACITY: Users,
  SPACE_RESERVATION: Building2,
  TOUR: MapPin,
  PRODUCTION_DUE: Factory,
  REQUEST_QUOTE: FileText,
  LINKED_WINDOWS: ArrowLeftRight,
  SERVICE_JOB: Wrench,
  ENTITLEMENT: Ticket,
  FREIGHT: Truck,
  STORAGE: Warehouse,
};
function ActivityIcon({ activity }: { activity: Pick<Activity, 'profileId' | 'model'> }) {
  const Icon =
    activity.profileId === 'haircare' && activity.model === 'APPOINTMENT'
      ? Scissors
      : activityIcons[activity.model];
  return <Icon aria-hidden="true" />;
}

export type ViewProps = {
  data: Business;
  readOnly: boolean;
  live?: boolean;
  liveMemberTools?: Record<string, ReactNode>;
  edit: (section: Section, id: string, value: unknown) => void;
  save: (next: Business, action: string, review?: boolean) => Promise<void>;
  message: (text: string) => void;
  preview: (title: string, description: string) => void;
  request: (kind: string) => void;
};
export function ProfileView({
  data,
  readOnly,
  live,
  draft,
  onChange,
  onSave,
  onCancel,
  request,
  preview,
  message,
}: {
  data: Business;
  readOnly: boolean;
  live?: boolean;
  draft: Business['profile'];
  onChange: (value: Business['profile']) => void;
  onSave: () => void;
  onCancel: () => void;
  request: (kind: string) => void;
  preview: ViewProps['preview'];
  message: ViewProps['message'];
}) {
  const patch = (value: Partial<Business['profile']>) => onChange({ ...draft, ...value });
  function image(file: File | undefined, target: 'logo' | 'cover') {
    if (!file || readOnly) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2000000) {
      message('Choose a PNG, JPEG or WebP image up to 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      message('This image could not be read. Your current photo is unchanged.');
    reader.onload = () => {
      const photo = new window.Image();
      photo.onerror = () =>
        message('This file could not be opened as an image. Choose another photo.');
      photo.onload = () => {
        const maximum = target === 'cover' ? 1600 : 512;
        const scale = Math.min(1, maximum / Math.max(photo.naturalWidth, photo.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          message('Image preview is unavailable in this browser.');
          return;
        }
        context.drawImage(photo, 0, 0, canvas.width, canvas.height);
        let quality = 0.85;
        let result = canvas.toDataURL('image/webp', quality);
        const budget = target === 'cover' ? 600000 : 250000;
        while (result.length > budget && quality > 0.4) {
          quality -= 0.15;
          result = canvas.toDataURL('image/webp', quality);
        }
        if (result.length > budget) {
          message('Choose a smaller photo so the profile can be saved in this browser.');
          return;
        }
        patch({ [target]: result });
      };
      photo.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  return (
    <div className="bu-layout bu-profile-layout">
      <div className="bu-left">
        <section className="bu-card bu-profile-card">
          <div className="bu-card-heading">
            <div>
              <h2>{live ? 'Business profile' : 'Public profile'}</h2>
              <p>
                {live
                  ? 'Business details currently available in your workspace.'
                  : 'This information is shown to customers on your public profile.'}
              </p>
            </div>
          </div>
          <div className="bu-profile-form">
            <div className="bu-brand-media">
              <div className="bu-logo">
                {draft.logo ? (
                  <Image
                    className="bu-logo-image"
                    width={64}
                    height={64}
                    unoptimized
                    src={draft.logo}
                    alt="Business logo"
                  />
                ) : (
                  <span className="bu-logo-image">{initials(draft.name)}</span>
                )}
                <div>
                  <strong>Brand logo</strong>
                  <p className="bu-muted bu-small">Square image, PNG, JPEG or WebP · up to 2 MB</p>
                  <label className="bu-button" style={{ marginTop: 5 }}>
                    <Upload size={14} /> Change logo
                    <input
                      aria-label="Upload brand logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={readOnly}
                      className="sr-only"
                      onChange={(e) => {
                        image(e.target.files?.[0], 'logo');
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="bu-logo bu-banner-control">
                {draft.cover ? (
                  <Image
                    className="bu-banner-thumbnail"
                    width={96}
                    height={58}
                    unoptimized
                    src={draft.cover}
                    alt="Current banner photo"
                  />
                ) : (
                  <span className="bu-banner-thumbnail bu-banner-placeholder">
                    <Building2 size={24} />
                  </span>
                )}
                <div>
                  <strong>Banner photo</strong>
                  <p className="bu-muted bu-small">Landscape photo · 3:1 works best · up to 2 MB</p>
                  <div className="bu-media-actions">
                    <label className="bu-button">
                      <Upload size={14} />
                      {draft.cover ? 'Change banner' : 'Add banner'}
                      <input
                        aria-label="Upload banner photo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={readOnly}
                        className="sr-only"
                        onChange={(e) => {
                          image(e.target.files?.[0], 'cover');
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {draft.cover && (
                      <button
                        type="button"
                        className="bu-link bu-small"
                        disabled={readOnly}
                        onClick={() => patch({ cover: '' })}
                      >
                        Remove banner
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <label className="bu-profile-field">
              <span>Trading name</span>
              <input
                aria-label="Trading name"
                disabled={readOnly}
                maxLength={100}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="bu-profile-field">
              <span>Short description</span>
              <div className="bu-description">
                <textarea
                  aria-label="Short description"
                  disabled={readOnly}
                  maxLength={160}
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
                <p className="bu-small bu-muted" style={{ textAlign: 'right' }}>
                  {draft.description.length}/160
                </p>
              </div>
            </label>
            <label className="bu-profile-field">
              <span>Public email</span>
              <input
                aria-label="Public email"
                disabled={readOnly}
                type="email"
                value={draft.email}
                onChange={(e) => patch({ email: e.target.value })}
              />
            </label>
            <div className="bu-profile-field">
              <span>Public contact</span>
              <div className="bu-split-row">
                <input aria-label="Confirmed public contact" value={draft.contact} disabled />
                <button
                  className="bu-link"
                  disabled={readOnly}
                  onClick={() => request('Public contact change')}
                >
                  Change contact
                </button>
              </div>
            </div>
            <div className="bu-profile-field">
              <span>{live ? 'Declared activities' : 'Customer-facing activities'}</span>
              <div>
                {data.activities
                  .filter((a) => live || a.enabled)
                  .map((a) => (
                    <span className="bu-chip" key={a.id}>
                      <ActivityIcon activity={a} />
                      {a.name}
                    </span>
                  ))}
              </div>
            </div>
            <div className="bu-profile-field">
              <span>{live ? 'Locations on file' : 'Locations shown'}</span>
              <div>
                {data.locations
                  .filter((l) => live || l.published)
                  .map((l) => (
                    <span className="bu-chip" key={l.id}>
                      <MapPin />
                      {l.name}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </section>
        <section className="bu-card bu-split-row bu-identity">
          <div className="bu-row-name">
            <FileText size={22} />
            <div>
              <h3>Registered identity</h3>
              <p>Managed through account review.</p>
              <p className="bu-small">Changes to registered business details require a review.</p>
            </div>
          </div>
          {!live && (
            <Button soft disabled={readOnly} onClick={() => request('Registered identity change')}>
              Request change
            </Button>
          )}
        </section>
        {!live && <Note>Public profile changes do not alter active bookings.</Note>}
      </div>
      {!live && (
        <div className="bu-profile-right">
          <aside className="bu-card">
            <div className="bu-card-heading">
              <div>
                <h2>Customer view</h2>
                <p>This is how your business appears to customers.</p>
              </div>
            </div>
            {draft.cover ? (
              <Image
                unoptimized
                width={600}
                height={200}
                className="bu-preview-cover"
                src={draft.cover}
                alt="Business banner photo"
              />
            ) : (
              <div className="bu-banner-placeholder bu-preview-cover">
                <Building2 size={24} />
                <span>No banner photo</span>
              </div>
            )}
            <div className="bu-customer-title">
              {draft.logo ? (
                <Image
                  unoptimized
                  width={52}
                  height={52}
                  className="bu-logo-image"
                  src={draft.logo}
                  alt="Business logo"
                />
              ) : (
                <span className="bu-logo-image">{initials(draft.name)}</span>
              )}
              <div>
                <h3>{draft.name || 'Your business name'}</h3>
                <p className="bu-muted">{draft.description}</p>
              </div>
            </div>
            <div>
              {data.activities
                .filter((a) => a.enabled)
                .map((a) => (
                  <span className="bu-chip" key={a.id}>
                    {a.name}
                  </span>
                ))}
            </div>
            <p className="bu-row-name" style={{ margin: '10px 0' }}>
              <MapPin size={15} />
              {data.locations
                .filter((l) => l.published)
                .map((l) => l.name)
                .join(' · ') || 'No published location'}
            </p>
            <button
              className="bu-link"
              onClick={() =>
                preview(
                  'Public profile preview',
                  `${draft.name}\n${draft.description}\n${data.locations
                    .filter((l) => l.published)
                    .map((l) => l.name)
                    .join(
                      ' · ',
                    )}\n\nDisplay preview only. No public profile is published by this frontend.`,
                )
              }
            >
              View public profile ↗
            </button>
          </aside>
          <div className="bu-profile-actions">
            <Button onClick={onCancel}>Cancel</Button>
            <Button primary disabled={readOnly} onClick={onSave}>
              Save profile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
export function ActivitiesView(p: ViewProps) {
  const { data, readOnly, edit } = p;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(data.activities[0]?.id ?? null);
  const a = data.activities.find((x) => x.id === selected);
  const rows = data.activities.filter((x) =>
    `${x.name} ${modelLabels[x.model]}`.toLowerCase().includes(search.toLowerCase()),
  );
  const locations = (ids: string[]) =>
    data.locations
      .filter((l) => ids.includes(l.id))
      .map((l) => l.name)
      .join(' · ');
  const tasks = data.activities.filter((x) => !x.enabled || activityIssues(x, data).length > 0);
  return (
    <div className="bu-layout">
      <div className="bu-left">
        <section className="bu-card">
          <div className="bu-card-heading">
            <div>
              <h2>Your activities</h2>
              <p>
                {p.live
                  ? 'Activities recorded in your merchant registration.'
                  : 'Manage the different ways you serve customers.'}
              </p>
            </div>
            {!p.live && (
              <Button primary disabled={readOnly} onClick={() => edit('activities', 'new', null)}>
                <Plus />
                Add activity
              </Button>
            )}
          </div>
          <div className="bu-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search activities…" />
          </div>
          {!rows.length ? (
            <Empty />
          ) : (
            <table className="bu-table">
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Activity</th>
                  <th>Where it happens</th>
                  <th style={{ width: '26%' }}>{p.live ? 'Registration' : 'Setup'}</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} data-selected={a?.id === x.id}>
                    <td>
                      <div className="bu-row-name">
                        <span className="bu-avatar">
                          <ActivityIcon activity={x} />
                        </span>
                        <div>
                          <button className="bu-select" onClick={() => setSelected(x.id)}>
                            {x.name}
                          </button>
                          <small>{modelLabels[x.model]}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {x.methods.includes('CUSTOMER_LOCATION')
                        ? 'Customer location'
                        : x.methods.includes('DIGITAL')
                          ? 'Digital operation'
                          : locations(x.locationIds) ||
                            (p.live ? 'No linked location' : 'Location needed')}
                    </td>
                    <td>
                      <Status
                        value={
                          p.live
                            ? 'Declared'
                            : x.enabled
                              ? 'Configured'
                              : activityIssues(x, data).length
                                ? 'Coverage needed'
                                : 'Draft'
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="bu-icon"
                        aria-label={`View ${x.name}`}
                        onClick={() => setSelected(x.id)}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {!p.live && tasks.length > 0 && (
          <section className="bu-card">
            <div className="bu-card-heading">
              <div>
                <h2>Complete setup</h2>
                <p>Finish the tasks below to activate your activities.</p>
              </div>
            </div>
            {tasks.map((task) => (
              <div className="bu-split-row" key={task.id} style={{ padding: '7px 0' }}>
                <div>
                  <strong>
                    {task.name}: {activityIssues(task, data)[0] || 'Review and activate'}
                  </strong>
                  <p>This activity remains unavailable until setup is complete.</p>
                </div>
                <Button soft disabled={readOnly} onClick={() => edit('activities', task.id, task)}>
                  Set coverage
                </Button>
              </div>
            ))}
          </section>
        )}
        {!p.live && (
          <Note>
            Configured activities determine the relevant fields, fulfilment and workflow across your
            workspace.
          </Note>
        )}
      </div>
      {a ? (
        <Panel
          title={a.name}
          status={p.live ? 'Declared' : a.enabled ? 'Configured' : 'Draft'}
          subtitle={
            locations(a.locationIds) || (p.live ? 'No linked location' : 'Customer location')
          }
          onClose={() => setSelected(null)}
          footer={
            p.live ? undefined : (
              <>
                <Button
                  onClick={() =>
                    p.preview(
                      'Configuration preview',
                      `${a.name}\n${modelLabels[a.model]}\n${a.methods.map((m) => methodLabels[m]).join(', ')}\n${activityIssues(a, data).join('\n') || 'Business setup complete. Booking, stock and publication have separate readiness checks.'}`,
                    )
                  }
                >
                  <Eye />
                  Preview configuration
                </Button>
                <Button primary disabled={readOnly} onClick={() => edit('activities', a.id, a)}>
                  Edit setup
                </Button>
              </>
            )
          }
        >
          <Facts
            rows={
              p.live
                ? [
                    { label: 'Activity', value: a.name },
                    { label: 'Default operation', value: modelLabels[a.model] },
                    {
                      label: 'Linked locations',
                      value: locations(a.locationIds) || 'None recorded',
                    },
                  ]
                : [
                    {
                      label: 'Service location',
                      value: a.methods.includes('DIGITAL')
                        ? 'Digital operation'
                        : a.methods.includes('CUSTOMER_LOCATION')
                          ? 'At the customer location'
                          : 'At the merchant venue',
                      hint: a.methods.includes('CUSTOMER_LOCATION')
                        ? 'Services happen at the customer location.'
                        : a.methods.includes('DIGITAL')
                          ? 'Services are delivered remotely.'
                          : 'Customers visit your business.',
                    },
                    {
                      label: 'Scheduled appointments',
                      value: a.bookingEnabled
                        ? 'Enabled · optional'
                        : 'Not enabled for this activity',
                    },
                    { label: 'Location', value: locations(a.locationIds) || 'No venue required' },
                    {
                      label: 'Team & resources',
                      value: `${a.resourceCount} linked resources`,
                      hint: 'Manage scheduling resources in Availability.',
                    },
                    {
                      label: 'Schedule source',
                      value: a.source === 'NEXG' ? 'NEXG booking' : 'External system',
                    },
                    {
                      label: 'Fulfilment',
                      value: a.methods.map((m) => methodLabels[m] || m).join(' · '),
                    },
                  ]
            }
          />
          {!p.live && (
            <>
              <p className="bu-small bu-muted" style={{ marginTop: 8 }}>
                Current configuration · Revision {data.revision}
              </p>
              <Note>Changes affect future work. Existing bookings retain their agreed setup.</Note>
            </>
          )}
        </Panel>
      ) : (
        <Empty title="Select an activity" text="Choose an activity to inspect its setup." />
      )}
    </div>
  );
}
export function LocationsView(p: ViewProps) {
  const { data, readOnly, edit } = p;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(data.locations[0]?.id ?? null);
  const l = data.locations.find((x) => x.id === selected);
  const rows = data.locations.filter((x) =>
    `${x.name} ${x.address}`.toLowerCase().includes(search.toLowerCase()),
  );
  const activityNames = (ids: string[]) =>
    data.activities.filter((a) => ids.includes(a.id)).map((a) => a.name);
  const coverageTasks = data.activities.filter(
    (a) => a.methods.includes('CUSTOMER_LOCATION') && !a.coverage,
  );
  return (
    <div className="bu-layout">
      <div className="bu-left">
        <section className="bu-card">
          <div className="bu-card-heading">
            <div>
              <h2>Locations</h2>
              <p>Manage your operating places and service coverage.</p>
            </div>
            {!p.live && (
              <Button primary disabled={readOnly} onClick={() => edit('locations', 'new', null)}>
                <Plus />
                Add location
              </Button>
            )}
          </div>
          <div className="bu-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search locations…" />
          </div>
          {rows.length ? (
            <table className="bu-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Location</th>
                  <th className="bu-hide-mobile">Type</th>
                  <th>Activities</th>
                  <th>Status</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} data-selected={x.id === l?.id}>
                    <td>
                      <div className="bu-row-name">
                        <span className="bu-avatar">
                          <Building2 />
                        </span>
                        <div>
                          <button className="bu-select" onClick={() => setSelected(x.id)}>
                            {x.name}
                          </button>
                          <small>{x.address || 'Remote channel'}</small>
                        </div>
                      </div>
                    </td>
                    <td className="bu-hide-mobile">
                      {x.type === 'physical'
                        ? 'Physical location'
                        : x.type === 'service_base'
                          ? 'Service base'
                          : 'Digital operation'}
                    </td>
                    <td>{activityNames(x.activityIds).join(', ') || 'No activities assigned'}</td>
                    <td>
                      <Status value={x.liveStatus ?? (x.published ? 'Published' : 'Draft')} />
                    </td>
                    <td>
                      <button
                        className="bu-icon"
                        aria-label={`View ${x.name}`}
                        onClick={() => setSelected(x.id)}
                      >
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </section>
        {coverageTasks.map((a) => (
          <section className="bu-card bu-split-row" key={a.id}>
            <div className="bu-row-name">
              <Home size={20} />
              <div>
                <h3>{a.name}</h3>
                <p>Service area not configured</p>
              </div>
            </div>
            <Button soft disabled={readOnly} onClick={() => edit('activities', a.id, a)}>
              Set coverage
            </Button>
          </section>
        ))}
      </div>
      {l ? (
        <Panel
          title={l.name}
          status={l.liveStatus ?? (l.published ? 'Published' : 'Draft')}
          subtitle={
            p.live
              ? 'Saved business location.'
              : l.published
                ? 'This location is visible to customers.'
                : 'Complete setup before publishing.'
          }
          onClose={() => setSelected(null)}
          footer={
            p.live ? undefined : (
              <>
                <Button
                  onClick={() =>
                    p.preview(
                      'Public location preview',
                      `${l.name}\n${l.address || 'Digital operation'}\n${activityNames(l.activityIds).join(', ')}`,
                    )
                  }
                >
                  <Eye />
                  Preview location
                </Button>
                <Button primary disabled={readOnly} onClick={() => edit('locations', l.id, l)}>
                  Edit location
                </Button>
              </>
            )
          }
        >
          <Facts
            rows={[
              {
                label: 'Place type',
                value:
                  l.type === 'physical'
                    ? 'Physical location'
                    : l.type === 'service_base'
                      ? 'Service base'
                      : 'Digital operation',
              },
              { label: 'Public address', value: l.address || 'No customer venue' },
              {
                label: 'Activities',
                value: activityNames(l.activityIds).map((name) => (
                  <span className="bu-chip" key={name}>
                    {name}
                  </span>
                )),
              },
              {
                label: 'Customer access',
                value:
                  l.type === 'digital_operation'
                    ? 'Remote channel'
                    : 'At the venue, customer pickup',
              },
              { label: 'Location contact', value: l.contact || 'Not configured' },
              { label: 'Timezone', value: 'Africa/Nairobi' },
              {
                label: 'Opening hours',
                value: (
                  <Link
                    href={p.live ? '/merchant/availability' : '/merchant-live-preview/availability'}
                  >
                    View availability →
                  </Link>
                ),
                hint: 'Opening hours are managed in Availability.',
              },
            ]}
          />
          {!p.live && (
            <div className="bu-public-location">
              <h3>Public location preview</h3>
              <div className="bu-location-preview">
                <div
                  className="bu-map"
                  role="img"
                  aria-label="Illustrative location preview, not a verified map pin"
                >
                  <MapPin />
                </div>
                <div>
                  <strong>{l.name}</strong>
                  <p className="bu-small bu-muted">{l.address || 'Digital operation'}</p>
                  <p className="bu-small bu-muted">
                    This is how your location appears to customers.
                  </p>
                </div>
              </div>
              <p className="bu-small bu-muted bu-location-source">
                Source · NEXG · Current configuration
              </p>
            </div>
          )}
        </Panel>
      ) : (
        <Empty title="Select a location" />
      )}
    </div>
  );
}
export function TeamView(p: ViewProps) {
  const { data, readOnly, edit } = p;
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('All');
  const [place, setPlace] = useState('All');
  const [selected, setSelected] = useState<string | null>(
    data.members.find((m) => m.id === 'aisha')?.id ?? data.members[0]?.id ?? null,
  );
  const m = data.members.find((x) => x.id === selected);
  const rows = data.members.filter(
    (x) =>
      x.state !== 'Removed' &&
      x.name.toLowerCase().includes(search.toLowerCase()) &&
      (role === 'All' || x.role === role) &&
      (place === 'All' || x.locationIds.includes(place)),
  );
  const loc = (member: Member) =>
    member.role === 'Owner'
      ? 'All locations'
      : data.locations
          .filter((l) => member.locationIds.includes(l.id))
          .map((l) => l.name)
          .join(' · ') || 'No location access';
  return (
    <div className="bu-layout">
      <div className="bu-left">
        <section className="bu-card" style={{ flex: 1 }}>
          <div className="bu-card-heading">
            <div>
              <h2>Team members</h2>
              <p>
                {data.members.filter((x) => x.state === 'Active').length} active ·{' '}
                {data.members.filter((x) => x.state === 'Invitation pending').length} invitation
                pending
              </p>
            </div>
            {!p.live && (
              <Button primary disabled={readOnly} onClick={() => edit('team', 'new', null)}>
                <Plus />
                Invite member
              </Button>
            )}
          </div>
          <div className="bu-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search team members…" />
            <select aria-label="Filter role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="All">All roles</option>
              {[
                'Owner',
                'Supervisor',
                'Service provider',
                'Location manager',
                'Viewer',
                'Operator',
                'Driver',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Filter team location"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            >
              <option value="All">All locations</option>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          {rows.length ? (
            <table className="bu-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Name</th>
                  <th>Role</th>
                  <th className="bu-hide-mobile">Location</th>
                  <th>Status</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} data-selected={x.id === m?.id}>
                    <td>
                      <div className="bu-row-name">
                        <span className="bu-avatar">{initials(x.name)}</span>
                        <button className="bu-select" onClick={() => setSelected(x.id)}>
                          {x.name}
                        </button>
                      </div>
                    </td>
                    <td>{x.role}</td>
                    <td className="bu-hide-mobile">{loc(x)}</td>
                    <td>
                      <Status value={x.state} />
                    </td>
                    <td>
                      <button
                        className="bu-icon"
                        aria-label={`View ${x.name}`}
                        onClick={() => setSelected(x.id)}
                      >
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </section>
      </div>
      {m ? (
        <Panel
          title={m.name}
          status={m.state}
          onClose={() => setSelected(null)}
          footer={
            <>
              <Button onClick={() => setSelected(null)}>Cancel</Button>
              {p.live ? (
                p.liveMemberTools?.[m.id]
              ) : (
                <Button primary disabled={readOnly} onClick={() => edit('team', m.id, m)}>
                  Edit access
                </Button>
              )}
            </>
          }
        >
          <Facts
            rows={[
              {
                label: 'Role',
                value: m.role,
                hint: m.role === 'Service provider' ? 'Provides services to customers.' : undefined,
              },
              { label: 'Location access', value: loc(m) },
              {
                label: 'Activity',
                value:
                  data.activities.find((a) => a.id === m.activityId)?.name || 'Business operations',
              },
              {
                label: 'Linked scheduling resource',
                value: (
                  <>
                    {m.resource || 'No linked scheduling resource'}
                    {m.resource && (
                      <p>
                        <Link
                          href={
                            p.live
                              ? '/merchant/availability'
                              : '/merchant-live-preview/availability'
                          }
                        >
                          View linked resource ↗
                        </Link>
                      </p>
                    )}
                  </>
                ),
              },
              {
                label: 'Access summary',
                value:
                  m.role === 'Service provider'
                    ? 'View assigned appointments and update service progress.'
                    : m.role === 'Owner'
                      ? 'Manage business configuration and team access.'
                      : 'Access is limited by role and assigned locations.',
              },
            ]}
          />
          <Note>
            Team access and scheduling availability are managed separately. The linked
            resource&apos;s schedule is edited in Availability.
          </Note>
          {!p.live && (
            <div style={{ marginTop: 10 }}>
              <h3>Changes require access review</h3>
              <p className="bu-small bu-muted">
                Updating access may affect assignments and visible information. This preview does
                not send invitations.
              </p>
            </div>
          )}
        </Panel>
      ) : (
        <Empty title="Select a team member" />
      )}
    </div>
  );
}
export function DocumentsView(p: ViewProps) {
  const { data, readOnly } = p;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [selected, setSelected] = useState<string | null>(
    data.documents.find((d) => d.id === 'address')?.id ?? data.documents[0]?.id ?? null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const d = data.documents.find((x) => x.id === selected);
  const rows = data.documents.filter(
    (x) =>
      x.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'All' || x.current === status || x.replacement === status),
  );
  async function replace() {
    if (!d || !file) {
      p.message('Choose a replacement file first.');
      return;
    }
    if (
      !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) ||
      file.size > 10000000
    ) {
      p.message('Choose a PDF, JPG or PNG up to 10 MB.');
      return;
    }
    if (expiry && expiry < new Date().toISOString().slice(0, 10)) {
      p.message('The replacement expiry date must be current or in the future.');
      return;
    }
    const replacements =
      d.replacements ??
      (d.replacement === 'None'
        ? []
        : [
            {
              version: d.version + 1,
              filename: d.filename,
              size: d.size,
              state: d.replacement,
              expires: d.expires,
              note: d.note,
            },
          ]);
    const nextVersion = Math.max(d.version, ...replacements.map((v) => v.version)) + 1;
    const next: BusinessDocument = {
      ...d,
      replacement: 'Review pending',
      replacements: [
        ...replacements,
        {
          version: nextVersion,
          filename: file.name,
          size: file.size,
          state: 'Review pending',
          expires: expiry,
          note,
        },
      ],
      reason: 'Replacement selected in this browser. Awaiting simulated owner review.',
    };
    await p.save(
      { ...data, documents: data.documents.map((x) => (x.id === d.id ? next : x)) },
      'Replacement document submitted in preview',
    );
    setFile(null);
  }
  return (
    <div className="bu-layout">
      <div className="bu-left">
        <section className="bu-card">
          <div className="bu-card-heading">
            <div>
              <h2>Business documents</h2>
              <p>Requirements for your configured business activities.</p>
            </div>
            {!p.live && (
              <Button primary disabled={readOnly} onClick={() => p.edit('documents', 'new', null)}>
                <Plus />
                Add document
              </Button>
            )}
          </div>
          <div className="bu-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search documents…" />
            <select
              aria-label="Filter document status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="All">All statuses</option>
              {['Verified', 'Review pending', 'Needed', 'Expired', 'Changes requested'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          {rows.length ? (
            <table className="bu-table">
              <thead>
                <tr>
                  <th style={{ width: '39%' }}>Document</th>
                  <th className="bu-hide-mobile">Scope</th>
                  <th>Current evidence</th>
                  <th>Replacement</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} data-selected={x.id === d?.id}>
                    <td>
                      <div className="bu-row-name">
                        <span className="bu-avatar">
                          <FileText />
                        </span>
                        <div>
                          <button
                            className="bu-select"
                            onClick={() => {
                              setSelected(x.id);
                              setFile(null);
                            }}
                          >
                            {x.name}
                          </button>
                          <small>
                            {x.optional ? 'Optional claim' : 'Supports the stated requirement.'}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="bu-hide-mobile">{x.scope}</td>
                    <td>
                      <Status value={x.current} />
                      <p className="bu-small bu-muted">v{x.version}</p>
                    </td>
                    <td>{x.replacement === 'None' ? 'None' : <Status value={x.replacement} />}</td>
                    <td>
                      <button
                        className="bu-icon"
                        aria-label={`View ${x.name}`}
                        onClick={() => {
                          setSelected(x.id);
                          setFile(null);
                        }}
                      >
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </section>
      </div>
      {d ? (
        <Panel
          title={d.name}
          subtitle={d.scope}
          onClose={() => setSelected(null)}
          footer={
            <>
              <Button
                onClick={() =>
                  p.preview(
                    'Previous document version',
                    `${d.name}\nVersion ${d.version}: ${d.current}\n\nThis frontend stores file metadata only. Original document bytes require the future document source.`,
                  )
                }
              >
                <Eye />
                View previous version
              </Button>
              <Button primary disabled={readOnly} onClick={replace}>
                Replace document
              </Button>
            </>
          }
        >
          <div className="bu-split-row">
            <Status value={`Current v${d.version} ${d.current.toLowerCase()}`} pill />
            {d.replacement !== 'None' && <Status value={d.replacement} pill />}
          </div>
          {d.reason && (
            <div style={{ marginTop: 8 }}>
              <Note warning>{d.reason}</Note>
            </div>
          )}
          <h3 style={{ marginTop: 10 }}>Versions</h3>
          <div className="bu-version">
            <div>
              <strong>v{d.version} (current)</strong>
              <p>Confirmed sample record</p>
            </div>
            <Status value={d.current} />
          </div>
          {d.replacement !== 'None' && !d.replacements?.length && (
            <div className="bu-version">
              <div>
                <strong>v{d.version + 1} (replacement)</strong>
                <p>Original evidence retained</p>
              </div>
              <Status value={d.replacement} />
            </div>
          )}
          {d.replacements?.map((v) => (
            <div className="bu-version" key={v.version}>
              <div>
                <strong>v{v.version} (replacement)</strong>
                <p>{v.filename} · metadata saved locally</p>
              </div>
              <Status value={v.state} />
            </div>
          ))}
          <div className="bu-fields bu-document-fields" style={{ marginTop: 10 }}>
            <Field label="Upload replacement file">
              <div className="bu-file">
                <Upload size={24} />
                <div>
                  <input
                    aria-label="Replacement file"
                    type="file"
                    disabled={readOnly}
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="bu-small bu-muted">PDF, JPG or PNG (max 10 MB)</p>
                  {file && <p className="bu-small">{file.name} · local selection only</p>}
                </div>
              </div>
            </Field>
            <div className="bu-form-grid">
              <Field label="Expiry date (optional)">
                <input
                  type="date"
                  disabled={readOnly}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </Field>
              <Field label="Note to reviewer (optional)">
                <textarea
                  maxLength={500}
                  disabled={readOnly}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
            <Note>Uploading a file does not verify it.</Note>
            <p className="bu-small bu-muted">Requirement owner: Business verification</p>
          </div>
        </Panel>
      ) : (
        <Empty title="Select a document" />
      )}
    </div>
  );
}
export function FeedbackView(p: ViewProps) {
  const { data, readOnly } = p;
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(4);
  const [rating, setRating] = useState('All');
  const [location, setLocation] = useState('All');
  const [response, setResponse] = useState('All');
  const [selected, setSelected] = useState<string | null>(data.reviews[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    if (p.live || typeof window === 'undefined') return {};
    const values: Record<string, string> = {};
    for (const review of data.reviews) {
      try {
        const value = readDraft(localStorage, data.profileId, 'feedback', review.id)?.value;
        if (typeof value === 'string') values[review.id] = value;
      } catch {
        /* Saved replies remain available. */
      }
    }
    return values;
  });
  const r = data.reviews.find((x) => x.id === selected);
  const rows = data.reviews.filter(
    (x) =>
      `${x.name} ${x.text}`.toLowerCase().includes(search.toLowerCase()) &&
      (rating === 'All' || x.rating === Number(rating)) &&
      (location === 'All' || x.locationId === location) &&
      (response === 'All' || (response === 'Replied' ? !!x.reply : !x.reply)),
  );
  const average = data.reviews.length
    ? (data.reviews.reduce((n, x) => n + x.rating, 0) / data.reviews.length).toFixed(1)
    : '—';
  const text = r ? (drafts[r.id] ?? r.draft ?? '') : '';
  async function saveReply(post: boolean) {
    if (!r) return;
    if (post && !text.trim()) {
      p.message('Write a reply before posting.');
      return;
    }
    const next: Review = { ...r, draft: post ? '' : text, reply: post ? text : r.reply };
    await p.save(
      { ...data, reviews: data.reviews.map((x) => (x.id === r.id ? next : x)) },
      post ? 'Reply posted in local preview' : 'Reply draft saved',
      post,
    );
  }
  return (
    <div className="bu-layout">
      <div className="bu-left">
        <section className="bu-card" style={{ flex: 1 }}>
          <div className="bu-card-heading">
            <div>
              <h2>Customer feedback</h2>
              <p>
                {average} / 5 · {data.reviews.length} {p.live ? 'reviews' : 'sample reviews'} ·
                Source: NEXG
              </p>
            </div>
          </div>
          <div className="bu-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search reviews…" />
            <select
              aria-label="Review location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="All">All locations</option>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Review rating"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <option value="All">All ratings</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} stars
                </option>
              ))}
            </select>
            <select
              aria-label="Review response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            >
              <option>All</option>
              <option>Replied</option>
              <option>Not replied</option>
            </select>
          </div>
          {rows.length ? (
            <table className="bu-table">
              <thead>
                <tr>
                  <th style={{ width: '27%' }}>Customer</th>
                  <th>Rating</th>
                  <th className="bu-hide-mobile">Location</th>
                  <th className="bu-hide-mobile">Date</th>
                  <th>Response</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((x) => (
                  <tr key={x.id} data-selected={r?.id === x.id}>
                    <td>
                      <div className="bu-row-name">
                        <span className="bu-avatar">{initials(x.name)}</span>
                        <button className="bu-select" onClick={() => setSelected(x.id)}>
                          {x.name}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="bu-stars" aria-label={`${x.rating} out of 5`}>
                        {'★'.repeat(x.rating)}
                        <span style={{ color: '#ced2da' }}>{'★'.repeat(5 - x.rating)}</span>
                      </span>
                    </td>
                    <td className="bu-hide-mobile">
                      {data.locations.find((l) => l.id === x.locationId)?.name}
                    </td>
                    <td className="bu-hide-mobile">
                      {new Intl.DateTimeFormat('en-KE', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'Africa/Nairobi',
                      }).format(new Date(`${x.at}T12:00:00Z`))}
                    </td>
                    <td>
                      <Status value={x.reply ? 'Replied' : 'Not replied'} />
                    </td>
                    <td>
                      <button
                        className="bu-icon"
                        aria-label={`View review from ${x.name}`}
                        onClick={() => setSelected(x.id)}
                      >
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
          {rows.length > 4 && (
            <div className="bu-split-row bu-filtered">
              <span>
                {Math.min(limit, rows.length)} of {rows.length} reviews
              </span>
              <button className="bu-link" onClick={() => setLimit(limit === 4 ? rows.length : 4)}>
                {limit === 4 ? 'Show more reviews' : 'Show fewer reviews'}
              </button>
            </div>
          )}
        </section>
      </div>
      {r ? (
        <Panel
          title={`Review from ${r.name}`}
          subtitle={[data.locations.find((l) => l.id === r.locationId)?.name, r.at]
            .filter(Boolean)
            .join(' · ')}
          onClose={() => setSelected(null)}
          footer={
            p.live ? (
              <ReviewReply ratingId={r.id} stars={r.rating} comment={r.text || null} />
            ) : (
              <>
                <Button disabled={readOnly} onClick={() => saveReply(false)}>
                  Save reply draft
                </Button>
                <Button primary disabled={readOnly} onClick={() => saveReply(true)}>
                  Post reply
                </Button>
              </>
            )
          }
        >
          <span className="bu-stars" aria-label={`${r.rating} out of 5`}>
            {'★'.repeat(r.rating)}
          </span>
          <blockquote className="bu-review-quote">“{r.text}”</blockquote>
          {r.reply && (
            <Note>
              {p.live ? 'Current public reply' : 'Current public sample reply'}: {r.reply}
            </Note>
          )}
          {!p.live && (
            <>
              <Field label={`Reply as ${data.profile.name}`}>
                <textarea
                  className="bu-reply"
                  disabled={readOnly}
                  maxLength={1000}
                  value={text}
                  onChange={(e) => {
                    setDrafts({ ...drafts, [r.id]: e.target.value });
                    try {
                      writeDraft(localStorage, data.profileId, {
                        section: 'feedback',
                        id: r.id,
                        value: e.target.value,
                        baseRevision: data.revision,
                      });
                    } catch {
                      p.message('Your reply draft could not be stored. Keep this page open.');
                    }
                  }}
                />
              </Field>
              <p className="bu-small bu-muted" style={{ margin: '8px 0 20px' }}>
                Your reply will be visible to customers. In this preview it stays in your browser.
              </p>
              <button
                className="bu-link bu-row-name"
                disabled={readOnly || r.reported}
                onClick={() =>
                  p.save(
                    {
                      ...data,
                      reviews: data.reviews.map((x) =>
                        x.id === r.id ? { ...x, reported: true } : x,
                      ),
                    },
                    'Review reported in preview',
                    true,
                  )
                }
              >
                <Flag size={15} />
                {r.reported ? 'Report recorded in preview' : 'Report review'}
              </button>
            </>
          )}
        </Panel>
      ) : (
        <Empty title="Select a review" />
      )}
    </div>
  );
}
