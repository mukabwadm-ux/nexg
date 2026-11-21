/**
 * How one paragraph of a legal document is laid out. The text itself is
 * never changed; only its first words are picked out:
 *
 * - "(a) create and manage your account;" is a lettered item, shown with its
 *   letter in a column of its own so the items line up.
 * - "Account data: name, phone number, …" opens with a short label, shown in
 *   bold so a reader can scan the list.
 * - Anything else is an ordinary paragraph.
 */
export type Clause =
  | { kind: 'lettered'; marker: string; text: string }
  | { kind: 'labelled'; label: string; text: string }
  | { kind: 'plain'; text: string };

const LETTERED = /^\(([a-z]{1,4})\)\s+([\s\S]+)$/;
/** A short label of words only (no full stops or digits), then a colon and more text. */
const LABELLED = /^([A-Z][A-Za-z ,’'-]{2,40}):\s+([\s\S]+)$/;

export function splitClause(paragraph: string): Clause {
  const lettered = LETTERED.exec(paragraph);
  if (lettered) return { kind: 'lettered', marker: `(${lettered[1]})`, text: lettered[2]! };
  const labelled = LABELLED.exec(paragraph);
  if (labelled) return { kind: 'labelled', label: labelled[1]!, text: labelled[2]! };
  return { kind: 'plain', text: paragraph };
}
