'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/Button';
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
// Clicking opens a popover with an optional summary + Comment / Approve /
// Request changes + submit. Dismissible via click-outside or Escape.
//
// The popover is rendered in a portal on <body> and positioned with fixed
// coordinates measured from the trigger: the header sets `contain: paint`,
// which would clip any absolutely-positioned child that overflows its thin
// bar (the same reason the theme/settings menus portal out via Radix).
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
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();

  // Anchor the portaled popover just below the trigger, flush to its right
  // edge. Re-measure on open and whenever the viewport changes size.
  useEffect(() => {
    if (!open) {
      return;
    }
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect == null) {
        return;
      }
      setCoords({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    reposition();
    // Close on click-outside (of both trigger and popover) / Escape.
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) !== true &&
        popoverRef.current?.contains(target) !== true
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    summaryRef.current?.focus();
    return () => {
      window.removeEventListener('resize', reposition);
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
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {pendingCount > 0 ? `Finish review (${pendingCount})` : 'Review changes'}
      </Button>
      {open &&
        coords != null &&
        createPortal(
          <div
            ref={popoverRef}
            id={panelId}
            role="dialog"
            aria-label="Submit review"
            style={{ top: coords.top, right: coords.right }}
            className="fixed z-50 w-80 rounded-lg border border-[var(--color-border-opaque)] bg-[var(--color-popover,var(--color-card))] p-3 text-sm shadow-xl"
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
          </div>,
          document.body
        )}
    </>
  );
}
