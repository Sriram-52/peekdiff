import { NextResponse } from 'next/server';

import {
  getAuthMode,
  getClientId,
  getValidAccessToken,
  isGitHubAppConfigured,
} from '@/lib/github/oauth';

// Same-origin endpoint the client hook calls to learn whether the visitor is
// connected and, if so, to obtain the current user access token for direct
// api.github.com diff fetches. The token is returned to same-origin JS only
// (never rendered into HTML) and refreshed here when near expiry.
export async function GET() {
  const configured = isGitHubAppConfigured();
  const authMode = getAuthMode();
  const clientId = getClientId();
  const session = configured ? await getValidAccessToken() : null;

  if (session == null) {
    return NextResponse.json(
      { authenticated: false, configured, authMode, clientId },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      configured,
      authMode,
      clientId,
      token: session.token,
      expiresAt: session.expiresAt,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
