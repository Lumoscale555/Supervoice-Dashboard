// Flat per-minute pricing, per tenant. Each tenant has two rates:
//   clientRateInrPerMin    what we charge the client (their bill)
//   providerCostInrPerMin  what Sonex charges us to run that call (our cost)
// margin = client cost - provider cost. Billing is exact: duration / 60 * rate.
// Only calls that actually connected are billed.

export function costForDuration(durationSecs, ratePerMinute) {
  if (!durationSecs || durationSecs <= 0 || !ratePerMinute) return 0;
  return +((durationSecs / 60) * ratePerMinute).toFixed(2);
}

export function costForCall(call, ratePerMinute) {
  if (call.status !== 'completed') return 0;
  return costForDuration(call.duration_secs, ratePerMinute);
}

/** Client-facing cost only — this is what ships to the tenant's own dashboard. */
export function priceCall(call, tenant) {
  const { cost_usd, cost, tool_calls, ...rest } = call;
  const cost_inr = costForCall(call, tenant.clientRateInrPerMin);
  return { ...rest, cost_inr };
}

/** Client cost + our provider cost + margin — admin/owner eyes only. */
export function priceCallWithMargin(call, tenant) {
  const { cost_usd, cost, tool_calls, ...rest } = call;
  const cost_inr = costForCall(call, tenant.clientRateInrPerMin);
  const provider_cost_inr = costForCall(call, tenant.providerCostInrPerMin);
  return { ...rest, cost_inr, provider_cost_inr, margin_inr: +(cost_inr - provider_cost_inr).toFixed(2) };
}
