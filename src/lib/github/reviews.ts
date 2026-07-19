// Client-side GitHub PR review comments (read + write).
//
// Loads AND posts inline review comments for a pull request DIRECTLY from/to
// api.github.com with the user's token (CORS is open, Authorization allowed),
// so private source/discussion never passes through the peekdiff server.
// Posting requires the GitHub App's `Pull requests: Write` permission on the
// installation.

import type { AnnotationSide } from '@pierre/diffs';

import type {
  PeekdiffCommentFileByItemId,
  PeekdiffSavedCommentEntry,
  PeekdiffSavedCommentItem,
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
export interface PullMeta {
  headSha: string;
  title: string;
  number: number;
}

// Fetches PR metadata (head SHA for review posting, plus title/number for the
// page title). `token` is optional so public PRs can resolve a title without a
// signed-in session; private PRs require it.
export async function getPull({
  owner,
  repo,
  pull,
  token,
  signal,
}: PullRef & { token?: string; signal?: AbortSignal }): Promise<PullMeta> {
  const headers: HeadersInit = token
    ? githubHeaders(token)
    : {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      };
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/${pull}`,
    { headers, cache: 'no-store', signal }
  );
  if (!response.ok) {
    throw new ReviewsError(
      await readError(response, 'Failed to load the pull request'),
      response.status
    );
  }
  const data = (await response.json()) as {
    head?: { sha?: string };
    title?: string;
    number?: number;
  };
  return {
    headSha: data.head?.sha ?? '',
    title: data.title ?? '',
    number: data.number ?? Number(pull),
  };
}

export async function getPullHeadSha(
  args: PullRef & { token: string; signal?: AbortSignal }
): Promise<string> {
  const { headSha } = await getPull(args);
  if (!headSha) {
    throw new ReviewsError('Pull request has no head commit SHA.', 500);
  }
  return headSha;
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

// Edits an existing review comment (root or reply). GitHub only lets the
// comment's author edit it; a 403 surfaces that. Note the endpoint is
// repo-level (no pull number) and keyed by the numeric comment id.
export async function editReviewComment({
  owner,
  repo,
  commentId,
  body,
  token,
  signal,
}: {
  owner: string;
  repo: string;
  commentId: number;
  body: string;
  token: string;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
      cache: 'no-store',
      signal,
    }
  );
  if (!response.ok) {
    throw new ReviewsError(
      await readError(
        response,
        response.status === 403
          ? 'You can only edit your own comments'
          : 'Failed to edit the comment'
      ),
      response.status
    );
  }
}

// Deletes a review comment (root or reply) the current user authored.
export async function deleteReviewComment({
  owner,
  repo,
  commentId,
  token,
  signal,
}: {
  owner: string;
  repo: string;
  commentId: number;
  token: string;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    {
      method: 'DELETE',
      headers: githubHeaders(token),
      cache: 'no-store',
      signal,
    }
  );
  // 204 = deleted. 404 can mean already gone — treat as success.
  if (!response.ok && response.status !== 404) {
    throw new ReviewsError(
      await readError(
        response,
        response.status === 403
          ? 'You can only delete your own comments'
          : 'Failed to delete the comment'
      ),
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
  // True when the root's current diff line is gone (a push changed those lines)
  // and we anchored on `original_line` instead — GitHub's "outdated" state.
  outdated: boolean;
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
//
// When a push changes the lines a comment was anchored to, GitHub reports the
// root's `line` as null but keeps `original_line` — the thread is "outdated",
// not gone. We keep those threads (anchored on original_line, flagged outdated)
// so they still show in the sidebar and can be replied to. Only roots with no
// line at all (file-level comments) are skipped and counted.
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
    const outdated = root.line == null;
    const anchorLine = root.line ?? root.original_line ?? null;
    if (anchorLine == null) {
      // No current line and no original line: a file-level comment we can't
      // anchor anywhere in the diff.
      skippedNoLine++;
      continue;
    }
    const replies = (repliesByRoot.get(root.id) ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    threads.push({
      rootId: root.id,
      path: root.path,
      line: anchorLine,
      side: root.side ?? 'RIGHT',
      comments: [root, ...replies].map(toThreadComment),
      outdated,
    });
  }

  if (skippedNoLine > 0) {
    console.warn(
      `peekdiff: skipped ${skippedNoLine} file-level review thread(s) with no diff line to anchor to.`
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
  commentFileByItemId: PeekdiffCommentFileByItemId | null
): { sections: PeekdiffSavedCommentItem[]; skippedNotInDiff: number } {
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

  const byItemId = new Map<string, PeekdiffSavedCommentItem>();
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
        id: reply.id,
        login: reply.login,
        avatarUrl: reply.avatarUrl,
        body: reply.body,
      }));

    const entry: PeekdiffSavedCommentEntry = {
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
      outdated: thread.outdated || undefined,
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
