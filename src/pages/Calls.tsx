import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useQuery, useStreamQuery } from '../lib/api';
import type { CallDetail, CallRecording, CallSummary, RangeKey } from '../lib/types';
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
  const [range, setRange] = useState<RangeKey>('today');
  const [openId, setOpenId] = useState<string | null>(params.get('open'));

  // Filter changes reset stream.
  const streamParams = useMemo(() => ({
    status: filters.status || undefined,
    direction: filters.direction || undefined,
    phone_number: filters.phone || undefined,
    range,
  }), [filters.status, filters.direction, filters.phone, range]);

  const { items: calls, meta, error, streaming, initial, refresh } = useStreamQuery<CallSummary>(
    '/api/calls/stream',
    streamParams,
  );

  // Client-side pagination over the streamed full list.
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);

  // Reset page whenever filters change.
  useEffect(() => { setPage(0); }, [filters.status, filters.direction, filters.phone, range]);

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
      <PageHeader title="Calls" description="Every call your agents have handled, searchable and filterable." range={range} onRangeChange={setRange} />

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
 * Loads the signed recording URL on demand and renders a premium custom
 * audio player with a seekable progress bar, MM:SS time display, volume
 * slider, and auto-retry capability.
 */
function RecordingInline({ id, hasRecording }: { id: string; hasRecording: boolean }) {
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');

  async function loadRecording() {
    setFetchState('loading');
    setFetchError('');
    try {
      const data = await api<CallRecording>(`/api/calls/${id}/recording`);
      if (!data?.url) {
        setFetchState('error');
        setFetchError('Recording URL was empty. Sonex may still be processing it — try again in a few seconds.');
        return;
      }
      setRecordingUrl(data.url);
      setExpiresAt(data.expires_at);
      setFetchState('ready');
    } catch (err) {
      setFetchState('error');
      setFetchError((err as Error).message || 'Could not load recording.');
    }
  }

  if (fetchState === 'idle' || fetchState === 'loading') {
    return (
      <div className="flex items-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition-all hover:bg-brand-100 hover:shadow-sm disabled:opacity-60"
          onClick={loadRecording}
          disabled={fetchState === 'loading'}
        >
          {fetchState === 'loading' ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              Fetching recording…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.5 4.8 10 7 5.5 9.2Z" fill="currentColor" />
              </svg>
              Load recording
            </>
          )}
        </button>
        {!hasRecording && fetchState === 'idle' && (
          <span className="text-[11px] text-amber-600">Sonex may not have a recording for this call</span>
        )}
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-rose-600">{fetchError}</p>
        <button
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          onClick={loadRecording}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 6A4.5 4.5 0 1 1 6 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M1.5 3.5V6H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <AudioPlayer url={recordingUrl!} />
      {expiresAt && (
        <p className="mt-2 text-[10px] text-ink-faint">
          Signed link expires {dateTime(expiresAt)} · valid 15 min
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- AudioPlayer */

function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const displayTime = dragging ? dragTime : currentTime;
  const progress = duration > 0 ? displayTime / duration : 0;

  // Sync audio events → state
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onDur = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('durationchange', onDur);
    a.addEventListener('loadedmetadata', onDur);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('durationchange', onDur);
      a.removeEventListener('loadedmetadata', onDur);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause(); else a.play();
  }

  function seekTo(ratio: number) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const t = Math.max(0, Math.min(1, ratio)) * duration;
    a.currentTime = t;
    setCurrentTime(t);
  }

  function getRatioFromEvent(e: React.MouseEvent | MouseEvent): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return (e.clientX - rect.left) / rect.width;
  }

  function onTrackClick(e: React.MouseEvent) {
    seekTo(getRatioFromEvent(e));
  }

  function onThumbMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    const move = (mv: MouseEvent) => {
      const t = Math.max(0, Math.min(1, getRatioFromEvent(mv))) * duration;
      setDragTime(t);
    };
    const up = (upEv: MouseEvent) => {
      seekTo(getRatioFromEvent(upEv));
      setDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
      <audio ref={audioRef} src={url} preload="metadata" />

      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-md transition-all hover:bg-brand-600 hover:scale-105 active:scale-95"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
              <rect x="2" y="1.5" width="3.5" height="11" rx="1" />
              <rect x="8.5" y="1.5" width="3.5" height="11" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
              <path d="M3 1.8 12.5 7 3 12.2Z" />
            </svg>
          )}
        </button>

        {/* Progress track + time */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Track */}
          <div
            ref={trackRef}
            className="group relative h-2 cursor-pointer rounded-full bg-slate-200"
            onClick={onTrackClick}
          >
            {/* Filled bar */}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-75"
              style={{ width: `${progress * 100}%` }}
            />
            {/* Draggable thumb */}
            <div
              className={cx(
                'absolute top-1/2 -translate-y-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-brand-500 shadow-md ring-2 ring-brand-200 transition-opacity',
                dragging ? 'opacity-100 scale-125' : 'opacity-0 group-hover:opacity-100',
              )}
              style={{ left: `${progress * 100}%` }}
              onMouseDown={onThumbMouseDown}
            />
          </div>

          {/* Time labels */}
          <div className="flex justify-between text-[10px] tabular-nums text-ink-faint">
            <span className={dragging ? 'font-medium text-brand-600' : ''}>{fmtTime(displayTime)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <div className="group relative flex items-center">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-ink-faint" aria-hidden="true">
            {volume === 0 ? (
              <path d="M3 6h2.5L9 3v10L5.5 10H3zM12 6l2 4M14 6l-2 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            ) : (
              <>
                <path d="M3 6h2.5L9 3v10L5.5 10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </>
            )}
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={onVolumeChange}
            className="ml-1.5 w-16 accent-brand-500"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}
