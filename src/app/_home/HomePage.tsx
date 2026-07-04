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
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PeekdiffLogo />
          peekdiff
        </h1>

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
