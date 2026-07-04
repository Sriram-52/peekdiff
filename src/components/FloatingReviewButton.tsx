'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';
import type { ReviewEvent } from '@/lib/github/reviews';

interface FloatingReviewButtonProps {
  // Whether the visitor is connected to GitHub on a PR path.
  canReview: boolean;
  pendingCount: number;
  submitting: boolean;
  error: string | null;
  onSubmit(event: ReviewEvent, summary: string): void;
}

const EVENT_OPTIONS: { value: ReviewEvent; label: string }[] = [
  { value: 'COMMENT', label: 'Comment' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REQUEST_CHANGES', label: 'Request changes' },
];

// The review-submit control that lives in the header toolbar. Shows whenever
// the visitor can review this PR — even with zero pending comments, so a
// summary-only Approve / Request changes is possible without first drafting an
// inline note. The label reflects the pending count when there is one.
// Clicking opens a popover (anchored below the button) with an optional summary
// + Comment / Approve / Request changes + submit. Dismissible via click-outside
// or Escape.
export function FloatingReviewButton({
  canReview,
  pendingCount,
  submitting,
  error,
  onSubmit,
}: FloatingReviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<ReviewEvent>('COMMENT');
  const [summary, setSummary] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();

  // Close on click-outside / Escape while the popover is open.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (
        containerRef.current != null &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    summaryRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!canReview) {
    return null;
  }

  // A COMMENT review needs inline comments or a summary; APPROVE /
  // REQUEST_CHANGES can stand alone.
  const canSubmit =
    !submitting &&
    (pendingCount > 0 || event !== 'COMMENT' || summary.trim().length > 0);

  return (
    <div ref={containerRef} className="relative flex flex-col items-end">
      <Button
        type="button"
        size="sm"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="bg-blue-500 text-white hover:bg-blue-600"
      >
        {pendingCount > 0 ? `Finish review (${pendingCount})` : 'Review changes'}
      </Button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Submit review"
          className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-[var(--color-border-opaque)] bg-[var(--color-popover,var(--color-card))] p-3 text-sm shadow-xl"
        >
          <div className="text-muted-foreground mb-1.5">
            {pendingCount > 0
              ? `${pendingCount} pending comment${pendingCount === 1 ? '' : 's'}`
              : 'No pending comments'}
          </div>
          <textarea
            ref={summaryRef}
            value={summary}
            onChange={(e) => setSummary(e.currentTarget.value)}
            placeholder="Review summary (optional)…"
            rows={3}
            className="field-sizing-content placeholder:text-muted-foreground focus-visible:ring-ring mb-2 w-full resize-none rounded-md border border-[var(--color-border-opaque)] bg-transparent px-2 py-1.5 text-[13px] focus:outline-none focus-visible:ring-2"
          />
          <div className="flex items-center gap-2">
            <select
              value={event}
              onChange={(e) => setEvent(e.currentTarget.value as ReviewEvent)}
              disabled={submitting}
              aria-label="Review action"
              className="focus-visible:ring-ring min-w-0 flex-1 rounded-md border border-[var(--color-border-opaque)] bg-transparent px-2 py-1.5 text-[13px] focus:outline-none focus-visible:ring-2"
            >
              {EVENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmit(event, summary.trim())}
              className={cn('bg-blue-500 hover:bg-blue-600')}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
          {error != null && (
            <p
              role="alert"
              className="mt-2 text-[13px] text-[#be123c] dark:text-[#fb7185]"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
