importScripts("i18n.js");

const DASHBOARD_URL = chrome.runtime.getURL("dashboard.html");

// Pages that are never worth collecting: blank/new-tab pages and Tabloom itself.
const UNCOLLECTABLE_PREFIXES = [
  "about:blank",
  "chrome://newtab",
  "edge://newtab",
  "chrome-search://",
  DASHBOARD_URL
];

// Menu entries carry a dictionary key rather than a title: the titles are rebuilt
// whenever the language setting changes.
const MENU_ITEMS = [
  { id: "tabloom:later:page", section: "later", contexts: ["page"], key: "menu.laterPage" },
  { id: "tabloom:saved:page", section: "saved", contexts: ["page"], key: "menu.savedPage" },
  { id: "tabloom:later:link", section: "later", contexts: ["link"], key: "menu.laterLink" },
  { id: "tabloom:saved:link", section: "saved", contexts: ["link"], key: "menu.savedLink" }
];

let languageSetting = "system";
let language = TabloomI18n.resolveLanguage(languageSetting);

function applyLanguage(setting) {
  languageSetting = TabloomI18n.normalizeLanguage(setting);
  language = TabloomI18n.resolveLanguage(languageSetting);
}

function t(key, values) {
  return TabloomI18n.translate(language, key, values);
}

// The service worker is torn down between events, so the setting is re-read on every
// start. Event handlers that produce copy await this first — otherwise a shortcut that
// wakes the worker would answer in the system language before the read lands.
const languageReady = chrome.storage.local.get("language")
  .then(({ language: stored }) => applyLanguage(stored))
  .catch(() => {});

// contextMenus reports failures through runtime.lastError rather than a rejected
// promise, so both calls read it to keep the console clean.
function createMenu(props) {
  chrome.contextMenus.create(props, () => void chrome.runtime.lastError);
}

// Titles are not part of a menu item's identity, so a language change only needs
// to retitle the existing entries; anything missing gets created.
function refreshMenuTitles() {
  for (const { id, contexts, key } of MENU_ITEMS) {
    const title = t(key);
    chrome.contextMenus.update(id, { title }, () => {
      if (chrome.runtime.lastError) createMenu({ id, contexts, title });
    });
  }
}

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

function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url || "";
  }
}

function isCollectable(url) {
  return Boolean(url) && !UNCOLLECTABLE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function pageFromTab(tab) {
  const key = `meta:${tab.id}`;
  const stored = await chrome.storage.local.get(key);
  // Single-page apps can navigate without reloading, so only trust metadata for the same URL.
  const meta = stored[key] && canonicalUrl(stored[key].url) === canonicalUrl(tab.url) ? stored[key] : {};
  return {
    url: tab.url,
    title: tab.title || meta.title || tab.url,
    summary: meta.summary || "",
    siteName: meta.siteName || "",
    favicon: tab.favIconUrl || meta.favicon || ""
  };
}

function pageFromLink(info) {
  return {
    url: info.linkUrl,
    title: info.selectionText?.trim() || info.linkUrl,
    summary: "",
    siteName: "",
    favicon: ""
  };
}

const BADGES = {
  success: { text: "✓", color: "#6c3ad6" },
  info: { text: "•", color: "#57516a" },
  error: { text: "!", color: "#c84e5c" }
};

const BADGE_MS = 2200;
const badgeTimers = new Map();

function flashBadge(tabId, tone) {
  const badge = BADGES[tone] || BADGES.info;

  // Chrome exposes the action API only where an icon exists to draw on.
  if (!chrome.action?.setBadgeText) return false;

  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color }).catch(() => {});
    chrome.action.setBadgeText({ tabId, text: badge.text }).catch(() => {});
  } catch {
    return false;
  }

  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.set(tabId, setTimeout(() => {
    badgeTimers.delete(tabId);
    try {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    } catch {
      // The tab is gone; nothing to clear.
    }
  }, BADGE_MS));

  return true;
}

// The content script owns the in-page pill. Tabs that were already open when the
// extension loaded have no content script yet, so inject it on demand and retry —
// otherwise the confirmation silently disappears for every pre-existing tab.
async function drawToast(tabId, message, tone) {
  const payload = { type: "TABLOOM_TOAST", message, tone };

  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch {
    // No listener in this tab yet.
  }

  if (!chrome.scripting?.executeScript) return false;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch {
    // Restricted page (chrome://, the Web Store, a PDF viewer) — the badge is the only channel left.
    return false;
  }
}

// Every channel is isolated: a page that can't host the toast must not also cost
// us the badge, and vice versa.
function notify(tab, message, tone = "success") {
  if (!tab?.id) return;

  try {
    flashBadge(tab.id, tone);
  } catch {
    // Ignore — feedback is best-effort.
  }

  drawToast(tab.id, message, tone).catch(() => {});
}

/* ---------- Reminders and auto-sleep ---------- */

// Two periodic workers live in the service worker because the dashboard is not open
// when they matter: one spots reminders that have come due, one unloads idle tabs.
const REMINDER_ALARM = "tabloom:reminders";
const SLEEP_ALARM = "tabloom:sleep";
const IDLE_HOURS = { "60": 1, "240": 4 };

function ensureAlarms() {
  if (!chrome.alarms) return;
  chrome.alarms.create(REMINDER_ALARM, { periodInMinutes: 1, delayInMinutes: 1 });
  chrome.alarms.create(SLEEP_ALARM, { periodInMinutes: 15, delayInMinutes: 15 });
}

async function setBadgeCount(count) {
  if (!chrome.action?.setBadgeText) return;
  try {
    if (count) await chrome.action.setBadgeBackgroundColor({ color: BADGES.success.color });
    await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  } catch {
    // No icon to draw on in this context.
  }
}

// A reminder has come due: the page moves out of "waiting" and the toolbar carries a
// count until the dashboard is opened (which clears it).
async function checkReminders() {
  await languageReady;
  const { later } = await chrome.storage.local.get("later");
  const list = Array.isArray(later) ? later : [];
  const now = Date.now();
  const due = list.filter((item) => item.remindAt && item.remindAt <= now);
  if (!due.length) {
    await setBadgeCount(0);
    return;
  }

  const dueIds = new Set(due.map((item) => item.id));
  const updated = list.map((item) => dueIds.has(item.id)
    ? { ...item, remindAt: undefined, remindedAt: now }
    : item);
  await chrome.storage.local.set({ later: updated });
  await setBadgeCount(due.length);

  if (!chrome.notifications?.create) return;
  const title = due.length === 1 ? due[0].title || due[0].url : t("notify.reminderTitle", { count: due.length });
  const body = due.length === 1 ? t("notify.reminderBody") : t("notify.reminderMany", { count: due.length });
  try {
    chrome.notifications.create(`tabloom:reminder:${now}`, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: String(title).slice(0, 120),
      message: body
    }, () => void chrome.runtime.lastError);
  } catch {
    // Notifications are a bonus channel; the badge already carries the signal.
  }
}

// The dashboard stores the choice as a string so the same value can drive the settings
// UI; translate it back into an idle threshold here.
async function checkAutoSleep() {
  const { autoSleep } = await chrome.storage.local.get("autoSleep");
  const hours = IDLE_HOURS[String(autoSleep)];
  if (!hours) return;

  const cutoff = Date.now() - hours * 3600000;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.active || tab.pinned || tab.audible || tab.discarded) continue;
    if (tab.autoDiscardable === false) continue;
    if (!/^https?:/.test(tab.url || "")) continue;
    if (!tab.lastAccessed || tab.lastAccessed > cutoff) continue;
    try {
      await chrome.tabs.discard(tab.id);
    } catch {
      // The browser declined (the tab is busy or protected).
    }
  }
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM) checkReminders().catch(() => {});
  else if (alarm.name === SLEEP_ALARM) checkAutoSleep().catch(() => {});
});

chrome.notifications?.onClicked.addListener((id) => {
  if (!id.startsWith("tabloom:reminder:")) return;
  chrome.notifications.clear(id);
  openDashboard();
});

async function collect(section, page, tab) {
  await languageReady;
  if (!isCollectable(page.url)) {
    notify(tab, t("toast.uncollectable"), "error");
    return;
  }

  const stored = await chrome.storage.local.get(section);
  const list = Array.isArray(stored[section]) ? stored[section] : [];
  const wanted = canonicalUrl(page.url);

  if (list.some((item) => canonicalUrl(item.url) === wanted)) {
    notify(tab, section === "later" ? t("toast.alreadyLater") : t("toast.alreadySaved"), "info");
    return;
  }

  list.unshift({ id: crypto.randomUUID(), ...page, addedAt: Date.now() });
  await chrome.storage.local.set({ [section]: list });
  notify(tab, section === "later" ? t("toast.kept") : t("toast.saved"), "success");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

chrome.action.onClicked.addListener(openDashboard);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") openDashboard();
  pruneMeta().catch(() => {});
  ensureAlarms();
  await languageReady;
  chrome.contextMenus.removeAll(() => {
    MENU_ITEMS.forEach(({ id, contexts, key }) => createMenu({ id, contexts, title: t(key) }));
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const item = MENU_ITEMS.find((entry) => entry.id === info.menuItemId);
  if (!item || !tab) return;
  const page = info.linkUrl && item.contexts.includes("link") ? pageFromLink(info) : await pageFromTab(tab);
  await collect(item.section, page, tab);
});

chrome.commands.onCommand.addListener(async (command, commandTab) => {
  const section = { "keep-for-later": "later", "save-page": "saved" }[command];
  if (!section) return;
  const tab = commandTab?.id ? commandTab : await activeTab();
  if (!tab) return;
  await collect(section, await pageFromTab(tab), tab);
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

// meta:<tabId> entries are dropped when a tab closes, but tabs that vanish with the
// browser itself never fire onRemoved, and their ids are reused after a restart. Sweep
// out every entry whose tab no longer exists whenever the browser or extension starts.
async function pruneMeta() {
  const [stored, tabs] = await Promise.all([chrome.storage.local.get(null), chrome.tabs.query({})]);
  const live = new Set(tabs.map((tab) => `meta:${tab.id}`));
  const stale = Object.keys(stored).filter((key) => key.startsWith("meta:") && !live.has(key));
  if (stale.length) await chrome.storage.local.remove(stale);
}

chrome.runtime.onStartup.addListener(() => {
  pruneMeta().catch(() => {});
  ensureAlarms();
  checkReminders().catch(() => {});
});

// Alarms survive restarts, but a browser that was closed before they existed needs them
// re-created; re-creating the same name is idempotent.
ensureAlarms();

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.delete(tabId);
  chrome.storage.local.remove(`meta:${tabId}`);
});

// Retitle on every start too: the browser's UI language may have changed while the
// worker was asleep, which matters when the setting is "system".
languageReady.then(refreshMenuTitles);

// Switching auto-sleep on should not wait up to fifteen minutes to take effect.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.autoSleep) return;
  checkAutoSleep().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.language) return;
  const next = TabloomI18n.normalizeLanguage(changes.language.newValue);
  if (next === languageSetting) return;
  applyLanguage(next);
  refreshMenuTitles();
});
