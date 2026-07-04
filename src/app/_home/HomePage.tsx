// A minimal functional landing for peekdiff: wordmark + URL input + a few
// example links + an honest one-line credit. Deliberately NOT a port of
// DiffsHub's marketing page — peekdiff is a tool, not a promoted product.
import Link from 'next/link';

import { DiffsHubLogo } from '@/components/DiffsHubLogo';
import { getGitHubPath } from '@/lib/getGitHubPath';

import { HomeFetchForm } from './HomeFetchForm';

const EXAMPLE_URLS = [
  'oven-sh/bun/pull/30412',
  'nodejs/node/pull/59805',
  'ghostty-org/ghostty/pull/12291',
] as const;

export function HomePage() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center px-6 md:bg-[var(--diffshub-sidebar-bg)]">
      <main className="w-full max-w-lg space-y-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <DiffsHubLogo />
          peekdiff
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          View any GitHub pull request, commit, or comparison—public or
          private—in a fast, virtualized viewer.
        </p>

        <HomeFetchForm />

        <div className="text-muted-foreground space-y-1 text-sm">
          <span>Try:</span>
          <ul className="space-y-1">
            {EXAMPLE_URLS.map((url) => (
              <li key={url}>
                <Link
                  href={getGitHubPath(`https://github.com/${url}`) ?? '/'}
                  className="inline-link"
                >
                  {url}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground pt-2 text-xs">
          Built on{' '}
          <Link
            href="https://diffshub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-link"
          >
            DiffsHub
          </Link>{' '}
          by{' '}
          <Link
            href="https://pierre.computer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-link"
          >
            Pierre
          </Link>
          {' · '}
          <Link
            href="https://github.com/Sriram-52/peekdiff"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-link"
          >
            source
          </Link>
        </p>
      </main>
    </div>
  );
}
