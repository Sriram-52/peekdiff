'use client';

import { useStableCallback } from '@pierre/diffs/react';
import type {
  FileTreeBatchOperation,
  ContextMenuItem as FileTreeContextMenuItem,
  ContextMenuOpenContext as FileTreeContextMenuOpenContext,
  FileTree as FileTreeModel,
  FileTreeOptions,
} from '@pierre/trees';
import { useFileTree } from '@pierre/trees/react';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

// Derived from DiffsHub (pierrecomputer/pierre), Apache-2.0. Changes by the
// peekdiff authors: inlined the FileTreePublicId type alias (upstream imported
// it from a monorepo-relative path that does not exist outside the monorepo;
// the published @pierre/trees does not re-export it from its entry, and it is
// simply `type FileTreePublicId = string`); added a "viewed" checkmark row
// decoration driven by the reviewer's per-file viewed set; and a right-click
// context menu to mark all files under a folder (or a single file) as viewed.
type FileTreePublicId = string;
import { ThemedFileTree } from './ThemedFileTree';
import {
  BASE_FILE_TREE_OPTIONS,
  CODE_VIEW_FILE_TREE_ITEM_HEIGHT,
  getInitialBatchSize,
} from '@/lib/constants';
import type { PeekdiffFileTreeSource } from '@/lib/types';
type FileTreeSortComparator = Exclude<
  NonNullable<FileTreeOptions['sort']>,
  'default'
>;
// Keeps @pierre/trees from applying its default semantic sort so the sidebar
// follows the same patch path sequence that drives the code view.
const PRESERVE_INPUT_ORDER_SORT: FileTreeSortComparator = () => 0;

// Layout-only overrides. Colors flow through from the resolved Shiki theme
// (via themeToTreeStyles) so the sidebar matches the diff theme, but the
// density and padding stay tuned for the diffshub layout regardless of
// which theme the user picks. `--trees-git-renamed-color-override` is kept
// because most Shiki themes don't define a "renamed" decoration color.
const DENSITY_OVERRIDE_STYLES = {
  '--trees-density-override': 0.8,
  '--trees-padding-inline-override': 8,
  '--trees-git-renamed-color-override': 'light-dark(#007aff, #007aff)',
} as CSSProperties;

interface PeekdiffFileTreeProps {
  // Callback invoked with the underlying tree model once it's mounted, and
  // again with `null` on unmount. Lets parents drive imperative APIs like
  // search open/close without owning the model creation.
  onModelReady(model: FileTreeModel | null): void;
  onSelectItem(itemId: string): void;
  // Reports the full set of selected tree paths on every selection change
  // (multi-select via cmd/shift-click), so a parent can offer a "mark selected
  // as viewed" bulk action. Single-file navigation still flows through
  // onSelectItem.
  onSelectionPathsChange?(paths: readonly string[]): void;
  source: PeekdiffFileTreeSource;
  // Tree paths marked "viewed"; rendered as a checkmark decoration. Read via a
  // ref because useFileTree captures its options once.
  viewedPaths?: ReadonlySet<string>;
  // Right-click context-menu actions: mark/unmark every file under a directory,
  // or a single file. When neither is provided, no context menu is shown.
  onSetFolderViewed?(dirPath: string, viewed: boolean): void;
  onSetFileViewed?(filePath: string, viewed: boolean): void;
}

export const PeekdiffFileTree = memo(function PeekdiffFileTree({
  onModelReady,
  onSelectItem,
  onSelectionPathsChange,
  source,
  viewedPaths,
  onSetFolderViewed,
  onSetFileViewed,
}: PeekdiffFileTreeProps) {
  const sourceRef = useRef(source);
  const previousSourceRef = useRef(source);
  const [initialVisibleRowCount] = useState(getInitialBatchSize);
  sourceRef.current = source;
  const viewedPathsRef = useRef<ReadonlySet<string> | undefined>(viewedPaths);
  // `source.paths` aliases the streaming accumulator's live array, so it keeps
  // growing on later publishes. The FileTree model consumes its path list
  // exactly once via useFileTree's useState initializer; capture a bounded
  // snapshot here so the first model build uses only what `pathCount`
  // describes and so subsequent streaming re-renders don't re-slice the
  // ever-growing live array.
  const initialPathsRef = useRef<readonly string[] | null>(null);
  initialPathsRef.current ??= source.paths.slice(0, source.pathCount);
  const onSelectionChange = useStableCallback(
    (selectedPaths: readonly FileTreePublicId[]) => {
      onSelectionPathsChange?.(selectedPaths);
      if (selectedPaths.length !== 1 || onSelectItem == null) {
        return;
      }
      const [path] = selectedPaths;
      const itemId = sourceRef.current.pathToItemId.get(path);
      if (itemId != null) {
        onSelectItem(itemId);
      }
    }
  );

  const { model } = useFileTree({
    ...BASE_FILE_TREE_OPTIONS,
    gitStatus: source.gitStatus,
    paths: initialPathsRef.current,
    sort: PRESERVE_INPUT_ORDER_SORT,
    onSelectionChange,
    itemHeight: CODE_VIEW_FILE_TREE_ITEM_HEIGHT,
    initialVisibleRowCount,
    // Show a checkmark on files the reviewer marked "viewed", and on a folder
    // when ALL its descendant files are viewed. Reads live refs since this
    // renderer is captured once by useFileTree.
    renderRowDecoration: ({ row }) => {
      const viewed = viewedPathsRef.current;
      if (viewed == null || viewed.size === 0) {
        return null;
      }
      if (row.kind === 'file') {
        return viewed.has(row.path) ? { text: '✓', title: 'Viewed' } : null;
      }
      // Directory: its real path is the terminal flattened segment when the row
      // is a flattened single-child chain (whose row.path carries the
      // FLATTENED_PREFIX "f::"), otherwise row.path itself.
      const segments = row.flattenedSegments;
      let dirPath =
        row.isFlattened && segments && segments.length > 0
          ? segments[segments.length - 1].path
          : row.path;
      if (dirPath.startsWith('f::')) {
        dirPath = dirPath.slice(3);
      }
      const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      let hasDescendant = false;
      for (const filePath of sourceRef.current.pathToItemId.keys()) {
        if (filePath === dirPath || filePath.startsWith(prefix)) {
          hasDescendant = true;
          if (!viewed.has(filePath)) {
            return null; // a file under this folder isn't viewed yet
          }
        }
      }
      return hasDescendant ? { text: '✓', title: 'All files viewed' } : null;
    },
  });

  // useFileTree captured renderRowDecoration once, so when the viewed set
  // changes we refresh the ref it reads and nudge the model to repaint its
  // rows (there is no public decoration-invalidate API; re-applying git status
  // re-renders rows).
  const didMountRef = useRef(false);
  useEffect(() => {
    viewedPathsRef.current = viewedPaths;
    // Skip the initial mount: the tree's first build already runs the
    // decoration renderer, and nudging git status here would clobber the
    // source-sync effect's initial reset.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // Re-run the decoration renderer by rebuilding the visible rows.
    // setGitStatus does not re-invoke decorations (they're only recomputed on a
    // structural rebuild), so we resetPaths with the current path list — the
    // same call the source-sync effect uses on load, which is what makes the
    // checkmark appear there.
    const src = sourceRef.current;
    model.resetPaths(src.paths.slice(0, src.pathCount));
  }, [model, viewedPaths]);

  useEffect(() => {
    const previousSource = previousSourceRef.current;
    if (previousSource === source) {
      return;
    }

    previousSourceRef.current = source;
    // The streaming patch loader links each tree-source snapshot to the prior
    // one through `previousSource`. When the link matches what this component
    // last applied, the new paths array is guaranteed to extend the previous
    // one, so we apply the delta as add() operations instead of asking the
    // model to throw itself away and rebuild against the full path list. This
    // turns tree publishes from O(N) each (where N is the total accumulated
    // path count) into O(delta), which keeps the Diff Stats counter fast as
    // more files stream in.
    //
    // Both snapshots alias the live accumulator's paths array, so we read the
    // delta bounds from each snapshot's captured `pathCount` instead of the
    // shared array's current length.
    if (
      source.previousSource != null &&
      source.previousSource === previousSource
    ) {
      const previousPathCount = previousSource.pathCount;
      if (source.pathCount > previousPathCount) {
        const operations: FileTreeBatchOperation[] = [];
        for (let index = previousPathCount; index < source.pathCount; index++) {
          operations.push({ type: 'add', path: source.paths[index] });
        }
        if (operations.length > 0) {
          model.batch(operations);
        }
      }
      if (source.gitStatusPatch != null) {
        model.applyGitStatusPatch(source.gitStatusPatch);
      }
    } else {
      model.resetPaths(source.paths.slice(0, source.pathCount));
      model.setGitStatus(source.gitStatus);
    }
  }, [model, source]);

  useEffect(() => {
    onModelReady(model);
    return () => onModelReady(null);
  }, [model, onModelReady]);

  // Right-click menu: mark a whole folder (or a single file) viewed/unviewed.
  // Only enabled when the parent wires the viewed handlers.
  const hasViewedActions = onSetFolderViewed != null || onSetFileViewed != null;
  const renderContextMenu = !hasViewedActions
    ? undefined
    : (
        item: FileTreeContextMenuItem,
        context: FileTreeContextMenuOpenContext
      ): ReactNode => {
        if (item.kind === 'directory') {
          if (onSetFolderViewed == null) {
            return null;
          }
          return (
            <TreeViewedMenu>
              <TreeViewedMenuItem
                onSelect={() => {
                  onSetFolderViewed(item.path, true);
                  context.close();
                }}
              >
                Mark all in folder as viewed
              </TreeViewedMenuItem>
              <TreeViewedMenuItem
                onSelect={() => {
                  onSetFolderViewed(item.path, false);
                  context.close();
                }}
              >
                Unmark all in folder
              </TreeViewedMenuItem>
            </TreeViewedMenu>
          );
        }
        if (onSetFileViewed == null) {
          return null;
        }
        const isViewed = viewedPathsRef.current?.has(item.path) ?? false;
        return (
          <TreeViewedMenu>
            <TreeViewedMenuItem
              onSelect={() => {
                onSetFileViewed(item.path, !isViewed);
                context.close();
              }}
            >
              {isViewed ? 'Unmark as viewed' : 'Mark as viewed'}
            </TreeViewedMenuItem>
          </TreeViewedMenu>
        );
      };

  return (
    <ThemedFileTree
      className="h-full min-h-0 overflow-auto overscroll-contain md:ml-3"
      model={model}
      reconcileForegroundFromChrome
      renderContextMenu={renderContextMenu}
      style={DENSITY_OVERRIDE_STYLES}
    />
  );
});

// Slotted into the tree's context-menu surface (light DOM, so app Tailwind
// tokens apply). Mirrors the app's dropdown styling.
function TreeViewedMenu({ children }: { children: ReactNode }) {
  return (
    <div
      role="menu"
      className="bg-popover text-popover-foreground min-w-[200px] rounded-md border p-1 shadow-md"
    >
      {children}
    </div>
  );
}

function TreeViewedMenuItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none"
    >
      {children}
    </button>
  );
}
