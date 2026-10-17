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
import Link from 'next/link';
import * as React from 'react';

import {
  ALL_CATEGORIES,
  ALL_SUBCATEGORIES,
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

export function CategoryExplorer() {
  const [query, setQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const trimmed = query.trim().toLowerCase();

  const filteredCategories = React.useMemo(() => {
    if (!trimmed) {
      if (!selectedCategory) return ALL_CATEGORIES;
      return ALL_CATEGORIES.filter((c) => c.id === selectedCategory);
    }
    return ALL_CATEGORIES.filter((c) => {
      const matchCat =
        c.name.toLowerCase().includes(trimmed) ||
        c.desc.toLowerCase().includes(trimmed);
      const matchSub = c.subcategories.some(
        (s) =>
          s.name.toLowerCase().includes(trimmed) ||
          s.fields.some((f) => f.toLowerCase().includes(trimmed)),
      );
      return matchCat || matchSub;
    });
  }, [trimmed, selectedCategory]);

  const totalSubcatsFound = React.useMemo(() => {
    return filteredCategories.reduce((acc, c) => acc + c.subcategories.length, 0);
  }, [filteredCategories]);

  return (
    <div className="space-y-10">
      {/* Search Header */}
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-black tracking-tight text-ink sm:text-5xl">
          Merchant Verticals & Categories
        </h1>
        <p className="mt-3 text-base text-muted-light sm:text-lg">
          Browse across all 21 categories and {ALL_SUBCATEGORIES.length} verified verticals available for on-demand concierge delivery or scheduling in Nairobi.
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
            placeholder="Search categories (e.g. Fine Dining, Vapes, Chauffeur, Safari, Wine)..."
            className="border-border bg-surface placeholder:text-muted-light text-ink focus:border-gold focus:ring-gold/20 h-14 w-full rounded-2xl border pl-12 pr-10 text-base shadow-sm transition-all focus:outline-none focus:ring-4"
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

        {/* Active Filter Pill */}
        {selectedCategory && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-xs text-muted-light font-medium">Viewing vertical:</span>
            <span className="border-border bg-surface inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold text-ink">
              {ALL_CATEGORIES.find((c) => c.id === selectedCategory)?.name}
              <button
                onClick={() => setSelectedCategory(null)}
                className="hover:text-gold text-muted-light ml-1"
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
        <div className="border-border bg-surface rounded-2xl border p-12 text-center">
          <p className="text-muted-light text-base font-medium">
            No verticals found matching &ldquo;{query}&rdquo;
          </p>
          <button
            onClick={() => setQuery('')}
            className="text-gold mt-3 text-sm font-bold underline"
          >
            Clear search and view all
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCategories.map((cat: MerchantCategory) => {
            const Icon = ICON_MAP[cat.icon] || Store;
            const matchingSubs = trimmed
              ? cat.subcategories.filter((s) =>
                  s.name.toLowerCase().includes(trimmed) ||
                  s.fields.some((f) => f.toLowerCase().includes(trimmed)),
                )
              : cat.subcategories;

            return (
              <div
                key={cat.id}
                className="border-border bg-surface hover:border-border-strong flex flex-col justify-between rounded-3xl border p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                      style={{ backgroundColor: cat.color || '#946414' }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="border-border bg-bg text-muted-light rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wider">
                      {cat.subcategories.length} verticals
                    </span>
                  </div>

                  <h2 className="mt-4 text-xl font-extrabold text-ink">{cat.name}</h2>
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted-light">{cat.desc}</p>

                  {/* Subcategories list */}
                  <div className="mt-5 space-y-2">
                    <span className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wider">
                      Subcategories
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {matchingSubs.slice(0, 8).map((sub) => (
                        <Link
                          key={sub.id}
                          href={`/explore?category=${cat.id}&subcategory=${sub.id}`}
                          className="border-border bg-bg hover:border-gold hover:text-ink text-muted-light inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors"
                        >
                          {sub.name}
                        </Link>
                      ))}
                      {matchingSubs.length > 8 && (
                        <span className="text-muted-light inline-block px-1 py-1 text-xs font-medium">
                          +{matchingSubs.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  <Link
                    href={`/explore?category=${cat.id}`}
                    className="hover:text-gold text-ink group inline-flex items-center gap-1.5 text-xs font-bold transition-colors"
                  >
                    <span>Browse all in {cat.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Footer */}
      <div className="text-center text-xs text-muted-light">
        Showing {filteredCategories.length} categories · {totalSubcatsFound} subcategories available across Nairobi
      </div>
    </div>
  );
}
