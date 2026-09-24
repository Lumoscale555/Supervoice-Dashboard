import { ReactNode, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cx } from './ui';

/* Categorical slots, in fixed order — assigned by entity, never by rank, so a
   filter that drops a series never repaints the survivors. Validated against a
   white surface (lightness band, chroma floor, CVD separation, normal-vision
   floor all pass). Slots 3 and 4 sit under 3:1 contrast, so every chart that
   uses them carries direct labels and a table view. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;

/** Reserved status colours — never reused as a series colour. */
export const STATUS_COLOR: Record<string, string> = {
  completed: '#0ca30c',
  in_progress: '#2a78d6',
  no_answer: '#fab219',
  'no-answer': '#fab219',
  failed: '#d03b3b',
};

const GRID = '#e6ecf5';
const AXIS_TICK = { fill: '#84837d', fontSize: 11 };

/* ------------------------------------------------------------- Tooltip */

function TooltipCard({ title, rows, total }: { title: string; rows: Array<{ label: string; value: string; color?: string }>; total?: string }) {
  return (
    <div className="pointer-events-none min-w-[180px] rounded-xl border border-line bg-white/95 p-3 shadow-pop backdrop-blur">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              {row.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color }} />}
              {row.label}
            </span>
            {/* Values wear text ink, never the series colour. */}
            <span className="font-medium text-ink tnum">{row.value}</span>
          </div>
        ))}
      </div>
      {total && (
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-line pt-2 text-xs">
          <span className="text-ink-muted">Total</span>
          <span className="font-semibold text-ink tnum">{total}</span>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Legend */

export function Legend({ items }: { items: Array<{ label: string; color: string; value?: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.value && <span className="font-medium text-ink tnum">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Charts whose palette includes a sub-3:1 slot must offer the numbers as text. */
export function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button className="btn-ghost !h-8 !px-2.5 text-xs" onClick={onToggle} aria-expanded={open}>
      {open ? 'Hide table' : 'View as table'}
    </button>
  );
}

/* --------------------------------------------------------- Call volume */

export interface VolumePoint {
  date: string;
  label: string;
  total: number;
  connected: number;
}

/** One series, so the title names it and no legend box is needed. */
export function CallVolumeChart({ data, height = 220 }: { data: VolumePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} allowDecimals={false} />

        <Tooltip
          cursor={{ stroke: SERIES[0], strokeWidth: 1, strokeDasharray: '3 3' }}
          content={({ active, payload }: any) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as VolumePoint;
            return (
              <TooltipCard
                title={p.label}
                rows={[
                  { label: 'Calls', value: p.total.toLocaleString(), color: SERIES[0] },
                  { label: 'Connected', value: p.connected.toLocaleString() },
                ]}
              />
            );
          }}
        />

        <Area
          type="monotone"
          dataKey="total"
          stroke={SERIES[0]}
          strokeWidth={2}
          fill="url(#volumeFill)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          animationDuration={700}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------- Spend */

export interface SpendPoint {
  label: string;
  calls: number;
  cost_inr: number;
}

/** Flat-rate billing (Rs.5/min) is one number per day — one series,
 *  so the title names it and no legend box is needed. */
export function SpendChart({ data, height = 240 }: { data: SpendPoint[]; height?: number }) {
  const money = (n: number) => `₹${n.toFixed(2)}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `₹${v}`} />

        <Tooltip
          cursor={{ fill: 'rgba(42, 120, 214, 0.06)' }}
          content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as SpendPoint;
            return (
              <TooltipCard
                title={String(label)}
                rows={[{ label: 'Calls billed', value: p.calls.toLocaleString(), color: SERIES[0] }]}
                total={money(p.cost_inr)}
              />
            );
          }}
        />

        <Bar dataKey="cost_inr" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={650} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------- Horizontal bars */

export interface RankRow {
  label: string;
  value: number;
  sub?: string;
}

/**
 * Ranked magnitudes read better as labelled rows than as a pie: one hue, direct
 * value labels, no legend needed.
 */
export function RankedBars({ rows, format, emptyLabel = 'No data in this period' }: { rows: RankRow[]; format: (n: number) => string; emptyLabel?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;

  if (!rows.length) return <p className="py-8 text-center text-xs text-ink-muted">{emptyLabel}</p>;

  return (
    <ul className="space-y-3">
      {rows.map((row, i) => (
        <li key={row.label} className="group animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-ink">{row.label}</span>
            <span className="shrink-0 text-sm font-medium text-ink tnum">{format(row.value)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out group-hover:bg-brand-600"
                style={{ width: `${Math.max((row.value / max) * 100, 1.5)}%` }}
              />
            </div>
            {row.sub && <span className="w-20 shrink-0 text-right text-[11px] text-ink-muted tnum">{row.sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------- Outcome mix bar */

/**
 * A parts-of-a-whole bar. Status colours carry state, and every segment is
 * labelled in the legend beneath, so hue is never the only cue.
 */
export function OutcomeBar({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!total) return <p className="py-6 text-center text-xs text-ink-muted">No calls in this period</p>;

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="h-full transition-opacity duration-200 hover:opacity-80"
            style={{ width: `${(value / total) * 100}%`, background: STATUS_COLOR[key] ?? '#b9c6da' }}
            title={`${key.replace(/[_-]/g, ' ')}: ${value}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {entries
          .sort(([, a], [, b]) => b - a)
          .map(([key, value]) => (
            <li key={key} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-ink-muted">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[key] ?? '#b9c6da' }} />
                {key.replace(/[_-]/g, ' ')}
              </span>
              <span className="text-ink tnum">
                <span className="font-medium">{value.toLocaleString()}</span>
                <span className="ml-1.5 text-ink-faint">{((value / total) * 100).toFixed(0)}%</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- Mini sparkbar */

export function SparkBars({ values, color = SERIES[0] }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-8 items-end gap-[2px]" aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[2px] transition-all duration-500"
          style={{ height: `${Math.max((v / max) * 100, 4)}%`, background: color, opacity: 0.25 + (v / max) * 0.75 }}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------- Table relief */

export function DataTable({ head, rows, className }: { head: string[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cx('mt-4 overflow-x-auto rounded-xl border border-line', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={cx(
                  'border-b border-line bg-brand-50/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted',
                  i === 0 ? 'text-left' : 'text-right',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line last:border-0 hover:bg-brand-50/30">
              {row.map((cell, c) => (
                <td key={c} className={cx('px-3 py-2 text-ink', c === 0 ? 'text-left' : 'text-right tnum')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useTableRelief() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((v) => !v) };
}

export { Cell };
