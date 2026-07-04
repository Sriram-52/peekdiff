// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: feed the GitHub user access token into the patch loader so
// private diffs load, surface a "Connect GitHub" prompt when a load looks
// blocked by repo privacy, and post drafted comments as a batched GitHub review
// (with replies) when connected on a PR.
'use client';

import { type DiffIndicators } from '@pierre/diffs';
import { type CodeViewHandle, useWorkerPool } from '@pierre/diffs/react';
import { type ColorMode } from '@pierre/theming';
import { useThemeController } from '@pierre/theming/react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { PeekdiffHeader } from './PeekdiffHeader';
import { PeekdiffSidebar } from './PeekdiffSidebar';
import { PeekdiffStatusPanel } from './PeekdiffStatusPanel';
import { PeekdiffViewer } from './PeekdiffViewer';
import { FloatingReviewButton } from './FloatingReviewButton';
import { useGitHubAuth } from './github-auth';
import { ThemeSourceProvider } from './ThemeSourceProvider';
import { usePatchLoader } from './usePatchLoader';
import { useThemeCycle } from './useThemeCycle';
import {
  docsThemeCatalog,
  themeController,
} from '@/components/themeController';
import { preloadAvatars } from '@/lib/annotation';
import { cn } from '@/lib/cn';
import {
  annotationSideToGithub,
  createReview,
  deleteReviewComment,
  editReviewComment,
  getPull,
  getPullHeadSha,
  parsePullRef,
  replyToThread,
  type ReviewCommentInput,
  type ReviewEvent,
  ReviewsError,
} from '@/lib/github/reviews';
import { removeSavedCommentSidebarEntry } from '@/lib/removeSavedCommentSidebarEntry';
import { SITE_NAME } from '@/lib/site';
import { fetchViewedState, setFilesViewed } from '@/lib/github/viewedSync';
import { loadViewedFiles, saveViewedFiles } from '@/lib/viewedFiles';
import type { DarkThemeName, LightThemeName } from '@/lib/themeNames';
import type {
  CommentMetadata,
  PeekdiffDeletedCommentEvent,
  PeekdiffSavedCommentEntry,
  PeekdiffSavedCommentEvent,
} from '@/lib/types';
import { upsertSavedCommentSidebarEntry } from '@/lib/upsertSavedCommentSidebarEntry';

interface ReviewUIProps {
  domain?: string;
  initialUrl: string;
  path: string;
}

export function ReviewUI({ domain, initialUrl, path }: ReviewUIProps) {
  // Provide the diffshub-scoped theme context, then render the body BELOW it so
  // the diffs hook + selection hook can read the controller context.
  return (
    <ThemeSourceProvider controller={themeController}>
      <ReviewUIInner domain={domain} initialUrl={initialUrl} path={path} />
    </ThemeSourceProvider>
  );
}

function ReviewUIInner({ domain, initialUrl, path }: ReviewUIProps) {
  useEffect(preloadAvatars, []);

  const {
    token: githubToken,
    user: githubUser,
    clientId: githubClientId,
    login,
    reconnect,
  } = useGitHubAuth();
  // Deep link to grant the peekdiff app access to an org, shown when a connected
  // user still can't reach a repo (needsAccess).
  const manageAccessUrl =
    githubClientId != null
      ? `https://github.com/settings/connections/applications/${githubClientId}`
      : null;
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Set the browser tab title to the PR title (e.g. "Fix header · #5381 · peekdiff").
  // Runs client-side since the title comes from an authed GitHub fetch; never
  // blocks the diff and silently keeps the default title on failure.
  useEffect(() => {
    const pullRef = parsePullRef(path);
    if (pullRef == null) {
      document.title = SITE_NAME;
      return;
    }
    const controller = new AbortController();
    void getPull({
      ...pullRef,
      token: githubToken ?? undefined,
      signal: controller.signal,
    })
      .then(({ title, number }) => {
        if (!controller.signal.aborted && title) {
          document.title = `${title} · #${number} · ${SITE_NAME}`;
        }
      })
      .catch(() => {
        // Leave the default title on any failure (private + not connected, etc.)
      });
    return () => {
      controller.abort();
      document.title = SITE_NAME;
    };
  }, [path, githubToken]);

  const isWorkerPoolReadyOrDisable = useIsWorkerPoolReadyOrDisabled();
  const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('split');
  const [collapseMode, setCollapseMode] = useState<'expanded' | 'collapsed'>(
    'expanded'
  );
  const [fileTreeOverlayOpen, setFileTreeOverlayOpen] = useState(false);
  const [overflow, setOverflow] = useState<'wrap' | 'scroll'>('scroll');
  const [showBackgrounds, setShowBackgrounds] = useState(true);
  const [diffIndicators, setDiffIndicators] = useState<DiffIndicators>('bars');
  const [lineNumbers, setLineNumbers] = useState(true);
  // All theming state — color mode and the light/dark theme-name picks — lives
  // in the single @pierre/theming controller (the same instance the app-wide
  // ThemeProvider is bound to). Reading it here means picking Auto/Light/Dark
  // flips both the CodeView's `themeType` and the app's <html> class, and the
  // theme-name picks persist with no separate local state.
  const themeState = useThemeController(themeController);

  // The controller reads persisted values synchronously when its module loads
  // on the client, so useSyncExternalStore would surface them on the very first
  // client render — but the server rendered the defaults. Gate every
  // theme-derived value (rendered into inline chrome styles + the CodeView
  // themeType) behind a client-mounted flag so the first client render matches
  // the SSR markup, then flips to the user's selection. This also keeps the
  // long-lived WorkerPool and the CodeView from mounting against the default
  // palette before the persisted values apply.
  const [themesHydrated, setThemesHydrated] = useState(false);
  useEffect(() => {
    setThemesHydrated(true);
  }, []);

  const colorMode: ColorMode = themesHydrated ? themeState.mode : 'system';
  const appResolvedTheme = themesHydrated
    ? themeState.resolvedColorScheme
    : undefined;
  const lightThemeName = themesHydrated
    ? themeState.lightThemeName
    : docsThemeCatalog.defaultLightThemeName;
  const darkThemeName = themesHydrated
    ? themeState.darkThemeName
    : docsThemeCatalog.defaultDarkThemeName;
  const setColorMode = useCallback((mode: ColorMode) => {
    themeController.setColorMode(mode);
  }, []);
  const setLightThemeName = useCallback((name: LightThemeName) => {
    themeController.setThemeNameForScheme('light', name);
  }, []);
  const setDarkThemeName = useCallback((name: DarkThemeName) => {
    themeController.setThemeNameForScheme('dark', name);
  }, []);
  // The cycle button in the System Monitor sweeps through every Shiki
  // theme so reviewers can preview the full set without manually picking
  // each one. The hook captures the user's current pick when cycling
  // starts so the visible theme anchors the rotation.
  const themeCycle = useThemeCycle({
    lightThemeName,
    darkThemeName,
    resolvedThemeMode: appResolvedTheme,
    setLightThemeName,
    setDarkThemeName,
    setColorMode,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CodeViewHandle<CommentMetadata> | null>(null);
  const handlePatchLoadStart = useCallback(() => {
    setFileTreeOverlayOpen(false);
  }, []);
  const {
    applyCollapseModeToLoaded,
    commentFileByItemId,
    commentSections,
    diffStats,
    errorMessage,
    initialItems,
    loadState,
    needsAuth,
    needsAccess,
    onLineLinkChange,
    onViewerReady,
    reloadComments,
    retryLoad,
    setCommentSections,
    treeSource,
    viewerKey,
  } = usePatchLoader({
    authToken: githubToken,
    collapseMode,
    domain,
    onLoadStart: handlePatchLoadStart,
    path,
    viewerRef,
  });

  // Per-file "Viewed" tracking (GitHub-style), keyed by tree path and
  // persisted per PR. Marking a file viewed collapses its diff; the sidebar
  // tree shows a checkmark. Loaded lazily on mount so SSR/first paint match.
  const [viewedPaths, setViewedPaths] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  useEffect(() => {
    // Load persisted viewed state after mount (not in the initializer) so the
    // server-rendered markup and first client render match before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewedPaths(loadViewedFiles(path));
  }, [path]);
  useEffect(() => {
    saveViewedFiles(path, viewedPaths);
  }, [path, viewedPaths]);

  // GitHub is the source of truth for viewed state. When authed on a PR we
  // reconcile the local (optimistic) set against GitHub's own viewerViewedState
  // on load, then mirror every local change back via markFileAsViewed /
  // unmarkFileAsViewed. Public / unauthed / non-PR stays local-only.
  const pullRequestIdRef = useRef<string | null>(null);
  // The set we believe GitHub currently holds; null until reconciled, which
  // gates the localStorage seed from firing spurious mutations before we know
  // GitHub's truth (and keeps local-only mode from ever calling GraphQL).
  const syncedViewedRef = useRef<ReadonlySet<string> | null>(null);

  useEffect(() => {
    pullRequestIdRef.current = null;
    syncedViewedRef.current = null;
    const pullRef = parsePullRef(path);
    if (githubToken == null || pullRef == null) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const { pullRequestId, viewedPaths: githubViewed } =
          await fetchViewedState({
            owner: pullRef.owner,
            repo: pullRef.repo,
            pull: Number(pullRef.pull),
            token: githubToken,
            signal: controller.signal,
          });
        if (controller.signal.aborted) {
          return;
        }
        const githubSet = new Set(githubViewed);
        pullRequestIdRef.current = pullRequestId;
        // Baseline = what GitHub actually holds. The mirror effect will then
        // push any LOCAL-only marks up to GitHub (best-effort — harmless if the
        // token can't write, e.g. a GitHub App token; markFileAsViewed needs an
        // OAuth `repo` token).
        syncedViewedRef.current = githubSet;
        // UNION local ∪ GitHub — never wipe the user's local viewed marks on
        // reload, even on repos where the write mutation is denied (otherwise a
        // reload would silently clear everything not yet stored on GitHub).
        const merged = new Set<string>([
          ...loadViewedFiles(path),
          ...githubViewed,
        ]);
        setViewedPaths(merged);
        saveViewedFiles(path, merged);
      } catch (error) {
        // Keep local state; sync stays disabled (syncedViewedRef stays null).
        console.warn('Failed to load GitHub viewed state', error);
      }
    })();
    return () => controller.abort();
  }, [path, githubToken]);

  useEffect(() => {
    const pullRequestId = pullRequestIdRef.current;
    const synced = syncedViewedRef.current;
    if (synced == null || pullRequestId == null || githubToken == null) {
      return;
    }
    const changes: { path: string; viewed: boolean }[] = [];
    for (const p of viewedPaths) {
      if (!synced.has(p)) changes.push({ path: p, viewed: true });
    }
    for (const p of synced) {
      if (!viewedPaths.has(p)) changes.push({ path: p, viewed: false });
    }
    if (changes.length === 0) {
      return;
    }
    // Optimistic: assume success (next PR load reconciles from GitHub truth).
    syncedViewedRef.current = new Set(viewedPaths);
    const controller = new AbortController();
    void setFilesViewed({
      pullRequestId,
      token: githubToken,
      changes,
      signal: controller.signal,
    })
      .then(({ failed }) => {
        if (failed.length > 0) {
          console.warn(
            `Failed to sync viewed state to GitHub for ${failed.length} file(s)`
          );
        }
      })
      .catch((error) => {
        console.warn('Failed to sync viewed state to GitHub', error);
      });
    return () => controller.abort();
  }, [viewedPaths, githubToken]);

  // path <-> itemId maps derived from the tree source (pathToItemId: path->id).
  const itemIdToPath = useMemo(() => {
    const map = new Map<string, string>();
    if (treeSource != null) {
      for (const [p, id] of treeSource.pathToItemId) {
        map.set(id, p);
      }
    }
    return map;
  }, [treeSource]);
  // Viewed itemIds (for the viewer header + collapse), resolved from paths.
  const viewedItemIds = useMemo(() => {
    const ids = new Set<string>();
    if (treeSource != null) {
      for (const p of viewedPaths) {
        const id = treeSource.pathToItemId.get(p);
        if (id != null) {
          ids.add(id);
        }
      }
    }
    return ids;
  }, [treeSource, viewedPaths]);

  const handleToggleViewed = useCallback(
    (itemId: string) => {
      const filePath = itemIdToPath.get(itemId);
      if (filePath == null) {
        return;
      }
      setViewedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(filePath)) {
          next.delete(filePath);
        } else {
          next.add(filePath);
        }
        return next;
      });
    },
    [itemIdToPath]
  );

  // Bulk "viewed" actions. Every file path in the diff is a key of
  // pathToItemId; marking all / clearing is a single set replacement so the
  // persistence + collapse + tree-repaint effects each run once, not per file.
  const allFilePaths = useMemo(
    () => (treeSource != null ? [...treeSource.pathToItemId.keys()] : []),
    [treeSource]
  );
  const viewedFileCount = useMemo(
    () => allFilePaths.reduce((n, p) => (viewedPaths.has(p) ? n + 1 : n), 0),
    [allFilePaths, viewedPaths]
  );
  const handleMarkAllViewed = useCallback(() => {
    setViewedPaths(new Set(allFilePaths));
  }, [allFilePaths]);
  const handleClearAllViewed = useCallback(() => {
    setViewedPaths(new Set());
  }, []);

  // Multi-select in the tree (cmd/shift-click) → "mark N selected as viewed".
  const [selectedTreePaths, setSelectedTreePaths] = useState<readonly string[]>(
    []
  );
  const handleSelectionPathsChange = useCallback((paths: readonly string[]) => {
    setSelectedTreePaths(paths);
  }, []);
  const handleMarkSelectedViewed = useCallback(() => {
    setViewedPaths((prev) => {
      const next = new Set(prev);
      for (const p of selectedTreePaths) {
        next.add(p);
      }
      return next;
    });
  }, [selectedTreePaths]);

  // Mark/unmark every file under a directory (path-prefix match) in one batched
  // set replacement — used by the tree's folder context menu, handy for
  // dismissing whole generated directories at once.
  const handleSetFolderViewed = useCallback(
    (dirPath: string, viewed: boolean) => {
      const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      setViewedPaths((prev) => {
        const next = new Set(prev);
        for (const p of allFilePaths) {
          if (p === dirPath || p.startsWith(prefix)) {
            if (viewed) {
              next.add(p);
            } else {
              next.delete(p);
            }
          }
        }
        return next;
      });
    },
    [allFilePaths]
  );
  const handleSetFileViewed = useCallback(
    (filePath: string, viewed: boolean) => {
      setViewedPaths((prev) => {
        if (prev.has(filePath) === viewed) {
          return prev;
        }
        const next = new Set(prev);
        if (viewed) {
          next.add(filePath);
        } else {
          next.delete(filePath);
        }
        return next;
      });
    },
    []
  );

  // Review posting is only possible when connected to GitHub on a PR path.
  const canReview = githubToken != null && parsePullRef(path) != null;
  // Pending comments = drafted locally this session, not yet a GitHub thread
  // (GitHub-loaded entries carry a githubCommentId).
  const pendingComments = useMemo(
    () =>
      commentSections.flatMap((section) =>
        section.comments
          .filter((comment) => comment.githubCommentId == null)
          .map((comment) => ({
            path: section.path,
            line: comment.lineNumber,
            side: annotationSideToGithub(comment.side),
            body: comment.message,
          }))
      ) satisfies ReviewCommentInput[],
    [commentSections]
  );

  const handleSubmitReview = useCallback(
    async (event: ReviewEvent, summary: string) => {
      const pullRef = parsePullRef(path);
      if (githubToken == null || pullRef == null || reviewSubmitting) {
        return;
      }
      setReviewSubmitting(true);
      setReviewError(null);
      try {
        const commitId = await getPullHeadSha({ ...pullRef, token: githubToken });
        await createReview({
          ...pullRef,
          token: githubToken,
          commitId,
          event,
          body: summary || undefined,
          comments: pendingComments,
        });
        await reloadComments();
      } catch (error) {
        setReviewError(
          error instanceof ReviewsError
            ? error.message
            : 'Failed to submit the review.'
        );
      } finally {
        setReviewSubmitting(false);
      }
    },
    [githubToken, path, pendingComments, reloadComments, reviewSubmitting]
  );

  const handleReplyToThread = useCallback(
    async (rootCommentId: number, body: string) => {
      const pullRef = parsePullRef(path);
      if (githubToken == null || pullRef == null) {
        return;
      }
      setReviewSubmitting(true);
      setReviewError(null);
      try {
        await replyToThread({
          ...pullRef,
          token: githubToken,
          rootCommentId,
          body,
        });
        await reloadComments();
      } catch (error) {
        setReviewError(
          error instanceof ReviewsError
            ? error.message
            : 'Failed to post the reply.'
        );
      } finally {
        setReviewSubmitting(false);
      }
    },
    [githubToken, path, reloadComments]
  );

  // Edit / delete the current user's own posted review comments. Errors
  // propagate to the inline card, which shows them; success reloads threads.
  const handleEditComment = useCallback(
    async (commentId: number, body: string) => {
      const pullRef = parsePullRef(path);
      if (githubToken == null || pullRef == null) {
        return;
      }
      await editReviewComment({
        owner: pullRef.owner,
        repo: pullRef.repo,
        commentId,
        body,
        token: githubToken,
      });
      await reloadComments();
    },
    [githubToken, path, reloadComments]
  );

  const handleDeleteComment = useCallback(
    async (commentId: number) => {
      const pullRef = parsePullRef(path);
      if (githubToken == null || pullRef == null) {
        return;
      }
      await deleteReviewComment({
        owner: pullRef.owner,
        repo: pullRef.repo,
        commentId,
        token: githubToken,
      });
      await reloadComments();
    },
    [githubToken, path, reloadComments]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateMobileState = (matches: boolean) => {
      setDiffStyle(matches ? 'unified' : 'split');
      if (!matches) setFileTreeOverlayOpen(false);
    };
    const handleChange = (event: MediaQueryListEvent) => {
      updateMobileState(event.matches);
    };

    updateMobileState(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  const handleSelectTreeItem = useCallback((itemId: string) => {
    setFileTreeOverlayOpen(false);
    const viewer = viewerRef.current;
    if (viewer == null) {
      return;
    }
    const item = viewer.getItem(itemId);
    if (item != null && item.collapsed === true) {
      item.collapsed = false;
      item.version = typeof item.version === 'number' ? item.version + 1 : 1;
      viewer.updateItem(item);
    }
    viewer.scrollTo({
      type: 'item',
      id: itemId,
      align: 'start',
      behavior: 'smooth',
    });
  }, []);
  const handleToggleCollapseMode = useCallback(() => {
    const next = collapseMode === 'expanded' ? 'collapsed' : 'expanded';
    setCollapseMode(next);
    applyCollapseModeToLoaded(next);
  }, [applyCollapseModeToLoaded, collapseMode]);
  const handleCommentSaved = useCallback(
    (comment: PeekdiffSavedCommentEvent) => {
      setCommentSections((prev) =>
        upsertSavedCommentSidebarEntry(prev, commentFileByItemId, comment)
      );
    },
    [commentFileByItemId, setCommentSections]
  );
  const handleCommentDeleted = useCallback(
    (comment: PeekdiffDeletedCommentEvent) => {
      setCommentSections((prev) =>
        removeSavedCommentSidebarEntry(prev, comment)
      );
    },
    [setCommentSections]
  );
  const handleToggleFileTreeOverlay = useCallback(() => {
    setFileTreeOverlayOpen((open) => !open);
  }, []);
  const handleCloseFileTreeOverlay = useCallback(() => {
    setFileTreeOverlayOpen(false);
  }, []);
  const handleSelectComment = useCallback(
    (comment: PeekdiffSavedCommentEntry) => {
      setFileTreeOverlayOpen(false);
      viewerRef.current?.setSelectedLines({
        id: comment.itemId,
        range: comment.range,
      });
      viewerRef.current?.scrollTo({
        type: 'line',
        id: comment.itemId,
        lineNumber: comment.range.end,
        side: comment.range.endSide ?? comment.range.side,
        align: 'center',
        behavior: 'smooth-auto',
      });
    },
    []
  );
  // Withhold the viewer until the persisted themes have been read from
  // localStorage. Otherwise on client-side navigation back into a diff the
  // CodeView would mount during the brief render where lightThemeName/darkThemeName
  // are still at their `DEFAULT_*_THEME` initial values and tokenize the
  // first batch of files against the wrong palette.
  const viewerAvailable =
    isWorkerPoolReadyOrDisable &&
    themesHydrated &&
    (loadState === 'ready' ||
      (loadState === 'streaming' && initialItems.length > 0));

  return (
    <ReviewGrid>
      <FloatingReviewButton
        canReview={canReview}
        pendingCount={pendingComments.length}
        submitting={reviewSubmitting}
        error={reviewError}
        onSubmit={handleSubmitReview}
      />
      <PeekdiffHeader
        className="[grid-area:header]"
        collapseMode={collapseMode}
        colorMode={colorMode}
        darkThemeName={darkThemeName}
        diffIndicators={diffIndicators}
        diffStyle={diffStyle}
        initialUrl={initialUrl}
        lightThemeName={lightThemeName}
        lineNumbers={lineNumbers}
        overflow={overflow}
        fileTreeOverlayOpen={fileTreeOverlayOpen}
        fileTreeAvailable={treeSource != null}
        onToggleCollapseMode={handleToggleCollapseMode}
        onToggleFileTreeOverlay={handleToggleFileTreeOverlay}
        setColorMode={setColorMode}
        setDarkThemeName={setDarkThemeName}
        setDiffIndicators={setDiffIndicators}
        setDiffStyle={setDiffStyle}
        setLightThemeName={setLightThemeName}
        setLineNumbers={setLineNumbers}
        setOverflow={setOverflow}
        setShowBackgrounds={setShowBackgrounds}
        showBackgrounds={showBackgrounds}
      />
      {viewerAvailable && treeSource != null ? (
        <>
          <PeekdiffSidebar
            className="[grid-area:viewer] md:[grid-area:tree]"
            commentSections={commentSections}
            diffStats={diffStats}
            mobileOverlayOpen={fileTreeOverlayOpen}
            onMobileClose={handleCloseFileTreeOverlay}
            onSelectComment={handleSelectComment}
            scrollRef={scrollRef}
            source={treeSource}
            streaming={loadState === 'streaming'}
            themeCycle={themeCycle}
            onSelectItem={handleSelectTreeItem}
            onSelectionPathsChange={handleSelectionPathsChange}
            viewedPaths={viewedPaths}
            viewedFileCount={viewedFileCount}
            fileCount={allFilePaths.length}
            selectedFileCount={selectedTreePaths.length}
            onMarkAllViewed={handleMarkAllViewed}
            onClearAllViewed={handleClearAllViewed}
            onMarkSelectedViewed={handleMarkSelectedViewed}
            onSetFolderViewed={handleSetFolderViewed}
            onSetFileViewed={handleSetFileViewed}
            canReview={canReview}
            reviewSubmitting={reviewSubmitting}
            onReplyToThread={handleReplyToThread}
          />
          <PeekdiffViewer
            key={viewerKey}
            className="[grid-area:viewer]"
            authorLogin={githubUser?.login}
            authorAvatarUrl={githubUser?.avatarUrl}
            diffStyle={diffStyle}
            overflow={overflow}
            showBackgrounds={showBackgrounds}
            diffIndicators={diffIndicators}
            lineNumbers={lineNumbers}
            scrollRef={scrollRef}
            themeType={colorMode}
            viewerRef={viewerRef}
            initialItems={initialItems}
            viewedItemIds={viewedItemIds}
            onToggleViewed={handleToggleViewed}
            onCommentDeleted={handleCommentDeleted}
            onCommentSaved={handleCommentSaved}
            onLineLinkChange={onLineLinkChange}
            onViewerReady={onViewerReady}
            onEditGithubComment={handleEditComment}
            onDeleteGithubComment={handleDeleteComment}
          />
        </>
      ) : (
        <PeekdiffStatusPanel
          errorMessage={errorMessage}
          needsAuth={needsAuth}
          needsAccess={needsAccess}
          manageAccessUrl={manageAccessUrl}
          onConnect={() => login()}
          onReconnect={() => void reconnect()}
          onRetry={retryLoad}
          state={loadState}
        />
      )}
    </ReviewGrid>
  );
}

function useIsWorkerPoolReadyOrDisabled() {
  const workerPool = useWorkerPool();
  const [isReady, setIsReady] = useState(
    () => workerPool?.isInitialized() ?? true
  );
  const isReadyRef = useRef(isReady);
  useEffect(() => {
    // The callback will always be fired immediately with the new state, so we
    // don't need to check for it in the effect
    return workerPool?.subscribeToStatChanges((stats) => {
      const isReady = stats.managerState === 'initialized';
      if (isReady !== isReadyRef.current) {
        setIsReady(isReady);
        isReadyRef.current = isReady;
      }
    });
  }, [workerPool]);
  return isReady;
}

interface ReviewGridProps {
  children: ReactNode;
}

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_WIDTH_STORAGE_KEY = 'peekdiff:sidebarWidth';

function clampSidebarWidth(px: number): number {
  const viewportMax =
    typeof window === 'undefined'
      ? 700
      : Math.min(700, Math.round(window.innerWidth * 0.6));
  const max = Math.max(SIDEBAR_MIN_WIDTH, viewportMax);
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(px, max));
}

// The file tree occupies a fixed grid column; a draggable separator on its
// right edge lets the reviewer widen it to read deep monorepo paths. Width is
// persisted globally (not per-PR) so it sticks across PRs and reloads.
function ReviewGrid({ children }: ReviewGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const persistedOnceRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (raw != null && Number.isFinite(Number(raw))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the persisted width on mount
        setWidth(clampSidebarWidth(Number(raw)));
      }
    } catch {
      // ignore storage failures; default width applies
    }
  }, []);

  // Persist width changes (skipping the initial mount) so the chosen width
  // sticks across PRs and reloads.
  useEffect(() => {
    if (!persistedOnceRef.current) {
      persistedOnceRef.current = true;
      return;
    }
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  const startDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const grid = gridRef.current;
    if (grid == null) {
      return;
    }
    const left = grid.getBoundingClientRect().left;
    setDragging(true);
    const onMove = (moveEvent: PointerEvent) => {
      setWidth(clampSidebarWidth(moveEvent.clientX - left));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
  }, []);

  const nudge = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    setWidth((current) =>
      clampSidebarWidth(current + (event.key === 'ArrowLeft' ? -16 : 16))
    );
  }, []);

  return (
    <div
      ref={gridRef}
      style={{ '--peekdiff-sidebar-w': `${width}px` } as React.CSSProperties}
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden overscroll-contain contain-strict [grid-template-areas:'header''viewer'] md:grid-cols-[var(--peekdiff-sidebar-w)_minmax(0,1fr)] md:[grid-template-areas:'header_header''tree_viewer']"
    >
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file tree (drag, double-click to reset, arrow keys to nudge)"
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={resetWidth}
        onKeyDown={nudge}
        className={cn(
          'z-20 hidden w-1.5 translate-x-1/2 cursor-col-resize touch-none self-stretch justify-self-end bg-transparent transition-colors [grid-area:tree] md:block',
          'hover:bg-[var(--peekdiff-annotation-border,var(--color-border))] focus-visible:bg-[var(--peekdiff-annotation-border,var(--color-border))] focus-visible:outline-none',
          dragging && 'bg-[var(--peekdiff-annotation-border,var(--color-border))]'
        )}
      />
    </div>
  );
}
