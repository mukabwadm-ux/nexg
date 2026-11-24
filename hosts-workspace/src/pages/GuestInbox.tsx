import { useEffect, useRef, useState, type FormEvent } from 'react';

import { errorMessage, sendStayChat, workspaceRequest } from '../client';
import type { StayConversation, StayThread } from '../contract';
import { dateText } from '../model';
import { maxPage, pageItems, stamp, text } from '../presentation';
import { Avatar, Badge, Button, Empty, Icon, PageHeader, Pager, Panel, Tabs } from '../ui';
import { useCompact } from '../use-compact';
import { useWorkspace } from '../workspace';
import { MessageBubble } from './Inbox';
import { InboxTabs } from './InboxTabs';
import './guest-inbox.css';

const zone = 'Africa/Nairobi';
/* New guest messages show up without a reload while the page is open. */
const pollMs = 30_000;

const placeOf = (thread: StayThread) =>
  [thread.propertyName, thread.unitName].filter(Boolean).join(' · ') || 'Unit';
const datesOf = (thread: StayThread) =>
  dateText(thread.checkIn) + ' – ' + dateText(thread.checkOut);

function preview(thread: StayThread) {
  const last = thread.lastMessage;
  if (!last) return 'No messages yet';
  const body = last.body ?? 'This message was removed.';
  return last.mine ? 'You: ' + body : body;
}

export function GuestInboxPage({ threadId }: { threadId: string }) {
  const w = useWorkspace();
  const [threads, setThreads] = useState<StayThread[] | null>(null);
  const [conversation, setConversation] = useState<StayConversation | null>(null);
  const [listError, setListError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [listPage, setListPage] = useState(1);
  const [cursor, setCursor] = useState<{ threadId: string; before: number | null }>({
    threadId: '',
    before: null,
  });
  const feed = useRef<HTMLDivElement>(null);
  const compact = useCompact();
  const listSize = compact ? 3 : 5;
  const before = cursor.threadId === threadId ? cursor.before : null;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((value) => value + 1);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    workspaceRequest<{ threads: StayThread[] }>('/stay-messages', { signal: abort.signal })
      .then((data) => {
        setThreads(data.threads);
        setListError('');
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setListError(errorMessage(failure, 'Your guest chats could not be loaded.'));
      });
    return () => abort.abort();
  }, [tick]);

  useEffect(() => {
    setThreadError('');
    if (!threadId) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ threadId });
    if (before !== null) params.set('before', String(before));
    workspaceRequest<StayConversation>('/stay-messages?' + params, { signal: abort.signal })
      .then((data) => {
        if (abort.signal.aborted) return;
        setConversation(data);
        if (before === null && data.thread.unread > 0) {
          void sendStayChat({ action: 'read', threadId })
            .then(() =>
              setThreads(
                (current) =>
                  current &&
                  current.map((item) => (item.id === threadId ? { ...item, unread: 0 } : item)),
              ),
            )
            .catch(() => {});
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setThreadError(errorMessage(failure, 'The chat could not be opened.'));
      });
    return () => abort.abort();
  }, [threadId, before, tick]);

  const opened = conversation?.thread.id === threadId && !threadError ? conversation : null;
  const lastSeq = opened?.messages.at(-1)?.seq ?? 0;
  useEffect(() => {
    if (before === null && feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [threadId, lastSeq, before]);

  const reload = () => {
    setCursor({ threadId, before: null });
    setTick((value) => value + 1);
  };
  const search = query.trim().toLowerCase();
  const shown = (threads ?? []).filter(
    (item) =>
      (tab !== 'Unread' || item.unread > 0) &&
      [item.guestName, item.propertyName, item.unitName, item.lastMessage?.body]
        .join(' ')
        .toLowerCase()
        .includes(search),
  );
  const current = Math.min(listPage, maxPage(shown.length, listSize));
  const thread = opened?.thread;
  const reservation = thread && w.data.stays.find((stay) => stay.id === thread.stayId);

  return (
    <div className="nxops-page nxops-inbox-page platform-inbox">
      <PageHeader title="Inbox" subtitle="Messages with guests who booked through NexG.">
        <Button onClick={reload}>Refresh</Button>
      </PageHeader>
      <InboxTabs value="Guests" />
      <div className={'nxops-inbox-layout' + (threadId ? ' nxops-mobile-conversation' : '')}>
        <Panel className="nxops-thread-list">
          <h2>Guests</h2>
          <label className="nxops-search nxops-thread-search">
            <Icon name="search" size={17} />
            <input
              aria-label="Search guest chats"
              placeholder="Search guests or units…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setListPage(1);
              }}
            />
          </label>
          <Tabs
            items={['All', 'Unread']}
            value={tab}
            onChange={(value) => {
              setTab(value);
              setListPage(1);
            }}
          />
          {listError && (
            <p role="alert" className="platform-error">
              {listError}
            </p>
          )}
          <div className="nxops-thread-list-items">
            {pageItems(shown, current, listSize).map((item) => (
              <a
                key={item.id}
                href={'#inbox/guests/' + item.id}
                className={'nxops-thread' + (item.id === threadId ? ' nxops-thread-selected' : '')}
                aria-current={item.id === threadId ? 'page' : undefined}
              >
                <Avatar name={item.guestName} size={38} />
                <span className="nxops-thread-copy">
                  <strong>{item.guestName}</strong>
                  <small>
                    {placeOf(item)} · {datesOf(item)}
                  </small>
                  <span>{preview(item)}</span>
                </span>
                {item.unread > 0 && <Badge tone="warning">{item.unread} unread</Badge>}
              </a>
            ))}
            {!threads && !listError && <p role="status">Loading guest chats…</p>}
            {threads && !shown.length && (
              <Empty
                title={threads.length ? 'No chats in this view' : 'No guest chats yet'}
                description={
                  threads.length
                    ? 'Change the search or filter.'
                    : 'A chat starts when a guest who booked through NexG writes to you, or when you message them from a reservation.'
                }
              />
            )}
          </div>
          {shown.length > listSize && (
            <Pager page={current} pageSize={listSize} total={shown.length} onChange={setListPage} />
          )}
        </Panel>

        <Panel className="nxops-conversation">
          {threadId && (
            <a className="nxops-text-link platform-back-to-inbox" href="#inbox/guests">
              <Icon name="left" size={15} />
              Guest chats
            </a>
          )}
          {opened ? (
            <>
              <div className="nxops-conversation-header">
                <Avatar name={opened.thread.guestName} size={40} />
                <div>
                  <h2>{opened.thread.guestName}</h2>
                  <p>
                    {placeOf(opened.thread)} · {datesOf(opened.thread)}
                  </p>
                </div>
                <Badge>{text(opened.thread.stayStatus || null)}</Badge>
              </div>
              <div ref={feed} className="nxops-message-feed platform-message-feed stay-chat-feed">
                {opened.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={{
                      id: message.id,
                      body: message.body,
                      redacted: message.redacted,
                      mine: message.mine,
                      at: message.at || null,
                      author:
                        message.author ||
                        (message.side === 'guest'
                          ? opened.thread.guestName
                          : opened.thread.hostName),
                    }}
                  />
                ))}
                {!opened.messages.length && (
                  <Empty title="No messages yet" description="Write the first message below." />
                )}
              </div>
              <div className="platform-toolbar">
                {opened.earlierBefore !== null && (
                  <Button
                    variant="ghost"
                    onClick={() => setCursor({ threadId, before: opened.earlierBefore })}
                  >
                    Earlier messages
                  </Button>
                )}
                {before !== null && (
                  <Button variant="ghost" onClick={() => setCursor({ threadId, before: null })}>
                    Latest messages
                  </Button>
                )}
              </div>
              {opened.thread.canSend ? (
                <StayReply
                  key={opened.thread.id}
                  threadId={opened.thread.id}
                  guestName={opened.thread.guestName}
                  onSent={reload}
                />
              ) : (
                <p className="stay-chat-closed">
                  This chat is closed. Chats close 30 days after check-out.
                </p>
              )}
            </>
          ) : (
            <Empty
              title={
                threadError
                  ? 'Chat unavailable'
                  : threadId
                    ? 'Opening chat…'
                    : 'Select a guest chat'
              }
              description={threadError || (threadId ? undefined : 'Choose a guest on the left.')}
            />
          )}
        </Panel>
        <Panel className="nxops-reservation-aside platform-inbox-aside">
          <h2>Stay</h2>
          {thread ? (
            <>
              <dl>
                <dt>Guest</dt>
                <dd>{thread.guestName}</dd>
                <dt>Unit</dt>
                <dd>{placeOf(thread)}</dd>
                <dt>Check-in</dt>
                <dd>{dateText(thread.checkIn)}</dd>
                <dt>Check-out</dt>
                <dd>{dateText(thread.checkOut)}</dd>
                <dt>Last message</dt>
                <dd>{stamp(thread.lastMessageAt, zone)}</dd>
              </dl>
              {reservation && (
                <Button onClick={() => w.inspect('stays', reservation.id)}>Open reservation</Button>
              )}
            </>
          ) : (
            <p>Guests who booked through NexG can message you about their stay here.</p>
          )}
          <a className="btn btn-secondary" href="#inbox/guests">
            All guest chats
          </a>
        </Panel>
      </div>
    </div>
  );
}

function StayReply({
  threadId,
  guestName,
  onSent,
}: {
  threadId: string;
  guestName: string;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  /* A retry of the same text reuses its request id, so the guest never gets it twice. */
  const pending = useRef<{ body: string; requestId: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = body.trim();
    if (!draft || busy.current) return;
    busy.current = true;
    setSending(true);
    setError('');
    if (pending.current?.body !== draft)
      pending.current = { body: draft, requestId: crypto.randomUUID() };
    try {
      await sendStayChat({
        action: 'send',
        threadId,
        body: draft,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      setBody('');
      onSent();
    } catch (failure) {
      setError(
        errorMessage(
          failure,
          'Sending could not be confirmed. Refresh or send the same message again.',
        ),
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <form className="nxops-composer platform-reply" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Reply to {guestName}</span>
        <textarea
          rows={2}
          maxLength={4000}
          required
          value={body}
          disabled={sending}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="platform-error">
          {error}
        </p>
      )}
      <div className="nxops-composer-actions">
        <Button variant="primary" type="submit" disabled={sending || !body.trim()}>
          <Icon name="send" size={17} />
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}

/* From a reservation: opens (or creates) the stay's chat with its guest and goes to it. */
export function StayChatButton({ stayId }: { stayId: string }) {
  const w = useWorkspace();
  const [opening, setOpening] = useState(false);
  return (
    <Button
      disabled={opening}
      onClick={() => {
        setOpening(true);
        sendStayChat<{ threadId: string }>({ action: 'open', stayId })
          .then((result) => w.go('inbox', 'guests', result.threadId))
          .catch((failure) => w.notify(errorMessage(failure, 'The chat could not be opened.')))
          .finally(() => setOpening(false));
      }}
    >
      <Icon name="message" />
      {opening ? 'Opening…' : 'Message guest'}
    </Button>
  );
}
