import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, onUnauthorized, readSessionToken, writeSessionToken } from '../lib/api.js';
import { AuthContext } from './authContext.js';

/**
 * Holds the signed-in user. The session JWT lives in localStorage (see the README's
 * trade-offs); any 401 from the API signs the user out everywhere.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({
    status: readSessionToken() ? 'checking' : 'signed-out',
    user: null,
  }));

  const signOut = useCallback(() => {
    writeSessionToken(null);
    setState({ status: 'signed-out', user: null });
  }, []);

  useEffect(() => onUnauthorized(signOut), [signOut]);

  // Restore an existing session once on load.
  useEffect(() => {
    if (state.status !== 'checking') return undefined;
    const controller = new AbortController();
    apiFetch('/api/auth/me', { signal: controller.signal })
      .then(({ user }) => setState({ status: 'signed-in', user }))
      .catch((error) => {
        if (error.name !== 'AbortError') signOut();
      });
    return () => controller.abort();
  }, [state.status, signOut]);

  const authenticate = useCallback(async (path, body) => {
    const { user, token } = await apiFetch(path, { method: 'POST', body });
    writeSessionToken(token);
    setState({ status: 'signed-in', user });
    return user;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      signIn: (credentials) => authenticate('/api/auth/login', credentials),
      register: (details) => authenticate('/api/auth/register', details),
      signOut,
    }),
    [state, authenticate, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
