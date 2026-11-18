import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Strong, Table } from '@/components/docs/prose';
import { EVENT_EXAMPLE, EVENT_REQUEST, VERIFY_EVENT } from '@/lib/reference/events';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/events');

export default function EventsPage() {
  return (
    <DocPage
      href="/docs/events"
      toc={[
        { id: 'overview', label: 'How it works' },
        { id: 'endpoints', label: 'Adding an endpoint' },
        { id: 'types', label: 'Event types' },
        { id: 'event', label: 'An event' },
        { id: 'status', label: 'Status and stage' },
        { id: 'verifying', label: 'Verifying' },
        { id: 'answering', label: 'Answering and retries' },
        { id: 'duplicates', label: 'Duplicates and order' },
        { id: 'testing', label: 'Testing' },
      ]}
    >
      <H2 id="overview">How it works</H2>
      <P>
        When one of your bookings is created or its status changes, NexG posts an event to your
        server. You stop polling <C>GET /v1/orders</C> and hear about changes as they happen,
        usually within a minute.
      </P>
      <List ordered>
        <li>You add an endpoint, an https address on your server, in the developer console.</li>
        <li>NexG shows you the endpoint&apos;s signing secret once. Keep it on your server.</li>
        <li>NexG posts each event as JSON, signed with that secret.</li>
        <li>Your server checks the signature, answers 2xx, and then acts on the event.</li>
      </List>

      <H2 id="endpoints">Adding an endpoint</H2>
      <P>
        In the <A href="/developers">developer console</A>, under Webhooks, choose the merchant,
        Live or Test, and the address. Only the merchant&apos;s owner can add, switch off or remove
        its endpoints.
      </P>
      <List>
        <li>
          The address must be <C>https</C> on a public host name: no IP address, no
          <C>localhost</C>, no port other than 443, and no user name or password in it. To receive
          events on your own computer, use a tunnel with a public https address.
        </li>
        <li>
          A <Strong>live</Strong> endpoint receives events for real bookings. A{' '}
          <Strong>test</Strong> endpoint receives events for bookings made with a{' '}
          <A href="/docs/environments#test-keys">test key</A>.
        </li>
        <li>A merchant can have five endpoints in each environment; each receives every event.</li>
        <li>
          Switching an endpoint off drops the events waiting for it. Removing it also deletes its
          secret and its delivery history.
        </li>
      </List>

      <H2 id="types">Event types</H2>
      <Table
        head={['Type', 'Sent when', 'data']}
        rows={[
          [
            <C key="t">booking.created</C>,
            'A booking is placed with your merchant: through the API, on nexgapp.com or anywhere else.',
            <C key="d">booking</C>,
          ],
          [
            <C key="t">booking.status_changed</C>,
            'A booking’s status changes, for example from requested to confirmed.',
            <span key="d">
              <C>booking</C>, <C>previous_status</C>, <C>previous_stage</C>
            </span>,
          ],
          [
            <C key="t">booking.stage_changed</C>,
            'A booking’s stage changes inside the same status: preparing to ready, or a ride or courier going from picked_up to arriving.',
            <span key="d">
              <C>booking</C>, <C>previous_stage</C>
            </span>,
          ],
          [
            <C key="t">booking.rider_assigned</C>,
            'A rider takes the booking’s delivery job, and again when another rider takes over. Nothing about the rider is sent yet.',
            <span key="d">
              <C>booking</C>, <C>assigned_at</C>
            </span>,
          ],
          [
            <C key="t">ping</C>,
            'You press Send test event in the console.',
            <span key="d">
              <C>endpoint_id</C>, <C>message</C>
            </span>,
          ],
        ]}
      />
      <P>
        Ignore types you do not know: new ones are added without notice, and an unknown type is
        not an error.
      </P>

      <H2 id="event">An event</H2>
      <P>
        Every event has an <C>id</C> that stays the same on every retry, a <C>type</C>, the{' '}
        <C>environment</C> it belongs to, and <C>data</C>. A booking in an event is the same
        object <A href="/docs/reference/get-order">GET /v1/orders/{'{id}'}</A> returns, so one
        parser reads both.
      </P>
      <CodeBlock className="mt-6" code={EVENT_REQUEST} language="http" title="Request" maxHeight />
      <CodeBlock
        className="mt-6"
        code={JSON.stringify(EVENT_EXAMPLE, null, 2)}
        language="json"
        title="Body"
        maxHeight
      />

      <H2 id="status">Status and stage</H2>
      <P>
        A booking&apos;s <C>status</C> is one of five words that mean the same for every kind of
        booking. Its <C>stage</C> says where it is in its own workflow. Act on the status; show the
        stage when you want the detail.
      </P>
      <Table
        head={['Status', 'Meaning', 'Stages today']}
        rows={[
          [<C key="s">requested</C>, 'Placed, not yet accepted.', 'placed'],
          [<C key="s">confirmed</C>, 'Accepted and being got ready.', 'confirmed, preparing, ready'],
          [<C key="s">in_progress</C>, 'Under way.', 'picked_up, arriving'],
          [
            <C key="s">completed</C>,
            'Done. A later dispute or refund keeps it completed; payment_status says what happened.',
            'delivered, disputed, refunded',
          ],
          [<C key="s">cancelled</C>, 'Will not happen.', 'cancelled'],
        ]}
      />
      <P>
        Every stage change sends exactly one event: <C>booking.status_changed</C> when the status
        changes too, <C>booking.stage_changed</C> when it does not. If you only act on statuses,
        you can ignore <C>booking.stage_changed</C>.
      </P>

      <H2 id="verifying">Verifying</H2>
      <P>Every request carries the signature in one header:</P>
      <CodeBlock
        className="mt-4"
        code={'NexG-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">'}
        language="http"
        title="Header"
      />
      <List>
        <li>
          Compute HMAC-SHA256 of <C>t</C>, a dot and the raw request body, keyed with your
          endpoint&apos;s signing secret, and compare it with <C>v1</C> in constant time.
        </li>
        <li>
          Use the body exactly as it arrived, before any JSON parsing: parsing and serialising again
          can change spacing and break the signature.
        </li>
        <li>
          Refuse a <C>t</C> more than five minutes from your clock, so an old event cannot be
          replayed. Each attempt is signed afresh.
        </li>
      </List>
      <CodeTabs className="mt-6" samples={VERIFY_EVENT} title="Verifying an event" />
      <P>
        It is the same scheme banks use to <A href="/docs/webhooks">call NexG</A>, with NexG&apos;s
        header name.
      </P>

      <H2 id="answering">Answering and retries</H2>
      <P>
        Answer with any 2xx within 10 seconds, before doing slow work: store the event, answer,
        then process it. Anything else, an error, or no answer in time, and NexG tries again after
        1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, 12 hours and 24 hours. After eight
        attempts, about two days, the delivery is marked failed. The console lists each
        endpoint&apos;s recent deliveries with the answer it gave.
      </P>
      <Callout tone="note" title="Events are a signal, not the record">
        <p>
          If your server was down for longer than the retries, nothing is lost: read{' '}
          <A href="/docs/reference/list-orders">GET /v1/orders</A>, which always has the current
          state of every booking.
        </p>
      </Callout>

      <H2 id="duplicates">Duplicates and order</H2>
      <List>
        <li>
          An event can arrive more than once, for example when your answer was lost. Record each{' '}
          <C>id</C> and skip one you have already handled.
        </li>
        <li>
          Events can arrive out of order. Compare <C>created_at</C>, or read the booking when the
          order matters.
        </li>
      </List>

      <H2 id="testing">Testing</H2>
      <List>
        <li>
          Press <Strong>Send test event</Strong> in the console to post a <C>ping</C> to an
          endpoint and check your signature code.
        </li>
        <li>
          With a test endpoint, book with a test key: the sandbox booking sends{' '}
          <C>booking.created</C> to your test endpoints, never to live ones.
        </li>
        <li>
          Then <A href="/docs/environments#moving-test-bookings">move the test booking</A> by
          status or by stage, and give a test ride or courier a test rider. Each move sends{' '}
          <C>booking.status_changed</C> or <C>booking.stage_changed</C>, and a rider{' '}
          <C>booking.rider_assigned</C>. The console&apos;s <Strong>Test bookings</Strong> card
          does all of it without code.
        </li>
        <li>Never use a live endpoint&apos;s secret in a test, or the other way round.</li>
      </List>
    </DocPage>
  );
}
