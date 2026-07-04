// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: render comment/reply bodies as markdown; make threads
// collapsible (chevron -> one-line summary); drop the delete/X on threads
// loaded from a GitHub PR review (key `gh-*`, keep it only for local `draft-*`);
// and restyle the card — compact density, a left accent stripe tying the thread
// to its line, and replies nested under a left rule.
'use client';

import type { CodeViewLineSelection, DiffLineAnnotation } from '@pierre/diffs';
import { IconX } from '@pierre/icons';
import { memo, useState } from 'react';

import { CommentAuthorAvatar } from './CommentAuthorAvatar';
import { CommentMarkdown } from './CommentMarkdown';
import { Button } from '@/components/Button';
import { annotationCardBase } from '@/lib/annotation';
import { cn } from '@/lib/cn';
import type { SavedCommentMetadata } from '@/lib/types';

interface ExampleAnnotationProps {
  annotation: DiffLineAnnotation<SavedCommentMetadata>;
  itemId: string;
  onDelete(itemId: string, key: string): void;
  onToggleSelection(selection: CodeViewLineSelection): void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('shrink-0 transition-transform', open && 'rotate-90')}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const ExampleAnnotation = memo(function ExampleAnnotation({
  annotation,
  itemId,
  onDelete,
  onToggleSelection,
}: ExampleAnnotationProps) {
  const { author, authorAvatarUrl, key, message, range } = annotation.metadata;
  const replies = annotation.metadata.githubReplies ?? [];
  // Threads loaded from a GitHub PR review use a `gh-` key; locally-drafted
  // (not yet submitted) comments use `draft-`. Only the latter may be removed.
  const isLoaded = key.startsWith('gh-');
  const [collapsed, setCollapsed] = useState(false);

  const selection = { id: itemId, range };
  const firstLine = message.split('\n', 1)[0] ?? '';

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        annotationCardBase,
        // Column layout; a 2px left accent stripe (derived from the fg token so
        // it reads on any theme) ties the thread to its code line.
        'group relative flex-col gap-0 border-l-2 border-l-[color-mix(in_srgb,var(--diffshub-annotation-fg,var(--color-card-foreground))_32%,transparent)] cursor-pointer items-stretch py-2.5 hover:border-[var(--diffshub-annotation-hover-border,var(--diffshub-annotation-border,var(--color-border)))]'
      )}
      onClick={() => onToggleSelection(selection)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        onToggleSelection(selection);
      }}
    >
      {!isLoaded && (
        <Button
          variant="default"
          size="icon-sm"
          aria-label="Delete comment"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(itemId, key);
          }}
          className="pointer-events-none absolute top-0 right-0 z-1 inline-flex translate-x-[35%] -translate-y-[35%] cursor-pointer items-center justify-center rounded-full bg-neutral-500 opacity-0 shadow-[inherit] transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <IconX size={12} />
        </Button>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
          aria-expanded={!collapsed}
          className="text-muted-foreground hover:text-foreground -ml-1 flex shrink-0 cursor-pointer items-center rounded p-0.5"
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed((value) => !value);
          }}
        >
          <Chevron open={!collapsed} />
        </button>
        <CommentAuthorAvatar
          seed={author}
          avatarUrl={authorAvatarUrl}
          className="size-[22px] shrink-0"
        />
        <strong className="truncate text-[13px] leading-none font-semibold">
          {author}
        </strong>
        {collapsed && replies.length > 0 && (
          <span className="text-muted-foreground shrink-0 text-[12px]">
            · {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </span>
        )}
      </div>

      {collapsed ? (
        <p className="text-muted-foreground m-0 mt-1 ml-[30px] truncate text-[13px]">
          {firstLine}
        </p>
      ) : (
        <>
          <div className="mt-1.5 ml-[30px]">
            <CommentMarkdown text={message} className="text-[13px]" />
          </div>
          {replies.length > 0 && (
            <div className="mt-2.5 ml-[10px] flex flex-col gap-3 border-l border-[var(--diffshub-annotation-border,var(--color-border))] pl-3">
              {replies.map((reply, index) => (
                <div key={index} className="flex min-w-0 gap-2">
                  <CommentAuthorAvatar
                    seed={reply.login}
                    avatarUrl={reply.avatarUrl}
                    className="size-[18px] shrink-0 text-[10px]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong className="block text-[12.5px] leading-tight font-semibold">
                      {reply.login}
                    </strong>
                    <CommentMarkdown
                      text={reply.body}
                      className="mt-0.5 text-[12.5px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});
