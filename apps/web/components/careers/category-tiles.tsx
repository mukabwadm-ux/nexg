import { LayoutGrid, type LucideIcon, Users } from 'lucide-react';
import Link from 'next/link';

import { CATEGORIES, type JobCategory } from '@/lib/careers/board';

import { categoryIcon } from './category-icon';

const ON_BOARD: JobCategory[] = [
  'hospitality',
  'food_beverage',
  'property',
  'tourism_travel',
  'logistics',
  'maintenance',
  'cleaning',
];

interface Tile {
  key: string;
  label: string;
  href: string;
  Icon: LucideIcon;
}

/* Gig work is a kind of job rather than a trade, so its tile filters by
   type; the rest filter by category, and the last shows everything. */
const TILES: Tile[] = [
  ...ON_BOARD.map((key) => ({
    key,
    label: CATEGORIES.find((c) => c.key === key)!.label,
    href: `/careers/jobs?category=${key}`,
    Icon: categoryIcon(key),
  })),
  {
    key: 'gig',
    label: 'On-Demand & Gig Work',
    href: '/careers/jobs?type=gig&type=temporary',
    Icon: Users,
  },
  {
    key: 'office_admin',
    label: 'Office & Admin',
    href: '/careers/jobs?category=office_admin',
    Icon: categoryIcon('office_admin'),
  },
  { key: 'all', label: 'All Jobs', href: '/careers/jobs', Icon: LayoutGrid },
];

export function CategoryTiles() {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10">
      {TILES.map(({ key, label, href, Icon }) => (
        <li key={key}>
          <Link
            href={href}
            className="border-border bg-surface hover:border-ink group flex h-full min-h-[6.5rem] flex-col items-center justify-center gap-2.5 rounded-xl border px-2 py-4 text-center transition-colors"
          >
            <Icon
              aria-hidden="true"
              strokeWidth={1.75}
              className="text-ink h-7 w-7 transition-transform group-hover:-translate-y-0.5"
            />
            <span className="text-ink text-[0.8125rem] font-bold leading-tight">{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
