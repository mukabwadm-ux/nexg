import { useRef, useState, type FormEvent } from 'react';

import { errorMessage, sendSupport } from '../client';
import type { SupportInbox } from '../contract';
import { Button, Icon } from '../ui';

export function StartSupportForm({
  topics,
  initialSubject = '',
  initialTopic,
  onSent,
}: {
  topics: SupportInbox['topics'];
  initialSubject?: string;
  initialTopic?: string;
  onSent: (threadId: string) => void;
}) {
  const [topic, setTopic] = useState(
    topics.find((item) => item.value === initialTopic)?.value ?? topics[0]?.value ?? '',
  );
  const [subject, setSubject] = useState(initialSubject.slice(0, 160));
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !subject.trim() || !body.trim() || !topic) return;
    busy.current = true;
    setSending(true);
    setError('');
    try {
      const result = await sendSupport<{ threadId: string }>({
        action: 'start',
        topic,
        subject,
        body,
      });
      onSent(result.threadId);
    } catch (failure) {
      setError(
        errorMessage(
          failure,
          'Sending could not be confirmed. Check your inbox before trying again.',
        ),
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <form className="platform-support-form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Topic</span>
        <select required value={topic} onChange={(event) => setTopic(event.target.value)}>
          {topics.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Subject</span>
        <input
          required
          maxLength={160}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea
          required
          maxLength={4000}
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="platform-error">
          {error}
        </p>
      )}
      <div className="platform-toolbar">
        <Button variant="primary" type="submit" disabled={sending || !topic}>
          <Icon name="message" size={17} />
          {sending ? 'Sending…' : 'Send to NexG'}
        </Button>
        <a className="btn btn-secondary" href="#inbox">
          Cancel
        </a>
      </div>
    </form>
  );
}

export function SupportReply({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
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
      await sendSupport({
        action: 'reply',
        threadId,
        body: draft,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      setBody('');
      onSent();
    } catch (failure) {
      setError(
        errorMessage(failure, 'Sending could not be confirmed. Refresh or retry the same reply.'),
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <form className="nxops-composer platform-reply" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Reply to NexG</span>
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
          {sending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  );
}
