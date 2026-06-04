/* charts.js — Chart.js vitals charts + a lightweight ECG canvas renderer. */
import { getLocale } from './i18n.js';

const FONT = "'Public Sans', sans-serif";

export function lineChart(canvas, { labels, datasets, yMin, yMax, suggestedMin, suggestedMax }) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.fill || 'transparent',
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .32, fill: !!d.fill,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, labels: { font: { family: FONT, size: 12 }, usePointStyle: true, boxWidth: 8 } },
        tooltip: { titleFont: { family: FONT }, bodyFont: { family: FONT }, padding: 10, backgroundColor: '#16201d' },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: FONT, size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7, color: '#8a938e' } },
        y: { min: yMin, max: yMax, suggestedMin, suggestedMax, grid: { color: '#eceae2' }, ticks: { font: { family: FONT, size: 11 }, color: '#8a938e' } },
      },
    },
  });
}

export function sparkline(canvas, data, color) {
  return new Chart(canvas, {
    type: 'line',
    data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 1.5, pointRadius: 0, tension: .4, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }, animation: false, events: [] },
  });
}

export function fmtTimeLabels(rows) {
  const loc = getLocale() === 'en' ? 'en-GB' : 'ro-RO';
  return rows.map((r) => {
    const d = new Date((r.ts || '').includes('T') ? r.ts : (r.ts || '').replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  });
}

/* ----- ECG renderer: draws a scrolling/static waveform on a dark canvas ----- */
export class EcgRenderer {
  constructor(canvas, { color = '#54e6b8', grid = true } = {}) {
    this.canvas = canvas; this.color = color; this.grid = grid;
    this.ctx = canvas.getContext('2d');
    this.samples = [];
    this._resize();
    window.addEventListener('resize', () => { this._resize(); this.draw(); });
  }
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 150;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }
  setSamples(arr) { this.samples = arr || []; this.draw(); }
  push(values) { // streaming: append and keep a window
    this.samples.push(...values);
    const maxN = 500;
    if (this.samples.length > maxN) this.samples = this.samples.slice(this.samples.length - maxN);
    this.draw();
  }
  draw() {
    const { ctx, w, h, samples } = this;
    ctx.clearRect(0, 0, w, h);
    if (this.grid) {
      ctx.strokeStyle = 'rgba(84,230,184,.10)'; ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }
    if (!samples.length) return;
    let lo = Infinity, hi = -Infinity;
    for (const v of samples) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const range = hi - lo || 1;
    const pad = h * 0.12;
    ctx.strokeStyle = this.color; ctx.lineWidth = 1.7; ctx.lineJoin = 'round';
    ctx.shadowColor = this.color; ctx.shadowBlur = 6;
    ctx.beginPath();
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h - pad - ((samples[i] - lo) / range) * (h - 2 * pad);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}
