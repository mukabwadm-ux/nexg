'use client';

import { useRouter } from 'next/navigation';

/**
 * Moves between the legal documents from beside the text, in place of the
 * grid of cards that used to push every document below the fold. Each
 * document keeps its own address (/legal/<slug>).
 */
export function DocumentSwitcher({
  current,
  documents,
}: {
  current: string;
  documents: { slug: string; title: string }[];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="legal-document" className="text-page-muted text-[0.8125rem] font-bold">
        Document
      </label>
      <select
        id="legal-document"
        value={current}
        onChange={(event) => router.push(`/legal/${event.target.value}`)}
        className="border-page-line bg-bg text-page focus-visible:ring-gold h-12 w-full rounded-xl border px-3 text-[0.9375rem] font-semibold focus-visible:outline-none focus-visible:ring-2"
      >
        {documents.map((document) => (
          <option key={document.slug} value={document.slug}>
            {document.title}
          </option>
        ))}
      </select>
    </div>
  );
}
