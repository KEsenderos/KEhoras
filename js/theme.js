'use strict';
/*
 * theme.js ― 見た目（ノーマル／ダーク）を決めて <html data-theme="…"> に付けるファイル
 * 基づく仕様書：KEhoras 仕様書 v0.8
 * 画面が一瞬ちがう色で光らないよう、<head> の中で最初に読み込みます（store.js より前）。
 * この端末だけの設定です。同期もバックアップもしません（iPhoneとMacで別々に選べます）。
 */
const KEY_THEME = 'keh_theme';
const THEME_CHOICES = ['auto', 'normal', 'dark'];
const THEME_COLOR = { normal: '#1D4ED8', dark: '#111827' }; // ブラウザ上部の色（meta theme-color）
let themeMemory_ = 'auto'; // 保存できない環境では、開いている間だけ覚える

// 選ばれている項目（'auto' / 'normal' / 'dark'）。保存が壊れていたら 'auto'
function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY_THEME);
    if (THEME_CHOICES.indexOf(v) >= 0) return v;
  } catch (e) { /* 保存が使えない */ }
  return themeMemory_;
}

// 'auto' のときは、端末の外観の設定（ダークかどうか）で決める
function resolveTheme(choice) {
  if (choice === 'dark') return 'dark';
  if (choice === 'normal') return 'normal';
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'normal';
}

// 今の選択を画面に当てる。戻り値は実際に当てた見た目（'normal' / 'dark'）
function applyTheme() {
  const t = resolveTheme(getThemeChoice());
  document.documentElement.setAttribute('data-theme', t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', THEME_COLOR[t]);
  return t;
}

// 選択を保存して画面に当てる。保存に失敗しても、開いている間は有効（戻り値は保存できたか）
function setThemeChoice(v) {
  if (THEME_CHOICES.indexOf(v) < 0) return false;
  themeMemory_ = v;
  let saved = true;
  try { localStorage.setItem(KEY_THEME, v); } catch (e) { saved = false; }
  applyTheme();
  return saved;
}

applyTheme();
// 「自動」のとき、端末の外観の設定が変わったら、すぐ追いかける
if (typeof matchMedia === 'function') {
  const mq_ = matchMedia('(prefers-color-scheme: dark)');
  const onChange_ = function () { if (getThemeChoice() === 'auto') applyTheme(); };
  if (mq_.addEventListener) mq_.addEventListener('change', onChange_);
  else if (mq_.addListener) mq_.addListener(onChange_);
}
