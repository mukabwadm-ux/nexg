import Link from 'next/link';
import * as React from 'react';

/**
 * The rider portal's own pieces, drawn to the rider mockups: a page head
 * with the title on the left and its controls on the right, white rounded
 * panels, KPI cards with a round icon, yellow pill tabs, an area chart and
 * a donut. Server components, no chart library: the charts are plain SVG
 * with every value also in text for screen readers.
 */

export const kes = (value: number | null | undefined) =>
  value == null
    ? '—'
    : `${value < 0 ? '− ' : ''}KSh ${Math.abs(Math.round(value)).toLocaleString('en-KE')}`;

export const ring =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rider-ink)]';

export const panel = 'min-w-0 rounded-[20px] border border-[#e6e9f2] bg-white p-4 sm:p-5';

export function RiderPage({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">{children}</div>;
}

export function PageHead({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.01em] text-[color:var(--rider-ink)]">
          {title}
        </h1>
        <p className="mt-0.5 text-[15px] font-medium text-slate-600">{lead}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Yellow pill tabs that are links, so the choice lives in the URL. */
export function PillTabs({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; on: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          scroll={false}
          aria-current={item.on ? 'page' : undefined}
          className={`rounded-full px-4 py-2 text-[13.5px] font-extrabold transition-colors ${ring} ${
            item.on
              ? 'bg-gold text-[color:var(--rider-ink)] shadow-[0_6px_14px_-8px_rgb(var(--gold-deep-rgb)/0.8)]'
              : 'hover:bg-gold/20 bg-white text-slate-700'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function PanelTitle({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[17px] font-extrabold text-[color:var(--rider-ink)]">{title}</h2>
        {note ? <p className="text-[13px] font-medium text-slate-500">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

const ICON_TONES = {
  gold: 'bg-gold text-[color:var(--rider-ink)]',
  green: 'bg-green-600 text-white',
  amber: 'bg-amber-100 text-amber-600',
  blue: 'bg-blue-100 text-blue-700',
  red: 'bg-red-100 text-red-700',
};

export function KpiCard({
  icon,
  tone,
  value,
  label,
  change,
}: {
  icon: React.ReactNode;
  tone: keyof typeof ICON_TONES;
  value: string;
  label: string;
  change?: { now: number; before: number } | null;
}) {
  return (
    <div className={`${panel} flex items-center gap-4`}>
      <span
        aria-hidden="true"
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${ICON_TONES[tone]} [&>svg]:h-7 [&>svg]:w-7`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[24px] font-extrabold tabular-nums leading-tight text-[color:var(--rider-ink)] [overflow-wrap:break-word]">
          {value}
        </p>
        <p className="text-[13.5px] font-semibold text-slate-600">{label}</p>
        {change ? <ChangeNote {...change} /> : null}
      </div>
    </div>
  );
}

/** "+12%" against the period before, or nothing when there was nothing before. */
export function ChangeNote({ now, before }: { now: number; before: number }) {
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  const up = change >= 0;
  return (
    <p className={`mt-0.5 text-[13px] font-extrabold ${up ? 'text-green-700' : 'text-red-700'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      <span className="sr-only">{up ? 'Up' : 'Down'}</span> {up ? '+' : '−'}
      {Math.abs(change)}% <span className="font-semibold text-slate-500">vs before</span>
    </p>
  );
}

/**
 * An area chart of money per bucket. The best bucket carries a dark
 * callout, as in the mockup, so the chart says something without hover.
 */
export function AreaChart({
  points,
  label,
}: {
  points: { label: string; long: string; value: number }[];
  label: string;
}) {
  const W = 640;
  const H = 220;
  const padL = 44;
  const padB = 26;
  const padT = 34;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const innerW = W - padL - 12;
  const innerH = H - padB - padT;
  const x = (i: number) =>
    padL + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${padT + innerH} L${x(0)},${padT + innerH} Z`;
  const best = points.reduce((b, p, i) => (p.value > (points[b]?.value ?? 0) ? i : b), 0);
  const bestPoint = points[best];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const every = Math.ceil(points.length / 8);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        <defs>
          <linearGradient id="rider-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D2AF26" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#D2AF26" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 12} y1={y(t)} y2={y(t)} stroke="#eef0f6" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {short(t)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#rider-area)" />
        <path d={line} fill="none" stroke="#f5b800" strokeWidth="3" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.long}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={i === best ? 6 : 3.5}
              fill="#f5b800"
              stroke="#fff"
              strokeWidth="2"
            >
              <title>{`${p.long}: ${kes(p.value)}`}</title>
            </circle>
            {i % every === 0 || i === points.length - 1 ? (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#475569">
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
        {bestPoint && bestPoint.value > 0 ? (
          <g
            transform={`translate(${Math.min(Math.max(x(best), padL + 50), W - 62)}, ${Math.max(y(bestPoint.value) - 14, 18)})`}
          >
            <rect x="-50" y="-30" width="100" height="32" rx="7" fill="#141a2a" />
            <text y="-15" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
              {kes(bestPoint.value)}
            </text>
            <text y="-3" textAnchor="middle" fontSize="9.5" fill="#cbd5e1">
              {bestPoint.long}
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="sr-only">
        {points.map((p) => `${p.long}: ${kes(p.value)}`).join('; ')}
      </figcaption>
    </figure>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil((v * 1.1) / step) * step;
}

function short(v: number): string {
  return v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
}

/** A ring split into parts, biggest share in the middle. */
export function Donut({
  parts,
  label,
}: {
  parts: { label: string; value: number; colour: string }[];
  label: string;
}) {
  const total = parts.reduce((sum, p) => sum + Math.max(p.value, 0), 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const top = [...parts].sort((a, b) => b.value - a.value)[0];
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef0f6" strokeWidth="18" />
        {total > 0
          ? parts.map((p) => {
              const len = (Math.max(p.value, 0) / total) * c;
              const el = (
                <circle
                  key={p.label}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  stroke={p.colour}
                  strokeWidth="18"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              );
              offset += len;
              return el;
            })
          : null}
        <text x="70" y="70" textAnchor="middle" fontSize="22" fontWeight="800" fill="#141a2a">
          {top && total > 0 ? `${pct(top.value)}%` : '—'}
        </text>
        <text x="70" y="88" textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569">
          {top && total > 0 ? top.label : 'Nothing yet'}
        </text>
      </svg>
      <ul className="min-w-[10rem] flex-1 space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[13.5px] font-semibold">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: p.colour }}
            />
            <span className="flex-1 text-slate-700">{p.label}</span>
            <span className="font-extrabold tabular-nums text-[color:var(--rider-ink)]">
              {pct(p.value)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An empty state: what is missing and what fills it. */
export function Nothing({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center rounded-2xl bg-[#f6f7fb] px-4 py-8 text-center">
      <p className="text-[15px] font-extrabold text-[color:var(--rider-ink)]">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] font-medium text-slate-600">{body}</p>
    </div>
  );
}

/** One label and amount in a <dl>. */
export function SumLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-semibold text-slate-600">{label}</dt>
      <dd
        className={`shrink-0 tabular-nums ${strong ? 'text-[15px] font-extrabold' : 'font-bold'}`}
      >
        {value}
      </dd>
    </div>
  );
}
