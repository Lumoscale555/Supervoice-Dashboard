import { FormEvent, useEffect, useState } from 'react';
import { useSession } from '../../lib/session';
import { api } from '../../lib/api';
import type { AdminBilling, TenantPublic } from '../../lib/types';
import { Card, EmptyState, ErrorState, Skeleton, Stat, TableSkeleton, Th, Td, cx } from '../../components/ui';
import { inr, count, duration, dateOnly, dateTime, phone } from '../../lib/format';

export default function AdminTenants() {
  const { logout } = useSession();
  const [tenants, setTenants] = useState<TenantPublic[] | null>(null);
  const [error, setError] = useState('');
  const [formTenant, setFormTenant] = useState<TenantPublic | 'new' | null>(null);
  const [billingTenant, setBillingTenant] = useState<TenantPublic | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api<{ data: TenantPublic[] }>('/api/admin/tenants');
      setTenants(res.data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(t: TenantPublic) {
    if (!confirm(`Remove client "${t.name}"? Their login will stop working immediately.`)) return;
    setDeleting(t.id);
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete client.');
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-page)]">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-6 backdrop-blur-md">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink text-white">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path
              d="M8 1.8v1.9M8 12.3v1.9M14.2 8h-1.9M3.7 8H1.8M12.1 3.9l-1.3 1.3M5.2 11.8l-1.3 1.3M12.1 12.1l-1.3-1.3M5.2 5.2 3.9 3.9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">Super Voice — Admin</h1>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-primary" onClick={() => setFormTenant('new')}>
            + Add client
          </button>
          <button className="btn-ghost" onClick={() => confirm('Sign out of the admin console?') && logout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Clients</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Each client gets their own login, scoped to their own Sonex API key and agent — they never see another client's data.
          </p>
        </div>

        <Card bodyClassName="!px-0 !py-0">
          {error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={load} />
            </div>
          ) : tenants === null ? (
            <div className="p-4">
              <TableSkeleton rows={4} cols={6} />
            </div>
          ) : !tenants.length ? (
            <EmptyState title="No clients yet" body="Add your first client to give them dashboard access." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Agent scope</Th>
                    <Th>Mode</Th>
                    <Th align="right">Rate / min</Th>
                    <Th align="right">Cost / min</Th>
                    <Th align="right">Margin / min</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b border-line last:border-0 hover:bg-brand-50/30">
                      <Td>
                        <div>
                          <p className="font-medium text-ink">{t.name}</p>
                          <p className="text-xs text-ink-faint">@{t.username}</p>
                        </div>
                      </Td>
                      <Td className="text-ink-muted">
                        {t.agentId ? (
                          <>
                            {t.agentName ?? 'Agent'} <span className="font-mono text-[11px] text-ink-faint">{t.agentId}</span>
                          </>
                        ) : (
                          <span className="text-ink-faint">whole account</span>
                        )}
                      </Td>
                      <Td>
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            t.hasApiKey ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
                          )}
                        >
                          <span className={cx('h-1.5 w-1.5 rounded-full', t.hasApiKey ? 'bg-emerald-500' : 'bg-amber-500')} />
                          {t.hasApiKey ? 'Live' : 'Demo'}
                        </span>
                      </Td>
                      <Td align="right">{inr(t.clientRateInrPerMin)}</Td>
                      <Td align="right">{inr(t.providerCostInrPerMin)}</Td>
                      <Td align="right">
                        <span className="font-medium text-emerald-700">{inr(t.clientRateInrPerMin - t.providerCostInrPerMin)}</span>
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1.5">
                          <button className="btn-ghost !h-7 !px-2 text-xs" onClick={() => setBillingTenant(t)}>
                            Billing
                          </button>
                          <button className="btn-ghost !h-7 !px-2 text-xs" onClick={() => setFormTenant(t)}>
                            Edit
                          </button>
                          <button
                            className="btn-ghost !h-7 !px-2 text-xs !text-rose-600 hover:!border-rose-200"
                            onClick={() => onDelete(t)}
                            disabled={deleting === t.id}
                          >
                            {deleting === t.id ? '…' : 'Remove'}
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      {formTenant && (
        <TenantFormDrawer
          tenant={formTenant === 'new' ? null : formTenant}
          onClose={() => setFormTenant(null)}
          onSaved={() => {
            setFormTenant(null);
            load();
          }}
        />
      )}

      {billingTenant && <TenantBillingDrawer tenant={billingTenant} onClose={() => setBillingTenant(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ Create/Edit */

function TenantFormDrawer({ tenant, onClose, onSaved }: { tenant: TenantPublic | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !tenant;
  const [name, setName] = useState(tenant?.name ?? '');
  const [username, setUsername] = useState(tenant?.username ?? '');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  // If a key is already saved, start masked with a "Change" affordance rather
  // than an editable input — avoids accidentally clobbering it on save.
  const [editingKey, setEditingKey] = useState(!tenant?.hasApiKey);
  const [agentId, setAgentId] = useState(tenant?.agentId ?? '');
  const [agentName, setAgentName] = useState(tenant?.agentName ?? '');
  const [rate, setRate] = useState(String(tenant?.clientRateInrPerMin ?? 5));
  const [cost, setCost] = useState(String(tenant?.providerCostInrPerMin ?? 2.5));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rateNum = Number(rate) || 0;
  const costNum = Number(cost) || 0;
  const marginNum = rateNum - costNum;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!confirm(isNew ? `Create client "${name}"?` : `Save changes to "${name}"?`)) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        username,
        agentId: agentId || null,
        agentName: agentName || null,
        clientRateInrPerMin: rateNum,
        providerCostInrPerMin: costNum,
      };
      if (password) payload.password = password;
      if (apiKey) payload.sonexApiKey = apiKey;

      if (isNew) {
        if (!password) throw new Error('Set a password for this client.');
        payload.password = password;
        const res = await fetch('/api/admin/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message || 'Could not create client.');
      } else {
        const res = await fetch(`/api/admin/tenants/${tenant!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message || 'Could not update client.');
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" className="absolute inset-0 bg-brand-950/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg animate-slide-in flex-col overflow-y-auto bg-white shadow-pop">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-base font-semibold text-ink">{isNew ? 'Add client' : `Edit ${tenant!.name}`}</h3>
          <button className="btn-ghost !h-8 !w-8 !px-0" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex-1 space-y-5 px-6 py-5">
          <Field label="Client name">
            <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Username (login)">
              <input className="field w-full" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
            </Field>
            <Field label={isNew ? 'Password' : 'New password (optional)'}>
              <input
                type="password"
                className="field w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required={isNew}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-line bg-brand-50/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Sonex connection</p>
            <Field label="Sonex API key">
              {tenant?.hasApiKey && !editingKey ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden="true">
                      <circle cx="7" cy="7" r="7" fill="currentColor" opacity="0.15" />
                      <path d="M4 7.2 6.1 9.3 10 4.9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Saved <span className="font-mono text-ink-muted">{tenant.apiKeyPreview}</span>
                  </span>
                  <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700" onClick={() => setEditingKey(true)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="field w-full font-mono text-xs"
                    placeholder="vsk_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                    autoFocus={!isNew}
                  />
                  {!isNew && tenant?.hasApiKey && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-ink-faint underline underline-offset-2 hover:text-ink-muted"
                      onClick={() => {
                        setEditingKey(false);
                        setApiKey('');
                      }}
                    >
                      Cancel — keep the saved key
                    </button>
                  )}
                </>
              )}
              <p className="mt-1 text-[11px] text-ink-faint">
                {isNew
                  ? 'Leave blank to run this client on demo data.'
                  : editingKey && !tenant?.hasApiKey
                    ? 'Leave blank to run this client on demo data.'
                    : 'Paste the new key to replace the saved one.'}
              </p>
            </Field>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Agent ID">
                <input
                  className="field w-full font-mono text-xs"
                  placeholder="agent_..."
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Agent name (display only)">
                <input className="field w-full" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Sonex has no client/tenant concept — <code className="font-mono">agent.id</code> is what filters{' '}
              <code className="font-mono">GET /v1/calls</code> to just this client's calls. Leave Agent ID blank only if this client has
              their own dedicated Sonex API key.
            </p>
          </div>

          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Billing</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client rate (₹/min)">
                <input type="number" step="0.5" min="0" className="field w-full" value={rate} onChange={(e) => setRate(e.target.value)} required />
              </Field>
              <Field label="Provider cost (₹/min)">
                <input type="number" step="0.5" min="0" className="field w-full" value={cost} onChange={(e) => setCost(e.target.value)} required />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-50/60 px-3 py-2 text-sm">
              <span className="text-ink-muted">Margin per minute</span>
              <span className={cx('font-semibold tnum', marginNum >= 0 ? 'text-emerald-700' : 'text-rose-600')}>{inr(marginNum)}</span>
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex gap-2 pb-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={submitting}>
              {submitting ? 'Saving…' : isNew ? 'Create client' : 'Save changes'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

/* -------------------------------------------------------------- Billing */

function TenantBillingDrawer({ tenant, onClose }: { tenant: TenantPublic; onClose: () => void }) {
  const [data, setData] = useState<AdminBilling | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<AdminBilling>(`/api/admin/tenants/${tenant.id}/billing`, { range: '30d' })
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [tenant.id]);

  const totals = data?.summary.totals;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" className="absolute inset-0 bg-brand-950/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-4xl animate-slide-in flex-col overflow-y-auto bg-white shadow-pop">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-ink">{tenant.name}</h3>
            <p className="text-xs text-ink-muted">Last 30 days · every call's revenue, provider cost &amp; margin</p>
          </div>
          <button className="btn-ghost !h-8 !w-8 !px-0" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 px-6 py-5">
          {error ? (
            <ErrorState message={error} />
          ) : !data ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Revenue" value={inr(totals?.cost_inr)} hint="billed to client" index={0} />
                <Stat label="Provider cost" value={inr(totals?.provider_cost_inr)} hint="paid to Sonex" index={1} />
                <Stat label="Margin" value={inr(totals?.margin_inr)} hint="revenue − cost" index={2} />
                <Stat label="Billed calls" value={count(totals?.connected)} hint={`of ${count(totals?.calls)} total`} index={3} />
              </div>

              <div className="mt-5 rounded-xl border border-line p-4 text-sm">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <span className="text-ink-muted">Total talk time</span>
                  <span className="font-medium text-ink tnum">{duration(totals?.duration_secs)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-line py-2.5">
                  <span className="text-ink-muted">Client rate</span>
                  <span className="font-medium text-ink tnum">{inr(tenant.clientRateInrPerMin)}/min</span>
                </div>
                <div className="flex items-center justify-between border-b border-line py-2.5">
                  <span className="text-ink-muted">Provider cost</span>
                  <span className="font-medium text-ink tnum">{inr(tenant.providerCostInrPerMin)}/min</span>
                </div>
                <div className="flex items-center justify-between pt-2.5">
                  <span className="text-ink-muted">Margin per minute</span>
                  <span className="font-medium text-emerald-700 tnum">{inr(tenant.clientRateInrPerMin - tenant.providerCostInrPerMin)}/min</span>
                </div>
              </div>

              <p className="mt-4 text-[11px] text-ink-faint">Client since {dateOnly(tenant.createdAt)} · mode: {data.mode}</p>

              <div className="mt-6">
                <h4 className="mb-3 text-sm font-semibold text-ink">Every call — phone, duration, fixed cost, provider cost &amp; profit</h4>
                {!data.line_items.length ? (
                  <p className="rounded-xl border border-line py-8 text-center text-xs text-ink-muted">No calls in this period.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <Th>Phone number</Th>
                          <Th>Started</Th>
                          <Th align="right">Duration</Th>
                          <Th>Status</Th>
                          <Th align="right">Fixed cost</Th>
                          <Th align="right">Provider cost</Th>
                          <Th align="right">Profit</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.line_items.map((call, i) => (
                          <tr
                            key={call.id}
                            className="animate-fade-up border-b border-line last:border-0 hover:bg-brand-50/30"
                            style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                          >
                            <Td className="font-medium">{phone(call.direction === 'inbound' ? call.from : call.to)}</Td>
                            <Td className="text-ink-muted">{dateTime(call.started_at)}</Td>
                            <Td align="right">{duration(call.duration_secs)}</Td>
                            <Td>
                              <span
                                className={cx(
                                  'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                                  call.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                                )}
                              >
                                {call.status.replace(/_/g, ' ')}
                              </span>
                            </Td>
                            <Td align="right">{inr(call.cost_inr)}</Td>
                            <Td align="right">{inr(call.provider_cost_inr)}</Td>
                            <Td align="right">
                              <span className={call.margin_inr >= 0 ? 'font-medium text-emerald-700' : 'font-medium text-rose-600'}>
                                {inr(call.margin_inr)}
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-line bg-brand-50/40">
                          <Td className="font-semibold" colSpan={4}>
                            Total
                          </Td>
                          <Td align="right" className="font-semibold">
                            {inr(data.summary.totals.cost_inr)}
                          </Td>
                          <Td align="right" className="font-semibold">
                            {inr(data.summary.totals.provider_cost_inr)}
                          </Td>
                          <Td align="right" className="font-semibold text-emerald-700">
                            {inr(data.summary.totals.margin_inr)}
                          </Td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
