// Per-PR "viewed file" tracking, persisted in localStorage.
//
// A reviewer can mark each file as viewed to track progress through a PR
// (GitHub's "Viewed" checkbox). State is keyed by the pull request so it
// survives reloads and is scoped to that PR. This is the optimistic/offline
// layer; when authed on a PR it is reconciled with GitHub's own viewed state
// via src/lib/github/viewedSync.ts (GitHub is the source of truth).
import { parsePullRef } from '@/lib/github/reviews';

function storageKey(path: string): string | null {
  const ref = parsePullRef(path);
  if (ref == null) {
    return null;
  }
  return `peekdiff:viewed:${ref.owner}/${ref.repo}/pull/${ref.pull}`;
}

export function loadViewedFiles(path: string): Set<string> {
  const key = storageKey(path);
  if (key == null || typeof window === 'undefined') {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveViewedFiles(path: string, viewed: ReadonlySet<string>): void {
  const key = storageKey(path);
  if (key == null || typeof window === 'undefined') {
    return;
  }
  try {
    if (viewed.size === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify([...viewed]));
    }
  } catch {
    // Ignore storage failures (quota / disabled); viewed state is best-effort.
  }
}
