import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/rate-limits');

export default function RateLimitsPage() {
  return (
    <DocPage
      href="/docs/rate-limits"
      toc={[
        { id: 'bucket', label: 'The token bucket' },
        { id: 'costs', label: 'What requests cost' },
        { id: 'whose', label: 'Whose bucket' },
        { id: 'example', label: 'An example' },
        { id: 'limited', label: 'When you are limited' },
      ]}
    >
      <H2 id="bucket">The token bucket</H2>
      <P>
        Each caller has a bucket of tokens that refills steadily, every second, up to a ceiling.
        Every request spends tokens; when there are not enough left, the request is refused with{' '}
        <C>429</C> until the bucket has refilled enough. The bucket is kept in NexG&apos;s
        database, so the limit holds across every server answering you.
      </P>
      <P>
        The refill rate is the key&apos;s limit in tokens per minute, set when the key is issued:
        10 to 600, with 60 as the console&apos;s default. The bucket holds one minute&apos;s worth,
        so a quiet caller can spend a minute&apos;s tokens in a burst.
      </P>

      <H2 id="costs">What requests cost</H2>
      <Table
        head={['Request', 'Scope', 'Tokens']}
        rows={[
          ['Public reads: merchants, zones, experiences, services', <C key="s">public_read</C>, '1'],
          ['Reading your orders', <C key="s">merchant_read</C>, '3'],
          ['Booking a service (coming soon)', <C key="s">merchant_write</C>, '5'],
        ]}
      />

      <H2 id="whose">Whose bucket</H2>
      <List>
        <li>
          <strong className="text-ink">A merchant key</strong> spends from its merchant&apos;s
          bucket, shared by all of that merchant&apos;s keys. It refills at the lowest limit among
          the merchant&apos;s active keys.
        </li>
        <li>
          <strong className="text-ink">A key without a merchant</strong> spends from the bucket
          of the person who issued it, shared by all of their keys without a merchant.
        </li>
        <li>
          <strong className="text-ink">No key</strong>: keyless callers share one bucket of 120
          tokens a minute (or get 60 a minute for each address, where NexG identifies callers by IP
          at its edge). Fine for trying things, not for production.
        </li>
      </List>
      <P>
        So issuing more keys does not add capacity, and replacing a key does not refill the
        bucket. To raise a merchant&apos;s limit, issue a key with a higher limit and have the
        lower ones revoked.
      </P>

      <H2 id="example">An example</H2>
      <P>
        A merchant key at the default 60 tokens a minute can make 60 public reads a minute, or 20
        order reads, or any mix. Polling orders once a minute costs 3, leaving 57 for catalogue
        reads.
      </P>

      <H2 id="limited">When you are limited</H2>
      <P>
        A refused request gets <C>429</C> with code <C>rate_limited</C> and a{' '}
        <C>Retry-After</C> header: the whole seconds until enough tokens are back for that
        request. Wait at least that long before retrying. Retrying sooner is refused again and
        spends nothing, but it does not help.
      </P>
      <List>
        <li>Spread scheduled work out instead of running it all on the minute.</li>
        <li>Cache public data on your side; it is cacheable for a minute or more anyway.</li>
        <li>Page through lists one page at a time rather than in parallel.</li>
      </List>
      <Callout tone="note" title="No remaining-token header yet">
        <p>
          Responses do not say how many tokens are left. Track your own rate, and treat{' '}
          <C>Retry-After</C> as the answer when you hit the limit. See{' '}
          <A href="/docs/errors">Errors</A> for retry code.
        </p>
      </Callout>
    </DocPage>
  );
}
