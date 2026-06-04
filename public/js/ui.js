/* ui.js — small DOM + UI helpers used across views. */
import { t, getLocale } from './i18n.js';

/* hyperscript-ish element builder */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/* ---- view lifecycle: run teardown callbacks when navigating away ---- */
let _cleanups = [];
export function onViewCleanup(fn) { _cleanups.push(fn); }
export function runViewCleanup() {
  const fns = _cleanups; _cleanups = [];
  fns.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
}
/* poll fn every ms; auto-cleared on navigation. Skips while the tab is hidden. */
export function autoRefresh(fn, ms) {
  const id = setInterval(() => { if (!document.hidden) fn(); }, ms);
  onViewCleanup(() => clearInterval(id));
  return id;
}

export function toast(msg, kind = '') {
  const host = document.getElementById('toast-host');
  const tnode = el('div', { class: 'toast ' + kind, text: msg });
  host.appendChild(tnode);
  setTimeout(() => { tnode.style.opacity = '0'; tnode.style.transition = 'opacity .3s'; setTimeout(() => tnode.remove(), 300); }, 3200);
}

export function modal({ title, body, footer, size = '' }) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  const m = el('div', { class: 'modal ' + size },
    el('div', { class: 'modal-head' }, el('h3', { text: title }), el('button', { class: 'x-btn', onClick: close, 'aria-label': 'close' }, '×')),
    el('div', { class: 'modal-body' }, body),
    footer ? el('div', { class: 'modal-foot' }, footer) : null,
  );
  back.appendChild(m);
  document.body.appendChild(back);
  return { close, root: back };
}

export function confirmDialog(message, onYes) {
  const { close } = modal({
    title: t('confirm'),
    body: el('p', { text: message }),
    footer: [
      el('button', { class: 'btn btn-ghost', onClick: () => close() }, t('cancel')),
      el('button', { class: 'btn btn-danger', onClick: () => { close(); onYes(); } }, t('yes')),
    ],
  });
}

/* formatting */
export function fmtNum(n, dp = 1) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return Number.isInteger(num) ? String(num) : num.toFixed(dp);
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toLocaleString(getLocale() === 'en' ? 'en-GB' : 'ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return getLocale() === 'en' ? 'just now' : 'acum';
  const m = Math.floor(s / 60); if (m < 60) return m + (getLocale() === 'en' ? ' min ago' : ' min');
  const h = Math.floor(m / 60); if (h < 24) return h + (getLocale() === 'en' ? ' h ago' : ' h');
  const dd = Math.floor(h / 24); return dd + (getLocale() === 'en' ? ' d ago' : ' z');
}
export function initials(first, last) {
  return ((first || '')[0] || '') + ((last || '')[0] || '');
}
export function sevClass(sev) { return sev === 'critical' ? 'red' : sev === 'warning' ? 'amber' : 'teal'; }
export function statusClass(st) { return st === 'connected' ? 'green' : st === 'paired' ? 'teal' : st === 'disconnected' ? 'amber' : 'gray'; }

/* alert message in the current locale */
export function alertMsg(a) { return getLocale() === 'en' ? a.message_en : a.message_ro; }

export const VITAL_META = {
  pulse:       { icon: '❤', unit: 'BPM', color: '#cf4438' },
  temperature: { icon: '🌡', unit: '°C',  color: '#c97f12' },
  humidity:    { icon: '💧', unit: '%',   color: '#0f7361' },
  spo2:        { icon: '🫁', unit: '%',   color: '#2b6fb0' },
};
