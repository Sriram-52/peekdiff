'use client';

import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/cn';

// Actual markdown renderer, loaded lazily by CommentMarkdown so react-markdown
// (~heavy) stays off the initial diff-render critical path. Renders GitHub
// comment bodies as GitHub-flavored markdown INCLUDING the sanitized inline
// HTML that GitHub authors emit (e.g. bot comments use <details>/<summary>,
// <img>, <a>). SECURITY: rehype-raw parses the embedded HTML, then
// rehype-sanitize strips anything dangerous — script/style/iframe, all on*
// event handlers, and javascript: URLs are removed by the (GitHub-derived)
// default schema, which we only widen to permit <details>/<summary>. Styling is
// scoped via `.cmt-md` in globals.css.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    // Allow the toggle state on <details>; img/a already have safe,
    // protocol-restricted attributes in the default schema.
    details: [...(defaultSchema.attributes?.details ?? []), 'open'],
  },
};

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
        // Order matters: raw first (parse embedded HTML), then sanitize.
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
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
