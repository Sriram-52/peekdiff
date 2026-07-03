// Client-side GitHub PR review comments (READ path).
//
// Loads existing inline review comments for a pull request DIRECTLY from
// api.github.com with the user's token (CORS is open, Authorization allowed),
// so private source/discussion never passes through the peekdiff server. This
// module only reads; posting/replying is a later increment that needs the
// GitHub App's `Pull requests: Write` permission.

import type { AnnotationSide } from '@pierre/diffs';

import type {
  DiffsHubCommentFileByItemId,
  DiffsHubSavedCommentEntry,
  DiffsHubSavedCommentItem,
  GitHubReplyPreview,
} from '@/lib/types';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

const PULL_PATTERN = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)$/;

export interface PullRef {
  owner: string;
  repo: string;
  pull: string;
}

// Review comments only exist on pull requests, so commit/compare paths return
// null and the caller simply skips loading comments for them.
export function parsePullRef(path: string): PullRef | null {
  const clean = path.replace(/\.(?:diff|patch)$/, '').replace(/\/+$/, '');
  const match = PULL_PATTERN.exec(clean);
  if (match == null) {
    return null;
  }
  return { owner: match[1]!, repo: match[2]!, pull: match[3]! };
}

export function githubSideToAnnotation(
  side: 'LEFT' | 'RIGHT' | null | undefined
): AnnotationSide {
  // GitHub anchors a comment on the LEFT (base/deleted) or RIGHT (head/added)
  // side of the diff; the viewer models the same as deletions/additions.
  return side === 'LEFT' ? 'deletions' : 'additions';
}

interface RawReviewComment {
  id: number;
  in_reply_to_id?: number | null;
  path: string;
  line: number | null;
  original_line?: number | null;
  side: 'LEFT' | 'RIGHT' | null;
  body: string;
  created_at: string;
  user: { login: string; avatar_url: string } | null;
}

export interface ReviewThreadComment {
  id: number;
  login: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
}

export interface ReviewThread {
  rootId: number;
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  comments: ReviewThreadComment[];
}

export class ReviewsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ReviewsError';
  }
}

// Fetches every inline review comment on the PR, following the Link-header
// pagination until there are no more pages.
export async function listReviewThreads({
  owner,
  repo,
  pull,
  token,
  signal,
}: PullRef & { token: string; signal?: AbortSignal }): Promise<ReviewThread[]> {
  const raw = await fetchAllComments({ owner, repo, pull, token, signal });
  return groupIntoThreads(raw);
}

async function fetchAllComments({
  owner,
  repo,
  pull,
  token,
  signal,
}: PullRef & {
  token: string;
  signal?: AbortSignal;
}): Promise<RawReviewComment[]> {
  const out: RawReviewComment[] = [];
  let url: string | null =
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/${pull}/comments?per_page=100`;

  while (url != null) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      throw new ReviewsError(
        `Failed to load review comments (${response.status}).`,
        response.status
      );
    }
    const page = (await response.json()) as RawReviewComment[];
    out.push(...page);
    url = parseNextLink(response.headers.get('link'));
  }

  return out;
}

function parseNextLink(linkHeader: string | null): string | null {
  if (linkHeader == null) {
    return null;
  }
  for (const part of linkHeader.split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part.trim());
    if (match != null) {
      return match[1]!;
    }
  }
  return null;
}

// Groups a flat comment list into threads: a root is any comment with no
// in_reply_to_id; replies are attached to their root, sorted oldest-first.
// Roots whose anchor line is null (the comment refers to a line no longer in
// the diff, or a file-level comment) are skipped and counted, never silently
// dropped.
function groupIntoThreads(comments: RawReviewComment[]): ReviewThread[] {
  const repliesByRoot = new Map<number, RawReviewComment[]>();
  const roots: RawReviewComment[] = [];

  for (const comment of comments) {
    if (comment.in_reply_to_id != null) {
      const list = repliesByRoot.get(comment.in_reply_to_id) ?? [];
      list.push(comment);
      repliesByRoot.set(comment.in_reply_to_id, list);
    } else {
      roots.push(comment);
    }
  }

  const threads: ReviewThread[] = [];
  let skippedNoLine = 0;

  for (const root of roots) {
    if (root.line == null) {
      skippedNoLine++;
      continue;
    }
    const replies = (repliesByRoot.get(root.id) ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    threads.push({
      rootId: root.id,
      path: root.path,
      line: root.line,
      side: root.side ?? 'RIGHT',
      comments: [root, ...replies].map(toThreadComment),
    });
  }

  if (skippedNoLine > 0) {
    console.warn(
      `peekdiff: skipped ${skippedNoLine} review thread(s) whose line is no longer in the diff (outdated or file-level).`
    );
  }

  return threads;
}

function toThreadComment(raw: RawReviewComment): ReviewThreadComment {
  return {
    id: raw.id,
    login: raw.user?.login ?? 'unknown',
    avatarUrl: raw.user?.avatar_url ?? '',
    body: raw.body,
    createdAt: raw.created_at,
  };
}

// Converts loaded GitHub threads into the sidebar's comment-section shape,
// reverse-mapping each thread's file path to the diff's itemId. Threads whose
// file is not present in the current diff are skipped and counted.
export function reviewThreadsToCommentSections(
  threads: readonly ReviewThread[],
  commentFileByItemId: DiffsHubCommentFileByItemId | null
): { sections: DiffsHubSavedCommentItem[]; skippedNotInDiff: number } {
  if (commentFileByItemId == null) {
    return { sections: [], skippedNotInDiff: threads.length };
  }

  // Invert itemId -> {path,fileOrder} into path -> {itemId,fileOrder}. The
  // first itemId seen for a path wins (a path maps to a single diff item).
  const pathToItem = new Map<string, { itemId: string; fileOrder: number }>();
  for (const [itemId, file] of commentFileByItemId) {
    if (!pathToItem.has(file.path)) {
      pathToItem.set(file.path, { itemId, fileOrder: file.fileOrder });
    }
  }

  const byItemId = new Map<string, DiffsHubSavedCommentItem>();
  let skippedNotInDiff = 0;

  for (const thread of threads) {
    const target = pathToItem.get(thread.path);
    if (target == null) {
      skippedNotInDiff++;
      continue;
    }

    const side = githubSideToAnnotation(thread.side);
    const root = thread.comments[0]!;
    const replies: GitHubReplyPreview[] = thread.comments
      .slice(1)
      .map((reply) => ({
        login: reply.login,
        avatarUrl: reply.avatarUrl,
        body: reply.body,
      }));

    const entry: DiffsHubSavedCommentEntry = {
      author: root.login,
      itemId: target.itemId,
      key: `gh-${thread.rootId}`,
      lineNumber: thread.line,
      // GitHub inline comments anchor to a line present in the diff; we render
      // it as a change line (the +/- sigil is cosmetic here).
      lineType: 'change',
      message: root.body,
      range: { start: thread.line, side, end: thread.line },
      side,
      githubCommentId: thread.rootId,
      authorAvatarUrl: root.avatarUrl || undefined,
      githubReplies: replies.length > 0 ? replies : undefined,
    };

    let section = byItemId.get(target.itemId);
    if (section == null) {
      section = {
        comments: [],
        fileOrder: target.fileOrder,
        itemId: target.itemId,
        path: thread.path,
      };
      byItemId.set(target.itemId, section);
    }
    section.comments.push(entry);
  }

  const sections = [...byItemId.values()].sort(
    (a, b) => a.fileOrder - b.fileOrder
  );
  for (const section of sections) {
    section.comments.sort((a, b) => a.lineNumber - b.lineNumber);
  }

  return { sections, skippedNotInDiff };
}
