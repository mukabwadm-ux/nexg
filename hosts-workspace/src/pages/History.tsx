import { useEffect, useState } from 'react';

import { errorMessage, workspaceRequest } from '../client';
import type { HostHistory } from '../history';
import { Button, Empty, Icon, Metric, PageHeader, Pager, Panel, Table, Tabs } from '../ui';
import { useWorkspace } from '../workspace';
import { exportCsv } from './Management';

const pages = {
  support: {
    title: 'Support ticket history',
    description: 'Track tickets submitted to NexG.',
    back: 'inbox',
    backLabel: 'Inbox',
  },
  privacy: {
    title: 'Guest data-request status',
    description: 'Follow verified requests shared with your host account.',
    back: 'settings/privacy',
    backLabel: 'Privacy & security',
  },
  finance: {
    title: 'NexG statement and folios',
    description: 'Review the NexG ledger, invoices and room-charge history.',
    back: 'finances',
    backLabel: 'Finances',
  },
  analytics: {
    title: 'QR and order analytics',
    description: 'Review recorded scans and attributed guest orders.',
    back: 'reports',
    backLabel: 'Reports',
  },
};

export function HistoryPage({ kind }: { kind: keyof typeof pages }) {
  const { go, today, recordId } = useWorkspace();
  const details = pages[kind];
  const sensitive = kind === 'support' || kind === 'privacy';
  const [data, setData] = useState<HostHistory | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState(recordId === 'folios' ? 'Room folios' : '');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    workspaceRequest<HostHistory>('/history?kind=' + kind, { signal: controller.signal })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, 'This report could not be loaded.'));
      });
    return () => controller.abort();
  }, [kind, retry]);

  const table = data?.sections.find((item) => item.label === section) ?? data?.sections[0];
  const size = 8;
  const total = table?.rows.length ?? 0;
  const current = Math.max(1, Math.min(page, Math.ceil(total / size)));
  return (
    <div className="management-page">
      <PageHeader title={details.title} subtitle={details.description}>
        <Button
          onClick={() => {
            const [page, record] = details.back.split('/');
            go(page, record);
          }}
        >
          <Icon name="left" size={16} />
          {details.backLabel}
        </Button>
        {sensitive && (
          <Button variant="primary" onClick={() => go('inbox', 'new')}>
            Contact NexG
          </Button>
        )}
        {!sensitive && table && total > 0 && (
          <Button
            onClick={() =>
              exportCsv('nexg-' + kind + '-' + today + '.csv', [
                table.headers,
                ...table.rows.map((row) => row.cells),
              ])
            }
          >
            <Icon name="download" size={16} />
            Export CSV
          </Button>
        )}
      </PageHeader>
      {error ? (
        <Empty title="Report unavailable" description={error}>
          <Button onClick={() => setRetry(retry + 1)}>Retry</Button>
        </Empty>
      ) : null}
      {!data && !error && <p className="mg-small-note">Loading your records…</p>}
      {data && table && (
        <>
          {data.metrics.length > 0 && (
            <div className="mg-stats">
              {data.metrics.map((item) => (
                <Metric key={item.label} label={item.label} value={item.value} note={item.note} />
              ))}
            </div>
          )}
          {data.sections.length > 1 && (
            <Tabs
              items={data.sections.map((item) => item.label)}
              value={table.label}
              onChange={(value) => {
                setSection(value);
                setPage(1);
              }}
            />
          )}
          <Panel className="mg-fill-panel">
            <div className="mg-panel-heading">
              <div>
                <h2>{table.label}</h2>
                {table.note && <p>{table.note}</p>}
              </div>
            </div>
            <Table>
              <caption className="mg-sr-only">{table.label}</caption>
              <thead>
                <tr>
                  {table.headers.map((header) => (
                    <th scope="col" key={header}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice((current - 1) * size, current * size).map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => (
                      <td key={index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
            {!total && <Empty title="No records in this view" description={table.empty} />}
            <Pager page={current} total={total} pageSize={size} onChange={setPage} />
          </Panel>
        </>
      )}
    </div>
  );
}
