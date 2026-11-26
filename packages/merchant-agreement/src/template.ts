/**
 * The shape of template.generated.ts: the 18 merchant agreements as one
 * shared body with slots, built from the Word originals by
 * scripts/merchant-agreements/build-template.mjs.
 *
 * Short keys keep the generated file small:
 *   k  block kind: 'p' paragraph, 't' table, 'slot' category-specific part
 *   s  paragraph style: 'h1' heading, 'list' list paragraph, none for normal
 *   n  Word numbering level: 0 "1.", 1 "1.1", 2 "(a)", 'b' a bullet
 *   a  alignment: 'c' centre, 'j' justified, 'r' right, none for left
 *   il, ih  left and hanging indent in twips (1/20 pt), when set directly
 *   pb page break before
 *   r  runs: text (t) or a field (f), with b(old), i(talic), u(nderline)
 */

export interface TextRun {
  t: string;
  b?: number;
  i?: number;
  u?: number;
}

export interface FieldRun {
  f: string;
  b?: number;
  i?: number;
  u?: number;
}

export type Run = TextRun | FieldRun;

export interface Paragraph {
  k: 'p';
  s?: 'h1' | 'list';
  n?: number | 'b';
  a?: 'c' | 'j' | 'r';
  il?: number;
  ih?: number;
  pb?: number;
  r: Run[];
}

export type TableRole = 'execution' | 'commission' | 'notices' | 'timetable' | 'annex';

export interface Table {
  k: 't';
  role: TableRole;
  /** Column widths in twips, as in the Word table grid. */
  cols: number[];
  /** Rows of cells; each cell is a list of paragraphs. */
  rows: Paragraph[][][];
}

export interface Slot {
  k: 'slot';
  id: string;
}

export type Block = Paragraph | Table | Slot;

export interface AgreementTemplate {
  /** Every field, with the blank it replaces in the published PDF. */
  blanks: Record<string, string>;
  body: Block[];
  /** Each slot's distinct variants. */
  slots: Record<string, (Paragraph | Table)[][]>;
  categories: Record<
    string,
    {
      title: string;
      /** The variant of each slot this agreement uses. */
      pick: Record<string, number>;
      /** SHA-256 of the original's text (plainText with blanks). */
      sourceSha256: string;
    }
  >;
}

export const isField = (run: Run): run is FieldRun => 'f' in run;
