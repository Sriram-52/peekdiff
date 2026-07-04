// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: when a load fails in a way consistent with a private repo,
// offer a "Connect GitHub" action instead of a bare retry.
import { IconCiWarningFill, IconRefresh } from '@pierre/icons';

import { useChromeThemeProps } from './useChromeThemeProps';
import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';
import { peekdiffChromeMapping } from '@/lib/theme/peekdiffChromeMapping';
import type { ViewerLoadState } from '@/lib/types';

interface PeekdiffStatusPanelProps {
  errorMessage: string | null;
  // When true the failure looks like a private repo the visitor hasn't
  // connected GitHub for; the panel offers `onConnect` instead of a retry.
  needsAuth?: boolean;
  // When true the visitor IS connected but GitHub denied/hid the repo (403/404)
  // — likely an org that hasn't granted the app. Offer manage-access + reconnect.
  needsAccess?: boolean;
  // Deep link to GitHub's "manage access" page for the peekdiff app, where the
  // user can grant an organization.
  manageAccessUrl?: string | null;
  onConnect?(): void;
  onReconnect?(): void;
  onRetry(): void;
  state: ViewerLoadState;
}

export function PeekdiffStatusPanel({
  errorMessage,
  needsAuth = false,
  needsAccess = false,
  manageAccessUrl,
  onConnect,
  onReconnect,
  onRetry,
  state,
}: PeekdiffStatusPanelProps) {
  // Mirror the rest of the diffshub chrome so the loading screen sits on the
  // active Shiki theme's surface instead of the global light/dark palette.
  // Mounted before the viewer is available, so we lean on the same provider
  // useChromeThemeProps the header/sidebar use — the controller source keeps the
  // last-resolved theme, so this stays on-palette without flashing the default.
  const { style: chromeStyle } = useChromeThemeProps(peekdiffChromeMapping);
  const themeChromeStyle =
    Object.keys(chromeStyle).length > 0 ? chromeStyle : undefined;
  const isError = state === 'error';
  const showConnect = isError && needsAuth && onConnect != null;
  const showAccess = isError && needsAccess;
  const title = !isError
    ? state === 'parsing'
      ? 'Preparing diff'
      : state === 'fetching'
        ? 'Fetching diff'
        : 'Streaming diff'
    : needsAuth
      ? 'This repo may be private'
      : needsAccess
        ? 'Can’t access this repository'
        : 'Couldn’t load diff';

  const message = !isError
    ? state === 'parsing'
      ? 'Parsing the patch and building the file tree…'
      : state === 'fetching'
        ? 'Fetching the patch from GitHub…'
        : 'Reading the patch and showing files as they arrive…'
    : needsAuth
      ? 'Connect your GitHub account to view diffs from private repositories you have access to.'
      : needsAccess
        ? 'You’re connected, but GitHub hasn’t granted peekdiff access to this repository. If it’s under an organization, grant the app access there, then reconnect.'
        : (errorMessage ?? 'Failed to fetch the diff, please try again.');

  return (
    <div
      className={cn(
        'col-span-full flex min-h-0 items-center justify-center p-6',
        themeChromeStyle == null && 'bg-background'
      )}
      style={themeChromeStyle}
    >
      <section
        role={isError ? 'alert' : 'status'}
        aria-live="polite"
        aria-busy={!isError || undefined}
        className="w-full max-w-md p-5 text-center"
      >
        {!isError ? (
          <IconRefresh
            aria-hidden="true"
            className="text-muted-foreground mx-auto mb-3 size-5 -scale-x-100 animate-spin [animation-direction:reverse]"
          />
        ) : (
          <IconCiWarningFill className="text-muted-foreground mx-auto mb-3 size-5" />
        )}
        <h2 className="text-foreground text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">
          {message}
        </p>
        {showConnect ? (
          <Button type="button" className="mt-4" onClick={onConnect}>
            Connect GitHub
          </Button>
        ) : showAccess ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {manageAccessUrl != null && (
              <Button
                type="button"
                onClick={() =>
                  window.open(manageAccessUrl, '_blank', 'noopener,noreferrer')
                }
              >
                Manage GitHub access
              </Button>
            )}
            {onReconnect != null && (
              <Button type="button" variant="outline" onClick={onReconnect}>
                Reconnect
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : isError ? (
          <Button type="button" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </section>
    </div>
  );
}
