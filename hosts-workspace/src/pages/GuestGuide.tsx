import { useEffect, useState } from 'react';
import type { Article } from '../model';
import { ModelViewer } from '../ModelViewer';
import { errorMessage, workspaceRequest } from '../client';
import { Button, Empty, PageHeader, Panel } from '../ui';
import { useWorkspace } from '../workspace';
import { guideAsset } from './UnitGuide';

type Instruction = Pick<
  Article,
  'id' | 'title' | 'room' | 'content' | 'steps' | 'media' | 'caption' | 'x' | 'y' | 'markerHeight'
>;
interface GuideContent {
  unitName: string;
  document: { articles: Instruction[]; planId?: string | null; modelId?: string | null };
}

function Guide({ guide, code }: { guide: GuideContent; code?: string }) {
  const [model, setModel] = useState(false);
  const [open, setOpen] = useState('');
  const {
    unitName,
    document: { articles, planId, modelId },
  } = guide;
  return (
    <div className="guest-guide-content">
      <Panel className="guest-guide-heading">
        <p>Guest guide</p>
        <h1>{unitName}</h1>
        <span>Instructions for your stay</span>
      </Panel>
      {planId && (
        <Panel>
          <h2>Floor plan</h2>
          <div className="connected-guide-plan">
            <img src={guideAsset(planId, code)} alt="Unit floor plan" />
          </div>
        </Panel>
      )}
      {modelId && (
        <Panel>
          <Button onClick={() => setModel(!model)}>
            {model ? 'Close 3D model' : 'Open 3D model'}
          </Button>
          {model && (
            <ModelViewer
              source={guideAsset(modelId, code)}
              markers={articles}
              selected={open}
              onSelect={setOpen}
            />
          )}
        </Panel>
      )}
      {articles.map((article) => (
        <details key={article.id} className="panel" open={open === article.id}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setOpen(open === article.id ? '' : article.id);
            }}
          >
            <strong>{article.title}</strong>
            {article.room && <small>{article.room}</small>}
          </summary>
          <div className="guest-guide-article">
            {article.content && <p>{article.content}</p>}
            {article.steps && (
              <ol>
                {article.steps
                  .split('\n')
                  .map((step) => step.trim())
                  .filter(Boolean)
                  .map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
              </ol>
            )}
            {article.media && (
              <a href={article.media} target="_blank" rel="noreferrer">
                {article.caption || 'Open photo or video'}
              </a>
            )}
          </div>
        </details>
      ))}
      {!articles.length && (
        <Empty
          title="No instructions yet"
          description="Add amenity instructions to prepare this guide."
        />
      )}
      {code && (
        <a className="btn" href={'/q/' + encodeURIComponent(code)}>
          Back to your unit
        </a>
      )}
    </div>
  );
}

export function GuestGuidePage({ code }: { code: string }) {
  const [guide, setGuide] = useState<GuideContent | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    workspaceRequest<GuideContent>('/guide?code=' + encodeURIComponent(code), {
      signal: abort.signal,
    })
      .then((result) => {
        setGuide(result);
        window.document.title = 'Guest guide · NexG Stays';
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(errorMessage(cause, 'This guest guide could not be opened.'));
      });
    return () => abort.abort();
  }, [code]);
  return (
    <main className="guest-guide-page">
      {guide ? (
        <Guide guide={guide} code={code} />
      ) : (
        <Empty
          title={error ? 'Guest guide unavailable' : 'Opening your guide'}
          description={error}
        />
      )}
    </main>
  );
}

export function GuestGuidePreview() {
  const w = useWorkspace();
  const unit = w.data.units.find((unit) => unit.id === w.recordId);
  if (!unit)
    return (
      <Empty title="Choose a unit">
        <Button onClick={() => w.go('properties')}>Properties</Button>
      </Empty>
    );
  return (
    <div className="management-page">
      <PageHeader title="Guest guide preview" subtitle="This preview shows your private draft.">
        <Button onClick={() => w.go('unit', unit.id, 'guest-guide')}>Back to editor</Button>
      </PageHeader>
      <div className="guest-guide-preview">
        <Guide
          guide={{
            unitName: (unit.labelPublic as string) || unit.name,
            document: {
              articles: w.data.articles.filter((article) => article.unitId === unit.id),
              planId: unit.planId,
              modelId: unit.modelId,
            },
          }}
        />
      </div>
    </div>
  );
}
