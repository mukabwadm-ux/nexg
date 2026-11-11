import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { Translate } from '@/lib/i18n/dictionaries';

/**
 * "Host, ride, list or join.": the four ways to work with NexG, as picture
 * cards. Each card is one link: its picture with a pill naming who it is
 * for, a headline, and a gold arrow with the action.
 */

/* A rider on a NexG bike, drawn rather than photographed. */
function RiderArt() {
  return (
    <svg viewBox="0 0 430 345" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="join-rider-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC93C" />
          <stop offset="1" stopColor="#E8A928" />
        </linearGradient>
      </defs>
      <rect width="430" height="345" fill="url(#join-rider-sky)" />
      <circle cx="390" cy="80" r="56" fill="#FFF4D6" opacity="0.55" />
      <rect y="268" width="430" height="77" fill="#2A2416" />
      <g stroke="#FFF4D6" strokeWidth="4" strokeDasharray="30 20" opacity="0.7">
        <line x1="0" y1="250" x2="430" y2="250" />
      </g>
      {/* The delivery box */}
      <rect x="76" y="90" width="106" height="86" rx="10" fill="#141414" />
      <text
        x="129"
        y="143"
        textAnchor="middle"
        fill="#FFC93C"
        fontFamily="Poppins, Manrope, sans-serif"
        fontSize="24"
        fontWeight="800"
      >
        NEXG
      </text>
      {/* Frame */}
      <g stroke="#141414" strokeWidth="9" strokeLinecap="round" fill="none">
        <path d="M150 222 L215 140 L300 140 L345 118" />
        <path d="M215 140 L262 230" />
        <path d="M200 104 L238 104" />
      </g>
      {/* Rider */}
      <circle cx="262" cy="58" r="20" fill="#141414" />
      <path d="M240 82 Q262 74 284 86 L292 140 L232 140 Z" fill="#141414" />
      {/* Wheels */}
      <circle cx="150" cy="222" r="40" fill="#fff" stroke="#141414" strokeWidth="9" />
      <circle cx="370" cy="222" r="40" fill="#fff" stroke="#141414" strokeWidth="9" />
    </svg>
  );
}

/* A job card with applicants, for Careers. */
function CareersArt() {
  return (
    <svg viewBox="0 0 430 345" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect width="430" height="345" fill="#1E1A12" />
      <circle cx="372" cy="58" r="112" fill="#3B2E12" />
      <rect x="18" y="92" width="394" height="196" rx="14" fill="#F6F3EC" />
      <rect x="38" y="112" width="160" height="16" rx="8" fill="#141414" />
      <rect x="38" y="140" width="230" height="9" rx="4.5" fill="#B9B3A6" />
      <rect x="38" y="158" width="196" height="9" rx="4.5" fill="#B9B3A6" />
      <rect x="38" y="196" width="110" height="34" rx="17" fill="#D9AE2E" />
      <rect x="162" y="196" width="110" height="34" rx="17" fill="#141414" />
      <circle cx="330" cy="150" r="30" fill="#FFC93C" />
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

const PHOTO_SIZES = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 85vw';

export function JoinSection({ t }: { t: Translate }) {
  const cards: {
    pill: string;
    title: string;
    action: string;
    href: string;
    art: React.ReactNode;
  }[] = [
    {
      pill: t('home.join.forHosts'),
      title: t('home.join.hostsTitle'),
      action: t('home.join.listAirbnb'),
      href: '/hosts',
      art: (
        <Image
          src="/images/hero/stay-sunset.jpg"
          alt=""
          fill
          sizes={PHOTO_SIZES}
          className="object-cover object-[60%_30%] transition-transform duration-500 group-hover:scale-105"
        />
      ),
    },
    {
      pill: t('home.join.forRiders'),
      title: t('home.join.ridersTitle'),
      action: t('home.join.becomeRider'),
      href: '/riders',
      art: <RiderArt />,
    },
    {
      pill: t('home.join.forMerchants'),
      title: t('home.join.merchantsTitle'),
      action: t('home.join.registerBusiness'),
      href: '/merchants',
      art: (
        <span className="absolute inset-0 grid grid-cols-2 gap-px bg-[#0b0907]">
          {['drinks', 'flowers'].map((photo) => (
            <span key={photo} className="relative overflow-hidden">
              <Image
                src={`/images/categories/${photo}.jpg`}
                alt=""
                fill
                sizes="(min-width: 1024px) 13vw, 45vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </span>
          ))}
        </span>
      ),
    },
    {
      pill: t('home.join.careers'),
      title: t('home.join.careersTitle'),
      action: t('home.join.viewOpenings'),
      href: '/careers',
      art: <CareersArt />,
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-[3.5rem]">
          {t('home.join.heading')}
        </h2>
        <p className="max-w-md text-[0.9375rem] font-semibold leading-[1.7] text-white/55 lg:text-base">
          {t('home.join.body')}
        </p>
      </div>

      <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 lg:gap-6 [&::-webkit-scrollbar]:hidden">
        {cards.map((card) => (
          <li key={card.href} className="w-[85%] shrink-0 snap-start sm:w-auto">
            <Link
              href={card.href}
              className="focus-visible:ring-gold group block rounded-[1.75rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b0907]"
            >
              <span className="relative block aspect-[5/4] overflow-hidden rounded-[1.75rem] bg-[#17140F] ring-1 ring-white/[0.07]">
                {card.art}
                <span className="absolute bottom-4 left-4 rounded-full border-2 border-white bg-black/55 px-5 py-2 text-[0.9375rem] font-bold backdrop-blur">
                  {card.pill}
                </span>
              </span>
              <span className="mt-5 block text-2xl font-extrabold tracking-tight">
                {card.title}
              </span>
              <span className="text-gold mt-3 flex items-center gap-3 text-base font-bold">
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
      </ul>
    </div>
  );
}
