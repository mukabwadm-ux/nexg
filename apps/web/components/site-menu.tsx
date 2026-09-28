'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@nexg/ui';
import {
  Briefcase,
  Home,
  Bike,
  Instagram,
  Facebook,
  MapPin,
  MessageCircle,
  Store,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Logo } from './logo';

/**
 * The menu from the `MenuOpen` artboard.
 *
 * Measured off the artboard rather than approximated: the panel is 480px on a
 * cream (#F6F3EC) ground with 36px gutters, the deliver-to card is white, the
 * partner block is ink (#141414) with gold icon tiles, and the primary button
 * is gold (#D4A72C). Nav labels are ~26px ExtraBold on a 61px row pitch.
 *
 * Copy is from the artboard and is signed off (ground rule 6).
 */

const SECTIONS = [
  { number: '01', label: 'Explore', href: '/explore', note: null, live: false },
  { number: '02', label: 'How it works', href: '/#how-it-works', note: null, live: false },
  { number: '03', label: 'Cities', href: '/#cities', note: '11 across East Africa', live: false },
  { number: '04', label: 'Ask a concierge', href: '/#start', note: 'Online now', live: true },
] as const;

const PARTNER_LINKS = [
  { label: 'For Airbnb hosts', note: 'Give guests a concierge', href: '/hosts', icon: Home },
  { label: 'Become a Rider', note: 'Earn on your terms', href: '/riders', icon: Bike },
  { label: 'Register Your Business', note: 'Reach every guest', href: '/merchants', icon: Store },
  { label: 'Careers', note: 'Build with us', href: '/careers', icon: Briefcase },
] as const;

/** The X mark; lucide's `X` is a close icon, not the wordmark. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7.6 8.7L23.4 22h-6.8l-5.3-6.9L5.2 22H2l8.2-9.4L1.6 2h7l4.8 6.3L18.9 2Z" />
    </svg>
  );
}

const SOCIALS = [
  { label: 'Instagram', href: 'https://instagram.com', icon: Instagram },
  { label: 'X', href: 'https://x.com', icon: XLogo },
  { label: 'Facebook', href: 'https://facebook.com', icon: Facebook },
  { label: 'WhatsApp', href: 'https://wa.me/', icon: MessageCircle },
] as const;

export function SiteMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/50 data-[state=open]:animate-fade-in fixed inset-0 z-40" />
        <Dialog.Content
          className={cn(
            'bg-bg shadow-panel fixed inset-y-0 right-0 z-50 flex w-full flex-col sm:max-w-[30rem]',
            'focus:outline-none',
            'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          {/* ------------------------------------------------------- header */}
          <header className="border-border/70 flex items-center justify-between border-b px-5 py-5 sm:px-9">
            <span className="flex items-center gap-3">
              <Logo />
              <span className="text-micro text-muted-light font-bold uppercase">Menu</span>
            </span>
            <Dialog.Close
              aria-label="Close menu"
              className="bg-ink hover:bg-ink/90 focus-visible:ring-gold flex h-11 w-11 items-center justify-center rounded-xl text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-9">
            {/* Delivery address is a Phase 1 feature; drawn as designed, inert. */}
            <div className="bg-surface flex items-center gap-3 rounded-xl px-4 py-3">
              <MapPin className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="text-micro text-muted-light block font-bold uppercase">
                  Deliver to
                </span>
                <span className="text-ink block truncate text-sm font-bold">
                  [Your hotel], Westlands · Nairobi
                </span>
              </span>
              <span className="text-ink shrink-0 text-sm font-bold">Change</span>
            </div>

            {/* --------------------------------------------------------- nav */}
            <nav aria-label="Main" className="mt-5">
              <ul>
                {SECTIONS.map((section) => (
                  <li key={section.label} className="border-border/70 border-b last:border-0">
                    <Link
                      href={section.href}
                      onClick={close}
                      className="focus-visible:ring-gold hover:text-gold-text flex h-[3.8rem] items-center gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2"
                    >
                      <span className="text-gold-text w-6 shrink-0 text-xs font-bold">
                        {section.number}
                      </span>
                      <span className="flex-1 text-[1.625rem] font-extrabold leading-none tracking-tight">
                        {section.label}
                      </span>
                      {section.note && (
                        <span className="text-muted-light flex shrink-0 items-center gap-1.5 text-xs">
                          {section.live && (
                            <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                          )}
                          {section.note}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* ----------------------------------------------- partner block */}
            <div className="bg-ink mt-5 rounded-2xl px-4 py-4">
              <p className="text-micro text-gold font-bold uppercase">Partner with us</p>
              <ul className="mt-2">
                {PARTNER_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.label} className="border-b border-white/10 last:border-0">
                      <Link
                        href={link.href}
                        onClick={close}
                        className="focus-visible:ring-gold flex h-[3.55rem] items-center gap-3 focus-visible:outline-none focus-visible:ring-2"
                      >
                        <span
                          aria-hidden="true"
                          className="bg-gold text-ink flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-[0.625rem]"
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-[0.9375rem] font-extrabold text-white">
                          {link.label}
                        </span>
                        <span className="shrink-0 text-xs text-white/50">{link.note}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* ------------------------------------------------------- footer */}
          <footer className="border-border/70 border-t px-5 py-4 sm:px-9">
            <div className="flex gap-3">
              <Link
                href="/sign-in"
                onClick={close}
                className="bg-gold text-ink hover:bg-gold/90 focus-visible:ring-gold flex h-12 flex-1 items-center justify-center rounded-xl text-[0.9375rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-in"
                onClick={close}
                className="border-ink text-ink hover:bg-ink/5 focus-visible:ring-gold flex h-12 flex-1 items-center justify-center rounded-xl border-[1.5px] text-[0.9375rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                Create account
              </Link>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="bg-surface text-ink flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
                <svg viewBox="0 0 24 24" className="text-gold h-3.5 w-3.5" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M3 12h18M12 3c3 3.5 3 14 0 18-3-4-3-14.5 0-18Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
                English
              </span>
              <span className="bg-surface text-ink rounded-full px-3 py-1.5 text-xs font-bold">
                Kenya · KES
              </span>

              <ul className="ml-auto flex items-center gap-2">
                {SOCIALS.map((social) => {
                  const Icon = social.icon;
                  return (
                    <li key={social.label}>
                      <a
                        href={social.href}
                        aria-label={social.label}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="bg-surface text-muted hover:text-ink focus-visible:ring-gold flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
