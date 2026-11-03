'use client';

import {
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  KeyRound,
  Laptop,
  Pencil,
  Phone,
  Smartphone,
} from 'lucide-react';
import * as React from 'react';

import { useSettings } from './store';
import { Action, Badge, Card, Empty, Field, Modal, Note, TextLink } from './ui';
import s from './settings.module.css';

export function AccountScreen() {
  const { state, identity, commit, busy, notify } = useSettings();
  const [dialog, setDialog] = React.useState<'profile' | 'signin' | 'factor' | 'activity' | null>(
    null,
  );
  const [name, setName] = React.useState(state.name);
  const [code, setCode] = React.useState('');
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const close = () => {
    setDialog(null);
    setSessionId(null);
    setError('');
    setCode('');
  };
  async function saveProfile() {
    if (name.trim().length < 2 || name.trim().length > 80) {
      setError('Enter a display name between 2 and 80 characters.');
      return;
    }
    if (await commit((prev) => ({ ...prev, name: name.trim() }), 'Profile updated.')) close();
  }
  return (
    <>
      <div className={s.grid}>
        <div className={s.stack}>
          <Card
            title="Personal profile"
            description="This is your account information."
            action={
              identity.sample ? (
                <Action
                  onClick={() => {
                    setName(state.name);
                    setDialog('profile');
                  }}
                >
                  <Pencil size={17} />
                  Edit profile
                </Action>
              ) : undefined
            }
          >
            <div className={`${s.inset} ${s.profileInset}`}>
              <div className={s.identityRow}>
                <span className={s.identityAvatar}>
                  {state.name
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('')}
                </span>
                <div>
                  <h3 className={s.profileName}>{state.name}</h3>
                  <p className={s.muted}>Signed in to NEXG</p>
                </div>
              </div>
              <hr className={s.divider} />
              <div className={s.between}>
                <span className={s.muted}>Business details are managed in Business.</span>
                <TextLink
                  href={identity.sample ? '/merchant-live-preview/business' : '/merchant/stores'}
                  icon={<ExternalLink size={14} />}
                >
                  Open Business
                </TextLink>
              </div>
            </div>
          </Card>
          <Card
            title="Sign-in and recovery"
            description="Manage how you sign in and keep your account accessible."
          >
            <div className={s.inset}>
              <div className={s.row}>
                <div className={s.identityRow}>
                  <span className={s.roundIcon}>
                    <Phone size={25} />
                  </span>
                  <div>
                    <strong>
                      {identity.phone !== 'Not available' ? 'Phone sign-in' : 'Email sign-in'}
                    </strong>
                    <div className={s.muted}>
                      {identity.phone !== 'Not available' ? identity.phone : identity.email}
                    </div>
                  </div>
                  {identity.phoneVerified && (
                    <Badge tone="success">
                      <CheckCircle2 size={14} />
                      Verified
                    </Badge>
                  )}
                </div>
                <Action onClick={() => setDialog('signin')}>Manage sign-in</Action>
              </div>
              <hr className={s.divider} />
              <h3>Additional authentication</h3>
              <p className={s.muted}>Add another verification step to your account.</p>
              <div className={s.row}>
                <div className={s.identityRow}>
                  <span className={s.roundIcon}>
                    <KeyRound size={24} />
                  </span>
                  <div>
                    <strong>
                      {state.factor ? 'Additional authentication enabled' : 'Not set up'}
                    </strong>
                    <div className={s.muted}>
                      Add a supported sign-in check, such as an authenticator app.
                    </div>
                  </div>
                </div>
                <Action
                  variant="gold"
                  onClick={() => {
                    if (identity.sample) setDialog('factor');
                    else
                      notify(
                        'Additional authentication management is not available for this workspace.',
                        'warning',
                      );
                  }}
                >
                  {state.factor ? 'Manage' : 'Set up'}
                </Action>
              </div>
            </div>
          </Card>
        </div>
        <div className={s.stack}>
          <Card
            title="Sessions"
            description="These are the devices currently signed in to your account."
          >
            {state.sessions.length ? (
              state.sessions.map((session) => (
                <div className={`${s.row} ${s.sessionRow}`} key={session.id}>
                  <div className={s.identityRow}>
                    <span className={s.roundIcon}>
                      {session.current ? <Laptop size={23} /> : <Smartphone size={23} />}
                    </span>
                    <div>
                      <div className={s.sessionHeading}>
                        <strong>{session.device}</strong>
                        {session.current && <Badge tone="success">This session</Badge>}
                      </div>
                      {identity.sample && <div className={s.sessionLocation}>Kilimani branch</div>}
                      <div className={s.small}>Last active {session.activity}</div>
                    </div>
                  </div>
                  {!session.current && (
                    <TextLink onClick={() => setSessionId(session.id)} icon={null}>
                      Revoke
                    </TextLink>
                  )}
                </div>
              ))
            ) : (
              <Empty title="Session details unavailable">
                Session records are not provided by this workspace. Your current sign-in remains
                active.
              </Empty>
            )}
          </Card>
          <Card title="Security activity" description="Recent activity on your account.">
            {state.activity.length ? (
              <ul className={s.activityList}>
                {state.activity.slice(0, 2).map((event) => (
                  <li key={event.id}>
                    <span className={`${s.dot} ${s.successDot}`} />
                    <div>
                      {event.label}
                      <small>{event.time}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.muted}>No activity source is connected.</p>
            )}
            <div className={`${s.between} ${s.activityActions}`}>
              <TextLink onClick={() => setDialog('activity')}>View activity</TextLink>
              <TextLink href="/merchant/support" icon={<CircleHelp size={17} />}>
                Get help
              </TextLink>
            </div>
          </Card>
        </div>
      </div>
      <Modal
        open={dialog === 'profile'}
        onClose={close}
        title="Edit personal profile"
        description="This changes your personal display name, not the business identity."
      >
        <div className={s.form}>
          <Field label="Display name">
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </Field>
          {error && <Note tone="danger">{error}</Note>}
          <div className={s.actions}>
            <Action onClick={close}>Cancel</Action>
            <Action variant="gold" loading={busy} onClick={() => void saveProfile()}>
              Save profile
            </Action>
          </div>
        </div>
      </Modal>
      <Modal
        open={dialog === 'signin'}
        onClose={close}
        title="Sign-in and recovery"
        description="Verification is separate from a requested change."
      >
        <div className={s.form}>
          <Note>
            {identity.sample
              ? 'This preview does not change a real sign-in method.'
              : 'Use the secure recovery flow to manage your login. Existing credentials remain active until the identity provider confirms a change.'}
          </Note>
          <p>
            Current identity: {identity.phone !== 'Not available' ? identity.phone : identity.email}
          </p>
          <TextLink href="/forgot-password">Open secure account recovery</TextLink>
          <Action onClick={close}>Done</Action>
        </div>
      </Modal>
      <Modal
        open={dialog === 'factor'}
        onClose={close}
        title={
          state.factor ? 'Manage additional authentication' : 'Set up additional authentication'
        }
        description="Sample enrollment flow. No real authentication factor or recovery secret is created."
      >
        <div className={s.form}>
          {state.factor ? (
            <>
              <Badge tone="success">Enabled in sample workspace</Badge>
              <Note>
                Removing a real factor requires the identity provider’s policy and reauthentication.
              </Note>
              <Action
                variant="danger"
                loading={busy}
                onClick={async () => {
                  if (
                    await commit((prev) => ({ ...prev, factor: false }), 'Sample factor removed.')
                  )
                    close();
                }}
              >
                Remove sample factor
              </Action>
            </>
          ) : (
            <>
              <Note>For this sample only, enter 123456 to confirm enrollment.</Note>
              <Field label="Verification code">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              {error && <Note tone="danger">{error}</Note>}
              <Action
                variant="gold"
                loading={busy}
                onClick={async () => {
                  if (code !== '123456') {
                    setError('Enter the sample verification code 123456.');
                    return;
                  }
                  if (
                    await commit(
                      (prev) => ({ ...prev, factor: true }),
                      'Sample authentication confirmed.',
                    )
                  )
                    close();
                }}
              >
                Confirm enrollment
              </Action>
            </>
          )}
        </div>
      </Modal>
      <Modal
        open={sessionId !== null}
        onClose={close}
        title="Revoke this session?"
        description="The selected device will need to sign in again. Your current session is unaffected."
      >
        <div className={s.form}>
          <Note>This preview revokes a sample device record only.</Note>
          <div className={s.actions}>
            <Action onClick={close}>Cancel</Action>
            <Action
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (
                  await commit(
                    (prev) => ({
                      ...prev,
                      sessions: prev.sessions.filter((x) => x.id !== sessionId),
                    }),
                    'Sample session revoked.',
                  )
                )
                  close();
              }}
            >
              Revoke session
            </Action>
          </div>
        </div>
      </Modal>
      <Modal
        open={dialog === 'activity'}
        onClose={close}
        title="Account activity"
        description="Permitted account events. Times use Kenya time."
      >
        {state.activity.length ? (
          <ul className={s.activityList}>
            {state.activity.map((event) => (
              <li key={event.id}>
                <span className={`${s.dot} ${s.successDot}`} />
                <div>
                  {event.label}
                  <small>{event.time}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Activity is unavailable">Contact support for help with your account.</Empty>
        )}
      </Modal>
    </>
  );
}
