import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useQuery, useStreamQuery } from '../lib/api';
import type { CallDetail, CallRecording, CallSummary } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Card, DirectionPill, EmptyState, ErrorState, StatusBadge, Th, Td, TableSkeleton, cx } from '../components/ui';
import { inr, duration, dateTime, phone, titleCase } from '../lib/format';

const STATUS_OPTIONS = ['completed', 'in_progress', 'no_answer', 'failed'];

export default function Calls() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({
    status: params.get('status') ?? '',
    direction: params.get('direction') ?? '',
    phone: '',
  });
  const [openId, setOpenId] = useState<string | null>(params.get('open'));

  // Filter changes reset stream.
  const streamParams = useMemo(() => ({
    status: filters.status || undefined,
    direction: filters.direction || undefined,
    phone_number: filters.phone || undefined,
    limit: 100,
    max_pages: 20,
  }), [filters.status, filters.direction, filters.phone]);

  const { items: calls, meta, error, streaming, initial, refresh } = useStreamQuery<CallSummary>(
    '/api/calls/stream',
    streamParams,
  );

  // Client-side pagination over the streamed full list.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  // Reset page whenever filters change.
  useEffect(() => { setPage(0); }, [filters.status, filters.direction, filters.phone]);

  const pageSlice = useMemo(() => calls.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [calls, page]);
  const totalPages = Math.ceil(calls.length / PAGE_SIZE);
  const hasMore = streaming || calls.length > (page + 1) * PAGE_SIZE;

  function openCall(id: string) {
    setOpenId(id);
    const next = new URLSearchParams(params);
    next.set('open', id);
    setParams(next, { replace: true });
  }
  function closeCall() {
    setOpenId(null);
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Calls" description="Every call your agents have handled, searchable and filterable." />

      <Card bodyClassName="!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="field"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>

          <select
            className="field"
            value={filters.direction}
            onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value }))}
            aria-label="Filter by direction"
          >
            <option value="">Inbound &amp; outbound</option>
            <option value="inbound">Inbound only</option>
            <option value="outbound">Outbound only</option>
          </select>

          <input
            className="field w-48"
            placeholder="Phone number (+1...)"
            value={filters.phone}
            onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))}
            aria-label="Filter by phone number"
          />

          {(filters.status || filters.direction || filters.phone) && (
            <button className="btn-ghost !h-9 text-xs" onClick={() => setFilters({ status: '', direction: '', phone: '' })}>
              Clear filters
            </button>
          )}

          <span className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
            {streaming && (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                Loading…
              </span>
            )}
            {calls.length > 0 && `${calls.length} total`}
          </span>
        </div>
      </Card>

      <Card className="mt-4" bodyClassName="!px-0 !py-0">
        {error && !calls.length ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : initial ? (
          <div className="p-4">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : !calls.length && !streaming ? (
          <EmptyState title="No calls match these filters" body="Try clearing a filter, or check back once more calls come in." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Agent</Th>
                    <Th>Direction</Th>
                    <Th>From / To</Th>
                    <Th>Started</Th>
                    <Th align="right">Duration</Th>
                    <Th align="right">Cost</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((call, i) => (
                    <tr
                      key={call.id}
                      onClick={() => openCall(call.id)}
                      className="animate-fade-up cursor-pointer border-b border-line transition-colors duration-150 last:border-0 hover:bg-brand-50/40"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    >
                      <Td className="font-medium">{call.agent?.name ?? 'Unknown'}</Td>
                      <Td>
                        <DirectionPill direction={call.direction} />
                      </Td>
                      <Td className="text-ink-muted">{phone(call.direction === 'inbound' ? call.from : call.to)}</Td>
                      <Td className="text-ink-muted">{dateTime(call.started_at)}</Td>
                      <Td align="right">{duration(call.duration_secs)}</Td>
                      <Td align="right">{inr(call.cost_inr)}</Td>
                      <Td>
                        <StatusBadge status={call.status} />
                      </Td>
                    </tr>
                  ))}
                  {/* Shimmer row while streaming more calls */}
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

            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-xs text-ink-faint">
                Page {page + 1}{totalPages > 1 ? ` of ${totalPages}` : ''}{streaming ? ' (loading more…)' : ''}
              </span>
              <div className="flex gap-2">
                <button className="btn-ghost !h-8 text-xs" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  Previous
                </button>
                <button className="btn-ghost !h-8 text-xs" onClick={() => setPage((p) => p + 1)} disabled={!hasMore && page >= totalPages - 1}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {openId && <CallDrawer id={openId} onClose={closeCall} />}
    </div>
  );
}

/* ------------------------------------------------------------ Drawer */

function CallDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: call, error, loading } = useQuery<CallDetail>(`/api/calls/${id}`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" className="absolute inset-0 bg-brand-950/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <aside className="relative flex h-full w-full max-w-xl animate-slide-in flex-col bg-white shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink-faint">{id}</p>
            <h3 className="mt-0.5 truncate text-base font-semibold text-ink">{call?.agent?.name ?? 'Call detail'}</h3>
          </div>
          <button className="btn-ghost !h-8 !w-8 shrink-0 !px-0" onClick={onClose} aria-label="Close panel">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {loading && !call ? (
          <div className="flex-1 p-5">
            <TableSkeleton rows={5} cols={1} />
          </div>
        ) : error && !call ? (
          <div className="flex-1 p-5">
            <ErrorState message={error} />
          </div>
        ) : call ? (
          <>
            <div className="grid grid-cols-3 gap-3 border-b border-line px-5 py-4 text-xs">
              <Field label="Status">
                <StatusBadge status={call.status} />
              </Field>
              <Field label="Direction">
                <DirectionPill direction={call.direction} />
              </Field>
              <Field label="Duration">{duration(call.duration_secs)}</Field>
              <Field label="From">{phone(call.from)}</Field>
              <Field label="To">{phone(call.to)}</Field>
              <Field label="Started">{dateTime(call.started_at)}</Field>
              <Field label="Cost">{inr(call.cost_inr)}</Field>
            </div>

            <div className="border-b border-line px-5 py-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Recording</p>
              {/* Always try to fetch the recording — has_recording can lag */}
              <RecordingInline id={id} hasRecording={call.has_recording} />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Transcript</p>
              <TranscriptView call={call} />
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}

function TranscriptView({ call }: { call: CallDetail }) {
  if (!call.has_transcript || !call.transcript?.length) {
    return <EmptyState title="No transcript available" body="This call has no recorded transcript." />;
  }
  return (
    <ul className="space-y-3">
      {call.transcript.map((turn, i) => (
        <li key={i} className={cx('flex', turn.role === 'agent' ? 'justify-start' : 'justify-end')}>
          <div
            className={cx(
              'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
              turn.role === 'agent' ? 'bg-brand-50 text-ink rounded-tl-sm' : 'bg-slate-100 text-ink rounded-tr-sm',
            )}
          >
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              {turn.role === 'agent' ? 'Agent' : 'Caller'}
            </p>
            {turn.content}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A play button that fetches the signed recording URL live (on demand,
 * rather than on drawer open) and swaps itself for an inline audio player.
 * Always tries to fetch the recording regardless of has_recording flag,
 * since the flag can be stale (Sonex may have finished uploading since the
 * call list was fetched).
 */
function RecordingInline({ id, hasRecording }: { id: string; hasRecording: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'empty'>('idle');
  const [recording, setRecording] = useState<CallRecording | null>(null);
  const [error, setError] = useState('');

  async function play() {
    setState('loading');
    setError('');
    try {
      const data = await api<CallRecording>(`/api/calls/${id}/recording`);
      if (!data?.url) {
        setState('empty');
        setError('Recording is not yet available. It may still be processing — try again in a moment.');
        return;
      }
      setRecording(data);
      setState('ready');
    } catch (err) {
      setState('empty');
      setError((err as Error).message || 'Could not load recording.');
    }
  }

  if (state === 'ready' && recording?.url) {
    return (
      <div>
        <audio controls autoPlay className="h-9 w-full" src={recording.url} />
        <p className="mt-1.5 text-[11px] text-ink-faint">Signed link expires {dateTime(recording.expires_at)} (valid 15 minutes).</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button className="btn-ghost !h-8 gap-1.5 !px-3 text-xs" onClick={play} disabled={state === 'loading'}>
          {state === 'loading' ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
              Loading…
            </span>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 2.2 10 6 3 9.8Z" fill="currentColor" />
              </svg>
              Play recording
            </>
          )}
        </button>
        {!hasRecording && state === 'idle' && (
          <span className="text-[11px] text-amber-600">May not be available for this call</span>
        )}
      </div>
      {state === 'empty' && <p className="mt-1.5 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
