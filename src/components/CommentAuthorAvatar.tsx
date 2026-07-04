// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: render the real GitHub avatar URL when a comment comes from
// a GitHub PR review; otherwise fall back to an initials avatar (the upstream
// persona PNGs are demo assets we don't ship, so they 404 and the avatar would
// vanish — an initials circle can never break).
import { cn } from '@/lib/cn';

interface CommentAuthorAvatarProps {
  // A stable seed / author name; its first letter drives the initials fallback.
  seed: string;
  // When set (GitHub-origin comments or the signed-in user), the real avatar
  // image is used instead of the initials fallback.
  avatarUrl?: string;
  className?: string;
}

// A small deterministic hue from the seed so initials avatars are distinguishable.
function seedHue(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

// Renders a circular avatar for a comment author. Defaults to 32px (size-8);
// pass className to override for other sizes.
export function CommentAuthorAvatar({
  seed,
  avatarUrl,
  className,
}: CommentAuthorAvatarProps) {
  // Treat an empty string as "no avatar" (the GitHub API can return '').
  const hasImage = typeof avatarUrl === 'string' && avatarUrl.length > 0;
  const ringClass =
    "relative shrink-0 self-start after:absolute after:inset-0 after:z-10 after:block after:rounded-full after:border after:border-[rgb(0_0_0_/_0.1)] after:content-[''] dark:after:border-[rgb(255_255_255_/_0.1)]";

  if (hasImage) {
    return (
      <div className={ringClass}>
        <img
          src={avatarUrl}
          alt={seed}
          className={cn('block size-8 rounded-full object-cover', className)}
        />
      </div>
    );
  }

  const initial = (seed.trim()[0] ?? '?').toUpperCase();
  const hue = seedHue(seed);
  return (
    <div className={ringClass}>
      <div
        aria-label={seed}
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-[13px] font-semibold text-white select-none',
          className
        )}
        style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
      >
        {initial}
      </div>
    </div>
  );
}
