import Link from 'next/link';

export interface PipelineCard {
  id: string;
  title: string;
  meta: string;
  note: string;
  href: string;
  /** Documents verified / documents required, when the stage is about them. */
  progress?: { done: number; total: number } | null;
}

export interface PipelineColumn {
  key: string;
  label: string;
  tone: string;
  cards: PipelineCard[];
}

/**
 * The pipeline board from the B2 / A5b artboards.
 *
 * Columns are the partner's status enum rather than the artboard's stage
 * names: the artboard draws background checks, training and kit as separate
 * columns, and the schema has no such states yet, so inventing them here
 * would put things on screen the database cannot be asked about.
 */
export function PipelineBoard({ columns }: { columns: PipelineColumn[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
      <div className="flex min-w-max gap-4">
        {columns.map((column) => (
          <section key={column.key} className="w-72 shrink-0">
            <div className="border-border bg-surface flex items-center justify-between rounded-t-xl border border-b-0 px-4 py-3">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${column.tone}`} />
                <span className="text-[0.8125rem] font-extrabold">{column.label}</span>
              </span>
              <span className="text-muted-light text-xs font-bold">{column.cards.length}</span>
            </div>

            <div className="border-border bg-bg/60 min-h-[8rem] space-y-3 rounded-b-xl border p-3">
              {column.cards.length === 0 ? (
                <p className="text-muted-light px-1 py-6 text-center text-xs font-semibold">
                  Nothing here
                </p>
              ) : (
                column.cards.map((card) => (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="border-border bg-surface shadow-card focus-visible:ring-gold hover:shadow-raised block rounded-lg border p-3 transition-shadow focus-visible:outline-none focus-visible:ring-2"
                  >
                    <p className="truncate text-[0.8125rem] font-extrabold">{card.title}</p>
                    <p className="text-muted-light mt-0.5 truncate text-[0.6875rem] font-semibold">
                      {card.meta}
                    </p>

                    {card.progress && (
                      <span className="mt-2 flex items-center gap-2">
                        <span className="bg-border h-1.5 flex-1 overflow-hidden rounded-full">
                          <span
                            className="bg-gold block h-full rounded-full"
                            style={{
                              width: `${card.progress.total === 0 ? 0 : (card.progress.done / card.progress.total) * 100}%`,
                            }}
                          />
                        </span>
                        <span className="text-muted-light text-[0.625rem] font-bold">
                          {card.progress.done}/{card.progress.total}
                        </span>
                      </span>
                    )}

                    <p className="text-muted mt-2 text-[0.6875rem] font-semibold leading-snug">
                      {card.note}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
