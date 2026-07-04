// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: attribute the draft to the real GitHub user when connected
// (defaultAuthor/defaultAvatarUrl), falling back to a local persona otherwise.
import type { DiffLineAnnotation } from '@pierre/diffs';
import { IconArrowRight } from '@pierre/icons';
import { useEffect, useRef, useState } from 'react';

import { CommentAuthorAvatar } from './CommentAuthorAvatar';
import { Button } from '@/components/Button';
import { annotationCardBase, getRandomPersona } from '@/lib/annotation';
import { cn } from '@/lib/cn';
import type { DraftCommentMetadata } from '@/lib/types';

interface DraftAnnotationProps {
  annotation: DiffLineAnnotation<DraftCommentMetadata>;
  itemId: string;
  // The real GitHub login/avatar to attribute the comment to; when absent a
  // random local persona is used (unauthenticated / demo).
  defaultAuthor?: string;
  defaultAvatarUrl?: string;
  onCancel(itemId: string, key: string): void;
  onSave(itemId: string, key: string, message: string, author: string): void;
}

export function DraftAnnotation({
  annotation,
  itemId,
  defaultAuthor,
  defaultAvatarUrl,
  onCancel,
  onSave,
}: DraftAnnotationProps) {
  const [message, setMessage] = useState(annotation.metadata.message);
  const [persona] = useState(getRandomPersona);
  const author = defaultAuthor ?? persona.name;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedMessage = message.trim();

  function handleSave() {
    if (trimmedMessage.length === 0) {
      return;
    }
    onSave(itemId, annotation.metadata.key, trimmedMessage, author);
  }

  function tryCancel() {
    if (trimmedMessage.length > 0 && !window.confirm('Discard this comment?')) {
      return;
    }
    onCancel(itemId, annotation.metadata.key);
  }

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea == null) {
      return;
    }

    textarea.focus({ preventScroll: true });
    const cursorIndex = textarea.value.length;
    textarea.setSelectionRange(cursorIndex, cursorIndex);
  }, []);

  return (
    <form
      className={cn(annotationCardBase, 'flex-col md:flex-row')}
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <div className="flex w-full gap-2.5">
        <CommentAuthorAvatar seed={author} avatarUrl={defaultAvatarUrl} />
        <textarea
          ref={textareaRef}
          value={message}
          onChange={({ currentTarget }) => setMessage(currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              tryCancel();
              return;
            }

            if ((!event.shiftKey && !event.metaKey) || event.key !== 'Enter') {
              return;
            }

            event.preventDefault();
            handleSave();
          }}
          placeholder="Add a comment…"
          rows={2}
          className="field-sizing-content w-full resize-none rounded-sm bg-transparent py-1.5 text-[14px] text-inherit placeholder:text-[var(--peekdiff-popover-muted-fg,var(--color-muted-foreground))] focus:outline-none"
        />
      </div>
      <div className="flex w-full justify-between gap-3 pl-10.5 md:w-auto md:justify-end md:pl-0">
        <Button
          type="button"
          variant="muted"
          onClick={tryCancel}
          className="text-muted-foreground hover:text-foreground gap-1 font-normal hover:no-underline md:hidden"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="muted"
          onClick={tryCancel}
          className="text-muted-foreground hover:text-foreground hidden font-normal hover:no-underline md:flex"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="default"
          size="icon-md"
          disabled={trimmedMessage.length === 0}
          className="hidden rounded-full bg-blue-500 hover:bg-blue-600 md:flex"
        >
          <IconArrowRight className="size-4 rotate-[-90deg]" />
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={trimmedMessage.length === 0}
          className="gap-1.5 bg-blue-500 hover:bg-blue-600 md:hidden"
        >
          Submit
          <IconArrowRight className="-mr-0.5 size-3" />
        </Button>
      </div>
    </form>
  );
}
