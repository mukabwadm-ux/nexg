/** The title block at the top of every console page (B2 / A5b artboards). */
export function ConsoleHeader({
  title,
  breadcrumb,
  action,
}: {
  title: string;
  breadcrumb: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="border-border bg-surface border-b px-4 py-5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-muted-light mt-0.5 text-xs font-semibold">{breadcrumb}</p>
        </div>
        {action}
      </div>
    </header>
  );
}
