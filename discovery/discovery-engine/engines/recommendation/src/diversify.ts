import type { RankedRow, RankingResult, DiversityStatus } from './contracts.js';
import { refKey } from './contracts.js';

const merchantKey = (row: RankedRow) => JSON.stringify([row.item.ref.ownerId, row.item.ref.merchantId]);

/** Stable constrained reordering. Never removes candidates, crosses relevance
 * tiers, invents comparison groups, or fills a scarce band with weaker supply.
 */
export function diversify(rows: readonly RankedRow[], exactMerchant: boolean): { rows: RankedRow[]; diagnostics: RankingResult['diversity'] } {
  const windowSize = Math.min(10, rows.length);
  const unchanged = (status: DiversityStatus) => ({ rows: [...rows], diagnostics: { statuses: [status], movedCount: 0, windowSize } });
  if (!rows.length || rows[0]!.item.ref.kind !== 'offering') return unchanged('not_applicable');
  if (exactMerchant) return unchanged('exact_merchant');
  const output: RankedRow[] = []; const counts = new Map<string, number>(); const statuses = new Set<DiversityStatus>();
  const countTop = (selected: readonly RankedRow[]) => { for (const row of selected) { const key = merchantKey(row); counts.set(key, (counts.get(key) ?? 0) + 1); } };
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (end < rows.length && rows[end]!.groupKey === rows[start]!.groupKey) end++;
    const band = rows.slice(start, end); const slots = Math.max(0, Math.min(band.length, windowSize - start));
    if (!slots) { output.push(...band); start = end; continue; }
    const groups = new Set(band.map(row => row.diversityKey));
    let selected: RankedRow[];
    if (band[0]!.candidate.relevance.exactIdentity) { statuses.add('exact_identity'); selected = [...band]; }
    else if (groups.has(undefined) || groups.size !== 1) { statuses.add('comparison_unresolved'); selected = [...band]; }
    else {
      const supply = new Map<string, number>();
      for (const row of band) { const key = merchantKey(row); supply.set(key, (supply.get(key) ?? 0) + 1); }
      const capacity = [...supply].reduce((sum, [key, available]) => sum + Math.min(available, Math.max(0, 2 - (counts.get(key) ?? 0))), 0);
      if (capacity < slots) { statuses.add('sparse_supply'); selected = [...band]; }
      else {
        const chosen: RankedRow[] = []; const chosenCounts = new Map(counts);
        for (const row of band) {
          const key = merchantKey(row);
          if (chosen.length < slots && (chosenCounts.get(key) ?? 0) < 2) { chosen.push(row); chosenCounts.set(key, (chosenCounts.get(key) ?? 0) + 1); }
        }
        const ids = new Set(chosen.map(row => refKey(row.item.ref)));
        selected = [...chosen, ...band.filter(row => !ids.has(refKey(row.item.ref)))];
        statuses.add(selected.some((row, index) => row !== band[index]) ? 'applied' : 'unchanged');
      }
    }
    countTop(selected.slice(0, slots)); output.push(...selected); start = end;
  }
  let movedCount = 0;
  output.forEach((row, index) => { if (row !== rows[index]) { movedCount++; row.item.reasonCodes.push('MERCHANT_DIVERSITY_APPLIED'); } });
  return { rows: output, diagnostics: { statuses: [...statuses], movedCount, windowSize } };
}
