import type { Schemas, Evidence } from '../contracts/index.js';
import type { ReadBudget } from '../orchestrator/readBudget.js';

/** Server read port. Screen-facing browser DTOs remain a separate migration. */
export interface ObservedMerchant { presentation: Schemas['PublicMerchant']; evidence: Evidence }
export interface CatalogScope { sourceSubcategoryIds: readonly string[]; area?: string; limit: number }
export interface ServerDiscoveryProvider {
  readonly ownerId: string;
  readonly configured: boolean;
  probe(budget: ReadBudget): Promise<boolean>;
  getMerchants(scope: CatalogScope, budget: ReadBudget): Promise<ObservedMerchant[]>;
  getMerchant(id: string, budget: ReadBudget): Promise<Schemas['PublicMerchant']>;
  getAreas(budget: ReadBudget): Promise<Schemas['Areas']>;
}
