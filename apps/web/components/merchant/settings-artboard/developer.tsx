'use client';

import { Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { kenyaTime, type Credential, type Webhook } from './model';
import { useSettings } from './store';
import { Action, Badge, Card, Empty, Field, Modal, Note, TextLink } from './ui';
import s from './settings.module.css';

export function DeveloperScreen() {
  const { state, identity, commit, busy } = useSettings();
  const [dialog, setDialog] = React.useState<'key' | 'webhook' | 'delivery' | null>(null);
  const [keyId, setKeyId] = React.useState<string | null>(null);
  const [webhookId, setWebhookId] = React.useState(state.webhooks[0]?.id ?? '');
  const [confirm, setConfirm] = React.useState<'revoke' | 'rotate' | null>(null);
  const credential = state.credentials.find((k) => k.id === keyId);
  const webhook = state.webhooks.find((w) => w.id === webhookId) ?? state.webhooks[0];
  async function patchWebhook(patch: Partial<Webhook>, label: string) {
    if (!webhook) return;
    await commit(
      (prev) => ({
        ...prev,
        webhooks: prev.webhooks.map((w) => (w.id === webhook.id ? { ...w, ...patch } : w)),
      }),
      label,
    );
  }
  if (!identity.sample)
    return (
      <Card title="API & webhooks" description="Manage scoped access for supported systems.">
        <Empty title="Developer access is not available for this workspace">
          API credentials and webhook management require an approved developer-access service. No
          keys, scopes or event subscriptions are created here.
        </Empty>
        <TextLink href="/merchant/support">Request developer access</TextLink>
      </Card>
    );
  return (
    <>
      <div className={s.stack}>
        <Card
          title="API credentials"
          description="Create and manage API keys for integrating with NEXG."
          action={
            <Action variant="gold" onClick={() => setDialog('key')}>
              <Plus size={20} />
              Create key
            </Action>
          }
        >
          {state.credentials.length ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Scope</th>
                    <th>Status</th>
                    <th>Last used</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.credentials.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <strong>{k.name}</strong>
                      </td>
                      <td className={s.muted}>
                        {k.scopes.join(', ')} · {k.location}
                      </td>
                      <td>
                        <Badge tone={k.state === 'Active' ? 'success' : 'neutral'}>{k.state}</Badge>
                      </td>
                      <td className={s.muted}>{k.lastUsed ?? 'Not used'}</td>
                      <td>
                        <Action
                          onClick={() => {
                            setKeyId(k.id);
                            setConfirm(null);
                          }}
                        >
                          Manage
                        </Action>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ padding: '12px 16px', color: 'var(--muted-light)' }}>
                This credential cannot change stock or bookings.
              </p>
            </div>
          ) : (
            <Empty title="No API credentials">
              Create a sample read-only credential to review the scope flow.
            </Empty>
          )}
        </Card>
        <Card
          title="Webhooks"
          description="Send permitted event notifications to your systems."
          action={
            <Action onClick={() => setDialog('webhook')}>
              <Plus size={19} />
              Add webhook
            </Action>
          }
        >
          <div className={s.developerSplit}>
            <div className={s.inset}>
              <h3>Subscriptions</h3>
              {state.webhooks.length ? (
                <div className={s.tableWrap} style={{ marginTop: 14, border: 0 }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Scope</th>
                        <th>Destination</th>
                        <th>Status</th>
                        <th>Signing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.webhooks.map((w) => (
                        <tr key={w.id}>
                          <td>
                            <button
                              onClick={() => setWebhookId(w.id)}
                              style={{
                                fontWeight: w.id === webhook?.id ? 800 : 600,
                                textAlign: 'left',
                              }}
                            >
                              {w.name}
                            </button>
                          </td>
                          <td className={s.muted}>
                            {w.events.join(', ')} · {w.location}
                          </td>
                          <td className={s.url}>{w.url}</td>
                          <td>
                            <Badge tone={w.state === 'Active' ? 'success' : 'neutral'}>
                              {w.state}
                            </Badge>
                          </td>
                          <td>
                            <Badge tone={w.signing === 'Verified' ? 'success' : 'warning'}>
                              {w.signing}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No subscriptions">Add a sample endpoint and permitted events.</Empty>
              )}
              {webhook && (
                <div className={s.between}>
                  <TextLink onClick={() => setDialog('delivery')}>Manage subscription</TextLink>
                  {webhook.signing !== 'Verified' && (
                    <TextLink
                      onClick={() =>
                        void patchWebhook(
                          { signing: 'Verified' },
                          'Sample webhook signing verified.',
                        )
                      }
                    >
                      Verify sample signing
                    </TextLink>
                  )}
                </div>
              )}
              <p className={`${s.small} ${s.muted}`} style={{ marginTop: 20 }}>
                Webhook access is granted separately from API credentials.
              </p>
            </div>
            <div className={s.inset}>
              <h3>Latest delivery</h3>
              {webhook ? (
                <>
                  <dl className={s.definitionList}>
                    <dt>Event</dt>
                    <dd>{webhook.events[0]}</dd>
                    <dt>Status</dt>
                    <dd>
                      <Badge
                        tone={
                          webhook.delivery === 'Failed'
                            ? 'danger'
                            : webhook.delivery === 'Delivered'
                              ? 'success'
                              : 'info'
                        }
                      >
                        {webhook.delivery}
                      </Badge>
                    </dd>
                    <dt>Time</dt>
                    <dd>{webhook.time ?? 'Not sent'}</dd>
                    <dt>Reason</dt>
                    <dd>
                      {webhook.delivery === 'Failed'
                        ? 'Destination unavailable · HTTP 503'
                        : webhook.delivery === 'Queued'
                          ? 'Sample event queued for delivery'
                          : 'No delivery error recorded'}
                    </dd>
                  </dl>
                  <div className={s.between}>
                    <TextLink onClick={() => setDialog('delivery')}>View delivery</TextLink>
                    <Action
                      disabled={
                        webhook.state !== 'Active' ||
                        webhook.signing !== 'Verified' ||
                        webhook.delivery === 'Queued'
                      }
                      loading={busy}
                      onClick={() =>
                        void patchWebhook(
                          { delivery: 'Queued', time: kenyaTime() },
                          'Sample event queued. No message was sent.',
                        )
                      }
                    >
                      <RefreshCw size={16} />
                      Retry delivery
                    </Action>
                  </div>
                  <p className={`${s.small} ${s.muted}`} style={{ marginTop: 15 }}>
                    Retry sends this event again. It does not repeat the order.
                  </p>
                </>
              ) : (
                <p className={s.muted} style={{ marginTop: 16 }}>
                  Choose a subscription to see its delivery state.
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
      <CreateCredential open={dialog === 'key'} onClose={() => setDialog(null)} />
      <CreateWebhook
        open={dialog === 'webhook'}
        onClose={() => setDialog(null)}
        onAdded={setWebhookId}
      />
      {credential && (
        <Modal
          open={keyId !== null}
          onClose={() => {
            setKeyId(null);
            setConfirm(null);
          }}
          title={`Manage ${credential.name}`}
          description={`Location · ${credential.location}. Scope: ${credential.scopes.join(', ')}.`}
        >
          <div className={s.form}>
            <Badge tone={credential.state === 'Active' ? 'success' : 'neutral'}>
              {credential.state}
            </Badge>
            <Note>
              This sample stores only a credential label and scope. No usable API key exists or is
              revealed.
            </Note>
            <p>
              Revision {credential.revision}. Last used: {credential.lastUsed ?? 'Not used'}.
            </p>
            {confirm && (
              <Note tone="warning">
                {confirm === 'revoke'
                  ? 'Future access using this credential will stop. Other credentials and webhook subscriptions remain separate.'
                  : 'This creates a new sample credential revision with the same permitted scope. Real key rotation requires its owner’s overlap and expiration policy.'}
              </Note>
            )}
            <div className={s.actions}>
              {confirm ? (
                <>
                  <Action onClick={() => setConfirm(null)}>Back</Action>
                  <Action
                    variant={confirm === 'revoke' ? 'danger' : 'gold'}
                    loading={busy}
                    onClick={async () => {
                      const label =
                        confirm === 'revoke'
                          ? 'Sample credential revoked.'
                          : 'Sample credential rotated.';
                      if (
                        await commit(
                          (prev) => ({
                            ...prev,
                            credentials: prev.credentials.map((k) =>
                              k.id !== credential.id
                                ? k
                                : {
                                    ...k,
                                    state: confirm === 'revoke' ? 'Revoked' : 'Active',
                                    revision: k.revision + 1,
                                  },
                            ),
                          }),
                          label,
                        )
                      ) {
                        setConfirm(null);
                        setKeyId(null);
                      }
                    }}
                  >
                    {confirm === 'revoke' ? 'Confirm revoke' : 'Confirm rotation'}
                  </Action>
                </>
              ) : (
                <>
                  <Action
                    disabled={credential.state !== 'Active'}
                    onClick={() => setConfirm('rotate')}
                  >
                    Rotate key
                  </Action>
                  <Action
                    variant="danger"
                    disabled={credential.state !== 'Active'}
                    onClick={() => setConfirm('revoke')}
                  >
                    Revoke key
                  </Action>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
      {webhook && (
        <Modal
          open={dialog === 'delivery'}
          onClose={() => setDialog(null)}
          title="Webhook subscription and delivery"
          description="Delivery actions affect this subscription only. They do not replay the underlying business action."
        >
          <div className={s.form}>
            <h3>{webhook.name}</h3>
            <p className={s.url}>{webhook.url}</p>
            <p>
              {webhook.events.join(', ')} · {webhook.location}
            </p>
            <div className={s.inline}>
              <Badge tone="info">{webhook.state}</Badge>
              <Badge tone={webhook.signing === 'Verified' ? 'success' : 'warning'}>
                Signing: {webhook.signing}
              </Badge>
              <Badge tone={webhook.delivery === 'Failed' ? 'danger' : 'info'}>
                {webhook.delivery}
              </Badge>
            </div>
            <Note>
              No payload, signature secret or private customer data is shown. No external message is
              sent by this preview.
            </Note>
            <div className={s.actions}>
              <Action
                loading={busy}
                onClick={() =>
                  void patchWebhook(
                    { state: webhook.state === 'Active' ? 'Paused' : 'Active' },
                    'Sample webhook state updated.',
                  )
                }
              >
                {webhook.state === 'Active' ? 'Pause subscription' : 'Resume subscription'}
              </Action>
              <Action
                onClick={async () => {
                  await patchWebhook(
                    { signing: 'Verification pending' },
                    'Sample signing rotation requested.',
                  );
                }}
              >
                Rotate signing secret
              </Action>
              <Action variant="gold" onClick={() => setDialog(null)}>
                Done
              </Action>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function CreateCredential({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { commit, busy } = useSettings();
  const [name, setName] = React.useState('');
  const [scopes, setScopes] = React.useState(['Inventory read']);
  const [review, setReview] = React.useState(false);
  const [error, setError] = React.useState('');
  function close() {
    onClose();
    setReview(false);
    setName('');
    setError('');
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={review ? 'Review API access' : 'Create API credential'}
      description="Choose minimal read-only access for the selected location."
    >
      <div className={s.form}>
        {review ? (
          <>
            <p>
              <strong>{name}</strong> · Kilimani
            </p>
            <p>{scopes.join(', ')}</p>
            <Note>
              This preview creates a sample label only, never a real key. Real secrets must use the
              protected reveal flow of the developer service.
            </Note>
          </>
        ) : (
          <>
            <Field label="Credential name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Inventory integration"
              />
            </Field>
            <Field label="Location">
              <select>
                <option>Kilimani</option>
              </select>
            </Field>
            <fieldset>
              <legend>Allowed operations</legend>
              {['Inventory read', 'Catalogue read'].map((scope) => (
                <label key={scope} className={s.checkRow}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={(e) =>
                      setScopes(
                        e.target.checked ? [...scopes, scope] : scopes.filter((x) => x !== scope),
                      )
                    }
                  />
                  {scope}
                </label>
              ))}
            </fieldset>
            <p className={s.small}>Write operations and other locations are not included.</p>
          </>
        )}
        {error && <Note tone="danger">{error}</Note>}
        <div className={s.actions}>
          <Action onClick={review ? () => setReview(false) : close}>
            {review ? 'Back' : 'Cancel'}
          </Action>
          <Action
            variant="gold"
            loading={busy}
            onClick={async () => {
              if (name.trim().length < 2 || !scopes.length) {
                setError('Enter a name and choose at least one permitted operation.');
                return;
              }
              setError('');
              if (!review) {
                setReview(true);
                return;
              }
              const key: Credential = {
                id: crypto.randomUUID(),
                name: name.trim(),
                location: 'Kilimani',
                scopes,
                state: 'Active',
                lastUsed: null,
                revision: 1,
              };
              if (
                await commit(
                  (prev) => ({ ...prev, credentials: [...prev.credentials, key] }),
                  'Sample credential created.',
                )
              )
                close();
            }}
          >
            {review ? 'Create sample credential' : 'Review access'}
          </Action>
        </div>
      </div>
    </Modal>
  );
}
function CreateWebhook({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const { commit, busy } = useSettings();
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [events, setEvents] = React.useState(['Order status changed']);
  const [error, setError] = React.useState('');
  const [review, setReview] = React.useState(false);
  function close() {
    onClose();
    setName('');
    setUrl('');
    setError('');
    setReview(false);
  }
  function validate() {
    try {
      const endpoint = new URL(url);
      if (
        endpoint.protocol !== 'https:' ||
        endpoint.username ||
        endpoint.password ||
        endpoint.hash ||
        endpoint.search ||
        endpoint.hostname === 'localhost' ||
        /^\d+\./.test(endpoint.hostname)
      )
        throw new Error();
    } catch {
      setError('Use an HTTPS destination without credentials, query secrets or a fragment.');
      return false;
    }
    if (name.trim().length < 2 || !events.length) {
      setError('Enter a subscription name and select a supported event.');
      return false;
    }
    setError('');
    return true;
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={review ? 'Review webhook subscription' : 'Add webhook'}
      description="The subscription’s event access is independent of API credential scopes."
    >
      <div className={s.form}>
        {review ? (
          <>
            <p>
              <strong>{name}</strong> · Kilimani
            </p>
            <p className={s.url}>{url}</p>
            <p>{events.join(', ')}</p>
            <Note>
              Signing verification is required before supported delivery. This sample does not
              contact this endpoint.
            </Note>
          </>
        ) : (
          <>
            <Field label="Subscription name">
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="HTTPS destination">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sync.example.test/nexg/events"
              />
            </Field>
            <Field label="Location">
              <select>
                <option>Kilimani</option>
              </select>
            </Field>
            <fieldset>
              <legend>Permitted events</legend>
              {['Order status changed', 'Catalogue updated'].map((event) => (
                <label className={s.checkRow} key={event}>
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={(e) =>
                      setEvents(
                        e.target.checked ? [...events, event] : events.filter((x) => x !== event),
                      )
                    }
                  />
                  {event}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {error && <Note tone="danger">{error}</Note>}
        <div className={s.actions}>
          <Action onClick={review ? () => setReview(false) : close}>
            {review ? 'Back' : 'Cancel'}
          </Action>
          <Action
            variant="gold"
            loading={busy}
            onClick={async () => {
              if (!validate()) return;
              if (!review) {
                setReview(true);
                return;
              }
              const id = crypto.randomUUID();
              if (
                await commit(
                  (prev) => ({
                    ...prev,
                    webhooks: [
                      ...prev.webhooks,
                      {
                        id,
                        name: name.trim(),
                        url,
                        events,
                        location: 'Kilimani',
                        state: 'Paused',
                        signing: 'Verification pending',
                        delivery: 'Not sent',
                        time: null,
                      },
                    ],
                  }),
                  'Sample webhook added; signing verification pending.',
                )
              ) {
                onAdded(id);
                close();
              }
            }}
          >
            {review ? 'Add sample webhook' : 'Review subscription'}
          </Action>
        </div>
      </div>
    </Modal>
  );
}
