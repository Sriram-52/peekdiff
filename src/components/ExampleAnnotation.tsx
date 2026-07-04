// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: render comment/reply bodies as markdown; make threads
// collapsible (chevron -> one-line summary); drop the delete/X on threads
// loaded from a GitHub PR review (key `gh-*`, keep it only for local `draft-*`);
// restyle the card (compact, left accent stripe, nested replies); and add
// edit/delete of the CURRENT USER's own posted comments (root + replies).
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
  // Login of the connected GitHub user; a comment is editable/deletable only
  // when its author matches. Null/undefined = not connected → no edit/delete.
  currentUserLogin?: string | null;
  // Edit / delete a posted GitHub review comment by its numeric id. Absent when
  // not on an authed PR. Awaited; the parent reloads threads on success.
  onEditGithubComment?(commentId: number, body: string): Promise<void>;
  onDeleteGithubComment?(commentId: number): Promise<void>;
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
  currentUserLogin,
  onEditGithubComment,
  onDeleteGithubComment,
}: ExampleAnnotationProps) {
  const { author, authorAvatarUrl, githubCommentId, key, message, range } =
    annotation.metadata;
  const replies = annotation.metadata.githubReplies ?? [];
  // Threads loaded from a GitHub PR review use a `gh-` key; locally-drafted
  // (not yet submitted) comments use `draft-`. Only the latter may be removed
  // locally; loaded ones support GitHub edit/delete when you authored them.
  const isLoaded = key.startsWith('gh-');
  const [collapsed, setCollapsed] = useState(false);
  // Which comment id is being edited / delete-confirmed, plus in-flight + error.
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(
    null
  );
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selection = { id: itemId, range };
  const firstLine = message.split('\n', 1)[0] ?? '';

  const canManage = (login: string): boolean =>
    isLoaded &&
    currentUserLogin != null &&
    login === currentUserLogin &&
    onEditGithubComment != null &&
    onDeleteGithubComment != null;

  const runEdit = async (id: number, text: string) => {
    if (onEditGithubComment == null) return;
    setBusy(true);
    setError(null);
    try {
      await onEditGithubComment(id, text);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed');
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async (id: number) => {
    if (onDeleteGithubComment == null) return;
    setBusy(true);
    setError(null);
    try {
      await onDeleteGithubComment(id);
      setConfirmingDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  // Edit textarea / delete-confirm / edit+delete buttons for one comment.
  const renderManage = (id: number, body: string, login: string) => {
    if (!canManage(login)) return null;
    if (editing?.id === id) {
      return (
        <div className="mt-1.5 flex flex-col gap-1.5" onClick={stop}>
          <textarea
            value={editing.text}
            disabled={busy}
            onChange={(e) => setEditing({ id, text: e.target.value })}
            className="border-input bg-background min-h-[60px] w-full resize-y rounded-md border p-1.5 text-[13px]"
          />
          <div className="flex items-center gap-2 text-[12px]">
            <Button
              size="sm"
              disabled={busy || editing.text.trim().length === 0}
              onClick={() => runEdit(id, editing.text)}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    if (confirmingDeleteId === id) {
      return (
        <div
          className="mt-1 flex items-center gap-2 text-[12px]"
          onClick={stop}
        >
          <span className="text-muted-foreground">Delete this comment?</span>
          <button
            type="button"
            className="text-[#e5484d] hover:underline disabled:opacity-50 dark:text-[#ff6762]"
            disabled={busy}
            onClick={() => runDelete(id)}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={() => setConfirmingDeleteId(null)}
          >
            Cancel
          </button>
        </div>
      );
    }
    return (
      <div
        className="text-muted-foreground mt-1 flex items-center gap-3 text-[11px]"
        onClick={stop}
      >
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => {
            setEditing({ id, text: body });
            setConfirmingDeleteId(null);
            setError(null);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => {
            setConfirmingDeleteId(id);
            setEditing(null);
            setError(null);
          }}
        >
          Delete
        </button>
      </div>
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        annotationCardBase,
        'group relative flex-col gap-0 border-l-2 border-l-[color-mix(in_srgb,var(--peekdiff-annotation-fg,var(--color-card-foreground))_32%,transparent)] cursor-pointer items-stretch py-2.5 hover:border-[var(--peekdiff-annotation-hover-border,var(--peekdiff-annotation-border,var(--color-border)))]'
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
            {githubCommentId != null && editing?.id === githubCommentId ? (
              renderManage(githubCommentId, message, author)
            ) : (
              <>
                <CommentMarkdown text={message} className="text-[13px]" />
                {githubCommentId != null &&
                  renderManage(githubCommentId, message, author)}
              </>
            )}
          </div>
          {replies.length > 0 && (
            <div className="mt-2.5 ml-[10px] flex flex-col gap-3 border-l border-[var(--peekdiff-annotation-border,var(--color-border))] pl-3">
              {replies.map((reply) => (
                <div key={reply.id} className="flex min-w-0 gap-2">
                  <CommentAuthorAvatar
                    seed={reply.login}
                    avatarUrl={reply.avatarUrl}
                    className="size-[18px] shrink-0 text-[10px]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong className="block text-[12.5px] leading-tight font-semibold">
                      {reply.login}
                    </strong>
                    {editing?.id === reply.id ? (
                      renderManage(reply.id, reply.body, reply.login)
                    ) : (
                      <>
                        <CommentMarkdown
                          text={reply.body}
                          className="mt-0.5 text-[12.5px]"
                        />
                        {renderManage(reply.id, reply.body, reply.login)}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {error != null && (
            <p className="mt-1.5 ml-[30px] text-[12px] text-[#e5484d] dark:text-[#ff6762]">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
});

// Stops the card's onClick (line selection) from firing when interacting with
// the edit/delete controls.
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}
