'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface SessionResponse {
  authenticated: boolean;
  configured: boolean;
  token?: string;
  expiresAt?: number | null;
}

interface GitHubAuthValue {
  // null while the initial session check is in flight.
  authenticated: boolean | null;
  // Whether a GitHub App is configured on the server at all.
  configured: boolean;
  // The current user access token, or null when signed out. Held in memory
  // only (never localStorage) since it grants private-repo read.
  token: string | null;
  // Redirects into the OAuth flow, returning to `returnTo` afterwards.
  login(returnTo?: string): void;
  logout(): Promise<void>;
  // Re-checks the session (also refreshes a near-expiry token server-side).
  refresh(): Promise<string | null>;
}

const GitHubAuthContext = createContext<GitHubAuthValue | null>(null);

export function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/github/session', { cache: 'no-store' });
      const data = (await res.json()) as SessionResponse;
      const nextToken = data.authenticated ? (data.token ?? null) : null;
      setConfigured(data.configured);
      setAuthenticated(data.authenticated);
      setToken(nextToken);
      return nextToken;
    } catch {
      setAuthenticated(false);
      setToken(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // refresh() only sets state after awaiting the /session fetch, so this is
    // an async load-on-mount, not the synchronous setState-in-effect the rule
    // guards against (which would loop).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const login = useCallback((returnTo?: string) => {
    const target =
      returnTo ??
      (typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/');
    window.location.href = `/api/github/login?returnTo=${encodeURIComponent(target)}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/github/logout', { method: 'POST' });
    } finally {
      setAuthenticated(false);
      setToken(null);
    }
  }, []);

  const value = useMemo<GitHubAuthValue>(
    () => ({ authenticated, configured, token, login, logout, refresh }),
    [authenticated, configured, token, login, logout, refresh]
  );

  return (
    <GitHubAuthContext.Provider value={value}>
      {children}
    </GitHubAuthContext.Provider>
  );
}

export function useGitHubAuth(): GitHubAuthValue {
  const value = useContext(GitHubAuthContext);
  if (value == null) {
    throw new Error('useGitHubAuth must be used within a GitHubAuthProvider');
  }
  return value;
}
