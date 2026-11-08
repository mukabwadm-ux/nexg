import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { errorMessage, workspaceRequest, WorkspaceConnectionError } from './client';
import type { Collection, Command, DialogState, WorkspaceSnapshot } from './model';

function locationFromHash() {
  const view = window.location.hash.slice(1) || new URLSearchParams(window.location.search).get('open') || '';
  const [page = 'overview', id = '', section = ''] = view.split('/');
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  return { page: page || 'overview', recordId: decode(id), section: decode(section) };
}

export function hostSignIn() {
  window.location.replace('/sign-in?role=host&next=%2Fhost');
}

function workspaceAction<T>(action: object) {
  return workspaceRequest<T>('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
}

function useWorkspaceState(initial: WorkspaceSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [scope, setScope] = useState('all');
  const [route, setRoute] = useState(() => !window.location.hash && !new URLSearchParams(window.location.search).has("open") && !initial.setup.live
    ? { page:'setup', recordId:'', section:'' }
    : locationFromHash());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, notify] = useState('');
  const { data, actor, today, propertyWrites, setup } = snapshot;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('open')) {
      if (!url.hash) url.hash = url.searchParams.get('open') ?? '';
      url.searchParams.delete('open');
      window.history.replaceState(window.history.state, '', url);
    }
    const onHash = () => setRoute(locationFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => notify(''), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function handleError(error: unknown, fallback: string) {
    if (error instanceof WorkspaceConnectionError && error.status === 401) hostSignIn();
    else notify(errorMessage(error, fallback));
  }

  async function refresh() {
    try {
      setSnapshot(await workspaceRequest<WorkspaceSnapshot>());
    } catch (error) {
      handleError(error, 'The latest workspace records could not be loaded.');
    }
  }

  function canEdit(collection: Collection, id?: string) {
    if (collection === 'articles') return !id || data.articles.some(article => article.id === id);
    if (collection === 'properties') return propertyWrites;
    if (collection === 'units') return id ? data.units.some(unit=>unit.id===id) : propertyWrites;
    if (collection === 'stays') {
      const stay = data.stays.find((row) => row.id === id);
      return !id || stay?.status === 'Confirmed';
    }
    if (collection === 'tasks' && id) return data.tasks.some(task => task.id === id && task.workspaceTask);
    if (collection === 'packages') return propertyWrites && (!id || data.packages.some(item=>item.id===id&&item.editable));
    return ['qrCards', 'tasks', 'payments', 'expenses', 'packageJobs'].includes(collection) && !id;
  }

  const units = data.units.filter((unit) => scope === 'all' || unit.propertyId === scope);
  const unitIds = new Set(units.map((unit) => unit.id));
  const stays = data.stays.filter((stay) => unitIds.has(stay.unitId));
  const propertyLabel = (id: string) =>
    data.properties.find((property) => property.id === id)?.name || 'All properties';

  return {
    data, actor, today, setup, propertyWrites, scope, setScope, units, stays, ...route,
    dialog, notify, propertyLabel, canEdit, refresh,
    closeDialog: () => setDialog(null),
    unitLabel: (id: string) => {
      const unit = data.units.find((row) => row.id === id);
      return unit ? (unit.propertyId ? propertyLabel(unit.propertyId) + ' · ' : '') + unit.name : 'Workspace';
    },
    go: (page: string, id = '', section = '') => {
      window.location.hash =
        page + (id || section ? '/' + encodeURIComponent(id) : '') +
        (section ? '/' + encodeURIComponent(section) : '');
      setDialog(null);
    },
    edit: (collection: Collection, id?: string, defaults?: Record<string, unknown>) => {
      if (!canEdit(collection, id)) {
        notify('This action is unavailable for this record in the connected workspace.');
        return;
      }
      setDialog({ collection, id, defaults, mode: 'edit' });
    },
    inspect: (collection: Collection, id: string) => setDialog({ collection, id, mode: 'detail' }),
    async run(command: Command) {
      try {
        const result = await workspaceAction<{ message: string }>({ action: 'command', command });
        notify(result.message);
        await refresh();
        return true;
      } catch (error) {
        handleError(error, 'Saving could not be confirmed. Refresh before trying again.');
        return false;
      }
    },
    async signOut() {
      try {
        await workspaceAction({ action: 'sign-out' });
        hostSignIn();
      } catch (error) {
        handleError(error, 'Sign-out could not be completed.');
      }
    },
    toast,
  };
}

const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(null);

export function useWorkspace() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error('Workspace is unavailable');
  return workspace;
}

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const workspace = useWorkspaceState(initial);
  return (
    <Context.Provider value={workspace}>
      {children}
      {workspace.toast && (
        <div className="toast" role="status">
          <span>{workspace.toast}</span>
          <button aria-label="Dismiss notification" onClick={() => workspace.notify('')}>×</button>
        </div>
      )}
    </Context.Provider>
  );
}
