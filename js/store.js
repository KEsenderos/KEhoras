'use strict';
/*
 * store.js ― 記録と設定を端末に保存し、合計や月の計算を行うファイル
 * 基づく仕様書：KEhoras 仕様書 v0.8
 * このファイルは「データ」と「計算」だけを受け持ちます。画面の操作は app.js にあります。
 */

// ===== 定数 =====
const APP_VERSION = '0.8';
const CACHE_VERSION = 'keh-cache-v0.8';
const DEFAULT_WEEK_START = 6;         // 1週間の始まりの曜日の初期値（0=日 … 6=土）。土曜〜金曜
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_START_HOUR = 0;            // 1日の区切り（時）。月の区切りもこれで決める
const DEFAULT_TARGET_MIN = 3000;     // 目標の初期値（分）＝50時間
const DEFAULT_ADD_MIN = 120;         // 加算の初期値（分）＝02:00
const MINUTE_STEP = 5;               // 分のドラムの刻み
const MAX_ADD_HOURS = 12;            // 時のドラムの最大
const MAX_ADD_MIN = MAX_ADD_HOURS * 60 + 55; // 1回の加算の最大（分）＝12:55
const MAX_TARGET_HOURS = 999;        // 目標の最大（時間）
const YEAR_START_MONTH = 9;          // 年度の始まりの月（9月〜翌年8月）
const DEFAULT_YEAR_TARGET_MIN = 36000; // 年間目標の初期値（分）＝600時間
const MAX_YEAR_TARGET_HOURS = 9999;  // 年間目標の最大（時間）
const MAX_BASE_MIN = 44640;          // 「使う前の分」の1か月の最大（分）＝744時間
const MAX_RECORDS = 5000;            // 記録の最大件数
const TOMBSTONE_KEEP_DAYS = 180;     // 消した印を残す日数
const SYNC_MIN_INTERVAL_MS = 300000; // 前面に戻ったときの同期の最短間隔（5分）
const UPDATE_CHECK_INTERVAL_MS = 600000; // 更新の確認間隔（10分）
const DRUM_ITEM_HEIGHT = 44;         // ドラム1段の高さ（px）
const STORAGE_PREFIX = 'keh_';
const BACKUP_FORMAT = 'KEhoras-backup';
const BACKUP_SCHEMA = 1;
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

// 保存キー
const KEY_RECORDS = STORAGE_PREFIX + 'records';
const KEY_SETTINGS = STORAGE_PREFIX + 'settings';
const KEY_DEVICE_ID = STORAGE_PREFIX + 'deviceId';
const KEY_SYNC_URL = STORAGE_PREFIX + 'syncUrl';
const KEY_SYNC_PASS = STORAGE_PREFIX + 'syncPass';
const KEY_LAST_TAB = STORAGE_PREFIX + 'lastTab';
const KEY_LAST_SYNC_AT = STORAGE_PREFIX + 'lastSyncAt';
const KEY_PREV_BACKUP = STORAGE_PREFIX + 'prevBackup';

// 画面に出す文言
const TEXT = {
  add: '加算する',
  undo: '直前の加算を取り消す',
  undoNone: '取り消せる加算はありません',
  undone: '取り消しました',
  zeroHint: '0分は加算できません',
  achieved: '目標達成！',
  remain: '残り',
  over: '超過',
  synced: '同期済み',
  syncing: '同期中…',
  syncNone: '同期していません（設定タブ）',
  retry: 'もう一度',
  updateBtn: '新しい版があります。押すと更新します',
  noRecords: 'まだ記録がありません',
  noMonths: '過去の月はありません',
  importConfirm: '記録を足し合わせます（今の記録は消えません）。よろしいですか？',
  saveFail: 'この端末に保存できませんでした',
  storageNg: 'この端末では保存できません（プライベートブラウズ中の可能性があります）。閉じると記録が消えます',
  tooMany: '記録が上限（' + MAX_RECORDS + '件）に達しています',
  settingsFixed: '範囲外の設定があったため、初期値で動かしています：',
  saved: '保存しました',
  exported: '控えを書き出しました',
  yearAchieved: '年間目標達成！',
  weekLabelPre: '今週 ',
  weekClipped: '（今月分）',
  weekLeftPre: 'あと ',
  weekLeftPost: ' 加算すると目安どおり',
  weekDone: '今週の目安は達成！',
  weekMonthDone: '今月の目標は達成！',
  weekMeta: '目安 {q} ／ 加算済み {a}',
  weekAvgSep: '\n',
  weekAvg: '目標まで 1週間平均 {v}',
  weekRule: '1週間の区切り：{s}曜〜{e}曜（設定で変更）',
  yearLeftPre: '今月を含む残り',
  yearLeftMid: 'か月で、年間目標に届くには',
  yearLeftVal: '1か月あたり',
  yearLeftPost: 'ずつ',
  baseRow: '使う前の分',
  baseSet: 'にしました',
  themeChanged: '色を変えました',
  themeNotSaved: '色を変えました（この端末では保存できないため、閉じると元に戻ります）',
  imported: '控えを読み込みました',
};

// ===== 端末への保存（localStorage。使えないときはメモリ） =====
const _mem = {};
let storageOk = true;

function lsGet(key) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? (key in _mem ? _mem[key] : null) : v;
  } catch (e) {
    storageOk = false;
    return key in _mem ? _mem[key] : null;
  }
}

function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    delete _mem[key];
    return true;
  } catch (e) {
    storageOk = false;
    _mem[key] = value;
    return false;
  }
}

function lsRemove(key) {
  try { window.localStorage.removeItem(key); } catch (e) { storageOk = false; }
  delete _mem[key];
}

// ===== 日付・時刻 =====
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

// 日付を決めるのはこの関数だけ（DAY_START_HOUR を引いてから決める）
function dayStr(d) {
  const t = new Date(d.getTime() - DAY_START_HOUR * 3600000);
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}

function monthStr(d) {
  return dayStr(d).slice(0, 7);
}

// 分を HH:MM にする（100時間以上は3けた）
function formatHM(min) {
  const m = Math.max(0, Math.floor(min));
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

// 前回より必ず大きい時刻（ISO文字）を返す
let _lastTime = '';
function nextTime() {
  let iso = new Date().toISOString();
  if (iso <= _lastTime) iso = new Date(new Date(_lastTime).getTime() + 1).toISOString();
  _lastTime = iso;
  return iso;
}

function bumpLastTime_(iso) {
  if (typeof iso === 'string' && iso > _lastTime) _lastTime = iso;
}

// ===== ID =====
let _seq = 0;
function randChars_(n) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function newId() {
  _seq = (_seq + 1) % 1296;
  return 'r' + Date.now().toString(36) + _seq.toString(36).padStart(2, '0') + randChars_(3);
}

function getDeviceId() {
  let id = lsGet(KEY_DEVICE_ID);
  if (!id || !/^[A-Za-z0-9]{1,40}$/.test(id)) {
    id = 'd' + randChars_(8);
    lsSet(KEY_DEVICE_ID, id);
  }
  return id;
}

// ===== 記録 =====
function isValidRecord(r) {
  return !!r && typeof r === 'object' &&
    typeof r.id === 'string' && /^[A-Za-z0-9]{1,40}$/.test(r.id) &&
    typeof r.ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.ts) &&
    typeof r.month === 'string' && /^\d{4}-\d{2}$/.test(r.month) &&
    Number.isInteger(r.minutes) && r.minutes >= 1 && r.minutes <= MAX_ADD_MIN &&
    typeof r.deleted === 'boolean' &&
    typeof r.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.updatedAt) &&
    typeof r.deviceId === 'string' && /^[A-Za-z0-9]{1,40}$/.test(r.deviceId);
}

function loadRecords() {
  let list = [];
  try {
    const raw = lsGet(KEY_RECORDS);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) list = arr.filter(isValidRecord);
  } catch (e) {
    list = [];
  }
  list.forEach(function (r) { bumpLastTime_(r.updatedAt); });
  return list;
}

function saveRecords(list) {
  return lsSet(KEY_RECORDS, JSON.stringify(list));
}

// 消した印が TOMBSTONE_KEEP_DAYS を過ぎたものを捨てる
function purgeTombstones(list) {
  const limit = Date.now() - TOMBSTONE_KEEP_DAYS * 86400000;
  return list.filter(function (r) {
    return !(r.deleted && new Date(r.updatedAt).getTime() < limit);
  });
}

// 今月の記録を1件追加して保存する。保存できなければ例外
function addRecord(min) {
  if (!Number.isInteger(min) || min < 1 || min > MAX_ADD_MIN) throw new Error('BAD_MINUTES');
  let list = loadRecords();
  if (list.length >= MAX_RECORDS) list = purgeTombstones(list);
  if (list.length >= MAX_RECORDS) throw new Error('TOO_MANY');
  const now = new Date();
  const rec = {
    id: newId(),
    ts: now.toISOString(),
    month: monthStr(now),
    minutes: min,
    deleted: false,
    updatedAt: nextTime(),
    deviceId: getDeviceId(),
  };
  list.push(rec);
  if (!saveRecords(list)) throw new Error('SAVE_FAIL');
  ensureMonthTarget(rec.month);
  return rec;
}

// 取り消せる記録（今月の、消されていない記録のうち updatedAt が最大）。無ければ null
function peekUndo() {
  const cur = monthStr(new Date());
  let best = null;
  loadRecords().forEach(function (r) {
    if (r.deleted || r.month !== cur) return;
    if (!best || r.updatedAt > best.updatedAt || (r.updatedAt === best.updatedAt && r.id > best.id)) best = r;
  });
  return best;
}

// 直前の加算に消した印を付ける。取り消した記録を返す（無ければ null）
function undoLast() {
  const target = peekUndo();
  if (!target) return null;
  const list = loadRecords();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === target.id) {
      list[i].deleted = true;
      list[i].updatedAt = nextTime();
      break;
    }
  }
  if (!saveRecords(list)) throw new Error('SAVE_FAIL');
  return target;
}

// その月の合計（分）。消された記録は数えない
// すべての月の合計（分）を一度に数える。記録の合計に「使う前の分」を足したもの
function allMonthTotals() {
  const t = {};
  loadRecords().forEach(function (r) {
    if (!r.deleted) t[r.month] = (t[r.month] || 0) + r.minutes;
  });
  const base = loadSettings().monthBase;
  Object.keys(base).forEach(function (m) {
    if (base[m] > 0) t[m] = (t[m] || 0) + base[m];
  });
  return t;
}

function monthTotal(month) {
  return allMonthTotals()[month] || 0;
}

// その月の「使う前の分」（分）。入れていなければ 0
function monthBase(month) {
  return loadSettings().monthBase[month] || 0;
}

// 記録のある月（今月を除く）を新しい順に
function listMonths() {
  const cur = monthStr(new Date());
  const t = allMonthTotals();
  return Object.keys(t).filter(function (m) { return m !== cur && t[m] > 0; }).sort().reverse();
}

// ===== 年度（9月〜翌年8月） =====
// 'YYYY-MM' → 年度の名前（始まりの年。2026-09〜2027-08 は '2026'）
function yearKeyOfMonth(month) {
  const y = Number(month.slice(0, 4));
  return String(Number(month.slice(5)) >= YEAR_START_MONTH ? y : y - 1);
}

// 年度の12か月（'YYYY-MM'）を古い順に
function yearMonths(key) {
  const y = Number(key);
  const list = [];
  for (let i = 0; i < 12; i++) {
    const m = YEAR_START_MONTH + i;
    list.push(m <= 12 ? y + '-' + pad2(m) : (y + 1) + '-' + pad2(m - 12));
  }
  return list;
}

// 年間の進み具合。now の月が属する年度について数える
// monthsLeft は「今月を含む」残りの月数。perMonth は目標に届くための1か月あたりの分（切り上げ）
function calcYearProgress(now) {
  const cur = monthStr(now);
  const key = yearKeyOfMonth(cur);
  const months = yearMonths(key);
  const t = allMonthTotals();
  let total = 0;
  months.forEach(function (m) { total += t[m] || 0; });
  const target = loadSettings().yearTargetMin;
  const monthsLeft = months.filter(function (m) { return m >= cur; }).length;
  const remain = Math.max(0, target - total);
  return {
    key: key, total: total, target: target, remain: remain, monthsLeft: monthsLeft,
    perMonth: remain > 0 ? Math.ceil(remain / monthsLeft) : 0,
    done: total >= target, pct: Math.min(100, Math.floor(total * 100 / target)),
  };
}

// ===== 今週の目安（v0.6） =====
// 日付（'YYYY-MM-DD'）を、日数の計算ができる数に直す／戻す（時刻のずれを避けるため UTC で数える）
function dayNum_(s) {
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000;
}
function dayFromNum_(n) {
  const d = new Date(n * 86400000);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

// 今週の目安。今月に絞り、「週の始まりの時点の残り」を「今月の残り日数」で割って週に配る。
//   週は weekStartDay の曜日から7日間。月の初めと終わりで週が月をまたぐときは、今月の日だけを数える（clipped）
//   quota ＝ 週の始まり時点の残り × 今週の今月内の日数 ÷ 今月の残り日数（切り上げ）
//   left ＝ quota − 今週の加算済み。avg ＝ 週の始まり時点の残りの「1週間あたり」
function calcWeekGuide(now) {
  const s = loadSettings();
  const today = dayStr(now);
  const month = today.slice(0, 7);
  const t = dayNum_(today);
  const dow = new Date(t * 86400000).getUTCDay();          // 0=日 … 6=土
  const wStart = t - ((dow - s.weekStartDay + 7) % 7);
  const wEnd = wStart + 6;
  const mFirst = dayNum_(month + '-01');
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5));
  const mLast = dayNum_(dayFromNum_(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1) / 86400000 - 1));
  const pStart = Math.max(wStart, mFirst);
  const pEnd = Math.min(wEnd, mLast);
  const days = pEnd - pStart + 1;
  const daysLeft = mLast - pStart + 1;
  let added = 0;
  loadRecords().forEach(function (r) {
    if (r.deleted) return;
    const dn = dayNum_(dayStr(new Date(r.ts)));
    if (dn >= pStart && dn <= pEnd) added += r.minutes;
  });
  const total = monthTotal(month);
  const target = monthTarget(month);
  const remain0 = Math.max(0, target - (total - added));    // 週の始まりの時点の残り
  const quota = remain0 > 0 ? Math.ceil(remain0 * days / daysLeft) : 0;
  return {
    month: month, weekStartDay: s.weekStartDay,
    start: dayFromNum_(pStart), end: dayFromNum_(pEnd), clipped: pStart !== wStart || pEnd !== wEnd,
    added: added, quota: quota, left: Math.max(0, quota - added),
    avg: remain0 > 0 ? Math.ceil(remain0 * 7 / daysLeft) : 0,
    monthDone: total >= target, weekDone: quota - added <= 0,
  };
}

// ===== 設定 =====
function defaultSettings() {
  return {
    targetMin: DEFAULT_TARGET_MIN, addDefaultMin: DEFAULT_ADD_MIN,
    yearTargetMin: DEFAULT_YEAR_TARGET_MIN, weekStartDay: DEFAULT_WEEK_START,
    monthTargets: {}, monthBase: {}, updatedAt: EPOCH_ISO,
  };
}

function isValidWeekStart_(v) {
  return Number.isInteger(v) && v >= 0 && v <= 6;
}

function isValidTargetMin_(v) {
  return Number.isInteger(v) && v >= 60 && v <= MAX_TARGET_HOURS * 60 && v % 60 === 0;
}

function isValidYearTargetMin_(v) {
  return Number.isInteger(v) && v >= 60 && v <= MAX_YEAR_TARGET_HOURS * 60 && v % 60 === 0;
}

function isValidBaseMin_(v) {
  return Number.isInteger(v) && v >= 0 && v <= MAX_BASE_MIN && v % MINUTE_STEP === 0;
}

function isValidAddMin_(v) {
  return Number.isInteger(v) && v >= MINUTE_STEP && v <= MAX_ADD_MIN && v % MINUTE_STEP === 0;
}

// 読み込み時に直した項目の名前（画面に知らせる用）
let lastSettingsFixes = [];

// 保存されていた設定（または控え・同期で届いた設定）を、範囲を確かめて取り込む。
// 戻り値は { settings, fixes }。範囲外の項目は初期値で動かし、その項目名を fixes に入れる
function parseSettings_(o) {
  const s = defaultSettings();
  const fixes = [];
  if (o && typeof o === 'object') {
    if (isValidTargetMin_(o.targetMin)) s.targetMin = o.targetMin; else if ('targetMin' in o) fixes.push('目標');
    if (isValidAddMin_(o.addDefaultMin)) s.addDefaultMin = o.addDefaultMin; else if ('addDefaultMin' in o) fixes.push('加算の初期値');
    if (isValidYearTargetMin_(o.yearTargetMin)) s.yearTargetMin = o.yearTargetMin; else if ('yearTargetMin' in o) fixes.push('年間目標');
    if (isValidWeekStart_(o.weekStartDay)) s.weekStartDay = o.weekStartDay; else if ('weekStartDay' in o) fixes.push('週の区切り');
    if (o.monthTargets && typeof o.monthTargets === 'object') {
      Object.keys(o.monthTargets).forEach(function (k) {
        if (/^\d{4}-\d{2}$/.test(k) && isValidTargetMin_(o.monthTargets[k])) s.monthTargets[k] = o.monthTargets[k];
      });
    }
    if (o.monthBase && typeof o.monthBase === 'object') {
      Object.keys(o.monthBase).forEach(function (k) {
        if (/^\d{4}-\d{2}$/.test(k) && isValidBaseMin_(o.monthBase[k])) s.monthBase[k] = o.monthBase[k];
      });
    }
    if (typeof o.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(o.updatedAt)) s.updatedAt = o.updatedAt;
  }
  return { settings: s, fixes: fixes };
}

function loadSettings() {
  let o = null;
  try {
    const raw = lsGet(KEY_SETTINGS);
    o = raw ? JSON.parse(raw) : null;
  } catch (e) {
    o = null;
  }
  const r = parseSettings_(o);
  lastSettingsFixes = r.fixes;
  bumpLastTime_(r.settings.updatedAt);
  return r.settings;
}

function saveSettings(obj) {
  return lsSet(KEY_SETTINGS, JSON.stringify(obj));
}

// 範囲チェック。入力は { targetMin, addDefaultMin, yearTargetMin（省略可） }（分）。戻り値は { ok, errors:{項目:理由} }
function validateSettings(obj) {
  const errors = {};
  if (!isValidTargetMin_(obj.targetMin)) errors.target = '目標は1〜' + MAX_TARGET_HOURS + '時間の整数で入力してください';
  if ('yearTargetMin' in obj && !isValidYearTargetMin_(obj.yearTargetMin)) errors.yearTarget = '年間目標は1〜' + MAX_YEAR_TARGET_HOURS + '時間の整数で入力してください';
  if ('weekStartDay' in obj && !isValidWeekStart_(obj.weekStartDay)) errors.weekStart = '1週間の区切りの曜日を選んでください';
  if (!isValidAddMin_(obj.addDefaultMin)) errors.addDefault = '加算の初期値は00:05〜' + formatHM(MAX_ADD_MIN) + 'の5分刻みで選んでください';
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

// 同期の入力の確認（両方空は「同期しない」として可）
function validateSyncInput(url, pass) {
  const errors = {};
  if (url === '' && pass === '') return { ok: true, errors: errors };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
    errors.url = 'URLは https://script.google.com/macros/s/…/exec の形で入力してください';
  }
  if (pass.length < 24 || /\s/.test(pass)) errors.pass = '合言葉は24文字以上で、空白を含めないでください';
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

// その月の目標（分）
function monthTarget(month) {
  const s = loadSettings();
  return s.monthTargets[month] || s.targetMin;
}

// その月の目標が未登録なら、今の目標を写す（更新時刻は変えない）
function ensureMonthTarget(month) {
  const s = loadSettings();
  if (!s.monthTargets[month]) {
    s.monthTargets[month] = s.targetMin;
    saveSettings(s);
  }
}

// その月の「使う前の分」を min（分）にする（置き換え）。設定の更新時刻を進めて保存する。戻り値は保存できたか
function setMonthBase(month, min) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isValidBaseMin_(min)) throw new Error('BAD_BASE');
  const s = loadSettings();
  s.monthBase[month] = min;
  s.updatedAt = nextTime();
  return saveSettings(s);
}

// ===== 控え（バックアップ） =====
function exportBackup() {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    schema: BACKUP_SCHEMA,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    records: loadRecords(),
    settings: loadSettings(),
  }, null, 1);
}

// 控えを読み、足し合わせる。戻り値は { total, added }。壊れていれば例外（何も変えない）
function importBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new Error('BACKUP_NOT_JSON'); }
  if (!o || o.format !== BACKUP_FORMAT) throw new Error('BACKUP_BAD_FORMAT');
  if (o.schema !== BACKUP_SCHEMA) throw new Error('BACKUP_BAD_SCHEMA');
  if (!Array.isArray(o.records) || !o.records.every(isValidRecord)) throw new Error('BACKUP_BAD_RECORDS');
  const local = loadRecords();
  const merged = mergeRecords(local, o.records);
  if (merged.length > MAX_RECORDS) throw new Error('TOO_MANY');
  const settingsIn = (o.settings && typeof o.settings === 'object') ? o.settings : null;
  lsSet(KEY_PREV_BACKUP, JSON.stringify({ savedAt: new Date().toISOString(), records: local, settings: loadSettings() }));
  if (!saveRecords(merged)) throw new Error('SAVE_FAIL');
  if (settingsIn) {
    const tmp = parseSettings_(settingsIn).settings;
    saveSettings(mergeSettings(loadSettings(), tmp));
  }
  const localIds = {};
  local.forEach(function (r) { localIds[r.id] = true; });
  let added = 0;
  merged.forEach(function (r) { if (!localIds[r.id]) added++; });
  return { total: o.records.length, added: added };
}
