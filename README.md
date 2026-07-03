# diffscope

A fast, virtualized GitHub diff viewer with support for **private repositories**.

Swap `github.com` for diffscope in any pull request, commit, or compare URL to
get an instant, virtualized diff. For private repos, connect a GitHub App and
diffscope fetches the diff directly from the GitHub API in your browser, so your
private source never touches the diffscope server.

## Credits and attribution

diffscope is built on [**DiffsHub**](https://diffshub.com) by
[Pierre Computer Company](https://github.com/pierrecomputer/pierre) and depends
on their published rendering libraries. The genuinely hard part, the
virtualized `CodeView` renderer, is their work, used here as the `@pierre/diffs`
and `@pierre/trees` npm packages.

- Original project: `pierrecomputer/pierre` (`apps/diffshub`), Apache-2.0.
- Portions of the app shell in this repo are derived from DiffsHub and carry a
  change notice where modified.
- See [`NOTICE`](./NOTICE) for the full attribution and [`LICENSE`](./LICENSE)
  for the Apache-2.0 terms.

diffscope is an independent project and is not affiliated with or endorsed by
Pierre Computer Company. "DiffsHub" and "Pierre" are their names/marks and are
not used as diffscope's branding.

## What diffscope adds over DiffsHub

- **Private repositories** via a GitHub App.
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

## Private repositories (GitHub App)

Private-repo support uses a GitHub App with the **user access token** flow. A
thin server exchanges the OAuth code for a token; the browser then fetches the
diff **directly from `api.github.com`**, so private source never passes through
the diffscope server.

### One-time GitHub App registration

1. GitHub → Settings → Developer settings → **GitHub Apps** → **New GitHub App**.
2. **Callback URL:** `http://localhost:3000/api/github/callback` for local dev
   (add your production URL too, e.g. `https://diffscope.dev/api/github/callback`).
3. Enable **"Request user authorization (OAuth) during installation."**
4. (Recommended) Enable **"Expire user authorization tokens"** so diffscope can
   refresh them; the refresh is handled automatically.
5. **Permissions → Repository:** `Pull requests: Read-only` and
   `Contents: Read-only`. No webhook needed.
6. Create the app, then generate a **client secret**.
7. Copy `.env.example` → `.env.local` and set `GITHUB_APP_CLIENT_ID` and
   `GITHUB_APP_CLIENT_SECRET`.
8. Install the app on the account/org whose private repos you want to view.

Restart `pnpm dev`. Opening a private repo's diff now shows a **Connect GitHub**
prompt; after connecting, the diff renders. Without the app configured,
diffscope still works for all public repos.

### Auth endpoints

- `GET /api/github/login` → redirect into the OAuth consent screen
- `GET /api/github/callback` → code exchange, sets httpOnly token cookies
- `GET /api/github/session` → `{ authenticated, token? }` for the client
- `POST /api/github/logout` → clears the local session

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
