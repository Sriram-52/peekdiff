// A minimal landing whose hero IS a diff — peekdiff's value prop rendered as
// removed/added lines in the code font, matching the viewer's own aesthetic.
// Deliberately not a port of DiffsHub's marketing page.
import Link from 'next/link';

import { PeekdiffLogo } from '@/components/PeekdiffLogo';

import { HomeFetchForm } from './HomeFetchForm';

const HERO_DIFF: { type: 'del' | 'add'; text: string }[] = [
  { type: 'del', text: 'squinting at a cramped diff in a github tab' },
  { type: 'add', text: 'fast, virtualized rendering' },
  { type: 'add', text: 'public or private repositories' },
  { type: 'add', text: 'inline review · markdown · per-file viewed' },
];

export function HomePage() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center px-6 md:bg-[var(--peekdiff-sidebar-bg)]">
      <main className="w-full max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <PeekdiffLogo />
            peekdiff
          </h1>
          <a
            href="https://github.com/Sriram-52/peekdiff"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              viewBox="0 0 16 16"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>

        {/* Hero rendered as a diff hunk. */}
        <div className="bg-background overflow-hidden rounded-xl border font-mono text-[13px] leading-relaxed shadow-sm">
          <div className="text-muted-foreground border-b px-3 py-1.5 text-[11px] tracking-tight">
            what changed
          </div>
          {HERO_DIFF.map((line, i) => {
            const isAdd = line.type === 'add';
            return (
              <div
                key={i}
                className={
                  isAdd
                    ? 'flex items-baseline gap-2 border-l-2 border-[#07c480] bg-[#07c480]/8 py-0.5 pr-3 pl-2 text-[#18a46c] dark:text-[#3fd89b]'
                    : 'flex items-baseline gap-2 border-l-2 border-[#ff6762] bg-[#ff6762]/8 py-0.5 pr-3 pl-2 text-[#e5484d] dark:text-[#ff6762]'
                }
              >
                <span className="text-muted-foreground w-5 shrink-0 text-right text-[11px] select-none">
                  {i + 1}
                </span>
                <span className="shrink-0 select-none">{isAdd ? '+' : '-'}</span>
                <span className="text-pretty">{line.text}</span>
              </div>
            );
          })}
        </div>

        <HomeFetchForm />

        <p className="text-muted-foreground text-xs">
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
