// Client-side GitHub PR review comments (read + write).
//
// Loads AND posts inline review comments for a pull request DIRECTLY from/to
// api.github.com with the user's token (CORS is open, Authorization allowed),
// so private source/discussion never passes through the peekdiff server.
// Posting requires the GitHub App's `Pull requests: Write` permission on the
// installation.

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

export function annotationSideToGithub(side: AnnotationSide): 'LEFT' | 'RIGHT' {
  return side === 'deletions' ? 'LEFT' : 'RIGHT';
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

// Turns a failed GitHub write response into a readable, actionable message.
async function readError(response: Response, fallback: string): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as {
      message?: string;
      errors?: { message?: string; field?: string }[];
    };
    detail =
      body.errors?.map((e) => e.message ?? e.field).filter(Boolean).join('; ') ||
      body.message ||
      '';
  } catch {
    // non-JSON body; ignore
  }
  if (response.status === 403) {
    return 'GitHub denied write access. Reconnect GitHub so the token picks up the Pull requests: Write permission (Connect GitHub again).';
  }
  if (response.status === 401) {
    return 'GitHub token expired or invalid. Reconnect GitHub.';
  }
  if (response.status === 422) {
    return `GitHub rejected the review${detail ? `: ${detail}` : ' (a comment may target a line not present in the diff).'}`;
  }
  return `${fallback}${detail ? `: ${detail}` : ` (${response.status}).`}`;
}

// The head commit SHA is required as `commit_id` when creating review comments.
export async function getPullHeadSha({
  owner,
  repo,
  pull,
  token,
  signal,
}: PullRef & { token: string; signal?: AbortSignal }): Promise<string> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/${pull}`,
    { headers: githubHeaders(token), cache: 'no-store', signal }
  );
  if (!response.ok) {
    throw new ReviewsError(
      await readError(response, 'Failed to load the pull request'),
      response.status
    );
  }
  const data = (await response.json()) as { head?: { sha?: string } };
  const sha = data.head?.sha;
  if (!sha) {
    throw new ReviewsError('Pull request has no head commit SHA.', 500);
  }
  return sha;
}

export interface AuthedUser {
  login: string;
  avatarUrl: string;
}

// The authenticated GitHub user, shown as the author of new (pending) comments.
export async function getAuthedUser({
  token,
  signal,
}: {
  token: string;
  signal?: AbortSignal;
}): Promise<AuthedUser> {
  const response = await fetch(`${GITHUB_API_ORIGIN}/user`, {
    headers: githubHeaders(token),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new ReviewsError(
      await readError(response, 'Failed to load the GitHub user'),
      response.status
    );
  }
  const data = (await response.json()) as {
    login: string;
    avatar_url: string;
  };
  return { login: data.login, avatarUrl: data.avatar_url };
}

export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

export interface ReviewCommentInput {
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
}

// Creates a single batched review: all pending inline comments plus an optional
// summary body, submitted together with an APPROVE / REQUEST_CHANGES / COMMENT
// event. This is the GitHub-native "submit review" action.
export async function createReview({
  owner,
  repo,
  pull,
  token,
  commitId,
  event,
  body,
  comments,
  signal,
}: PullRef & {
  token: string;
  commitId: string;
  event: ReviewEvent;
  body?: string;
  comments: ReviewCommentInput[];
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/${pull}/reviews`,
    {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_id: commitId,
        event,
        ...(body ? { body } : {}),
        comments: comments.map((c) => ({
          path: c.path,
          line: c.line,
          side: c.side,
          body: c.body,
        })),
      }),
      cache: 'no-store',
      signal,
    }
  );
  if (!response.ok) {
    throw new ReviewsError(
      await readError(response, 'Failed to submit the review'),
      response.status
    );
  }
}

// Posts a reply to an existing review thread (identified by its root comment
// id). Replies are sent immediately, not batched into a review.
export async function replyToThread({
  owner,
  repo,
  pull,
  token,
  rootCommentId,
  body,
  signal,
}: PullRef & {
  token: string;
  rootCommentId: number;
  body: string;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/${pull}/comments/${rootCommentId}/replies`,
    {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
      cache: 'no-store',
      signal,
    }
  );
  if (!response.ok) {
    throw new ReviewsError(
      await readError(response, 'Failed to post the reply'),
      response.status
    );
  }
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
