'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Button, cn } from '@nexg/ui';
import { Briefcase, Home, Bike, MapPin, Store, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Logo } from './logo';

/**
 * The menu from the `MenuOpen` artboard: a right-side drawer, full width on a
 * phone. Copy is taken from the artboard and is signed off (ground rule 6).
 */

const SECTIONS = [
  { number: '01', label: 'Explore', href: '/explore', note: null },
  { number: '02', label: 'How it works', href: '/#how-it-works', note: null },
  { number: '03', label: 'Cities', href: '/#cities', note: '11 across East Africa' },
  { number: '04', label: 'Ask a concierge', href: '/#start', note: 'Online now' },
] as const;

const PARTNER_LINKS = [
  { label: 'For Airbnb hosts', note: 'Give guests a concierge', href: '/hosts', icon: Home },
  { label: 'Become a Rider', note: 'Earn on your terms', href: '/riders', icon: Bike },
  { label: 'Register Your Business', note: 'Reach every guest', href: '/merchants', icon: Store },
  { label: 'Careers', note: 'Build with us', href: '/careers', icon: Briefcase },
] as const;

export function SiteMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/40 data-[state=open]:animate-fade-in fixed inset-0 z-40" />
        <Dialog.Content
          className={cn(
            'bg-surface shadow-panel fixed inset-y-0 right-0 z-50 flex w-full flex-col sm:max-w-md',
            'focus:outline-none',
            'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          <header className="border-border flex items-center justify-between border-b px-4 py-3">
            <span className="flex items-center gap-3">
              <Logo />
              <span className="text-micro text-muted-light font-bold uppercase">Menu</span>
            </span>
            <Dialog.Close
              aria-label="Close menu"
              className="bg-ink hover:bg-ink/90 focus-visible:ring-gold flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Delivery address is a Phase 1 feature; shown as designed, inert for now. */}
            <div className="border-border bg-surface flex items-center gap-3 rounded-xl border px-3 py-2.5">
              <MapPin className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="text-micro text-muted-light block font-bold uppercase">
                  Deliver to
                </span>
                <span className="text-ink block truncate text-sm font-semibold">
                  [Your hotel], Westlands · Nairobi
                </span>
              </span>
              <span className="text-gold-text shrink-0 text-xs font-bold">Change</span>
            </div>

            <nav aria-label="Main" className="mt-4">
              <ul>
                {SECTIONS.map((section) => (
                  <li key={section.label} className="border-border border-b last:border-0">
                    <Link
                      href={section.href}
                      onClick={() => setOpen(false)}
                      className="hover:text-gold-text focus-visible:ring-gold flex items-baseline gap-4 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2"
                    >
                      <span className="text-gold-text text-xs font-bold">{section.number}</span>
                      <span className="flex-1 text-2xl font-extrabold tracking-tight">
                        {section.label}
                      </span>
                      {section.note && (
                        <span className="text-muted-light flex items-center gap-1.5 text-xs">
                          {section.label === 'Ask a concierge' && (
                            <span
                              aria-hidden="true"
                              className="bg-success h-1.5 w-1.5 rounded-full"
                            />
                          )}
                          {section.note}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="bg-bg mt-4 rounded-xl p-3">
              <p className="label-micro">Partner with us</p>
              <ul className="mt-2">
                {PARTNER_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.label} className="border-border border-b last:border-0">
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="focus-visible:ring-gold flex items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2"
                      >
                        <span
                          aria-hidden="true"
                          className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-sm font-bold">{link.label}</span>
                        <span className="text-muted-light text-xs">{link.note}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <footer className="border-border border-t px-4 py-3">
            <div className="flex gap-2">
              <Button variant="gold" block asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button variant="outline" block asChild>
                <Link href="/sign-in">Create account</Link>
              </Button>
            </div>
            <div className="text-muted-light mt-3 flex items-center gap-2 text-xs">
              <span className="border-border-strong rounded-full border px-2.5 py-1 font-semibold">
                English
              </span>
              <span className="border-border-strong rounded-full border px-2.5 py-1 font-semibold">
                Kenya · KES
              </span>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
