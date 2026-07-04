// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: added optional `authToken` so private diffs are fetched
// directly from api.github.com in the browser (never through this server), a
// `needsAuth` signal when an unauthenticated load looks blocked by privacy, and
// loading of existing GitHub PR review comments into the sidebar (read path).
'use client';

import {
  areSelectionsEqual,
  type CodeViewItem,
  type CodeViewLineSelection,
  type DiffLineAnnotation,
  processFile,
} from '@pierre/diffs';
import { type CodeViewHandle, useStableCallback } from '@pierre/diffs/react';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { CODE_VIEW_BATCH_COUNT, getInitialBatchSize } from '@/lib/constants';
import {
  AuthedPatchError,
  fetchAuthedPatch,
  githubApiDiffUrl,
} from '@/lib/github/authedPatch';
import {
  listReviewThreads,
  parsePullRef,
  reviewThreadsToCommentSections,
} from '@/lib/github/reviews';
import {
  appendFileDiffToPeekdiffData,
  buildPeekdiffData,
  createPeekdiffDataAccumulator,
  type PeekdiffItemIdRename,
  snapshotPeekdiffTreeSource,
  takePendingPeekdiffItems,
} from '@/lib/peekdiffDataAccumulator';
import { getPatchTreePathPrefix } from '@/lib/gitPatchMetadata';
import {
  type PeekdiffLineHashTarget,
  formatPeekdiffLineHash,
  parsePeekdiffLineHash,
} from '@/lib/lineHash';
import {
  getStreamedPatchMetadata,
  streamGitPatchFiles,
} from '@/lib/streamGitPatchFiles';
import type {
  CommentMetadata,
  PeekdiffCommentFileByItemId,
  PeekdiffDiffStats,
  PeekdiffFileTreeSource,
  PeekdiffSavedCommentItem,
  ViewerLoadState,
} from '@/lib/types';

const STREAM_PUBLISH_INTERVAL_MS = 100;
const STREAM_INITIAL_PUBLISH_INTERVAL_MS = 500;
const STREAM_WORK_BUDGET_MS = 8;
const STREAM_TREE_PUBLISH_FILE_BATCH_SIZE = 1_000;
const STREAM_TREE_PUBLISH_INTERVAL_MS = 1_000;
const GENERIC_PATCH_LOAD_ERROR_MESSAGE =
  'We couldn’t load that diff. Check the URL and try again.';

interface UsePatchLoaderOptions {
  // When set, private (and public) diffs are fetched straight from
  // api.github.com with this GitHub user access token instead of the public
  // `/api/diff` proxy, so private source never reaches the peekdiff server.
  authToken?: string | null;
  collapseMode: 'expanded' | 'collapsed';
  domain?: string;
  onLoadStart(): void;
  path: string;
  viewerRef: RefObject<CodeViewHandle<CommentMetadata> | null>;
}

interface UsePatchLoaderResult {
  applyCollapseModeToLoaded(mode: 'expanded' | 'collapsed'): void;
  commentFileByItemId: PeekdiffCommentFileByItemId | null;
  commentSections: PeekdiffSavedCommentItem[];
  diffStats: PeekdiffDiffStats | null;
  errorMessage: string | null;
  initialItems: CodeViewItem<CommentMetadata>[];
  loadState: ViewerLoadState;
  // True when an unauthenticated load failed in a way consistent with the repo
  // being private, so the UI can prompt the visitor to connect GitHub.
  needsAuth: boolean;
  onLineLinkChange(selection: CodeViewLineSelection | null): void;
  onViewerReady(): void;
  // Re-fetches GitHub review threads for the current PR and replaces the
  // sidebar comments with them (used after submitting a review/reply).
  reloadComments(): Promise<void>;
  retryLoad(): void;
  setCommentSections: Dispatch<SetStateAction<PeekdiffSavedCommentItem[]>>;
  treeSource: PeekdiffFileTreeSource | null;
  viewerKey: number;
}

export function usePatchLoader({
  authToken,
  collapseMode,
  domain,
  onLoadStart,
  path,
  viewerRef,
}: UsePatchLoaderOptions): UsePatchLoaderResult {
  const [initialItems, setInitialItems] = useState<
    CodeViewItem<CommentMetadata>[]
  >([]);
  // Tree data is intentionally stored separately from items so annotation
  // updates do not cascade into the file tree and trigger needless rebuilds.
  // It is updated by fetch/stream batches in this viewer route.
  const [treeSource, setTreeSource] = useState<PeekdiffFileTreeSource | null>(
    null
  );
  const [diffStats, setDiffStats] = useState<PeekdiffDiffStats | null>(null);
  const [commentFileByItemId, setCommentFileByItemId] =
    useState<PeekdiffCommentFileByItemId | null>(null);
  const [commentSections, setCommentSections] = useState<
    PeekdiffSavedCommentItem[]
  >([]);
  const [loadState, setLoadState] = useState<ViewerLoadState>('fetching');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [viewerKey, setViewerKey] = useState(0);
  const requestIdRef = useRef(0);
  const appliedLineHashKeyRef = useRef<string | null>(null);
  const viewerKeyRef = useRef(0);
  // Tracks the ids of every item that has been handed to the viewer so we can
  // walk the full set when the user toggles collapse mode. The viewer handle
  // does not expose an enumeration API, so we maintain our own index.
  const loadedItemIdsRef = useRef<Set<string>>(new Set());
  // Mirrors the latest collapse mode so the streaming code path (which lives
  // inside a long-lived effect/closure) can read the live value without us
  // having to re-bind it on every change.
  const collapseModeRef = useRef(collapseMode);
  collapseModeRef.current = collapseMode;

  // Pre-mutates fresh items so they arrive in the viewer matching the current
  // collapse mode, then records their ids for later bulk updates. Diff items
  // are normalized in both directions because the accumulator initializes
  // deleted-file diffs as collapsed by default — without an unconditional
  // overwrite, those would stay collapsed even when the user is in expanded
  // mode.
  const prepareItemsForViewer = (
    items: readonly CodeViewItem<CommentMetadata>[]
  ): void => {
    const targetCollapsed = collapseModeRef.current === 'collapsed';
    for (const item of items) {
      loadedItemIdsRef.current.add(item.id);
      if (item.type === 'diff') {
        item.collapsed = targetCollapsed;
      }
    }
  };

  const applyCollapseModeToLoaded = useStableCallback(
    (mode: 'expanded' | 'collapsed') => {
      const targetCollapsed = mode === 'collapsed';
      const viewer = viewerRef.current;
      if (viewer == null) {
        // The viewer hasn't mounted yet (e.g. the worker pool is still warming
        // up while the header is already interactive). Rewrite any items
        // already buffered in initialItems so they arrive in the right state
        // once the viewer mounts. New items still streaming in pick up the
        // live collapse mode through prepareItemsForViewer.
        setInitialItems((prev) => {
          let changed = false;
          const next = prev.map((item) => {
            if (
              item.type !== 'diff' ||
              (item.collapsed === true) === targetCollapsed
            ) {
              return item;
            }
            changed = true;
            return { ...item, collapsed: targetCollapsed };
          });
          return changed ? next : prev;
        });
        return;
      }

      for (const itemId of loadedItemIdsRef.current) {
        const item = viewer.getItem(itemId);
        if (item == null || item.type !== 'diff') {
          continue;
        }
        const current = item.collapsed === true;
        if (current === targetCollapsed) {
          continue;
        }
        item.collapsed = targetCollapsed;
        item.version = getNextItemVersion(item);
        viewer.updateItem(item);
      }
    }
  );

  // Renders GitHub-loaded review threads inline in the diff body by attaching
  // saved annotations to each diff item at its line, mirroring how a drafted
  // comment appears inline. Idempotent: replaces the previously-injected
  // GitHub set (keys prefixed "gh-") so a reload after posting doesn't stack
  // duplicates, while leaving locally-drafted annotations untouched.
  const applyLoadedThreadAnnotations = useStableCallback(
    (sections: PeekdiffSavedCommentItem[]) => {
      const byItem = new Map<string, DiffLineAnnotation<CommentMetadata>[]>();
      for (const section of sections) {
        for (const entry of section.comments) {
          const annotation: DiffLineAnnotation<CommentMetadata> = {
            side: entry.side,
            lineNumber: entry.lineNumber,
            metadata: {
              kind: 'saved',
              key: entry.key,
              author: entry.author,
              message: entry.message,
              range: entry.range,
              authorAvatarUrl: entry.authorAvatarUrl,
              githubReplies: entry.githubReplies,
              githubCommentId: entry.githubCommentId,
            },
          };
          const list = byItem.get(entry.itemId) ?? [];
          list.push(annotation);
          byItem.set(entry.itemId, list);
        }
      }

      const mergeAnnotations = (
        existing: readonly DiffLineAnnotation<CommentMetadata>[] | undefined,
        itemId: string
      ): DiffLineAnnotation<CommentMetadata>[] => {
        const kept = (existing ?? []).filter(
          (annotation) => !annotation.metadata.key.startsWith('gh-')
        );
        return [...kept, ...(byItem.get(itemId) ?? [])];
      };

      const viewer = viewerRef.current;
      if (viewer != null) {
        // Union of items with fresh threads and items that may still carry a
        // stale GitHub set from a previous load, so removals also take effect.
        const itemIds = new Set<string>(byItem.keys());
        for (const id of loadedItemIdsRef.current) {
          itemIds.add(id);
        }
        for (const itemId of itemIds) {
          const item = viewer.getItem(itemId);
          if (item == null || item.type !== 'diff') {
            continue;
          }
          const next = mergeAnnotations(item.annotations, itemId);
          const prevLength = item.annotations?.length ?? 0;
          if (next.length === 0 && prevLength === 0) {
            continue;
          }
          item.annotations = next;
          item.version = getNextItemVersion(item);
          viewer.updateItem(item);
        }
        return;
      }

      // Viewer not mounted yet: pre-populate the buffered items so annotations
      // arrive with the first render.
      setInitialItems((prev) =>
        prev.map((item) => {
          if (item.type !== 'diff') {
            return item;
          }
          const next = mergeAnnotations(item.annotations, item.id);
          if (next.length === 0 && (item.annotations?.length ?? 0) === 0) {
            return item;
          }
          return { ...item, annotations: next };
        })
      );
    }
  );

  const tryApplyLineHashTarget = useStableCallback(() => {
    const { hash } = window.location;
    const target = parsePeekdiffLineHash(hash);
    if (target == null) {
      return;
    }

    const applyKey = getLineHashApplyKey(viewerKeyRef.current, hash);
    if (appliedLineHashKeyRef.current === applyKey) {
      return;
    }

    const viewer = viewerRef.current;
    if (viewer == null) {
      return;
    }

    if (applyPeekdiffLineHashTarget(viewer, target)) {
      appliedLineHashKeyRef.current = applyKey;
    }
  });

  const handleLineLinkChange = useStableCallback(
    (selection: CodeViewLineSelection | null) => {
      const nextHash =
        selection == null ? null : formatPeekdiffLineHash(selection);
      appliedLineHashKeyRef.current =
        nextHash == null
          ? null
          : getLineHashApplyKey(viewerKeyRef.current, nextHash);
      replaceLocationHash(nextHash);
    }
  );

  useEffect(() => {
    const patchRequestKey =
      domain == null || domain === '' ? path : `${domain}${path}`;
    const patchSearchParams = new URLSearchParams({ path });
    if (domain != null && domain !== '') {
      patchSearchParams.set('domain', domain);
    }

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const isCurrentRequest = () =>
      requestIdRef.current === requestId && !controller.signal.aborted;

    viewerKeyRef.current = requestId;
    appliedLineHashKeyRef.current = null;
    loadedItemIdsRef.current = new Set();
    setViewerKey(requestId);
    setInitialItems([]);
    setTreeSource(null);
    setDiffStats(null);
    setCommentFileByItemId(null);
    setCommentSections([]);
    onLoadStart();
    setErrorMessage(null);
    setNeedsAuth(false);
    setLoadState('fetching');

    async function loadPatch() {
      try {
        const cacheKeyPrefix = encodeURIComponent(patchRequestKey);

        // Fire-and-forget load of existing GitHub PR review comments into the
        // sidebar once the diff is parsed. Requires a token and a PR path;
        // never blocks or breaks diff rendering (failures are logged only).
        async function loadReviewCommentsInto(
          fileByItemId: PeekdiffCommentFileByItemId
        ) {
          if (authToken == null || authToken === '') {
            return;
          }
          const pullRef = parsePullRef(path);
          if (pullRef == null) {
            return;
          }
          try {
            const threads = await listReviewThreads({
              ...pullRef,
              token: authToken,
              signal: controller.signal,
            });
            if (!isCurrentRequest()) {
              return;
            }
            const { sections, skippedNotInDiff } =
              reviewThreadsToCommentSections(threads, fileByItemId);
            if (skippedNotInDiff > 0) {
              console.warn(
                `peekdiff: ${skippedNotInDiff} review thread(s) skipped (file not in this diff).`
              );
            }
            if (isCurrentRequest()) {
              setCommentSections(sections);
              applyLoadedThreadAnnotations(sections);
            }
          } catch (error) {
            if (isCurrentRequest()) {
              console.warn('peekdiff: failed to load review comments', error);
            }
          }
        }

        async function commitFullPatch(patchContent: string) {
          if (!isCurrentRequest()) {
            return;
          }
          setLoadState('parsing');
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

          if (!isCurrentRequest()) {
            return;
          }
          const loadedData = buildPeekdiffData(patchContent, patchRequestKey);
          if (!isCurrentRequest()) {
            return;
          }

          setTreeSource(loadedData.treeSource);
          setCommentFileByItemId(loadedData.itemIdToFile);
          setCommentSections([]);
          setDiffStats(loadedData.diffStats);
          prepareItemsForViewer(loadedData.items);
          setInitialItems(loadedData.items);
          setLoadState('ready');
          void loadReviewCommentsInto(loadedData.itemIdToFile);
          await yieldToBrowser();
          if (isCurrentRequest()) {
            tryApplyLineHashTarget();
          }
        }

        // Resolves the diff transport. With a GitHub token we fetch straight
        // from api.github.com (works for public *and* private repos and keeps
        // private source off this server); otherwise we use the public proxy.
        // On an unauthenticated proxy failure that looks like a private repo,
        // flag needsAuth so the UI can offer to connect GitHub.
        async function resolvePatchResponse(): Promise<Response> {
          if (
            authToken != null &&
            authToken !== '' &&
            githubApiDiffUrl(path) != null
          ) {
            try {
              return await fetchAuthedPatch({
                path,
                token: authToken,
                signal: controller.signal,
              });
            } catch (error) {
              // A too-large diff (406) can still succeed through the public
              // proxy for public repos, so fall through in that one case;
              // re-throw everything else.
              if (
                !(error instanceof AuthedPatchError) ||
                error.status !== 406
              ) {
                throw error;
              }
            }
          }

          const proxyResponse = await fetch(`/api/diff?${patchSearchParams}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          // This only catches route setup errors. GitHub fetch failures are
          // delivered while consuming the stream so the UI can enter the
          // streaming state as soon as the local transport opens.
          if (!proxyResponse.ok) {
            if (
              (authToken == null || authToken === '') &&
              (proxyResponse.status === 403 ||
                proxyResponse.status === 404 ||
                proxyResponse.status === 415)
            ) {
              setNeedsAuth(true);
            }
            const detail = (await proxyResponse.text()).trim();
            throw new Error(
              detail.length > 0
                ? detail
                : `Request failed (${proxyResponse.status}).`
            );
          }
          return proxyResponse;
        }

        console.time('--     request time');
        const response = await resolvePatchResponse();
        console.timeEnd('--     request time');

        if (response.body == null) {
          console.time('--     reading patch');
          const patchContent = await response.text();
          console.timeEnd('--     reading patch');
          await commitFullPatch(patchContent);
          return;
        }

        setLoadState('streaming');
        await yieldToBrowser();
        if (!isCurrentRequest()) {
          return;
        }

        const accumulator = createPeekdiffDataAccumulator();
        let streamPatchIndex = 0;
        let streamTreePathPrefix: string | undefined;
        let pendingPublishFileCount = 0;
        let pendingTreePublishFileCount = 0;
        let hasPublishedTree = false;
        let hasPublishedInitialItems = false;
        let hasReceivedFirstStreamedFile = false;
        let lastPublishTime = performance.now();
        let lastWorkYieldTime = lastPublishTime;
        let lastTreePublishTime = lastPublishTime;
        const initialPublishFileBatchSize = getInitialBatchSize();

        const publishTreeSource = () => {
          if (pendingTreePublishFileCount === 0 || !isCurrentRequest()) {
            return;
          }

          pendingTreePublishFileCount = 0;
          hasPublishedTree = true;
          lastTreePublishTime = performance.now();
          setCommentFileByItemId(accumulator.itemIdToFile);
          setDiffStats({ ...accumulator.diffStats });
          setTreeSource(snapshotPeekdiffTreeSource(accumulator));
        };

        const publishPendingData = async () => {
          if (pendingPublishFileCount === 0 || !isCurrentRequest()) {
            return;
          }

          pendingPublishFileCount = 0;
          lastPublishTime = performance.now();
          const pendingItems = takePendingPeekdiffItems(accumulator);
          prepareItemsForViewer(pendingItems);
          if (!hasPublishedInitialItems) {
            hasPublishedInitialItems = true;
            publishTreeSource();
            setInitialItems(pendingItems);
          } else {
            const viewer = viewerRef.current;
            if (viewer != null) {
              viewer.addItems(pendingItems);
            } else {
              setInitialItems((prev) => [...prev, ...pendingItems]);
            }
          }
          await yieldToBrowser();
          if (isCurrentRequest()) {
            tryApplyLineHashTarget();
          }
          lastWorkYieldTime = performance.now();
        };

        const publishPendingDataIfNeeded = async () => {
          if (pendingPublishFileCount === 0) {
            return;
          }

          const elapsed = performance.now() - lastPublishTime;
          const publishFileBatchSize = hasPublishedInitialItems
            ? CODE_VIEW_BATCH_COUNT
            : initialPublishFileBatchSize;
          const publishInterval = hasPublishedInitialItems
            ? STREAM_PUBLISH_INTERVAL_MS
            : STREAM_INITIAL_PUBLISH_INTERVAL_MS;
          if (
            pendingPublishFileCount < publishFileBatchSize &&
            elapsed < publishInterval
          ) {
            return;
          }

          await publishPendingData();
        };
        const shouldDeferInitialPublishForBatchTarget = () => {
          if (hasPublishedInitialItems) {
            return false;
          }

          const elapsed = performance.now() - lastPublishTime;
          return (
            pendingPublishFileCount < initialPublishFileBatchSize &&
            elapsed < STREAM_INITIAL_PUBLISH_INTERVAL_MS
          );
        };
        const publishTreeSourceIfNeeded = () => {
          if (pendingTreePublishFileCount === 0) {
            return;
          }

          const elapsed = performance.now() - lastTreePublishTime;
          if (
            hasPublishedTree &&
            pendingTreePublishFileCount < STREAM_TREE_PUBLISH_FILE_BATCH_SIZE &&
            elapsed < STREAM_TREE_PUBLISH_INTERVAL_MS
          ) {
            return;
          }

          publishTreeSource();
        };
        const appendStreamedFile = async (fileText: string) => {
          if (!hasReceivedFirstStreamedFile) {
            hasReceivedFirstStreamedFile = true;
            console.timeEnd('--     first streamed file');
          }

          const patchMetadata = getStreamedPatchMetadata(fileText);
          if (patchMetadata != null) {
            streamTreePathPrefix = getPatchTreePathPrefix(
              patchMetadata,
              streamPatchIndex++
            );
          }

          const fileDiff = processFile(fileText, {
            cacheKey: `${cacheKeyPrefix}-0-${accumulator.fileIndex}`,
            isGitDiff: true,
          });
          if (fileDiff == null) {
            return;
          }

          const itemIdRename = appendFileDiffToPeekdiffData(
            accumulator,
            fileDiff,
            streamTreePathPrefix
          );
          if (itemIdRename != null) {
            applyPeekdiffItemIdRename(viewerRef.current, itemIdRename);
            if (loadedItemIdsRef.current.delete(itemIdRename.oldId)) {
              loadedItemIdsRef.current.add(itemIdRename.newId);
            }
          }
          pendingPublishFileCount++;
          pendingTreePublishFileCount++;
          const elapsedWork = performance.now() - lastWorkYieldTime;
          if (elapsedWork >= STREAM_WORK_BUDGET_MS) {
            if (shouldDeferInitialPublishForBatchTarget()) {
              await yieldToBrowser();
              lastWorkYieldTime = performance.now();
            } else {
              await publishPendingData();
            }
          } else {
            await publishPendingDataIfNeeded();
          }
          publishTreeSourceIfNeeded();
        };

        console.time('--     first streamed file');
        console.time('--     reading patch stream');
        const fallbackPatchContent = await streamGitPatchFiles(
          response.body,
          appendStreamedFile
        );
        console.timeEnd('--     reading patch stream');
        if (!isCurrentRequest()) {
          return;
        }

        await publishPendingData();
        publishTreeSource();
        if (fallbackPatchContent != null) {
          await commitFullPatch(fallbackPatchContent);
          return;
        }

        const streamedFileByItemId = new Map(accumulator.itemIdToFile);
        setCommentFileByItemId(streamedFileByItemId);
        setDiffStats({ ...accumulator.diffStats });
        setLoadState('ready');
        void loadReviewCommentsInto(streamedFileByItemId);
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }
        console.warn('Failed to load diff', error);
        setErrorMessage(GENERIC_PATCH_LOAD_ERROR_MESSAGE);
        setLoadState('error');
      }
    }

    void loadPatch();

    return () => {
      controller.abort();
    };
  }, [
    applyLoadedThreadAnnotations,
    authToken,
    domain,
    loadAttempt,
    onLoadStart,
    path,
    tryApplyLineHashTarget,
    viewerRef,
  ]);

  useEffect(() => {
    window.addEventListener('hashchange', tryApplyLineHashTarget);
    tryApplyLineHashTarget();
    return () => {
      window.removeEventListener('hashchange', tryApplyLineHashTarget);
    };
  }, [tryApplyLineHashTarget]);

  const retryLoad = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  // Re-fetch review threads for the current PR against the already-parsed diff
  // (no diff reload), used after a review/reply is posted so the new comments
  // appear as real GitHub threads. Reads the latest commentFileByItemId state.
  const reloadComments = useCallback(async () => {
    if (authToken == null || authToken === '') {
      return;
    }
    const pullRef = parsePullRef(path);
    if (pullRef == null || commentFileByItemId == null) {
      return;
    }
    try {
      const threads = await listReviewThreads({ ...pullRef, token: authToken });
      const { sections } = reviewThreadsToCommentSections(
        threads,
        commentFileByItemId
      );
      setCommentSections(sections);
      applyLoadedThreadAnnotations(sections);
    } catch (error) {
      console.warn('peekdiff: failed to reload review comments', error);
    }
  }, [authToken, path, commentFileByItemId, applyLoadedThreadAnnotations]);

  return {
    applyCollapseModeToLoaded,
    commentFileByItemId,
    commentSections,
    diffStats,
    errorMessage,
    initialItems,
    loadState,
    needsAuth,
    onLineLinkChange: handleLineLinkChange,
    onViewerReady: tryApplyLineHashTarget,
    reloadComments,
    retryLoad,
    setCommentSections,
    treeSource,
    viewerKey,
  };
}

function getLineHashApplyKey(viewerKey: number, hash: string): string {
  return `${viewerKey}:${hash}`;
}

function applyPeekdiffLineHashTarget(
  viewer: CodeViewHandle<CommentMetadata>,
  target: PeekdiffLineHashTarget
): boolean {
  const item = viewer.getItem(target.itemId);
  if (item == null) {
    return false;
  }

  const selectedLines = viewer.getSelectedLines();
  if (
    selectedLines?.id === target.itemId &&
    areSelectionsEqual(selectedLines.range, target.range)
  ) {
    return true;
  }

  if (item.collapsed === true) {
    item.collapsed = false;
    item.version = getNextItemVersion(item);
    if (!viewer.updateItem(item)) {
      return false;
    }
    viewer.getInstance()?.render(true);
  }

  viewer.setSelectedLines({ id: target.itemId, range: target.range });
  viewer.scrollTo({
    type: 'range',
    id: target.itemId,
    range: target.range,
    align: 'center',
    behavior: 'instant',
  });
  return true;
}

function applyPeekdiffItemIdRename(
  viewer: CodeViewHandle<CommentMetadata> | null,
  rename: PeekdiffItemIdRename
): void {
  viewer?.updateItemId(rename.oldId, rename.newId);
}

function getNextItemVersion(item: { version?: string | number }): number {
  return typeof item.version === 'number' ? item.version + 1 : 1;
}

function replaceLocationHash(hash: string | null): void {
  const { pathname, search } = window.location;
  const nextHash = hash ?? '';
  if (window.location.hash === nextHash) {
    return;
  }

  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${search}${nextHash}`
  );
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    let didResolve = false;
    const resolveOnce = () => {
      if (didResolve) {
        return;
      }

      didResolve = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(resolveOnce, 50);
    window.requestAnimationFrame(resolveOnce);
  });
}
