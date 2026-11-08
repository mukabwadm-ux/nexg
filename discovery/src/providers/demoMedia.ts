import type { DemoMedia } from '../../discovery-engine/src/adapters/supabase/catalogBridge';

/**
 * Demo photos for the Supabase provider, packed small enough for the browser (plan steps E1 and E2).
 * The demo API snapshot is 8.6 MB, but its photo links reuse about 800 distinct URLs, so each demo
 * merchant and item keeps only an index into one URL list. vite.config.ts packs it at build time;
 * the provider unpacks it only when a reply holds demo rows. Real merchants never get these photos.
 */
export interface PackedDemoMedia {
  version: 1;
  /** Distinct https photo URLs. */
  urls: string[];
  /** URL index per demo merchant number (M0384 is index 384), or -1. */
  hero: number[];
  logo: number[];
  /** URL index per demo item number (I12476 is index 12476), or -1. */
  item: number[];
}

/** The demo seed's fixed ID ranges (demo-seed/README.md): merchants c1…, items f1…, by demo number. */
const MERCHANT_ID = /^c1000000-0000-4000-8000-(\d{12})$/;
const ITEM_ID = /^f1000000-0000-4000-8000-(\d{12})$/;
/** The catalog bridge's rule for demo photo links. */
const HTTPS = /^https:\/\/[^\s\\]+$/;
const MAX_NUMBER = 1_000_000;
const demoId = (prefix: 'c1' | 'f1', value: number) => `${prefix}000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demoNumber = (pattern: RegExp, id: string): number | undefined => {
  const match = pattern.exec(id);
  const value = match ? Number(match[1]) : undefined;
  return value !== undefined && value < MAX_NUMBER ? value : undefined;
};

export function packDemoMedia(media: DemoMedia): PackedDemoMedia {
  const urls: string[] = [];
  const positions = new Map<string, number>();
  const at = (url: string | undefined): number => {
    if (!url || !HTTPS.test(url)) return -1;
    let position = positions.get(url);
    if (position === undefined) { position = urls.length; urls.push(url); positions.set(url, position); }
    return position;
  };
  const place = (list: number[], index: number, value: number) => {
    while (list.length < index) list.push(-1);
    list[index] = value;
  };
  const hero: number[] = [];
  const logo: number[] = [];
  const item: number[] = [];
  for (const [id, entry] of media.merchants) {
    const number = demoNumber(MERCHANT_ID, id);
    if (number === undefined) continue;
    place(hero, number, at(entry.heroImage));
    place(logo, number, at(entry.logoUrl));
  }
  for (const [id, url] of media.items) {
    const number = demoNumber(ITEM_ID, id);
    if (number !== undefined) place(item, number, at(url));
  }
  return { version: 1, urls, hero, logo, item };
}

export function unpackDemoMedia(value: unknown): DemoMedia {
  const packed = value && typeof value === 'object' ? value as Partial<PackedDemoMedia> : undefined;
  const urls = packed?.urls;
  if (packed?.version !== 1 || !Array.isArray(urls) || !urls.every((url) => typeof url === 'string' && HTTPS.test(url))) throw new Error('Invalid demo media');
  const indexes = (list: unknown): number[] => {
    if (!Array.isArray(list) || list.length > MAX_NUMBER || !list.every((index) => Number.isInteger(index) && index >= -1 && index < urls.length)) throw new Error('Invalid demo media');
    return list as number[];
  };
  const hero = indexes(packed.hero);
  const logo = indexes(packed.logo);
  const item = indexes(packed.item);
  const merchants = new Map<string, { heroImage?: string; logoUrl?: string }>();
  for (let number = 0; number < Math.max(hero.length, logo.length); number += 1) {
    const heroImage = urls[hero[number] ?? -1];
    const logoUrl = urls[logo[number] ?? -1];
    if (heroImage || logoUrl) merchants.set(demoId('c1', number), { ...(heroImage ? { heroImage } : {}), ...(logoUrl ? { logoUrl } : {}) });
  }
  const items = new Map<string, string>();
  item.forEach((index, number) => { const url = urls[index]; if (url) items.set(demoId('f1', number), url); });
  return { merchants, items };
}
