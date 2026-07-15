const DASHBOARD_URL = chrome.runtime.getURL("dashboard.html");

async function openDashboard() {
  const matches = await chrome.tabs.query({ url: `${DASHBOARD_URL}*` });
  const existing = matches[0];

  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }

  await chrome.tabs.create({ url: DASHBOARD_URL });
}

chrome.action.onClicked.addListener(openDashboard);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") openDashboard();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "TABLOOM_PAGE_META" || !sender.tab?.id) return;

  const key = `meta:${sender.tab.id}`;
  chrome.storage.local.set({
    [key]: {
      tabId: sender.tab.id,
      url: message.url,
      title: message.title,
      summary: message.summary,
      siteName: message.siteName,
      favicon: message.favicon,
      updatedAt: Date.now()
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`meta:${tabId}`);
});
