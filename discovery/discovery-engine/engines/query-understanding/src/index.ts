import type { EngineRequest } from '../../../src/contracts/index.js';
import { ContractError } from '../../../src/contracts/index.js';
import type { ReleaseArtifact } from '../../../src/releases/artifact.js';

export interface QueryTerm { value: string; exclude: boolean; phrase: boolean }
export interface QueryIssue { code: 'clarify' | 'unsupported'; key: string; paths: string[] }
export interface ReviewedAlias {
  from: string; to: string; approvalRef: string; selectionId: string;
}
export interface QueryRules { releaseId: string; revision: string; aliases: readonly ReviewedAlias[] }
export interface QueryPlan {
  revision: string;
  normalized: string;
  terms: QueryTerm[];
  intents: { key: string; confidenceBand: 'high' | 'medium' | 'low' }[];
  requirements: { kind: string; value: string | number; comparison?: 'lt' | 'lte'; currency?: string }[];
  issues: QueryIssue[];
}

/** NFC preserves compatibility/model characters; identifiers are never stemmed. */
export const normalizeText = (value: string): string => value.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ');
export function textTokens(value: string): string[] {
  return normalizeText(value).match(/[\p{L}\p{M}\p{N}]+(?:[-./'’][\p{L}\p{M}\p{N}]+)*|&/gu) ?? [];
}

/** A small explicit grammar, shared with source post-validation. No vendor operators. */
export function parseTerms(value: string): QueryTerm[] {
  if (!value || value.length > 512 || /[\p{Cc}\p{Cf}*|{}\[\]<>~^\\]/u.test(value)) throw new ContractError('INVALID_REQUEST', ['/query']);
  const terms: QueryTerm[] = [];
  const pieces = value.match(/-?"[^"]*"|\S+/gu) ?? [];
  if (pieces.join(' ') !== value) throw new ContractError('INVALID_REQUEST', ['/query']);
  for (const piece of pieces) {
    const exclude = piece.startsWith('-'); const text = exclude ? piece.slice(1) : piece;
    const phrase = text.startsWith('"') && text.endsWith('"');
    if (text.includes('"') && (!phrase || text.slice(1, -1).includes('"'))) throw new ContractError('INVALID_REQUEST', ['/query']);
    const tokens = textTokens(phrase ? text.slice(1, -1) : text);
    if (!tokens.length || (!phrase && tokens.length !== 1)) throw new ContractError('INVALID_REQUEST', ['/query']);
    terms.push({ value: tokens.join(' '), exclude, phrase });
  }
  if (!terms.some(term => !term.exclude) || terms.length > 64) throw new ContractError('INVALID_REQUEST', ['/query']);
  return terms;
}

function selectedIds(request: EngineRequest): string[] {
  return [request.selection.categoryId, request.selection.subcategoryId, request.selection.optionId].filter((id): id is string => !!id);
}
function validateRules(rules: QueryRules, release: Readonly<ReleaseArtifact>): void {
  if (rules.releaseId !== release.releaseId || !rules.revision || rules.revision.length > 100 || rules.aliases.length > 128) throw new ContractError('RELEASE_INCOMPATIBLE', ['/queryRules']);
  const seen = new Set<string>();
  for (const alias of rules.aliases) {
    const key = `${alias.selectionId}:${normalizeText(alias.from)}`;
    if (!alias.approvalRef || alias.approvalRef.length > 256 || seen.has(key) || !release.nodes.some(node => node.id === alias.selectionId)
      || [alias.from, alias.to].some(text => !text || text.length > 512 || /[^\p{L}\p{M} ]/u.test(text))) throw new ContractError('RELEASE_INCOMPATIBLE', ['/queryRules']);
    seen.add(key);
  }
}

/** Pure interpretation. Requirements are intent only, never verified catalog facts.
 * Existing wire input has no free timezone/budget-basis field: do not invent either.
 */
export function understandQuery(request: EngineRequest, release: Readonly<ReleaseArtifact>, options: { rules?: QueryRules; now?: Date } = {}): QueryPlan | undefined {
  if (request.query === undefined) return undefined;
  const raw = request.query;
  if (/[\p{Cc}\p{Cf}]/u.test(raw)) throw new ContractError('INVALID_REQUEST', ['/query']);
  let normalized = normalizeText(raw);
  const ids = selectedIds(request);
  const rules = options.rules;
  if (rules) validateRules(rules, release);
  // Only a complete, unquoted, non-numeric phrase can use a reviewed scoped alias.
  const alias = rules?.aliases.filter(rule => ids.includes(rule.selectionId) && normalizeText(rule.from) === normalized)
    .sort((a, b) => ids.indexOf(b.selectionId) - ids.indexOf(a.selectionId))[0];
  const plan: QueryPlan = { revision: rules ? `lexical-query/v1:${rules.revision}` : 'lexical-query/v1', normalized,
    terms: [], intents: [], requirements: [], issues: [] };
  const issue = (code: QueryIssue['code'], key: string, paths = ['/query']) => plan.issues.push({ code, key, paths });
  const literalName = /^"[^"\n]+"$/u.test(normalized);
  if (!literalName) {
    const workflow = /\b(?:airport pickup|airport transfer|transfer from)\b/u.test(normalized) ? 'TRANSFER'
      : /\b(?:car rental|rent a car)\b/u.test(normalized) ? 'RENTAL' : undefined;
    if (workflow) {
      plan.intents.push({ key: `workflow:${workflow}`, confidenceBand: 'high' });
      plan.requirements.push({ kind: 'workflow', value: workflow });
      const explicit = request.filters.find(filter => filter.kind === 'workflow_kind');
      const rentalContext = release.nodes.some(node => ids.includes(node.id) && /\brentals?\b/u.test(normalizeText(node.label)));
      if ((explicit && explicit.value !== workflow) || (workflow === 'TRANSFER' && rentalContext)) issue('clarify', 'selection_text_conflict', ['/selection', '/filters', '/query']);
      else issue('unsupported', 'workflow_facts_required');
    }
    const partyMatch = normalized.match(/\bfor (\d{1,3})(?: people| persons| passengers| adults)?\b/u);
    const party = /\bcouples\b/u.test(normalized) ? 2 : partyMatch ? Number(partyMatch[1]) : undefined;
    if (party !== undefined) {
      plan.requirements.push({ kind: 'party_total', value: party });
      const explicit = request.filters.find(filter => filter.kind === 'party');
      if (explicit && explicit.adults + (explicit.children ?? 0) + (explicit.infants ?? 0) !== party) issue('clarify', 'party_conflict', ['/filters', '/query']);
      else issue('clarify', 'party_configuration_required');
    }
    const money = normalized.match(/\b(under|below|less than|at most|up to)\s+(?:(kes|ksh|kshs)\s*\.?\s*)?(\d{1,9}(?:,\d{3})*(?:\.\d{1,2})?)(?![\d.])/u);
    if (money) {
      const amount = money[3]!.replaceAll(',', ''); const [whole, fraction = ''] = amount.split('.');
      const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      if (!Number.isSafeInteger(minor)) throw new ContractError('INVALID_REQUEST', ['/query']);
      plan.requirements.push({ kind: 'budget_minor', value: minor, comparison: ['under', 'below', 'less than'].includes(money[1]!) ? 'lt' : 'lte', ...(money[2] ? { currency: 'KES' } : {}) });
      issue('clarify', money[2] ? 'budget_basis_required' : 'budget_currency_and_basis_required');
    } else if (/\b(?:kes|ksh|kshs|budget|under|below|cheaper|cheapest|between|maximum)\b/u.test(normalized) || /[$€£]/u.test(normalized)) issue('clarify', 'budget_meaning_required');
    if (/\b(?:today|tomorrow|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\d{4}-\d{2}-\d{2}/u.test(normalized)) {
      const availability = request.filters.find(filter => filter.kind === 'required_availability');
      if (availability && /\btomorrow\b/u.test(normalized)) {
        const clock = new Intl.DateTimeFormat('en-CA', { timeZone: availability.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const parts = clock.formatToParts(options.now ?? new Date());
        const get = (name: string) => parts.find(part => part.type === name)!.value;
        const next = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) + 1)).toISOString().slice(0, 10);
        plan.requirements.push({ kind: 'local_date', value: next });
        const date = clock.formatToParts(new Date(availability.start));
        const part = (name: string) => date.find(value => value.type === name)!.value;
        if (`${part('year')}-${part('month')}-${part('day')}` !== next) issue('clarify', 'date_conflict', ['/filters', '/query']);
      }
      if (availability && availability.end && !/\b(?:tonight|morning|afternoon|evening)\b/u.test(normalized)) issue('unsupported', 'availability_facts_required');
      else issue('clarify', availability ? 'time_window_required' : 'date_timezone_required');
    }
    if (/\bkilimni\b/u.test(normalized)) issue('clarify', 'location_correction_required');
    if (/\b(?:near|nearby|nearest|closest|distance)\b/u.test(normalized)) issue('unsupported', 'proximity_facts_required');
    if (/\b(?:in|within|at)\s+\S/u.test(normalized)) issue('unsupported', 'text_location_requires_structured_filter');
    if (/\b\d+\s*(?:ml|litres?|liters?|kg|grams?|seats?|bedrooms?)\b/u.test(normalized)) issue('unsupported', 'unit_or_variant_facts_required');
    if (/\b(?:open|available|availability|stock|book|booking|reserve|delivery|pickup|accessible|wheelchair|halal|vegan|gluten|sugar|simultaneous|unlimited)\b/u.test(normalized)) issue('unsupported', 'operational_or_attribute_facts_required');
    if (/\b(?:not|no|without|except|excluding)\b/u.test(normalized)) issue('unsupported', 'natural_language_exclusion_requires_structure');
    if (/\bnyama choma\b/u.test(normalized)) {
      plan.intents.push({ key: 'offering:food_phrase', confidenceBand: 'medium' });
      if (request.mode === 'merchant') issue('clarify', 'entity_mode_required', ['/mode', '/query']);
    }
    for (const node of release.nodes) {
      if (normalizeText(node.label) !== normalized) continue;
      plan.intents.push({ key: `taxonomy:${node.id}`, confidenceBand: 'high' });
      const leaf = ids.at(-1);
      const ancestors = (id: string): string[] => { const result: string[] = []; let current: string | undefined = id;
        while (current) { result.push(current); current = release.nodes.find(value => value.id === current)?.parentId; } return result; };
      const related = leaf !== undefined && (ancestors(leaf).includes(node.id) || ancestors(node.id).includes(leaf));
      if (!related) issue('clarify', 'selection_text_conflict', ['/selection', '/query']);
    }
  }
  // Unsupported natural-language requirements are never demoted into lexical tokens.
  if (!plan.issues.length) {
    plan.normalized = alias ? normalizeText(alias.to) : normalized;
    plan.terms = parseTerms(plan.normalized);
  }
  return plan;
}
