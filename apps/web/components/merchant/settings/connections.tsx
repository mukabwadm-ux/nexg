'use client';

import { cn } from '@nexg/ui';
import {
  CalendarDays,
  CarFront,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Unplug,
} from 'lucide-react';
import * as React from 'react';

import { kenyaTime, type Connection } from './model';
import { useSettings } from './store';
import { Action, Badge, Card, Empty, Field, Modal, Note, TextLink } from './ui';
import s from './settings.module.css';

export function ConnectionsScreen() {
  const { state, identity, commit, busy } = useSettings();
  const [selectedId, setSelectedId] = React.useState(state.connections[0]?.id ?? '');
  const [sub, setSub] = React.useState<'Overview' | 'Mappings' | 'Activity'>('Overview');
  const [dialog, setDialog] = React.useState<
    'add' | 'disconnect' | 'reconnect' | 'mappings' | null
  >(null);
  const [menu, setMenu] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const selected = state.connections.find((c) => c.id === selectedId) ?? state.connections[0];
  async function updateConnection(patch: Partial<Connection>, label: string) {
    if (!selected) return;
    if (
      await commit(
        (prev) => ({
          ...prev,
          connections: prev.connections.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)),
        }),
        label,
      )
    )
      setDialog(null);
  }
  if (!identity.sample)
    return (
      <Card title="Connections" description="Choose which system manages each business function.">
        <Empty title="No connection service is configured">
          Your existing business functions keep their current owners. Connector authorization,
          imports and source changes are unavailable until a supported integration is configured.
        </Empty>
        <TextLink href="/merchant/support">Request integration support</TextLink>
      </Card>
    );
  return (
    <>
      <div className={s.connectionLayout}>
        <Card
          title="Connections"
          description="Manage the systems that power your business at NEXG."
          className={s.connectionList}
          action={
            <Action variant="gold" onClick={() => setDialog('add')}>
              <Plus size={17} />
              Add connection
            </Action>
          }
        >
          {state.connections.length > 3 && (
            <label className={s.field}>
              <span className="sr-only">Search connections</span>
              <input
                placeholder="Search connections"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
          )}
          {state.connections
            .filter((c) => `${c.name} ${c.function}`.toLowerCase().includes(filter.toLowerCase()))
            .map((c) => (
              <button
                key={c.id}
                className={cn(s.connectionRow, c.id === selected?.id && s.connectionRowSelected)}
                onClick={() => {
                  setSelectedId(c.id);
                  setSub('Overview');
                }}
              >
                <span className={s.roundIcon}>
                  {c.access === 'Outbound only' ? <FileText size={22} /> : <CarFront size={24} />}
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{c.name}</strong>
                  <small>
                    {c.function} · {c.access}
                  </small>
                </span>
                {c.state !== 'Ready' && (
                  <Badge tone={c.state === 'Access expired' ? 'warning' : 'neutral'}>
                    {c.state}
                  </Badge>
                )}
                <ChevronRight size={17} />
              </button>
            ))}
          <div className={s.connectionRow}>
            <span className={s.roundIcon}>
              <CalendarDays size={22} />
            </span>
            <span>
              <strong>Bookings & availability</strong>
              <small>Managed by NEXG</small>
            </span>
            <TextLink href="/merchant/hours">Open</TextLink>
          </div>
          {!state.connections.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
            .length && (
            <Empty title="No matching connections">
              <button onClick={() => setFilter('')}>Clear search</button>
            </Empty>
          )}
        </Card>
        {selected ? (
          <Card
            title={selected.name}
            description={`Location · ${selected.location}`}
            action={
              <div style={{ position: 'relative' }}>
                <Action onClick={() => setMenu(!menu)}>
                  <MoreHorizontal size={18} />
                  Actions
                </Action>
                {menu && (
                  <div className={s.searchResults} style={{ left: 'auto', width: 200 }}>
                    <button
                      onClick={() => {
                        setDialog('reconnect');
                        setMenu(false);
                      }}
                    >
                      Reconnect
                    </button>
                    <button
                      onClick={() => {
                        setDialog('mappings');
                        setMenu(false);
                      }}
                    >
                      Edit mappings
                    </button>
                    <button
                      onClick={() => {
                        setDialog('disconnect');
                        setMenu(false);
                      }}
                    >
                      Disconnect access
                    </button>
                  </div>
                )}
              </div>
            }
          >
            <div className={s.connectionTabs}>
              {(['Overview', 'Mappings', 'Activity'] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={sub === item}
                  className={sub === item ? s.selectedSub : ''}
                  onClick={() => setSub(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {sub === 'Overview' && (
              <div className={s.stack}>
                {selected.state === 'Access expired' || selected.state === 'Disconnected' ? (
                  <Note tone="warning">
                    <div className={s.between}>
                      <div>
                        <strong>Catalogue updates paused</strong>
                        <p>
                          {selected.state}. Last success {selected.lastSuccess ?? 'not confirmed'}.
                        </p>
                      </div>
                      <Action variant="gold" onClick={() => setDialog('reconnect')}>
                        Reconnect {selected.name.toLowerCase()}
                      </Action>
                    </div>
                  </Note>
                ) : (
                  <Note tone={selected.state === 'Ready' ? 'success' : 'info'}>
                    {selected.state === 'Ready'
                      ? 'Ready for the supported sample operations.'
                      : 'Validation is pending. No live data has been imported.'}
                  </Note>
                )}
                <div>
                  <h3>Who manages this data?</h3>
                  <div className={s.tableWrap} style={{ marginTop: 12 }}>
                    <table className={cn(s.table, s.connectionTable)}>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Managed by</th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{selected.function}</td>
                          <td>{selected.source === 'External' ? 'Fleet system' : 'NEXG'}</td>
                          <td>{selected.access}</td>
                        </tr>
                        {selected.access === 'Read only' && (
                          <tr>
                            <td>Vehicle images</td>
                            <td>Fleet system</td>
                            <td>Read only</td>
                          </tr>
                        )}
                        <tr>
                          <td>Bookings & availability</td>
                          <td>NEXG</td>
                          <td>Managed in NEXG</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <Note>This connection does not write bookings or availability.</Note>
                <div>
                  <h3>Supported access</h3>
                  <div className={s.row}>
                    <div>
                      <strong>
                        {selected.access === 'Read only'
                          ? 'Read catalogue'
                          : 'Export approved postings'}
                      </strong>
                      <p className={s.small}>
                        {selected.access === 'Read only'
                          ? 'Catalogue writes are not supported.'
                          : 'This connection cannot change financial postings.'}
                      </p>
                    </div>
                    <Action onClick={() => setSub('Mappings')}>View mappings</Action>
                  </div>
                  <p className={`${s.small} ${s.muted}`}>
                    Last confirmed import: {selected.lastSuccess ?? 'Not available'}.
                  </p>
                </div>
                <Note>
                  <div className={s.between}>
                    <span>Bookings use their own availability checks.</span>
                    <TextLink href="/merchant/hours">Open Availability</TextLink>
                  </div>
                </Note>
              </div>
            )}
            {sub === 'Mappings' && (
              <div className={s.stack}>
                <Note>
                  Identifiers and source authority are preserved. Mapping changes require
                  validation.
                </Note>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Source field</th>
                        <th>NEXG field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.mappings.map((mapping, i) => (
                        <tr key={i}>
                          <td>{mapping.source}</td>
                          <td>{mapping.target}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Action onClick={() => setDialog('mappings')}>Edit mappings</Action>
              </div>
            )}
            {sub === 'Activity' && (
              <>
                <p className={s.muted}>History for this sample connection.</p>
                <ul className={s.activityList}>
                  {state.activity
                    .filter((item) => /connection|catalogue|mapping|import/i.test(item.label))
                    .map((item) => (
                      <li key={item.id}>
                        <span className={`${s.dot} ${s.successDot}`} />
                        <div>
                          {item.label}
                          <small>{item.time}</small>
                        </div>
                      </li>
                    ))}
                </ul>
                <p className={s.sectionGap}>
                  Last success: {selected.lastSuccess ?? 'Not confirmed'}
                </p>
              </>
            )}
          </Card>
        ) : (
          <Card>
            <Empty title="No connection selected">
              Add a supported sample connector to inspect its ownership and mappings.
            </Empty>
          </Card>
        )}
      </div>
      <ConnectionWizard
        open={dialog === 'add'}
        onClose={() => setDialog(null)}
        onAdded={(id) => {
          setSelectedId(id);
          setSub('Overview');
        }}
      />
      {selected && (
        <>
          <Modal
            open={dialog === 'reconnect'}
            onClose={() => setDialog(null)}
            title={`Reconnect ${selected.name}`}
            description={`Location · ${selected.location}. Access remains limited to ${selected.access.toLowerCase()}.`}
          >
            <div className={s.form}>
              <Note>
                This preview simulates secure authorization. No credentials are requested or stored
                and no external system is contacted.
              </Note>
              <p>
                Only this connection’s supported access will be restored. Booking ownership and
                other connections remain unchanged.
              </p>
              <div className={s.actions}>
                <Action onClick={() => setDialog(null)}>Cancel</Action>
                <Action
                  variant="gold"
                  loading={busy}
                  onClick={() =>
                    void updateConnection(
                      { state: 'Ready', lastSuccess: kenyaTime() },
                      'Sample connection access restored.',
                    )
                  }
                >
                  Authorize sample connection
                </Action>
              </div>
            </div>
          </Modal>
          <Modal
            open={dialog === 'disconnect'}
            onClose={() => setDialog(null)}
            title="Disconnect this connection?"
            description="Review the affected data before stopping future access."
          >
            <div className={s.form}>
              <p>
                <strong>{selected.name}</strong> · {selected.location}
              </p>
              <Note tone="warning">
                Future {selected.function.toLowerCase()} updates will stop. Last-confirmed data and
                historical references remain. This does not move ownership to another system.
              </Note>
              <p>
                Bookings and availability retain their separate owner. Outstanding operations must
                be reconciled before a real disconnection.
              </p>
              <div className={s.actions}>
                <Action onClick={() => setDialog(null)}>Cancel</Action>
                <Action
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    void updateConnection(
                      { state: 'Disconnected' },
                      'Sample connection disconnected.',
                    )
                  }
                >
                  <Unplug size={16} />
                  Disconnect access
                </Action>
              </div>
            </div>
          </Modal>
          <MappingsEditor
            key={selected.id + selected.mappings.map((m) => m.source).join()}
            open={dialog === 'mappings'}
            connection={selected}
            onClose={() => setDialog(null)}
            onSave={(mappings) =>
              updateConnection({ mappings }, 'Sample mappings validated and saved.')
            }
          />
        </>
      )}
    </>
  );
}
function MappingsEditor({
  open,
  connection,
  onClose,
  onSave,
}: {
  open: boolean;
  connection: Connection;
  onClose: () => void;
  onSave: (mappings: Connection['mappings']) => Promise<void>;
}) {
  const [mappings, setMappings] = React.useState(connection.mappings);
  const [error, setError] = React.useState('');
  const { busy } = useSettings();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit field mappings"
      description="Match typed fields while preserving external identifiers and source authority."
    >
      <div className={s.form}>
        {mappings.map((mapping, index) => (
          <div className={s.grid} key={index}>
            <Field label={`Source field ${index + 1}`}>
              <input
                value={mapping.source}
                onChange={(e) =>
                  setMappings(
                    mappings.map((m, i) => (i === index ? { ...m, source: e.target.value } : m)),
                  )
                }
              />
            </Field>
            <Field label={`NEXG field ${index + 1}`}>
              <select
                value={mapping.target}
                onChange={(e) =>
                  setMappings(
                    mappings.map((m, i) => (i === index ? { ...m, target: e.target.value } : m)),
                  )
                }
              >
                {['External identifier', 'Description', 'Image reference'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
        ))}
        {error && <Note tone="danger">{error}</Note>}
        <Note>
          Only registered fields are allowed. Units, enums and privacy classes need their actual
          source contract. No scripts are accepted.
        </Note>
        <div className={s.actions}>
          <Action onClick={onClose}>Cancel</Action>
          <Action
            variant="gold"
            loading={busy}
            onClick={() => {
              if (
                mappings.some((m) => !/^[a-zA-Z_][a-zA-Z0-9_.]{0,63}$/.test(m.source)) ||
                new Set(mappings.map((m) => m.target)).size !== mappings.length
              ) {
                setError('Use valid source field names and map each target only once.');
                return;
              }
              void onSave(mappings);
            }}
          >
            Validate and save
          </Action>
        </div>
      </div>
    </Modal>
  );
}
function ConnectionWizard({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const { commit, busy } = useSettings();
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState('');
  const [functionName, setFunctionName] = React.useState('Inventory catalogue');
  const [authorized, setAuthorized] = React.useState(false);
  const [error, setError] = React.useState('');
  const reset = () => {
    onClose();
    setStep(0);
    setName('');
    setAuthorized(false);
    setError('');
  };
  async function finish() {
    const id = crypto.randomUUID();
    if (
      await commit(
        (prev) => ({
          ...prev,
          connections: [
            ...prev.connections,
            {
              id,
              name: name.trim(),
              function: functionName,
              location: 'Kilimani',
              state: 'Ready',
              source: 'External',
              access: 'Read only',
              lastSuccess: kenyaTime(),
              mappings: [
                { source: 'external_id', target: 'External identifier' },
                { source: 'description', target: 'Description' },
              ],
            },
          ],
        }),
        'Sample connection setup completed.',
      )
    ) {
      onAdded(id);
      reset();
    }
  }
  return (
    <Modal
      open={open}
      onClose={reset}
      title="Add connection"
      description="Configure a supported business function. No live provider is connected by this sample."
    >
      <div className={s.form}>
        <div className={s.steps}>
          {['Function', 'Access', 'Review'].map((label, i) =>
            i === step ? <strong key={label}>{label}</strong> : <span key={label}>{label}</span>,
          )}
        </div>
        {step === 0 ? (
          <>
            <Field label="Connection name">
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="My inventory system"
              />
            </Field>
            <Field label="Business function">
              <select value={functionName} onChange={(e) => setFunctionName(e.target.value)}>
                <option>Inventory catalogue</option>
                <option>Service catalogue</option>
                <option>Fleet catalogue</option>
              </select>
            </Field>
            <Field label="Location">
              <select>
                <option>Kilimani</option>
              </select>
            </Field>
            <Note>
              Sample catalogue connector · Read only. Native NEXG and manual data do not require an
              external connection.
            </Note>
          </>
        ) : step === 1 ? (
          <>
            <Note>
              In a live flow, authorization takes place with the supported provider. This sample
              never accepts credentials.
            </Note>
            <Action onClick={() => setAuthorized(true)}>
              {authorized ? 'Sample access authorized' : 'Authorize sample read access'}
            </Action>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Owner</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Catalogue and descriptions</td>
                    <td>External system</td>
                    <td>Read only → NEXG</td>
                  </tr>
                  <tr>
                    <td>Bookings and availability</td>
                    <td>NEXG</td>
                    <td>Unchanged</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p>
              <strong>{name}</strong> · Kilimani
            </p>
            <p>{functionName} · External authority · Read only</p>
            <Note>
              Sample validation: 3 fictional catalogue records matched. Identifiers and descriptions
              use known mappings. No real records are imported or replaced.
            </Note>
            <p>
              After confirmation, this sample instance is ready for read-only operations. No
              financial, stock or booking write permission is granted.
            </p>
          </>
        )}
        {error && <Note tone="danger">{error}</Note>}
        <div className={s.actions}>
          <Action
            onClick={
              step
                ? () => {
                    setStep(step - 1);
                    setError('');
                  }
                : reset
            }
          >
            {step ? 'Back' : 'Cancel'}
          </Action>
          <Action
            variant="gold"
            loading={busy}
            onClick={() => {
              if (step === 0 && name.trim().length < 2) {
                setError('Enter a connection name.');
                return;
              }
              if (step === 1 && !authorized) {
                setError('Authorize the sample read access to continue.');
                return;
              }
              setError('');
              if (step < 2) setStep(step + 1);
              else void finish();
            }}
          >
            {step === 2 ? 'Finish sample setup' : 'Continue'}
          </Action>
        </div>
      </div>
    </Modal>
  );
}
