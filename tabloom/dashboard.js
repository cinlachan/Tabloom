const isExtension = typeof chrome !== "undefined" && Boolean(chrome.tabs?.query);
const dashboardUrl = isExtension ? chrome.runtime.getURL("dashboard.html") : location.href;
const isMac = /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
const isEdge = /Edg\//.test(navigator.userAgent);

const i18n = globalThis.TabloomI18n;

// The resolved dictionary language ("en" or "zh"); state.language keeps the raw
// setting, which may be "system".
let language = "en";

function t(key, values) {
  return i18n.translate(language, key, values);
}

// Fills in everything the markup declares with data-i18n-* attributes. Re-running this
// on a language change means the static copy only ever lives in the dictionary.
function applyStaticCopy() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  });
  // Tooltips hang off a data-tooltip attribute that CSS renders, so they swap too.
  document.querySelectorAll("[data-i18n-tooltip]").forEach((node) => {
    node.dataset.tooltip = t(node.dataset.i18nTooltip);
  });
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  syncSettingsUi();
  applyKeymapLabels();
}

function applyLanguage() {
  language = i18n.resolveLanguage(state.language);
  applyStaticCopy();
  render();
}

const demoTabs = [
  { id: 101, windowId: 1, title: "Designing for Clarity, Not Attention", url: "https://medium.com/design/clarity", favIconUrl: "", active: false, lastAccessed: Date.now() - 60000 },
  { id: 102, windowId: 1, title: "Building a Second Brain in Notion", url: "https://youtube.com/watch?v=tabloom", favIconUrl: "", active: false, lastAccessed: Date.now() - 120000 },
  { id: 103, windowId: 1, title: "Grid layout — CSS", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/grid", favIconUrl: "", active: false, lastAccessed: Date.now() - 30000 },
  { id: 104, windowId: 2, title: "Tabloom UI Kit – Figma", url: "https://figma.com/file/tabloom", favIconUrl: "", active: false, pinned: true, lastAccessed: Date.now() - 900000 },
  { id: 105, windowId: 2, title: "プロジェクト計画テンプレート", url: "https://notion.so/project-template", favIconUrl: "", active: false, lastAccessed: Date.now() - 3 * 3600000 },
  { id: 106, windowId: 2, title: "人工智能正在改变我们的工作方式", url: "https://github.com/topics/artificial-intelligence", favIconUrl: "", active: false, discarded: true, lastAccessed: Date.now() - 5 * 3600000 },
  { id: 107, windowId: 2, title: "Grid layout — CSS", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/grid#syntax", favIconUrl: "", active: false, lastAccessed: Date.now() - 800000 }
];

const demoMeta = {
  101: { summary: "Principles for creating calm, intuitive digital experiences.", siteName: "Medium" },
  102: { summary: "A step-by-step system for organizing your digital life.", siteName: "YouTube" },
  103: { summary: "Learn how to create powerful two-dimensional layouts.", siteName: "MDN Web Docs" },
  104: { summary: "Design system and interface components for Tabloom.", siteName: "Figma" },
  105: { summary: "プロジェクトを整理し、進捗を追跡するためのテンプレート", siteName: "Notion" },
  106: { summary: "开源项目、研究资料与实践案例的精选集合。", siteName: "GitHub" },
  107: { summary: "Learn how to create powerful two-dimensional layouts.", siteName: "MDN Web Docs" }
};

// In-memory stand-in for chrome.storage when dashboard.html is opened directly as a preview.
let demoStore = null;

const state = {
  tabs: [],
  meta: {},
  later: [],
  saved: [],
  stashes: [],
  selfWindowId: null,
  duplicateIds: new Set(),
  autoSleep: "off",
  compostAt: 0,
  compostForced: false,
  celebratedAt: 0,
  remindMenu: null,
  collapsed: { later: false, open: false, saved: false },
  query: "",
  theme: "system",
  sound: "subtle",
  language: "system",
  openSort: "manual",
  openOrder: [],
  draggedGroup: null,
  pointerDrag: null,
  expandedGroups: new Set(),
  undo: { later: null, open: null, saved: null },
  undoOrder: [],
  shortcuts: { open: "", later: "", saved: "" },
  keymap: null,
  recording: null,
  settingsOpen: false,
  palette: { open: false, entries: [], index: 0, returnFocus: null }
};

const refs = {
  search: document.querySelector("#search"),
  settings: document.querySelector("#settings"),
  openSettings: document.querySelector("#open-settings"),
  keymapList: document.querySelector("#keymap-list"),
  keymapHint: document.querySelector("#keymap-hint"),
  browserShortcutList: document.querySelector("#browser-shortcut-list"),
  openSort: document.querySelector("#open-sort"),
  resetOpenOrder: document.querySelector("#reset-open-order"),
  stashWindow: document.querySelector("#stash-window"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast .toast-message"),
  toastUndo: document.querySelector("#toast .toast-undo"),
  emptySearch: document.querySelector("#empty-search"),
  dialog: document.querySelector("#confirm-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogCopy: document.querySelector("#dialog-copy"),
  dialogConfirm: document.querySelector("#dialog-confirm"),
  palette: document.querySelector("#palette"),
  paletteInput: document.querySelector("#palette-input"),
  paletteList: document.querySelector("#palette-list"),
  paletteHints: document.querySelector("#palette-hints"),
  openPalette: document.querySelector("#open-palette"),
  remindMenu: document.querySelector("#remind-menu"),
  brand: document.querySelector(".brand"),
  brandMark: document.querySelector(".brand-mark")
};

const SECTION_LABELS = { open: "section.open", later: "section.later", saved: "section.saved" };

function modKey(key) {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

/* ---------- In-page shortcuts (user-editable) ----------
 * A binding is { key, mod, shift, alt }: `key` is KeyboardEvent.key lower-cased and
 * `mod` means ⌘ on macOS and Ctrl elsewhere. Bindings without a modifier are single
 * keys and never fire while the user is typing in a field. Browser-wide shortcuts
 * (chrome.commands) cannot be rebound by an extension, so they link out instead. */
const KEYMAP_ACTIONS = ["palette", "filter", "undo"];
const DEFAULT_KEYMAP = {
  palette: { key: "k", mod: true, shift: false, alt: false },
  filter: { key: "/", mod: false, shift: false, alt: false },
  undo: { key: "z", mod: true, shift: false, alt: false }
};
// Combos the browser keeps for itself (new tab, close tab, copy…) never reach the page.
const RESERVED_MOD_KEYS = new Set(["a", "c", "f", "l", "n", "p", "q", "r", "t", "v", "w", "x"]);
const MODIFIER_KEYS = new Set(["meta", "control", "shift", "alt", "os", "capslock", "fn"]);

function normalizeBinding(value) {
  if (!value || typeof value.key !== "string" || !value.key) return null;
  return { key: value.key.toLowerCase(), mod: Boolean(value.mod), shift: Boolean(value.shift), alt: Boolean(value.alt) };
}

function normalizeKeymap(value) {
  const keymap = {};
  KEYMAP_ACTIONS.forEach((action) => {
    keymap[action] = normalizeBinding(value?.[action]) || { ...DEFAULT_KEYMAP[action] };
  });
  return keymap;
}

function bindingFromEvent(event) {
  return {
    key: event.key.toLowerCase(),
    mod: isMac ? event.metaKey : event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey
  };
}

function sameBinding(a, b) {
  return Boolean(a && b) && a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

// Shifted symbols ("?" for Shift+/) already carry the shift in `key`, so a binding
// recorded with Shift+/ matches whatever the layout reports for that press.
function matchesBinding(event, binding) {
  if (isMac ? event.ctrlKey : event.metaKey) return false;
  return sameBinding(bindingFromEvent(event), binding);
}

const KEY_NAMES = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", enter: "↵", backspace: "⌫", delete: "Del", " ": "Space", escape: "Esc", tab: "Tab", home: "Home", end: "End", pageup: "PgUp", pagedown: "PgDn" };

function formatBinding(binding) {
  if (!binding) return t("shortcuts.none");
  const key = KEY_NAMES[binding.key] || (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key.replace(/^./, (c) => c.toUpperCase()));
  if (isMac) return `${binding.alt ? "⌥" : ""}${binding.shift ? "⇧" : ""}${binding.mod ? "⌘" : ""}${key}`;
  return [binding.mod && "Ctrl", binding.alt && "Alt", binding.shift && "Shift", key].filter(Boolean).join("+");
}

function ariaBinding(binding) {
  const key = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
  const parts = [binding.alt && "Alt", binding.shift && "Shift", key].filter(Boolean);
  return binding.mod ? `Meta+${parts.join("+")} Control+${parts.join("+")}` : parts.join("+");
}

// Returns an i18n error key, or "" when the combo is usable.
function bindingProblem(binding, action) {
  if (MODIFIER_KEYS.has(binding.key)) return "pending";
  const plain = !binding.mod && !binding.alt;
  if (plain && !(binding.key.length === 1 && binding.key !== " ") && !/^f\d{1,2}$/.test(binding.key)) return "shortcuts.invalid";
  if (binding.mod && !binding.alt && !binding.shift && RESERVED_MOD_KEYS.has(binding.key)) return "shortcuts.reserved";
  const clash = KEYMAP_ACTIONS.find((other) => other !== action && sameBinding(state.keymap[other], binding));
  if (clash) return { key: "shortcuts.conflict", values: { name: t(`keymap.${clash}`) } };
  return "";
}

let audioContext;
let lastSoundAt = 0;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function getAudioContext() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
  return audioContext;
}

function addTone(ctx, { at = 0, duration = .12, frequency = 440, endFrequency = frequency, gain = .04, type = "sine" }) {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  const start = ctx.currentTime + at;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(.018, duration / 3));
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function addSoftNoise(ctx, { at = 0, duration = .12, gain = .018 } = {}) {
  const sampleCount = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    const fade = 1 - index / sampleCount;
    data[index] = (Math.random() * 2 - 1) * fade;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const envelope = ctx.createGain();
  const start = ctx.currentTime + at;
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter).connect(envelope).connect(ctx.destination);
  source.start(start);
}

function playSound(name, { preview = false } = {}) {
  if (state.sound === "off") return;
  const now = Date.now();
  if (!preview && now - lastSoundAt < 70) return;
  lastSoundAt = now;
  const ctx = getAudioContext();
  if (!ctx) return;
  const render = () => {
    const volume = state.sound === "playful" ? 1.55 : 1;
    const tone = (options) => addTone(ctx, { ...options, gain: (options.gain || .04) * volume });
    const noise = (options = {}) => addSoftNoise(ctx, { ...options, gain: (options.gain || .018) * volume });
    if (name === "save") {
      tone({ frequency: 620, endFrequency: 690, duration: .11, gain: .035 });
      tone({ at: .075, frequency: 880, endFrequency: 940, duration: .16, gain: .028 });
    } else if (name === "later") {
      noise({ duration: .13, gain: .012 });
      tone({ at: .045, frequency: 420, endFrequency: 510, duration: .12, type: "triangle", gain: .027 });
    } else if (name === "complete") {
      tone({ frequency: 390, endFrequency: 620, duration: .13, type: "triangle", gain: .04 });
      tone({ at: .09, frequency: 760, duration: .11, gain: .025 });
      noise({ at: .02, duration: .07, gain: .009 });
    } else if (name === "close") {
      noise({ duration: .18, gain: .035 });
      tone({ frequency: 540, endFrequency: 405, duration: .06, type: "square", gain: .025 });
      tone({ at: .035, frequency: 320, endFrequency: 135, duration: .18, type: "triangle", gain: .055 });
    } else if (name === "bulk") {
      noise({ duration: .28, gain: .036 });
      tone({ frequency: 520, endFrequency: 390, duration: .19, type: "triangle", gain: .052 });
      tone({ at: .07, frequency: 390, endFrequency: 285, duration: .19, type: "triangle", gain: .044 });
      tone({ at: .14, frequency: 285, endFrequency: 175, duration: .22, type: "triangle", gain: .04 });
    } else if (name === "undo") {
      noise({ duration: .1, gain: .009 });
      tone({ frequency: 300, endFrequency: 430, duration: .13, type: "triangle", gain: .028 });
      tone({ at: .09, frequency: 500, endFrequency: 580, duration: .14, gain: .022 });
    } else if (name === "fold") {
      tone({ frequency: 240, endFrequency: 205, duration: .08, type: "triangle", gain: .018 });
    }
  };
  if (ctx.state === "suspended") ctx.resume().then(render).catch(() => {});
  else render();
}

function effectDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, reduceMotion.matches ? 0 : milliseconds));
}

async function animateAndRun(element, className, soundName, milliseconds, action) {
  element?.classList.add(className);
  playSound(soundName);
  await effectDelay(milliseconds);
  return action();
}

function isInCollection(section, item) {
  const wanted = canonicalUrl(item.url);
  return state[section].some((saved) => canonicalUrl(saved.url) === wanted);
}

async function delightAdd(section, item, button) {
  if (isInCollection(section, item)) {
    showToast(t(section === "later" ? "toast.alreadyLater" : "toast.alreadySaved"));
    return;
  }
  button?.classList.add("is-bouncing");
  playSound(section === "later" ? "later" : "save");
  await effectDelay(button ? 150 : 0);
  await addToCollection(section, item);
}

async function animateBulk(section, soundName = "bulk") {
  const cards = [...document.querySelectorAll(`[data-section="${section}"] .site-card`)]
    .filter((card) => section !== "open" || !card.dataset.pinnedOnly);
  cards.forEach((card, index) => {
    card.style.setProperty("--exit-delay", `${Math.min(index * 42, 210)}ms`);
    card.classList.add("is-bulk-exiting");
  });
  playSound(soundName);
  await effectDelay(310 + Math.min(cards.length * 42, 210));
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${name}-icon`);
  svg.append(use);
  return svg;
}

function makeButton({ className, label, tooltip, iconName, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  if (tooltip) button.dataset.tooltip = tooltip;
  button.append(icon(iconName));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
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

// Returns "" rather than a human label — group keys and scoring need a stable value
// that does not change with the language.
function hostFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function displayHostFor(url) {
  return hostFor(url) || t("page.browserPage");
}

function groupKeyFor(url) {
  const host = hostFor(url).toLowerCase();
  if (!host.includes(".")) return host;
  const parts = host.split(".");
  const countrySecondLevels = new Set(["co.uk", "com.cn", "com.au", "co.jp", "com.br", "co.nz"]);
  const lastTwo = parts.slice(-2).join(".");
  return countrySecondLevels.has(lastTwo) && parts.length > 2 ? parts.slice(-3).join(".") : lastTwo;
}

function titleFor(item) {
  return item.title?.trim() || t("page.untitled");
}

/* ---------- For Later ageing ---------- */

const DAY_MS = 86400000;
const AGE_LEVELS = ["fresh", "aging", "wilting", "withered"];

// For Later is a promise to come back. Pages that keep waiting slowly fade so the
// list itself shows what has been put off for too long.
function ageLevel(item) {
  if (!item.addedAt) return "fresh";
  const days = (Date.now() - item.addedAt) / DAY_MS;
  if (days >= 14) return "withered";
  if (days >= 7) return "wilting";
  if (days >= 3) return "aging";
  return "fresh";
}

function isStale(item) {
  return AGE_LEVELS.indexOf(ageLevel(item)) >= 2;
}

function addedLabel(item) {
  if (!item.addedAt) return "";
  const days = Math.max(0, Math.floor((Date.now() - item.addedAt) / DAY_MS));
  const format = new Intl.RelativeTimeFormat(language === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  const when = days < 14 ? format.format(-days, "day")
    : days < 60 ? format.format(-Math.floor(days / 7), "week")
      : format.format(-Math.floor(days / 30), "month");
  return t("age.added", { when });
}

// Tab ids are recycled after a browser restart and single-page apps navigate without
// reloading, so metadata only counts when it was captured for this exact URL.
function metaFor(item) {
  const meta = state.meta[item.tabId ?? item.id];
  if (!meta) return null;
  return !meta.url || canonicalUrl(meta.url) === canonicalUrl(item.url) ? meta : null;
}

// The empty fallback is applied at the display sites, not here, so a placeholder in
// one language never gets baked into storage by snapshot().
function summaryFor(item) {
  const meta = metaFor(item);
  if (item.summary?.trim()) return item.summary.trim();
  if (meta?.summary?.trim()) return meta.summary.trim();
  try {
    const parsed = new URL(item.url);
    const path = decodeURIComponent(parsed.pathname).replace(/[-_/]+/g, " ").trim();
    return path && path !== "/" ? path : parsed.hostname;
  } catch {
    return "";
  }
}

function siteNameFor(item) {
  const meta = metaFor(item);
  return item.siteName?.trim() || meta?.siteName?.trim() || displayHostFor(item.url);
}

function faviconFor(item) {
  const meta = metaFor(item);
  return item.favIconUrl || item.favicon || meta?.favicon || "";
}

// Collection entries always get their own id. Browser tab ids are reused after a restart,
// so using them as collection ids could make one entry's removal delete another.
function snapshot(item) {
  return {
    id: crypto.randomUUID(),
    url: item.url,
    title: item.title?.trim() || "",
    summary: summaryFor(item),
    siteName: siteNameFor(item),
    favicon: faviconFor(item),
    addedAt: item.addedAt || Date.now()
  };
}

function normalizeCollection(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  let changed = false;
  const normalized = list.filter((item) => {
    const keep = Boolean(item?.url);
    if (!keep) changed = true;
    return keep;
  }).map((item) => {
    if (typeof item.id === "string" && !seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    changed = true;
    const id = crypto.randomUUID();
    seen.add(id);
    return { ...item, id };
  });
  return { list: normalized, changed };
}

const AUTO_SLEEP_VALUES = ["off", "60", "240"];
const IDLE_MS = 30 * 60 * 1000;
const COMPOST_EVERY_MS = 7 * DAY_MS;

function normalizeStashes(value) {
  return (Array.isArray(value) ? value : [])
    .filter((stash) => stash && Array.isArray(stash.tabs) && stash.tabs.length)
    .map((stash) => ({ ...stash, id: typeof stash.id === "string" ? stash.id : crypto.randomUUID(), createdAt: Number(stash.createdAt) || Date.now() }));
}

function matches(item) {
  const query = state.query.trim().toLocaleLowerCase();
  if (!query) return true;
  return [titleFor(item), summaryFor(item), siteNameFor(item), item.url]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function currentTabFor(item) {
  if (item.tabId) return state.tabs.find((tab) => tab.id === item.tabId);
  const wanted = canonicalUrl(item.url);
  return state.tabs.find((tab) => canonicalUrl(tab.url) === wanted);
}

function groupItems(items) {
  return items.reduce((groups, item) => {
    const key = groupKeyFor(item.url);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
    return groups;
  }, new Map());
}

function getDemoStore() {
  if (!demoStore) {
    demoStore = {
      later: [
        snapshot({ ...demoTabs[0], summary: demoMeta[101].summary, siteName: "Medium" }),
        { ...snapshot({ url: "https://developer.chrome.com/docs/extensions/develop/concepts/service-workers", title: "Extension service worker basics", summary: "Handle events with an extension service worker.", siteName: "Chrome for Developers", addedAt: Date.now() - 4 * 86400000 }), remindAt: remindOptions()[0].at },
        snapshot({ url: "https://web.dev/articles/inp", title: "Interaction to Next Paint (INP)", summary: "A metric that assesses a page's overall responsiveness.", siteName: "web.dev", addedAt: Date.now() - 9 * 86400000 }),
        snapshot({ url: "https://arxiv.org/abs/1706.03762", title: "Attention Is All You Need", summary: "The Transformer, based solely on attention mechanisms.", siteName: "arXiv", addedAt: Date.now() - 23 * 86400000 })
      ],
      saved: [snapshot({ ...demoTabs[3], summary: demoMeta[104].summary, siteName: "Figma" })],
      stashes: [{
        id: "demo-stash",
        createdAt: Date.now() - 26 * 3600000,
        tabs: [
          { url: "https://www.figma.com/community", title: "Figma Community", siteName: "Figma", favicon: "" },
          { url: "https://dribbble.com/shots/popular", title: "Popular shots", siteName: "Dribbble", favicon: "" },
          { url: "https://fonts.google.com/", title: "Browse Fonts", siteName: "Google Fonts", favicon: "" }
        ]
      }],
      autoSleep: "off",
      compostAt: 0,
      collapsed: { ...state.collapsed },
      theme: "system",
      sound: "subtle",
      language: "system",
      openSort: "manual",
      openOrder: []
    };
  }
  return demoStore;
}

async function storageGet() {
  if (!isExtension) return structuredClone(getDemoStore());
  return chrome.storage.local.get(null);
}

// Writes only the keys that changed, so the dashboard never overwrites pages that
// the background worker added from a shortcut or context menu in the meantime.
async function persist(...keys) {
  const values = {
    later: state.later,
    saved: state.saved,
    collapsed: state.collapsed,
    theme: state.theme,
    sound: state.sound,
    language: state.language,
    openSort: state.openSort,
    openOrder: state.openOrder,
    keymap: state.keymap,
    stashes: state.stashes,
    autoSleep: state.autoSleep,
    compostAt: state.compostAt
  };
  const update = Object.fromEntries(keys.map((key) => [key, values[key]]));
  if (!isExtension) {
    Object.assign(getDemoStore(), structuredClone(update));
    return;
  }
  await chrome.storage.local.set(update);
}

async function loadShortcuts() {
  if (!isExtension || !chrome.commands?.getAll) return;
  try {
    const commands = await chrome.commands.getAll();
    const shortcut = (name) => commands.find((command) => command.name === name)?.shortcut || "";
    state.shortcuts = { open: shortcut("_execute_action"), later: shortcut("keep-for-later"), saved: shortcut("save-page") };
  } catch {
    state.shortcuts = { open: "", later: "", saved: "" };
  }
}

async function loadData({ quiet = false } = {}) {
  const [tabs, stored] = await Promise.all([
    isExtension ? chrome.tabs.query({}) : Promise.resolve(demoTabs),
    storageGet()
  ]);

  const later = normalizeCollection(stored.later);
  const saved = normalizeCollection(stored.saved);

  state.tabs = tabs.filter((tab) => tab.url && !tab.url.startsWith(dashboardUrl));
  state.later = later.list;
  state.saved = saved.list;
  state.collapsed = { ...state.collapsed, ...(stored.collapsed || {}) };
  state.theme = stored.theme || "system";
  state.sound = stored.sound || "subtle";
  state.language = i18n.normalizeLanguage(stored.language);
  state.openSort = ["manual", "count", "recent", "name"].includes(stored.openSort) ? stored.openSort : "manual";
  state.openOrder = Array.isArray(stored.openOrder) ? stored.openOrder.filter((key) => typeof key === "string") : [];
  state.keymap = normalizeKeymap(stored.keymap);
  state.stashes = normalizeStashes(stored.stashes);
  state.autoSleep = AUTO_SLEEP_VALUES.includes(stored.autoSleep) ? stored.autoSleep : "off";
  state.compostAt = Number(stored.compostAt) || 0;
  if (state.selfWindowId === null) {
    const self = isExtension ? await chrome.tabs.getCurrent?.().catch?.(() => null) : { windowId: 1 };
    state.selfWindowId = self?.windowId ?? -1;
  }
  state.meta = isExtension
    ? Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith("meta:")).map(([, value]) => [value.tabId, value]))
    : demoMeta;

  if (later.changed || saved.changed) await persist("later", "saved");

  language = i18n.resolveLanguage(state.language);
  refs.openSort.value = state.openSort;
  applyTheme();
  applyStaticCopy();
  render();
  if (!quiet) showToast(t("toast.refreshed"));
}

function isDarkTheme() {
  return state.theme === "dark" || (state.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

function applyTheme() {
  document.documentElement.dataset.theme = isDarkTheme() ? "dark" : "light";
}

function setCount(section, count) {
  document.querySelector(`#${section}-count`).textContent = count;
  const buttonId = section === "later" ? "complete-all" : section === "open" ? "close-all" : "remove-all";
  document.querySelector(`#${buttonId}`).disabled = count === 0;
}

/* ---------- Focus keeping ---------- */

// Every render rebuilds the cards, which used to drop keyboard focus onto <body>
// after each action. Remember what was focused and put it back — or, when that
// element is gone (the page was closed), on the row that took its place.
function focusSnapshot() {
  const active = document.activeElement;
  const key = active?.dataset?.focusKey;
  if (!key) return null;
  const module = active.closest("[data-section]");
  if (!module) return null;
  const row = active.closest(".page-row");
  const card = active.closest(".site-card");
  return {
    key,
    section: module.dataset.section,
    rowIndex: row ? [...module.querySelectorAll(".page-row")].indexOf(row) : -1,
    cardIndex: card ? [...module.querySelectorAll(".site-card")].indexOf(card) : -1
  };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  const exact = [...document.querySelectorAll("[data-focus-key]")].find((node) => node.dataset.focusKey === snapshot.key);
  if (exact && !exact.disabled) {
    exact.focus({ preventScroll: true });
    return;
  }
  const module = document.querySelector(`.module[data-section="${snapshot.section}"]`);
  if (!module) return;
  const rows = [...module.querySelectorAll(".page-row")];
  const cards = [...module.querySelectorAll(".site-card")];
  const nearest = (list, index) => (index >= 0 && list.length ? list[Math.min(index, list.length - 1)] : null);
  const target = nearest(rows, snapshot.rowIndex)?.querySelector(".page-main")
    || nearest(cards, snapshot.cardIndex)?.querySelector(".page-main")
    || module.querySelector(".collapse");
  target?.focus({ preventScroll: true });
}

function closableTabs(tabs) {
  return tabs.filter((tab) => !tab.pinned);
}

function render() {
  const focus = focusSnapshot();
  const visibleLater = state.later.filter(matches);
  const visibleTabs = state.tabs.filter(matches);
  const visibleSaved = state.saved.filter(matches);
  const windowCount = new Set(state.tabs.map((tab) => tab.windowId)).size;
  state.duplicateIds = new Set(duplicateTabs().map((tab) => tab.id));
  updateBloom();

  setCount("later", state.later.length);
  setCount("open", state.tabs.length);
  setCount("saved", state.saved.length);
  document.querySelector("#open-summary").textContent = t("open.summary", { count: state.tabs.length, windows: windowCount });

  const staleCount = state.later.filter(isStale).length;
  const laterSummary = document.querySelector("#later-summary");
  laterSummary.textContent = staleCount ? t("later.stale", { count: staleCount }) : t("section.later.blurb");
  laterSummary.classList.toggle("is-stale", staleCount > 0);

  const pinnedCount = state.tabs.length - closableTabs(state.tabs).length;
  const closeAllButton = document.querySelector("#close-all");
  closeAllButton.disabled = pinnedCount === state.tabs.length;
  if (pinnedCount) closeAllButton.dataset.tooltip = t("page.pinnedTooltip");
  else delete closeAllButton.dataset.tooltip;

  // Stashing is a For Later gesture now: the trigger only lives there, and it needs
  // at least one window whose tabs can actually be closed.
  const stashable = windowGroups().some(({ tabs }) => closableTabs(tabs).length);
  refs.stashWindow.disabled = !stashable;
  if (stashable) refs.stashWindow.dataset.tooltip = t("stash.tooltip");
  else refs.stashWindow.dataset.tooltip = t("stash.noneTooltip");

  refs.resetOpenOrder.hidden = !(state.openSort === "manual" && state.openOrder.length);

  renderSection("later", visibleLater);
  renderSection("open", visibleTabs);
  renderSection("saved", visibleSaved);

  document.querySelectorAll(".module").forEach((module) => {
    const section = module.dataset.section;
    module.classList.toggle("is-collapsed", state.collapsed[section]);
    module.querySelector(".collapse").setAttribute("aria-expanded", String(!state.collapsed[section]));
  });

  const visibleTotal = visibleLater.length + visibleTabs.length + visibleSaved.length;
  refs.emptySearch.hidden = !state.query || visibleTotal > 0;
  updateUndoUi();
  if (state.palette.open) renderPalette({ keepSelection: true });
  restoreFocus(focus);
}

function recentlyCleared() {
  return !state.later.length && Date.now() - state.celebratedAt < 30 * 60 * 1000;
}

function emptyArt(section) {
  if (section === "later") return recentlyCleared() ? "cleared" : "later";
  return section;
}

function art(name, className = "empty-art") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 64 48");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#art-${name}`);
  svg.append(use);
  return svg;
}

function emptyCopy(section) {
  if (section === "later" && recentlyCleared()) return [t("empty.cleared.title"), t("empty.cleared.copy")];
  if (section === "later") {
    const shortcut = state.shortcuts.later;
    return [t("empty.later.title"), shortcut
      ? t("empty.later.withShortcut", { shortcut })
      : t("empty.later.copy")];
  }
  if (section === "open") return [t("empty.open.title"), t("empty.open.copy")];
  const shortcut = state.shortcuts.saved;
  return [t("empty.saved.title"), shortcut
    ? t("empty.saved.withShortcut", { shortcut })
    : t("empty.saved.copy")];
}

function renderSection(section, items) {
  const container = document.querySelector(`#${section}-content`);
  container.replaceChildren();

  if (section === "open") renderOpenTools(container);
  // The stashed sets sit with the things that were put aside, not with the tabs
  // that are still open — and they stay reachable when For Later is empty.
  if (section === "later") renderStashShelf(container);
  if (section === "later" && items.length) renderCompost(container);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "module-empty";
    empty.dataset.art = emptyArt(section);
    const [title, copy] = emptyCopy(section);
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = copy;
    const wrap = document.createElement("div");
    wrap.append(strong, span);
    // An empty section says one quiet line and nothing else — no illustration to read.
    empty.append(wrap);
    container.append(empty);
    return;
  }

  const groups = [...groupItems(items).entries()];
  const orderedGroups = section === "open" ? sortOpenGroups(groups) : groups;
  orderedGroups.forEach(([groupKey, group]) => container.append(createSiteCard(section, groupKey, group)));
}

function sortOpenGroups(groups) {
  if (state.openSort === "count") {
    return [...groups].sort((a, b) => b[1].length - a[1].length || siteNameFor(a[1][0]).localeCompare(siteNameFor(b[1][0])));
  }
  if (state.openSort === "recent") {
    const latest = (items) => Math.max(...items.map((item) => item.lastAccessed || 0));
    return [...groups].sort((a, b) => latest(b[1]) - latest(a[1]));
  }
  if (state.openSort === "name") {
    return [...groups].sort((a, b) => siteNameFor(a[1][0]).localeCompare(siteNameFor(b[1][0]), undefined, { sensitivity: "base" }));
  }
  const positions = new Map(state.openOrder.map((key, index) => [key, index]));
  return [...groups].sort((a, b) => {
    const aPosition = positions.has(a[0]) ? positions.get(a[0]) : Number.MAX_SAFE_INTEGER;
    const bPosition = positions.has(b[0]) ? positions.get(b[0]) : Number.MAX_SAFE_INTEGER;
    return aPosition - bPosition;
  });
}

function visibleOpenGroupKeys() {
  return [...document.querySelectorAll('#open-content .site-card[data-group-key]')].map((card) => card.dataset.groupKey);
}

async function saveOpenOrder(keys, feedback = t("toast.orderUpdated")) {
  state.openOrder = [...new Set([...keys, ...state.openOrder])];
  state.openSort = "manual";
  refs.openSort.value = "manual";
  await persist("openOrder", "openSort");
  render();
  setFeedback("open", feedback);
  playSound("fold");
}

function moveOpenGroup(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || sourceKey === targetKey || state.query) return;
  const keys = visibleOpenGroupKeys();
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0) return;
  keys.splice(sourceIndex, 1);
  const insertionIndex = keys.indexOf(targetKey) + (sourceIndex < targetIndex ? 1 : 0);
  keys.splice(insertionIndex, 0, sourceKey);
  saveOpenOrder(keys);
}

function moveOpenGroupByStep(groupKey, direction) {
  if (state.query) return;
  const keys = visibleOpenGroupKeys();
  const index = keys.indexOf(groupKey);
  const nextIndex = Math.max(0, Math.min(keys.length - 1, index + direction));
  if (index < 0 || nextIndex === index) return;
  keys.splice(index, 1);
  keys.splice(nextIndex, 0, groupKey);
  saveOpenOrder(keys, t("toast.movedTo", { position: nextIndex + 1 }));
}

function updatePointerDrag(event) {
  const drag = state.pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!state.draggedGroup && distance < 6) return;
  if (!state.draggedGroup) {
    state.draggedGroup = drag.sourceKey;
    document.querySelector(`#open-content .site-card[data-group-key="${CSS.escape(drag.sourceKey)}"]`)?.classList.add("is-dragging");
    document.body.classList.add("is-reordering");
  }
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("#open-content .site-card");
  document.querySelectorAll("#open-content .site-card").forEach((item) => item.classList.toggle("is-drop-target", item === target && item.dataset.groupKey !== drag.sourceKey));
  drag.targetKey = target?.dataset.groupKey || null;
}

function finishPointerDrag(event) {
  const drag = state.pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const targetKey = drag.targetKey;
  state.pointerDrag = null;
  state.draggedGroup = null;
  document.body.classList.remove("is-reordering");
  document.querySelectorAll("#open-content .site-card").forEach((item) => item.classList.remove("is-dragging", "is-drop-target"));
  if (targetKey) moveOpenGroup(drag.sourceKey, targetKey);
}

function faviconNode(className, item) {
  const box = document.createElement("span");
  box.className = className;
  const url = faviconFor(item);
  const fallback = () => { box.textContent = siteNameFor(item).slice(0, 1).toUpperCase(); };
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.addEventListener("error", () => {
      img.remove();
      fallback();
    });
    box.append(img);
  } else {
    fallback();
  }
  return box;
}

function createSiteCard(section, groupKey, items) {
  const expansionKey = `${section}:${groupKey}`;
  const isExpanded = state.expandedGroups.has(expansionKey);
  const visibleItems = isExpanded ? items : items.slice(0, 4);
  const card = document.createElement("article");
  card.className = "site-card";
  card.dataset.groupKey = groupKey;
  if (section === "open" && items.every((item) => item.pinned)) card.dataset.pinnedOnly = "true";
  if (section === "later") {
    // A card fades only as far as its freshest page, so one new page keeps it lively.
    card.dataset.age = AGE_LEVELS[Math.min(...items.map((item) => AGE_LEVELS.indexOf(ageLevel(item))))];
  }
  const header = document.createElement("header");
  header.className = "site-card-header";

  if (section === "open") {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.dataset.focusKey = `handle:${groupKey}`;
    handle.disabled = Boolean(state.query);
    handle.setAttribute("aria-label", t("card.moveAria", { site: siteNameFor(items[0]) }));
    handle.setAttribute("data-tooltip", state.query ? t("card.clearSearchTooltip") : t("card.dragTooltip"));
    handle.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
    handle.addEventListener("pointerdown", (event) => {
      if (state.query || event.button !== 0) return;
      event.preventDefault();
      state.pointerDrag = { sourceKey: groupKey, targetKey: null, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    });
    handle.addEventListener("keydown", (event) => {
      const directions = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
      if (!(event.key in directions)) return;
      event.preventDefault();
      moveOpenGroupByStep(groupKey, directions[event.key]);
    });
    header.append(handle);
  }

  const favicon = faviconNode("site-favicon", items[0]);
  const siteName = document.createElement("span");
  siteName.className = "site-name";
  siteName.textContent = siteNameFor(items[0]);
  const count = document.createElement("span");
  count.className = "site-count";
  count.textContent = items.length;
  count.setAttribute("aria-label", t("card.pageCount", { count: items.length }));

  // The site-level action sits in the card header and stays quiet until the card is
  // hovered or focused, so a wall of cards does not repeat the same button.
  const siteLabel = t(section === "later" ? "site.complete" : section === "open" ? "site.close" : "site.remove");
  const action = makeButton({
    className: `row-action site-action${section === "later" ? "" : " is-destructive"}`,
    label: `${siteLabel} · ${siteNameFor(items[0])}`,
    tooltip: siteLabel,
    iconName: section === "later" ? "check" : section === "open" ? "close-circle" : "trash",
    onClick: (event) => {
      const siteCard = event.currentTarget.closest(".site-card");
      const soundName = section === "later" ? "complete" : "close";
      animateAndRun(siteCard, "is-site-exiting", soundName, 270, () => actOnSite(section, groupKey, items));
    }
  });
  action.dataset.focusKey = `site:${section}:${groupKey}`;

  // Same page open more than once: offer to fold the copies into one, right where
  // the user sees them, instead of hiding it in the command palette.
  const tail = document.createElement("span");
  tail.className = "site-tail";
  const duplicates = section === "open" ? items.filter((item) => state.duplicateIds.has(item.id)) : [];
  if (duplicates.length) {
    const merge = document.createElement("button");
    merge.type = "button";
    merge.className = "dup-chip";
    merge.dataset.focusKey = `dupes:${groupKey}`;
    merge.dataset.tooltip = t("dupes.tooltip");
    merge.setAttribute("aria-label", t("dupes.aria", { count: duplicates.length, site: siteNameFor(items[0]) }));
    const label = document.createElement("span");
    label.textContent = t("dupes.chip", { count: duplicates.length });
    merge.append(icon("copy"), label);
    merge.addEventListener("click", (event) => {
      event.stopPropagation();
      mergeDuplicates(duplicates);
    });
    tail.append(merge);
  }
  tail.append(count);
  header.append(favicon, siteName, tail, action);

  const list = document.createElement("ul");
  list.className = "page-list";
  visibleItems.forEach((item) => list.append(createPageRow(section, item)));
  card.append(header, list);

  if (items.length > 4) {
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "card-expand";
    expand.dataset.focusKey = `expand:${section}:${groupKey}`;
    expand.setAttribute("aria-expanded", String(isExpanded));
    expand.textContent = isExpanded ? t("card.showLess") : t("card.more", { rest: items.length - 4 });
    expand.addEventListener("click", () => {
      if (isExpanded) state.expandedGroups.delete(expansionKey);
      else state.expandedGroups.add(expansionKey);
      render();
    });
    card.append(expand);
  }
  return card;
}

function createPageRow(section, item) {
  const row = document.createElement("li");
  row.className = "page-row";
  if (section === "later") row.dataset.age = ageLevel(item);

  const main = document.createElement("button");
  main.type = "button";
  main.className = "page-main";
  main.dataset.focusKey = `main:${section}:${item.id}`;
  main.setAttribute("aria-label", t("page.openAria", { title: titleFor(item) }));
  const title = document.createElement("span");
  title.className = "page-title";
  title.textContent = titleFor(item);
  const summary = document.createElement("span");
  summary.className = "page-summary";
  summary.textContent = summaryFor(item) || t("page.noSummary");
  main.append(title, summary);

  if (section === "later") {
    const status = document.createElement("span");
    const open = Boolean(currentTabFor(item));
    status.className = `page-status${open ? " is-open" : ""}`;
    const added = addedLabel(item);
    status.textContent = [t(open ? "page.open" : "page.closed"), added].filter(Boolean).join(" · ");
    main.append(status);
    const reminder = reminderLabel(item);
    if (reminder) {
      const note = document.createElement("span");
      note.className = `page-reminder${item.remindAt ? "" : " is-due"}`;
      note.textContent = reminder;
      status.append(note);
      row.dataset.reminder = item.remindAt ? "set" : "due";
    }
  } else if (section === "open" && (item.pinned || item.discarded)) {
    const status = document.createElement("span");
    status.className = `page-status${item.pinned ? " is-pinned" : ""}${item.discarded ? " is-sleeping" : ""}`;
    status.textContent = [item.pinned && t("page.pinned"), item.discarded && t("page.sleeping")].filter(Boolean).join(" · ");
    main.append(status);
    if (item.discarded) row.classList.add("is-sleeping");
  }
  main.addEventListener("click", () => openItem(item));

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(makeButton({ className: "row-action", label: t("page.openAria", { title: titleFor(item) }), tooltip: t("action.openPage"), iconName: "external", onClick: () => openItem(item) }));

  if (section === "open") {
    const isLater = isInCollection("later", item);
    const isSaved = isInCollection("saved", item);
    actions.append(
      makeButton({ className: `row-action${isLater ? " is-active" : ""}`, label: t("action.keepForLater"), tooltip: t(isLater ? "action.alreadyLater" : "action.keepForLater"), iconName: "clock", onClick: (event) => delightAdd("later", item, event.currentTarget) }),
      makeButton({ className: `row-action${isSaved ? " is-active" : ""}`, label: t("action.savePage"), tooltip: t(isSaved ? "action.alreadySaved" : "action.savePage"), iconName: "bookmark", onClick: (event) => delightAdd("saved", item, event.currentTarget) }),
      makeButton({ className: "row-action is-destructive", label: t("action.closeTab"), tooltip: t("action.closeTab"), iconName: "x", onClick: (event) => animateAndRun(event.currentTarget.closest(".page-row"), "is-closing", "close", 210, () => closeTabs([item])) })
    );
  } else if (section === "later") {
    const isSaved = isInCollection("saved", item);
    actions.append(
      makeButton({ className: `row-action remind-button${item.remindAt ? " is-active" : ""}`, label: item.remindAt ? t("remind.setAria", { when: formatWhen(item.remindAt) }) : t("action.remind"), tooltip: item.remindAt ? t("remind.status", { when: formatWhen(item.remindAt) }) : t("action.remind"), iconName: "bell", onClick: (event) => openRemindMenu(item, event.currentTarget) }),
      makeButton({ className: "row-action is-active", label: t("action.markDone"), tooltip: t("action.markDone"), iconName: "check", onClick: (event) => animateAndRun(event.currentTarget.closest(".page-row"), "is-completing", "complete", 250, () => removeCollectionItems("later", [item], t("toast.done"))) }),
      makeButton({ className: `row-action${isSaved ? " is-active" : ""}`, label: t("action.savePage"), tooltip: t(isSaved ? "action.alreadySaved" : "action.savePage"), iconName: "bookmark", onClick: (event) => delightAdd("saved", item, event.currentTarget) })
    );
  } else {
    actions.append(makeButton({ className: "row-action is-destructive", label: t("action.removeSaved"), tooltip: t("action.remove"), iconName: "trash", onClick: (event) => animateAndRun(event.currentTarget.closest(".page-row"), "is-removing", "close", 210, () => removeCollectionItems("saved", [item], t("toast.removedSaved"))) }));
  }

  [...actions.children].forEach((button, index) => { button.dataset.focusKey = `action:${section}:${item.id}:${index}`; });
  row.append(main, actions);
  return row;
}

async function openItem(item) {
  if (!isExtension) return showToast(t("toast.demoOpen", { title: titleFor(item) }));
  const tab = currentTabFor(item);
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    await chrome.tabs.create({ url: item.url });
  }
}

/* ---------- Undo ---------- */

function setUndo(section, operation) {
  state.undo[section] = operation;
  state.undoOrder = [...state.undoOrder.filter((name) => name !== section), section];
  updateUndoUi();
}

function clearUndo(section) {
  state.undo[section] = null;
  state.undoOrder = state.undoOrder.filter((name) => name !== section);
  updateUndoUi();
}

async function addToCollection(section, item) {
  if (isInCollection(section, item)) {
    showToast(t(section === "later" ? "toast.alreadyLater" : "toast.alreadySaved"));
    return;
  }
  const entry = snapshot({ ...item, tabId: item.id });
  state[section] = [entry, ...state[section]];
  setUndo(section, { type: "discard", ids: [entry.id] });
  await persist(section);
  render();
  showToast(t(section === "later" ? "toast.kept" : "toast.saved"), { undoSection: section });
}

async function removeCollectionItems(section, items, feedback) {
  const ids = new Set(items.map((item) => item.id));
  const removed = state[section].filter((item) => ids.has(item.id));
  if (!removed.length) return;
  state[section] = state[section].filter((item) => !ids.has(item.id));
  setUndo(section, { type: "restore", items: removed });
  await persist(section);
  setFeedback(section, feedback);
  if (section === "later" && !state.later.length) state.celebratedAt = Date.now();
  render();
  showToast(feedback, { undoSection: section });
}

// Bulk closes (a whole site, Close all) leave pinned tabs alone; closing a single
// pinned row is an explicit choice and still works.
async function closeTabs(items, feedback, { skipPinned = false } = {}) {
  const matched = items.map((item) => state.tabs.find((tab) => tab.id === item.id)).filter(Boolean);
  const liveTabs = skipPinned ? closableTabs(matched) : matched;
  const keptPinned = matched.length - liveTabs.length;
  if (!liveTabs.length) {
    if (keptPinned) showToast(t("toast.pinnedKept"));
    return;
  }
  setUndo("open", { type: "reopen", items: liveTabs.map((tab) => ({ url: tab.url, title: titleFor(tab) })) });
  if (isExtension) await chrome.tabs.remove(liveTabs.map((tab) => tab.id));
  else liveTabs.forEach((closed) => demoTabs.splice(demoTabs.findIndex((tab) => tab.id === closed.id), 1));
  const message = feedback || (keptPinned
    ? t("toast.tabsClosedPinned", { count: liveTabs.length, pinned: keptPinned })
    : t("toast.tabsClosed", { count: liveTabs.length }));
  setFeedback("open", message);
  await loadData({ quiet: true });
  showToast(message, { undoSection: "open" });
}

// Prefer chrome.sessions so reopened tabs keep their back/forward history and land in
// their original window. Anything the browser no longer remembers is reopened by URL.
async function reopenTabs(items) {
  if (!isExtension) {
    items.forEach((item, index) => demoTabs.push({ ...item, id: Date.now() + index, windowId: 1, lastAccessed: Date.now() }));
    return;
  }

  const pending = items.map((item) => ({ key: canonicalUrl(item.url), url: item.url }));
  const takePending = (key) => {
    const index = pending.findIndex((item) => item.key === key);
    if (index >= 0) pending.splice(index, 1);
    return index >= 0;
  };

  if (chrome.sessions?.getRecentlyClosed) {
    try {
      const entries = await chrome.sessions.getRecentlyClosed({ maxResults: chrome.sessions.MAX_SESSION_RESULTS || 25 });
      for (const entry of entries) {
        if (!pending.length) break;
        const closedTabs = entry.tab ? [entry.tab] : entry.window?.tabs || [];
        const keys = closedTabs.map((tab) => canonicalUrl(tab.url));
        const remaining = pending.map((item) => item.key);
        // Only restore a whole window when every tab in it was part of this undo.
        const allWanted = keys.length && keys.every((key) => {
          const index = remaining.indexOf(key);
          if (index < 0) return false;
          remaining.splice(index, 1);
          return true;
        });
        if (!allWanted) continue;
        await chrome.sessions.restore(entry.tab?.sessionId || entry.window?.sessionId);
        keys.forEach(takePending);
      }
    } catch {
      // Fall through to URL reopening for anything left.
    }
  }

  for (const item of pending) await chrome.tabs.create({ url: item.url, active: false });

  // sessions.restore focuses the restored tab; bring Tabloom back to the front.
  const self = await chrome.tabs.getCurrent?.();
  if (self) {
    await chrome.windows.update(self.windowId, { focused: true });
    await chrome.tabs.update(self.id, { active: true });
  }
}

async function actOnSite(section, _groupKey, items) {
  if (section === "open") await closeTabs(items, undefined, { skipPinned: true });
  else await removeCollectionItems(section, items, t(section === "later" ? "toast.siteDone" : "toast.siteRemoved"));
}

// The toast is the single place that announces what happened; sections only keep a
// compact Undo chip next to their bulk action while that section can be undone.
function setFeedback(_section, _message) {
  updateUndoUi();
}

function updateUndoUi() {
  document.querySelectorAll("[data-undo]").forEach((button) => {
    button.hidden = !state.undo[button.dataset.undo];
  });
  if (state.toastUndoSection && !state.undo[state.toastUndoSection]) refs.toastUndo.hidden = true;
}

async function undo(section) {
  const operation = state.undo[section];
  if (!operation) return;
  clearUndo(section);

  if (operation.type === "restore") {
    const existing = new Set(state[section].map((item) => item.id));
    state[section] = [...operation.items.filter((item) => !existing.has(item.id)), ...state[section]];
    await persist(section);
  } else if (operation.type === "discard") {
    const ids = new Set(operation.ids);
    state[section] = state[section].filter((item) => !ids.has(item.id));
    await persist(section);
  } else if (operation.type === "reopen") {
    await reopenTabs(operation.items);
  } else if (operation.type === "unstash") {
    state.stashes = state.stashes.filter((stash) => stash.id !== operation.stashId);
    await persist("stashes");
    await reopenTabs(operation.items);
  } else if (operation.type === "restoreStash") {
    if (!state.stashes.some((stash) => stash.id === operation.stash.id)) {
      state.stashes = [...state.stashes, operation.stash].sort((a, b) => b.createdAt - a.createdAt);
      await persist("stashes");
    }
  } else if (operation.type === "move") {
    const existing = new Set(state.later.map((item) => item.id));
    const movedIds = new Set(operation.savedIds);
    state.later = [...operation.items.filter((item) => !existing.has(item.id)), ...state.later];
    state.saved = state.saved.filter((item) => !movedIds.has(item.id));
    await persist("later", "saved");
  }

  setFeedback(section, t("toast.undone"));
  await loadData({ quiet: true });
  if (operation.type !== "discard") {
    document.querySelectorAll(`[data-section="${section}"] .site-card`).forEach((card, index) => {
      card.style.animationDelay = `${Math.min(index * 35, 140)}ms`;
      card.classList.add("is-restoring");
    });
  }
  playSound("undo");
  const reopened = operation.type === "reopen" || operation.type === "unstash";
  showToast(reopened ? t("toast.reopened", { count: operation.items.length }) : t("toast.undone"));
}

function undoLatest() {
  const section = state.undoOrder.at(-1);
  if (section) undo(section);
  else showToast(t("toast.nothingToUndo"));
}

function askConfirmation({ title, copy, confirmLabel }) {
  refs.dialogTitle.textContent = title;
  refs.dialogCopy.textContent = copy;
  refs.dialogConfirm.textContent = confirmLabel;
  refs.dialog.showModal();
  return new Promise((resolve) => {
    refs.dialog.addEventListener("close", () => resolve(refs.dialog.returnValue === "confirm"), { once: true });
  });
}

// Clearing For Later or Saved only touches Tabloom's own lists and Undo restores them
// exactly, so those run straight away. Closing tabs still asks: a restored tab can
// lose form input and scroll position, so it is not a perfect undo.
async function completeAll() {
  if (!state.later.length) return;
  const count = state.later.length;
  await animateBulk("later");
  await removeCollectionItems("later", [...state.later], t("toast.pagesCompleted", { count }));
}

async function closeAll() {
  const tabs = closableTabs(state.tabs);
  if (!tabs.length) {
    if (state.tabs.length) showToast(t("toast.pinnedKept"));
    return;
  }
  const pinned = state.tabs.length - tabs.length;
  const copy = pinned
    ? t("confirm.closeAll.copyPinned", { count: tabs.length, pinned })
    : t("confirm.closeAll.copy", { count: tabs.length });
  const confirmed = await askConfirmation({ title: t("confirm.closeAll.title"), copy, confirmLabel: t("confirm.closeAll.confirm") });
  if (confirmed) {
    await animateBulk("open");
    await closeTabs([...state.tabs], undefined, { skipPinned: true });
  }
}

async function removeAll() {
  if (!state.saved.length) return;
  const count = state.saved.length;
  await animateBulk("saved");
  await removeCollectionItems("saved", [...state.saved], t("toast.savedRemoved", { count }));
}

/* ---------- Toast ---------- */

let toastTimer;
function hideToastLater(milliseconds) {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("is-visible"), milliseconds);
}

function showToast(message, { undoSection = null } = {}) {
  refs.toastMessage.textContent = message;
  state.toastUndoSection = undoSection;
  refs.toastUndo.hidden = !undoSection;
  refs.toast.classList.add("is-visible");
  hideToastLater(undoSection ? 6000 : 2200);
}

/* ---------- Command palette ---------- */

function duplicateTabs() {
  const byUrl = new Map();
  state.tabs.forEach((tab) => {
    const key = canonicalUrl(tab.url);
    byUrl.set(key, [...(byUrl.get(key) || []), tab]);
  });
  // Keep the active, pinned or most recently used copy; never close pinned tabs.
  return [...byUrl.values()].flatMap((copies) => copies.length < 2 ? [] : [...copies]
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.pinned) - Number(a.pinned) || (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .slice(1)
    .filter((tab) => !tab.pinned));
}

async function mergeDuplicates(duplicates) {
  playSound("close");
  await closeTabs(duplicates, t("toast.duplicatesClosed", { count: duplicates.length }));
}

/* ---------- Windows: stash & sleep ---------- */

function windowGroups() {
  const byWindow = new Map();
  state.tabs.forEach((tab) => byWindow.set(tab.windowId, [...(byWindow.get(tab.windowId) || []), tab]));
  return [...byWindow.entries()]
    .sort(([a], [b]) => (a === state.selfWindowId ? -1 : b === state.selfWindowId ? 1 : a - b))
    .map(([windowId, tabs], index) => ({ windowId, tabs, label: windowId === state.selfWindowId ? t("window.this") : t("window.label", { n: index + 1 }) }));
}

function stashTitle(stash) {
  const names = [...new Set(stash.tabs.map((tab) => tab.siteName || displayHostFor(tab.url)))];
  return names.length > 2
    ? t("stash.titleMore", { names: names.slice(0, 2).join(", "), rest: names.length - 2, total: names.length })
    : names.join(", ");
}

function timeAgo(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  const format = new Intl.RelativeTimeFormat(language === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 48 * 60) return format.format(-Math.round(minutes / 60), "hour");
  return format.format(-Math.round(minutes / 1440), "day");
}

function miniFavicons(items) {
  const wrap = document.createElement("span");
  wrap.className = "mini-favicons";
  const seen = new Set();
  items.filter((item) => {
    const key = groupKeyFor(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3).forEach((item) => wrap.append(faviconNode("mini-favicon", item)));
  return wrap;
}

function textButton({ className = "", label, text = label, iconName, focusKey, tooltip, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `text-button ${className}`.trim();
  if (focusKey) button.dataset.focusKey = focusKey;
  if (tooltip) button.dataset.tooltip = tooltip;
  if (iconName) button.append(icon(iconName));
  const span = document.createElement("span");
  span.textContent = text;
  button.append(span);
  if (label && label !== text) button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

// Open Tabs keeps only the sleep shortcut: whole windows are put aside from the
// For Later side of the dashboard, where the stashed sets end up.
function renderOpenTools(container) {
  if (state.query) return;
  const tools = document.createElement("div");
  tools.className = "open-tools";

  const idle = idleTabs();
  if (idle.length) {
    tools.append(textButton({
      className: "sleep-button",
      label: t("sleep.action", { count: idle.length }),
      text: t("sleep.chip"),
      iconName: "moon",
      focusKey: "sleep-idle",
      tooltip: t("sleep.tooltip"),
      onClick: () => sleepTabs(idleTabs())
    }));
  }

  if (tools.children.length) container.append(tools);
}

// The windows stashed earlier, listed at the top of For Later: restore one, or
// let it go. Restoring opens the set in its own new window.
function renderStashShelf(container) {
  if (state.query || !state.stashes.length) return;
  const list = document.createElement("ul");
  list.className = "stash-list";
  list.setAttribute("aria-label", t("stash.listLabel"));
  state.stashes.forEach((stash) => {
    const row = document.createElement("li");
    row.className = "stash-chip";
    row.dataset.stashId = stash.id;
    const copy = document.createElement("span");
    copy.className = "stash-copy";
    const title = document.createElement("strong");
    title.textContent = stashTitle(stash);
    const meta = document.createElement("span");
    meta.textContent = t("stash.meta", { count: stash.tabs.length, when: timeAgo(stash.createdAt) });
    copy.append(title, meta);
    const restore = textButton({
      className: "restore-button",
      label: t("stash.restore"),
      iconName: "restore",
      focusKey: `restore:${stash.id}`,
      tooltip: t("stash.restoreTooltip"),
      onClick: () => restoreStash(stash.id)
    });
    const remove = makeButton({ className: "row-action is-destructive", label: t("stash.delete"), tooltip: t("stash.delete"), iconName: "x", onClick: () => deleteStash(stash.id) });
    remove.dataset.focusKey = `unstash:${stash.id}`;
    row.append(miniFavicons(stash.tabs), copy, restore, remove);
    list.append(row);
  });
  container.append(list);
}

async function stashWindow(windowId) {
  const tabs = closableTabs(state.tabs.filter((tab) => tab.windowId === windowId));
  if (!tabs.length) {
    showToast(t("toast.pinnedKept"));
    return;
  }
  const stash = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    tabs: tabs.map((tab) => ({ url: tab.url, title: tab.title?.trim() || "", siteName: siteNameFor(tab), favicon: faviconFor(tab) }))
  };
  state.stashes = [stash, ...state.stashes];
  await persist("stashes");
  setUndo("open", { type: "unstash", stashId: stash.id, items: tabs.map((tab) => ({ url: tab.url, title: titleFor(tab) })) });
  playSound("bulk");
  if (isExtension) await chrome.tabs.remove(tabs.map((tab) => tab.id));
  else tabs.forEach((closed) => demoTabs.splice(demoTabs.findIndex((tab) => tab.id === closed.id), 1));
  await loadData({ quiet: true });
  showToast(t("toast.stashed", { count: tabs.length }), { undoSection: "open" });
}

async function restoreStash(id) {
  const stash = state.stashes.find((entry) => entry.id === id);
  if (!stash) return;
  state.stashes = state.stashes.filter((entry) => entry.id !== id);
  await persist("stashes");
  playSound("undo");
  if (isExtension) {
    await chrome.windows.create({ url: stash.tabs.map((tab) => tab.url), focused: true });
  } else {
    const windowId = Math.max(0, ...demoTabs.map((tab) => tab.windowId)) + 1;
    stash.tabs.forEach((tab, index) => demoTabs.push({ ...tab, favIconUrl: tab.favicon, id: Date.now() + index, windowId, active: index === 0, lastAccessed: Date.now() }));
  }
  await loadData({ quiet: true });
  showToast(t("toast.stashRestored", { count: stash.tabs.length }));
}

async function deleteStash(id) {
  const stash = state.stashes.find((entry) => entry.id === id);
  if (!stash) return;
  state.stashes = state.stashes.filter((entry) => entry.id !== id);
  setUndo("open", { type: "restoreStash", stash });
  playSound("close");
  await persist("stashes");
  render();
  showToast(t("toast.stashDeleted"), { undoSection: "open" });
}

// Tabs the browser may safely unload: not in front, not playing sound, not pinned,
// web pages only. Discarded tabs keep their place and reload when clicked.
function idleTabs(threshold = IDLE_MS) {
  const now = Date.now();
  return state.tabs.filter((tab) => !tab.active && !tab.discarded && !tab.pinned && !tab.audible
    && tab.autoDiscardable !== false && /^https?:/.test(tab.url || "")
    && tab.lastAccessed && now - tab.lastAccessed >= threshold);
}

async function sleepTabs(tabs) {
  if (!tabs.length) {
    showToast(t("toast.nothingToSleep"));
    return;
  }
  let count = 0;
  if (isExtension && chrome.tabs.discard) {
    for (const tab of tabs) {
      try {
        if (await chrome.tabs.discard(tab.id)) count += 1;
      } catch {
        // The browser refused (e.g. the tab is busy); leave it awake.
      }
    }
  } else {
    tabs.forEach((tab) => {
      const demo = demoTabs.find((entry) => entry.id === tab.id);
      if (demo) { demo.discarded = true; count += 1; }
    });
  }
  playSound("fold");
  await loadData({ quiet: true });
  showToast(count ? t("toast.slept", { count }) : t("toast.nothingToSleep"));
}

/* ---------- Reminders ---------- */

function atHour(date, hour) {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next.getTime();
}

function remindOptions(now = new Date()) {
  const options = [];
  if (now.getHours() < 18) options.push({ key: "remind.tonight", at: atHour(now, 20) });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  options.push({ key: "remind.tomorrow", at: atHour(tomorrow, 9) });
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  const mondayAt = atHour(monday, 9);
  if (mondayAt !== options.at(-1).at) options.push({ key: "remind.monday", at: mondayAt });
  return options;
}

function formatWhen(at) {
  const locale = language === "zh" ? "zh-CN" : "en";
  const date = new Date(at);
  const startOfDay = (value) => { const day = new Date(value); day.setHours(0, 0, 0, 0); return day.getTime(); };
  const dayDiff = Math.round((startOfDay(date) - startOfDay(Date.now())) / DAY_MS);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  const day = Math.abs(dayDiff) <= 1
    ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(dayDiff, "day")
    : new Intl.DateTimeFormat(locale, dayDiff > 6 ? { month: "short", day: "numeric" } : { weekday: "short" }).format(date);
  return `${day} ${time}`;
}

function reminderLabel(item) {
  if (item.remindAt) return t("remind.status", { when: formatWhen(item.remindAt) });
  if (item.remindedAt && Date.now() - item.remindedAt < 3 * DAY_MS) return t("remind.due");
  return "";
}

function withReminder(item, at) {
  const { remindAt: _remindAt, remindedAt: _remindedAt, ...rest } = item;
  return at ? { ...rest, remindAt: at } : rest;
}

async function setReminder(item, at) {
  state.later = state.later.map((entry) => (entry.id === item.id ? withReminder(entry, at) : entry));
  await persist("later");
  playSound(at ? "later" : "fold");
  render();
  showToast(at ? t("toast.reminderSet", { when: formatWhen(at) }) : t("toast.reminderCleared"));
}

// One fixed-position popover serves two jobs: picking a reminder time for a page,
// and picking which window to stash. Both anchor to the button that opened them.
// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the user's own time zone.
function localDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function placeMenu(menu, button, width = 240) {
  const rect = button.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = `${Math.round(rect.bottom + 6)}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 12)))}px`;
  button.setAttribute("aria-expanded", "true");
}

function openRemindMenu(item, button) {
  const menu = refs.remindMenu;
  if (state.remindMenu?.kind === "remind" && state.remindMenu.item.id === item.id) {
    closeRemindMenu();
    return;
  }
  closeRemindMenu({ restoreFocus: false });
  menu.replaceChildren();
  menu.dataset.i18nLabel = "remind.menu";
  menu.setAttribute("aria-label", t("remind.menu"));
  const heading = document.createElement("p");
  heading.className = "remind-heading";
  heading.textContent = t("remind.menu");
  menu.append(heading);
  const options = remindOptions().map(({ key, at }) => ({ label: t(key), detail: formatWhen(at), run: () => setReminder(item, at) }));
  if (item.remindAt || item.remindedAt) options.push({ label: t("remind.clear"), detail: "", run: () => setReminder(item, null), danger: true });
  options.forEach(({ label, detail, run, danger }) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `remind-option${danger ? " is-danger" : ""}`;
    option.setAttribute("role", "menuitem");
    const name = document.createElement("span");
    name.textContent = label;
    option.append(name);
    if (detail) {
      const small = document.createElement("small");
      small.textContent = detail;
      option.append(small);
    }
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      closeRemindMenu();
      run();
    });
    menu.append(option);
  });

  // Three quick choices cover most of it; anything else gets an exact date and time.
  const custom = document.createElement("div");
  custom.className = "remind-custom";
  const customLabel = document.createElement("label");
  customLabel.className = "remind-custom-label";
  customLabel.textContent = t("remind.custom");
  const input = document.createElement("input");
  input.type = "datetime-local";
  const startAt = item.remindAt && item.remindAt > Date.now() ? item.remindAt : Date.now() + 60 * 60 * 1000;
  input.value = localDateTimeValue(startAt);
  input.min = localDateTimeValue(Date.now());
  input.className = "remind-custom-input";
  input.setAttribute("aria-label", t("remind.customAria"));
  customLabel.append(input);
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "remind-custom-apply";
  apply.textContent = t("remind.customApply");
  const submit = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const at = new Date(input.value).getTime();
    if (!Number.isFinite(at)) {
      input.focus();
      return;
    }
    closeRemindMenu({ restoreFocus: false });
    setReminder(item, at);
  };
  apply.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit(event);
  });
  custom.append(customLabel, apply);
  menu.append(custom);

  placeMenu(menu, button);
  state.remindMenu = { kind: "remind", item, button };
  menu.querySelector(".remind-option")?.focus();
}

// Pick the window to put aside. One window per gesture — never "everything at
// once" — because stashing means "this is a project I am pausing right now".
function openStashMenu(button) {
  const menu = refs.remindMenu;
  if (state.remindMenu?.kind === "stash") {
    closeRemindMenu();
    return;
  }
  closeRemindMenu({ restoreFocus: false });
  menu.replaceChildren();
  menu.dataset.i18nLabel = "stash.pickLabel";
  menu.setAttribute("aria-label", t("stash.pickLabel"));

  const heading = document.createElement("p");
  heading.className = "remind-heading";
  heading.textContent = t("stash.pickTitle");
  menu.append(heading);

  const groups = windowGroups();
  groups.forEach(({ windowId, tabs, label }) => {
    const stashable = closableTabs(tabs).length;
    const option = document.createElement("button");
    option.type = "button";
    option.className = "remind-option stash-option";
    option.dataset.focusKey = `stash:${windowId}`;
    option.setAttribute("role", "menuitem");
    option.setAttribute("aria-label", t("stash.aria", { label, count: stashable }));
    const name = document.createElement("span");
    name.textContent = label;
    const detail = document.createElement("small");
    detail.textContent = stashable
      ? t("stash.optionMeta", { count: stashable })
      : t("stash.optionPinned");
    option.append(miniFavicons(tabs), name, detail);
    option.disabled = !stashable;
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      closeRemindMenu({ restoreFocus: false });
      stashWindow(windowId);
    });
    menu.append(option);
  });

  const note = document.createElement("p");
  note.className = "stash-note";
  note.textContent = t("stash.pickNote");
  menu.append(note);

  placeMenu(menu, button, 252);
  state.remindMenu = { kind: "stash", button };
  menu.querySelector(".stash-option:not(:disabled)")?.focus();
}

function closeRemindMenu({ restoreFocus = true } = {}) {
  if (!state.remindMenu) return;
  const { button } = state.remindMenu;
  state.remindMenu = null;
  refs.remindMenu.hidden = true;
  button?.setAttribute("aria-expanded", "false");
  if (restoreFocus && button?.isConnected) button.focus();
}

function handleRemindMenuKeydown(event) {
  // The date-time field keeps its own segment navigation; only Escape leaves it.
  if (event.key !== "Escape" && event.target.closest?.(".remind-custom")) return;
  const options = [...refs.remindMenu.querySelectorAll(".remind-option:not(:disabled)")];
  const index = options.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeRemindMenu();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    options[(index + step + options.length) % options.length]?.focus();
  } else if (event.key === "Tab") {
    closeRemindMenu({ restoreFocus: false });
  }
}

/* ---------- Compost ---------- */

function compostCandidates() {
  return state.later.filter((item) => ageLevel(item) === "withered");
}

function shouldCompost() {
  return !state.query && compostCandidates().length > 0
    && (state.compostForced || Date.now() - state.compostAt >= COMPOST_EVERY_MS);
}

// Once a week, pages that have waited two weeks or more get one gentle question:
// keep them for good, or let them go. Either way the list gets lighter.
function renderCompost(container) {
  if (!shouldCompost()) return;
  const items = compostCandidates();
  const box = document.createElement("div");
  box.className = "compost";
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", t("compost.aria"));
  const copy = document.createElement("div");
  copy.className = "compost-copy";
  const title = document.createElement("strong");
  title.textContent = t("compost.title", { count: items.length });
  const text = document.createElement("span");
  text.textContent = t("compost.copy");
  copy.append(title, text);
  const actions = document.createElement("div");
  actions.className = "compost-actions";
  actions.append(
    textButton({ className: "compost-save", label: t("compost.save"), iconName: "bookmark", focusKey: "compost:save", onClick: () => compostToSaved() }),
    textButton({ className: "compost-clear", label: t("compost.clear"), iconName: "leaf", focusKey: "compost:clear", onClick: () => compostClear() }),
    textButton({ className: "compost-later", label: t("compost.snooze"), focusKey: "compost:snooze", onClick: () => compostSnooze() })
  );
  box.append(art("compost", "compost-art"), copy, actions);
  container.append(box);
}

async function markComposted() {
  state.compostAt = Date.now();
  state.compostForced = false;
  await persist("compostAt");
}

async function compostToSaved() {
  const items = compostCandidates();
  if (!items.length) return;
  const added = items.filter((item) => !isInCollection("saved", item)).map((item) => ({ ...withReminder(item, null), id: crypto.randomUUID() }));
  const ids = new Set(items.map((item) => item.id));
  state.saved = [...added, ...state.saved];
  state.later = state.later.filter((item) => !ids.has(item.id));
  setUndo("later", { type: "move", items, savedIds: added.map((item) => item.id) });
  await markComposted();
  await persist("later", "saved");
  playSound("save");
  if (!state.later.length) state.celebratedAt = Date.now();
  render();
  showToast(t("toast.compostSaved", { count: items.length }), { undoSection: "later" });
}

async function compostClear() {
  const items = compostCandidates();
  if (!items.length) return;
  await markComposted();
  await animateBulk("later", "complete");
  await removeCollectionItems("later", items, t("toast.compostCleared", { count: items.length }));
}

async function compostSnooze() {
  await markComposted();
  playSound("fold");
  render();
  showToast(t("toast.compostSnoozed"));
}

/* ---------- Bloom ---------- */

// The header flower mirrors how crowded the browser is: wide open while the tab count is
// comfortable, slowly wilting from BLOOM_WILT_FROM tabs, and folded shut by the time the
// count reaches BLOOM_CLOSED_AT. The visual is a continuous 0..1 progress rather than a
// few steps, so every tab that closes nudges the petals a little further open.
const BLOOM_WILT_FROM = 15;
const BLOOM_CLOSED_AT = 30;

function bloomProgress(count) {
  const raw = Math.max(0, Math.min(1, (count - BLOOM_WILT_FROM) / (BLOOM_CLOSED_AT - BLOOM_WILT_FROM)));
  return raw * raw * (3 - 2 * raw);
}

// Three plain words for the tooltip; the petals themselves follow bloomProgress().
function bloomState(count) {
  if (count >= BLOOM_CLOSED_AT) return "closed";
  if (count > BLOOM_WILT_FROM) return "droop";
  return "open";
}

function updateBloom() {
  if (!refs.brandMark) return;
  const count = state.tabs.length;
  refs.brandMark.style.setProperty("--bloom", bloomProgress(count).toFixed(3));
  refs.brandMark.dataset.bloom = bloomState(count);
  refs.brand.dataset.tooltip = t(`bloom.${bloomState(count)}`, { count });
}

function searchTerms(text) {
  return text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function scorePage(item, terms) {
  if (!terms.length) return 1;
  const title = titleFor(item).toLocaleLowerCase();
  const site = `${siteNameFor(item)} ${hostFor(item.url)}`.toLocaleLowerCase();
  const rest = `${summaryFor(item)} ${item.url}`.toLocaleLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.startsWith(term)) score += 8;
    else if (title.includes(` ${term}`)) score += 6;
    else if (title.includes(term)) score += 5;
    else if (site.split(/\s+/).some((word) => word.startsWith(term))) score += 4;
    else if (site.includes(term)) score += 3;
    else if (rest.includes(term)) score += 1;
    else return 0;
  }
  return score;
}

function soundToast() {
  return state.sound === "off"
    ? t("toast.soundsOff")
    : t("toast.soundOn", { label: t(`sound.${state.sound}`) });
}

function shortcutsHint() {
  const { later, saved } = state.shortcuts;
  if (later && saved) return t("cmd.shortcuts.hint", { later, saved });
  return t("cmd.shortcuts.hintEmpty");
}

function paletteCommands(terms) {
  const duplicates = duplicateTabs();
  const idleCount = idleTabs().length;
  const allCollapsed = Object.values(state.collapsed).every(Boolean);
  const commands = [];

  if (terms.length) {
    const groups = [...groupItems(state.tabs).entries()]
      .filter(([key, tabs]) => terms.every((term) => `${key} ${siteNameFor(tabs[0])}`.toLocaleLowerCase().includes(term)))
      .slice(0, 3);
    groups.forEach(([key, tabs]) => commands.push({
      id: `close-group:${key}`,
      title: t("cmd.groupClose.title", { count: tabs.length, site: siteNameFor(tabs[0]) }),
      hint: t("cmd.groupClose.hint"),
      icon: "x",
      destructive: true,
      keywords: "",
      always: true,
      run: () => { playSound("close"); return closeTabs(tabs, undefined, { skipPinned: true }); }
    }));
  }

  commands.push(
    {
      id: "duplicates",
      title: duplicates.length ? t("cmd.duplicates.title", { count: duplicates.length }) : t("cmd.duplicates.titleEmpty"),
      hint: t(duplicates.length ? "cmd.duplicates.hint" : "cmd.duplicates.hintEmpty"),
      icon: "copy",
      keywords: t("cmd.duplicates.keywords"),
      disabled: !duplicates.length,
      run: () => mergeDuplicates(duplicates)
    },
    ...windowGroups().slice(0, 4).map(({ windowId, tabs, label }) => {
      const stashable = closableTabs(tabs).length;
      return {
        id: `stash:${windowId}`,
        title: t("cmd.stash.title", { label, count: stashable }),
        hint: t("cmd.stash.hint"),
        icon: "stash",
        keywords: t("cmd.stash.keywords"),
        disabled: !stashable,
        run: () => stashWindow(windowId)
      };
    }),
    ...(state.stashes.length ? [{
      id: "unstash",
      title: t("cmd.unstash.title", { name: stashTitle(state.stashes[0]) }),
      hint: t("stash.meta", { count: state.stashes[0].tabs.length, when: timeAgo(state.stashes[0].createdAt) }),
      icon: "restore",
      keywords: t("cmd.unstash.keywords"),
      run: () => restoreStash(state.stashes[0].id)
    }] : []),
    {
      id: "sleep",
      title: idleCount ? t("cmd.sleep.title", { count: idleCount }) : t("cmd.sleep.titleEmpty"),
      hint: t(idleCount ? "cmd.sleep.hint" : "cmd.sleep.hintEmpty"),
      icon: "moon",
      keywords: t("cmd.sleep.keywords"),
      disabled: !idleCount,
      run: () => sleepTabs(idleTabs())
    },
    ...(compostCandidates().length ? [{
      id: "compost",
      title: t("cmd.compost.title", { count: compostCandidates().length }),
      hint: t("cmd.compost.hint"),
      icon: "leaf",
      keywords: t("cmd.compost.keywords"),
      run: () => {
        state.compostForced = true;
        state.collapsed.later = false;
        render();
        document.querySelector(".compost")?.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
        document.querySelector(".compost .text-button")?.focus({ preventScroll: true });
      }
    }] : []),
    {
      id: "sections",
      title: t(allCollapsed ? "cmd.expand" : "cmd.collapse"),
      icon: "chevron",
      keywords: t("cmd.sections.keywords"),
      run: async () => {
        Object.keys(state.collapsed).forEach((key) => { state.collapsed[key] = !allCollapsed; });
        playSound("fold");
        await persist("collapsed");
        render();
      }
    },
    {
      id: "theme",
      title: t(isDarkTheme() ? "cmd.themeLight" : "cmd.themeDark"),
      icon: "theme",
      keywords: t("cmd.theme.keywords"),
      run: async () => {
        await setSetting("theme", isDarkTheme() ? "light" : "dark");
      }
    },
    {
      id: "sound",
      title: t(state.sound === "off" ? "cmd.soundOn" : "cmd.soundOff"),
      icon: "sound",
      keywords: t("cmd.sound.keywords"),
      run: async () => {
        await setSetting("sound", state.sound === "off" ? "subtle" : "off");
      }
    },
    {
      id: "refresh",
      title: t("cmd.refresh"),
      icon: "refresh",
      keywords: t("cmd.refresh.keywords"),
      run: () => loadData()
    },
    {
      id: "shortcuts",
      title: t("cmd.shortcuts"),
      hint: shortcutsHint(),
      icon: "keyboard",
      keywords: t("cmd.shortcuts.keywords"),
      run: () => openSettings({ focusShortcuts: true })
    }
  );

  return commands.filter((command) => command.always || terms.every((term) => `${command.title} ${command.keywords}`.toLocaleLowerCase().includes(term)));
}

function buildPaletteEntries(rawQuery) {
  const commandMode = rawQuery.trimStart().startsWith(">");
  const terms = searchTerms(commandMode ? rawQuery.trimStart().slice(1) : rawQuery);
  const groups = [];

  if (!commandMode) {
    const rank = (items, kind) => items
      .map((item) => ({ kind, item, score: scorePage(item, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || (b.item.lastAccessed || b.item.addedAt || 0) - (a.item.lastAccessed || a.item.addedAt || 0));
    const tabs = rank(state.tabs, "open");
    const later = rank(state.later, "later");
    const saved = rank(state.saved, "saved");
    groups.push(
      { label: t(terms.length ? "palette.group.open" : "palette.group.recent"), entries: tabs.slice(0, terms.length ? 8 : 6) },
      { label: t("palette.group.later"), entries: later.slice(0, terms.length ? 5 : 3) },
      { label: t("palette.group.saved"), entries: saved.slice(0, terms.length ? 5 : 0) }
    );
  }

  const commands = paletteCommands(terms).map((command) => ({ kind: "command", command }));
  groups.push({ label: t("palette.group.commands"), entries: commandMode || !terms.length ? commands : commands.slice(0, 4) });
  return groups.filter((group) => group.entries.length);
}

function paletteActions(entry) {
  if (entry.kind === "command") {
    return entry.command.disabled ? {} : { primary: { label: t("palette.action.run"), run: () => entry.command.run(), closes: true } };
  }
  const { item } = entry;
  const open = { label: t(entry.kind === "open" ? "palette.action.switch" : "palette.action.open"), run: () => openItem(item), closes: true };
  const save = { label: t(isInCollection("saved", item) ? "palette.action.saved" : "palette.action.save"), run: () => delightAdd("saved", item) };
  if (entry.kind === "open") {
    return {
      primary: open,
      mod: { label: t(isInCollection("later", item) ? "palette.action.inForLater" : "palette.action.forLater"), run: () => delightAdd("later", item) },
      save,
      remove: { label: t("action.closeTab"), run: () => { playSound("close"); return closeTabs([item]); } }
    };
  }
  if (entry.kind === "later") {
    return {
      primary: open,
      mod: { label: t("action.markDone"), run: () => { playSound("complete"); return removeCollectionItems("later", [item], t("toast.done")); } },
      save
    };
  }
  return {
    primary: open,
    remove: { label: t("action.remove"), run: () => { playSound("close"); return removeCollectionItems("saved", [item], t("toast.removedSaved")); } }
  };
}

function appendHighlighted(parent, text, terms) {
  const lower = text.toLocaleLowerCase();
  // Some characters change length when lower-cased; skip highlighting rather than misalign.
  if (!terms.length || lower.length !== text.length) {
    parent.textContent = text;
    return;
  }
  const marks = new Array(text.length).fill(false);
  terms.forEach((term) => {
    let index = lower.indexOf(term);
    while (index >= 0) {
      marks.fill(true, index, index + term.length);
      index = lower.indexOf(term, index + term.length);
    }
  });
  let cursor = 0;
  while (cursor < text.length) {
    const marked = marks[cursor];
    let end = cursor;
    while (end < text.length && marks[end] === marked) end += 1;
    const chunk = text.slice(cursor, end);
    if (marked) {
      const mark = document.createElement("mark");
      mark.textContent = chunk;
      parent.append(mark);
    } else {
      parent.append(chunk);
    }
    cursor = end;
  }
}

function paletteSubtitle(entry) {
  if (entry.kind === "command") return entry.command.hint || "";
  const { item } = entry;
  if (entry.kind === "later") return `${siteNameFor(item)} · ${t(currentTabFor(item) ? "page.open" : "page.closed")}`;
  return `${siteNameFor(item)} · ${summaryFor(item) || t("page.noSummary")}`;
}

function renderPalette({ keepSelection = false } = {}) {
  const query = refs.paletteInput.value;
  const commandMode = query.trimStart().startsWith(">");
  const terms = searchTerms(commandMode ? query.trimStart().slice(1) : query);
  const groups = buildPaletteEntries(query);
  const previous = state.palette.entries[state.palette.index];
  const entries = groups.flatMap((group) => group.entries);
  state.palette.entries = entries;

  if (keepSelection && previous) {
    const sameIndex = entries.findIndex((entry) => entry.kind === previous.kind && (entry.item ? entry.item.id === previous.item?.id : entry.command.id === previous.command?.id));
    state.palette.index = sameIndex >= 0 ? sameIndex : Math.min(state.palette.index, Math.max(0, entries.length - 1));
  } else {
    state.palette.index = 0;
  }

  refs.paletteList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "palette-empty";
    empty.setAttribute("role", "presentation");
    const strong = document.createElement("strong");
    strong.textContent = t(commandMode ? "palette.empty.commands" : "palette.empty.pages");
    const span = document.createElement("span");
    span.textContent = t(commandMode ? "palette.empty.commandsCopy" : "palette.empty.pagesCopy");
    empty.append(strong, span);
    refs.paletteList.append(empty);
  }

  let optionIndex = 0;
  groups.forEach((group) => {
    const heading = document.createElement("li");
    heading.className = "palette-group";
    heading.setAttribute("role", "presentation");
    heading.textContent = group.label;
    refs.paletteList.append(heading);

    group.entries.forEach((entry) => {
      const index = optionIndex;
      optionIndex += 1;
      const option = document.createElement("li");
      option.className = "palette-option";
      option.id = `palette-option-${index}`;
      option.dataset.kind = entry.kind;
      option.setAttribute("role", "option");
      if (entry.command?.destructive) option.classList.add("is-destructive");
      if (entry.command?.disabled) option.setAttribute("aria-disabled", "true");

      let iconNode;
      if (entry.kind === "command") {
        iconNode = document.createElement("span");
        iconNode.className = "palette-icon";
        iconNode.append(icon(entry.command.icon));
      } else if (entry.kind === "open") {
        iconNode = faviconNode("palette-icon", entry.item);
      } else {
        iconNode = document.createElement("span");
        iconNode.className = "palette-icon";
        iconNode.append(icon(entry.kind === "later" ? "clock" : "bookmark"));
      }

      const text = document.createElement("span");
      text.className = "palette-text";
      const title = document.createElement("span");
      title.className = "palette-title";
      appendHighlighted(title, entry.kind === "command" ? entry.command.title : titleFor(entry.item), terms);
      const sub = document.createElement("span");
      sub.className = "palette-sub";
      sub.textContent = paletteSubtitle(entry);
      text.append(title, sub);

      const tag = document.createElement("span");
      tag.className = "palette-tag";
      tag.textContent = entry.kind === "command" ? "" : entry.kind === "open" ? displayHostFor(entry.item.url) : t(SECTION_LABELS[entry.kind]);

      option.append(iconNode, text, tag);
      option.addEventListener("mousemove", () => {
        if (state.palette.index !== index) setPaletteIndex(index, { scroll: false });
      });
      option.addEventListener("click", () => {
        setPaletteIndex(index, { scroll: false });
        runPaletteAction("primary");
      });
      refs.paletteList.append(option);
    });
  });

  setPaletteIndex(state.palette.index, { scroll: !keepSelection });
}

function setPaletteIndex(index, { scroll = true } = {}) {
  const { entries } = state.palette;
  state.palette.index = entries.length ? (index + entries.length) % entries.length : 0;
  refs.paletteList.querySelectorAll(".palette-option").forEach((option, optionIndex) => {
    const selected = optionIndex === state.palette.index;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
    if (selected && scroll) option.scrollIntoView({ block: "nearest" });
  });
  if (entries.length) refs.paletteInput.setAttribute("aria-activedescendant", `palette-option-${state.palette.index}`);
  else refs.paletteInput.removeAttribute("aria-activedescendant");
  renderPaletteHints();
}

function renderPaletteHints() {
  const entry = state.palette.entries[state.palette.index];
  const actions = entry ? paletteActions(entry) : {};
  const hints = [
    ["↑↓", t("palette.hint.navigate")],
    actions.primary && ["↵", actions.primary.label],
    actions.mod && [modKey("↵"), actions.mod.label],
    actions.save && [modKey("S"), actions.save.label],
    actions.remove && [modKey("⌫"), actions.remove.label]
  ].filter(Boolean);
  refs.paletteHints.replaceChildren(...hints.map(([keys, label]) => {
    const span = document.createElement("span");
    const kbd = document.createElement("kbd");
    kbd.textContent = keys;
    span.append(kbd, label);
    return span;
  }));
}

async function runPaletteAction(kind) {
  const entry = state.palette.entries[state.palette.index];
  if (!entry) return;
  const action = paletteActions(entry)[kind];
  if (!action) return;
  if (action.closes) closePalette({ restoreFocus: false });
  await action.run();
}

function openPalette() {
  if (state.palette.open) return;
  state.palette.open = true;
  state.palette.returnFocus = document.activeElement;
  refs.palette.hidden = false;
  refs.paletteInput.value = "";
  renderPalette();
  refs.paletteInput.focus();
}

function closePalette({ restoreFocus = true } = {}) {
  if (!state.palette.open) return;
  state.palette.open = false;
  if (refs.palette.contains(document.activeElement)) document.activeElement.blur();
  refs.palette.hidden = true;
  if (restoreFocus && state.palette.returnFocus?.isConnected) state.palette.returnFocus.focus();
  state.palette.returnFocus = null;
}

function handlePaletteKeydown(event) {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
    event.preventDefault();
    setPaletteIndex(state.palette.index + 1);
  } else if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
    event.preventDefault();
    setPaletteIndex(state.palette.index - 1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    runPaletteAction(mod ? "mod" : "primary");
  } else if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault();
    runPaletteAction("save");
  } else if (mod && event.key === "Backspace") {
    event.preventDefault();
    runPaletteAction("remove");
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (refs.paletteInput.value) {
      refs.paletteInput.value = "";
      renderPalette();
    } else {
      closePalette();
    }
  }
}

function isTextField(element) {
  return element instanceof HTMLElement && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
}

/* ---------- Settings popover ---------- */

async function setSetting(name, value) {
  if (name === "theme") {
    if (!["system", "light", "dark"].includes(value)) return;
    state.theme = value;
    applyTheme();
    syncSettingsUi();
    await persist("theme");
  } else if (name === "sound") {
    if (!["off", "subtle", "playful"].includes(value)) return;
    state.sound = value;
    syncSettingsUi();
    await persist("sound");
    if (state.sound !== "off") playSound("save", { preview: true });
    showToast(soundToast());
  } else if (name === "autoSleep") {
    if (!AUTO_SLEEP_VALUES.includes(value)) return;
    state.autoSleep = value;
    syncSettingsUi();
    // The background worker watches this key and runs the idle sweep on an alarm.
    await persist("autoSleep");
    showToast(value === "off" ? t("toast.autoSleepOff") : t("toast.autoSleepOn", { label: t(`autoSleep.${value}`) }));
  } else if (name === "language") {
    state.language = i18n.normalizeLanguage(value);
    applyLanguage();
    // The background worker watches this key to retitle its context-menu entries.
    await persist("language");
  }
}

function syncSettingsUi() {
  refs.settings.querySelectorAll(".segmented").forEach((group) => {
    const current = state[group.dataset.setting];
    group.querySelectorAll("[data-value]").forEach((option) => {
      const checked = option.dataset.value === current;
      option.setAttribute("aria-checked", String(checked));
      option.tabIndex = checked ? 0 : -1;
    });
  });
  renderKeymapList();
  renderBrowserShortcuts();
}

function shortcutRow(label, keyNode) {
  const row = document.createElement("li");
  row.className = "shortcut-row";
  const name = document.createElement("span");
  name.textContent = label;
  row.append(name, keyNode);
  return row;
}

function renderKeymapList() {
  if (!state.keymap) state.keymap = normalizeKeymap(null);
  refs.keymapList.replaceChildren(...KEYMAP_ACTIONS.map((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-key";
    button.dataset.record = action;
    const recording = state.recording === action;
    button.classList.toggle("is-recording", recording);
    button.setAttribute("aria-pressed", String(recording));
    button.setAttribute("aria-label", t("shortcuts.editAria", { name: t(`keymap.${action}`), keys: formatBinding(state.keymap[action]) }));
    button.textContent = recording ? t("shortcuts.recording") : formatBinding(state.keymap[action]);
    return shortcutRow(t(`keymap.${action}`), button);
  }));
}

function renderBrowserShortcuts() {
  const rows = [["open", "shortcuts.openTabloom"], ["later", "action.keepForLater"], ["saved", "action.savePage"]];
  refs.browserShortcutList.replaceChildren(...rows.map(([key, label]) => {
    const kbd = document.createElement("kbd");
    kbd.textContent = state.shortcuts[key] || t("shortcuts.none");
    kbd.classList.toggle("is-empty", !state.shortcuts[key]);
    return shortcutRow(t(label), kbd);
  }));
}

// Updates every visible hint (search box, Jump to, toast) to the current bindings.
function applyKeymapLabels() {
  if (!state.keymap) state.keymap = normalizeKeymap(null);
  document.querySelectorAll("[data-keymap]").forEach((node) => {
    node.textContent = formatBinding(state.keymap[node.dataset.keymap]);
  });
  refs.search.setAttribute("aria-keyshortcuts", ariaBinding(state.keymap.filter));
  refs.openPalette.setAttribute("aria-keyshortcuts", ariaBinding(state.keymap.palette));
  renderKeymapList();
}

function setKeymapHint(key, values, isError = false) {
  refs.keymapHint.textContent = t(key, values);
  refs.keymapHint.classList.toggle("is-error", isError);
}

function startRecording(action) {
  state.recording = action;
  renderKeymapList();
  refs.keymapList.querySelector(`[data-record="${action}"]`)?.focus();
  setKeymapHint("shortcuts.recordHint");
}

function stopRecording({ hint = "shortcuts.editHint" } = {}) {
  if (!state.recording) return;
  const action = state.recording;
  state.recording = null;
  renderKeymapList();
  refs.keymapList.querySelector(`[data-record="${action}"]`)?.focus();
  if (hint) setKeymapHint(hint);
}

async function recordKey(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    stopRecording();
    return;
  }
  // Tab still moves focus so a keyboard user is never trapped in recording mode.
  if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    stopRecording();
    return;
  }
  const action = state.recording;
  const binding = bindingFromEvent(event);
  // Only ⌘ (macOS) or Ctrl (elsewhere) counts as the modifier; the other one is ignored.
  const problem = (isMac ? event.ctrlKey : event.metaKey) && !MODIFIER_KEYS.has(binding.key)
    ? "shortcuts.invalid"
    : bindingProblem(binding, action);
  if (problem === "pending") return;
  if (problem) {
    if (typeof problem === "string") setKeymapHint(problem, undefined, true);
    else setKeymapHint(problem.key, problem.values, true);
    return;
  }
  state.keymap = { ...state.keymap, [action]: binding };
  stopRecording({ hint: null });
  setKeymapHint("shortcuts.saved", { name: t(`keymap.${action}`), keys: formatBinding(binding) });
  applyKeymapLabels();
  refs.keymapList.querySelector(`[data-record="${action}"]`)?.focus();
  await persist("keymap");
}

function openSettings({ focusShortcuts = false } = {}) {
  if (state.palette.open) closePalette({ restoreFocus: false });
  state.settingsOpen = true;
  refs.settings.hidden = false;
  refs.openSettings.setAttribute("aria-expanded", "true");
  syncSettingsUi();
  setKeymapHint("shortcuts.editHint");
  const target = focusShortcuts
    ? refs.keymapList.querySelector("[data-record]")
    : refs.settings.querySelector('.segmented [aria-checked="true"]');
  target?.focus();
}

function closeSettings({ restoreFocus = true } = {}) {
  if (!state.settingsOpen) return;
  stopRecording({ hint: null });
  state.settingsOpen = false;
  refs.settings.hidden = true;
  refs.openSettings.setAttribute("aria-expanded", "false");
  if (restoreFocus) refs.openSettings.focus();
}

/* ---------- Events ---------- */

function bindEvents() {
  state.keymap = normalizeKeymap(null);
  applyKeymapLabels();
  document.addEventListener("pointermove", updatePointerDrag);
  document.addEventListener("pointerup", finishPointerDrag);
  document.addEventListener("pointercancel", finishPointerDrag);
  document.addEventListener("pointerdown", () => {
    if (state.sound === "off") return;
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  }, { passive: true });
  refs.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  refs.settings.querySelectorAll(".segmented").forEach((group) => {
    group.addEventListener("click", (event) => {
      const option = event.target.closest("[data-value]");
      if (option) setSetting(group.dataset.setting, option.dataset.value);
    });
    // Arrow keys move between options like a native radio group.
    group.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const options = [...group.querySelectorAll("[data-value]")];
      const index = options.indexOf(group.querySelector('[aria-checked="true"]'));
      const next = options[(index + step + options.length) % options.length];
      setSetting(group.dataset.setting, next.dataset.value).then(() => next.focus());
    });
  });
  refs.openSettings.addEventListener("click", () => (state.settingsOpen ? closeSettings() : openSettings()));
  document.addEventListener("pointerdown", (event) => {
    if (!state.settingsOpen) return;
    if (refs.settings.contains(event.target) || refs.openSettings.contains(event.target)) return;
    closeSettings({ restoreFocus: false });
  });
  refs.keymapList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-record]");
    if (!button) return;
    if (state.recording === button.dataset.record) stopRecording();
    else startRecording(button.dataset.record);
  });
  document.querySelector("#reset-keymap").addEventListener("click", async () => {
    stopRecording();
    state.keymap = normalizeKeymap(null);
    await persist("keymap");
    applyKeymapLabels();
    showToast(t("toast.shortcutReset"));
  });
  document.querySelector("#open-browser-shortcuts").addEventListener("click", () => {
    if (isExtension) chrome.tabs.create({ url: `${isEdge ? "edge" : "chrome"}://extensions/shortcuts` });
    else showToast(t("toast.shortcutsHint"));
  });
  refs.openSort.addEventListener("change", async (event) => {
    state.openSort = event.target.value;
    await persist("openSort");
    render();
    showToast(t("toast.sortApplied", { label: t(`sort.${state.openSort}`) }));
  });
  refs.resetOpenOrder.addEventListener("click", async () => {
    state.openOrder = [];
    state.openSort = "manual";
    refs.openSort.value = "manual";
    await persist("openOrder", "openSort");
    render();
    showToast(t("toast.manualReset"));
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
  document.querySelector("#clear-search").addEventListener("click", () => {
    refs.search.value = "";
    state.query = "";
    render();
    refs.search.focus();
  });
  document.querySelector("#complete-all").addEventListener("click", completeAll);
  document.querySelector("#close-all").addEventListener("click", closeAll);
  document.querySelector("#remove-all").addEventListener("click", removeAll);
  document.querySelectorAll("[data-undo]").forEach((button) => button.addEventListener("click", () => undo(button.dataset.undo)));
  document.querySelectorAll(".collapse").forEach((button) => button.addEventListener("click", async () => {
    const section = button.closest(".module").dataset.section;
    playSound("fold");
    state.collapsed[section] = !state.collapsed[section];
    await persist("collapsed");
    render();
  }));

  refs.toastUndo.addEventListener("click", () => {
    if (state.toastUndoSection) undo(state.toastUndoSection);
  });
  refs.toast.addEventListener("pointerenter", () => clearTimeout(toastTimer));
  refs.toast.addEventListener("pointerleave", () => hideToastLater(2000));
  refs.toast.addEventListener("focusin", () => clearTimeout(toastTimer));
  refs.toast.addEventListener("focusout", () => hideToastLater(2000));

  refs.remindMenu.addEventListener("keydown", handleRemindMenuKeydown);
  refs.stashWindow.addEventListener("click", () => openStashMenu(refs.stashWindow));
  document.addEventListener("pointerdown", (event) => {
    if (state.remindMenu && !refs.remindMenu.contains(event.target) && !state.remindMenu.button.contains(event.target)) closeRemindMenu({ restoreFocus: false });
  }, true);
  window.addEventListener("scroll", () => closeRemindMenu({ restoreFocus: false }), { passive: true });
  refs.openPalette.addEventListener("click", openPalette);
  refs.paletteInput.addEventListener("input", () => renderPalette());
  refs.paletteInput.addEventListener("keydown", handlePaletteKeydown);
  refs.palette.addEventListener("pointerdown", (event) => {
    if (event.target === refs.palette) closePalette();
  });

  // Recording a new shortcut swallows every key press before anything else sees it.
  document.addEventListener("keydown", (event) => {
    if (state.recording) recordKey(event);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (state.recording) return;
    const typing = isTextField(document.activeElement);
    // Single-key shortcuts must not steal characters the user is typing.
    const usable = (binding) => matchesBinding(event, binding) && !((typing) && !binding.mod && !binding.alt);

    if (usable(state.keymap.palette)) {
      event.preventDefault();
      if (state.palette.open) closePalette();
      else { closeSettings({ restoreFocus: false }); openPalette(); }
      return;
    }
    if (state.palette.open || refs.dialog.open) return;

    if (event.key === "Escape" && state.settingsOpen) {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (!typing && usable(state.keymap.undo)) {
      event.preventDefault();
      undoLatest();
      return;
    }
    if (!typing && usable(state.keymap.filter)) {
      event.preventDefault();
      closeSettings({ restoreFocus: false });
      refs.search.focus();
      refs.search.select();
      return;
    }
    if (event.key === "Escape" && document.activeElement === refs.search && refs.search.value) {
      refs.search.value = "";
      state.query = "";
      render();
    }
  });
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => loadData({ quiet: true }), 160);
}

if (isExtension) {
  chrome.tabs.onCreated.addListener(scheduleReload);
  chrome.tabs.onRemoved.addListener(scheduleReload);
  chrome.tabs.onUpdated.addListener(scheduleReload);
  chrome.tabs.onMoved.addListener(scheduleReload);
  chrome.tabs.onAttached.addListener(scheduleReload);
  chrome.tabs.onDetached.addListener(scheduleReload);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area && area !== "local") return;
    // Pages added from a shortcut or the context menu arrive through storage.
    const collectionChanged = ["later", "saved", "stashes"].some((key) => key in changes
      && JSON.stringify(changes[key].newValue ?? []) !== JSON.stringify(state[key]));
    if (collectionChanged || Object.keys(changes).some((key) => key.startsWith("meta:"))) scheduleReload();
    // A language picked in another Tabloom tab.
    if ("language" in changes && i18n.normalizeLanguage(changes.language.newValue) !== state.language) {
      state.language = i18n.normalizeLanguage(changes.language.newValue);
      applyLanguage();
    }
    // Settings changed in another Tabloom tab.
    if ("theme" in changes && changes.theme.newValue && changes.theme.newValue !== state.theme) {
      state.theme = changes.theme.newValue;
      applyTheme();
      syncSettingsUi();
    }
    if ("sound" in changes && changes.sound.newValue && changes.sound.newValue !== state.sound) {
      state.sound = changes.sound.newValue;
      syncSettingsUi();
    }
    if ("autoSleep" in changes && changes.autoSleep.newValue !== state.autoSleep) {
      state.autoSleep = AUTO_SLEEP_VALUES.includes(changes.autoSleep.newValue) ? changes.autoSleep.newValue : "off";
      syncSettingsUi();
    }
    if ("compostAt" in changes && Number(changes.compostAt.newValue) !== state.compostAt) {
      state.compostAt = Number(changes.compostAt.newValue) || 0;
      render();
    }
    if ("keymap" in changes && JSON.stringify(normalizeKeymap(changes.keymap.newValue)) !== JSON.stringify(state.keymap)) {
      state.keymap = normalizeKeymap(changes.keymap.newValue);
      applyKeymapLabels();
    }
  });
}

window.addEventListener("languagechange", () => {
  if (state.language === "system") applyLanguage();
});

// Ages are relative to now, so a dashboard left open for days keeps fading on time.
setInterval(() => { if (!document.hidden) render(); }, 60 * 60 * 1000);
// The background worker puts a count on the toolbar icon when a reminder comes due;
// looking at Tabloom is acknowledging it.
function clearReminderBadge() {
  if (!isExtension || document.hidden || !chrome.action?.setBadgeText) return;
  chrome.action.setBadgeText({ text: "" }).catch(() => {});
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  clearReminderBadge();
  render();
  // The user may have just rebound a browser-wide shortcut in the browser's settings.
  loadShortcuts().then(renderBrowserShortcuts);
});

bindEvents();
clearReminderBadge();
loadShortcuts().finally(() => loadData({ quiet: true }));
