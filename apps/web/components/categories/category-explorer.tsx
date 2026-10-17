'use client';

import {
  Activity,
  ArrowRight,
  BellRing,
  Car,
  Compass,
  DollarSign,
  Flower2,
  Gift,
  Heart,
  Laptop,
  Pill,
  Plane,
  Search,
  ShieldAlert,
  Shirt,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wine,
  Wrench,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import {
  ALL_CATEGORIES,
  ALL_SUBCATEGORIES,
  getCategoryImage,
  type MerchantCategory,
} from '@nexg/contracts';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Utensils: UtensilsCrossed,
  UtensilsCrossed: UtensilsCrossed,
  Wine: Wine,
  Shirt: Shirt,
  Flower2: Flower2,
  Flower: Flower2,
  Sparkles: Sparkles,
  Pill: Pill,
  Pills: Pill,
  ShoppingCart: ShoppingCart,
  Store: Store,
  Gift: Gift,
  ShieldAlert: ShieldAlert,
  Plane: Plane,
  Car: Car,
  Compass: Compass,
  DollarSign: DollarSign,
  Heart: Heart,
  Laptop: Laptop,
  Wrench: Wrench,
  Activity: Activity,
  BellRing: BellRing,
  Truck: Truck,
  Ship: Truck,
};

type CardKindFilter = 'all' | 'products' | 'services' | 'menu';

export function CategoryExplorer() {
  const [query, setQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [kindFilter, setKindFilter] = React.useState<CardKindFilter>('all');

  const trimmed = query.trim().toLowerCase();

  const filteredCategories = React.useMemo(() => {
    let result = ALL_CATEGORIES;

    // Filter by kind
    if (kindFilter !== 'all') {
      result = result.filter((c) => c.cardKind === kindFilter);
    }

    // Filter by selected category pill
    if (selectedCategory) {
      result = result.filter((c) => c.id === selectedCategory);
    }

    // Filter by query string
    if (trimmed) {
      result = result.filter((c) => {
        const matchCat =
          c.name.toLowerCase().includes(trimmed) ||
          c.desc.toLowerCase().includes(trimmed) ||
          c.id.toLowerCase().includes(trimmed);
        const matchSub = c.subcategories.some(
          (s) =>
            s.name.toLowerCase().includes(trimmed) ||
            s.fields.some((f) => f.toLowerCase().includes(trimmed)) ||
            s.fulfillmentHint.toLowerCase().includes(trimmed),
        );
        return matchCat || matchSub;
      });
    }

    return result;
  }, [trimmed, selectedCategory, kindFilter]);

  const totalSubcatsFound = React.useMemo(() => {
    return filteredCategories.reduce((acc, c) => acc + c.subcategories.length, 0);
  }, [filteredCategories]);

  return (
    <div className="space-y-10">
      {/* Search Header */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="border-gold/30 bg-gold/5 text-gold inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-wider">
          <span>Official Nairobi Taxonomy</span>
          <span>·</span>
          <span>21 Verticals</span>
        </div>
        <h1 className="text-ink mt-4 text-3xl font-black tracking-tight sm:text-5xl lg:text-6xl">
          Merchant Verticals & Categories
        </h1>
        <p className="text-muted-light mt-3 text-base sm:text-lg">
          Explore all 21 verified merchant vertical categories and {ALL_SUBCATEGORIES.length}{' '}
          specialized subcategories across Nairobi, curated for fast concierge delivery and trusted
          on-demand fulfillment.
        </p>

        {/* Live Search Bar */}
        <div className="relative mt-8">
          <Search className="text-muted-light pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedCategory) setSelectedCategory(null);
            }}
            placeholder="Search categories (e.g. Fine Dining, Vapes, Chauffeur, Safari, Electronics)..."
            className="border-border bg-surface text-ink placeholder:text-muted-light focus:border-gold focus:ring-gold/20 h-14 w-full rounded-2xl border pl-12 pr-10 text-base shadow-sm transition-all focus:outline-none focus:ring-4"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-muted-light hover:text-ink absolute right-4 top-1/2 -translate-y-1/2 p-1"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type / Kind Filter Tabs */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {(
            [
              { key: 'all', label: 'All Verticals (21)' },
              { key: 'products', label: 'Products & Retail' },
              { key: 'services', label: 'Services & Rentals' },
              { key: 'menu', label: 'Food & Dining' },
            ] as const
          ).map((tab) => {
            const isActive = kindFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setKindFilter(tab.key)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-ink ring-ink text-white shadow-sm ring-1'
                    : 'border-border bg-surface text-muted-light hover:border-border-strong hover:text-ink border'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active Filter Pill */}
        {selectedCategory && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-muted-light text-xs font-medium">Viewing vertical:</span>
            <span className="border-border bg-surface text-ink inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold">
              {ALL_CATEGORIES.find((c) => c.id === selectedCategory)?.name}
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-muted-light hover:text-gold ml-1"
                aria-label="Clear category filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Categories Grid */}
      {filteredCategories.length === 0 ? (
        <div className="border-border bg-surface rounded-3xl border p-12 text-center shadow-sm">
          <p className="text-muted-light text-base font-semibold">
            No merchant verticals found matching &ldquo;{query}&rdquo;
          </p>
          <button
            onClick={() => {
              setQuery('');
              setKindFilter('all');
              setSelectedCategory(null);
            }}
            className="text-gold mt-3 text-sm font-bold underline underline-offset-4"
          >
            Clear all filters and view all categories
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCategories.map((cat: MerchantCategory) => {
            const Icon = ICON_MAP[cat.icon] || Store;
            const imageSrc = cat.image || getCategoryImage(cat.id);
            const matchingSubs = trimmed
              ? cat.subcategories.filter(
                  (s) =>
                    s.name.toLowerCase().includes(trimmed) ||
                    s.fields.some((f) => f.toLowerCase().includes(trimmed)) ||
                    s.fulfillmentHint.toLowerCase().includes(trimmed),
                )
              : cat.subcategories;

            return (
              <div
                key={cat.id}
                className="border-border bg-surface hover:border-gold/40 group flex flex-col justify-between overflow-hidden rounded-3xl border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div>
                  {/* Category Photographic Banner */}
                  <div className="bg-surface-raised relative h-48 w-full overflow-hidden sm:h-52">
                    <Image
                      src={imageSrc}
                      alt={cat.name}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      priority={cat.sort <= 3}
                    />

                    {/* Gradient Overlay for high contrast */}
                    <div className="from-ink/90 via-ink/35 absolute inset-0 bg-gradient-to-t to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-black/40 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                        {cat.cardKind}
                      </span>
                      <span className="rounded-full bg-white/20 px-3 py-1 text-[0.6875rem] font-black uppercase tracking-wider text-white backdrop-blur-md">
                        {cat.subcategories.length} verticals
                      </span>
                    </div>

                    {/* Floating Title & Icon at Bottom of Banner */}
                    <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition-transform duration-300 group-hover:scale-110"
                        style={{ backgroundColor: cat.color || '#946414' }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <h2 className="text-xl font-black tracking-tight text-white drop-shadow">
                        {cat.name}
                      </h2>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-6">
                    <p className="text-muted-light line-clamp-2 text-sm leading-relaxed">
                      {cat.desc}
                    </p>

                    {/* Subcategories list */}
                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wider">
                          Subcategories
                        </span>
                        <span className="text-muted-light text-[0.6875rem] font-medium">
                          {cat.subcategories.length} specialized
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {matchingSubs.slice(0, 7).map((sub) => (
                          <Link
                            key={sub.id}
                            href={`/explore?category=${cat.id}&subcategory=${sub.id}`}
                            className="border-border bg-bg text-muted-light hover:border-gold hover:bg-gold/5 hover:text-ink inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all"
                          >
                            {sub.name}
                          </Link>
                        ))}
                        {matchingSubs.length > 7 && (
                          <Link
                            href={`/explore?category=${cat.id}`}
                            className="text-gold inline-block px-1.5 py-1 text-xs font-bold transition-colors hover:underline"
                          >
                            +{matchingSubs.length - 7} more
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Link */}
                <div className="border-border bg-surface border-t px-6 py-4">
                  <Link
                    href={`/explore?category=${cat.id}`}
                    className="group/link text-ink hover:text-gold flex items-center justify-between text-xs font-extrabold transition-colors"
                  >
                    <span>Browse all in {cat.name}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Footer */}
      <div className="border-border text-muted-light border-t pt-6 text-center text-xs font-medium">
        Showing {filteredCategories.length} categories · {totalSubcatsFound} subcategories available
        across Nairobi · All images CC0 certified
      </div>
    </div>
  );
}
