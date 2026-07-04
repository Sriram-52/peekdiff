// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: show the real GitHub avatar + reply count for comments
// loaded from a GitHub PR review thread, expand replies, tag not-yet-posted
// (pending) comments, and offer an inline reply box on real threads.
'use client';

import type { AnnotationSide } from '@pierre/diffs';
import { IconConvoFill, IconPlus } from '@pierre/icons';
import { memo, type MouseEvent, useState } from 'react';

import { CommentAuthorAvatar } from './CommentAuthorAvatar';
import { CommentMarkdown } from './CommentMarkdown';
import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';
import type {
  CommentLineType,
  DiffsHubSavedCommentEntry,
  DiffsHubSavedCommentItem,
} from '@/lib/types';

interface DiffsHubCommentsListProps {
  commentSections: readonly DiffsHubSavedCommentItem[];
  onSelectComment?(comment: DiffsHubSavedCommentEntry): void;
  onSelectItem?(itemId: string): void;
  // Posts a reply to an existing GitHub review thread (root comment id). When
  // absent (unauthenticated / demo) no reply affordance is shown.
  onReply?(rootCommentId: number, body: string): void;
  replyPending?: boolean;
}

function getCommentLineLabel(
  side: AnnotationSide,
  lineNumber: number,
  lineType: CommentLineType
): string {
  if (lineType === 'context') {
    return `Line ${lineNumber}`;
  }
  const sigil = side === 'additions' ? '+' : '-';
  return `Line ${sigil}${lineNumber}`;
}

function getCommentLineClassName(
  side: AnnotationSide,
  lineType: CommentLineType
): string {
  if (lineType === 'context') {
    return 'text-muted-foreground';
  }
  // The themed chrome sets --diffshub-comment-add-fg / -del-fg with a shade
  // chosen from the active Shiki surface's luminance, so addition/deletion
  // labels stay legible even on mixed-palette themes (e.g. slack-ochin's
  // "light" classification with a dark navy sidebar, where the global
  // `dark:` variant would otherwise leave us with low-contrast 700 shades
  // on a dark card). The Tailwind shades stay as fallbacks for the
  // first-render window before the chrome style applies.
  return side === 'additions'
    ? 'text-[var(--diffshub-comment-add-fg,#047857)] dark:text-[var(--diffshub-comment-add-fg,#34d399)]'
    : 'text-[var(--diffshub-comment-del-fg,#be123c)] dark:text-[var(--diffshub-comment-del-fg,#fb7185)]';
}

// Wraps a click handler so users can drag-select text inside the row without
// also triggering navigation. mouseup after a selection fires click on the
// button; bail out only when the resulting selection is anchored inside this
// row, so a pre-existing selection elsewhere on the page (e.g. in the diff
// viewer) does not block keyboard/mouse activation of the row.
function handleRowClick(
  event: MouseEvent<HTMLButtonElement>,
  run: () => void
): void {
  if (event.button !== 0) {
    return;
  }
  const selection =
    typeof window !== 'undefined' ? window.getSelection() : null;
  if (selection != null && selection.toString().length > 0) {
    const row = event.currentTarget;
    const anchorInRow =
      selection.anchorNode != null && row.contains(selection.anchorNode);
    const focusInRow =
      selection.focusNode != null && row.contains(selection.focusNode);
    if (anchorInRow || focusInRow) {
      event.preventDefault();
      return;
    }
  }
  run();
}

export const DiffsHubCommentsList = memo(function DiffsHubCommentsList({
  commentSections,
  onSelectComment,
  onSelectItem,
  onReply,
  replyPending = false,
}: DiffsHubCommentsListProps) {
  if (commentSections.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full min-h-0 flex-col items-center justify-center gap-2 px-7 text-center text-sm">
        <IconConvoFill size={24} className="mb-2" />
        <div className="flex flex-col">
          <strong className="font-medium">No comments yet</strong>
          <p>
            Hover over a line and click the{' '}
            <span className="light:text-white light:bg-[rgb(0,159,255)] inline-flex h-[20px] w-[20px] items-center justify-center rounded-[4px] align-top dark:bg-[rgb(0,159,255)] dark:text-black">
              <IconPlus />
            </span>{' '}
            button to add fake code comments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'cv-mini-scrollbar',
        'h-full min-h-0 overflow-auto overscroll-contain pl-3 pb-3 pr-[max(0px,calc(12px-var(--cv-mini-gutter-vertical)))]'
      )}
    >
      {commentSections.map((section) => (
        <section key={section.itemId}>
          {onSelectItem != null ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring block w-full cursor-pointer p-3 pb-2 text-left text-sm font-medium break-all outline-none focus-visible:ring-2"
              onClick={(event) =>
                handleRowClick(event, () => onSelectItem(section.itemId))
              }
            >
              <span className="select-text">{section.path}</span>
            </button>
          ) : (
            <div className="text-muted-foreground p-3 pb-2 text-sm font-medium break-all">
              {section.path}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-[var(--diffshub-card-border,rgb(0_0_0_/_0.1))] dark:border-[var(--diffshub-card-border,rgb(255_255_255_/_0.15))]">
            {section.comments.map((comment) => {
              const isPending = comment.githubCommentId == null;
              return (
                <div
                  key={comment.key}
                  className="border-b border-[var(--diffshub-card-border,rgb(0_0_0_/_0.1))] bg-[var(--diffshub-card-bg,var(--color-card))] last:border-b-0 dark:border-[var(--diffshub-card-border,rgb(255_255_255_/_0.15))]"
                >
                  <button
                    type="button"
                    // Colors come from the themed chrome (set on the sidebar
                    // wrapper) so cards stay on-palette for mixed light/dark
                    // themes; hardcoded fallbacks cover first render. No
                    // transition-colors: the CSS-variable chrome flips instantly
                    // on theme swap and a per-card transition would visibly trail.
                    className="focus-visible:ring-ring flex w-full cursor-pointer items-start gap-2 p-3 text-left text-sm outline-none hover:bg-[var(--diffshub-card-hover-bg,var(--color-muted))] focus-visible:ring-2"
                    onClick={(event) =>
                      handleRowClick(event, () => onSelectComment?.(comment))
                    }
                  >
                    <CommentAuthorAvatar
                      seed={comment.author}
                      avatarUrl={comment.authorAvatarUrl}
                      className="size-5"
                    />
                    <div className="flex flex-col items-start gap-0.5 select-text">
                      <div className="text-muted-foreground flex flex-wrap items-center gap-1">
                        {comment.author} commented on{' '}
                        <span
                          className={cn(
                            getCommentLineClassName(
                              comment.side,
                              comment.lineType
                            ),
                            'font-medium'
                          )}
                        >
                          {getCommentLineLabel(
                            comment.side,
                            comment.lineNumber,
                            comment.lineType
                          )}
                        </span>
                        {isPending && (
                          <span className="rounded-full bg-[color-mix(in_srgb,currentColor_18%,transparent)] px-1.5 text-[10px] leading-4 font-medium uppercase">
                            Pending
                          </span>
                        )}
                      </div>
                      <CommentMarkdown
                        text={comment.message}
                        className="text-foreground w-full"
                      />
                    </div>
                  </button>
                  {comment.githubReplies != null &&
                    comment.githubReplies.length > 0 && (
                      <div className="border-t border-[var(--diffshub-card-border,rgb(0_0_0_/_0.1))] dark:border-[var(--diffshub-card-border,rgb(255_255_255_/_0.15))]">
                        {comment.githubReplies.map((reply, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 px-3 py-2 pl-6 text-sm"
                          >
                            <CommentAuthorAvatar
                              seed={reply.login}
                              avatarUrl={reply.avatarUrl}
                              className="size-4"
                            />
                            <div className="flex flex-col items-start gap-0.5 select-text">
                              <span className="text-muted-foreground">
                                {reply.login}
                              </span>
                              <CommentMarkdown
                                text={reply.body}
                                className="text-foreground w-full"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  {onReply != null && comment.githubCommentId != null && (
                    <ReplyBox
                      rootCommentId={comment.githubCommentId}
                      pending={replyPending}
                      onReply={onReply}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
});

// Inline "Reply" affordance for a real GitHub review thread: a toggle that
// reveals a textarea and posts a reply to the thread's root comment.
function ReplyBox({
  rootCommentId,
  pending,
  onReply,
}: {
  rootCommentId: number;
  pending: boolean;
  onReply(rootCommentId: number, body: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const trimmed = text.trim();

  if (!open) {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs font-medium"
          onClick={() => setOpen(true)}
        >
          Reply
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        placeholder="Reply…"
        rows={2}
        autoFocus
        className="field-sizing-content w-full resize-none rounded-md border border-[var(--color-border-opaque)] bg-transparent px-2 py-1.5 text-[13px] placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="muted"
          onClick={() => {
            setOpen(false);
            setText('');
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending || trimmed.length === 0}
          onClick={() => {
            onReply(rootCommentId, trimmed);
            setOpen(false);
            setText('');
          }}
          className="bg-blue-500 hover:bg-blue-600"
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
