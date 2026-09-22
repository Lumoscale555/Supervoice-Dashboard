// Flat, pulse-billed pricing — now per tenant. Each tenant has two rates:
//   clientRateInrPerMin    what we charge the client (their bill)
//   providerCostInrPerMin  what Sonex charges us to run that call (our cost)
// margin = client cost - provider cost. Both are billed the same way: every
// started `pulseSeconds` block is a full billing unit, and only calls that
// actually connected are billed.

export function costForDuration(durationSecs, ratePerMinute, pulseSeconds = 30) {
  if (!durationSecs || durationSecs <= 0 || !ratePerMinute) return 0;
  const pulses = Math.ceil(durationSecs / pulseSeconds);
  const pulseRate = ratePerMinute / (60 / pulseSeconds);
  return +(pulses * pulseRate).toFixed(2);
}

export function costForCall(call, ratePerMinute, pulseSeconds = 30) {
  if (call.status !== 'completed') return 0;
  return costForDuration(call.duration_secs, ratePerMinute, pulseSeconds);
}

/** Client-facing cost only — this is what ships to the tenant's own dashboard. */
export function priceCall(call, tenant) {
  const { cost_usd, cost, tool_calls, ...rest } = call;
  const cost_inr = costForCall(call, tenant.clientRateInrPerMin, tenant.pulseSeconds);
  return { ...rest, cost_inr };
}

/** Client cost + our provider cost + margin — admin/owner eyes only. */
export function priceCallWithMargin(call, tenant) {
  const { cost_usd, cost, tool_calls, ...rest } = call;
  const cost_inr = costForCall(call, tenant.clientRateInrPerMin, tenant.pulseSeconds);
  const provider_cost_inr = costForCall(call, tenant.providerCostInrPerMin, tenant.pulseSeconds);
  return { ...rest, cost_inr, provider_cost_inr, margin_inr: +(cost_inr - provider_cost_inr).toFixed(2) };
}
