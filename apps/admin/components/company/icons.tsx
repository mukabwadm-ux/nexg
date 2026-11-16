import {
  Armchair,
  Bike,
  BookOpen,
  Box,
  Car,
  Coffee,
  Fuel,
  HardHat,
  Laptop,
  Package,
  Paperclip,
  Plug,
  Printer,
  Router,
  Shield,
  Shirt,
  Smartphone,
  SprayCan,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/** The icon keys company_category.icon allows, drawn from lucide. */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  laptop: Laptop,
  armchair: Armchair,
  printer: Printer,
  'hard-hat': HardHat,
  fuel: Fuel,
  paperclip: Paperclip,
  package: Package,
  bike: Bike,
  car: Car,
  wrench: Wrench,
  shield: Shield,
  'spray-can': SprayCan,
  coffee: Coffee,
  plug: Plug,
  smartphone: Smartphone,
  router: Router,
  box: Box,
  shirt: Shirt,
  book: BookOpen,
};

export function CategoryIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = CATEGORY_ICON[icon ?? ''] ?? Package;
  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
