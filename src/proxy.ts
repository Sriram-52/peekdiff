import { type NextRequest, NextResponse } from 'next/server';

// Strict Content-Security-Policy for peekdiff (Next 16 `proxy` convention —
// the former `middleware` file).
//
// peekdiff hands a live GitHub user access token to same-origin JS (via
// /api/github/session) so the browser can fetch private diffs DIRECTLY from
// api.github.com — the server never sees the source. The flip side of that
// design is that the token's only real theft vector is XSS: any attacker
// script running on our origin could read the token and call GitHub with it.
// This CSP is the primary defense.
//
//   * A fresh per-request nonce + 'strict-dynamic' means ONLY our own scripts
//     execute — no injected inline or remote <script> runs, so there is no
//     foothold from which to read the token in the first place.
//   * connect-src is locked to our origin + api.github.com, so even if
//     something did run, it could not fetch()/beacon the token to an
//     attacker-controlled host.
//
// Cost: requesting a nonce forces every page to render dynamically (Next
// injects the nonce during SSR from this header, which can't happen at build
// time), so static optimization / CDN caching are traded away. That's an
// accepted cost for a tool that holds a live GitHub token in the browser.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  // Directive notes:
  //  - script-src: nonce + 'strict-dynamic'. With 'strict-dynamic' present,
  //    browsers ignore the 'self' host-source and trust only nonce'd scripts
  //    and the scripts THEY load (which covers Next's chunk loader and the
  //    bundled diff worker). 'wasm-unsafe-eval' is required by the shiki-wasm
  //    highlighter that runs in that worker. 'unsafe-eval' is dev-only (React's
  //    dev error overlay uses eval; production React/Next do not).
  //  - style-src 'unsafe-inline': React style props and shiki's per-token color
  //    `style="..."` attributes are inline styles, which nonces do NOT cover.
  //    This does not weaken token protection — that rests on script-src +
  //    connect-src; an attacker cannot read the token through CSS.
  //  - connect-src: 'self' (our /api/* routes) + api.github.com (the browser's
  //    direct diff / review / token-refresh fetches). This is the directive
  //    that stops a stolen token from being exfiltrated to another origin.
  //  - img-src https:: GitHub avatars and images embedded in PR review-comment
  //    markdown come from arbitrary hosts; images can't read the token, so this
  //    is safe. http: stays blocked (mixed content).
  //  - worker-src 'self' blob:: the bundled @pierre/diffs highlight worker.
  //  - object-src 'none' / base-uri 'self' / frame-ancestors 'none': plugin,
  //    base-tag-hijack, and clickjacking hardening.
  //  - upgrade-insecure-requests is production-only: on http://localhost it
  //    would upgrade same-origin dev requests to https and break local dev.
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${
      isDev ? " 'unsafe-eval'" : ''
    }`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self'`,
    `connect-src 'self' https://api.github.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  // Pass the nonce inbound so Next can read it during SSR and stamp it onto its
  // own framework/chunk scripts; also echo the CSP on the request so the value
  // Next parses matches the one we send to the browser.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Run on document/navigation requests only. Skip API routes (JSON, no
    // inline scripts to nonce), Next's static assets and image optimizer, and
    // the favicon. Also skip next/link prefetches, which don't render HTML.
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
