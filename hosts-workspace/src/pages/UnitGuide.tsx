import { useState } from 'react';
import type { Unit } from '../model';
import { ModelViewer } from '../ModelViewer';
import { errorMessage, workspaceRequest } from '../client';
import { Badge, Button, Empty, Icon, Pager, Panel, Table, Tabs } from '../ui';
import { useWorkspace } from '../workspace';
import { AmenityInstructions } from './AmenityInstructions';

export function guideAsset(id: string, code?: string) {
  return '/api/host-workspace/guide/asset?' + new URLSearchParams(code ? { id, code } : { id });
}

export function UnitGuideEditor({ unit }: { unit: Unit }) {
  const w = useWorkspace();
  const [tab, setTab] = useState('Unit map');
  const [mode, setMode] = useState(unit.planId && !unit.modelId ? '2D plan' : '3D');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const articles = w.data.articles.filter(article => article.unitId === unit.id);
  const card = w.data.qrCards.find(card => card.unitId === unit.id && card.status === 'Placed');

  async function upload(file: File, kind: 'plan' | 'model') {
    if (busy) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const query = new URLSearchParams({ unit: unit.id, revision: String(unit.guideRevision ?? 0), kind });
      const result = await workspaceRequest<{ message: string }>('/guide?' + query, { method: 'POST', body });
      await w.refresh();
      setMode(kind === 'plan' ? '2D plan' : '3D');
      w.notify(result.message);
    } catch (error) {
      w.notify(errorMessage(error, 'The guide file could not be attached.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: 'plan' | 'model') {
    setBusy(true);
    try {
      await w.run({ type: 'remove-guide-file', collection: 'units', id: unit.id,
        expectedVersion: unit.guideRevision ?? 0, record: { kind } });
    } finally { setBusy(false); }
  }

  return <>
    <div className="guide-intro"><h2>Help guests feel at home</h2></div>
    <div className="guide-subnav">
      <Tabs items={['Instructions','Unit map']} value={tab} onChange={setTab}/>
      {unit.guidePublished && card && <a className="btn" href={'/q/' + encodeURIComponent(card.token) + '/guide'} target="_blank" rel="noreferrer">Open published guide</a>}
      <Button onClick={() => w.edit('articles', undefined, { unitId: unit.id })}><Icon name="add" size={17}/>Add instructions</Button>
    </div>
    <div className={tab === 'Unit map' ? 'unit-guide-grid' : 'guide-instructions-only'}>
      {tab === 'Unit map' && <Panel className="map-panel">
        <div className="panel-heading"><h2>Unit map</h2><small>Optional floor plan and 3D model</small></div>
        {mode === '3D' ? unit.modelId
          ? <ModelViewer key={unit.modelId} source={guideAsset(unit.modelId)} markers={articles} selected={selected ?? undefined} onSelect={setSelected}/>
          : <Empty title="Add a 3D model" description="Choose a self-contained GLB file up to 12 MB."/>
          : unit.planId
            ? <div className="connected-guide-plan unit-guide-plan"><img src={guideAsset(unit.planId)} alt="Unit floor plan"/></div>
            : <Empty title="Add a floor plan" description="Choose a PNG, JPEG or WebP file up to 2 MB."/>}
        <div className="map-footer">
          <Tabs items={['3D','2D plan']} value={mode} onChange={setMode}/>
          <label className="field">
            <span>{busy ? 'Saving file…' : mode === '3D' ? 'Upload GLB' : 'Upload floor plan'}</span>
            <input type="file" disabled={busy} accept={mode === '3D' ? '.glb' : 'image/png,image/jpeg,image/webp'}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void upload(file, mode === '3D' ? 'model' : 'plan');
              }}/>
          </label>
          {(mode === '3D' ? unit.modelId : unit.planId) && <Button disabled={busy} onClick={() => void remove(mode === '3D' ? 'model' : 'plan')}>Remove from draft</Button>}
        </div>
      </Panel>}
      <AmenityInstructions unit={unit} articles={articles} activeId={selected ?? undefined} onActiveChange={setSelected}
        onManageQr={() => w.go('unit', unit.id, 'qr-cards')}/>
    </div>
  </>;
}

export function UnitGuideHistory({ unit }: { unit: Unit }) {
  const w = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const versions = w.data.versions.filter(version => version.unitId === unit.id);
  const size = 6;
  const current = Math.min(page, Math.max(1, Math.ceil(versions.length / size)));

  async function change(type: 'restore' | 'unpublish', versionId?: string) {
    const confirmed = window.confirm(type === 'restore' ? 'Publish a copy of this version and replace the current draft?' : 'Hide the published guide from guest QR links?');
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await w.run({ type, collection: 'units', id: unit.id, expectedVersion: unit.guideRevision ?? 0, record: { versionId } });
    } finally { setBusy(false); }
  }

  return <Panel className="grow">
    <div className="panel-heading">
      <div><h2>Published guide history</h2><small>Restoring a version creates a new publication.</small></div>
      {unit.guidePublished && <Button disabled={busy} onClick={() => void change('unpublish')}>Unpublish guide</Button>}
    </div>
    <Table><thead><tr><th>Published</th><th>Instructions</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{versions.slice((current-1)*size,current*size).map(version => <tr key={version.id}>
        <td>{version.date?.replace('T',' ')}</td><td>{Number(version.articleCount)}</td>
        <td><Badge tone={version.status === 'Current' ? 'success' : 'neutral'}>{version.status}</Badge></td>
        <td><Button disabled={busy} onClick={() => void change('restore',version.id)}>Restore version</Button></td>
      </tr>)}</tbody>
    </Table>
    {!versions.length && <Empty title="No published versions" description="Publish the draft to create your first version."/>}
    <Pager page={current} total={versions.length} pageSize={size} onChange={setPage}/>
  </Panel>;
}
