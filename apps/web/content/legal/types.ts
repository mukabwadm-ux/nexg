/**
 * Legal documents live in the repository, not the database.
 *
 * Versioned by git, reviewable in a pull request, and impossible to change
 * without a commit that says who changed it and when. Acceptance — who agreed
 * to which version — is the part that belongs in the database, and that is
 * what `public.legal_acceptance` records.
 */

export interface LegalSection {
  /** Stable anchor. Changing one breaks every link anyone has shared. */
  id: string;
  heading: string;
  /** Paragraphs of the operative text. This is what applies. */
  body: string[];
  /**
   * The margin note. An aid to reading, never a substitute: the artboard says
   * so in the intro and the page repeats it.
   */
  plainEnglish: string;
}

export interface LegalDocument {
  /** URL slug, e.g. "terms". Also the tab order key. */
  slug: string;
  /**
   * Matches public.legal_document_key so an acceptance can be recorded. Null
   * for a document that is signed per counterparty rather than accepted on
   * the site (the data processing agreement).
   */
  key: 'terms' | 'privacy' | 'cookies' | 'refunds' | 'merchant_terms' | 'rider_agreement' | null;
  title: string;
  /** One line under the tab. */
  tagline: string;
  /** The paragraph under the page title. */
  intro: string;
  /**
   * Null until a version is published. A version number on text nobody has
   * signed off would be the document claiming an authority it does not have.
   */
  version: string | null;
  lastUpdated: string | null;
  /**
   * True while the text is a structure rather than advice. Drives the banner
   * the artboard puts above the first section.
   */
  draft: boolean;
  sections: LegalSection[];
}
