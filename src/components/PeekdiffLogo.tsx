// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: replaced Pierre's logo artwork (their trademark, not
// licensed) with an original mark — a rounded tile holding a green "+" over a
// red "-", i.e. the diff idea as an app icon — and relabeled it peekdiff.
import { cn } from '@/lib/cn';

export function PeekdiffLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={cn('size-6 shrink-0', className)}
      fill="none"
      role="img"
      aria-label="peekdiff"
    >
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="6"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.3}
      />
      <path
        d="M12 6.4v4.3M9.85 8.55h4.3"
        stroke="#07c480"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M9.85 15.5h4.3"
        stroke="#ff6762"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
