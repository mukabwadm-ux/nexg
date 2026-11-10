import { useLayoutEffect, useRef, useState } from 'react';
import { Accordion, AccordionItem } from '../components/base/accordion/accordion';
import type { Article, Unit } from '../model';
import { Badge, Button, Empty, Icon, Pager } from '../ui';
import { useWorkspace } from '../workspace';

function amenityIcon(title: string) {
  return /wash|clean/i.test(title)
    ? 'cleaning'
    : /kitchen|cook/i.test(title)
      ? 'package'
      : /air|bed/i.test(title)
        ? 'bed'
        : /water/i.test(title)
          ? 'home'
          : 'book';
}

function AmenityContent({ article, stepPageSize }: { article: Article; stepPageSize: number }) {
  const w = useWorkspace();
  const [page, setPage] = useState(1);
  const steps = article.steps
    .split('\n')
    .map((step) => step.trim())
    .filter(Boolean);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(steps.length / stepPageSize)));
  const offset = (currentPage - 1) * stepPageSize;

  return (
    <div className="amenity-instruction-content">
      {article.content && <p>{article.content}</p>}
      {!!steps.length && (
        <ol start={offset + 1}>
          {steps.slice(offset, offset + stepPageSize).map((step, index) => (
            <li key={offset + index}>
              <span className="amenity-step-number" aria-hidden="true">
                {offset + index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {steps.length > stepPageSize && (
        <div className="amenity-steps-controls" aria-label={`Steps for ${article.title}`}>
          <span>
            {offset + 1}–{Math.min(offset + stepPageSize, steps.length)} of {steps.length} steps
          </span>
          <div>
            <Button
              aria-label="Previous instruction steps"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <Icon name="left" size={14} />
            </Button>
            <Button
              aria-label="Next instruction steps"
              disabled={offset + stepPageSize >= steps.length}
              onClick={() => setPage(currentPage + 1)}
            >
              <Icon name="right" size={14} />
            </Button>
          </div>
        </div>
      )}
      {article.media && (
        <a className="amenity-media-link" href={article.media} target="_blank" rel="noreferrer">
          <Icon name="attachment" size={15} />
          {article.caption || 'Open photo or video'}
        </a>
      )}
      <div className="amenity-edit-actions">
        <Button onClick={() => w.edit('articles', article.id)}>
          <Icon name="attachment" size={15} />
          Add photo or video
        </Button>
        <Button variant="ghost" onClick={() => w.edit('articles', article.id)}>
          Edit instructions
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const revision =
              w.data.units.find((unit) => unit.id === article.unitId)?.guideRevision ?? 0;
            if (window.confirm('Remove this instruction from the draft?'))
              void w.run({
                type: 'delete',
                collection: 'articles',
                id: article.id,
                expectedVersion: revision,
                record: { unitId: article.unitId },
              });
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export function AmenityInstructions({
  unit,
  articles,
  activeId,
  onActiveChange,
  onManageQr,
}: {
  unit: Unit;
  articles: Article[];
  activeId?: string;
  onActiveChange: (id: string | null) => void;
  onManageQr: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(window.innerHeight < 740 ? 330 : 500);
  const [page, setPage] = useState(1);
  const pageSize = panelHeight < 300 ? 1 : panelHeight < 380 ? 2 : panelHeight < 480 ? 3 : 5;
  const stepPageSize = panelHeight < 300 ? 1 : panelHeight < 430 ? 2 : 3;
  const activeIndex = articles.findIndex((article) => article.id === activeId);
  const currentPage =
    activeIndex >= 0
      ? Math.floor(activeIndex / pageSize) + 1
      : Math.min(page, Math.max(1, Math.ceil(articles.length / pageSize)));
  const visibleArticles = articles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const updateHeight = () => setPanelHeight(Math.round(panel.clientHeight));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={panelRef}
      className="panel instructions-panel amenity-instructions-panel"
      data-density={panelHeight < 380 ? 'compact' : 'regular'}
      aria-labelledby={`amenities-${unit.id}`}
    >
      <h2 id={`amenities-${unit.id}`}>Amenity instructions</h2>
      {articles.length ? (
        <Accordion
          variant="divided"
          className="amenity-accordion"
          expandedKeys={new Set(activeId ? [activeId] : [])}
          onExpandedChange={(keys) => {
            setPage(currentPage);
            const next = keys.values().next().value;
            onActiveChange(next === undefined ? null : String(next));
          }}
        >
          {visibleArticles.map((article) => (
            <AccordionItem
              id={article.id}
              key={article.id}
              title={article.title}
              icon={<Icon name={amenityIcon(article.title)} size={20} />}
            >
              <AmenityContent key={article.id} article={article} stepPageSize={stepPageSize} />
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <Empty title="Add the first amenity" description="Write a short guide guests can follow." />
      )}
      {articles.length > pageSize && (
        <div className="amenity-pagination">
          <Pager
            page={currentPage}
            total={articles.length}
            pageSize={pageSize}
            onChange={(next) => {
              setPage(next);
              onActiveChange(null);
            }}
          />
        </div>
      )}
      <div className="guide-status">
        <span>
          <Icon name="book" size={18} />
          Guest guide ·{' '}
          <Badge tone={unit.guidePublished ? 'success' : 'warning'}>
            {unit.guidePublished ? 'Published' : 'Draft'}
          </Badge>
        </span>
        <Button variant="ghost" onClick={onManageQr}>
          <Icon name="qr" size={19} />
          Manage QR cards
        </Button>
      </div>
    </section>
  );
}
