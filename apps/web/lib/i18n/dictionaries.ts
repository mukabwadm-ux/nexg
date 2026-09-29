/**
 * What NexG says, in each language it says it in.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SWAHILI HAS NOT BEEN REVIEWED BY A NATIVE SPEAKER.
 *
 * It was written carefully and it is not machine output, but nobody who
 * speaks Kiswahili as a first language has read it, and this is a real
 * business talking to real customers in Kenya. Get it reviewed before
 * this is marketed as a Swahili site. Nothing here is load-bearing —
 * every string falls back to English if it is removed.
 * ─────────────────────────────────────────────────────────────────────
 *
 * A note for the reviewer: strings that interpolate a place name carry
 * the preposition inside the Swahili rather than relying on the English
 * word order — "jijini {city}", not "{city}". English gets away with
 * "in {city}" as two separate pieces; Swahili does not.
 *
 * Keys are flat and namespaced by surface. English is the source of
 * truth: a key missing from another language renders the English, so a
 * half-finished translation degrades to the language everyone here
 * already reads rather than to a blank or a key name.
 *
 * Deliberately no i18n library. Two languages and a few dozen strings
 * do not need a dependency, a build step and a message-extraction
 * pipeline; they need an object and a lookup.
 */

export const LOCALES = ['en', 'sw'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** What each language calls itself — never translated. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
};

type Dictionary = Record<string, string>;

const en: Dictionary = {
  // ── the welcome card
  'consent.title': 'Make this yours',
  'consent.body':
    'Two things would make NexG fit you better. Both are your choice, and you can change either at any time.',
  'consent.location.title': 'Where you are',
  'consent.location.body':
    'So we open on your city and show what actually reaches you. Your browser will ask you next.',
  'consent.language.title': 'Your language',
  'consent.language.body':
    'Your browser says you read {language}. We will use it where we have it.',
  'consent.language.body.unsupported':
    'Your browser says you read {language}. We do not have that yet, so this stays in English.',
  'consent.allow': 'Allow both',
  'consent.allowLanguageOnly': 'Use my language',
  'consent.decline': 'Not now',
  'consent.footnote':
    'We do not store your coordinates. Your location is turned into a city and then forgotten.',
  'consent.located': 'Opening on {city}.',
  'consent.locatedWaitlist': 'You are near {city}, where NexG has not opened yet.',
  'consent.locatedFar': 'We could not find a NexG city near you.',
  'consent.denied': 'No location shared — pick a city whenever you like.',

  // ── chrome
  'nav.explore': 'Explore',
  'nav.experience': 'Customize your experience',
  'nav.experience.note': 'Build a day to your budget',
  'nav.howItWorks': 'How it works',
  'nav.cities': 'Cities',
  'nav.askConcierge': 'Ask a concierge',
  'nav.signIn': 'Sign in',
  'nav.startOrder': 'Start your order',
  'nav.hosts': 'For Airbnb hosts',
  'nav.hosts.note': 'Give guests a concierge',
  'nav.riders': 'Become a Rider',
  'nav.riders.note': 'Earn on your terms',
  'nav.merchants': 'Register Your Business',
  'nav.merchants.note': 'Reach every guest',
  'nav.careers': 'Careers',
  'nav.careers.note': 'Build with us',

  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'footer.cookies': 'Cookies',
  'footer.contact': 'Contact',
  'footer.language': 'Language',

  // ── the experience front door
  'xp.eyebrow': 'A concierge is a message away',
  'xp.title': 'Customize your experience.',
  'xp.body':
    'Tell us how long, how much and who. Tap the moods you want and watch a day arrange itself against your budget — swap any piece up or down until it feels right. Then a person confirms every booking before you pay once.',
  'xp.build': 'Build my day',
  'xp.orTell': 'Or just tell us what you need',
  'xp.tile.budget': 'Your budget',
  'xp.tile.budget.body':
    'You set it. The day is built to fit it, and anything over is shown as over.',
  'xp.tile.concierge': 'One concierge',
  'xp.tile.concierge.body':
    'The same person for the whole day. They call every place on your list.',
  'xp.tile.pay': 'Pay once',
  'xp.tile.pay.body':
    'After you approve a quote. Park fees and tickets stay separate, at face value.',
  'xp.curated.heading': 'Days we have already put together in {city}',
  'xp.curated.empty':
    'None published in {city} yet — we are still signing the operators, drivers and venues that make one up. Build your own and a concierge will put it together from scratch.',
  'xp.curated.from': 'from',
  'xp.curated.perPerson': 'per person · make it yours',
  'xp.events.heading': 'Upcoming in {city}',
  'xp.events.empty':
    'Nothing listed yet. Tell a concierge what you are trying to get to and they will build the evening around it.',
  'xp.events.held': 'Tickets held for you · pay only when you approve',
  'xp.events.organiser': 'Tickets via the organiser · we handle everything around it',
  'xp.events.buildAround': 'Build a day around it →',
  'xp.events.noMarkup':
    'NexG never marks up a ticket. Where an organiser lets us hold them we do, at face value, and we charge for the day built around it.',
};

const sw: Dictionary = {
  // ── kadi ya kukaribisha
  'consent.title': 'Iwe yako',
  'consent.body':
    'Mambo mawili yatafanya NexG ikufae zaidi. Yote ni chaguo lako, na waweza kubadilisha wakati wowote.',
  'consent.location.title': 'Ulipo',
  'consent.location.body':
    'Ili tufungue jiji lako na tukuonyeshe kinachokufikia kweli. Kivinjari chako kitakuuliza baadaye.',
  'consent.language.title': 'Lugha yako',
  'consent.language.body':
    'Kivinjari chako kinasema unasoma {language}. Tutaitumia pale tuliyo nayo.',
  'consent.language.body.unsupported':
    'Kivinjari chako kinasema unasoma {language}. Bado hatuna lugha hiyo, kwa hivyo hii itabaki Kiingereza.',
  'consent.allow': 'Ruhusu yote mawili',
  'consent.allowLanguageOnly': 'Tumia lugha yangu',
  'consent.decline': 'Si sasa',
  'consent.footnote':
    'Hatuhifadhi viwianishi vyako. Mahali ulipo hubadilishwa kuwa jiji, kisha husahaulika.',
  'consent.located': 'Tunafungua {city}.',
  'consent.locatedWaitlist': 'Uko karibu na {city}, ambapo NexG bado haijafunguliwa.',
  'consent.locatedFar': 'Hatukupata jiji la NexG karibu nawe.',
  'consent.denied': 'Hukushiriki mahali ulipo — chagua jiji wakati wowote.',

  // ── menyu
  'nav.explore': 'Gundua',
  'nav.experience': 'Panga siku yako',
  'nav.experience.note': 'Jenga siku kulingana na bajeti yako',
  'nav.howItWorks': 'Jinsi inavyofanya kazi',
  'nav.cities': 'Miji',
  'nav.askConcierge': 'Ongea na msaidizi',
  'nav.signIn': 'Ingia',
  'nav.startOrder': 'Anza agizo lako',
  'nav.hosts': 'Kwa wenyeji wa Airbnb',
  'nav.hosts.note': 'Wape wageni wako msaidizi',
  'nav.riders': 'Kuwa Rider',
  'nav.riders.note': 'Pata mapato kwa masharti yako',
  'nav.merchants': 'Sajili Biashara Yako',
  'nav.merchants.note': 'Fikia kila mgeni',
  'nav.careers': 'Kazi',
  'nav.careers.note': 'Jenga nasi',

  'footer.terms': 'Masharti',
  'footer.privacy': 'Faragha',
  'footer.cookies': 'Vidakuzi',
  'footer.contact': 'Wasiliana nasi',
  'footer.language': 'Lugha',

  // ── mlango wa mbele
  'xp.eyebrow': 'Msaidizi yuko ujumbe mmoja tu',
  'xp.title': 'Panga siku yako.',
  'xp.body':
    'Tuambie muda gani, kiasi gani na nani anakuja. Gusa hali unazotaka na uone siku ikijipanga kulingana na bajeti yako — badilisha kipande chochote juu au chini hadi ikufae. Kisha mtu halisi atathibitisha kila booking kabla hujalipa mara moja.',
  'xp.build': 'Tengeneza siku yangu',
  'xp.orTell': 'Au tuambie tu unachohitaji',
  'xp.tile.budget': 'Bajeti yako',
  'xp.tile.budget.body':
    'Wewe unaiweka. Siku hujengwa ili iitoshe, na kinachozidi huonyeshwa kama kimezidi.',
  'xp.tile.concierge': 'Msaidizi mmoja',
  'xp.tile.concierge.body':
    'Mtu yuleyule kwa siku nzima. Yeye hupiga simu kila mahali kwenye orodha yako.',
  'xp.tile.pay': 'Lipa mara moja',
  'xp.tile.pay.body':
    'Baada ya kukubali nukuu. Ada za mbuga na tikiti hubaki pembeni, kwa bei yake halisi.',
  'xp.curated.heading': 'Siku tulizokwisha kuandaa jijini {city}',
  'xp.curated.empty':
    'Bado hakuna iliyochapishwa jijini {city} — bado tunasaini waendeshaji, madereva na kumbi zinazoiunda. Jenga yako mwenyewe na msaidizi ataiandaa upya.',
  'xp.curated.from': 'kuanzia',
  'xp.curated.perPerson': 'kwa kila mtu · ifanye yako',
  'xp.events.heading': 'Yanayokuja jijini {city}',
  'xp.events.empty':
    'Bado hakuna kilichoorodheshwa. Mwambie msaidizi unachotaka kufika, naye atajenga jioni kuizunguka.',
  'xp.events.held': 'Tikiti zimewekwa kwa ajili yako · lipa tu ukikubali',
  'xp.events.organiser': 'Tikiti kupitia mwandaaji · sisi tunashughulikia mengine yote',
  'xp.events.buildAround': 'Jenga siku kuizunguka →',
  'xp.events.noMarkup':
    'NexG haipandishi bei ya tikiti kamwe. Pale mwandaaji anaporuhusu tuzishike, tunazishika kwa bei yake halisi, na tunatoza kwa siku iliyojengwa kuizunguka.',
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, sw };

/** True for a locale we actually have strings for. */
export function isSupported(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best locale for a browser's list of preferences.
 *
 * `navigator.languages` is ordered by preference and carries regions —
 * `sw-KE` before `en-GB`. The region is dropped: we have one Kiswahili
 * and one English, and refusing `sw-KE` because it is not exactly `sw`
 * would be pedantry with no upside.
 */
export function pickLocale(preferences: readonly string[]): Locale | null {
  for (const preference of preferences) {
    const base = preference.toLowerCase().split('-')[0];
    if (isSupported(base)) return base;
  }
  return null;
}

export type Translate = (key: string, vars?: Record<string, string>) => string;

/**
 * A lookup with English underneath it.
 *
 * Lives here rather than in the server module because the welcome card
 * is a client component: importing it from a file that reaches for
 * next/headers would pull the server into the browser bundle.
 *
 * Missing keys fall through to English rather than rendering the key or
 * an empty string, so a partly translated language is a page in mixed
 * languages — readable — instead of a page with holes in it.
 */
export function translator(locale: Locale): Translate {
  const dictionary = DICTIONARIES[locale] ?? {};
  const fallback = DICTIONARIES[DEFAULT_LOCALE];

  return (key, vars) => {
    let text = dictionary[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, value);
      }
    }
    return text;
  };
}
