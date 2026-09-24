import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStreamQuery } from '../lib/api';
import type { BillingSummary, BillingTotals, Balance, CallSummary, RangeKey } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Card, ErrorState, Stat, StatusBadge, DirectionPill, TableSkeleton, Skeleton, EmptyState } from '../components/ui';
import { CallVolumeChart, OutcomeBar, type VolumePoint } from '../components/charts';
import { inr, count, duration, relative, dayLabel, phone } from '../lib/format';

function IconPhone() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5.5 2.8 6.6 5.2 5.4 6.5a7.5 7.5 0 0 0 4 4l1.2-1.2 2.5 1.1v2.3c0 .5-.4.9-1 .9A10.3 10.3 0 0 1 3 3.8c0-.5.4-1 .9-1h1.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M8 4.6V8l2.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function IconRupee() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 3h8M4 6h8M4 3c3.5 0 5.5 1 5.5 3S7.5 9 4 9l6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11" cy="9.7" r="0.9" fill="currentColor" />
    </svg>
  );
}

export default function Overview() {
  const [range, setRange] = useState<RangeKey>('30d');

  // SSE stream: the server sends chunks with balance + recent_calls immediately,
  // then partial summaries as call pages arrive, then the final with previous period.
  const { items, meta, error, streaming, initial, refresh } = useStreamQuery(
    '/api/overview/stream',
    { range },
  );

  // Extract typed values from the merged meta object.
  const data = meta as {
    balance?: Balance;
    recent_calls?: CallSummary[];
    range?: { from: string; to: string; days: number; timezone: string };
    summary?: BillingSummary | null;
    previous?: BillingTotals | null;
    streaming?: boolean;
  };

  const volume: VolumePoint[] = useMemo(() => {
    if (!data?.summary) return [];
    return data.summary.by_day.map((row) => ({
      date: row.date,
      label: dayLabel(row.date),
      total: row.calls,
      connected: row.connected,
    }));
  }, [data?.summary]);

  if (error && !data?.summary && !data?.balance) {
    return (
      <div>
        <PageHeader title="Overview" description="Everything your voice agents did, at a glance." />
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      </div>
    );
  }

  const totals = data?.summary?.totals;
  const prev = data?.previous;
  const connectRate = totals && totals.calls ? totals.connected / totals.calls : null;
  const prevConnectRate = prev && prev.calls ? prev.connected / prev.calls : null;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Everything your voice agents did, at a glance."
        range={range}
        onRangeChange={setRange}
      />

      {/* Streaming indicator */}
      {streaming && !initial && (
        <div className="mb-4 flex items-center gap-2 text-xs text-ink-faint">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          Loading latest data…
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {initial ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[126px]" />)
        ) : (
          <>
            <Stat
              index={0}
              label="Total calls"
              value={count(totals?.calls)}
              current={totals?.calls}
              previous={prev?.calls ?? undefined}
              icon={<IconPhone />}
              hint="vs. previous period"
            />
            <Stat
              index={1}
              label="Connect rate"
              value={connectRate !== null ? `${(connectRate * 100).toFixed(1)}%` : '—'}
              current={connectRate ?? undefined}
              previous={prevConnectRate ?? undefined}
              icon={<IconClock />}
              hint="calls that completed"
            />
            <Stat
              index={2}
              label="Total spend"
              value={inr(totals?.cost_inr)}
              current={totals?.cost_inr}
              previous={prev?.cost_inr ?? undefined}
              invert
              icon={<IconRupee />}
              hint="Rs.5/min, billed per 30s"
            />
            <Stat
              index={3}
              label="Wallet balance"
              value={inr(data?.balance?.wallet.balance)}
              icon={<IconWallet />}
              hint={data?.balance?.credits.length ? `${data.balance.credits.length} active credit grant${data.balance.credits.length > 1 ? 's' : ''}` : 'No active credits'}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Call volume" subtitle={data?.range?.days === 1 ? "Today, daily" : `${data?.range?.days ?? 30}-day trend, daily`} className="xl:col-span-2">
          {initial ? (
            <Skeleton className="h-[220px]" />
          ) : volume.length ? (
            <CallVolumeChart data={volume} />
          ) : (
            <EmptyState title="No calls yet" body="Once your agents start taking calls, daily volume will show up here." />
          )}
        </Card>

        <Card title="Call outcomes" subtitle="Share of calls by result">
          {initial ? <Skeleton className="h-[220px]" /> : <OutcomeBar counts={totals?.by_status ?? {}} />}
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Recent activity"
          subtitle="Latest calls across all agents"
          action={
            <Link to="/calls" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View all →
            </Link>
          }
          bodyClassName="!px-0 !py-0"
        >
          {initial ? (
            <div className="p-4">
              <TableSkeleton rows={6} cols={4} />
            </div>
          ) : !data?.recent_calls?.length ? (
            <EmptyState title="No recent calls" body="Calls placed or received by your agents will appear here as they happen." />
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_calls.map((call, i) => (
                <li key={call.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <Link
                    to={`/calls?open=${call.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-brand-50/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                      <IconPhone />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{call.agent?.name ?? 'Unknown agent'}</span>
                        <DirectionPill direction={call.direction} />
                      </div>
                      <p className="truncate text-xs text-ink-muted">
                        {phone(call.direction === 'inbound' ? call.from : call.to)} · {duration(call.duration_secs)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={call.status} />
                      <span className="text-[11px] text-ink-faint">{relative(call.started_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
