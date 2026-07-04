'use client';

import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/cn';

// Actual markdown renderer, loaded lazily by CommentMarkdown so react-markdown
// (~heavy) stays off the initial diff-render critical path. Renders GitHub
// comment bodies as GitHub-flavored markdown. SECURITY: no rehype-raw — raw
// HTML in untrusted GitHub comment bodies is NOT rendered; only markdown
// syntax is interpreted. Styling is scoped via the `.cmt-md` class in
// globals.css so we don't override react-markdown's element components (which
// shift API across versions).
export default function CommentMarkdownImpl({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn('cmt-md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({
            node,
            ...props
          }: ComponentPropsWithoutRef<'a'> & { node?: unknown }) => {
            void node; // exclude the AST node from DOM props
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
