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

sendPageMeta();
new MutationObserver(() => {
  clearTimeout(window.__tabloomMetaTimer);
  window.__tabloomMetaTimer = setTimeout(sendPageMeta, 800);
}).observe(document.head || document.documentElement, { childList: true, subtree: true });
