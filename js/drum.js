'use strict';
/*
 * drum.js ― 「時」と「分」を回して選ぶドラムロールの部品
 * 基づく仕様書：KEhoras 仕様書 v0.7
 * 縦スクロールの「止まる位置」を使って作っています。回して止まった段が選んだ値です。
 */

// ドラムを作る。values は値の配列、labels は表示の文字の配列、onChange は値が変わったときに呼ぶ
function createDrum(el, values, labels, onChange) {
  el.innerHTML = '';
  el._values = values;
  el._value = values[0];
  el._onChange = onChange || null;
  const top = document.createElement('div');
  top.className = 'drum-spacer';
  el.appendChild(top);
  values.forEach(function (v, i) {
    const item = document.createElement('div');
    item.className = 'drum-item';
    item.textContent = labels[i];
    item.dataset.index = String(i);
    item.addEventListener('click', function () {
      el.scrollTo({ top: i * DRUM_ITEM_HEIGHT, behavior: 'smooth' });
    });
    el.appendChild(item);
  });
  const bottom = document.createElement('div');
  bottom.className = 'drum-spacer';
  el.appendChild(bottom);

  let timer = null;
  el.addEventListener('scroll', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      commitDrum_(el);
    }, 80);
  });
  markDrum_(el);
}

// 今のスクロール位置から値を決め、変わっていれば知らせる
function commitDrum_(el) {
  if (el.offsetHeight === 0) return; // 隠れているときは位置が0になるので何もしない
  const n = el._values.length;
  const idx = Math.min(n - 1, Math.max(0, Math.round(el.scrollTop / DRUM_ITEM_HEIGHT)));
  const v = el._values[idx];
  markDrum_(el);
  if (v !== el._value) {
    el._value = v;
    markDrum_(el);
    if (el._onChange) el._onChange(v);
  }
}

// 選んでいる段の見た目を付ける
function markDrum_(el) {
  const idx = el._values.indexOf(el._value);
  const items = el.querySelectorAll('.drum-item');
  for (let i = 0; i < items.length; i++) items[i].classList.toggle('sel', i === idx);
}

// 値を合わせて動かす（アニメーションなし）
function setDrumValue(el, value) {
  const idx = el._values.indexOf(value);
  if (idx < 0) return;
  el._value = value;
  if (el.offsetHeight > 0) el.scrollTop = idx * DRUM_ITEM_HEIGHT;
  markDrum_(el);
}

// いまの値。見えているときはスクロール位置から、隠れているときは覚えた値
function getDrumValue(el) {
  if (el.offsetHeight > 0) {
    const n = el._values.length;
    const idx = Math.min(n - 1, Math.max(0, Math.round(el.scrollTop / DRUM_ITEM_HEIGHT)));
    return el._values[idx];
  }
  return el._value;
}

// 隠れていたドラムが見えたときに、覚えた値の位置へ動かす
function refreshDrum(el) {
  setDrumValue(el, el._value);
}

function initDrums() {
  const hours = [], hourLabels = [], mins = [], minLabels = [];
  for (let h = 0; h <= MAX_ADD_HOURS; h++) { hours.push(h); hourLabels.push(pad2(h)); }
  for (let m = 0; m < 60; m += MINUTE_STEP) { mins.push(m); minLabels.push(pad2(m)); }
  const onChange = function () { if (typeof renderAddButton === 'function') renderAddButton(); };
  createDrum(document.getElementById('drum-hour'), hours, hourLabels, onChange);
  createDrum(document.getElementById('drum-min'), mins, minLabels, onChange);
}

// 時×60＋分
function getDrumMinutes() {
  return getDrumValue(document.getElementById('drum-hour')) * 60 + getDrumValue(document.getElementById('drum-min'));
}

// 分の合計からドラムの位置を合わせる
function setDrumMinutes(total) {
  setDrumValue(document.getElementById('drum-hour'), Math.floor(total / 60));
  setDrumValue(document.getElementById('drum-min'), total % 60);
}

function refreshDrums() {
  refreshDrum(document.getElementById('drum-hour'));
  refreshDrum(document.getElementById('drum-min'));
}
