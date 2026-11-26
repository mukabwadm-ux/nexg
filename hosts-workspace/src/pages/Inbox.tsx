import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';

import { errorMessage, sendSupport, workspaceRequest } from '../client';
import type { SupportConversation, SupportInbox, SupportMessage } from '../contract';
import { maxPage, pageItems, stamp, text } from '../presentation';
import { Avatar, Badge, Button, Empty, Icon, PageHeader, Pager, Panel, Tabs } from '../ui';
import { useCompact } from '../use-compact';
import { useWorkspace } from '../workspace';
import { StartSupportForm, SupportReply } from './SupportComposer';

const zone = 'Africa/Nairobi';

export function SupportInboxPage({ routeId }: { routeId: string }) {
  const { section, data, unitLabel } = useWorkspace();
  const unit = data.units.find(item => item.id === section);
  const [inbox, setInbox] = useState<SupportInbox | null>(null);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [inboxError, setInboxError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [threadPage, setThreadPage] = useState(1);
  const [messagePage, setMessagePage] = useState(1);
  const [cursor, setCursor] = useState<{ threadId: string; before: number | null }>({
    threadId: '',
    before: null,
  });
  const compact = useCompact();
  const threadSize = compact ? 3 : 5;
  const messageSize = compact ? 1 : 2;
  const compose = routeId === 'new';
  const before = cursor.threadId === routeId ? cursor.before : null;

  useEffect(() => {
    const abort = new AbortController();
    setInboxError('');
    workspaceRequest<SupportInbox>('/support', { signal: abort.signal })
      .then(setInbox)
      .catch((failure) => {
        if (!abort.signal.aborted)
          setInboxError(errorMessage(failure, 'Your support inbox could not be loaded.'));
      });
    return () => abort.abort();
  }, [refresh]);

  useEffect(() => {
    setConversation(null);
    setThreadError('');
    if (!routeId || compose) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ thread: routeId });
    if (before !== null) params.set('before', String(before));
    workspaceRequest<SupportConversation>('/support?' + params, { signal: abort.signal })
      .then((data) => {
        if (abort.signal.aborted) return;
        setConversation(data);
        setMessagePage(maxPage(data.messages.length, messageSize));
        if (before === null && data.thread.unread > 0) {
          void sendSupport({ action: 'read', threadId: routeId })
            .then(() =>
              setInbox(
                (current) =>
                  current && {
                    ...current,
                    threads: current.threads.map((thread) =>
                      thread.id === routeId ? { ...thread, unread: 0 } : thread,
                    ),
                  },
              ),
            )
            .catch(() => {});
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setThreadError(errorMessage(failure, 'The conversation could not be opened.'));
      });
    return () => abort.abort();
  }, [routeId, compose, before, refresh, messageSize]);

  const reload = () => {
    setCursor({ threadId: routeId, before: null });
    setRefresh((value) => value + 1);
  };
  const threads = (inbox?.threads ?? []).filter(
    (thread) =>
      (tab !== 'Unread' || thread.unread > 0) &&
      (thread.subject + ' ' + (thread.lastMessage ?? ''))
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const current = Math.min(threadPage, maxPage(threads.length, threadSize));
  const opened = conversation?.thread.id === routeId ? conversation : null;
  const currentMessagePage = Math.min(
    messagePage,
    maxPage(opened?.messages.length ?? 0, messageSize),
  );
  const thread = opened?.thread;
  const topicLabel =
    inbox?.topics.find((item) => item.value === thread?.topic)?.label ??
    text(thread?.topic ?? null);

  return (
    <div className="nxops-page nxops-inbox-page platform-inbox">
      <PageHeader title="Inbox" subtitle="Messages with NexG support.">
        <a className="btn" href="#support-tickets">Support ticket history</a>
        <Button onClick={reload}>Refresh</Button>
        <a className="btn btn-primary" href="#inbox/new">
          <Icon name="add" size={17} />
          New conversation
        </a>
      </PageHeader>
      <div className={'nxops-inbox-layout' + (routeId ? ' nxops-mobile-conversation' : '')}>
        <Panel className="nxops-thread-list">
          <h2>NexG support</h2>
          <label className="nxops-search nxops-thread-search">
            <Icon name="search" size={17} />
            <input
              aria-label="Search messages"
              placeholder="Search messages…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setThreadPage(1);
              }}
            />
          </label>
          <Tabs
            items={['All', 'Unread']}
            value={tab}
            onChange={(value) => {
              setTab(value);
              setThreadPage(1);
            }}
          />
          {inboxError && (
            <p role="alert" className="platform-error">
              {inboxError}
            </p>
          )}
          <div className="nxops-thread-list-items">
            {pageItems(threads, current, threadSize).map((item) => (
              <a
                key={item.id}
                href={'#inbox/' + item.id}
                className={'nxops-thread' + (item.id === routeId ? ' nxops-thread-selected' : '')}
                aria-current={item.id === routeId ? 'page' : undefined}
              >
                <Avatar name={item.subject} size={38} />
                <span className="nxops-thread-copy">
                  <strong>{item.subject}</strong>
                  <small>{text(item.status)}</small>
                  <span>{item.lastMessage ?? 'Open conversation'}</span>
                </span>
                {item.unread > 0 && <Badge tone="warning">{item.unread} unread</Badge>}
              </a>
            ))}
            {!inbox && !inboxError && <p role="status">Loading support conversations…</p>}
            {inbox && !threads.length && (
              <Empty
                title="No conversations in this view"
                description="Start a conversation when you need help."
              />
            )}
          </div>
          {threads.length > threadSize && (
            <Pager
              page={current}
              pageSize={threadSize}
              total={threads.length}
              onChange={setThreadPage}
            />
          )}
        </Panel>

        <Panel className="nxops-conversation">
          {routeId && (
            <a className="nxops-text-link platform-back-to-inbox" href="#inbox">
              <Icon name="left" size={15} />
              Conversations
            </a>
          )}
          {compose ? (
            <>
              <div className="nxops-conversation-header">
                <div>
                  <h2>Write to NexG</h2>
                  <p>Choose a topic and tell us what you need.</p>
                </div>
              </div>
              {inbox ? (
                <StartSupportForm
                  key={unit?.id ?? 'support'}
                  topics={inbox.topics}
                  initialSubject={unit ? 'Question about ' + unitLabel(unit.id) : ''}
                  initialTopic={unit ? 'my_order' : undefined}
                  onSent={(id) => {
                    window.location.hash = 'inbox/' + id;
                    setRefresh((value) => value + 1);
                  }}
                />
              ) : (
                <p role="status">{inboxError || 'Loading support topics…'}</p>
              )}
            </>
          ) : opened ? (
            <>
              <div className="nxops-conversation-header">
                <Avatar name={opened.thread.subject} size={40} />
                <div>
                  <h2>{opened.thread.subject}</h2>
                  <p>{topicLabel}</p>
                </div>
                <Badge>{text(opened.thread.status)}</Badge>
              </div>
              <div className="nxops-message-feed platform-message-feed">
                {pageItems(opened.messages, currentMessagePage, messageSize).map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {!opened.messages.length && <Empty title="No visible messages" />}
              </div>
              <div className="platform-toolbar">
                {opened.earlierBefore !== null && (
                  <Button
                    variant="ghost"
                    onClick={() => setCursor({ threadId: routeId, before: opened.earlierBefore })}
                  >
                    Earlier messages
                  </Button>
                )}
                {before !== null && (
                  <Button
                    variant="ghost"
                    onClick={() => setCursor({ threadId: routeId, before: null })}
                  >
                    Latest messages
                  </Button>
                )}
                {opened.messages.length > messageSize && (
                  <Pager
                    page={currentMessagePage}
                    pageSize={messageSize}
                    total={opened.messages.length}
                    onChange={setMessagePage}
                  />
                )}
              </div>
              <SupportReply key={opened.thread.id} threadId={opened.thread.id} onSent={reload} />
            </>
          ) : (
            <Empty
              title={
                threadError
                  ? 'Conversation unavailable'
                  : routeId
                    ? 'Opening conversation…'
                    : 'Select a conversation'
              }
              description={
                threadError ||
                (routeId ? undefined : 'Choose a thread or start a new one with NexG support.')
              }
            />
          )}
        </Panel>
        <Panel className="nxops-reservation-aside platform-inbox-aside">
          <h2>NexG support</h2>
          <p>Send your question to the right team and find replies in this conversation.</p>
          {thread && (
            <dl>
              <dt>Topic</dt>
              <dd>{topicLabel}</dd>
              <dt>Last message</dt>
              <dd>{stamp(thread.lastAt, zone)}</dd>
            </dl>
          )}
          <a className="btn btn-secondary" href="#inbox">
            All conversations
          </a>
        </Panel>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: SupportMessage }) {
  const [part, setPart] = useState(1);
  const body = message.redacted
    ? 'This message was removed.'
    : message.body || 'Message unavailable.';
  const letters = Array.from(body);
  const chunkSize = 420;
  const long = letters.length > 170;
  return (
    <article className={'nxops-message' + (message.mine ? ' nxops-message-own' : '')}>
      <div className="nxops-message-meta">
        <strong>{message.mine ? 'You' : message.author || 'NexG support'}</strong>
        <time dateTime={message.at ?? undefined}>{stamp(message.at, zone)}</time>
      </div>
      <div className="nxops-message-bubble">
        <p>{long ? letters.slice(0, 170).join('') + '…' : body}</p>
        {long && (
          <Dialog.Root
            onOpenChange={(open) => {
              if (open) setPart(1);
            }}
          >
            <Dialog.Trigger className="nxops-text-link">Read full message</Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="platform-dialog-overlay" />
              <Dialog.Content className="platform-dialog">
                <Dialog.Title>Message</Dialog.Title>
                <Dialog.Description>
                  {pageItems(letters, part, chunkSize).join('')}
                </Dialog.Description>
                {letters.length > chunkSize && (
                  <Pager
                    page={part}
                    pageSize={chunkSize}
                    total={letters.length}
                    onChange={setPart}
                  />
                )}
                <Dialog.Close className="btn btn-secondary">Close</Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
    </article>
  );
}
