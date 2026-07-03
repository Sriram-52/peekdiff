import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import {
  exchangeCodeForToken,
  OAUTH_STATE_COOKIE,
  persistTokens,
  RETURN_TO_COOKIE,
} from '@/lib/github/oauth';

// GitHub redirects here after consent. Validates the CSRF state, exchanges the
// code for a user access token, stores it in httpOnly cookies, and sends the
// user back to where they started.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const oauthError = params.get('error');

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  const returnTo = store.get(RETURN_TO_COOKIE)?.value || '/';

  // Clear single-use flow cookies regardless of outcome.
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(RETURN_TO_COOKIE);

  if (oauthError) {
    return redirectWithError(request, returnTo, oauthError);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, returnTo, 'invalid_state');
  }

  try {
    const redirectUri = `${request.nextUrl.origin}/api/github/callback`;
    const token = await exchangeCodeForToken(code, redirectUri);
    await persistTokens(token);
  } catch {
    return redirectWithError(request, returnTo, 'exchange_failed');
  }

  return NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
}

function redirectWithError(
  request: NextRequest,
  returnTo: string,
  reason: string
): NextResponse {
  const target = new URL(returnTo, request.nextUrl.origin);
  target.searchParams.set('auth_error', reason);
  return NextResponse.redirect(target);
}
