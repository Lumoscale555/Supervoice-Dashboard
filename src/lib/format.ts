// Shared formatters. Billing is a single flat rate (Rs.5/min, 30s pulse) in
// INR, so there is one currency formatter rather than a multi-currency split.

export const inr = (n: number | undefined | null) =>
  typeof n === 'number' ? n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }) : '—';

/** Alias kept for call sites that want the same value with no rounding surprises. */
export const inrPrecise = inr;

export const count = (n: number | undefined | null) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');

export const percent = (n: number | undefined | null, digits = 1) =>
  typeof n === 'number' && Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—';

export function duration(secs: number | undefined | null) {
  if (typeof secs !== 'number' || Number.isNaN(secs)) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export const dateOnly = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const dayLabel = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const timeOnly = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';

export function relative(iso: string | null | undefined) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return hrs > 0 ? `${hrs}h ago` : `in ${-hrs}h`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days}d ago` : `in ${-days}d`;
  return dateOnly(iso);
}

/** E.164 is hard to scan; group it without pretending to know the country plan. */
export function phone(value: string | null | undefined) {
  if (!value) return 'Web call';
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+1') && digits.length === 12) {
    return `+1 (${digits.slice(2, 5)}) ${digits.slice(5, 8)}-${digits.slice(8)}`;
  }
  if (digits.startsWith('+') && digits.length > 8) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 8)} ${digits.slice(8)}`;
  }
  return value;
}

export const titleCase = (value: string) =>
  value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Signed change between two periods; null when the baseline is zero. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

export const compactNumber = (n: number) =>
  Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
