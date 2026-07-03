// Client-side authenticated diff fetching.
//
// For private repositories the browser fetches the diff DIRECTLY from
// api.github.com with the user access token, so private source never passes
// through the peekdiff server. api.github.com sends `access-control-allow-
// origin: *`, and the `application/vnd.github.diff` media type returns the same
// unified-diff format the viewer's streaming parser already consumes.
//
// Caveat: the REST diff media type returns 406 for very large diffs (the
// github.com .diff file endpoint is more generous). Those surface as an error.

const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

const PULL_PATTERN = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)$/;
const COMMIT_PATTERN = /^\/([^/]+)\/([^/]+)\/commit\/([^/]+)$/;
const COMPARE_PATTERN = /^\/([^/]+)\/([^/]+)\/compare\/(.+)$/;

// Translates a normalized github.com path (the same shape usePatchLoader holds)
// into the api.github.com endpoint that returns its diff. Returns null for
// shapes we cannot map (the caller then falls back to the public proxy).
export function githubApiDiffUrl(path: string): string | null {
  const clean = stripDiffExtension(path.replace(/\/+$/, ''));

  const pull = PULL_PATTERN.exec(clean);
  if (pull) {
    return `${GITHUB_API_ORIGIN}/repos/${pull[1]}/${pull[2]}/pulls/${pull[3]}`;
  }

  const commit = COMMIT_PATTERN.exec(clean);
  if (commit) {
    return `${GITHUB_API_ORIGIN}/repos/${commit[1]}/${commit[2]}/commits/${commit[3]}`;
  }

  const compare = COMPARE_PATTERN.exec(clean);
  if (compare) {
    return `${GITHUB_API_ORIGIN}/repos/${compare[1]}/${compare[2]}/compare/${compare[3]}`;
  }

  return null;
}

function stripDiffExtension(path: string): string {
  if (path.endsWith('.diff')) return path.slice(0, -'.diff'.length);
  if (path.endsWith('.patch')) return path.slice(0, -'.patch'.length);
  return path;
}

export class AuthedPatchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AuthedPatchError';
  }
}

// Fetches a diff from the GitHub REST API with the user's token. Resolves to a
// streaming Response whose body feeds the existing patch parser. Throws
// AuthedPatchError on failure so the caller can distinguish auth/size errors.
export async function fetchAuthedPatch({
  path,
  token,
  signal,
}: {
  path: string;
  token: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const apiUrl = githubApiDiffUrl(path);
  if (apiUrl == null) {
    throw new AuthedPatchError('Unsupported GitHub URL for private access.', 400);
  }

  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github.diff',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new AuthedPatchError(describeApiError(response.status), response.status);
  }

  return response;
}

function describeApiError(status: number): string {
  switch (status) {
    case 401:
      return 'GitHub token expired or invalid. Reconnect GitHub.';
    case 403:
      return 'GitHub denied access to this diff (permissions or rate limit).';
    case 404:
      return 'Repository or diff not found, or not accessible with this account.';
    case 406:
      return 'This diff is too large for the GitHub API diff endpoint.';
    default:
      return `GitHub API request failed (${status}).`;
  }
}
