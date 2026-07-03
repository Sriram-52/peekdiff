import { NextResponse } from 'next/server';

import { clearTokens } from '@/lib/github/oauth';

// Clears the stored GitHub tokens. This revokes diffscope's local session only;
// it does not uninstall or de-authorize the GitHub App itself.
export async function POST() {
  await clearTokens();
  return NextResponse.json(
    { authenticated: false },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
