// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: render comment/reply bodies as markdown; make threads
// collapsible (chevron -> one-line summary); and, for threads loaded from a
// GitHub PR review (key `gh-*`), drop the delete/X (you can't delete other
// people's comments) — the remove affordance stays only for local drafts
// (key `draft-*`).
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
        'group relative cursor-pointer items-start hover:border-[var(--diffshub-annotation-hover-border,var(--diffshub-annotation-border,var(--color-border)))]'
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
      <CommentAuthorAvatar seed={author} avatarUrl={authorAvatarUrl} />
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
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
            aria-expanded={!collapsed}
            className="text-muted-foreground hover:text-foreground -ml-0.5 flex cursor-pointer items-center rounded p-0.5"
            onClick={(event) => {
              event.stopPropagation();
              setCollapsed((value) => !value);
            }}
          >
            <Chevron open={!collapsed} />
          </button>
          <strong className="text-[14px]">{author}</strong>
          {collapsed && replies.length > 0 && (
            <span className="text-muted-foreground text-[12px]">
              · {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>

        {collapsed ? (
          <p className="text-muted-foreground m-0 ml-[18px] truncate text-[13px]">
            {firstLine}
          </p>
        ) : (
          <>
            <CommentMarkdown text={message} className="text-[14px]" />
            {replies.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 border-t border-[var(--diffshub-annotation-border,var(--color-border))] pt-2">
                {replies.map((reply, index) => (
                  <div key={index} className="flex gap-2">
                    <CommentAuthorAvatar
                      seed={reply.login}
                      avatarUrl={reply.avatarUrl}
                      className="size-5 text-[10px]"
                    />
                    <div className="flex min-w-0 flex-col">
                      <strong className="block text-[13px]">
                        {reply.login}
                      </strong>
                      <CommentMarkdown text={reply.body} className="text-[13px]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
