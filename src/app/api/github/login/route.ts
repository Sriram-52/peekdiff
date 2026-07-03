import { type NextRequest, NextResponse } from 'next/server';

import {
  buildAuthorizeUrl,
  OAUTH_STATE_COOKIE,
  RETURN_TO_COOKIE,
} from '@/lib/github/oauth';

// Starts the GitHub App OAuth flow: generates a CSRF state, remembers where to
// send the user back to, and redirects to GitHub's consent screen.
export async function GET(request: NextRequest) {
  const returnTo = sanitizeReturnTo(
    request.nextUrl.searchParams.get('returnTo')
  );
  const redirectUri = `${request.nextUrl.origin}/api/github/callback`;
  const state = crypto.randomUUID();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(state, redirectUri);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OAuth misconfigured' },
      { status: 500 }
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  };
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieBase);
  response.cookies.set(RETURN_TO_COOKIE, returnTo, cookieBase);
  return response;
}

// Only allow returning to a same-origin absolute path, never an external URL.
function sanitizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}
