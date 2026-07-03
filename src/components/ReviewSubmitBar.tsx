'use client';

import { useState } from 'react';

import { Button } from '@/components/Button';
import type { ReviewEvent } from '@/lib/github/reviews';

interface ReviewSubmitBarProps {
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

// The review-submit control for the comments sidebar: collects the pending
// (not-yet-posted) inline comments into one GitHub review with an optional
// summary and an Approve / Request changes / Comment event. Only rendered when
// the visitor is connected on a PR.
export function ReviewSubmitBar({
  pendingCount,
  submitting,
  error,
  onSubmit,
}: ReviewSubmitBarProps) {
  const [event, setEvent] = useState<ReviewEvent>('COMMENT');
  const [summary, setSummary] = useState('');

  // A COMMENT review needs either inline comments or a summary; APPROVE /
  // REQUEST_CHANGES can be submitted on their own.
  const canSubmit =
    !submitting &&
    (pendingCount > 0 || event !== 'COMMENT' || summary.trim().length > 0);

  return (
    <div className="border-b border-[var(--color-border-opaque)] px-3 py-2.5 text-sm">
      <div className="text-muted-foreground mb-1.5">
        {pendingCount === 0
          ? 'No pending comments'
          : `${pendingCount} pending comment${pendingCount === 1 ? '' : 's'}`}
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        placeholder="Review summary (optional)…"
        rows={2}
        className="field-sizing-content mb-2 w-full resize-none rounded-md border border-[var(--color-border-opaque)] bg-transparent px-2 py-1.5 text-[13px] placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-2">
        <select
          value={event}
          onChange={(e) => setEvent(e.currentTarget.value as ReviewEvent)}
          disabled={submitting}
          aria-label="Review action"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border-opaque)] bg-transparent px-2 py-1.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="bg-blue-500 hover:bg-blue-600"
        >
          {submitting ? 'Submitting…' : 'Submit review'}
        </Button>
      </div>
      {error != null && (
        <p role="alert" className="mt-2 text-[13px] text-[#be123c] dark:text-[#fb7185]">
          {error}
        </p>
      )}
    </div>
  );
}
