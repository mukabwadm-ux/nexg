/**
 * The title block at the top of every console page: the page name large on
 * the black frame, a line saying what the page is for, and the page's own
 * actions on the right. Everything after it sits on the light canvas (see
 * `.console-canvas` in the shared styles).
 */
export function ConsoleHeader({
  title,
  breadcrumb,
  action,
}: {
  title: string;
  /** The line under the title. Kept under its old name for the pages that pass it. */
  breadcrumb: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="console-header flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1 pb-5 pt-2 text-white sm:px-2">
      <div className="min-w-0">
        <h1 className="text-balance text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2rem]">
          {title}
        </h1>
        <p className="mt-1 max-w-[70ch] text-sm text-white/70 sm:text-[0.9375rem]">{breadcrumb}</p>
      </div>
      {action && (
        <div className="console-header-actions flex flex-wrap items-center gap-2">{action}</div>
      )}
    </header>
  );
}
