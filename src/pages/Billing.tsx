import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '../lib/api';
import type { Billing as BillingData, RangeKey } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Card, DirectionPill, EmptyState, ErrorState, Skeleton, StatusBadge, Th, Td } from '../components/ui';
import { SpendChart, type SpendPoint } from '../components/charts';
import { inr, count, dayLabel, duration, dateTime, phone } from '../lib/format';

export default function Billing() {
  const [range, setRange] = useState<RangeKey>('today');
  const { data, error, loading, initial, refresh } = useQuery<BillingData>('/api/billing', { range });

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [range]);
  const items = data?.line_items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const spendSeries: SpendPoint[] = useMemo(() => {
    if (!data) return [];
    return data.summary.by_day.map((row) => ({ label: dayLabel(row.date), calls: row.connected, cost_inr: row.cost_inr }));
  }, [data]);

  if (error && !data) {
    return (
      <div>
        <PageHeader title="Billing" description="Wallet balance and what you owe this period." />
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      </div>
    );
  }

  const wallet = data?.balance.wallet;
  const totals = data?.summary.totals;
  const rate = data?.pricing.rate_per_minute_inr ?? 5;

  return (
    <div>
      <PageHeader title="Billing" description="Wallet balance and what you owe this period." range={range} onRangeChange={setRange} />

      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-ink-muted animate-fade-in">
        <svg width="15" height="15" viewBox="0 0 16 16" className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M8 7.2V11M8 5.3v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <p>
          Flat-rate billing: <strong className="text-ink">₹{rate} per minute</strong>, charged for the exact talk time. Only calls that connected are billed; no-answer and failed calls cost nothing.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Wallet" subtitle="Prepaid balance" className="lg:col-span-1">
          {initial ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <div className="text-3xl font-semibold tracking-tight text-ink tnum">{inr(wallet?.balance)}</div>
              <p className="mt-1 text-xs text-ink-muted">available</p>
            </>
          )}
        </Card>

        <Card title="This period" subtitle={data?.range.days === 1 ? "Today" : `${data?.range.days ?? 30}-day summary`} className="lg:col-span-2">
          {initial ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryTile label="Total spend" value={inr(totals?.cost_inr)} />
              <SummaryTile label="Billed calls" value={count(totals?.connected)} />
              <SummaryTile label="Total talk time" value={duration(totals?.duration_secs)} />
              <SummaryTile label="Avg. per call" value={totals?.connected ? inr((totals.cost_inr ?? 0) / totals.connected) : '—'} />
            </div>
          )}
        </Card>
      </div>

      <Card title="Daily spend" subtitle={`Flat rate — ₹${rate}/min, exact minutes`} className="mt-6">
        {initial ? (
          <Skeleton className="h-[240px]" />
        ) : spendSeries.length ? (
          <SpendChart data={spendSeries} />
        ) : (
          <EmptyState title="No spend recorded" body="Costs will appear here once your agents start handling calls." />
        )}
      </Card>

      <Card title="Billing history" subtitle="Every call and what it cost" className="mt-6" bodyClassName="!px-0 !py-0">
        {initial ? (
          <div className="p-4"><Skeleton className="h-40" /></div>
        ) : !items.length ? (
          <EmptyState title="No calls in this period" body="Each call and its price will be listed here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Started</Th>
                    <Th>Agent</Th>
                    <Th>Direction</Th>
                    <Th>From / To</Th>
                    <Th>Status</Th>
                    <Th align="right">Duration</Th>
                    <Th align="right">Rate</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-brand-50/40">
                      <Td className="text-ink-muted">{dateTime(c.started_at)}</Td>
                      <Td className="font-medium">{c.agent?.name ?? 'Unknown'}</Td>
                      <Td><DirectionPill direction={c.direction} /></Td>
                      <Td className="text-ink-muted">{phone(c.direction === 'inbound' ? c.from : c.to)}</Td>
                      <Td><StatusBadge status={c.status} /></Td>
                      <Td align="right">{duration(c.duration_secs)}</Td>
                      <Td align="right" className="text-ink-muted">₹{rate}/min</Td>
                      <Td align="right" className="font-medium">{inr(c.cost_inr)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-xs text-ink-faint">
                Page {page + 1} of {totalPages} · {items.length} calls
              </span>
              <div className="flex gap-2">
                <button className="btn-ghost !h-8 text-xs" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  Previous
                </button>
                <button className="btn-ghost !h-8 text-xs" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {loading && !initial && <p className="mt-4 text-center text-[11px] text-ink-faint">Refreshing…</p>}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="animate-fade-up rounded-xl border border-line p-3">
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      <p className="mt-1 text-lg font-semibold text-ink tnum">{value}</p>
    </div>
  );
}
