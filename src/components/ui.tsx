import { ReactNode } from 'react';
import { delta, percent } from '../lib/format';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Card */

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('card overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold leading-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cx('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------- Stat tile */

/**
 * A single headline number. The form heuristic says a lone magnitude is a stat
 * tile, not a chart — the delta line carries the change instead of a trend plot.
 */
export function Stat({
  label,
  value,
  hint,
  current,
  previous,
  /** For cost, a rise is bad; for call volume it is good. */
  invert = false,
  icon,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  current?: number;
  previous?: number;
  invert?: boolean;
  icon?: ReactNode;
  index?: number;
}) {
  const change = typeof current === 'number' && typeof previous === 'number' ? delta(current, previous) : null;
  const good = change === null ? null : invert ? change < 0 : change > 0;

  return (
    <div
      className="card card-hover animate-fade-up p-5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
        {icon && <span className="text-brand-400">{icon}</span>}
      </div>

      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink tnum">{value}</div>

      <div className="mt-2.5 flex items-center gap-2 text-xs">
        {change !== null && (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium tnum',
              good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
            )}
          >
            <Arrow up={change > 0} />
            {percent(Math.abs(change))}
          </span>
        )}
        {hint && <span className="text-ink-muted">{hint}</span>}
      </div>
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={up ? '' : 'rotate-180'}>
      <path d="M5 1.5 L9 7 H1 Z" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Badge */

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  booked: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  in_progress: 'bg-brand-50 text-brand-700 ring-brand-500/20',
  rescheduled: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  no_answer: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  cancelled: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  error: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

/** Status never rides on colour alone — the label is always present, and a live
 *  call additionally gets a pulsing dot. */
export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/[\s-]+/g, '_');
  const style = STATUS_STYLES[key] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20';
  const live = key === 'in_progress';

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        style,
      )}
    >
      {live ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      )}
      {key.replace(/_/g, ' ')}
    </span>
  );
}

export function DirectionPill({ direction }: { direction: string | null }) {
  if (!direction) return <span className="text-ink-faint">—</span>;
  const inbound = direction === 'inbound';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={inbound ? 'text-brand-500' : 'text-slate-400'}>
        <path
          d={inbound ? 'M9 3 L3 9 M3 5.5 V9 H6.5' : 'M3 9 L9 3 M8.5 6.5 V3 H5'}
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {inbound ? 'Inbound' : 'Outbound'}
    </span>
  );
}

/* ------------------------------------------------------------- Empty/Error */

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center animate-fade-in">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-400">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13.5 13.5 L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="max-w-sm text-xs leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center animate-fade-in">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 6.5v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="10" cy="14" r="1" fill="currentColor" />
          <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-ink">Could not load this view</p>
        <p className="mt-1 max-w-md text-xs text-ink-muted">{message}</p>
      </div>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8" />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              'rounded-[7px] px-3 py-1.5 text-xs font-medium transition-all duration-200',
              active ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-muted hover:text-brand-600',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Table */

export function Th({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={cx(
        'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-white/95 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted backdrop-blur',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cx('whitespace-nowrap px-4 py-3 text-sm text-ink', align === 'right' && 'text-right tnum', className)}>
      {children}
    </td>
  );
}
