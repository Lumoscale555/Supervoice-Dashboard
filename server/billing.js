// Aggregates a tenant's calls into day/agent breakdowns, priced with that
// tenant's own rates (server/pricing.js). `withMargin: true` additionally
// computes provider cost and margin — used only by the admin view, never
// shipped to a client's own dashboard.

import { costForCall } from './pricing.js';

function tally(rows, keyFn) {
  return rows.reduce((acc, r) => {
    const k = keyFn(r);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

export function buildBillingSummary(calls, tenant, { withMargin = false } = {}) {
  const priced = calls.map((c) => {
    const cost_inr = costForCall(c, tenant.clientRateInrPerMin);
    if (!withMargin) return { ...c, cost_inr };
    const provider_cost_inr = costForCall(c, tenant.providerCostInrPerMin);
    return { ...c, cost_inr, provider_cost_inr, margin_inr: +(cost_inr - provider_cost_inr).toFixed(2) };
  });

  const totals = {
    calls: priced.length,
    connected: priced.filter((c) => c.status === 'completed').length,
    duration_secs: priced.reduce((s, c) => s + c.duration_secs, 0),
    cost_inr: +priced.reduce((s, c) => s + c.cost_inr, 0).toFixed(2),
    by_status: tally(priced, (c) => c.status),
    by_direction: tally(priced, (c) => c.direction),
  };
  if (withMargin) {
    totals.provider_cost_inr = +priced.reduce((s, c) => s + c.provider_cost_inr, 0).toFixed(2);
    totals.margin_inr = +(totals.cost_inr - totals.provider_cost_inr).toFixed(2);
  }

  const byDayMap = new Map();
  for (const c of priced) {
    const day = c.started_at.slice(0, 10);
    if (!byDayMap.has(day)) byDayMap.set(day, []);
    byDayMap.get(day).push(c);
  }
  const by_day = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const row = {
        date,
        calls: rows.length,
        connected: rows.filter((r) => r.status === 'completed').length,
        duration_secs: rows.reduce((s, r) => s + r.duration_secs, 0),
        cost_inr: +rows.reduce((s, r) => s + r.cost_inr, 0).toFixed(2),
      };
      if (withMargin) {
        row.provider_cost_inr = +rows.reduce((s, r) => s + r.provider_cost_inr, 0).toFixed(2);
        row.margin_inr = +(row.cost_inr - row.provider_cost_inr).toFixed(2);
      }
      return row;
    });

  return { totals, by_day };
}
