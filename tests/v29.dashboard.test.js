const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dir = path.join(__dirname, '..', 'tabloom') + path.sep;

const html = fs.readFileSync(dir + 'dashboard.html', 'utf8').replace(/<script src[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://preview.local/dashboard.html' });
const w = dom.window, d = w.document;

w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.structuredClone = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
w.Element.prototype.scrollIntoView = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.crypto.randomUUID = () => Math.random().toString(36).slice(2);
w.AudioContext = undefined;
w.webkitAudioContext = undefined;

w.eval(fs.readFileSync(dir + 'i18n.js', 'utf8'));
w.eval(fs.readFileSync(dir + 'dashboard.js', 'utf8') + '\nwindow.__x=(c)=>eval(c);');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n, c, x = '') => { if (!c) process.exitCode = 1; console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); };
const run = (js) => w.__x(js);

(async () => {
  await sleep(60);
  const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];

  // F1 duplicate chip
  const chips = $$('.dup-chip');
  ok('F1 dup-chip rendered', chips.length >= 1, `count=${chips.length} label="${chips[0] && chips[0].textContent}"`);
  const before = run('state.tabs.length');
  chips[0].click(); await sleep(400);
  const after = run('state.tabs.length');
  ok('F1 merge closes extras', after < before, `${before} -> ${after}`);
  ok('F1 toast + undo', /Closed|已关闭/.test($('#toast').textContent) || !!run('state.undo.open'), $('#toast').textContent.trim());

  // F2 stash — the entry point lives on the For Later side, one window per gesture
  const trigger = $('#stash-window');
  ok('F2 stash trigger in For Later', !!trigger && trigger.closest('[data-section="later"]') !== null, trigger && trigger.textContent);
  ok('F2 no window chips in Open Tabs', $$('.window-chip').length === 0, `window-chip=${$$('.window-chip').length}`);
  const tabsBefore = run('state.tabs.length');
  trigger.click(); await sleep(40);
  const stashOptions = $$('#remind-menu .stash-option');
  ok('F2 picker lists windows', !$('#remind-menu').hidden && stashOptions.length === 2, stashOptions.map((n) => n.textContent).join(' | '));
  stashOptions[0].click(); await sleep(320);
  ok('F2 stash stored', run('state.stashes.length') === 2 && run('state.tabs.length') < tabsBefore, `tabs ${tabsBefore}->${run('state.tabs.length')} stashes=${run('state.stashes.length')}`);
  ok('F2 stash chip visible', $$('.stash-chip').length === 2, $$('.stash-chip').map((n) => n.querySelector('.stash-copy strong').textContent).join(' | '));
  ok('F2 stash shelf sits in For Later', $$('[data-section="later"] .stash-chip').length === 2);
  ok('F2 undo pending', run('state.undo.open && state.undo.open.type') === 'unstash');
  $('.stash-chip .restore-button').click(); await sleep(200);
  ok('F2 restore clears set', run('state.stashes.length') === 1, `stashes=${run('state.stashes.length')}`);

  // F2b delete a stashed set, then undo it back
  run('state.stashes=[{id:"s1",createdAt:Date.now()-9e7,tabs:[{url:"https://a.com/",title:"A"},{url:"https://b.com/",title:"B"}]}];render()');
  await sleep(30);
  $$('.stash-chip .row-action').at(-1).click(); await sleep(60);
  ok('F2 delete stash undoable', run('state.stashes.length') === 0 && run('state.undo.open && state.undo.open.type') === 'restoreStash');
  run('undo("open")'); await sleep(60);
  ok('F2 undo restores stash', run('state.stashes.length') === 1);
  run('state.stashes=[];persist("stashes");render()');

  // F3 sleep
  run('state.tabs=state.tabs.map((t,i)=>i===2?{...t,lastAccessed:Date.now()-7*3600000,discarded:false}:t);render()');
  await sleep(30);
  const sleepBtn = $('.sleep-button');
  ok('F3 sleep button present', !!sleepBtn, sleepBtn && sleepBtn.textContent);
  sleepBtn.click(); await sleep(120);
  ok('F3 tab discarded', run('state.tabs.some(t=>t.discarded)'), run('state.tabs.filter(t=>t.discarded).length') + ' discarded');
  ok('F3 sleeping status shown', $$('.page-status.is-sleeping').length >= 1, $$('.page-status.is-sleeping')[0] && $$('.page-status.is-sleeping')[0].textContent);
  d.querySelector('[data-setting="autoSleep"] [data-value="60"]').click(); await sleep(60);
  ok('F3 autoSleep persisted', run('state.autoSleep') === '60' && run('getDemoStore().autoSleep') === '60', $('#toast').textContent.trim());
  d.querySelector('[data-setting="autoSleep"] [data-value="off"]').click(); await sleep(40);

  // F4 reminders
  const bell = $('[data-section="later"] .remind-button');
  ok('F4 remind button', !!bell, bell && bell.dataset.tooltip);
  bell.click(); await sleep(40);
  ok('F4 menu opens', !$('#remind-menu').hidden, $$('#remind-menu .remind-option').map((n) => n.textContent).join(' | '));
  $$('#remind-menu .remind-option')[0].click(); await sleep(80);
  ok('F4 reminder stored', run('!!state.later.find(i=>i.remindAt)'), String(run('state.later.find(i=>i.remindAt) && state.later.find(i=>i.remindAt).remindAt')));
  ok('F4 row shows reminder', !!$('[data-section="later"] .page-reminder'), $('.page-reminder') && $('.page-reminder').textContent);
  ok('F4 demo item has remindAt', run('getDemoStore().later.some(i=>i.remindAt)'));
  $('[data-section="later"] .remind-button').click(); await sleep(30);
  const custom = $('#remind-menu input[type="datetime-local"]');
  ok('F4 custom reminder prefills existing time', !!custom && !!custom.value);
  const future = new Date(Date.now() + 3 * 86400000);
  future.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  custom.value = `${future.getFullYear()}-${pad(future.getMonth()+1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
  custom.dispatchEvent(new w.Event('input', { bubbles: true }));
  $('#remind-menu .remind-custom-apply').click(); await sleep(80);
  ok('F4 custom reminder saves chosen time', run(`state.later.some(i=>i.remindAt===${future.getTime()})`));
  run('state.later=state.later.map((i,n)=>n===0?{...i,remindAt:undefined,remindedAt:Date.now()-1000}:i);render()');
  await sleep(30);
  ok('F4 due label', /Reminder came due|提醒已到期/.test(($('[data-section="later"] .page-reminder') || {}).textContent || ''), $('[data-section="later"] .page-reminder') && $('[data-section="later"] .page-reminder').textContent);
  ok('F4 row flagged due', $('[data-section="later"] .page-row[data-reminder="due"]') !== null);

  // F5 compost
  ok('F5 compost box', !!$('.compost'), $('.compost-copy strong') && $('.compost-copy strong').textContent);
  ok('F5 compost art', !!$('.compost-art use'));
  const laterBefore = run('state.later.length');
  $('.compost-save').click(); await sleep(150);
  ok('F5 move to saved', run('state.later.length') < laterBefore && run('state.saved.length') > 1, `later ${laterBefore}->${run('state.later.length')} saved=${run('state.saved.length')}`);
  ok('F5 compost stamp', run('state.compostAt') > 0 && run('getDemoStore().compostAt') > 0);
  ok('F5 undo move', run('state.undo.later && state.undo.later.type') === 'move');
  run('undo("later")'); await sleep(80);
  ok('F5 undo restores later', run('state.later.length') === laterBefore && run('state.saved.length') === 1, `later=${run('state.later.length')}`);
  run('state.compostAt=Date.now();render()'); await sleep(20);
  ok('F5 hides for a week', $('.compost') === null);
  run('state.compostAt=0;render()'); await sleep(20);

  // F6 bloom poses
  const bm = $('.brand-mark');
  ok('F6 bloom open', bm.dataset.bloom === 'open' && /tab|标签页/.test($('.brand').dataset.tooltip || ''), $('.brand').dataset.tooltip);
  run('state.tabs=[...Array(25)].map((_,i)=>({id:900+i,windowId:1,title:"t"+i,url:"https://e"+i+".com/",active:false,lastAccessed:Date.now()}));render()');
  await sleep(30);
  ok('F6 bloom droop', bm.dataset.bloom === 'droop', $('.brand').dataset.tooltip);
  run('state.tabs=[...Array(45)].map((_,i)=>({id:900+i,windowId:1,title:"t"+i,url:"https://e"+i+".com/",active:false,lastAccessed:Date.now()}));render()');
  await sleep(30);
  ok('F6 bloom closed', bm.dataset.bloom === 'closed', $('.brand').dataset.tooltip);

  // F7 v2.9.2 empty states use copy without illustrations
  run('state.saved=[];state.later=[];state.tabs=[];render()'); await sleep(30);
  const arts = $$('.module-empty').map((n) => n.dataset.art + ':' + !!n.querySelector('.empty-art use'));
  ok('F7 all three empties show copy without art', $$('.module-empty').length === 3 && $$('.module-empty').every((n) => n.textContent.trim() && !n.querySelector('svg')), arts.join(' '));

  // F8 celebration
  const petals = () => $$('.petal-burst').length;
  run('state.celebratedAt=0;state.later=[{id:"x",url:"https://a.com/",title:"A",addedAt:Date.now()}]');
  run('removeCollectionItems("later",[{id:"x"}],t("toast.done"))'); await sleep(60);
  ok('F8 celebrate triggers', run('state.celebratedAt') > 0 || bm.classList.contains('is-celebrating') || petals() > 0, `petal-burst=${petals()} celebrating=${bm.classList.contains('is-celebrating')}`);
  await sleep(1500);
  ok('F8 burst cleaned up', petals() === 0);
  ok('F8 cleared copy', /All clear|全部搞定/.test(($('.module-empty[data-art="cleared"]') || {}).textContent || ''), $('.module-empty[data-art="cleared"]') && $('.module-empty[data-art="cleared"]').textContent);

  // Palette commands for the new features
  run('state.stashes=[];persist("stashes");loadData()'); await sleep(80);
  $('#open-palette').click(); await sleep(20);
  const inp = $('#palette-input'); inp.value = '>'; inp.dispatchEvent(new w.Event('input')); await sleep(20);
  const cmds = $$('.palette-option .palette-title').map((n) => n.textContent);
  ok('palette commands include stash + sleep', cmds.some((c) => /Stash|收起/.test(c)) && cmds.some((c) => /Sleep|休眠/.test(c)), cmds.slice(0, 5).join(' | '));
  inp.value = '> stash'; inp.dispatchEvent(new w.Event('input')); await sleep(20);
  ok('english keywords work', $$('.palette-option .palette-title').length > 0, $$('.palette-option .palette-title').map((n) => n.textContent).join(' | '));

  console.log('done');
  w.close();
})();
