'use client';

import { Button, cn, DataTable, EmptyState, type ColumnDef, useToast } from '@nexg/ui';
import {
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
  Lock,
  Pencil,
  Presentation,
  RotateCcw,
  Share2,
  Star,
  StarOff,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  deleteFolder,
  discardUpload,
  fileLink,
  purgeFile,
  registerFile,
  saveFolder,
  shareFile,
  starFile,
  trashFile,
  updateFile,
} from '@/app/company/actions';
import {
  ActionMenu,
  ConfirmAction,
  FilterSelect,
  FormPanel,
  IconAction,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import { Person, Pill } from '@/components/portal/kit';
import { createClient } from '@/lib/supabase/client';
import {
  ACCEPTED_FILE_TYPES,
  bytes,
  dateTime,
  FILE_KINDS,
  fileBadge,
  fileKind,
  folderOptions,
  folderPath,
  folderTree,
  hrefWith,
  initials,
  storageKey,
  uploadProblem,
  type FileKind,
  type Tone,
} from '@/lib/company';

export interface FileRow {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  visibility: 'company' | 'private';
  description: string | null;
  folder_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner: { display_name: string | null; email: string } | null;
  folder: { name: string; color: string } | null;
}

export interface FolderRow {
  id: string;
  name: string;
  color: string;
  file_count: number;
  bytes: number;
  last_change: string | null;
  /** The top-level folder this one sits in; null for a top-level folder. */
  parent_id: string | null;
  sort: number;
  sub_count: number;
  /** Files in the folder and its sub-folders. */
  all_file_count: number;
  all_bytes: number;
}

export interface PersonRow {
  id: string;
  display_name: string;
  email: string;
  company_level: string | null;
}

const KIND_LOOK: Record<FileKind, { icon: typeof FileText; tone: Tone; color: string }> = {
  pdf: { icon: FileText, tone: 'red', color: 'text-[#D4372C] bg-[#FDECEA]' },
  doc: { icon: FileText, tone: 'blue', color: 'text-[#2F6FDB] bg-[#EAF1FC]' },
  sheet: { icon: FileSpreadsheet, tone: 'green', color: 'text-[#1F9D55] bg-[#E7F6EC]' },
  slides: { icon: Presentation, tone: 'amber', color: 'text-[#E8730C] bg-[#FDF0E4]' },
  image: { icon: FileImage, tone: 'purple', color: 'text-[#7E3FD1] bg-[#F3EAFE]' },
  text: { icon: FileText, tone: 'grey', color: 'text-muted bg-[#F1EFEA]' },
  archive: { icon: FileArchive, tone: 'gold', color: 'text-[#B8901F] bg-[#FBF3D9]' },
  other: { icon: FileIcon, tone: 'grey', color: 'text-muted bg-[#F1EFEA]' },
};

export const FOLDER_COLORS: Record<string, string> = {
  gold: 'text-[#F5B800]',
  ink: 'text-ink',
  green: 'text-[#1F9D55]',
  blue: 'text-[#2F6FDB]',
  purple: 'text-[#A855F7]',
  red: 'text-[#D4372C]',
  grey: 'text-[#9A958B]',
};

function FileGlyph({
  row,
  size = 'sm',
}: {
  row: Pick<FileRow, 'name' | 'mime_type'>;
  size?: 'sm' | 'lg';
}) {
  const look = KIND_LOOK[fileKind(row.mime_type, row.name)];
  const Icon = look.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg',
        look.color,
        size === 'sm' ? 'h-9 w-9' : 'h-14 w-14 rounded-xl',
      )}
    >
      <Icon className={size === 'sm' ? 'h-[1.15rem] w-[1.15rem]' : 'h-7 w-7'} strokeWidth={1.8} />
    </span>
  );
}

/* ─────────────────────────────────────────────────────── opening files */

function useOpenFile() {
  const { toast } = useToast();
  return React.useCallback(
    async (row: FileRow, download: boolean) => {
      /* A tab opened before the await keeps the browser from treating it
         as a pop-up; it is pointed at the signed link once that arrives. */
      const tab = download ? null : window.open('', '_blank');
      if (tab) tab.opener = null;
      const r = await fileLink(row.id, download);
      if (!r.ok || !r.url) {
        tab?.close();
        toast({ tone: 'danger', title: 'Could not open the file', description: r.message });
        return;
      }
      if (download) {
        const a = document.createElement('a');
        a.href = r.url;
        a.rel = 'noopener';
        a.click();
      } else if (tab) {
        tab.location.href = r.url;
      } else {
        window.location.assign(r.url);
      }
    },
    [toast],
  );
}

/* ───────────────────────────────────────────────────────── the board */

export function FilesBoard({
  files,
  folders,
  starred,
  shares,
  people,
  me,
  canWrite,
  canApprove,
  mode,
  initialFolder,
  emptyTitle,
  emptyDescription,
  title,
  aside,
  compact = false,
}: {
  files: FileRow[];
  folders: FolderRow[];
  starred: string[];
  shares: { file_id: string; staff_id: string }[];
  people: PersonRow[];
  me: string;
  canWrite: boolean;
  canApprove: boolean;
  /** Trash rows offer Restore and Delete for good instead of the usual. */
  mode: 'live' | 'trash';
  initialFolder?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  title: string;
  aside?: string;
  /** The overview's short list: no paging. */
  compact?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [kind, setKind] = React.useState<string>('all');
  const [folder, setFolder] = React.useState<string>(initialFolder ?? 'all');
  const [view, setView] = React.useState<'list' | 'grid'>('list');
  const [selected, setSelected] = React.useState<FileRow[]>([]);
  const [editing, setEditing] = React.useState<FileRow | null>(null);
  const [sharing, setSharing] = React.useState<FileRow | null>(null);
  const [confirm, setConfirm] = React.useState<{ row: FileRow; kind: 'purge' } | null>(null);
  const { run } = useRunner();
  const open = useOpenFile();
  const stars = React.useMemo(() => new Set(starred), [starred]);
  const shareMap = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of shares) m.set(s.file_id, [...(m.get(s.file_id) ?? []), s.staff_id]);
    return m;
  }, [shares]);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem('company-files-view');
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      /* private window: the list view is fine */
    }
  }, []);
  const switchView = (v: 'list' | 'grid') => {
    setView(v);
    try {
      window.localStorage.setItem('company-files-view', v);
    } catch {
      /* ignore */
    }
  };

  const term = q.trim().toLowerCase();
  const parentOf = React.useMemo(
    () => new Map(folders.map((f) => [f.id, f.parent_id ?? null])),
    [folders],
  );
  /* A top-level folder shows its sub-folders' files too. */
  const inFolder = (f: FileRow) =>
    folder === 'all' ||
    (folder === 'none'
      ? !f.folder_id
      : f.folder_id === folder || (f.folder_id != null && parentOf.get(f.folder_id) === folder));
  const rows = files.filter(
    (f) =>
      (kind === 'all' || fileKind(f.mime_type, f.name) === kind) &&
      inFolder(f) &&
      (!term ||
        `${f.name} ${folderPath(folders, f.folder_id) ?? ''} ${f.owner?.display_name ?? ''} ${f.description ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || kind !== 'all' || folder !== (initialFolder ?? 'all');

  const mayChange = (f: FileRow) => canWrite && (f.visibility === 'company' || f.owner_id === me);
  const mayPurge = (f: FileRow) => canWrite && (f.owner_id === me || canApprove);

  const actionsFor = (f: FileRow) =>
    mode === 'trash'
      ? [
          mayChange(f) && {
            label: 'Restore',
            icon: <RotateCcw />,
            onSelect: () => run(() => trashFile(f.id, false)),
          },
          mayPurge(f) && {
            label: 'Delete for Good',
            icon: <Trash2 />,
            tone: 'danger' as const,
            separated: true,
            opensOverlay: true,
            onSelect: () => setConfirm({ row: f, kind: 'purge' }),
          },
        ]
      : [
          {
            label: stars.has(f.id) ? 'Remove Star' : 'Star',
            icon: stars.has(f.id) ? <StarOff /> : <Star />,
            onSelect: () => run(() => starFile(f.id, !stars.has(f.id))),
          },
          mayChange(f) && {
            label: 'Rename or Move',
            icon: <Pencil />,
            opensOverlay: true,
            onSelect: () => setEditing(f),
          },
          mayChange(f) && {
            label: 'Share',
            icon: <Share2 />,
            opensOverlay: true,
            onSelect: () => setSharing(f),
          },
          mayChange(f) && {
            label: 'Move to Trash',
            icon: <Trash2 />,
            tone: 'danger' as const,
            separated: true,
            onSelect: () => run(() => trashFile(f.id, true)),
          },
        ];

  const rowMenu = (f: FileRow) => {
    const menu = <ActionMenu label={`More actions for ${f.name}`} actions={actionsFor(f)} />;
    return confirm?.row.id === f.id ? (
      <ConfirmAction
        open
        onOpenChange={(o) => !o && setConfirm(null)}
        anchor={menu}
        title={`Delete “${f.name}” for good?`}
        body="It is removed from Company files and from storage. This cannot be undone."
        confirmLabel="Delete for Good"
        onConfirm={async () => run(() => purgeFile(f.id))}
      />
    ) : (
      menu
    );
  };

  const columns: ColumnDef<FileRow, unknown>[] = [
    {
      id: 'name',
      accessorFn: (f) => f.name,
      header: 'File Name',
      cell: ({ row: { original: f } }) => (
        <span className="flex min-w-0 items-center gap-3">
          <FileGlyph row={f} />
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => open(f, false)}
              className="hover:text-gold-text focus-visible:ring-gold block max-w-[22rem] truncate rounded text-left font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2"
            >
              {f.name}
            </button>
            <span className="text-muted-light flex items-center gap-1.5 text-xs">
              {stars.has(f.id) && (
                <Star className="fill-gold text-gold h-3 w-3" aria-label="Starred" />
              )}
              {f.visibility === 'private' && (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" aria-hidden="true" /> Private
                </span>
              )}
              {(shareMap.get(f.id)?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {shareMap.get(f.id)!.length}
                </span>
              )}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'folder',
      accessorFn: (f) => folderPath(folders, f.folder_id) ?? f.folder?.name ?? '',
      header: 'Folder',
      cell: ({ row: { original: f } }) =>
        f.folder ? (
          <span className="flex items-center gap-2 font-medium">
            <Folder
              className={cn('h-4 w-4 shrink-0 fill-current', FOLDER_COLORS[f.folder.color])}
              aria-hidden="true"
            />
            <span className="truncate" title={folderPath(folders, f.folder_id) ?? f.folder.name}>
              {folderPath(folders, f.folder_id) ?? f.folder.name}
            </span>
          </span>
        ) : (
          <span className="text-muted-light">No folder</span>
        ),
    },
    {
      id: 'type',
      accessorFn: (f) => fileBadge(f.name, f.mime_type),
      header: 'Type',
      cell: ({ row: { original: f } }) => (
        <Pill tone={KIND_LOOK[fileKind(f.mime_type, f.name)].tone}>
          {fileBadge(f.name, f.mime_type)}
        </Pill>
      ),
    },
    {
      id: 'size',
      accessorFn: (f) => f.size_bytes,
      header: 'Size',
      cell: ({ row: { original: f } }) => (
        <span className="tabular-nums">{bytes(f.size_bytes)}</span>
      ),
    },
    {
      id: 'modified',
      accessorFn: (f) => (mode === 'trash' ? f.deleted_at : f.updated_at),
      header: mode === 'trash' ? 'Deleted' : 'Modified',
      cell: ({ row: { original: f } }) => (
        <span className="whitespace-nowrap tabular-nums">
          {dateTime(mode === 'trash' ? f.deleted_at : f.updated_at)}
        </span>
      ),
    },
    {
      id: 'owner',
      accessorFn: (f) => f.owner?.display_name ?? '',
      header: 'Owner',
      cell: ({ row: { original: f } }) => (
        <Person name={f.owner?.display_name ?? f.owner?.email ?? null} />
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: f } }) => (
        <span className="flex items-center justify-end gap-0.5">
          {mode === 'live' && (
            <>
              <IconAction label={`View ${f.name}`} onClick={() => open(f, false)}>
                <Eye />
              </IconAction>
              <IconAction label={`Download ${f.name}`} onClick={() => open(f, true)}>
                <Download />
              </IconAction>
            </>
          )}
          {rowMenu(f)}
        </span>
      ),
    },
  ];

  const { shown, more } = useShowMore(rows, compact ? rows.length || 1 : 25);
  const bulkTrash = selected.filter((f) => mayChange(f));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">
          {title}
          {aside && <span className="text-muted-light ml-2 text-xs font-semibold">{aside}</span>}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search in files…"
            label="Search files"
            className="w-full sm:w-64 lg:w-72"
          />
          <FilterSelect
            label="File type"
            value={kind}
            onChange={setKind}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All File Types' },
              ...FILE_KINDS.map((k) => ({ value: k.key, label: k.label })),
            ]}
          />
          <FilterSelect
            label="Folder"
            value={folder}
            onChange={setFolder}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Folders' },
              ...folderOptions(folders),
              { value: 'none', label: 'No Folder' },
            ]}
          />
          <div
            role="group"
            aria-label="Layout"
            className="border-border-strong bg-surface flex h-11 shrink-0 items-center gap-0.5 rounded-xl border p-1"
          >
            {(['list', 'grid'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={v === 'list' ? 'List' : 'Grid'}
                onClick={() => switchView(v)}
                className={cn(
                  'flex h-full w-9 items-center justify-center rounded-lg transition-colors',
                  'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
                  view === v ? 'bg-gold text-ink' : 'text-muted hover:bg-bg',
                )}
              >
                {v === 'list' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected.length > 0 && mode === 'live' && (
        <div className="bg-ink flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-white">
          <span className="font-bold">{selected.length} selected</span>
          {bulkTrash.length > 0 && (
            <Button
              size="sm"
              variant="gold"
              leadingIcon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                for (const f of bulkTrash) await trashFile(f.id, true);
                await run(async () => ({ ok: true }), `${bulkTrash.length} moved to the trash`);
                setSelected([]);
              }}
            >
              Move {bulkTrash.length} to Trash
            </Button>
          )}
          {bulkTrash.length < selected.length && (
            <span className="text-white/60">
              {selected.length - bulkTrash.length} you cannot change
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title={filtered ? 'No files match' : emptyTitle}
          description={filtered ? 'Try another name, type or folder.' : emptyDescription}
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setKind('all');
                    setFolder(initialFolder ?? 'all');
                  },
                },
              }
            : {})}
        />
      ) : view === 'grid' ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {shown.map((f) => (
              <li
                key={f.id}
                className="border-border hover:border-border-strong group relative flex flex-col rounded-2xl border bg-white p-3.5 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <FileGlyph row={f} size="lg" />
                  {rowMenu(f)}
                </div>
                <button
                  type="button"
                  onClick={() => (mode === 'live' ? open(f, false) : undefined)}
                  className="focus-visible:ring-gold mt-3 rounded text-left focus-visible:outline-none focus-visible:ring-2"
                >
                  <span className="line-clamp-2 break-words text-sm font-bold">{f.name}</span>
                </button>
                <span className="text-muted-light mt-1 text-xs tabular-nums">
                  {bytes(f.size_bytes)} · {dateTime(mode === 'trash' ? f.deleted_at : f.updated_at)}
                </span>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <span
                    title={f.owner?.display_name ?? undefined}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFE9A6] text-[0.625rem] font-extrabold text-[#6B4E00]"
                  >
                    {initials(f.owner?.display_name ?? f.owner?.email)}
                  </span>
                  {stars.has(f.id) && (
                    <Star className="fill-gold text-gold h-4 w-4" aria-label="Starred" />
                  )}
                </span>
              </li>
            ))}
          </ul>
          {more}
        </>
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              caption={title}
              columns={columns}
              data={shown}
              selectable={mode === 'live' && canWrite}
              onSelectionChange={setSelected}
              emptyTitle={emptyTitle}
            />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {shown.map((f) => (
              <li key={f.id} className="flex items-center gap-3 bg-white px-3 py-3">
                <FileGlyph row={f} />
                <button
                  type="button"
                  onClick={() => (mode === 'live' ? open(f, false) : undefined)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-bold">{f.name}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {folderPath(folders, f.folder_id) ?? f.folder?.name ?? 'No folder'} ·{' '}
                    {bytes(f.size_bytes)} ·{' '}
                    {dateTime(mode === 'trash' ? f.deleted_at : f.updated_at)}
                  </span>
                </button>
                {mode === 'live' && (
                  <IconAction label={`Download ${f.name}`} onClick={() => open(f, true)}>
                    <Download />
                  </IconAction>
                )}
                {rowMenu(f)}
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {editing && (
        <EditFilePanel
          file={editing}
          folders={folders}
          isOwner={editing.owner_id === me}
          onClose={() => setEditing(null)}
        />
      )}
      {sharing && (
        <SharePanel
          file={sharing}
          people={people.filter((p) => p.company_level && p.id !== sharing.owner_id)}
          current={shareMap.get(sharing.id) ?? []}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────── rename and move */

function EditFilePanel({
  file,
  folders,
  isOwner,
  onClose,
}: {
  file: FileRow;
  folders: FolderRow[];
  isOwner: boolean;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(file.name);
  const [folderId, setFolderId] = React.useState(file.folder_id ?? '');
  const [visibility, setVisibility] = React.useState(file.visibility);
  const [description, setDescription] = React.useState(file.description ?? '');
  const { run, busy } = useRunner();

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Rename or Move"
      subtitle={file.name}
      submitLabel="Save"
      busy={busy}
      onSubmit={() =>
        run(() =>
          updateFile({ id: file.id, name, folderId: folderId || null, visibility, description }),
        )
      }
    >
      <TextField
        label="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
      />
      <SelectField
        label="Folder"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
        placeholder="No folder"
        options={folderOptions(folders)}
      />
      <VisibilityChoice value={visibility} onChange={setVisibility} disabled={!isOwner} />
      <TextArea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        hint="What it is, so colleagues find the right version."
      />
    </FormPanel>
  );
}

function VisibilityChoice({
  value,
  onChange,
  disabled,
}: {
  value: 'company' | 'private';
  onChange: (v: 'company' | 'private') => void;
  disabled?: boolean;
}) {
  const options = [
    {
      key: 'company' as const,
      label: 'Everyone in Company',
      hint: 'Colleagues who use Company can find and open it.',
      icon: Users,
    },
    {
      key: 'private' as const,
      label: 'Private',
      hint: 'Only you and the people you share it with.',
      icon: Lock,
    },
  ];
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-1.5 text-sm font-bold">Who Sees It</legend>
      {options.map((o) => (
        <label
          key={o.key}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
            value === o.key ? 'border-ink bg-gold-soft' : 'border-border hover:bg-bg',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            type="radio"
            name="visibility"
            checked={value === o.key}
            onChange={() => onChange(o.key)}
            className="accent-ink mt-1"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <o.icon className="h-4 w-4" aria-hidden="true" /> {o.label}
            </span>
            <span className="text-muted-light block text-xs">{o.hint}</span>
          </span>
        </label>
      ))}
      {disabled && (
        <p className="text-muted-light text-xs">Only the owner changes who sees a file.</p>
      )}
    </fieldset>
  );
}

/* ───────────────────────────────────────────────────────────── sharing */

function SharePanel({
  file,
  people,
  current,
  onClose,
}: {
  file: FileRow;
  people: PersonRow[];
  current: string[];
  onClose: () => void;
}) {
  const [chosen, setChosen] = React.useState(() => new Set(current));
  const [q, setQ] = React.useState('');
  const { run, busy } = useRunner();
  const term = q.trim().toLowerCase();
  const list = people.filter(
    (p) => !term || `${p.display_name} ${p.email}`.toLowerCase().includes(term),
  );

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Share"
      subtitle={file.name}
      submitLabel="Save Sharing"
      busy={busy}
      onSubmit={() => run(() => shareFile(file.id, [...chosen]))}
    >
      <p className="text-muted text-sm">
        {file.visibility === 'private'
          ? 'Only the people ticked here, and you, can open this private file.'
          : 'Everyone in Company can open this file already. Sharing puts it under their “Shared with Me”.'}
      </p>
      <SearchBox
        value={q}
        onChange={setQ}
        placeholder="Find a colleague…"
        label="Find a colleague"
      />
      {people.length === 0 ? (
        <p className="text-muted-light text-sm">Nobody else uses Company yet.</p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-xl border">
          {list.map((p) => (
            <li key={p.id}>
              <label className="hover:bg-bg flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={chosen.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    setChosen(next);
                  }}
                  className="accent-gold h-4 w-4"
                />
                <Person name={p.display_name} sub={p.email} />
              </label>
            </li>
          ))}
        </ul>
      )}
    </FormPanel>
  );
}

/* ──────────────────────────────────────────────────────────── uploads */

interface Pending {
  file: File;
  problem: string | null;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  message?: string;
}

/** The header's Upload files: drop or pick files, choose a folder, upload. */
export function UploadFiles({
  folders,
  defaultFolder,
}: {
  folders: FolderRow[];
  defaultFolder?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Pending[]>([]);
  const [folderId, setFolderId] = React.useState(defaultFolder ?? '');
  const [visibility, setVisibility] = React.useState<'company' | 'private'>('company');
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...list].map<Pending>((file) => ({
      file,
      problem: uploadProblem(file),
      state: 'waiting',
    }));
    setItems((prev) => [...prev.filter((p) => p.state !== 'done'), ...next].slice(0, 20));
  };

  const upload = async (): Promise<boolean> => {
    const ready = items.filter((i) => !i.problem && i.state !== 'done');
    if (ready.length === 0) {
      toast({ tone: 'warning', title: 'Add a file first' });
      return false;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) {
      setBusy(false);
      toast({ tone: 'danger', title: 'Signed out', description: 'Sign in again to upload.' });
      return false;
    }
    let ok = 0;
    for (const item of ready) {
      setItems((prev) => prev.map((p) => (p === item ? { ...p, state: 'uploading' } : p)));
      const path = storageKey(uid, item.file.name, crypto.randomUUID());
      const { error } = await supabase.storage
        .from('company-files')
        .upload(path, item.file, { contentType: item.file.type, upsert: false });
      let message = error?.message;
      if (!error) {
        const r = await registerFile({
          path,
          name: item.file.name,
          folderId: folderId || null,
          visibility,
        });
        if (!r.ok) {
          message = r.message;
          await discardUpload(path);
        }
      }
      if (!message) ok += 1;
      setItems((prev) =>
        prev.map((p) =>
          p.file === item.file ? { ...p, state: message ? 'failed' : 'done', message } : p,
        ),
      );
    }
    setBusy(false);
    router.refresh();
    if (ok === ready.length) {
      toast({ tone: 'success', title: ok === 1 ? 'File uploaded' : `${ok} files uploaded` });
      setItems([]);
      return true;
    }
    toast({
      tone: 'warning',
      title: `${ok} of ${ready.length} uploaded`,
      description: 'The ones that did not go say why below.',
    });
    return false;
  };

  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<UploadCloud className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Upload Files
      </Button>
      <FormPanel
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
        title="Upload Files"
        subtitle="PDF, Office documents, images, CSV, text or ZIP · up to 50 MB each"
        submitLabel={busy ? 'Uploading…' : 'Upload'}
        busy={busy}
        onSubmit={upload}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-gold bg-gold-soft' : 'border-border-strong bg-bg/60',
          )}
        >
          <span className="bg-gold/20 text-gold-text flex h-12 w-12 items-center justify-center rounded-full">
            <UploadCloud className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-bold">Drop files here</p>
          <p className="text-muted-light text-xs">or</p>
          <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
            Choose Files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {items.length > 0 && (
          <ul className="border-border divide-border divide-y rounded-xl border">
            {items.map((item, i) => (
              <li key={`${item.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                <FileGlyph row={{ name: item.file.name, mime_type: item.file.type }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.file.name}</span>
                  <span
                    className={cn(
                      'block truncate text-xs',
                      item.problem || item.state === 'failed'
                        ? 'text-danger font-semibold'
                        : item.state === 'done'
                          ? 'text-success font-semibold'
                          : 'text-muted-light',
                    )}
                  >
                    {item.problem ??
                      (item.state === 'uploading'
                        ? 'Uploading…'
                        : item.state === 'done'
                          ? 'Uploaded'
                          : item.state === 'failed'
                            ? (item.message ?? 'Did not upload')
                            : bytes(item.file.size))}
                  </span>
                </span>
                {item.state !== 'uploading' && (
                  <button
                    type="button"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-light hover:text-ink rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <SelectField
          label="Folder"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          placeholder="No folder"
          options={folderOptions(folders)}
        />
        <VisibilityChoice value={visibility} onChange={setVisibility} />
      </FormPanel>
    </>
  );
}

/* ─────────────────────────────────────────────────────── quick folders */

const COLOR_KEYS = ['gold', 'ink', 'green', 'blue', 'purple', 'red', 'grey'] as const;

export function QuickFolders({
  folders,
  canWrite,
  period,
  parent = null,
  title = 'Quick Folders',
}: {
  folders: FolderRow[];
  canWrite: boolean;
  period: string;
  /** Shows this folder's sub-folders and adds new folders inside it; null shows the top level. */
  parent?: FolderRow | null;
  title?: string;
}) {
  const [editing, setEditing] = React.useState<FolderRow | 'new' | null>(null);
  const [confirm, setConfirm] = React.useState<FolderRow | null>(null);
  const { run } = useRunner();
  const router = useRouter();
  const shown = parent
    ? (folderTree(folders).find((t) => t.folder.id === parent.id)?.subs ?? [])
    : folderTree(folders).map((t) => t.folder);
  const openHref = (f: FolderRow) =>
    hrefWith('/company/files', { tab: 'all', folder: f.id }) + (period ? `&${period}` : '');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">
          {title}
          {shown.length > 0 && (
            <span className="text-muted-light ml-2 text-xs font-semibold tabular-nums">
              {shown.length.toLocaleString('en-KE')}
            </span>
          )}
        </h2>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<FolderPlus className="h-4 w-4" />}
            onClick={() => setEditing('new')}
          >
            {parent ? 'Add Folder Here' : 'Add Folder'}
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          className="mt-4"
          size="sm"
          icon={<Folder className="h-5 w-5" />}
          title={parent ? 'No folders inside this one' : 'No folders yet'}
          description={
            parent
              ? 'Add folders here to sort its papers, or upload straight into it.'
              : 'Folders keep contracts, policies and finance papers apart. Add the first one, then upload into it.'
          }
          {...(canWrite
            ? { action: { label: 'Add Folder', onClick: () => setEditing('new') } }
            : {})}
        />
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {shown.map((f) => {
            const files = parent ? f.file_count : f.all_file_count;
            const size = parent ? f.bytes : f.all_bytes;
            const menu = (
              <ActionMenu
                label={`Actions for ${f.name}`}
                actions={[
                  {
                    label: 'Open',
                    icon: <FolderInput />,
                    onSelect: () => router.push(openHref(f)),
                  },
                  canWrite && {
                    label: 'Rename',
                    icon: <Pencil />,
                    opensOverlay: true,
                    onSelect: () => setEditing(f),
                  },
                  canWrite && {
                    label: 'Delete',
                    icon: <Trash2 />,
                    tone: 'danger' as const,
                    separated: true,
                    opensOverlay: true,
                    onSelect: () => setConfirm(f),
                  },
                ]}
              />
            );
            return (
              <li
                key={f.id}
                className="border-border hover:border-border-strong relative rounded-2xl border bg-white p-3.5 transition-[border-color,box-shadow] hover:shadow-[0_10px_24px_-18px_rgba(20,20,20,0.45)]"
              >
                <div className="flex items-start justify-between">
                  <Folder
                    className={cn(
                      'h-9 w-9 fill-current',
                      FOLDER_COLORS[f.color] ?? FOLDER_COLORS.gold,
                    )}
                    strokeWidth={1.2}
                    aria-hidden="true"
                  />
                  <div className="relative z-10">
                    {confirm?.id === f.id ? (
                      <ConfirmAction
                        open
                        onOpenChange={(o) => !o && setConfirm(null)}
                        anchor={menu}
                        title={`Delete “${f.name}”?`}
                        body={
                          f.sub_count > 0
                            ? 'Delete the folders inside it first; a folder that holds folders stays.'
                            : f.file_count > 0
                              ? 'Move or delete its files first; a folder with files in it stays.'
                              : 'The folder is empty, so nothing else changes.'
                        }
                        confirmLabel="Delete Folder"
                        onConfirm={async () => run(() => deleteFolder(f.id))}
                      />
                    ) : (
                      menu
                    )}
                  </div>
                </div>
                <a
                  href={openHref(f)}
                  className="focus-visible:ring-gold mt-3 block rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2"
                >
                  <span className="block text-sm font-extrabold leading-snug">{f.name}</span>
                  <span className="text-muted-light mt-0.5 block text-xs tabular-nums">
                    {!parent && f.sub_count > 0 && (
                      <>
                        {f.sub_count.toLocaleString('en-KE')}{' '}
                        {f.sub_count === 1 ? 'folder' : 'folders'} ·{' '}
                      </>
                    )}
                    {files.toLocaleString('en-KE')} {files === 1 ? 'file' : 'files'}
                    {files > 0 && ` · ${bytes(size)}`}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <FolderPanel
          folder={editing === 'new' ? null : editing}
          parent={editing === 'new' ? parent : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FolderPanel({
  folder,
  parent = null,
  onClose,
}: {
  folder: FolderRow | null;
  /** Where a new folder goes; null for the top level. */
  parent?: FolderRow | null;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(folder?.name ?? '');
  const [color, setColor] = React.useState(folder?.color ?? parent?.color ?? 'gold');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={folder ? 'Rename Folder' : parent ? `Add a Folder in ${parent.name}` : 'Add Folder'}
      submitLabel={folder ? 'Save' : 'Add Folder'}
      busy={busy}
      onSubmit={() =>
        run(() =>
          saveFolder({
            id: folder?.id,
            name,
            color,
            parentId: folder ? null : (parent?.id ?? null),
          }),
        )
      }
    >
      <TextField
        label="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder={parent ? 'Company registration' : 'Corporate and Legal'}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_KEYS.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="folder-colour"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'peer-focus-visible:ring-gold flex h-11 w-11 items-center justify-center rounded-xl border transition-colors peer-focus-visible:ring-2',
                  color === c ? 'border-ink bg-gold-soft' : 'border-border hover:bg-bg',
                )}
              >
                <Folder
                  className={cn('h-6 w-6 fill-current', FOLDER_COLORS[c])}
                  aria-hidden="true"
                />
                <span className="sr-only">{c}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </FormPanel>
  );
}
