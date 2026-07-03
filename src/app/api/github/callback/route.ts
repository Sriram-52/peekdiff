import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import {
  exchangeCodeForToken,
  OAUTH_STATE_COOKIE,
  persistTokens,
  RETURN_TO_COOKIE,
} from '@/lib/github/oauth';

// GitHub redirects here after consent. Two flows land here:
//   1. Our own login flow (/api/github/login) — carries the CSRF `state` we
//      set in a cookie, which we validate.
//   2. GitHub's install flow (when "Request user authorization during
//      installation" is on) — carries `code` + `installation_id` +
//      `setup_action` but NO state of ours, because GitHub initiated it.
// Either way we exchange the code for a user access token and store it.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const oauthError = params.get('error');
  // Present only on the GitHub-initiated install redirect.
  const isInstallFlow =
    params.get('installation_id') != null || params.get('setup_action') != null;

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  const returnTo = store.get(RETURN_TO_COOKIE)?.value || '/';

  // Clear single-use flow cookies regardless of outcome.
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(RETURN_TO_COOKIE);

  if (oauthError) {
    return redirectWithError(request, returnTo, oauthError);
  }
  if (!code) {
    return redirectWithError(request, returnTo, 'missing_code');
  }
  // CSRF check applies to our login flow. The install flow can't carry our
  // state (GitHub started it), so we accept it on the strength of the
  // single-use code + install params instead.
  if (!isInstallFlow && (!state || !expectedState || state !== expectedState)) {
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
