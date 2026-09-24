import { useMemo, useState } from 'react';
import { useStreamQuery } from '../lib/api';
import type { Appointment, RangeKey } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Card, EmptyState, ErrorState, Skeleton, TableSkeleton, Th, Td, cx } from '../components/ui';
import { dateTime, phone, titleCase } from '../lib/format';

// Label reflects the outcome (status), not just the action attempted (kind) —
// a failed booking attempt must read "Failed", never "Booked" in red.
const STATUS_LABEL: Record<string, string> = { booked: 'Booked', rescheduled: 'Rescheduled', cancelled: 'Cancelled', failed: 'Failed' };
const STATUS_STYLE: Record<string, string> = {
  booked: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rescheduled: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  cancelled: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

export default function Appointments() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [kindFilter, setKindFilter] = useState<string>('');

  const { items, meta, error, streaming, initial, refresh } = useStreamQuery<Appointment>(
    '/api/appointments/stream',
    { range, scan_limit: 80 },
  );

  const rows = useMemo(() => {
    return kindFilter ? items.filter((a) => a.status === kindFilter) : items;
  }, [items, kindFilter]);

  const summary = useMemo(() => ({
    booked: items.filter((a) => a.status === 'booked').length,
    rescheduled: items.filter((a) => a.status === 'rescheduled').length,
    cancelled: items.filter((a) => a.status === 'cancelled').length,
    failed: items.filter((a) => a.status === 'failed').length,
  }), [items]);

  const scannedCalls = Number((meta as Record<string, unknown>).scanned_calls ?? 0);
  const totalCalls = Number((meta as Record<string, unknown>).total_calls_in_window ?? 0);

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Bookings, reschedules and cancellations your agents handled during calls."
        range={range}
        onRangeChange={setRange}
      />

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {initial ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)
        ) : (
          <>
            <SummaryTile label="Booked" value={summary.booked} tone="emerald" active={kindFilter === 'booked'} onClick={() => setKindFilter((k) => (k === 'booked' ? '' : 'booked'))} />
            <SummaryTile label="Rescheduled" value={summary.rescheduled} tone="amber" active={kindFilter === 'rescheduled'} onClick={() => setKindFilter((k) => (k === 'rescheduled' ? '' : 'rescheduled'))} />
            <SummaryTile label="Cancelled" value={summary.cancelled} tone="slate" active={kindFilter === 'cancelled'} onClick={() => setKindFilter((k) => (k === 'cancelled' ? '' : 'cancelled'))} />
            <SummaryTile label="Failed" value={summary.failed} tone="rose" active={kindFilter === 'failed'} onClick={() => setKindFilter((k) => (k === 'failed' ? '' : 'failed'))} />
          </>
        )}
      </div>

      <Card className="mt-6" bodyClassName="!px-0 !py-0">
        {error && !items.length ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : initial ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : !rows.length && !streaming ? (
          <EmptyState
            title="No appointments found"
            body="No booking tool calls were found in the scanned calls for this period. If your agent uses different tool names, adjust the tool map — see Settings."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Service</Th>
                  <Th>Scheduled for</Th>
                  <Th>Contact</Th>
                  <Th>Agent</Th>
                  <Th>Status</Th>
                  <Th align="right">From call</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((appt, i) => (
                  <tr
                    key={appt.id}
                    className="animate-fade-up border-b border-line transition-colors duration-150 last:border-0 hover:bg-brand-50/40"
                    style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  >
                    <Td className="font-medium">{appt.customer_name ?? '—'}</Td>
                    <Td className="text-ink-muted">{appt.service ?? '—'}</Td>
                    <Td className="text-ink-muted">{appt.starts_at ? dateTime(appt.starts_at) : '—'}</Td>
                    <Td className="text-ink-muted">{phone(appt.phone)}</Td>
                    <Td className="text-ink-muted">{appt.agent?.name ?? '—'}</Td>
                    <Td>
                      <span
                        className={cx(
                          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                          STATUS_STYLE[appt.status],
                        )}
                      >
                        {STATUS_LABEL[appt.status] ?? titleCase(appt.status)}
                      </span>
                    </Td>
                    <Td align="right" className="font-mono text-xs text-ink-faint">
                      {appt.call_id.slice(0, 14)}…
                    </Td>
                  </tr>
                ))}
                {/* Shimmer rows while scanning more calls */}
                {streaming && (
                  <tr className="border-b border-line last:border-0">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <td key={i} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Progress bar while scanning calls */}
      {streaming && scannedCalls > 0 && (
        <div className="mt-3 px-1">
          <div className="flex items-center justify-between text-[11px] text-ink-faint mb-1">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
              Scanning calls for appointments…
            </span>
            <span>{scannedCalls}{totalCalls > 0 ? ` / ${totalCalls}` : ''} calls scanned</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-1 rounded-full bg-brand-400 transition-all duration-500"
              style={{ width: totalCalls > 0 ? `${Math.min((scannedCalls / totalCalls) * 100, 99)}%` : '40%' }}
            />
          </div>
        </div>
      )}

      {!streaming && scannedCalls > 0 && (
        <p className="mt-3 text-center text-[11px] text-ink-faint">
          Scanned {scannedCalls} calls · {items.length} appointment{items.length !== 1 ? 's' : ''} found
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'slate' | 'rose';
  active: boolean;
  onClick: () => void;
}) {
  const toneMap = {
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-800 bg-amber-50',
    slate: 'text-slate-700 bg-slate-100',
    rose: 'text-rose-700 bg-rose-50',
  };
  return (
    <button
      onClick={onClick}
      className={cx(
        'card card-hover animate-fade-up p-4 text-left transition-shadow',
        active && 'ring-2 ring-brand-400',
      )}
    >
      <span className={cx('inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', toneMap[tone])}>
        {label}
      </span>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</div>
    </button>
  );
}
