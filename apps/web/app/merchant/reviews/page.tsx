import { Panel, Row, Tile } from '@/components/merchant/bits';
import { ReviewReply } from '@/components/merchant/board-client';
import { MerchantPage, merchantContext } from '@/components/merchant/frame';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

interface RatingRow {
  id: string;
  branch_name: string | null;
  order_reference: string | null;
  stars: number;
  comment: string | null;
  themes: string[] | null;
  reply_body: string | null;
  reply_status: string;
  created_at: string;
  guest_first_name: string | null;
  needs_a_reply: boolean;
}

interface Stats {
  ratings: number;
  average: number | null;
  five_star: number;
  low_ratings: number;
  replied: number;
  unanswered: number;
  one: number | null;
  two: number | null;
  three: number | null;
  four: number | null;
  five: number | null;
}

/** Enough ratings for a share to mean something. */
const ENOUGH = 20;

/**
 * What guests said about delivered orders.
 *
 * Replies are moderated and the page says so before somebody
 * writes one, because a reply that silently never appears is
 * worse than no reply button at all.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  const supabase = createClient();
  const [ratingRes, statRes] = await Promise.all([
    supabase
      .from('merchant_rating_v')
      .select('*')
      .eq('merchant_id', m.merchant_id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('merchant_review_stats_v')
      .select('*')
      .eq('merchant_id', m.merchant_id)
      .maybeSingle(),
  ]);

  const all = (ratingRes.data as RatingRow[] | null) ?? [];
  const s = (statRes.data as Stats | null) ?? {
    ratings: 0,
    average: null,
    five_star: 0,
    low_ratings: 0,
    replied: 0,
    unanswered: 0,
    one: 0,
    two: 0,
    three: 0,
    four: 0,
    five: 0,
  };

  const tab = searchParams?.tab ?? 'all';
  const rows =
    tab === 'unanswered'
      ? all.filter((r) => r.needs_a_reply)
      : tab === 'low'
        ? all.filter((r) => r.stars <= 3)
        : all;

  const dist = [
    ['1★', s.one ?? 0],
    ['2★', s.two ?? 0],
    ['3★', s.three ?? 0],
    ['4★', s.four ?? 0],
    ['5★', s.five ?? 0],
  ] as [string, number][];
  const distMax = Math.max(1, ...dist.map(([, n]) => n));

  /* What guests keep mentioning, from the stored themes. These
     are tagged at write time rather than guessed here, so the
     counts cannot drift from the rule that produced them. */
  const mentions = new Map<string, number>();
  for (const r of all) for (const t of r.themes ?? []) mentions.set(t, (mentions.get(t) ?? 0) + 1);

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/reviews"
      title="Reviews"
      lead="Ratings and comments guests leave on delivered orders. Reply publicly — replies are moderated before they appear — or fix the cause."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Rating"
          value={s.average === null ? '—' : `${s.average} ★`}
          note={`${s.ratings} rating${s.ratings === 1 ? '' : 's'}`}
        />
        <Tile
          label="5★ share"
          value={
            s.ratings >= ENOUGH ? `${Math.round(((s.five ?? 0) / s.ratings) * 100)}%` : '—'
          }
          note={s.ratings >= ENOUGH ? 'of all ratings' : `needs ${ENOUGH} ratings`}
        />
        <Tile
          label="Low ratings"
          value={String(s.low_ratings)}
          note="3★ and below"
          noteTone={s.low_ratings > 0 ? 'gold' : 'good'}
        />
        <Tile
          label="Replied"
          value={s.ratings > 0 ? `${Math.round((s.replied / s.ratings) * 100)}%` : '—'}
          note={s.unanswered > 0 ? `${s.unanswered} unanswered` : 'all answered'}
          noteTone={s.unanswered > 0 ? 'gold' : 'good'}
        />
        <Tile
          label="Most mentioned"
          value={
            mentions.size > 0
              ? ([...mentions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—')
              : '—'
          }
          note={mentions.size > 0 ? 'across comments' : 'no themes yet'}
        />
      </div>

      <div className="border-border-strong bg-bg inline-flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
        {[
          { k: 'all', l: 'All', n: all.length },
          { k: 'unanswered', l: 'Unanswered', n: all.filter((r) => r.needs_a_reply).length },
          { k: 'low', l: '3★ and below', n: all.filter((r) => r.stars <= 3).length },
        ].map((t) => (
          <a
            key={t.k}
            href={t.k === 'all' ? '/merchant/reviews' : `/merchant/reviews?tab=${t.k}`}
            aria-current={tab === t.k ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold ${
              tab === t.k ? 'bg-ink text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {t.l}
            <span className="ml-1.5 opacity-70">{t.n}</span>
          </a>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Recent reviews">
            {rows.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                No ratings yet. A guest is asked once after a delivery and never chased.
              </p>
            ) : (
              <div className="divide-border divide-y">
                {rows.map((r) => (
                  <article key={r.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[0.875rem] font-extrabold">
                          {r.guest_first_name ?? 'Guest'}
                          <span className="text-gold-text ml-2">
                            {'★'.repeat(r.stars)}
                            <span className="text-border-strong">
                              {'★'.repeat(5 - r.stars)}
                            </span>
                          </span>
                        </p>
                        {r.comment ? (
                          <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
                            {r.comment}
                          </p>
                        ) : (
                          <p className="text-muted-light mt-1 text-[0.75rem] font-semibold italic">
                            Rated without a comment.
                          </p>
                        )}
                      </div>
                      <span className="text-muted-light shrink-0 text-[0.6875rem] font-semibold">
                        {r.order_reference ?? ''}
                      </span>
                    </div>

                    {r.reply_body ? (
                      <div className="border-border bg-bg mt-2.5 rounded-lg border-l-2 px-3 py-2">
                        <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                          Your reply ·{' '}
                          {r.reply_status === 'published'
                            ? 'live'
                            : r.reply_status === 'rejected'
                              ? 'not published'
                              : 'with moderation'}
                        </p>
                        <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.55]">
                          {r.reply_body}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2.5">
                        <ReviewReply ratingId={r.id} stars={r.stars} comment={r.comment} />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Rating distribution">
            {s.ratings === 0 ? (
              <p className="text-muted-light px-4 py-6 text-center text-[0.75rem] font-semibold">
                Nothing to show yet.
              </p>
            ) : (
              <div className="space-y-2 p-4">
                {dist.reverse().map(([label, n]) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className="text-muted w-7 shrink-0 text-[0.6875rem] font-extrabold">
                      {label}
                    </span>
                    <span className="bg-bg h-4 flex-1 overflow-hidden rounded">
                      <span
                        className="bg-gold block h-full rounded"
                        style={{ width: `${Math.max(2, (n / distMax) * 100)}%` }}
                      />
                    </span>
                    <span className="text-muted-light w-7 shrink-0 text-right text-[0.6875rem] font-extrabold tabular-nums">
                      {n}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="What guests mention">
            {mentions.size === 0 ? (
              <p className="text-muted-light px-4 py-6 text-center text-[0.75rem] font-semibold">
                No themes tagged yet.
              </p>
            ) : (
              [...mentions.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([t, n]) => <Row key={t} label={t} value={String(n)} />)
            )}
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Reply rules
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Replies are public on your Explore page after moderation, usually within minutes.
              No offers or discounts in a reply, and no personal details — a reply naming a guest
              or their flat is refused. Kiswahili is welcome.
            </p>
          </section>
        </aside>
      </div>
    </MerchantPage>
  );
}
