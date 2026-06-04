/*
 * test/frontend.js — loads the real built frontend in jsdom against a live
 * in-process server. Catches module-load errors, missing exports, undefined
 * references, and basic render failures that a syntax check cannot.
 *
 *   CARETRACK_DB=/tmp/ct-fe.db node seed.js --reset
 *   CARETRACK_DB=/tmp/ct-fe.db node test/frontend.js
 */
process.env.CARETRACK_JWT_SECRET = process.env.CARETRACK_JWT_SECRET || 'test-secret';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { JSDOM, VirtualConsole } = require('jsdom');

require('../db');
const authRoutes = require('../routes/auth');
const { router: patientRoutes } = require('../routes/patients');
const deviceRoutes = require('../routes/devices');
const vitalsRoutes = require('../routes/vitals');
const alertRoutes = require('../routes/alerts');
const ruleRoutes = require('../routes/rules');
const recoRoutes = require('../routes/recommendations');
const reportRoutes = require('../routes/reports');
const auditRoutes = require('../routes/audit');

const PUBLIC = path.join(__dirname, '..', 'public');

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api', vitalsRoutes);
app.use('/api', alertRoutes);
app.use('/api', ruleRoutes);
app.use('/api', recoRoutes);
app.use('/api', reportRoutes);
app.use('/api', auditRoutes);
app.use(express.static(PUBLIC));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

let pass = 0, fail = 0;
const ok = (m) => { console.log('  \u2713 ' + m); pass++; };
const no = (m, d) => { console.log('  \u2717 ' + m + (d ? '  -- ' + d : '')); fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const pageErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => pageErrors.push(e.message + (e.detail ? ' :: ' + e.detail : '')));

  // jsdom doesn't run <script type=module> with full resolution the way a
  // browser does, so we load each module via dynamic import in a module script
  // and surface any error. We stub the few browser globals our modules touch
  // at import time (Chart, localStorage are provided by jsdom; Chart is not).
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toast-host"></div></body></html>', {
    url: base + '/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  global.__win = window;

  // minimal stubs for things jsdom lacks
  window.Chart = function () { return { destroy() {} }; };
  window.Chart.prototype = {};
  window.fetch = makeFetch(base, window);
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  if (!window.localStorage) {
    const store = {};
    window.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  }

  // Helper to import a module's source in the jsdom realm via Function eval is
  // brittle; instead we fetch each file and check it parses & evaluates by
  // importing through a real data: URL is not available in node. So we take a
  // pragmatic path: verify each module is served with JS mime + non-empty,
  // then load the i18n/ui/api/charts modules in THIS node realm using a DOM
  // shim to confirm their top-level code and exports work.

  // 1) every static asset served with correct content-type
  const assets = [
    ['/', 'text/html'],
    ['/index.html', 'text/html'],
    ['/css/styles.css', 'text/css'],
    ['/manifest.json', 'application/json'],
    ['/sw.js', 'javascript'],
    ['/icons/icon.svg', 'image/svg+xml'],
    ['/icons/icon-192.png', 'image/png'],
    ['/js/app.js', 'javascript'],
    ['/js/i18n.js', 'javascript'],
    ['/js/api.js', 'javascript'],
    ['/js/ui.js', 'javascript'],
    ['/js/charts.js', 'javascript'],
    ['/js/views/login.js', 'javascript'],
    ['/js/views/dashboard.js', 'javascript'],
    ['/js/views/patients.js', 'javascript'],
    ['/js/views/patient_detail.js', 'javascript'],
    ['/js/views/alerts.js', 'javascript'],
    ['/js/views/audit.js', 'javascript'],
    ['/js/views/my_data.js', 'javascript'],
    ['/js/views/gateway.js', 'javascript'],
  ];
  let assetFail = 0;
  for (const [p, mime] of assets) {
    const r = await fetch(base + p);
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes(mime)) { /* good */ } else { assetFail++; no(`asset ${p}`, `status=${r.status} ct=${ct}`); }
  }
  if (!assetFail) ok(`all ${assets.length} static assets served with correct content-type`);

  // 2) index.html references the expected entry points
  const html = await (await fetch(base + '/')).text();
  (html.includes('/js/app.js') && html.includes('/css/styles.css') && html.includes('manifest.json'))
    ? ok('index.html wires app.js, styles.css, manifest') : no('index.html wiring');

  // 3) load the real modules in a DOM-shimmed realm to exercise top-level code + exports.
  //    Node resolves a .js file's module type from the nearest package.json; the
  //    server's is CommonJS, so we copy the js/ tree into a temp dir flagged as
  //    ESM and import from there. The DOM shim must be installed BEFORE importing
  //    because some modules touch document/localStorage at module top-level.
  installDomShim(window);
  const fs = require('fs');
  const os = require('os');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-fe-'));
  fs.cpSync(PUBLIC + '/js', tmpRoot + '/js', { recursive: true });
  fs.writeFileSync(tmpRoot + '/package.json', '{"type":"module"}');
  const importBase = tmpRoot + '/js/';
  try {
    const i18n = await import('file://' + importBase + 'i18n.js');
    (typeof i18n.t === 'function' && i18n.t('nav_patients') && typeof i18n.setLocale === 'function')
      ? ok('i18n.js loads; t() and setLocale() exported') : no('i18n exports');
    // toggle locale works
    i18n.setLocale('en'); const en = i18n.t('nav_patients'); i18n.setLocale('ro'); const ro = i18n.t('nav_patients');
    (en && ro && en !== ro) ? ok(`i18n toggle works (EN="${en}" / RO="${ro}")`) : no('i18n toggle', `en=${en} ro=${ro}`);
  } catch (e) { no('i18n.js load', e.message); }

  try {
    const ui = await import('file://' + importBase + 'ui.js');
    const node = ui.el('div', { class: 'x', text: 'hi' });
    (node && node.className === 'x' && node.textContent === 'hi') ? ok('ui.js el() builds DOM nodes') : no('ui.el');
    (typeof ui.fmtNum === 'function' && ui.fmtNum(36.666) === '36.7') ? ok('ui.fmtNum formats correctly') : no('ui.fmtNum', ui.fmtNum && ui.fmtNum(36.666));
    (ui.VITAL_META && ui.VITAL_META.pulse) ? ok('ui.VITAL_META present') : no('VITAL_META');
  } catch (e) { no('ui.js load', e.message); }

  try {
    const api = await import('file://' + importBase + 'api.js');
    (typeof api.api === 'object' && typeof api.api.login === 'function' && typeof api.getToken === 'function')
      ? ok('api.js loads; api methods + session helpers exported') : no('api exports');
  } catch (e) { no('api.js load', e.message); }

  try {
    const charts = await import('file://' + importBase + 'charts.js');
    (typeof charts.lineChart === 'function' && typeof charts.EcgRenderer === 'function')
      ? ok('charts.js loads; lineChart + EcgRenderer exported') : no('charts exports');
  } catch (e) { no('charts.js load', e.message); }

  // 4) every view module loads and exposes its render export
  const views = {
    'views/login.js': 'renderLogin', 'views/dashboard.js': 'renderDashboard',
    'views/patients.js': 'renderPatients', 'views/patient_detail.js': 'renderPatientDetail',
    'views/alerts.js': 'renderAlerts', 'views/audit.js': 'renderAudit',
    'views/my_data.js': 'renderMyData', 'views/gateway.js': 'renderGateway',
  };
  let vfail = 0;
  for (const [file, exp] of Object.entries(views)) {
    try { const m = await import('file://' + importBase + file); if (typeof m[exp] !== 'function') { vfail++; no(`view ${file}`, `missing ${exp}`); } }
    catch (e) { vfail++; no(`view ${file} load`, e.message); }
  }
  if (!vfail) ok(`all ${Object.keys(views).length} view modules load and export their render fn`);

  // 5) gateway exposes the BLE protocol constants the firmware must match
  try {
    const gw = await import('file://' + importBase + 'views/gateway.js');
    (gw.BLE && /^c0de1000-/.test(gw.BLE.SERVICE) && gw.BLE.VITALS && gw.BLE.ECG && gw.BLE.ACCEL)
      ? ok('gateway exports BLE UUID map (service+vitals+ecg+accel)') : no('gateway BLE constants');
  } catch (e) { no('gateway BLE constants', e.message); }

  // 6) a real render: login view into a jsdom document, then a doctor dashboard
  try {
    const { document } = window;
    const ui = await import('file://' + importBase + 'ui.js');
    const login = await import('file://' + importBase + 'views/login.js');
    const root = document.getElementById('app'); root.innerHTML = '';
    login.renderLogin(root);
    const hasForm = root.querySelector('input[type=email]') && root.querySelector('input[type=password]') && /Conectare|Sign in/.test(root.textContent);
    hasForm ? ok('login view renders email+password form into DOM') : no('login render');
  } catch (e) { no('login render', e.message); }

  if (pageErrors.length) { pageErrors.slice(0, 5).forEach((m) => no('page error', m)); }

  server.close();
  console.log('\n===================================');
  console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
  console.log('===================================');
  process.exit(fail ? 1 : 0);
}

// fetch backed by the live server, returns a minimal Response-like for jsdom realm
function makeFetch(base, window) {
  const nodeFetch = global.fetch;
  return (url, opts) => nodeFetch(url.startsWith('http') ? url : base + url, opts);
}

// Provide the browser globals our modules reference at import time, mapped onto
// the current Node global so `import` of the real files works.
function installDomShim(window) {
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.navigator = window.navigator;
  global.Chart = window.Chart;
  global.location = window.location;
  global.Notification = undefined;
  global.URL = global.URL || window.URL;
}

main().catch((e) => { console.error(e); process.exit(1); });
