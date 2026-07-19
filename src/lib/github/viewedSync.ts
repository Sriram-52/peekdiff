// Client-side sync of GitHub's per-file "viewed" state (the same state
// github.com's PR "Viewed" checkbox drives), so peekdiff's viewed tracking
// matches GitHub and follows the user across devices. GraphQL-only feature;
// api.github.com/graphql allows cross-origin browser POST with a Bearer token,
// so this runs entirely client-side — no diff/source ever touches our server.

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

interface GraphQLError {
  message: string;
}

async function githubGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('GitHub denied access — reconnect GitHub for write access.');
    }
    throw new Error(`GitHub GraphQL request failed (${response.status}).`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: GraphQLError[];
  };
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  if (json.data == null) {
    throw new Error('GitHub GraphQL returned no data.');
  }
  return json.data;
}

const FILES_QUERY = `query($owner:String!,$repo:String!,$num:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$num){id files(first:100,after:$cursor){nodes{path viewerViewedState}pageInfo{hasNextPage endCursor}}}}}`;

interface FilesQueryData {
  repository: {
    pullRequest: {
      id: string;
      files: {
        nodes: { path: string; viewerViewedState: string }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  } | null;
}

// Reads GitHub's current viewed state for the PR (paginated) and returns the
// PR's GraphQL node id (needed for the mark/unmark mutations) plus the set of
// paths GitHub currently considers VIEWED for this user, and the set it
// considers DISMISSED.
//
// GitHub's viewerViewedState enum has three values: VIEWED, UNVIEWED, and
// DISMISSED. DISMISSED means "you marked this file viewed, but it has changed
// since" — i.e. a new push touched the file. GitHub's own PR UI un-checks the
// "Viewed" box for those. We surface dismissedPaths separately so the caller
// can un-view exactly those files (see ReviewUI reconcile) rather than letting
// a stale localStorage mark keep them collapsed after a push.
export async function fetchViewedState({
  owner,
  repo,
  pull,
  token,
  signal,
}: {
  owner: string;
  repo: string;
  pull: number;
  token: string;
  signal?: AbortSignal;
}): Promise<{
  pullRequestId: string;
  viewedPaths: string[];
  dismissedPaths: string[];
}> {
  let cursor: string | null = null;
  let pullRequestId = '';
  const viewedPaths: string[] = [];
  const dismissedPaths: string[] = [];

  for (;;) {
    const data: FilesQueryData = await githubGraphQL(
      FILES_QUERY,
      { owner, repo, num: pull, cursor },
      token,
      signal
    );
    const pr = data.repository?.pullRequest;
    if (pr == null) {
      throw new Error('Pull request not found.');
    }
    pullRequestId = pr.id;
    for (const node of pr.files.nodes) {
      if (node.viewerViewedState === 'VIEWED') {
        viewedPaths.push(node.path);
      } else if (node.viewerViewedState === 'DISMISSED') {
        dismissedPaths.push(node.path);
      }
    }
    if (!pr.files.pageInfo.hasNextPage) {
      break;
    }
    cursor = pr.files.pageInfo.endCursor;
  }

  return { pullRequestId, viewedPaths, dismissedPaths };
}

const MARK_MUTATION = `mutation($id:ID!,$path:String!){markFileAsViewed(input:{pullRequestId:$id,path:$path}){clientMutationId}}`;
const UNMARK_MUTATION = `mutation($id:ID!,$path:String!){unmarkFileAsViewed(input:{pullRequestId:$id,path:$path}){clientMutationId}}`;

export async function setFileViewed({
  pullRequestId,
  path,
  token,
  viewed,
  signal,
}: {
  pullRequestId: string;
  path: string;
  token: string;
  viewed: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  await githubGraphQL(
    viewed ? MARK_MUTATION : UNMARK_MUTATION,
    { id: pullRequestId, path },
    token,
    signal
  );
}

// Applies a batch of viewed changes to GitHub with bounded concurrency.
// Returns the paths that failed to sync (caller keeps local state regardless).
export async function setFilesViewed({
  pullRequestId,
  token,
  changes,
  concurrency = 6,
  signal,
}: {
  pullRequestId: string;
  token: string;
  changes: { path: string; viewed: boolean }[];
  concurrency?: number;
  signal?: AbortSignal;
}): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = index++;
      if (current >= changes.length) {
        return;
      }
      const change = changes[current];
      try {
        await setFileViewed({
          pullRequestId,
          path: change.path,
          token,
          viewed: change.viewed,
          signal,
        });
      } catch {
        failed.push(change.path);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, changes.length) }, worker)
  );
  return { failed };
}
