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

/**
 * A BCP-47 tag. Any of them: a phone set to `zh-CN` is `zh-CN`, and
 * whether this site can say anything in it is a separate question that
 * the translation cache answers.
 */
export type Locale = string;

/** The languages with a dictionary written by a person in this file. */
export const AUTHORED_LOCALES = ['en', 'sw'] as const;

export type AuthoredLocale = (typeof AUTHORED_LOCALES)[number];

export const DEFAULT_LOCALE = 'en';

/** What the hand-written languages call themselves. Never translated. */
export const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  sw: 'Kiswahili',
};

/**
 * What a language calls itself, asked of the browser where we do not
 * know. `Intl.DisplayNames` in the language's own locale gives 中文 for
 * `zh`, not "Chinese" — which is what somebody looking for their own
 * language is scanning for.
 */
export function localeName(tag: string): string {
  if (LOCALE_NAMES[tag]) return LOCALE_NAMES[tag];
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Well-formed enough to be a language and not an injection. */
export function isLocaleTag(value: string | null | undefined): value is Locale {
  return !!value && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(value) && value.length <= 20;
}

export type Dictionary = Record<string, string>;

const en: Dictionary = {
  // ── the welcome card
  'consent.title': 'Make this yours',
  'consent.body':
    'One thing would make NexG fit you better. It is your choice, and you can change it at any time.',
  'consent.location.title': 'Where you are',
  'consent.location.body':
    'So we open on your city and show what actually reaches you. Your browser will ask you next.',
  'consent.language.title': 'Your language',
  'consent.language.body':
    'Your browser says you read {language}. We will use it where we have it.',
  'consent.language.body.unsupported':
    'Your browser says you read {language}. We do not have that yet, so this stays in English.',
  'consent.allow': 'Yes, use it',
  'consent.allowLanguageOnly': 'Use my language',
  'consent.decline': 'Not now',
  'consent.footnote':
    'We do not store your coordinates. Your location is turned into a city and then forgotten.',
  'consent.located': 'Opening on {city}.',
  'consent.locatedWaitlist': 'You are near {city}, where NexG has not opened yet.',
  'consent.locatedFar': 'We could not find a NexG city near you.',
  'consent.denied': 'No location shared — pick a city whenever you like.',

  // ── the homepage
  'home.availableNow': 'Concierges available now in Nairobi',
  'home.title': 'Everything at your Doorstep',
  'home.atYourDoorstep': 'at your Doorstep',
  'home.youWantIt': 'You Want it!',
  'home.weGotYou': 'We Got You!',
  'home.lede':
    'Tell us where you’re staying — hotel or Airbnb — and what you need. We will deliver it to you.',
  'home.stat.cities': 'cities',
  'home.stat.categories': 'service categories',
  'home.stat.tracking': 'Tracking',
  'home.step1.title': 'Ask in a sentence',
  'home.step1.body': 'Type or voice-note what you need. No forms, no menus to dig through.',
  'home.step2.title': 'A concierge takes it',
  'home.step2.body':
    'A vetted local concierge confirms the plan, the price and the timing with you.',
  'home.step3.title': 'Track and pay',
  'home.step3.body': 'Follow it live in the app and settle by card or M-Pesa when it’s done.',
  'home.popular.heading': 'Popular requests right now',
  'home.popular.sub': 'Tap one to start — a concierge takes it from there.',
  'home.popular.other': 'Something else',
  'home.req.dinner': 'Late-night dinner to my room',
  'home.req.airport': 'Airport pickup at JKIA',
  'home.req.laundry': 'Laundry back by morning',
  'home.req.flowers': 'Birthday flowers, same day',
  'home.req.pharmacy': 'Pharmacy run',
  'home.req.wine': 'Wine and ice for tonight',
  'home.req.beauty': 'Hair and nails at the hotel',
  'home.req.driver': 'Car and driver for the day',
  'home.req.groceries': 'Groceries for the apartment',
  'home.cat.transfers': 'Airport transfers',
  'home.cat.alcohol': 'Alcohol & beverages',
  'home.cat.fashion': 'Fashion & apparel',
  'home.cat.beauty': 'Beauty',
  'home.cat.rentals': 'Vehicle rentals',
  'home.cat.experiences': 'Experiences',
  'home.cat.financial': 'Financial services',
  'home.cat.flowers': 'Flowers & gifts',
  'home.featured.eyebrow': 'Featured merchants · Nairobi',
  'home.featured.heading': 'Delivering to your door tonight',
  'home.featured.note':
    'A selection of partners in your city. Featured placements are paid for by the merchant and marked as sponsored.',
  'home.featured.exploreAll': 'Explore all merchants',
  'home.featured.ownBusiness': 'Own a business? Featured slots are limited per city and category.',
  'home.featured.getFeatured': 'Get featured on the homepage →',
  'home.services.heading': 'Everything we arrange',
  'home.services.browseAll': 'Browse all services',
  'home.join.heading': 'Host, ride, list or join.',
  'home.join.body':
    'Airbnb hosts give their guests a concierge. Riders and merchants make it happen. A small team builds it.',
  'home.join.listAirbnb': 'List Your Airbnb',
  'home.join.becomeRider': 'Become A Rider',
  'home.join.registerBusiness': 'Register Your Business',
  'home.join.viewOpenings': 'View Openings',
  'home.app.eyebrow': 'The NexG app · Coming soon',
  'home.app.heading': 'Your concierge, in',
  'home.app.body':
    'Ask for anything in a sentence, watch your concierge move on the map, and pay by card or M-Pesa when it’s done. Launching first in Nairobi, then across East Africa.',

  'merchant.sponsored': 'Sponsored',
  'merchant.min': 'min',
  'merchant.cta.menu': 'View menu',
  'merchant.cta.shop': 'Shop',
  'merchant.cta.services': 'View services',
  'merchant.cta.view': 'View store',

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
  'consent.allow': 'Ndiyo, itumie',
  'consent.allowLanguageOnly': 'Tumia lugha yangu',
  'consent.decline': 'Si sasa',
  'consent.footnote':
    'Hatuhifadhi viwianishi vyako. Mahali ulipo hubadilishwa kuwa jiji, kisha husahaulika.',
  'consent.located': 'Tunafungua {city}.',
  'consent.locatedWaitlist': 'Uko karibu na {city}, ambapo NexG bado haijafunguliwa.',
  'consent.locatedFar': 'Hatukupata jiji la NexG karibu nawe.',
  'consent.denied': 'Hukushiriki mahali ulipo — chagua jiji wakati wowote.',

  // ── ukurasa wa mwanzo
  'home.availableNow': 'Wasaidizi wanapatikana sasa Nairobi',
  'home.title': 'Kila kitu Mlangoni Pako',
  'home.atYourDoorstep': 'Mlangoni Pako',
  'home.youWantIt': 'Unakitaka!',
  'home.weGotYou': 'Tunakupata!',
  'home.lede': 'Tuambie unapokaa — hoteli au Airbnb — na unachohitaji. Tutakuletea.',
  'home.stat.cities': 'miji',
  'home.stat.categories': 'aina za huduma',
  'home.stat.tracking': 'Ufuatiliaji',
  'home.step1.title': 'Uliza kwa sentensi moja',
  'home.step1.body': 'Andika au tuma ujumbe wa sauti. Hakuna fomu, hakuna menyu za kupekua.',
  'home.step2.title': 'Msaidizi anachukua',
  'home.step2.body':
    'Msaidizi wa hapa aliyehakikiwa atathibitisha mpango, bei na muda pamoja nawe.',
  'home.step3.title': 'Fuatilia na ulipe',
  'home.step3.body': 'Fuatilia moja kwa moja kwenye programu na ulipe kwa kadi au M-Pesa ikiisha.',
  'home.popular.heading': 'Maombi maarufu sasa hivi',
  'home.popular.sub': 'Gusa moja uanze — msaidizi atachukua kutoka hapo.',
  'home.popular.other': 'Kitu kingine',
  'home.req.dinner': 'Chakula cha usiku hadi chumbani kwangu',
  'home.req.airport': 'Kuchukuliwa uwanja wa ndege JKIA',
  'home.req.laundry': 'Nguo zifuliwe zirudi asubuhi',
  'home.req.flowers': 'Maua ya siku ya kuzaliwa, siku hiyohiyo',
  'home.req.pharmacy': 'Kuchukua dawa',
  'home.req.wine': 'Mvinyo na barafu kwa leo usiku',
  'home.req.beauty': 'Nywele na kucha hotelini',
  'home.req.driver': 'Gari na dereva kwa siku nzima',
  'home.req.groceries': 'Mboga na vyakula kwa nyumba',
  'home.cat.transfers': 'Usafiri wa uwanja wa ndege',
  'home.cat.alcohol': 'Pombe na vinywaji',
  'home.cat.fashion': 'Mavazi na mitindo',
  'home.cat.beauty': 'Urembo',
  'home.cat.rentals': 'Kukodisha magari',
  'home.cat.experiences': 'Matukio',
  'home.cat.financial': 'Huduma za kifedha',
  'home.cat.flowers': 'Maua na zawadi',
  'home.featured.eyebrow': 'Wafanyabiashara maalum · Nairobi',
  'home.featured.heading': 'Tunawasilisha mlangoni pako leo usiku',
  'home.featured.note':
    'Baadhi ya washirika katika jiji lako. Nafasi maalum hulipiwa na mfanyabiashara na huwekwa alama ya udhamini',
  'home.featured.exploreAll': 'Gundua wafanyabiashara wote',
  'home.featured.ownBusiness': 'Una biashara? Nafasi maalum ni chache kwa kila jiji na aina.',
  'home.featured.getFeatured': 'Pata nafasi maalum ukurasa wa mwanzo →',
  'home.services.heading': 'Kila kitu tunachopanga',
  'home.services.browseAll': 'Vinjari huduma zote',
  'home.join.heading': 'Karibisha, endesha, orodhesha au jiunge.',
  'home.join.body':
    'Wenyeji wa Airbnb huwapa wageni wao msaidizi. Waendeshaji na wafanyabiashara hulifanya liwezekane. Timu ndogo hulijenga.',
  'home.join.listAirbnb': 'Orodhesha Airbnb Yako',
  'home.join.becomeRider': 'Kuwa Rider',
  'home.join.registerBusiness': 'Sajili Biashara Yako',
  'home.join.viewOpenings': 'Tazama Nafasi za Kazi',
  'home.app.eyebrow': 'Programu ya NexG · Inakuja hivi karibuni',
  'home.app.heading': 'Msaidizi wako, ndani ya',
  'home.app.body':
    'Omba chochote kwa sentensi moja, mfuatilie msaidizi wako kwenye ramani, na ulipe kwa kadi au M-Pesa ikiisha. Tunaanza Nairobi, kisha Afrika Mashariki nzima.',

  'merchant.sponsored': 'Imedhaminiwa',
  'merchant.min': 'dak',
  'merchant.cta.menu': 'Tazama menyu',
  'merchant.cta.shop': 'Nunua',
  'merchant.cta.services': 'Tazama huduma',
  'merchant.cta.view': 'Tazama duka',

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

export const DICTIONARIES: Record<string, Dictionary> = { en, sw };

/** True where a person has written this language out by hand. */
export function isAuthored(value: string | null | undefined): value is AuthoredLocale {
  return !!value && (AUTHORED_LOCALES as readonly string[]).includes(value);
}

/**
 * What the browser is actually asking for.
 *
 * `navigator.languages` is ordered by preference and carries regions.
 * The region is kept when we do not have the bare language — `pt-BR`
 * and `pt-PT` are worth translating separately — but a hand-written
 * `sw` answers `sw-KE`, because refusing it over a region suffix would
 * be pedantry with no upside.
 */
export function pickLocale(preferences: readonly string[]): Locale | null {
  for (const preference of preferences) {
    if (!isLocaleTag(preference)) continue;
    const base = preference.toLowerCase().split('-')[0];
    if (isAuthored(base)) return base;
    return preference.toLowerCase();
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
  const fallback = DICTIONARIES[DEFAULT_LOCALE] ?? {};

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
