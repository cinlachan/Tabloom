const isExtension = typeof chrome !== "undefined" && Boolean(chrome.tabs?.query);
const dashboardUrl = isExtension ? chrome.runtime.getURL("dashboard.html") : location.href;

const demoTabs = [
  { id: 101, windowId: 1, title: "Designing for Clarity, Not Attention", url: "https://medium.com/design/clarity", favIconUrl: "", active: false },
  { id: 102, windowId: 1, title: "Building a Second Brain in Notion", url: "https://youtube.com/watch?v=tabloom", favIconUrl: "", active: false },
  { id: 103, windowId: 1, title: "Grid layout — CSS", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/grid", favIconUrl: "", active: false },
  { id: 104, windowId: 2, title: "Tabloom UI Kit – Figma", url: "https://figma.com/file/tabloom", favIconUrl: "", active: false },
  { id: 105, windowId: 2, title: "プロジェクト計画テンプレート", url: "https://notion.so/project-template", favIconUrl: "", active: false },
  { id: 106, windowId: 2, title: "人工智能正在改变我们的工作方式", url: "https://github.com/topics/artificial-intelligence", favIconUrl: "", active: false }
];

const demoMeta = {
  101: { summary: "Principles for creating calm, intuitive digital experiences.", siteName: "Medium" },
  102: { summary: "A step-by-step system for organizing your digital life.", siteName: "YouTube" },
  103: { summary: "Learn how to create powerful two-dimensional layouts.", siteName: "MDN Web Docs" },
  104: { summary: "Design system and interface components for Tabloom.", siteName: "Figma" },
  105: { summary: "プロジェクトを整理し、進捗を追跡するためのテンプレート", siteName: "Notion" },
  106: { summary: "开源项目、研究资料与实践案例的精选集合。", siteName: "GitHub" }
};

const state = {
  tabs: [],
  meta: {},
  later: [],
  saved: [],
  collapsed: { later: false, open: false, saved: false },
  query: "",
  theme: "system",
  sound: "subtle",
  openSort: "manual",
  openOrder: [],
  draggedGroup: null,
  pointerDrag: null,
  expandedGroups: new Set(),
  undo: { later: null, open: null, saved: null }
};

const refs = {
  search: document.querySelector("#search"),
  theme: document.querySelector("#theme"),
  sound: document.querySelector("#sound"),
  openSort: document.querySelector("#open-sort"),
  resetOpenOrder: document.querySelector("#reset-open-order"),
  clickSparkCanvas: document.querySelector("#click-spark-canvas"),
  toast: document.querySelector("#toast"),
  emptySearch: document.querySelector("#empty-search"),
  dialog: document.querySelector("#confirm-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogCopy: document.querySelector("#dialog-copy"),
  dialogConfirm: document.querySelector("#dialog-confirm")
};

let audioContext;
let lastSoundAt = 0;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const clickSpark = {
  sparkSize: 8,
  sparkRadius: 22,
  sparkCount: 8,
  duration: 420,
  extraScale: 1.1,
  sparks: [],
  animationId: 0,
  context: null,
  pixelRatio: 1
};

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

function cursorEffectKind(target) {
  const label = `${target.getAttribute("aria-label") || ""} ${target.textContent || ""}`.toLowerCase();
  if (label.includes("close") || label.includes("remove")) return "close";
  if (label.includes("complete") || label.includes("done")) return "complete";
  if (label.includes("save") || label.includes("later")) return "save";
  if (label.includes("undo")) return "undo";
  return "neutral";
}

function resizeClickSparkCanvas() {
  const canvas = refs.clickSparkCanvas;
  if (!canvas) return;
  clickSpark.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * clickSpark.pixelRatio);
  canvas.height = Math.round(window.innerHeight * clickSpark.pixelRatio);
  clickSpark.context = canvas.getContext("2d");
  clickSpark.context?.setTransform(clickSpark.pixelRatio, 0, 0, clickSpark.pixelRatio, 0, 0);
}

function clickSparkColor(kind) {
  const variable = {
    close: "--danger",
    complete: "--accent",
    save: "--accent-strong",
    undo: "--violet",
    neutral: "--accent"
  }[kind] || "--accent";
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "#84cc16";
}

function drawClickSparks(timestamp) {
  const context = clickSpark.context;
  if (!context) return;
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  clickSpark.sparks = clickSpark.sparks.filter((spark) => {
    const elapsed = timestamp - spark.startTime;
    if (elapsed >= clickSpark.duration) return false;
    const progress = elapsed / clickSpark.duration;
    const eased = progress * (2 - progress);
    const distance = eased * clickSpark.sparkRadius * clickSpark.extraScale;
    const lineLength = clickSpark.sparkSize * (1 - eased);
    const x1 = spark.x + distance * Math.cos(spark.angle);
    const y1 = spark.y + distance * Math.sin(spark.angle);
    const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
    const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);
    context.save();
    context.globalAlpha = Math.max(0, 1 - progress * .72);
    context.strokeStyle = spark.color;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.shadowColor = spark.color;
    context.shadowBlur = 5 * (1 - progress);
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.restore();
    return true;
  });
  if (clickSpark.sparks.length) clickSpark.animationId = requestAnimationFrame(drawClickSparks);
  else clickSpark.animationId = 0;
}

function emitClickSpark(event, kind) {
  if (reduceMotion.matches || !refs.clickSparkCanvas) return;
  const target = event.target instanceof Element ? event.target.closest("button, a, select, .page-main") : null;
  const rect = target?.getBoundingClientRect();
  const x = event.clientX || (rect ? rect.left + rect.width / 2 : 0);
  const y = event.clientY || (rect ? rect.top + rect.height / 2 : 0);
  const startTime = performance.now();
  const color = clickSparkColor(kind);
  const newSparks = Array.from({ length: clickSpark.sparkCount }, (_, index) => ({
    x,
    y,
    color,
    angle: (Math.PI * 2 * index) / clickSpark.sparkCount - Math.PI / 2,
    startTime
  }));
  clickSpark.sparks.push(...newSparks);
  if (!clickSpark.animationId) clickSpark.animationId = requestAnimationFrame(drawClickSparks);
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

async function delightAdd(section, item, button) {
  if (state[section].some((saved) => canonicalUrl(saved.url) === canonicalUrl(item.url))) {
    showToast(section === "later" ? "Already in For Later" : "Already saved");
    return;
  }
  button?.classList.add("is-bouncing");
  playSound(section === "later" ? "later" : "save");
  await effectDelay(150);
  await addToCollection(section, item);
}

async function animateBulk(section, soundName = "bulk") {
  const cards = [...document.querySelectorAll(`[data-section="${section}"] .site-card`)];
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

function hostFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "Browser page"; }
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
  return item.title?.trim() || "Untitled page";
}

function summaryFor(item) {
  const meta = state.meta[item.tabId ?? item.id] || null;
  if (item.summary?.trim()) return item.summary.trim();
  if (meta?.summary?.trim()) return meta.summary.trim();
  try {
    const parsed = new URL(item.url);
    const path = decodeURIComponent(parsed.pathname).replace(/[-_/]+/g, " ").trim();
    return path && path !== "/" ? path : parsed.hostname;
  } catch {
    return "No page summary available.";
  }
}

function siteNameFor(item) {
  const meta = state.meta[item.tabId ?? item.id] || null;
  return item.siteName?.trim() || meta?.siteName?.trim() || hostFor(item.url);
}

function faviconFor(item) {
  const meta = state.meta[item.tabId ?? item.id] || null;
  return item.favIconUrl || item.favicon || meta?.favicon || "";
}

function snapshot(item) {
  return {
    id: item.id || crypto.randomUUID(),
    url: item.url,
    title: titleFor(item),
    summary: summaryFor(item),
    siteName: siteNameFor(item),
    favicon: faviconFor(item),
    addedAt: item.addedAt || Date.now()
  };
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

async function storageGet() {
  if (!isExtension) {
    return {
      later: [snapshot({ ...demoTabs[0], summary: demoMeta[101].summary, siteName: "Medium" })],
      saved: [snapshot({ ...demoTabs[3], summary: demoMeta[104].summary, siteName: "Figma" })],
      collapsed: state.collapsed,
      theme: "system",
      sound: "subtle",
      openSort: "manual",
      openOrder: []
    };
  }
  return chrome.storage.local.get(null);
}

async function saveCollections() {
  if (!isExtension) return;
  await chrome.storage.local.set({
    later: state.later,
    saved: state.saved,
    collapsed: state.collapsed,
    theme: state.theme,
    sound: state.sound,
    openSort: state.openSort,
    openOrder: state.openOrder
  });
}

async function loadData({ quiet = false } = {}) {
  const [tabs, stored] = await Promise.all([
    isExtension ? chrome.tabs.query({}) : Promise.resolve(demoTabs),
    storageGet()
  ]);

  state.tabs = tabs.filter((tab) => tab.url && !tab.url.startsWith(dashboardUrl));
  state.later = Array.isArray(stored.later) ? stored.later : [];
  state.saved = Array.isArray(stored.saved) ? stored.saved : [];
  state.collapsed = { ...state.collapsed, ...(stored.collapsed || {}) };
  state.theme = stored.theme || "system";
  state.sound = stored.sound || "subtle";
  state.openSort = ["manual", "count", "recent", "name"].includes(stored.openSort) ? stored.openSort : "manual";
  state.openOrder = Array.isArray(stored.openOrder) ? stored.openOrder.filter((key) => typeof key === "string") : [];
  state.meta = isExtension
    ? Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith("meta:")).map(([, value]) => [value.tabId, value]))
    : demoMeta;

  refs.theme.value = state.theme;
  refs.sound.value = state.sound;
  refs.openSort.value = state.openSort;
  applyTheme();
  render();
  if (!quiet) showToast("Tabs refreshed");
}

function applyTheme() {
  const dark = state.theme === "dark" || (state.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function setCount(section, count) {
  document.querySelector(`#${section}-count`).textContent = count;
  const buttonId = section === "later" ? "complete-all" : section === "open" ? "close-all" : "remove-all";
  document.querySelector(`#${buttonId}`).disabled = count === 0;
}

function render() {
  const visibleLater = state.later.filter(matches);
  const visibleTabs = state.tabs.filter(matches);
  const visibleSaved = state.saved.filter(matches);

  setCount("later", state.later.length);
  setCount("open", state.tabs.length);
  setCount("saved", state.saved.length);
  document.querySelector("#open-summary").textContent = `${state.tabs.length} tabs open across ${new Set(state.tabs.map((tab) => tab.windowId)).size} browser window${new Set(state.tabs.map((tab) => tab.windowId)).size === 1 ? "" : "s"}.`;

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
}

function renderSection(section, items) {
  const container = document.querySelector(`#${section}-content`);
  container.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "module-empty";
    const messages = {
      later: ["Nothing waiting", "Use the clock icon on an open tab to keep it for later."],
      open: ["No open pages", "Open a new browser tab and it will appear here."],
      saved: ["Nothing saved yet", "Use the bookmark icon to keep a page here."]
    };
    const [title, copy] = messages[section];
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = copy;
    const wrap = document.createElement("div");
    wrap.append(strong, span);
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

async function saveOpenOrder(keys, feedback = "Order updated") {
  state.openOrder = [...new Set([...keys, ...state.openOrder])];
  state.openSort = "manual";
  refs.openSort.value = "manual";
  await saveCollections();
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
  saveOpenOrder(keys, `Moved to position ${nextIndex + 1}`);
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

function createSiteCard(section, groupKey, items) {
  const expansionKey = `${section}:${groupKey}`;
  const isExpanded = state.expandedGroups.has(expansionKey);
  const visibleItems = isExpanded ? items : items.slice(0, 4);
  const card = document.createElement("article");
  card.className = "site-card";
  card.dataset.groupKey = groupKey;
  const header = document.createElement("header");
  header.className = "site-card-header";

  if (section === "open") {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.disabled = Boolean(state.query);
    handle.setAttribute("aria-label", `Move ${siteNameFor(items[0])} card`);
    handle.setAttribute("data-tooltip", state.query ? "Clear search to reorder" : "Drag to reorder · Arrow keys also work");
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

  const favicon = document.createElement("span");
  favicon.className = "site-favicon";
  const faviconUrl = faviconFor(items[0]);
  if (faviconUrl) {
    const img = document.createElement("img");
    img.src = faviconUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      img.remove();
      favicon.textContent = siteNameFor(items[0]).slice(0, 1).toUpperCase();
    });
    favicon.append(img);
  } else {
    favicon.textContent = siteNameFor(items[0]).slice(0, 1).toUpperCase();
  }

  const siteName = document.createElement("span");
  siteName.className = "site-name";
  siteName.textContent = siteNameFor(items[0]);
  const count = document.createElement("span");
  count.className = "site-count";
  count.textContent = items.length;
  header.append(favicon, siteName, count);

  const list = document.createElement("ul");
  list.className = "page-list";
  visibleItems.forEach((item) => list.append(createPageRow(section, item)));

  const footer = document.createElement("footer");
  footer.className = "card-footer";
  let footerLead;
  if (items.length > 4) {
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "card-expand";
    expand.setAttribute("aria-expanded", String(isExpanded));
    expand.textContent = isExpanded ? "Show less" : `+ ${items.length - 4} more`;
    expand.addEventListener("click", () => {
      if (isExpanded) state.expandedGroups.delete(expansionKey);
      else state.expandedGroups.add(expansionKey);
      render();
    });
    footerLead = expand;
  } else {
    const label = document.createElement("span");
    label.textContent = `${items.length} page${items.length === 1 ? "" : "s"}`;
    footerLead = label;
  }
  const action = document.createElement("button");
  action.type = "button";
  action.className = "site-action";
  action.textContent = section === "later" ? "Complete site" : section === "open" ? "Close site" : "Remove site";
  action.addEventListener("click", (event) => {
    const card = event.currentTarget.closest(".site-card");
    const soundName = section === "later" ? "complete" : section === "open" ? "close" : "close";
    animateAndRun(card, "is-site-exiting", soundName, 270, () => actOnSite(section, groupKey, items));
  });
  footer.append(footerLead, action);
  card.append(header, list, footer);
  return card;
}

function createPageRow(section, item) {
  const row = document.createElement("li");
  row.className = "page-row";

  const main = document.createElement("button");
  main.type = "button";
  main.className = "page-main";
  main.setAttribute("aria-label", `Open ${titleFor(item)}`);
  const title = document.createElement("span");
  title.className = "page-title";
  title.textContent = titleFor(item);
  const summary = document.createElement("span");
  summary.className = "page-summary";
  summary.textContent = summaryFor(item);
  main.append(title, summary);

  if (section === "later") {
    const status = document.createElement("span");
    const open = Boolean(currentTabFor(item));
    status.className = `page-status${open ? " is-open" : ""}`;
    status.textContent = open ? "Currently open" : "Tab closed · kept for later";
    main.append(status);
  }
  main.addEventListener("click", () => openItem(item));

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(makeButton({ className: "row-action", label: `Open ${titleFor(item)}`, tooltip: "Open page", iconName: "external", onClick: () => openItem(item) }));

  if (section === "open") {
    const isLater = state.later.some((saved) => canonicalUrl(saved.url) === canonicalUrl(item.url));
    const isSaved = state.saved.some((saved) => canonicalUrl(saved.url) === canonicalUrl(item.url));
    actions.append(
      makeButton({ className: `row-action${isLater ? " is-active" : ""}`, label: "Keep for later", tooltip: isLater ? "Already in For Later" : "Keep for later", iconName: "clock", onClick: (event) => delightAdd("later", item, event.currentTarget) }),
      makeButton({ className: `row-action${isSaved ? " is-active" : ""}`, label: "Save page", tooltip: isSaved ? "Already saved" : "Save page", iconName: "bookmark", onClick: (event) => delightAdd("saved", item, event.currentTarget) }),
      makeButton({ className: "row-action is-destructive", label: "Close tab", tooltip: "Close tab", iconName: "x", onClick: (event) => animateAndRun(event.currentTarget.closest(".page-row"), "is-closing", "close", 210, () => closeTabs([item])) })
    );
  } else if (section === "later") {
    const isSaved = state.saved.some((saved) => canonicalUrl(saved.url) === canonicalUrl(item.url));
    actions.append(
      makeButton({ className: "row-action is-active", label: "Mark as done", tooltip: "Mark as done", iconName: "check", onClick: (event) => animateAndRun(event.currentTarget.closest(".page-row"), "is-completing", "complete", 250, () => removeCollectionItems("later", [item], "Marked as done")) }),
      makeButton({ className: `row-action${isSaved ? " is-active" : ""}`, label: "Save page", tooltip: isSaved ? "Already saved" : "Save page", iconName: "bookmark", onClick: (event) => delightAdd("saved", item, event.currentTarget) })
    );
  } else {
    actions.append(makeButton({ className: "row-action is-destructive", label: "Remove saved page", tooltip: "Remove", iconName: "trash", onClick: (event) => animateAndRun(event.currentTarget.closest(".page-row"), "is-removing", "close", 210, () => removeCollectionItems("saved", [item], "Removed from Saved")) }));
  }

  row.append(main, actions);
  return row;
}

async function openItem(item) {
  if (!isExtension) return showToast(`Would open “${titleFor(item)}”`);
  const tab = currentTabFor(item);
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    await chrome.tabs.create({ url: item.url });
  }
}

async function addToCollection(section, item) {
  const collection = state[section];
  if (collection.some((saved) => canonicalUrl(saved.url) === canonicalUrl(item.url))) {
    showToast(section === "later" ? "Already in For Later" : "Already saved");
    return;
  }
  collection.unshift(snapshot({ ...item, tabId: item.id }));
  await saveCollections();
  render();
  showToast(section === "later" ? "Added to For Later" : "Saved");
}

async function removeCollectionItems(section, items, feedback) {
  const ids = new Set(items.map((item) => item.id));
  const urls = new Set(items.map((item) => canonicalUrl(item.url)));
  const removed = state[section].filter((item) => ids.has(item.id) || urls.has(canonicalUrl(item.url)));
  state[section] = state[section].filter((item) => !ids.has(item.id) && !urls.has(canonicalUrl(item.url)));
  state.undo[section] = { type: "restore", items: removed };
  await saveCollections();
  setFeedback(section, feedback);
  render();
}

async function closeTabs(items) {
  const liveTabs = items.map((item) => state.tabs.find((tab) => tab.id === item.id)).filter(Boolean);
  if (!liveTabs.length) return;
  state.undo.open = { type: "reopen", items: liveTabs.map(snapshot) };
  if (isExtension) await chrome.tabs.remove(liveTabs.map((tab) => tab.id));
  else state.tabs = state.tabs.filter((tab) => !liveTabs.some((closed) => closed.id === tab.id));
  setFeedback("open", `${liveTabs.length} tab${liveTabs.length === 1 ? "" : "s"} closed`);
  await loadData({ quiet: true });
}

async function actOnSite(section, _groupKey, items) {
  if (section === "open") await closeTabs(items);
  else await removeCollectionItems(section, items, section === "later" ? "Site marked as done" : "Site removed from Saved");
}

function setFeedback(section, message) {
  document.querySelector(`#${section}-feedback`).textContent = message;
  updateUndoUi();
}

function updateUndoUi() {
  document.querySelectorAll("[data-undo]").forEach((button) => {
    button.hidden = !state.undo[button.dataset.undo];
  });
}

async function undo(section) {
  const operation = state.undo[section];
  if (!operation) return;
  if (operation.type === "restore") {
    const existing = new Set(state[section].map((item) => item.id));
    state[section] = [...operation.items.filter((item) => !existing.has(item.id)), ...state[section]];
    await saveCollections();
  } else if (operation.type === "reopen") {
    if (isExtension) {
      for (const item of operation.items) await chrome.tabs.create({ url: item.url, active: false });
    } else {
      state.tabs.push(...operation.items.map((item, index) => ({ ...item, id: Date.now() + index, windowId: 1 })));
    }
  }
  state.undo[section] = null;
  document.querySelector(`#${section}-feedback`).textContent = "Action undone";
  await loadData({ quiet: true });
  document.querySelectorAll(`[data-section="${section}"] .site-card`).forEach((card, index) => {
    card.style.animationDelay = `${Math.min(index * 35, 140)}ms`;
    card.classList.add("is-restoring");
  });
  playSound("undo");
  showToast("Action undone");
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

async function completeAll() {
  if (!state.later.length) return;
  const confirmed = await askConfirmation({ title: "Complete everything?", copy: `This will mark all ${state.later.length} pages as done and remove them from For Later.`, confirmLabel: "Complete all" });
  if (confirmed) {
    await animateBulk("later");
    await removeCollectionItems("later", [...state.later], `${state.later.length} pages completed`);
  }
}

async function closeAll() {
  if (!state.tabs.length) return;
  const confirmed = await askConfirmation({ title: "Close all open tabs?", copy: `This will close ${state.tabs.length} tabs across your browser windows. Tabloom will stay open.`, confirmLabel: "Close all" });
  if (confirmed) {
    await animateBulk("open");
    await closeTabs([...state.tabs]);
  }
}

async function removeAll() {
  if (!state.saved.length) return;
  const confirmed = await askConfirmation({ title: "Remove everything from Saved?", copy: `This will remove all ${state.saved.length} saved pages. It will not close any open tabs.`, confirmLabel: "Remove all" });
  if (confirmed) {
    await animateBulk("saved");
    await removeCollectionItems("saved", [...state.saved], `${state.saved.length} saved pages removed`);
  }
}

let toastTimer;
function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("is-visible"), 2200);
}

function bindEvents() {
  resizeClickSparkCanvas();
  window.addEventListener("resize", resizeClickSparkCanvas, { passive: true });
  document.addEventListener("pointermove", updatePointerDrag);
  document.addEventListener("pointerup", finishPointerDrag);
  document.addEventListener("pointercancel", finishPointerDrag);
  document.addEventListener("pointerdown", () => {
    if (state.sound === "off") return;
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  }, { passive: true });
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button, a, select, .page-main")
      : null;
    if (target) emitClickSpark(event, cursorEffectKind(target));
  }, true);
  refs.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  refs.theme.addEventListener("change", async (event) => {
    state.theme = event.target.value;
    applyTheme();
    await saveCollections();
  });
  refs.sound.addEventListener("change", async (event) => {
    state.sound = event.target.value;
    await saveCollections();
    if (state.sound !== "off") playSound("save", { preview: true });
    showToast(state.sound === "off" ? "Sounds off" : `${event.target.selectedOptions[0].text} sounds on`);
  });
  refs.openSort.addEventListener("change", async (event) => {
    state.openSort = event.target.value;
    await saveCollections();
    render();
    showToast(`${event.target.selectedOptions[0].text} applied`);
  });
  refs.resetOpenOrder.addEventListener("click", async () => {
    state.openOrder = [];
    state.openSort = "manual";
    refs.openSort.value = "manual";
    await saveCollections();
    render();
    showToast("Manual order reset");
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
  document.querySelector("#refresh").addEventListener("click", () => loadData());
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
    await saveCollections();
    render();
  }));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      refs.search.focus();
      refs.search.select();
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
  chrome.storage.onChanged.addListener((changes) => {
    if (Object.keys(changes).some((key) => key.startsWith("meta:"))) scheduleReload();
  });
}

bindEvents();
loadData({ quiet: true });
