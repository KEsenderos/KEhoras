'use strict';
/*
 * sync.js ― 記録と設定をGoogleスプレッドシート（GAS）とそろえるファイル
 * 基づく仕様書：KEhoras 仕様書 v0.2
 * 考え方：両方の記録を「足し合わせ」、同じ記録は新しい方を残します。
 *        取り消した記録は「消した印」として残すので、別の端末から復活しません。
 */

// ===== 足し合わせ（順序によらず同じ結果になる） =====
function betterRecord_(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeRecords(a, b) {
  const map = {};
  a.concat(b).forEach(function (r) {
    map[r.id] = map[r.id] ? betterRecord_(map[r.id], r) : r;
  });
  return Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) {
    if (x.ts !== y.ts) return x.ts < y.ts ? -1 : 1;
    return x.id < y.id ? -1 : (x.id > y.id ? 1 : 0);
  });
}

// 設定は updatedAt が新しい方を採り、月ごとの目標は両方を足し合わせる
function mergeSettings(a, b) {
  if (!a) return b;
  if (!b) return a;
  let win = a, lose = b;
  if (a.updatedAt !== b.updatedAt) {
    if (b.updatedAt > a.updatedAt) { win = b; lose = a; }
  } else if (JSON.stringify(b) > JSON.stringify(a)) {
    win = b; lose = a;
  }
  const mt = Object.assign({}, lose.monthTargets || {}, win.monthTargets || {});
  return { targetMin: win.targetMin, addDefaultMin: win.addDefaultMin, monthTargets: mt, updatedAt: win.updatedAt };
}

// ===== 通信 =====
const SYNC_TIMEOUT_MS = 30000;

// POSTして JSON を返す。失敗は code つきの例外
async function postToGas(body) {
  const url = lsGet(KEY_SYNC_URL);
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, SYNC_TIMEOUT_MS);
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch (e) {
    const err = new Error(e && e.name === 'AbortError' ? '時間切れ' : String(e && e.message || e));
    err.code = e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const err = new Error('HTTP ' + res.status + ' / ' + text.slice(0, 80).replace(/\s+/g, ' '));
    err.code = 'NOT_JSON';
    throw err;
  }
  if (!res.ok || !data.ok) {
    const err = new Error(data.message || ('HTTP ' + res.status));
    err.code = data.code || 'HTTP_' + res.status;
    throw err;
  }
  return data;
}

// 画面に出す失敗の理由（相手が返した記号と文もそのまま出す）
function describeSyncError(err) {
  const names = {
    BAD_PASS: '合言葉が違います',
    NOT_SETUP: 'GAS側の準備（setup）が済んでいません',
    BAD_REQUEST: '送った内容が正しくありません',
    TOO_MANY: '記録が多すぎます',
    LOCKED: '他の同期と重なりました。少し待ってください',
    SERVER_ERROR: 'GAS側でエラーが起きました',
    TIMEOUT: '時間切れです',
    NETWORK: '通信できません',
    NOT_JSON: 'GASから想定外の返事がありました（URLが違う可能性）',
    DELETE_GUARD: '多くの記録が消える同期です。反映を止めました',
  };
  const code = err && err.code ? err.code : 'ERROR';
  const head = names[code] || '同期に失敗しました';
  const detail = err && err.message ? err.message : '';
  return head + '（' + code + (detail ? ': ' + detail : '') + '）';
}

// ===== 同期の状態 =====
const syncState = { kind: 'none', text: '', busy: false, pending: false, lastAttemptMs: 0 };

function isSyncConfigured() {
  return !!lsGet(KEY_SYNC_URL) && !!lsGet(KEY_SYNC_PASS);
}

function setSyncState_(kind, text) {
  syncState.kind = kind;
  syncState.text = text;
  if (typeof renderSyncStatus === 'function') renderSyncStatus();
}

// 同期した結果、端末で「消されていなかった記録」が新しく何件消されたか
function countNewlyDeleted(localList, mergedList) {
  const was = {};
  localList.forEach(function (r) { if (!r.deleted) was[r.id] = true; });
  let n = 0;
  mergedList.forEach(function (r) { if (r.deleted && was[r.id]) n++; });
  return n;
}

// 同期を1回行う。force が偽のときは、前回から SYNC_MIN_INTERVAL_MS 以内なら行わない
async function syncNow(force) {
  if (!isSyncConfigured()) { setSyncState_('none', TEXT.syncNone); return; }
  if (syncState.busy) { syncState.pending = true; return; }
  if (!force && Date.now() - syncState.lastAttemptMs < SYNC_MIN_INTERVAL_MS) return;
  syncState.busy = true;
  syncState.lastAttemptMs = Date.now();
  setSyncState_('busy', TEXT.syncing);
  try {
    const startAt = nextTime();
    const since = lsGet(KEY_LAST_SYNC_AT) || '';
    const local = loadRecords();
    const send = local.filter(function (r) { return !since || r.updatedAt > since; });
    const res = await postToGas({
      action: 'sync',
      pass: lsGet(KEY_SYNC_PASS),
      deviceId: getDeviceId(),
      records: send,
      settings: loadSettings(),
    });
    // 通信の間に加算されたものを失わないよう、返事を受けた時点の記録で足し合わせる
    const fresh = loadRecords();
    const merged = purgeTombstones(mergeRecords(fresh, res.records || []));
    if (countNewlyDeleted(fresh, merged) >= 10) {
      const err = new Error('10件以上の記録が消える同期でした');
      err.code = 'DELETE_GUARD';
      throw err;
    }
    if (!saveRecords(merged)) throw new Error(TEXT.saveFail);
    if (res.settings) saveSettings(mergeSettings(loadSettings(), res.settings));
    lsSet(KEY_LAST_SYNC_AT, startAt);
    const d = new Date();
    setSyncState_('ok', TEXT.synced + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
  } catch (e) {
    setSyncState_('error', describeSyncError(e));
    if (typeof console !== 'undefined') console.error('sync failed', e);
  } finally {
    syncState.busy = false;
    if (typeof renderAll === 'function') renderAll();
    if (syncState.pending) {
      syncState.pending = false;
      if (syncState.kind !== 'error') syncNow(true);
    }
  }
}
