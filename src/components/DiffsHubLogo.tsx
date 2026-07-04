// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: replaced Pierre's logo artwork (their trademark, not
// licensed) with an original "peek" eye mark and relabeled it peekdiff.
import { cn } from '@/lib/cn';

export function DiffsHubLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={cn('size-6 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="peekdiff"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
