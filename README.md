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

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
