function getMeta(names) {
  for (const selector of names) {
    const value = document.querySelector(selector)?.content?.trim();
    if (value) return value;
  }
  return "";
}

function sendPageMeta() {
  const summary = getMeta([
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]'
  ]);
  const siteName = getMeta(['meta[property="og:site_name"]', 'meta[name="application-name"]']);
  const faviconNode = document.querySelector('link[rel~="icon"]');
  let favicon = "";

  try {
    favicon = faviconNode?.href || new URL("/favicon.ico", location.origin).href;
  } catch {
    favicon = "";
  }

  chrome.runtime.sendMessage({
    type: "TABLOOM_PAGE_META",
    url: location.href,
    title: document.title,
    summary: summary.slice(0, 360),
    siteName: siteName.slice(0, 80),
    favicon
  }).catch(() => {});
}

// The background injects this file on demand for tabs that were already open when
// the extension loaded, which can land it in a page that already has it. Guard so
// only the first copy registers listeners.
if (!globalThis.__tabloomContentScript) {
  globalThis.__tabloomContentScript = true;
  initTabloom();
}

function initTabloom() {
  // A small confirmation pill shown after keyboard shortcuts and context-menu actions.
  // It lives in a closed shadow root so the host page's CSS cannot restyle it.
  const TOAST_STYLE = `
    .toast {
      display: flex; align-items: center; gap: 9px;
      padding: 10px 14px 10px 12px;
      border: 1px solid rgb(255 255 255 / 10%); border-radius: 11px;
      background: #1b1826; color: #f3f1f8;
      box-shadow: 0 12px 32px rgb(0 0 0 / 28%);
      font: 600 13px/1.2 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      opacity: 0; transform: translateY(8px);
      transition: opacity .18s ease, transform .22s cubic-bezier(.2,.8,.2,1);
    }
    .toast.is-in { opacity: 1; transform: none; }
    .mark { width: 7px; height: 7px; border-radius: 50%; background: #ff7a59; }
    .toast[data-tone="info"] .mark { background: #958fa7; }
    .toast[data-tone="error"] .mark { background: #ff8490; }
    .brand { color: #958fa7; font-weight: 500; }
    @media (prefers-reduced-motion: reduce) { .toast { transition: none; transform: none; } }
  `;

  let toastHost;
  let toastTimer;

  function showTabloomToast(message, tone = "success") {
    toastHost?.remove();
    clearTimeout(toastTimer);

    toastHost = document.createElement("tabloom-toast");
    toastHost.style.cssText = "all: initial; position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;";
    const root = toastHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = TOAST_STYLE;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.tone = tone;
    toast.setAttribute("role", "status");
    const mark = document.createElement("span");
    mark.className = "mark";
    const text = document.createElement("span");
    text.textContent = message;
    const brand = document.createElement("span");
    brand.className = "brand";
    brand.textContent = "Tabloom";
    toast.append(mark, text, brand);
    root.append(style, toast);
    document.documentElement.append(toastHost);

    requestAnimationFrame(() => toast.classList.add("is-in"));
    const host = toastHost;
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-in");
      setTimeout(() => host.remove(), 240);
    }, 2000);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TABLOOM_TOAST" && typeof message.message === "string") {
      showTabloomToast(message.message, message.tone);
    }
  });

  sendPageMeta();
  new MutationObserver(() => {
    clearTimeout(window.__tabloomMetaTimer);
    window.__tabloomMetaTimer = setTimeout(sendPageMeta, 800);
  }).observe(document.head || document.documentElement, { childList: true, subtree: true });
}
