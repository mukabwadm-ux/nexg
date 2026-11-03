export type MerchantOnboardingDemoSelection = {
  categoryId: string;
  categoryName: string;
  subcategories: Array<{ id: string; name: string }>;
};

export type MerchantOnboardingDemoContext = MerchantOnboardingDemoSelection & {
  businessName: string;
  contactName: string;
  initials: string;
  profileId: string;
};

export const MERCHANT_ONBOARDING_DEMO_STORAGE_KEY = 'nexg:merchant-onboarding-demo:v1';

const businessNamePrefixes = ['Acacia', 'Bahari', 'Jirani', 'Kipepeo', 'Mwangaza', 'Twiga'];
const contactFirstNames = ['Amina', 'Brian', 'Faith', 'Kevin', 'Wanjiku', 'Zawadi'];
const contactLastNames = ['Kamau', 'Njoroge', 'Otieno', 'Mwangi', 'Wanjala', 'Kimani'];
const contextKeys = [
  'demo',
  'categoryId',
  'categoryName',
  'subcategory',
  'subcategoryName',
  'businessName',
  'contactName',
] as const;

const cleanText = (value: unknown, maxLength: number): string =>
  typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength)
    : '';

const cleanId = (value: unknown): string => {
  const id = cleanText(value, 100);
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
};

function normalizeContext(value: unknown): MerchantOnboardingDemoContext | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const categoryId = cleanId(record.categoryId);
  const categoryName = cleanText(record.categoryName, 100);
  const businessName = cleanText(record.businessName, 100);
  const contactName = cleanText(record.contactName, 100);
  const suppliedSubcategories = Array.isArray(record.subcategories) ? record.subcategories : [];
  const seen = new Set<string>();
  const subcategories = suppliedSubcategories.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const id = cleanId(item.id);
    const name = cleanText(item.name, 100);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name }];
  });
  if (!categoryId || !categoryName || !businessName || !contactName || !subcategories.length)
    return null;
  const initials = cleanText(record.initials, 3) || businessInitials(businessName);
  return {
    categoryId,
    categoryName,
    subcategories,
    businessName,
    contactName,
    initials,
    profileId: subcategories[0]!.id,
  };
}

function businessInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Builds one sample identity from the selected activity; the seed keeps it stable across routes. */
export function createMerchantOnboardingDemoContext(
  selection: MerchantOnboardingDemoSelection,
  seed = Math.random(),
): MerchantOnboardingDemoContext | null {
  const categoryId = cleanId(selection.categoryId);
  const categoryName = cleanText(selection.categoryName, 100);
  const subcategories = selection.subcategories
    .map(({ id, name }) => ({ id: cleanId(id), name: cleanText(name, 100) }))
    .filter((item): item is { id: string; name: string } => Boolean(item.id && item.name));
  if (!categoryId || !categoryName || !subcategories.length) return null;
  const index = Math.min(
    businessNamePrefixes.length - 1,
    Math.floor(Math.max(0, Math.min(0.999999, seed)) * businessNamePrefixes.length),
  );
  const primaryName = subcategories[0]!.name;
  return normalizeContext({
    categoryId,
    categoryName,
    subcategories,
    businessName: `${businessNamePrefixes[index]} ${primaryName}`,
    contactName: `${contactFirstNames[index]} ${contactLastNames[(index + 2) % contactLastNames.length]}`,
  });
}

function getValues(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
}

/** Reads the sample-only values from either Next's searchParams object or a browser URL. */
export function parseMerchantOnboardingDemoContext(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): MerchantOnboardingDemoContext | null {
  if (getValues(params, 'demo')[0] !== 'onboarding') return null;
  const ids = getValues(params, 'subcategory');
  const names = getValues(params, 'subcategoryName');
  return normalizeContext({
    categoryId: getValues(params, 'categoryId')[0],
    categoryName: getValues(params, 'categoryName')[0],
    businessName: getValues(params, 'businessName')[0],
    contactName: getValues(params, 'contactName')[0],
    subcategories: ids.map((id, index) => ({ id, name: names[index] })),
  });
}

export function parseStoredMerchantOnboardingDemoContext(value: unknown) {
  return normalizeContext(value);
}

function contextParams(context: MerchantOnboardingDemoContext): URLSearchParams {
  const params = new URLSearchParams();
  params.set('demo', 'onboarding');
  params.set('categoryId', context.categoryId);
  params.set('categoryName', context.categoryName);
  params.set('businessName', context.businessName);
  params.set('contactName', context.contactName);
  params.set('profile', context.profileId);
  for (const subcategory of context.subcategories) {
    params.append('subcategory', subcategory.id);
    params.append('subcategoryName', subcategory.name);
  }
  return params;
}

export function merchantOnboardingDemoQuery(context: MerchantOnboardingDemoContext): string {
  return `?${contextParams(context).toString()}`;
}

/** Carries the same demo identity and selected activities to every workspace destination. */
export function appendMerchantOnboardingDemoContext(
  href: string,
  context: MerchantOnboardingDemoContext | null,
): string {
  if (!context || !href.startsWith('/')) return href;
  const [pathname, ...queryParts] = href.split('?');
  const params = new URLSearchParams(queryParts.join('?'));
  for (const key of contextKeys) params.delete(key);
  const shared = contextParams(context);
  for (const [key, value] of shared.entries()) {
    if (key === 'profile' && params.has(key)) continue;
    params.append(key, value);
  }
  return `${pathname}?${params.toString()}`;
}

export function merchantOnboardingDemoHref(
  context: MerchantOnboardingDemoContext,
): string {
  return appendMerchantOnboardingDemoContext('/merchant-live-preview?state=setup', context);
}
