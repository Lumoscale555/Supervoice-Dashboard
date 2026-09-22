import { useMemo, useState } from 'react';
import { useQuery } from '../lib/api';
import type { Billing as BillingData, RangeKey } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { SpendChart, type SpendPoint } from '../components/charts';
import { inr, count, dayLabel, duration } from '../lib/format';

export default function Billing() {
  const [range, setRange] = useState<RangeKey>('30d');
  const { data, error, loading, initial, refresh } = useQuery<BillingData>('/api/billing', { range });

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
  const pulse = data?.pricing.pulse_seconds ?? 30;

  return (
    <div>
      <PageHeader title="Billing" description="Wallet balance and what you owe this period." range={range} onRangeChange={setRange} />

      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-ink-muted animate-fade-in">
        <svg width="15" height="15" viewBox="0 0 16 16" className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M8 7.2V11M8 5.3v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <p>
          Flat-rate billing: <strong className="text-ink">₹{rate} per minute</strong>, charged in{' '}
          <strong className="text-ink">{pulse}-second pulses</strong> — every started {pulse}s block is billed in full (₹{(rate / (60 / pulse)).toFixed(2)}
          /pulse). Only calls that connected are billed; no-answer and failed calls cost nothing.
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

        <Card title="This period" subtitle={`${data?.range.days ?? 30}-day summary`} className="lg:col-span-2">
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

      <Card title="Daily spend" subtitle={`Flat rate — ₹${rate}/min, ${pulse}s pulse`} className="mt-6">
        {initial ? (
          <Skeleton className="h-[240px]" />
        ) : spendSeries.length ? (
          <SpendChart data={spendSeries} />
        ) : (
          <EmptyState title="No spend recorded" body="Costs will appear here once your agents start handling calls." />
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
