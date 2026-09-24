import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session';
import type { AuthMe } from '../lib/types';
import { cx } from './ui';
import type { RangeKey } from '../lib/types';

const NAV = [
  { to: '/', label: 'Overview', end: true, icon: IconGrid },
  { to: '/calls', label: 'Calls', icon: IconPhone },
  { to: '/appointments', label: 'Appointments', icon: IconCalendar },
  { to: '/billing', label: 'Billing', icon: IconWallet },
  { to: '/settings', label: 'Settings', icon: IconGear },
];

export function Shell({ children }: { children: ReactNode }) {
  const { session, logout } = useSession();
  const me: AuthMe | null = session?.role === 'client' ? session : null;
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on navigation, otherwise it covers the page you
  // just asked for.
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen">
      {navOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-brand-950/25 backdrop-blur-sm animate-fade-in lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-white',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:translate-x-0',
          navOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-500 text-white shadow-sm">
            <IconWave />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">Super Voice</span>
        </div>

        {me && (
          <div className="border-b border-line px-5 py-3">
            <p className="truncate text-sm font-medium text-ink">{me.tenant.name}</p>
            <p className="truncate text-xs text-ink-faint">
              {me.tenant.agentName ?? 'Whole account'}
            </p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-brand-50/50 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500 transition-all duration-300',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <item.icon active={isActive} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <ModeCard me={me} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <TopBar onMenu={() => setNavOpen(true)} me={me} onLogout={logout} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function ModeCard({ me }: { me: AuthMe | null }) {
  const demo = me?.mode === 'no_key';
  return (
    <div className="rounded-xl bg-brand-50/60 p-3">
      <div className="flex items-center gap-2">
        <span className={cx('h-2 w-2 rounded-full', demo ? 'bg-amber-500' : 'bg-emerald-500')} />
        <span className="text-xs font-semibold text-ink">{demo ? 'No API key' : 'Live API'}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
        {demo ? 'No Sonex API key set for this client yet — ask your admin.' : 'Connected to your Sonex account.'}
      </p>
    </div>
  );
}

function TopBar({ onMenu, me, onLogout }: { onMenu: () => void; me: AuthMe | null; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (me?.tenant.name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button className="btn-ghost !h-9 !w-9 !px-0 lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <PageTitle />

      <div className="relative ml-auto flex items-center gap-3">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white"
        >
          {initials}
        </button>
        {menuOpen && (
          <>
            <button aria-label="Close menu" className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-11 z-20 w-48 animate-fade-in rounded-xl border border-line bg-white p-1.5 shadow-lift">
              <p className="truncate px-2.5 py-1.5 text-xs text-ink-faint">Signed in as @{me?.tenant.username}</p>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink hover:bg-brand-50/60"
                onClick={() => confirm('Sign out?') && onLogout()}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function PageTitle() {
  const { pathname } = useLocation();
  const match = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  return <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">{match?.label ?? 'Overview'}</h1>;
}

/* --------------------------------------------------------- Page header */

export function PageHeader({
  title,
  description,
  range,
  onRangeChange,
  actions,
}: {
  title: string;
  description?: string;
  range?: RangeKey;
  onRangeChange?: (r: RangeKey) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {range && onRangeChange && (
          <select
            className="field !h-9 w-auto"
            aria-label="Time range"
            value={range}
            onChange={(e) => onRangeChange(e.target.value as RangeKey)}
          >
            <option value="today">Today</option>
            <option value="7d">Week</option>
            <option value="30d">Month</option>
            <option value="90d">90 days</option>
          </select>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Icons */

type IconProps = { active?: boolean };
const stroke = { stroke: 'currentColor', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function IconGrid(_: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.5" {...stroke} />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.5" {...stroke} />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.5" {...stroke} />
      <rect x="10" y="10" width="5.5" height="5.5" rx="1.5" {...stroke} />
    </svg>
  );
}

function IconPhone(_: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M6.2 3.2 7.5 6 6.1 7.4a8.5 8.5 0 0 0 4.5 4.5L12 10.5l2.8 1.3v2.6c0 .6-.5 1.1-1.1 1A11.6 11.6 0 0 1 3.6 5.3c-.1-.6.4-1.1 1-1.1h1.6Z" {...stroke} />
    </svg>
  );
}

function IconCalendar(_: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2.5" y="3.8" width="13" height="11.7" rx="2" {...stroke} />
      <path d="M2.5 7.3h13M6 2.5v2.6M12 2.5v2.6" {...stroke} />
    </svg>
  );
}

function IconWallet(_: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2.5" y="4.2" width="13" height="10" rx="2.2" {...stroke} />
      <path d="M2.5 7.6h13" {...stroke} />
      <circle cx="12.2" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

function IconGear(_: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="2.4" {...stroke} />
      <path d="M9 1.8v1.9M9 14.3v1.9M16.2 9h-1.9M3.7 9H1.8M14.1 3.9l-1.3 1.3M5.2 12.8l-1.3 1.3M14.1 14.1l-1.3-1.3M5.2 5.2 3.9 3.9" {...stroke} />
    </svg>
  );
}

function IconWave() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h1.4M5 4.8v6.4M8 2.6v10.8M11 5.6v4.8M14 7.2v1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
