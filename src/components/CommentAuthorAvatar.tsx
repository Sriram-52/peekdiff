// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: render the real GitHub avatar URL when a comment comes from
// a GitHub PR review; fall back to the local persona avatar otherwise.
import { getCommentPersona } from '@/lib/annotation';
import { cn } from '@/lib/cn';

interface CommentAuthorAvatarProps {
  // A stable seed (e.g. comment key or a fixed name) used to pick the avatar.
  seed: string;
  // When set (GitHub-origin comments), the real avatar image is used instead
  // of a local persona avatar.
  avatarUrl?: string;
  className?: string;
}

// Renders a circular avatar image for a comment author.
// Defaults to 32px (size-8); pass className to override for other sizes.
export function CommentAuthorAvatar({
  seed,
  avatarUrl,
  className,
}: CommentAuthorAvatarProps) {
  const persona = getCommentPersona(seed);
  const src = avatarUrl ?? persona.avatarSrc;
  const alt = avatarUrl != null ? seed : persona.name;
  return (
    <div className="relative shrink-0 self-start after:absolute after:inset-0 after:z-10 after:block after:rounded-full after:border after:border-[rgb(0_0_0_/_0.1)] after:content-[''] dark:after:border-[rgb(255_255_255_/_0.1)]">
      <img
        src={src}
        alt={alt}
        className={cn('block size-8 object-cover rounded-full', className)}
      />
    </div>
  );
}
