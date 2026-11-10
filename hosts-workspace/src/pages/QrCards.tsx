import { useState } from 'react';

import { dateText } from '../model';
import { Badge, Button, Empty, Icon, Metric, PageHeader, Pager, Panel, Table } from '../ui';
import { useWorkspace } from '../workspace';
import { PropertyScope } from './Homes';

export function QrCardsPage() {
  const w = useWorkspace();
  const [page, setPage] = useState(1);
  const ids = new Set(w.units.map((unit) => unit.id));
  const cards = w.data.qrCards.filter((card) => ids.has(card.unitId));
  const activeCards = cards.filter((card) => card.status !== 'Voided');
  const placed = activeCards.filter((card) => card.status === 'Placed').length;
  const missing = w.units.filter(
    (unit) => unit.status !== 'Archived' && !activeCards.some((card) => card.unitId === unit.id),
  );
  const scansBySpot = new Map<string, number>();
  for (const card of cards)
    scansBySpot.set(card.spot, (scansBySpot.get(card.spot) ?? 0) + (card.scans30d ?? 0));
  const scans = [...scansBySpot.values()].reduce((sum, total) => sum + total, 0);
  const orders = cards.reduce((sum, card) => sum + card.orders, 0);
  const pageSize = 8;
  const current = Math.max(1, Math.min(page, Math.ceil(cards.length / pageSize)));
  return (
    <div className="management-page">
      <PageHeader title="QR cards" subtitle="Generate, track and manage cards across your units.">
        <Button onClick={() => w.go('properties')}>
          <Icon name="left" size={16} />
          Properties
        </Button>
        <Button
          variant="primary"
          disabled={!w.units.some((unit) => unit.status !== 'Archived')}
          onClick={() => w.edit('qrCards')}
        >
          <Icon name="add" size={16} />
          Generate QR card
        </Button>
      </PageHeader>
      {!w.setup.live && (
        <p className="mg-small-note">
          Cards open for guests after NexG verifies your host account.
        </p>
      )}
      <div className="mg-stats">
        <Metric
          label="Cards placed"
          value={placed + ' / ' + activeCards.length}
          note={activeCards.length - placed + ' to place'}
        />
        <Metric label="Scans · 30 days" value={scans} note="Guest scans" />
        <Metric label="Attributed orders" value={orders} />
        <Metric
          label="Retired cards still scanned"
          value={cards.filter((card) => card.status === 'Voided' && card.scans30d).length}
          note="Last 30 days"
        />
      </div>
      <div className="mg-row-actions">
        <PropertyScope />
      </div>
      {missing.length > 0 && (
        <p className="mg-small-note">
          Units awaiting a card · {missing.map((unit) => w.unitLabel(unit.id)).join(', ')}
        </p>
      )}
      <Panel className="mg-fill-panel">
        <div className="mg-panel-heading">
          <h2>Cards by unit</h2>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Unit</th>
              <th>Spot</th>
              <th>Generated</th>
              <th>Last scan</th>
              <th>Scans · 30 days</th>
              <th>Orders</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.slice((current - 1) * pageSize, current * pageSize).map((card) => (
              <tr key={card.id}>
                <td>
                  <strong>{card.token}</strong>
                </td>
                <td>{w.unitLabel(card.unitId)}</td>
                <td>{card.spot}</td>
                <td>{dateText(card.createdAt ?? '')}</td>
                <td>{dateText(card.lastScanAt ?? '')}</td>
                <td>{card.scans30d ?? 0}</td>
                <td>{card.orders}</td>
                <td>
                  <Badge tone={card.status === 'Placed' ? 'success' : 'neutral'}>
                    {card.status}
                  </Badge>
                </td>
                <td>
                  <Button onClick={() => w.inspect('qrCards', card.id)}>Open card</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!cards.length && (
          <Empty
            title="No QR cards in this view"
            description="Choose a property with cards or generate one for a unit."
          />
        )}
        <Pager page={current} total={cards.length} pageSize={pageSize} onChange={setPage} />
      </Panel>
      <Panel>
        <div className="mg-panel-heading">
          <h2>Scans by spot</h2>
          <p>Guest scans in the last 30 days.</p>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Placement</th>
              <th>Scans</th>
            </tr>
          </thead>
          <tbody>
            {[...scansBySpot]
              .sort((a, b) => b[1] - a[1])
              .map(([spot, scans]) => (
                <tr key={spot}>
                  <td>{spot}</td>
                  <td>{scans}</td>
                </tr>
              ))}
          </tbody>
        </Table>
        {!cards.length && <Empty title="No scans to display" />}
      </Panel>
    </div>
  );
}
