// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: added optional GitHub-origin fields to
// PeekdiffSavedCommentEntry (+ GitHubReplyPreview) so real PR review threads
// loaded from api.github.com can be displayed alongside local draft comments.
import type { AnnotationSide, SelectedLineRange } from '@pierre/diffs';
import type { FileTreeGitStatusPatch, GitStatusEntry } from '@pierre/trees';

export type ViewerLoadState =
  | 'fetching'
  | 'streaming'
  | 'parsing'
  | 'ready'
  | 'error';

export interface SavedCommentMetadata {
  kind: 'saved';
  key: string;
  author: string;
  message: string;
  range: SelectedLineRange;
  // Present when the comment is attributed to a real GitHub user (a just-saved
  // comment by the signed-in user, or a thread loaded from a PR review). Lets
  // the inline card show the real avatar instead of a local persona.
  authorAvatarUrl?: string;
  // Reply previews for a GitHub-loaded review thread, shown beneath the root
  // comment inline.
  githubReplies?: GitHubReplyPreview[];
  // The root comment's GitHub id (only for loaded `gh-*` threads), so the
  // author can edit/delete it inline.
  githubCommentId?: number;
}

export interface DraftCommentMetadata {
  kind: 'draft';
  key: string;
  message: string;
  range: SelectedLineRange;
}

export type CommentMetadata = SavedCommentMetadata | DraftCommentMetadata;

export interface PeekdiffCommentSidebarFile {
  fileOrder: number;
  path: string;
}

export type PeekdiffCommentFileByItemId = ReadonlyMap<
  string,
  PeekdiffCommentSidebarFile
>;

// Whether the line the comment is anchored to is a real addition/deletion or
// an unchanged context line shown in the diff. Tracked so the sidebar can
// render "Line N" without a misleading + / - sigil for context lines.
export type CommentLineType = 'change' | 'context';

export interface PeekdiffSavedCommentEvent {
  author: string;
  itemId: string;
  key: string;
  lineNumber: number;
  lineType: CommentLineType;
  message: string;
  range: SelectedLineRange;
  side: AnnotationSide;
}

export interface PeekdiffDeletedCommentEvent {
  itemId: string;
  key: string;
}

// A preview of a reply within a GitHub review thread (read-only display).
export interface GitHubReplyPreview {
  // GitHub review-comment id, so a reply authored by the current user can be
  // edited/deleted.
  id: number;
  login: string;
  avatarUrl: string;
  body: string;
}

export interface PeekdiffSavedCommentEntry {
  author: string;
  itemId: string;
  key: string;
  lineNumber: number;
  lineType: CommentLineType;
  message: string;
  range: SelectedLineRange;
  side: AnnotationSide;
  // The following are present only for entries loaded from a GitHub PR review
  // (not for locally-drafted comments), and drive real avatars + thread replies
  // in the sidebar.
  githubCommentId?: number;
  authorAvatarUrl?: string;
  githubReplies?: GitHubReplyPreview[];
  // True when the thread's anchor line no longer exists in the current diff
  // (GitHub marks it "outdated" after a push touched those lines). Such entries
  // are shown in the sidebar — where they can still be read and replied to — but
  // NOT rendered inline in the diff, since there's no valid line to anchor to.
  outdated?: boolean;
}

export interface PeekdiffSavedCommentItem {
  comments: PeekdiffSavedCommentEntry[];
  fileOrder: number;
  itemId: string;
  path: string;
}

// The fully pre-computed input this tree needs for a given fetch. It is built
// once at fetch time by snapshotPeekdiffTreeSource and stored alongside the
// viewer items, so later per-item annotation updates do not feed into the
// tree and do not cause it to rebuild.
//
// Streamed publishes link successive snapshots through `previousSource` so the
// tree consumer can recognize append-only growth and apply the delta as
// `model.batch` adds instead of rebuilding the entire path store. The link is
// present only on snapshots that share the same underlying accumulator; the
// initial publish and any non-streamed source leave it undefined and force a
// full reset.
//
// `paths` and `pathToItemId` may alias the live accumulator state for
// streamed sources, so consumers must treat them as read-only and must use
// `pathCount` (captured at snapshot time) as the exclusive upper bound when
// iterating `paths`. The `readonly` markers and ReadonlyMap type enforce the
// read-only side; pathCount is what keeps later in-place growth invisible to
// this snapshot.
export interface PeekdiffFileTreeSource {
  gitStatus: readonly GitStatusEntry[];
  gitStatusPatch?: FileTreeGitStatusPatch;
  pathCount: number;
  paths: readonly string[];
  pathToItemId: ReadonlyMap<string, string>;
  previousSource?: PeekdiffFileTreeSource;
}

export interface PeekdiffDiffStats {
  addedLines: number;
  deletedLines: number;
  fileCount: number;
  totalLinesOfCode: number;
}
