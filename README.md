# peekdiff

A fast, virtualized GitHub diff viewer with support for **private repositories**.

Swap `github.com` for peekdiff in any pull request, commit, or compare URL to
get an instant, virtualized diff. For private repos, connect with GitHub (OAuth)
and peekdiff fetches the diff directly from the GitHub API in your browser, so
your private source never touches the peekdiff server.

## Credits and attribution

peekdiff is built on [**DiffsHub**](https://diffshub.com) by
[Pierre Computer Company](https://github.com/pierrecomputer/pierre) and depends
on their published rendering libraries. The genuinely hard part, the
virtualized `CodeView` renderer, is their work, used here as the `@pierre/diffs`
and `@pierre/trees` npm packages.

- Original project: `pierrecomputer/pierre` (`apps/diffshub`), Apache-2.0.
- Portions of the app shell in this repo are derived from DiffsHub and carry a
  change notice where modified.
- See [`NOTICE`](./NOTICE) for the full attribution and [`LICENSE`](./LICENSE)
  for the Apache-2.0 terms.

peekdiff is an independent project and is not affiliated with or endorsed by
Pierre Computer Company. "DiffsHub" and "Pierre" are their names/marks and are
not used as peekdiff's branding.

## What peekdiff adds over DiffsHub

- **Private repositories** via GitHub OAuth.
- A client-side authenticated fetch to the GitHub REST API (`Accept:
  application/vnd.github.diff`) so private diffs are streamed straight into the
  viewer without the server ever seeing the code.

## Stack

- Next.js (App Router) + React 19, deployed on Vercel.
- `@pierre/diffs`, `@pierre/trees`, `@pierre/theme`, `@pierre/theming`,
  `@pierre/icons` from npm.
- pnpm.

## Development

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build
pnpm lint
```

Public repos need no configuration. To view a diff, open
`http://localhost:3000/<owner>/<repo>/pull/<n>` (also `/commit/<sha>` and
`/compare/<base>...<head>`).

## Private repositories

A thin server exchanges the OAuth code for a user token; the browser then
fetches diffs **directly from `api.github.com`**, so private source never passes
through the peekdiff server.

One "Login with GitHub" grants access to **every repo you can access** (owner or
contributor), with **no per-repo install**. It also powers GitHub's per-file
"viewed" sync. Trade-off: the token has broad `repo` read/write scope.

1. GitHub → Settings → Developer settings → **OAuth Apps** → **New OAuth App**.
2. **Homepage URL:** `http://localhost:3000` (or your prod URL).
3. **Authorization callback URL:** `http://localhost:3000/api/github/callback`
   (add your production callback too).
4. Create it, copy the **Client ID**, generate a **client secret**.
5. Copy `.env.example` → `.env.local` and set `GITHUB_OAUTH_CLIENT_ID` and
   `GITHUB_OAUTH_CLIENT_SECRET`.
6. Restart `pnpm dev`, click **Connect GitHub**, authorize. Done — no installs.

peekdiff requests `scope=repo`. Orgs with third-party-app restrictions may still
require an owner to approve the OAuth App. Without it configured, peekdiff still
works for all public repos.

### Auth endpoints

- `GET /api/github/login` → redirect into the OAuth consent screen
- `GET /api/github/callback` → code exchange, sets httpOnly token cookies
- `GET /api/github/session` → `{ authenticated, token? }` for the client
- `POST /api/github/logout` → clears the local session

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
