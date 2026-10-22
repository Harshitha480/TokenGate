import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './useAuth.js';

/** Guards dashboard routes; remembers where the user was headed. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="grid h-full place-items-center text-muted" role="status">
        Restoring your session…
      </div>
    );
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Keeps signed-in users off the login and register pages. */
export function RedirectIfSignedIn() {
  const { status } = useAuth();
  if (status === 'signed-in') return <Navigate to="/" replace />;
  return <Outlet />;
}
