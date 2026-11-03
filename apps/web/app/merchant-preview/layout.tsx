import { notFound } from 'next/navigation';

import { MerchantShell, StateControl, merchantNav } from '@/components/merchant/shell';

export default function MerchantPreviewLayout({ children }: { children: import('react').ReactNode }): import('react').ReactNode {
  if (process.env.NODE_ENV !== 'development') notFound();

  const nav = merchantNav({
    live: false,
    ordersOpen: 2,
    unreadMessages: 2,
    documentsToDo: 2,
    openDisputes: 0,
  }).map((item) => {
    const section = item.href === '/merchant' ? 'dashboard' : item.href.slice('/merchant/'.length);
    return { ...item, href: `/merchant-preview/${section}` };
  });

  return (
    <MerchantShell
      businessName="Kijani Kitchen"
      personName="Amina Kamau"
      role="Guest"
      live={false}
      stateControl={<StateControl live={false} accepting={false} busyUntil={null} />}
      branchName="Westlands · Nairobi"
      unreadCount={2}
      nav={nav}
      guestPreview
    >
      <div className="border-border bg-gold-soft text-gold-text flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5 text-[0.75rem] font-bold sm:px-6">
        <span className="font-extrabold uppercase tracking-wide">Guest preview</span>
        <span aria-hidden="true">·</span>
        <span>Sample merchant data; changes are not saved.</span>
      </div>
      {children}
    </MerchantShell>
  );
}
