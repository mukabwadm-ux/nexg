/** A plain GET form: works without JavaScript and stores nothing. */
export function VerifyForm({ initial = '' }: { initial?: string }) {
  return (
    <form action="/verify" method="get" className="mt-6 flex flex-col gap-2 sm:flex-row">
      <label htmlFor="ref" className="sr-only">
        Document reference
      </label>
      <input
        id="ref"
        name="ref"
        defaultValue={initial}
        required
        maxLength={40}
        placeholder="e.g. NEXG-INV-2026-00001"
        className="border-border focus:border-gold min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 font-mono text-[0.9375rem] uppercase outline-none"
      />
      <button
        type="submit"
        className="bg-gold text-ink hover:bg-gold-deep rounded-xl px-5 py-3 text-[0.9375rem] font-extrabold transition-colors"
      >
        Check
      </button>
    </form>
  );
}
