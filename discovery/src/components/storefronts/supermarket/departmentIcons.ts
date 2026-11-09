import { Apple, Baby, Bath, Beef, Cookie, Croissant, CupSoda, LayoutGrid, Milk, Package, PawPrint, Sandwich, ShoppingBasket, Snowflake, SprayCan, Wheat, type LucideIcon } from 'lucide-react';

/**
 * The lucide icons the grocery departments name in CATALOG_SECTIONS_V1.json, imported one by one so the
 * page doesn't carry the whole icon set. A name not listed here draws the basket.
 */
const icons: Record<string, LucideIcon> = { Apple, Baby, Bath, Beef, Cookie, Croissant, CupSoda, LayoutGrid, Milk, Package, PawPrint, Sandwich, Snowflake, SprayCan, Wheat };

export const departmentIconNames: readonly string[] = Object.keys(icons);
export const departmentIcon = (name: string): LucideIcon => icons[name] ?? ShoppingBasket;
