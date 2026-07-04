'use client';

import { lazy, Suspense } from 'react';

import { cn } from '@/lib/cn';

// Lazy boundary for the markdown renderer: react-markdown + remark-gfm are only
// fetched once a comment body actually renders, keeping them off the diff
// viewer's critical path. Until the chunk loads (and during SSR) we show the
// raw text with preserved whitespace, which then swaps to rendered markdown.
const CommentMarkdownImpl = lazy(() => import('./CommentMarkdownImpl'));

export function CommentMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className={cn('break-words whitespace-pre-wrap', className)}>
          {text}
        </div>
      }
    >
      <CommentMarkdownImpl text={text} className={className} />
    </Suspense>
  );
}
