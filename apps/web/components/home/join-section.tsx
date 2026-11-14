import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { Translate } from '@/lib/i18n/dictionaries';

/**
 * "Host, ride, list or join.": the four ways to work with NexG, as picture
 * cards. Each card is one link: its picture with a pill naming who it is
 * for, a headline, and a gold arrow with the action.
 */

/* A job card with applicants, for Careers. */
function CareersArt() {
  return (
    <svg
      viewBox="0 0 430 345"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <rect width="430" height="345" fill="#1E1A12" />
      <circle cx="372" cy="58" r="112" fill="#3B2E12" />
      <rect x="18" y="92" width="394" height="196" rx="14" fill="#F6F3EC" />
      <rect x="38" y="112" width="160" height="16" rx="8" fill="#141414" />
      <rect x="38" y="140" width="230" height="9" rx="4.5" fill="#B9B3A6" />
      <rect x="38" y="158" width="196" height="9" rx="4.5" fill="#B9B3A6" />
      <rect x="38" y="196" width="110" height="34" rx="17" fill="#D9AE2E" />
      <rect x="162" y="196" width="110" height="34" rx="17" fill="#141414" />
      <circle cx="330" cy="150" r="30" fill="#FDD128" />
      <circle cx="330" cy="140" r="10" fill="#141414" />
      <path d="M312 172 Q330 152 348 172 Z" fill="#141414" />
      <circle cx="376" cy="172" r="26" fill="#141414" stroke="#F6F3EC" strokeWidth="4" />
      <circle cx="376" cy="164" r="9" fill="#F6F3EC" />
      <path d="M360 190 Q376 174 392 190 Z" fill="#F6F3EC" />
      <circle cx="302" cy="218" r="24" fill="#B9B3A6" />
      <circle cx="302" cy="210" r="8" fill="#141414" />
      <path d="M288 234 Q302 220 316 234 Z" fill="#141414" />
    </svg>
  );
}

const PHOTO_SIZES = '(min-width: 1024px) 16rem, 14rem';

/*
 * The four circles step down, up, down, up on desktop, and a dotted gold line
 * runs through their centres. The line is drawn on a 1000-wide canvas
 * stretched to the row: each column's centre is at 125, 375, 625, 875, and
 * the low circles' centres sit 90px (the offset) below the high ones'.
 */
const LINE = 'M0 198 L125 198 L375 108 L625 198 L875 108 L1000 86';

export function JoinSection({ t }: { t: Translate }) {
  const cards: {
    eyebrow: string;
    title: string;
    action: string;
    href: string;
    art: React.ReactNode;
  }[] = [
    {
      eyebrow: t('home.join.forHosts'),
      title: t('home.join.hostsTitle'),
      action: t('home.join.listAirbnb'),
      href: '/hosts',
      art: (
        <Image
          src="/images/hero/stay-sunset.jpg"
          alt=""
          fill
          sizes={PHOTO_SIZES}
          className="object-cover object-[62%_35%] transition-transform duration-500 group-hover:scale-105"
        />
      ),
    },
    {
      eyebrow: t('home.join.forRiders'),
      title: t('home.join.ridersTitle'),
      action: t('home.join.becomeRider'),
      href: '/riders',
      art: (
        <Image
          src="/images/join/rider.jpg"
          alt=""
          fill
          sizes={PHOTO_SIZES}
          className="object-cover object-[60%_35%] transition-transform duration-500 group-hover:scale-105"
        />
      ),
    },
    {
      eyebrow: t('home.join.forMerchants'),
      title: t('home.join.merchantsTitle'),
      action: t('home.join.registerBusiness'),
      href: '/merchants',
      art: (
        <Image
          src="/images/categories/flowers.jpg"
          alt=""
          fill
          sizes={PHOTO_SIZES}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ),
    },
    {
      eyebrow: t('home.join.careers'),
      title: t('home.join.careersTitle'),
      action: t('home.join.viewOpenings'),
      href: '/careers',
      art: <CareersArt />,
    },
  ];

  /* The last two words of the heading in gold: "or join." / "au jiunge." */
  const words = t('home.join.heading').split(' ');
  const plain = words.slice(0, -2).join(' ');
  const gold = words.slice(-2).join(' ');

  return (
    <div className="relative">
      <span
        data-reveal-glow
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[40rem] max-w-full -translate-x-1/2 rounded-full bg-[#FDD128]/15 blur-3xl"
      />

      <div data-reveal-head className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
          {plain} <span className="text-gold-text">{gold}</span>
        </h2>
        <p className="text-muted mx-auto mt-5 max-w-2xl text-[0.9375rem] font-semibold leading-[1.75] sm:text-base">
          {t('home.join.body')}
        </p>
      </div>

      <div className="relative mt-14 lg:mt-20">
        {/* The dotted path through the circles' centres, behind them. */}
        <svg
          data-reveal-line
          aria-hidden="true"
          viewBox="0 0 1000 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-0 hidden h-[400px] w-full lg:block"
        >
          <path
            d={LINE}
            fill="none"
            stroke="#FDD128"
            strokeWidth="3"
            strokeDasharray="2 12"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <ol className="relative grid grid-cols-1 gap-14 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-14 lg:grid-cols-4 lg:gap-6">
          {cards.map((card, index) => (
            <li
              data-reveal-item
              key={card.href}
              className={index % 2 === 0 ? 'lg:mt-[5.625rem]' : undefined}
            >
              <Link
                href={card.href}
                className="focus-visible:ring-gold focus-visible:ring-offset-bg group flex flex-col items-center rounded-3xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
              >
                {/* A gold-ringed circle in a dark halo, with its number. */}
                <span className="relative rounded-full bg-[#EFE3C4] p-3">
                  <span className="border-gold relative block h-[11.25rem] w-[11.25rem] overflow-hidden rounded-full border-4 bg-[#17140F] lg:h-48 lg:w-48">
                    {card.art}
                  </span>
                  <span className="bg-gold text-ink border-bg absolute right-3 top-3 flex h-14 w-14 items-center justify-center rounded-full border-4 text-lg font-extrabold tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </span>

                <span className="text-gold-text mt-7 text-xs font-extrabold uppercase tracking-[0.2em]">
                  {card.eyebrow}
                </span>
                <span className="mt-3 text-xl font-extrabold leading-tight tracking-tight sm:text-[1.375rem] lg:text-[1.0625rem] xl:text-[1.375rem]">
                  {card.title}
                </span>
                <span className="mt-5 inline-flex items-center gap-3 text-base font-semibold">
                  <span className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-1">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="group-hover:underline group-hover:underline-offset-4">
                    {card.action}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
