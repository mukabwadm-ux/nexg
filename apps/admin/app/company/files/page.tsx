import { formatRange, Progress } from '@nexg/ui';
import Link from 'next/link';
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

import { RangeControl } from '@/components/portal/client-kit';
import {
  FilesBoard,
  QuickFolders,
  UploadFiles,
  type FileRow,
  type FolderRow,
  type PersonRow,
} from '@/components/company/files';
import { PageHeader, ViewTabs, Sheet, Stat, StatGrid } from '@/components/portal/kit';
import { ConsoleShell } from '@/components/console-shell';
import {
  bytes,
  companyAccess,
  folderPath,
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
  /** Every bucket together: what the plan's storage limit counts. */
  project_bytes?: number;
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
    /* Every column, so the page also reads the view before sub-folders existed. */
    supabase.from('company_folder_v').select('*').order('name'),
    files,
    supabase.from('company_file_star').select('file_id'),
    supabase.from('company_file_share').select('file_id, staff_id').limit(5000),
    supabase.rpc('rpc_company_people'),
  ]);

  const summary = (summaryRes.data as Summary | null) ?? null;
  const folders = ((foldersRes.data ?? []) as Partial<FolderRow>[]).map(
    (f): FolderRow => ({
      id: f.id!,
      name: f.name ?? '',
      color: f.color ?? 'gold',
      last_change: f.last_change ?? null,
      file_count: Number(f.file_count ?? 0),
      bytes: Number(f.bytes ?? 0),
      parent_id: f.parent_id ?? null,
      sort: Number(f.sort ?? 1000),
      sub_count: Number(f.sub_count ?? 0),
      all_file_count: Number(f.all_file_count ?? f.file_count ?? 0),
      all_bytes: Number(f.all_bytes ?? f.bytes ?? 0),
    }),
  );
  const topFolders = folders.filter((f) => !f.parent_id);
  const openFolder =
    tab === 'all' ? (folders.find((f) => f.id === searchParams?.folder) ?? null) : null;
  const openParent = openFolder?.parent_id
    ? (folders.find((f) => f.id === openFolder.parent_id) ?? null)
    : null;
  const rows = (filesRes.data ?? []) as unknown as FileRow[];
  const failed = summaryRes.error || foldersRes.error || filesRes.error;
  const used = summary ? Number(summary.bytes) : null;
  /* The plan's limit is for all of NexG's files together, so the meter
     shows the whole project and the figure shows Company's own share. */
  const project = summary?.project_bytes != null ? Number(summary.project_bytes) : null;
  const usedPct = project == null ? null : (project / STORAGE_ALLOWANCE_BYTES) * 100;
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
      <PageHeader
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
        <ViewTabs
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
                value={topFolders.length.toLocaleString('en-KE')}
                label="Folders"
                note={
                  folders.length > topFolders.length
                    ? `${(folders.length - topFolders.length).toLocaleString('en-KE')} folders inside them`
                    : undefined
                }
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
                label="Used by Company files"
                note={
                  project == null
                    ? undefined
                    : `All NexG files: ${bytes(project)} of ${bytes(STORAGE_ALLOWANCE_BYTES)}`
                }
                noteTone={usedPct != null && usedPct >= 80 ? 'bad' : undefined}
              >
                <span className="mt-2 flex items-center gap-2">
                  <Progress
                    value={usedPct}
                    label="All NexG files against the plan's storage"
                    tone={usedPct != null && usedPct >= 80 ? 'danger' : 'gold'}
                    className="flex-1"
                  />
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

        {tab === 'all' && !openFolder && (
          <Sheet>
            <QuickFolders folders={folders} canWrite={canWrite} period={pq} title="Folders" />
          </Sheet>
        )}

        {tab !== 'overview' && (
          <Sheet>
            {tab === 'all' && openFolder && (
              <div className="mb-5 space-y-5">
                <nav aria-label="Folder" className="text-sm font-semibold">
                  <ol className="flex flex-wrap items-center gap-1.5">
                    <li>
                      <Link
                        href={base('all')}
                        className="text-muted hover:text-ink underline-offset-4 hover:underline"
                      >
                        All files
                      </Link>
                    </li>
                    {openParent && (
                      <>
                        <li aria-hidden="true" className="text-muted-light">
                          ›
                        </li>
                        <li>
                          <Link
                            href={hrefWith('/company/files', {
                              tab: 'all',
                              folder: openParent.id,
                              ...(pq ? { from: period.from, to: period.to } : {}),
                            })}
                            className="text-muted hover:text-ink underline-offset-4 hover:underline"
                          >
                            {openParent.name}
                          </Link>
                        </li>
                      </>
                    )}
                    <li aria-hidden="true" className="text-muted-light">
                      ›
                    </li>
                    <li aria-current="page" className="text-ink font-extrabold">
                      {openFolder.name}
                    </li>
                  </ol>
                </nav>
                {!openFolder.parent_id && (
                  <QuickFolders
                    folders={folders}
                    canWrite={canWrite}
                    period={pq}
                    parent={openFolder}
                    title={`In ${openFolder.name}`}
                  />
                )}
              </div>
            )}
            {tab === 'all' &&
              board(
                openFolder ? (folderPath(folders, openFolder.id) ?? 'All files') : 'All files',
                undefined,
                openFolder
                  ? ['No files here yet', 'Upload into this folder with Upload files above.']
                  : ['No files yet', 'Upload the first file with Upload files above.'],
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
