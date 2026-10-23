const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'tabloom') + path.sep;

function boot({ stored = {}, tabs = [], uiLang = 'en-US' }) {
  const store = JSON.parse(JSON.stringify(stored)), listeners = {}, log = [];
  const on = (n) => ({ addListener: (f) => (listeners[n] = listeners[n] || [], listeners[n].push(f)) });
  const chrome = {
    runtime: { getURL: (p) => 'chrome-extension://x/' + p, lastError: undefined, onInstalled: on('installed'), onStartup: on('startup'), onMessage: on('msg') },
    i18n: { getUILanguage: () => uiLang },
    storage: {
      local: {
        get: async (k) => { if (k == null) return { ...store }; const ks = [].concat(k); return Object.fromEntries(ks.filter((x) => x in store).map((x) => [x, store[x]])); },
        set: async (o) => { const changes = {}; for (const [k, v] of Object.entries(o)) { changes[k] = { newValue: v }; store[k] = v; } (listeners.changed || []).forEach((f) => f(changes, 'local')); },
        remove: async () => {}
      },
      onChanged: on('changed')
    },
    contextMenus: { create: () => {}, update: () => {}, removeAll: (cb) => cb && cb(), onClicked: on('menu') },
    commands: { onCommand: on('cmd') },
    action: { onClicked: on('action'), setBadgeText: async (o) => log.push(['badge', o.text]), setBadgeBackgroundColor: async (o) => log.push(['badgeColor', o.color]) },
    alarms: { create: (n) => log.push(['alarmCreate', n]), onAlarm: on('alarm') },
    notifications: { create: (id, o) => log.push(['notify', id, o.title, o.message]), clear: () => {}, onClicked: on('notifyClick') },
    tabs: { query: async () => tabs, create: async () => {}, getCurrent: async () => ({ windowId: 1 }), discard: async (id) => { log.push(['discard', id]); return true; }, onRemoved: on('removed'), sendMessage: async () => {} },
    scripting: { executeScript: async () => {} },
    windows: { update: async () => {} }
  };
  const ctx = { chrome, crypto, navigator: { language: uiLang }, setTimeout, clearTimeout, console, URL,
    importScripts: (f) => vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(dir + 'background.js', 'utf8'), ctx);
  return { listeners, log, store };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n, c, x = '') => { if (!c) process.exitCode = 1; console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); };
const fire = (l, name, ...a) => Promise.all((l[name] || []).map((f) => f(...a)));

(async () => {
  // 1. reminders coming due
  const past = Date.now() - 60000;
  const b1 = boot({ stored: { language: 'en', later: [
    { id: 'a', url: 'https://x.com/', title: 'X page', addedAt: 0, remindAt: past },
    { id: 'b', url: 'https://y.com/', title: 'Y page', addedAt: 0, remindAt: Date.now() + 86400000 },
    { id: 'c', url: 'https://z.com/', title: 'Z page', addedAt: 0 }
  ] } });
  await sleep(40);
  await fire(b1.listeners, 'alarm', { name: 'tabloom:reminders' }); await sleep(40);
  const a = b1.store.later.find((i) => i.id === 'a');
  ok('reminder promoted to due', a.remindAt === undefined && a.remindedAt > 0, JSON.stringify({ remindAt: a.remindAt, remindedAt: !!a.remindedAt }));
  ok('future reminder untouched', b1.store.later.find((i) => i.id === 'b').remindAt > Date.now());
  ok('badge set to due count', b1.log.some(([t, v]) => t === 'badge' && v === '1'), JSON.stringify(b1.log.filter((l) => l[0] === 'badge')));
  ok('notification sent', b1.log.some((l) => l[0] === 'notify' && /X page/.test(l[2])), JSON.stringify(b1.log.find((l) => l[0] === 'notify') || []));
  ok('both alarms registered', b1.log.filter((l) => l[0] === 'alarmCreate').length === 2, JSON.stringify(b1.log.filter((l) => l[0] === 'alarmCreate')));
  await fire(b1.listeners, 'alarm', { name: 'tabloom:reminders' }); await sleep(40);
  ok('second sweep clears badge', b1.log.some(([t, v]) => t === 'badge' && v === ''), JSON.stringify(b1.log.filter((l) => l[0] === 'badge').map((l) => l[1])));

  // 2. auto-sleep thresholds and skips
  const now = Date.now();
  const tabs = [
    { id: 1, url: 'https://a.com/', active: true, lastAccessed: now - 9e6 },
    { id: 2, url: 'https://b.com/', pinned: true, lastAccessed: now - 9e6 },
    { id: 3, url: 'https://c.com/', audible: true, lastAccessed: now - 9e6 },
    { id: 4, url: 'https://d.com/', discarded: true, lastAccessed: now - 9e6 },
    { id: 5, url: 'https://e.com/', autoDiscardable: false, lastAccessed: now - 9e6 },
    { id: 6, url: 'chrome://settings', lastAccessed: now - 9e6 },
    { id: 7, url: 'https://f.com/', lastAccessed: now - 60 * 1000 },
    { id: 8, url: 'https://g.com/', lastAccessed: now - 3 * 3600000 }
  ];
  const b2 = boot({ stored: { language: 'en', autoSleep: '60' }, tabs });
  await sleep(40);
  await fire(b2.listeners, 'alarm', { name: 'tabloom:sleep' }); await sleep(40);
  const slept = b2.log.filter((l) => l[0] === 'discard').map((l) => l[1]);
  ok('only the idle web tab sleeps', slept.length === 1 && slept[0] === 8, JSON.stringify(slept));
  b2.log.length = 0;
  b2.store.autoSleep = '240';
  await fire(b2.listeners, 'changed', { autoSleep: { newValue: '240' } }, 'local'); await sleep(40);
  ok('4 h threshold spares the 3 h tab', b2.log.filter((l) => l[0] === 'discard').length === 0, JSON.stringify(b2.log));
  const b3 = boot({ stored: { language: 'en', autoSleep: 'off' }, tabs });
  await sleep(40);
  await fire(b3.listeners, 'alarm', { name: 'tabloom:sleep' }); await sleep(40);
  ok('off sleeps nothing', b3.log.filter((l) => l[0] === 'discard').length === 0);

  // 3. Chinese notification copy
  const b4 = boot({ stored: { language: 'zh', later: [{ id: 'a', url: 'https://x.com/', title: 'X', addedAt: 0, remindAt: past }] } });
  await sleep(40);
  await fire(b4.listeners, 'alarm', { name: 'tabloom:reminders' }); await sleep(40);
  const n = b4.log.find((l) => l[0] === 'notify');
  ok('zh notification copy', /提醒|打开/.test((n && n[3]) || ''), JSON.stringify(n || []));
  console.log('done');
})();
