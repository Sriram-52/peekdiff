import type { CodeViewLineSelection, DiffLineAnnotation } from '@pierre/diffs';
import { IconX } from '@pierre/icons';
import { memo } from 'react';

import { CommentAuthorAvatar } from './CommentAuthorAvatar';
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

export const ExampleAnnotation = memo(function ExampleAnnotation({
  annotation,
  itemId,
  onDelete,
  onToggleSelection,
}: ExampleAnnotationProps) {
  const selection = { id: itemId, range: annotation.metadata.range };
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        annotationCardBase,
        'group relative cursor-pointer hover:border-[var(--diffshub-annotation-hover-border,var(--diffshub-annotation-border,var(--color-border)))]'
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
      <CommentAuthorAvatar
        seed={annotation.metadata.author}
        avatarUrl={annotation.metadata.authorAvatarUrl}
      />
      <Button
        variant="default"
        size="icon-sm"
        aria-label="Delete comment"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(itemId, annotation.metadata.key);
        }}
        className="pointer-events-none absolute top-0 right-0 z-1 inline-flex translate-x-[35%] -translate-y-[35%] cursor-pointer items-center justify-center rounded-full bg-neutral-500 opacity-0 shadow-[inherit] transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100"
      >
        <IconX size={12} />
      </Button>
      <div className="flex min-w-0 flex-col">
        <strong className="mt-1 block text-[14px]">
          {annotation.metadata.author}
        </strong>
        <p className="m-0 text-[14px] whitespace-pre-wrap">
          {annotation.metadata.message}
        </p>
        {annotation.metadata.githubReplies != null &&
          annotation.metadata.githubReplies.length > 0 && (
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--diffshub-annotation-border,var(--color-border))] pt-2">
              {annotation.metadata.githubReplies.map((reply, index) => (
                <div key={index} className="flex gap-2">
                  <CommentAuthorAvatar
                    seed={reply.login}
                    avatarUrl={reply.avatarUrl}
                    className="size-5 text-[10px]"
                  />
                  <div className="flex min-w-0 flex-col">
                    <strong className="block text-[13px]">{reply.login}</strong>
                    <p className="m-0 text-[13px] whitespace-pre-wrap">
                      {reply.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
});
