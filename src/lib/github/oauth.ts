// GitHub App user-to-server OAuth (server-only).
//
// diffscope uses a GitHub App to read diffs from private repositories. This
// module is the ONLY place the app's client secret is used. It mints a
// short-lived *user access token* that the browser then uses to fetch diffs
// directly from api.github.com, so private source never passes through this
// server. See /NOTICE for attribution of the surrounding viewer.
import 'server-only';

import { cookies } from 'next/headers';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// httpOnly cookies. The access token is readable by same-origin JS only via
// the /api/github/session route (it is NOT NEXT_PUBLIC and never rendered into
// HTML); the refresh token is never exposed to the client.
export const ACCESS_TOKEN_COOKIE = 'dsc_gh_at';
export const REFRESH_TOKEN_COOKIE = 'dsc_gh_rt';
export const ACCESS_EXPIRY_COOKIE = 'dsc_gh_exp';
export const OAUTH_STATE_COOKIE = 'dsc_gh_state';
export const RETURN_TO_COOKIE = 'dsc_gh_return';

interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
}

// Reads the GitHub App credentials. Throws a clear error (surfaced as a 500 by
// the routes) when the app has not been configured yet, so a missing .env is
// obvious rather than a cryptic OAuth failure.
export function getOAuthConfig(): GitHubOAuthConfig {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'GitHub App is not configured. Set GITHUB_APP_CLIENT_ID and ' +
        'GITHUB_APP_CLIENT_SECRET (see README).'
    );
  }
  return { clientId, clientSecret };
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET
  );
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = getOAuthConfig();
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  // Note: GitHub *Apps* derive repo access from the app's configured
  // permissions + installations, so no `scope` param is sent here.
  return url.href;
}

interface TokenResponse {
  accessToken: string;
  // Epoch milliseconds when the access token expires, or null when the app has
  // token expiration disabled (tokens then live until revoked).
  accessExpiresAt: number | null;
  refreshToken: string | null;
}

interface RawTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

async function requestToken(
  params: Record<string, string>
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getOAuthConfig();
  const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...params,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GitHub token endpoint returned ${response.status}.`);
  }

  const data = (await response.json()) as RawTokenResponse;
  if (data.error || !data.access_token) {
    throw new Error(
      data.error_description || data.error || 'GitHub token exchange failed.'
    );
  }

  return {
    accessToken: data.access_token,
    accessExpiresAt:
      typeof data.expires_in === 'number'
        ? Date.now() + data.expires_in * 1000
        : null,
    refreshToken: data.refresh_token ?? null,
  };
}

export function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  return requestToken({ code, redirect_uri: redirectUri });
}

export function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function persistTokens(token: TokenResponse): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, token.accessToken, COOKIE_BASE);
  store.set(
    ACCESS_EXPIRY_COOKIE,
    token.accessExpiresAt == null ? '' : String(token.accessExpiresAt),
    COOKIE_BASE
  );
  if (token.refreshToken != null) {
    store.set(REFRESH_TOKEN_COOKIE, token.refreshToken, COOKIE_BASE);
  }
}

export async function clearTokens(): Promise<void> {
  const store = await cookies();
  for (const name of [
    ACCESS_TOKEN_COOKIE,
    ACCESS_EXPIRY_COOKIE,
    REFRESH_TOKEN_COOKIE,
  ]) {
    store.delete(name);
  }
}

// Returns a currently-valid access token, transparently refreshing it when it
// is within 60s of expiry and a refresh token is available. Returns null when
// the visitor is not authenticated (or the token can no longer be refreshed).
export async function getValidAccessToken(): Promise<{
  token: string;
  expiresAt: number | null;
} | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  const expiryRaw = store.get(ACCESS_EXPIRY_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAt = expiryRaw ? Number(expiryRaw) : null;

  const isExpiring =
    expiresAt != null && Number.isFinite(expiresAt) && expiresAt - Date.now() < 60_000;

  if (accessToken && !isExpiring) {
    return { token: accessToken, expiresAt };
  }

  if (refreshToken) {
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      await persistTokens(refreshed);
      return { token: refreshed.accessToken, expiresAt: refreshed.accessExpiresAt };
    } catch {
      await clearTokens();
      return null;
    }
  }

  return accessToken ? { token: accessToken, expiresAt } : null;
}
