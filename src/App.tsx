import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session';
import { Shell } from './components/Shell';
import Overview from './pages/Overview';
import Calls from './pages/Calls';
import Appointments from './pages/Appointments';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import Login from './pages/Login';
import AdminTenants from './pages/admin/AdminTenants';

function Dashboard() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/calls" element={<Calls />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Overview />} />
      </Routes>
    </Shell>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface-page)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
    </div>
  );
}

/** One login screen; routes by whatever role the session turned out to be. */
function LoginGate() {
  const { session } = useSession();
  if (session === null) return <FullScreenSpinner />;
  if (session.role === 'admin') return <Navigate to="/admin" replace />;
  if (session.role === 'client') return <Navigate to="/" replace />;
  return <Login />;
}

function AdminGate() {
  const { session } = useSession();
  if (session === null) return <FullScreenSpinner />;
  if (session.role !== 'admin') return <Navigate to="/login" replace />;
  return <AdminTenants />;
}

function ClientGate() {
  const { session } = useSession();
  if (session === null) return <FullScreenSpinner />;
  if (session.role === 'admin') return <Navigate to="/admin" replace />;
  if (session.role !== 'client') return <Navigate to="/login" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<LoginGate />} />
        <Route path="/admin" element={<AdminGate />} />
        <Route path="/*" element={<ClientGate />} />
      </Routes>
    </SessionProvider>
  );
}
