import {
  Apple, Baby, Bandage, Bath, Beef, Beer, BookOpen, BriefcaseMedical, Cable, Cake, Camera, Candy, Cigarette, Cookie, Croissant, CupSoda,
  Droplet, Flower2, Footprints, Gamepad2, Gift, Glasses, Hammer, HandHeart, Handbag, Headphones, Heart, HeartPulse, Lamp, Laptop,
  LayoutGrid, Martini, Milk, NotebookPen, Package, Palette, PawPrint, PenLine, Pill, PillBottle, Refrigerator, Sandwich, Scissors, Shirt,
  ShoppingBasket, Smartphone, Snowflake, Sofa, SprayCan, Stethoscope, Tv, UtensilsCrossed, Watch, Wheat, Wine, Wrench, type LucideIcon,
} from 'lucide-react';

/**
 * The lucide icons the retail departments name in CATALOG_SECTIONS_V1.json (groceries, electronics, pharmacy, drinks,
 * fashion, beauty, gifts, marketplace, adults), imported one by one so the page doesn't carry the whole icon set. A
 * name not listed here draws the basket.
 */
const icons: Record<string, LucideIcon> = {
  Apple, Baby, Bandage, Bath, Beef, Beer, BookOpen, BriefcaseMedical, Cable, Cake, Camera, Candy, Cigarette, Cookie, Croissant, CupSoda,
  Droplet, Flower2, Footprints, Gamepad2, Gift, Glasses, Hammer, HandHeart, Handbag, Headphones, Heart, HeartPulse, Lamp, Laptop,
  LayoutGrid, Martini, Milk, NotebookPen, Package, Palette, PawPrint, PenLine, Pill, PillBottle, Refrigerator, Sandwich, Scissors, Shirt,
  ShoppingBasket, Smartphone, Snowflake, Sofa, SprayCan, Stethoscope, Tv, UtensilsCrossed, Watch, Wheat, Wine, Wrench,
};

export const departmentIconNames: readonly string[] = Object.keys(icons);
export const departmentIcon = (name: string): LucideIcon => icons[name] ?? ShoppingBasket;
