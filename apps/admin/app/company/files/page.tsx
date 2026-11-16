import { formatRange, Progress } from '@nexg/ui';
import {
  Clock,
  Database,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  Star,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';

import { RangeControl } from '@/components/company/client-kit';
import {
  FilesBoard,
  QuickFolders,
  UploadFiles,
  type FileRow,
  type FolderRow,
  type PersonRow,
} from '@/components/company/files';
import { CompanyHeader, CompanyTabs, Sheet, Stat, StatGrid } from '@/components/company/kit';
import { ConsoleShell } from '@/components/console-shell';
import {
  bytes,
  companyAccess,
  hrefWith,
  periodBounds,
  periodFrom,
  periodQuery,
  STORAGE_ALLOWANCE_BYTES,
} from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Company files' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'all', label: 'All files', icon: FileText },
  { key: 'mine', label: 'My files', icon: UserRound },
  { key: 'shared', label: 'Shared with me', icon: Users },
  { key: 'recent', label: 'Recent', icon: Clock },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'trash', label: 'Trash', icon: Trash2 },
] as const;

type Tab = (typeof TABS)[number]['key'];

const FILE_COLUMNS =
  'id, name, mime_type, size_bytes, visibility, description, folder_id, owner_id, created_at, updated_at, deleted_at, owner:staff_user!company_file_owner_id_fkey(display_name, email), folder:company_folder(name, color)';

interface Summary {
  files: number;
  shared: number;
  starred: number;
  trash: number;
  added: number;
  folders: number;
  bytes: number;
}

/**
 * Company → Company files: the shared drive for NexG's own papers.
 *
 * Every figure comes from company_file through RLS, so a person counts only
 * the files they may open; storage is the bucket's whole size. Files are
 * opened through one-minute signed links (see fileLink), never public URLs.
 */
export default async function CompanyFilesPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string; folder?: string };
}) {
  const staff = await requireStaff();
  const mod = requireModule(staff, 'company');
  const { canWrite, canApprove } = companyAccess(mod.level, staff.isSuperAdmin);
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const { start, end } = periodBounds(period);
  const supabase = createClient();

  let files = supabase.from('company_file').select(FILE_COLUMNS);
  if (tab === 'shared') {
    files = supabase
      .from('company_file')
      .select(`${FILE_COLUMNS}, company_file_share!inner(staff_id)`)
      .eq('company_file_share.staff_id', staff.staffId);
  } else if (tab === 'starred') {
    files = supabase
      .from('company_file')
      .select(`${FILE_COLUMNS}, company_file_star!inner(staff_id)`)
      .eq('company_file_star.staff_id', staff.staffId);
  }
  if (tab === 'trash') files = files.not('deleted_at', 'is', null);
  else files = files.is('deleted_at', null);
  if (tab === 'mine') files = files.eq('owner_id', staff.staffId);
  if (tab === 'overview' || tab === 'recent')
    files = files.gte('updated_at', start).lt('updated_at', end);
  files = files
    .order(tab === 'trash' ? 'deleted_at' : 'updated_at', { ascending: false })
    .limit(tab === 'overview' ? 8 : 500);

  const [summaryRes, foldersRes, filesRes, starsRes, sharesRes, peopleRes] = await Promise.all([
    supabase.rpc('rpc_company_files_summary', { p_from: period.from, p_to: period.to }),
    supabase
      .from('company_folder_v')
      .select('id, name, color, file_count, bytes, last_change')
      .order('name'),
    files,
    supabase.from('company_file_star').select('file_id'),
    supabase.from('company_file_share').select('file_id, staff_id').limit(5000),
    supabase.rpc('rpc_company_people'),
  ]);

  const summary = (summaryRes.data as Summary | null) ?? null;
  const folders = ((foldersRes.data ?? []) as FolderRow[]).map((f) => ({
    ...f,
    file_count: Number(f.file_count ?? 0),
    bytes: Number(f.bytes ?? 0),
  }));
  const rows = (filesRes.data ?? []) as unknown as FileRow[];
  const failed = summaryRes.error || foldersRes.error || filesRes.error;
  const used = summary ? Number(summary.bytes) : null;
  const usedPct = used == null ? null : (used / STORAGE_ALLOWANCE_BYTES) * 100;
  const base = (t: string) =>
    hrefWith('/company/files', {
      tab: t === 'overview' ? null : t,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  const board = (
    title: string,
    aside: string | undefined,
    empty: [string, string],
    compact = false,
  ) => (
    <FilesBoard
      key={`${tab}-${searchParams?.folder ?? ''}`}
      files={rows}
      folders={folders}
      starred={(starsRes.data ?? []).map((s) => s.file_id)}
      shares={(sharesRes.data ?? []) as { file_id: string; staff_id: string }[]}
      people={(peopleRes.data ?? []) as PersonRow[]}
      me={staff.staffId}
      canWrite={canWrite}
      canApprove={canApprove}
      mode={tab === 'trash' ? 'trash' : 'live'}
      initialFolder={searchParams?.folder ?? null}
      emptyTitle={empty[0]}
      emptyDescription={empty[1]}
      title={title}
      aside={aside}
      compact={compact}
    />
  );

  return (
    <ConsoleShell staff={staff}>
      <CompanyHeader
        icon={FolderOpen}
        title="Company files"
        subtitle="Central repository for company documents, policies, contracts and operational files."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && (
              <UploadFiles
                folders={folders}
                defaultFolder={tab === 'all' ? (searchParams?.folder ?? null) : null}
              />
            )}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <CompanyTabs
          active={tab}
          tabs={TABS.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.icon,
            href: base(t.key),
            count: t.key === 'trash' && summary?.trash ? summary.trash : null,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Some of Company files could not be loaded: {failed.message}
          </p>
        )}

        {tab === 'overview' && (
          <>
            <StatGrid className="xl:grid-cols-6">
              <Stat
                icon={FileText}
                value={summary ? summary.files.toLocaleString('en-KE') : null}
                label="Total files"
                note={summary ? `+${summary.added.toLocaleString('en-KE')} this period` : undefined}
                href={base('all')}
              />
              <Stat
                icon={Folder}
                value={summary ? summary.folders.toLocaleString('en-KE') : null}
                label="Folders"
              />
              <Stat
                icon={Users}
                value={summary ? summary.shared.toLocaleString('en-KE') : null}
                label="Shared files"
                href={base('shared')}
              />
              <Stat
                icon={Star}
                value={summary ? summary.starred.toLocaleString('en-KE') : null}
                label="Starred by you"
                href={base('starred')}
              />
              <Stat
                wide
                icon={Database}
                value={used == null ? null : bytes(used)}
                label="Storage used"
                note={`of ${bytes(STORAGE_ALLOWANCE_BYTES)}`}
              >
                <span className="mt-2 flex items-center gap-2">
                  <Progress value={usedPct} label="Storage used" className="flex-1" />
                  <span className="text-ink text-xs font-extrabold tabular-nums">
                    {usedPct == null
                      ? '—'
                      : usedPct < 1 && usedPct > 0
                        ? '<1%'
                        : `${Math.round(usedPct)}%`}
                  </span>
                </span>
              </Stat>
            </StatGrid>

            <Sheet>
              <QuickFolders folders={folders} canWrite={canWrite} period={pq} />
            </Sheet>

            <Sheet>
              {board(
                'Recent files',
                `changed ${formatRange(period)}`,
                [
                  'Nothing changed in this period',
                  summary && summary.files > 0
                    ? 'Pick a longer period above, or open All files.'
                    : 'Upload contracts, policies and other company papers to keep them in one place.',
                ],
                true,
              )}
            </Sheet>
          </>
        )}

        {tab !== 'overview' && (
          <Sheet>
            {tab === 'all' &&
              board(
                searchParams?.folder
                  ? (folders.find((f) => f.id === searchParams.folder)?.name ?? 'All files')
                  : 'All files',
                undefined,
                ['No files yet', 'Upload the first file with Upload files above.'],
              )}
            {tab === 'mine' &&
              board('My files', undefined, [
                'You have not uploaded anything',
                'Files you upload are listed here.',
              ])}
            {tab === 'shared' &&
              board('Shared with me', undefined, [
                'Nothing shared with you yet',
                'When a colleague shares a file with you it shows up here.',
              ])}
            {tab === 'recent' &&
              board('Recent', `changed ${formatRange(period)}`, [
                'Nothing changed in this period',
                'Pick a longer period above.',
              ])}
            {tab === 'starred' &&
              board('Starred', undefined, [
                'No stars yet',
                'Star the files you open often from the … menu on any file.',
              ])}
            {tab === 'trash' &&
              board('Trash', undefined, [
                'The trash is empty',
                'Files moved to the trash wait here until they are restored or deleted for good.',
              ])}
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}
