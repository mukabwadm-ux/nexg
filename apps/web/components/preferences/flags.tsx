import {
  AE,
  AU,
  CA,
  CH,
  CN,
  DE,
  ES,
  EU,
  FR,
  GB,
  IN,
  JP,
  KE,
  NG,
  PT,
  RW,
  SA,
  TZ,
  UG,
  US,
  ZA,
} from 'country-flag-icons/string/3x2';

/* The library's SVG strings, not its React components: those import
   whichever React the package finds, which is not the site's. */
type Flag = string;

/*
 * A flag beside each language and currency, the way most sites show these
 * lists. A language is not a country, so each gets the flag people most
 * expect for it: Swahili is Kenya's here, English Britain's, Arabic Saudi
 * Arabia's. The flags only help the eye; the name beside them is the label.
 */
const LANGUAGE_FLAGS: Record<string, Flag> = {
  en: GB,
  sw: KE,
  fr: FR,
  ar: SA,
  zh: CN,
  es: ES,
  de: DE,
  pt: PT,
};

const CURRENCY_FLAGS: Record<string, Flag> = {
  KES: KE,
  USD: US,
  EUR: EU,
  GBP: GB,
  UGX: UG,
  TZS: TZ,
  RWF: RW,
  ZAR: ZA,
  NGN: NG,
  AED: AE,
  SAR: SA,
  CNY: CN,
  INR: IN,
  JPY: JP,
  CAD: CA,
  AUD: AU,
  CHF: CH,
};

function FlagChip({ flag, className }: { flag?: Flag; className?: string }) {
  if (!flag) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3.5 w-[1.3125rem] shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className ?? ''}`}
      // Static SVG from the flag library, not user input.
      dangerouslySetInnerHTML={{ __html: flag }}
    />
  );
}

export function LanguageFlag({ locale, className }: { locale: string; className?: string }) {
  const base = locale.toLowerCase().split('-')[0] ?? locale;
  return <FlagChip flag={LANGUAGE_FLAGS[base]} className={className} />;
}

export function CurrencyFlag({ code, className }: { code: string; className?: string }) {
  return <FlagChip flag={CURRENCY_FLAGS[code.toUpperCase()]} className={className} />;
}
