import {
  Activity,
  BookOpen,
  ClipboardList,
  Clock,
  FileCheck2,
  GitBranch,
  KanbanSquare,
  MapPinned,
  MessageSquare,
  PauseCircle,
  Scale,
  Store,
  Target,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { PillTabs } from '@/components/console-kit';

import { MerchantSearch } from './merchant-search';

/**
 * Merchant console sections, including applications and lifecycle records.
 *
 * Every tab keeps its filters in the URL, so a link pasted into Slack
 * opens the same screen the sender was looking at. That is why the tab
 * strip is links rather than state.
 */
export const MERCHANT_TABS = [
  { key: 'directory', label: 'Directory', built: true },
  { key: 'applications', label: 'Applications', built: true },
  { key: 'deactivated', label: 'Deactivated', built: true },
  { key: 'deleted', label: 'Deleted', built: true },
  { key: 'pipeline', label: 'Pipeline', built: true },
  { key: 'health', label: 'Health', built: true },
  { key: 'disputes', label: 'Disputes', built: true },
  { key: 'hours', label: 'Hours & capacity', built: true },
  { key: 'catalogue', label: 'Catalogue ops', built: true },
  { key: 'coverage', label: 'Coverage', built: false },
  { key: 'finance', label: 'Finance', built: true },
  { key: 'comms', label: 'Comms', built: false },
  { key: 'documents', label: 'Documents', built: true },
  { key: 'acquisition', label: 'Acquisition', built: false },
  { key: 'branches', label: 'Branches', built: true },
] as const;

export type MerchantTab = (typeof MERCHANT_TABS)[number]['key'];

export function MerchantTabs({ current }: { current: string }) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <MerchantSearch />
      </div>
      <MerchantTabStrip current={current} />
    </>
  );
}

const MERCHANT_ICONS: Record<MerchantTab, LucideIcon> = {
  directory: Store,
  applications: ClipboardList,
  deactivated: PauseCircle,
  deleted: Trash2,
  pipeline: KanbanSquare,
  health: Activity,
  disputes: Scale,
  hours: Clock,
  catalogue: BookOpen,
  coverage: MapPinned,
  finance: Wallet,
  comms: MessageSquare,
  documents: FileCheck2,
  acquisition: Target,
  branches: GitBranch,
};

/* Designed-but-not-built tabs are shown, not hidden: a missing tab makes
   the console look smaller than the plan, and a tab that pretends to work
   is worse than one that says it does not. */
function MerchantTabStrip({ current }: { current: string }) {
  return (
    <PillTabs
      tabs={MERCHANT_TABS.map((tab) => ({
        href: tab.key === 'applications' ? '/merchants/applications' : `/merchants?tab=${tab.key}`,
        label: tab.label,
        icon: MERCHANT_ICONS[tab.key],
        active: current === tab.key,
        disabled: !tab.built,
      }))}
    />
  );
}
