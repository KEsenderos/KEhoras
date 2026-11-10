'use strict';
/*
 * app.js ― 画面の動き（タブ・加算・取り消し・設定・控え・更新ボタン）を受け持つファイル
 * 基づく仕様書：KEhoras 仕様書 v0.6
 * 困ったとき：データの計算は store.js、同期は sync.js、ドラムは drum.js を見てください。
 */

const TAB_IDS = ['add', 'history', 'settings'];
let undoNoteTimer = null;
let lastAddAt = 0;
let lastRenderedMonth = '';

function $(id) { return document.getElementById(id); }

// ===== 表示（描き直し） =====
function showNote(text) {
  const el = $('undo-note');
  el.textContent = text;
  if (undoNoteTimer) clearTimeout(undoNoteTimer);
  undoNoteTimer = text ? setTimeout(function () { el.textContent = ''; undoNoteTimer = null; }, 5000) : null;
}

// 加算ボタンの文字と押せるかどうか（ドラムを回すたびに呼ぶ）
function renderAddButton() {
  const mins = getDrumMinutes();
  const btn = $('add-btn');
  btn.textContent = TEXT.add + ' +' + formatHM(mins);
  btn.disabled = mins <= 0;
  $('add-hint').textContent = mins <= 0 ? TEXT.zeroHint : '';
}

// 年間（9月〜翌年8月）の合計・残り・「届くための1か月あたり」を表示する
function renderWeekCard(now) {
  const w = calcWeekGuide(now);
  const md = function (s) { const d = new Date(dayNum_(s) * 86400000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + WEEKDAY_NAMES[d.getUTCDay()] + ')'; };
  $('week-label').textContent = TEXT.weekLabelPre + md(w.start) + '〜' + md(w.end) + (w.clipped ? TEXT.weekClipped : '');
  const left = $('week-left');
  left.classList.toggle('done', w.monthDone || w.weekDone);
  if (w.monthDone) {
    left.textContent = TEXT.weekMonthDone;
    $('week-meta').textContent = '';
  } else if (w.weekDone) {
    left.textContent = TEXT.weekDone;
    $('week-meta').textContent = TEXT.weekMeta.replace('{q}', formatHM(w.quota)).replace('{a}', formatHM(w.added)) + TEXT.weekAvgSep + TEXT.weekAvg.replace('{v}', formatHM(w.avg));
  } else {
    left.textContent = TEXT.weekLeftPre + formatHM(w.left);
    $('week-meta').textContent = TEXT.weekMeta.replace('{q}', formatHM(w.quota)).replace('{a}', formatHM(w.added)) + TEXT.weekAvgSep + TEXT.weekAvg.replace('{v}', formatHM(w.avg));
  }
  const e = (w.weekStartDay + 6) % 7;
  $('week-rule').textContent = TEXT.weekRule.replace('{s}', WEEKDAY_NAMES[w.weekStartDay]).replace('{e}', WEEKDAY_NAMES[e]);
}

function renderYearCard(now) {
  const y = calcYearProgress(now);
  const key = Number(y.key);
  $('year-label').textContent = '年間 ' + key + '年度（9月〜8月）';
  $('year-total-text').textContent = formatHM(y.total) + ' / ' + formatHM(y.target);
  $('year-progress-fill').style.width = y.pct + '%';
  $('year-progress-fill').classList.toggle('done', y.done);
  $('year-percent-text').textContent = y.pct + '%';
  $('year-remain-text').textContent = y.done ? TEXT.yearAchieved : TEXT.remain + ' ' + formatHM(y.remain);
  $('year-remain-text').classList.toggle('done', y.done);
  $('year-avg-pre').textContent = y.done ? '' : TEXT.yearLeftPre + y.monthsLeft + TEXT.yearLeftMid;
  $('year-avg-val').textContent = y.done ? '' : TEXT.yearLeftVal + ' ' + formatHM(y.perMonth) + ' ' + TEXT.yearLeftPost;
}

function renderAddTab() {
  const now = new Date();
  const month = monthStr(now);
  const total = monthTotal(month);
  const target = monthTarget(month);
  $('month-label').textContent = month.slice(0, 4) + '年' + Number(month.slice(5)) + '月';
  $('total-text').textContent = formatHM(total) + ' / ' + formatHM(target);
  const pct = Math.min(100, Math.floor(total * 100 / target));
  $('progress-fill').style.width = pct + '%';
  $('progress-fill').classList.toggle('done', total >= target);
  $('percent-text').textContent = pct + '%';
  let remain;
  if (total < target) remain = TEXT.remain + ' ' + formatHM(target - total);
  else if (total === target) remain = TEXT.achieved;
  else remain = TEXT.achieved + ' +' + formatHM(total - target) + ' ' + TEXT.over;
  $('remain-text').textContent = remain;
  $('remain-text').classList.toggle('done', total >= target);
  renderWeekCard(now);
  renderYearCard(now);
  renderAddButton();
  const u = peekUndo();
  const ub = $('undo-btn');
  ub.disabled = !u;
  ub.textContent = u ? TEXT.undo + '（' + formatHM(u.minutes) + '）' : TEXT.undoNone;
  if (!storageOk) $('storage-warn').textContent = TEXT.storageNg; else $('storage-warn').textContent = '';
}


function renderHistoryTab() {
  const cur = monthStr(new Date());
  const list = loadRecords().filter(function (r) { return !r.deleted && r.month === cur; })
    .sort(function (a, b) { return a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0); });
  const ul = $('history-list');
  ul.innerHTML = '';
  if (list.length === 0 && monthBase(cur) === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = TEXT.noRecords;
    ul.appendChild(li);
  }
  const base = monthBase(cur);
  if (base > 0) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = TEXT.baseRow;
    const b = document.createElement('strong');
    b.textContent = '+' + formatHM(base);
    li.appendChild(a);
    li.appendChild(b);
    ul.appendChild(li);
  }
  list.forEach(function (r) {
    const d = new Date(r.ts);
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    const b = document.createElement('strong');
    b.textContent = '+' + formatHM(r.minutes);
    li.appendChild(a);
    li.appendChild(b);
    ul.appendChild(li);
  });
  const months = listMonths();
  const ml = $('month-list');
  ml.innerHTML = '';
  if (months.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = TEXT.noMonths;
    ml.appendChild(li);
  }
  months.forEach(function (m) {
    const total = monthTotal(m);
    const target = monthTarget(m);
    const pct = Math.floor(total * 100 / target);
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = m.slice(0, 4) + '年' + Number(m.slice(5)) + '月';
    const b = document.createElement('strong');
    b.textContent = '合計 ' + formatHM(total) + ' / 目標 ' + formatHM(target) + '　' + pct + '%' + (total >= target ? ' ✓' : '');
    li.appendChild(a);
    li.appendChild(b);
    ml.appendChild(li);
  });
}

function renderSettingsTab() {
  const s = loadSettings();
  $('set-target').value = String(s.targetMin / 60);
  $('set-year-target').value = String(s.yearTargetMin / 60);
  $('set-week-start').value = String(s.weekStartDay);
  renderBaseFields();
  $('set-add-hour').value = String(Math.floor(s.addDefaultMin / 60));
  $('set-add-min').value = String(s.addDefaultMin % 60);
  $('set-url').value = lsGet(KEY_SYNC_URL) || '';
  $('set-pass').value = lsGet(KEY_SYNC_PASS) || '';
  $('set-error').textContent = '';
  $('set-fixed').textContent = lastSettingsFixes.length ? TEXT.settingsFixed + lastSettingsFixes.join('、') : '';
  $('set-theme').value = getThemeChoice();
  $('app-version').textContent = 'KEhoras v' + APP_VERSION;
}

// 「使う前の分」の入力欄：今の年度の、今月までの月を選べる。選んだ月の今の値を入れる
function renderBaseFields() {
  const cur = monthStr(new Date());
  const sel = $('base-month');
  const keep = sel.value;
  sel.innerHTML = '';
  yearMonths(yearKeyOfMonth(cur)).filter(function (m) { return m <= cur; }).forEach(function (m) {
    sel.appendChild(new Option(m.slice(0, 4) + '年' + Number(m.slice(5)) + '月', m));
  });
  sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : cur;
  fillBaseValue();
}

function fillBaseValue() {
  const v = monthBase($('base-month').value);
  $('base-hour').value = String(Math.floor(v / 60));
  $('base-min').value = String(v % 60);
}

// 「この月に入れる」：選んだ月の「使う前の分」を置き換える
function onBaseSet() {
  const month = $('base-month').value;
  const hRaw = $('base-hour').value.trim();
  const min = Number($('base-min').value);
  $('base-msg').textContent = '';
  const h = /^\d+$/.test(hRaw) ? Number(hRaw) : NaN;
  const total = h * 60 + min;
  if (!isValidBaseMin_(total)) {
    $('base-error').textContent = '時間は0〜' + (MAX_BASE_MIN / 60) + 'の整数で入力してください';
    return;
  }
  $('base-error').textContent = '';
  let ok = false;
  try { ok = setMonthBase(month, total); } catch (e) { ok = false; }
  $('base-msg').textContent = ok
    ? Number(month.slice(5)) + '月の使う前の分を ' + formatHM(total) + ' ' + TEXT.baseSet
    : TEXT.saveFail;
  renderAll();
  if (isSyncConfigured()) syncNow(true);
}

function renderSyncStatus() {
  const k = syncState.kind;
  let text = syncState.text;
  if (k === 'none') text = isSyncConfigured() ? '' : TEXT.syncNone;
  $('sync-status').textContent = text;
  $('sync-status').classList.toggle('error', k === 'error');
  $('sync-retry-btn').hidden = k !== 'error';
  $('set-sync-msg').textContent = text;
}

function renderAll() {
  lastRenderedMonth = monthStr(new Date());
  renderAddTab();
  renderHistoryTab();
  renderSyncStatus();
}

// ===== タブ =====
function switchTab(tabId) {
  if (TAB_IDS.indexOf(tabId) < 0) tabId = 'add';
  TAB_IDS.forEach(function (id) {
    $('panel-' + id).classList.toggle('active', id === tabId);
  });
  if (tabId === 'settings' && typeof renderSettingsTab === 'function') renderSettingsTab(); // 同期で変わった値も最新にする
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    const on = b.dataset.tab === tabId;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  lsSet(KEY_LAST_TAB, tabId);
  if (tabId === 'add') refreshDrums();
  if (tabId === 'settings') renderSettingsTab();
  window.scrollTo(0, 0);
}

// ===== 操作 =====
function onAddClick() {
  const nowMs = Date.now();
  if (nowMs - lastAddAt < 300) return;
  const mins = getDrumMinutes();
  if (mins <= 0) return;
  lastAddAt = nowMs;
  try {
    addRecord(mins);
  } catch (e) {
    showNote(e.message === 'TOO_MANY' ? TEXT.tooMany : TEXT.saveFail);
    return;
  }
  setDrumMinutes(loadSettings().addDefaultMin);
  showNote('');
  renderAll();
  syncNow(true);
}

function onUndoClick() {
  let rec;
  try {
    rec = undoLast();
  } catch (e) {
    showNote(TEXT.saveFail);
    return;
  }
  if (!rec) return;
  renderAll();
  showNote(TEXT.undone + '（' + formatHM(rec.minutes) + '）');
  syncNow(true);
}

function onSaveSettings() {
  // 入力欄の値は、最初にまとめて読む
  const targetRaw = $('set-target').value.trim();
  const yearRaw = $('set-year-target').value.trim();
  const weekStart = Number($('set-week-start').value);
  const addHour = Number($('set-add-hour').value);
  const addMin = Number($('set-add-min').value);
  const url = $('set-url').value.trim();
  const pass = $('set-pass').value.trim();
  const errors = [];
  $('set-fixed').textContent = ''; // 前回の「保存しました」を残さない
  const targetHours = /^\d+$/.test(targetRaw) ? Number(targetRaw) : NaN;
  const yearHours = /^\d+$/.test(yearRaw) ? Number(yearRaw) : NaN;
  const cand = { targetMin: targetHours * 60, addDefaultMin: addHour * 60 + addMin, yearTargetMin: yearHours * 60, weekStartDay: weekStart };
  const v = validateSettings(cand);
  Object.keys(v.errors).forEach(function (k) { errors.push(v.errors[k]); });
  const sv = validateSyncInput(url, pass);
  Object.keys(sv.errors).forEach(function (k) { errors.push(sv.errors[k]); });
  if (errors.length) {
    $('set-error').textContent = errors.join('\n');
    return;
  }
  const s = loadSettings();
  s.targetMin = cand.targetMin;
  s.addDefaultMin = cand.addDefaultMin;
  s.yearTargetMin = cand.yearTargetMin;
  s.weekStartDay = cand.weekStartDay;
  s.monthTargets[monthStr(new Date())] = cand.targetMin;
  s.updatedAt = nextTime();
  if (!saveSettings(s) || !lsSet(KEY_SYNC_URL, url) || !lsSet(KEY_SYNC_PASS, pass)) {
    $('set-error').textContent = TEXT.saveFail;
    return;
  }
  setDrumMinutes(s.addDefaultMin);
  $('set-error').textContent = '';
  $('set-fixed').textContent = TEXT.saved;
  syncState.kind = 'none';
  renderAll();
  if (url && pass) syncNow(true);
}

// 見た目の選択：選んだ瞬間に画面へ当てて保存する（［保存する］は不要）
function onThemeChange() {
  const ok = setThemeChoice($('set-theme').value);
  $('set-fixed').textContent = ok ? TEXT.themeChanged : TEXT.themeNotSaved;
}

function onExportClick() {
  const blob = new Blob([exportBackup()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'KEhoras_backup_' + dayStr(new Date()) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  $('set-fixed').textContent = TEXT.exported;
}

function onImportFile(ev) {
  const input = ev.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!window.confirm(TEXT.importConfirm)) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const r = importBackup(String(reader.result));
      $('set-error').textContent = '';
      $('set-fixed').textContent = TEXT.imported + '（' + r.total + '件中、新しく' + r.added + '件）';
      setDrumMinutes(loadSettings().addDefaultMin);
      renderSettingsTab();
      $('set-fixed').textContent = TEXT.imported + '（' + r.total + '件中、新しく' + r.added + '件）';
      renderAll();
      syncNow(true);
    } catch (e) {
      const names = {
        BACKUP_NOT_JSON: '控えのファイルが壊れています（JSONではありません）',
        BACKUP_BAD_FORMAT: 'KEhorasの控えのファイルではありません',
        BACKUP_BAD_SCHEMA: '形の版が違う控えです',
        BACKUP_BAD_RECORDS: '控えの中に壊れた記録があります',
        TOO_MANY: TEXT.tooMany,
        SAVE_FAIL: TEXT.saveFail,
      };
      $('set-error').textContent = (names[e.message] || '読み込めませんでした') + '。記録は変えていません';
    }
  };
  reader.onerror = function () { $('set-error').textContent = '読み込めませんでした。記録は変えていません'; };
  reader.readAsText(file);
}

// ===== 前面に戻ったとき・定期 =====
function onVisible() {
  if (document.visibilityState !== 'visible') return;
  ensureMonthTarget(monthStr(new Date()));
  renderAll();
  refreshDrums();
  syncNow(false);
}

function onTick() {
  if (monthStr(new Date()) !== lastRenderedMonth) {
    ensureMonthTarget(monthStr(new Date()));
    renderAll();
  }
}

// ===== 更新ボタン =====
let swRegistration = null;
let lastUpdateCheck = 0;
let updateRequested = false;

async function initUpdateNotice() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    return;
  }
  lastUpdateCheck = Date.now();
  if (swRegistration.waiting && navigator.serviceWorker.controller) showUpdateButton();
  swRegistration.addEventListener('updatefound', function () {
    const worker = swRegistration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateButton();
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  $('update-btn').addEventListener('click', applyUpdate);
}

function checkForUpdate() {
  if (!swRegistration) return;
  if (Date.now() - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
  lastUpdateCheck = Date.now();
  swRegistration.update().catch(function () {}); // 電波が無いときは何もしない
}

function showUpdateButton() {
  $('update-btn').hidden = false;
}

function applyUpdate() {
  $('update-btn').hidden = true;
  const waiting = swRegistration && swRegistration.waiting;
  if (waiting) {
    updateRequested = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    location.reload();
  }
}

// ===== 起動 =====
function initApp() {
  $('update-btn').textContent = TEXT.updateBtn;
  getDeviceId();
  saveRecords(purgeTombstones(loadRecords()));
  const s = loadSettings();
  ensureMonthTarget(monthStr(new Date()));
  initDrums();
  setDrumMinutes(s.addDefaultMin);

  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.dataset.tab); });
  });
  $('add-btn').addEventListener('click', onAddClick);
  $('undo-btn').addEventListener('click', onUndoClick);
  $('set-save-btn').addEventListener('click', onSaveSettings);
  $('set-theme').addEventListener('change', onThemeChange);
  $('base-month').addEventListener('change', fillBaseValue);
  $('base-set-btn').addEventListener('click', onBaseSet);
  $('sync-now-btn').addEventListener('click', function () { syncNow(true); });
  $('sync-retry-btn').addEventListener('click', function () { syncNow(true); });
  $('export-btn').addEventListener('click', onExportClick);
  $('import-file').addEventListener('change', onImportFile);
  document.addEventListener('visibilitychange', onVisible);
  setInterval(onTick, 60000);

  const hours = $('set-add-hour');
  for (let h = 0; h <= MAX_ADD_HOURS; h++) hours.appendChild(new Option(pad2(h), String(h)));
  const mins = $('set-add-min');
  for (let m = 0; m < 60; m += MINUTE_STEP) mins.appendChild(new Option(pad2(m), String(m)));
  const wsel = $('set-week-start');
  for (let d = 0; d < 7; d++) wsel.appendChild(new Option(WEEKDAY_NAMES[d] + '曜日' + (d === DEFAULT_WEEK_START ? '（初期値）' : ''), String(d)));
  const bmins = $('base-min');
  for (let m = 0; m < 60; m += MINUTE_STEP) bmins.appendChild(new Option(pad2(m), String(m)));

  renderSettingsTab();
  switchTab(lsGet(KEY_LAST_TAB));
  renderAll();
  initUpdateNotice();
  syncNow(true);
}

document.addEventListener('DOMContentLoaded', initApp);
