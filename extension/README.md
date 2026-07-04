# Open in peekdiff — Chrome extension

Press one key on any GitHub PR / commit / diff and it opens in
[peekdiff.codebyram.dev](https://peekdiff.codebyram.dev).

It works by swapping the hostname and keeping the path:

```
https://github.com/owner/repo/pull/123  →  https://peekdiff.codebyram.dev/owner/repo/pull/123
```

`/pull/123/files`, `/commit/<sha>`, and friends are normalized by peekdiff itself.

## Install

### Option A — download the packaged extension (easiest)

1. Grab `open-in-peekdiff.zip` from the [latest release](https://github.com/Sriram-52/peekdiff/releases/latest).
2. Unzip it anywhere.
3. Open `chrome://extensions` and toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the unzipped `open-in-peekdiff` folder.

### Option B — load from source

1. Clone this repo.
2. Open `chrome://extensions` and toggle **Developer mode** on.
3. Click **Load unpacked** and select this `extension/` folder.

Then, on any GitHub PR, press **⌘⇧Y** (macOS) / **Ctrl+Shift+Y** (Windows/Linux).
You can also click the extension's toolbar icon instead of the shortcut.

> Chrome loads unpacked extensions in Developer mode because this isn't published
> to the Chrome Web Store. The full source is right here in `extension/` — a
> single background service worker, no build step, nothing hidden.

## Change the shortcut

If ⌘⇧Y is taken (or you want something else):

1. Open `chrome://extensions/shortcuts`.
2. Find **Open in peekdiff** and click the pencil to rebind.

## Privacy

- Only reads pages on `github.com` — that is the **sole** host permission it
  requests (no `<all_urls>`, no browsing-history access, no content scripts).
- On a non-GitHub tab it flashes a `!` badge and does nothing.
- Opens peekdiff in a new tab right after the current one, so your GitHub tab
  stays put.

This mirrors peekdiff's own principle: least privilege, and your data stays
yours. See the main [README](../README.md).
