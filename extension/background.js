// peekdiff mirrors the GitHub path on its own host, so opening the current
// page in peekdiff is just: swap the hostname, keep the pathname. The catch-all
// viewer route normalizes /pull/N/files, /commit/<sha>, etc. server-side.
const SOURCE_HOST = 'github.com';
const TARGET_ORIGIN = 'https://peekdiff.codebyram.dev';

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
}

async function openInPeekdiff(tab) {
  if (!tab || !tab.url) return;

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return;
  }

  // Only act on github.com pages; anything else gets a quick hint and no tab.
  if (url.hostname !== SOURCE_HOST) {
    flashBadge('!', '#d29922');
    return;
  }

  await chrome.tabs.create({
    url: TARGET_ORIGIN + url.pathname,
    index: tab.index + 1,
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-in-peekdiff') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  openInPeekdiff(tab);
});

// Clicking the toolbar icon does the same thing, as a mouse fallback.
chrome.action.onClicked.addListener((tab) => openInPeekdiff(tab));
