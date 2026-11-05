import type { ReactNode } from 'react';

export function PromotionsHeading({
  title = 'Promotions',
  description,
  actions,
}: {
  title?: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="pm-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
    </div>
  );
}

export function PromotionsEmpty({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="pm-empty">
      <strong>{title}</strong>
      <p>{description}</p>
      {actions}
    </div>
  );
}
