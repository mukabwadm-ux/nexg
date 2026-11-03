'use client';

import { cn } from '@nexg/ui';
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  Mail,
  UsersRound,
  UserRound,
} from 'lucide-react';
import * as React from 'react';

import type { AlertRule, Channel } from './model';
import { useDraft, useSettings } from './store';
import { Action, Badge, Card, Empty, Modal, Note, SaveBar, Switch, TextLink } from './ui';
import s from './settings.module.css';

export function NotificationsScreen({
  routing,
  onScopeChange,
  routingEditor,
}: {
  routing: boolean;
  onScopeChange: (routing: boolean) => void;
  routingEditor?: React.ReactNode;
}) {
  const { identity } = useSettings();
  return (
    <div className={s.notificationsFrame}>
      <div className={s.routingLayout}>
        <Card className={s.scopeRail}>
          <h3>Scope</h3>
          {[
            {
              business: false,
              title: 'Your account',
              subtitle: 'Your personal notifications',
              icon: UserRound,
            },
            {
              business: true,
              title: 'Business routing',
              subtitle: 'Team and location routing',
              icon: Building2,
            },
          ].map(({ business, title, subtitle, icon: Icon }) => (
            <button
              key={title}
              className={cn(s.scopeChoice, business === routing && s.scopeChoiceSelected)}
              aria-pressed={business === routing}
              aria-label={title}
              onClick={() => onScopeChange(business)}
            >
              <Icon size={24} />
              <span>
                <strong>{title}</strong>
                <small>{subtitle}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </Card>
        {identity.sample ? (
          routing ? (
            <RoutingEditor />
          ) : (
            <PersonalNotifications />
          )
        ) : routing ? (
          <Card title="Business routing" description="Current business-wide notification settings.">
            {routingEditor ? (
              <>
                <Note>
                  These routes use the existing business-wide service. Location overrides and
                  additional activity events are not connected.
                </Note>
                <div className={s.sectionGap}>{routingEditor}</div>
              </>
            ) : (
              <Empty title="Business notification settings are not available">
                <TextLink href="/merchant/support">Get help with business notifications</TextLink>
              </Empty>
            )}
          </Card>
        ) : (
          <Card title="Choose your alerts" description="These preferences affect only you.">
            <Empty title="Personal notification preferences are not available">
              Business notification rules are available in Business routing. Personal delivery
              preferences need a supported notification service.
            </Empty>
            <TextLink href="/merchant/support">Get help with notifications</TextLink>
          </Card>
        )}
      </div>
    </div>
  );
}
function AlertTable({
  rules,
  routing,
  onChange,
}: {
  rules: AlertRule[];
  routing: boolean;
  onChange: (rules: AlertRule[]) => void;
}) {
  const groups = [...new Set(rules.map((rule) => rule.group))];
  const toggle = (id: string, channel: Channel) =>
    onChange(
      rules.map((rule) =>
        rule.id !== id
          ? rule
          : {
              ...rule,
              channels: rule.channels.includes(channel)
                ? rule.channels.filter((c) => c !== channel)
                : [...rule.channels, channel],
            },
      ),
    );
  return (
    <div className={s.tableWrap}>
      <table className={cn(s.table, s.notificationTable, !routing && s.personalTable)}>
        <thead>
          <tr>
            <th>Event</th>
            {routing ? (
              <>
                <th>Send to</th>
                <th>Channels</th>
              </>
            ) : (
              <>
                <th>In-app</th>
                <th>Email</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <React.Fragment key={group}>
              <tr className={s.groupRow}>
                {routing ? (
                  <th colSpan={3} scope="colgroup">
                    {group}
                  </th>
                ) : (
                  <>
                    <th scope="rowgroup">{group}</th>
                    <th scope="col">In-app</th>
                    <th scope="col">Email</th>
                  </>
                )}
              </tr>
              {rules
                .filter((rule) => rule.group === group)
                .map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.label}</strong>
                      <p>{rule.description}</p>
                    </td>
                    {routing ? (
                      <>
                        <td>
                          <select
                            className={s.control}
                            value={rule.recipient}
                            aria-label={`${rule.label} recipient`}
                            onChange={(e) =>
                              onChange(
                                rules.map((r) =>
                                  r.id === rule.id ? { ...r, recipient: e.target.value } : r,
                                ),
                              )
                            }
                          >
                            {['Reception team', 'Retail team', 'Branch manager'].map((name) => (
                              <option key={name}>{name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className={s.channels}>
                            {(['In-app', 'Email'] as const).map((channel) => (
                              <button
                                key={channel}
                                className={cn(
                                  s.channel,
                                  rule.channels.includes(channel) && s.channelSelected,
                                )}
                                aria-pressed={rule.channels.includes(channel)}
                                aria-label={`${rule.label} ${channel}`}
                                onClick={() => toggle(rule.id, channel)}
                              >
                                {rule.channels.includes(channel) && <Check size={16} />}
                                <span>{channel}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </>
                    ) : (
                      (['In-app', 'Email'] as const).map((channel) => (
                        <td key={channel} data-channel={channel}>
                          <Switch
                            label={`${rule.label} ${channel}`}
                            checked={rule.channels.includes(channel)}
                            onChange={() => toggle(rule.id, channel)}
                          />
                        </td>
                      ))
                    )}
                  </tr>
                ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PersonalNotifications() {
  const { state, identity, commit, busy } = useSettings();
  const saved = React.useMemo(
    () => ({ alerts: state.alerts, quiet: state.quiet }),
    [state.alerts, state.quiet],
  );
  const { draft, setDraft, dirty, reset } = useDraft(saved);
  const [destination, setDestination] = React.useState(false);
  const [policy, setPolicy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [testSent, setTestSent] = React.useState(false);
  async function save() {
    if (
      draft.quiet.enabled &&
      (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.quiet.from) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.quiet.to) ||
        draft.quiet.from === draft.quiet.to)
    ) {
      setError('Choose different start and end times for quiet hours.');
      return;
    }
    setError('');
    await commit(
      (prev) => ({ ...prev, alerts: draft.alerts, quiet: draft.quiet }),
      'Personal notification preferences saved.',
    );
  }
  return (
    <div>
      <div className={s.stack}>
        <Card title="Choose your alerts" description="These preferences affect only you.">
          <div className={`${s.inset} ${s.destination}`}>
            <div className={s.between}>
              <span className={s.inline}>
                <Mail size={24} />
                <span>
                  <span className={s.small}>Notification destination</span>
                  <br />
                  <strong>{identity.email}</strong> ·{' '}
                  <span className={s.verified}>
                    <CheckCircle2 size={14} /> Verified
                  </span>
                </span>
              </span>
              <TextLink onClick={() => setDestination(true)}>Manage destination</TextLink>
            </div>
          </div>
          <AlertTable
            rules={draft.alerts}
            routing={false}
            onChange={(alerts) => setDraft({ ...draft, alerts })}
          />
        </Card>
        <Card className={s.quietCard}>
          <div className={s.quiet}>
            <Switch
              label="Quiet hours"
              checked={draft.quiet.enabled}
              caption={false}
              onChange={(enabled) => setDraft({ ...draft, quiet: { ...draft.quiet, enabled } })}
            />
            <div className={s.quietContent}>
              <h3>Quiet hours</h3>
              <p className={s.muted}>Reduce non-urgent notifications during a set time each day.</p>
              <div className={s.quietFields}>
                <label className={s.field}>
                  From
                  <span className={s.timeInput}>
                    <input
                      aria-label="Quiet hours from"
                      type="text"
                      inputMode="numeric"
                      placeholder="22:00"
                      maxLength={5}
                      value={draft.quiet.from}
                      disabled={!draft.quiet.enabled}
                      onChange={(e) =>
                        setDraft({ ...draft, quiet: { ...draft.quiet, from: e.target.value } })
                      }
                    />
                    <Clock3 size={16} aria-hidden="true" />
                  </span>
                </label>
                <label className={s.field}>
                  To
                  <span className={s.timeInput}>
                    <input
                      aria-label="Quiet hours to"
                      type="text"
                      inputMode="numeric"
                      placeholder="07:00"
                      maxLength={5}
                      value={draft.quiet.to}
                      disabled={!draft.quiet.enabled}
                      onChange={(e) =>
                        setDraft({ ...draft, quiet: { ...draft.quiet, to: e.target.value } })
                      }
                    />
                    <Clock3 size={16} aria-hidden="true" />
                  </span>
                </label>
                <span className={s.muted}>
                  Kenya time · EAT
                  <br />
                  {draft.quiet.from}–{draft.quiet.to}
                  {draft.quiet.to < draft.quiet.from ? ', next day' : ''}
                </span>
              </div>
              <div className={`${s.between} ${s.quietPolicy}`}>
                <p className={s.small}>
                  <Info size={16} aria-hidden="true" />
                  Quiet hours apply to optional alerts. Required notices follow account policy.
                </p>
                <TextLink onClick={() => setPolicy(true)}>Review notice types</TextLink>
              </div>
            </div>
          </div>
          {error && (
            <div className={s.sectionGap}>
              <Note tone="danger">{error}</Note>
            </div>
          )}
        </Card>
      </div>
      <SaveBar
        dirty={dirty}
        scope="Your account"
        onSave={() => void save()}
        onCancel={() => {
          reset();
          setError('');
        }}
      />
      <Modal
        open={destination}
        onClose={() => setDestination(false)}
        title="Notification destination"
        description="Verification and message delivery are separate from preference saves."
      >
        <div className={s.form}>
          <p>
            {identity.email} <Badge tone="success">Verified in sample</Badge>
          </p>
          <Note>
            No message is sent by this preview. Real destinations must be verified through the
            notification owner.
          </Note>
          {testSent && (
            <Note tone="success">Sample test queued. This does not confirm real delivery.</Note>
          )}
          <div className={s.actions}>
            <Action onClick={() => setDestination(false)}>Done</Action>
            <Action loading={busy} onClick={() => setTestSent(true)}>
              Send sample test
            </Action>
          </div>
        </div>
      </Modal>
      <DeliveryPolicy open={policy} onClose={() => setPolicy(false)} />
    </div>
  );
}
function RoutingEditor() {
  const { state, commit } = useSettings();
  const { draft, setDraft, dirty, reset } = useDraft(state.routingRules);
  const [policy, setPolicy] = React.useState(false);
  return (
    <div>
      <div className={s.stack}>
        <Card
          title="Business routing"
          description="Route work alerts to the right team at this location."
          action={<Badge tone="info">Location · Kilimani</Badge>}
        >
          <Note>Changes affect team routing at Kilimani. Personal preferences stay separate.</Note>
          <div style={{ margin: '12px 0' }}>
            <AlertTable rules={draft} routing onChange={setDraft} />
          </div>
          <Note>
            Routing does not grant team access. Recipient access and supported destinations are
            checked when you save.
          </Note>
        </Card>
        <Card>
          <div className={s.between}>
            <span className={s.inline}>
              <FileText size={24} />
              <span>
                <strong>Delivery rules</strong>
                <br />
                <span className={s.small}>
                  Personal quiet hours and required-notice rules are applied by the notification
                  policy.
                </span>
              </span>
            </span>
            <TextLink onClick={() => setPolicy(true)}>Review delivery policy</TextLink>
          </div>
          <hr className={s.divider} />
          <div className={s.between}>
            <span className={s.inline}>
              <UsersRound size={22} />
              Recipients are managed in Business → Team.
            </span>
            <TextLink href="/merchant/team">Manage team</TextLink>
          </div>
        </Card>
      </div>
      <SaveBar
        dirty={dirty}
        scope="Kilimani routing"
        label="Save routing"
        onCancel={reset}
        onSave={() => {
          void commit((prev) => ({ ...prev, routingRules: draft }), 'Kilimani routing saved.');
        }}
      />
      <DeliveryPolicy open={policy} onClose={() => setPolicy(false)} />
    </div>
  );
}
function DeliveryPolicy({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delivery policy"
      description="Preferences do not guarantee message delivery."
    >
      <div className={s.form}>
        <p>
          Optional alerts respect the applicable quiet-hours policy. Required notices use their
          approved delivery rules.
        </p>
        <p>
          Routing does not change opening hours, work deadlines or team permissions. Supported
          destinations and recipient access must remain valid.
        </p>
        <Note>
          This sample establishes no mandatory-notice exception, delivery guarantee or escalation
          deadline.
        </Note>
        <Action onClick={onClose}>Done</Action>
      </div>
    </Modal>
  );
}
