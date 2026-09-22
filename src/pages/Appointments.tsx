import { useMemo, useState } from 'react';
import { useQuery } from '../lib/api';
import type { AppointmentsResponse, RangeKey } from '../lib/types';
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
  const { data, error, loading, initial, refresh } = useQuery<AppointmentsResponse>('/api/appointments', { range, scan_limit: 80 });

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    return kindFilter ? list.filter((a) => a.status === kindFilter) : list;
  }, [data, kindFilter]);

  const summary = useMemo(() => {
    const list = data?.data ?? [];
    return {
      booked: list.filter((a) => a.status === 'booked').length,
      rescheduled: list.filter((a) => a.status === 'rescheduled').length,
      cancelled: list.filter((a) => a.status === 'cancelled').length,
      failed: list.filter((a) => a.status === 'failed').length,
    };
  }, [data]);

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
        {error && !data ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : initial ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : !rows.length ? (
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
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {loading && !initial && <p className="mt-4 text-center text-[11px] text-ink-faint">Refreshing…</p>}
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

