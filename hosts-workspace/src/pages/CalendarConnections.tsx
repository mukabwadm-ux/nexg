import { useState } from 'react';

import { CALENDAR_PROVIDERS } from '../../../apps/web/lib/host-workspace/vocab';
import { dateText } from '../model';
import { Badge, Button, Empty, Icon, PageHeader, Pager, Panel, Table } from '../ui';
import { useWorkspace } from '../workspace';

const initial = { provider: 'airbnb', url: '', label: '', propertyId: '' };

export function CalendarConnectionsPage() {
  const w = useWorkspace();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(1);
  const rows = w.data.calendarConnections.filter(
    (row) => w.scope === 'all' || !row.propertyId || row.propertyId === w.scope,
  );
  const size = 5;
  const current = Math.max(1, Math.min(page, Math.ceil(rows.length / size)));
  const state = (status: unknown) =>
    status === 'ok' ? 'Synced' : status === 'failing' ? 'Sync failed' : 'Waiting for first sync';

  if (!w.propertyWrites)
    return (
      <Empty
        title="Calendar connections"
        description="An account-wide host manages calendar connections."
      >
        <Button onClick={() => w.go('calendar')}>Back to Calendar</Button>
      </Empty>
    );

  return (
    <div className="management-page">
      <PageHeader
        title="Calendar connections"
        subtitle="Manage incoming feeds and see their recorded sync status."
      >
        <Button onClick={() => w.go('calendar')}>
          <Icon name="left" size={16} />
          Calendar
        </Button>
        <Button variant="primary" onClick={() => setOpen(!open)}>
          <Icon name="add" size={16} />
          {open ? 'Close form' : 'Add calendar'}
        </Button>
      </PageHeader>
      {open && (
        <Panel className="host-workflow-form">
          <form
            className="mg-form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending) return;
              setPending(true);
              try {
                if (
                  await w.run({
                    type: 'save',
                    collection: 'calendarConnections',
                    record: {
                      provider: form.provider,
                      url: form.provider === 'pms_csv' ? undefined : form.url.trim(),
                      label: form.label,
                      propertyId: form.propertyId || undefined,
                    },
                  })
                ) {
                  setForm(initial);
                  setOpen(false);
                }
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="field">
              <span>Provider</span>
              <select
                value={form.provider}
                disabled={pending}
                onChange={(event) => setForm({ ...form, provider: event.target.value })}
              >
                {CALENDAR_PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            {form.provider === 'pms_csv' ? (
              <p className="mg-small-note">NexG sets up the column mapping for a PMS export.</p>
            ) : (
              <label className="field">
                <span>HTTPS iCal link</span>
                <input
                  type="url"
                  maxLength={2048}
                  required
                  disabled={pending}
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                />
              </label>
            )}
            <label className="field">
              <span>Label</span>
              <input
                value={form.label}
                maxLength={160}
                disabled={pending}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Property</span>
              <select
                value={form.propertyId}
                disabled={pending}
                onChange={(event) => setForm({ ...form, propertyId: event.target.value })}
              >
                <option value="">All properties</option>
                {w.data.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save connection'}
            </Button>
          </form>
        </Panel>
      )}
      <Panel className="mg-fill-panel">
        <div className="mg-panel-heading">
          <h2>Connected calendars</h2>
          <Badge>{rows.length}</Badge>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Provider / label</th>
              <th>Property</th>
              <th>Status</th>
              <th>Last sync</th>
              <th>Bookings imported</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * size, current * size).map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>
                    {CALENDAR_PROVIDERS.find((provider) => provider.value === row.provider)
                      ?.label ?? String(row.provider || 'Calendar')}
                  </strong>
                  <small>{row.title}</small>
                </td>
                <td>{String(row.property || 'All properties')}</td>
                <td>
                  <Badge
                    tone={
                      row.status === 'ok'
                        ? 'success'
                        : row.status === 'failing'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {state(row.status)}
                  </Badge>
                  {Boolean(row.error) && <small>{String(row.error)}</small>}
                </td>
                <td>{dateText(row.date || '')}</td>
                <td>{String(row.imported || 0)}</td>
                <td>
                  <Button
                    disabled={pending}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          'Disconnect this feed? Imported bookings stay in your workspace.',
                        )
                      )
                        return;
                      setPending(true);
                      try {
                        await w.run({
                          type: 'delete',
                          collection: 'calendarConnections',
                          id: row.id,
                        });
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && (
          <Empty
            title="No calendar connections"
            description="Add an iCal link or a PMS connection for your host account."
          />
        )}
        <Pager page={current} total={rows.length} pageSize={size} onChange={setPage} />
      </Panel>
    </div>
  );
}
