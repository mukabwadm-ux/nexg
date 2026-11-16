import {
  BedDouble,
  Briefcase,
  House,
  Laptop,
  type LucideIcon,
  Plane,
  ShoppingBag,
  Sparkles,
  SprayCan,
  Truck,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';

import type { JobCategory } from '@/lib/careers/board';

const ICONS: Record<JobCategory, LucideIcon> = {
  hospitality: BedDouble,
  food_beverage: UtensilsCrossed,
  property: House,
  tourism_travel: Plane,
  logistics: Truck,
  maintenance: Wrench,
  cleaning: SprayCan,
  office_admin: Laptop,
  retail: ShoppingBag,
  beauty_wellness: Sparkles,
  other: Briefcase,
};

/** The mark of a job's category; a briefcase when it has none. */
export function categoryIcon(category: string | null | undefined): LucideIcon {
  return ICONS[category as JobCategory] ?? Briefcase;
}
