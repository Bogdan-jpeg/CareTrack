/* app.js — bootstrap, top bar, language toggle, hash router with role guards. */
import { t, getLocale, setLocale, onLocaleChange } from './i18n.js';
import { api, isAuthed, getUser, clearSession, setSession } from './api.js';
import { el, clear, initials, toast, runViewCleanup } from './ui.js';

import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPatients } from './views/patients.js';
import { renderPatientDetail } from './views/patient_detail.js';
import { renderAlerts } from './views/alerts.js';
import { renderAudit } from './views/audit.js';
import { renderMyData } from './views/my_data.js';
import { renderGateway } from './views/gateway.js';

const appRoot = document.getElementById('app');

const MARK = `<svg class="mark" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="30" height="30" rx="9" fill="#0f7361"/>
  <path d="M5 16.5h4.2l2-5 3 9 2.4-6 1.8 2h3.6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ---------- top bar ---------- */
function navItems() {
  const u = getUser();
  if (!u) return [];
  if (u.role === 'patient') {
    return [
      { href: '#/my', key: 'nav_my' },
      { href: '#/gateway', key: 'nav_gateway' },
    ];
  }
  // doctor / admin
  return [
    { href: '#/dashboard', key: 'nav_dashboard' },
    { href: '#/patients', key: 'nav_patients' },
    { href: '#/alerts', key: 'nav_alerts' },
    { href: '#/audit', key: 'nav_audit' },
  ];
}

function topbar() {
  const u = getUser();
  const route = (location.hash || '').split('?')[0];
  const nav = el('nav', { class: 'topnav' },
    navItems().map((it) => el('a', { href: it.href, class: route.startsWith(it.href) ? 'active' : '' }, t(it.key))));

  const lang = el('div', { class: 'lang-toggle' },
    el('button', { class: getLocale() === 'ro' ? 'on' : '', onClick: () => setLocale('ro') }, 'RO'),
    el('button', { class: getLocale() === 'en' ? 'on' : '', onClick: () => setLocale('en') }, 'EN'));

  const roleLabel = u ? t('role_' + u.role) : '';
  const userChip = u ? el('div', { class: 'user-chip' },
    el('div', { class: 'avatar', text: (u.name ? u.name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('') : 'U').toUpperCase() }),
    el('div', { class: 'meta' }, el('b', { text: u.name || u.email }), el('span', { text: roleLabel })),
  ) : null;

  return el('header', { class: 'topbar' },
    el('div', { class: 'topbar-in' },
      el('a', { class: 'brand', href: u && u.role === 'patient' ? '#/my' : '#/dashboard', html: MARK + '<span>CareTrack</span>' }),
      nav,
      el('div', { class: 'topbar-right' },
        lang,
        userChip,
        u ? el('button', { class: 'btn btn-ghost btn-sm', onClick: doLogout }, t('logout')) : null,
      ),
    ));
}

function doLogout() { clearSession(); location.hash = '#/login'; }

/* ---------- routing ---------- */
const routes = [
  { re: /^#\/login$/, render: renderLogin, public: true, bare: true },
  { re: /^#\/dashboard$/, render: renderDashboard, roles: ['doctor', 'admin'] },
  { re: /^#\/patients$/, render: renderPatients, roles: ['doctor', 'admin'] },
  { re: /^#\/patients\/([^/?]+)$/, render: renderPatientDetail, roles: ['doctor', 'admin', 'patient'] },
  { re: /^#\/alerts$/, render: renderAlerts, roles: ['doctor', 'admin'] },
  { re: /^#\/audit$/, render: renderAudit, roles: ['doctor', 'admin'] },
  { re: /^#\/my$/, render: renderMyData, roles: ['patient', 'doctor', 'admin'] },
  { re: /^#\/gateway$/, render: renderGateway, roles: ['patient', 'doctor', 'admin'], bare: true },
];

function defaultRouteFor(u) {
  if (!u) return '#/login';
  return u.role === 'patient' ? '#/my' : '#/dashboard';
}

async function route() {
  runViewCleanup();                 // tear down timers/streams from the previous view
  const hash = location.hash || '';
  if (!hash || hash === '#/' || hash === '#') {
    location.hash = defaultRouteFor(getUser());
    return;
  }
  const path = hash.split('?')[0];
  const match = routes.find((r) => r.re.test(path));

  if (!match) { location.hash = defaultRouteFor(getUser()); return; }

  if (!match.public && !isAuthed()) { location.hash = '#/login'; return; }
  if (match.roles) {
    const u = getUser();
    if (!u || !match.roles.includes(u.role)) { location.hash = defaultRouteFor(u); return; }
  }
  if (match.public && isAuthed() && path === '#/login') { location.hash = defaultRouteFor(getUser()); return; }

  clear(appRoot);
  const params = (path.match(match.re) || []).slice(1).map(decodeURIComponent);

  if (match.bare) {
    // login & gateway render their own full-screen chrome (gateway still gets a slim bar)
    const mount = el('div', {});
    appRoot.appendChild(mount);
    if (path === '#/gateway') {
      appRoot.appendChild(topbar());
      const main = el('div', {});
      appRoot.appendChild(main);
      await safe(() => match.render(main, params));
    } else {
      await safe(() => match.render(appRoot, params));
    }
    return;
  }

  appRoot.appendChild(topbar());
  const main = el('main', { class: 'wrap' });
  appRoot.appendChild(main);
  await safe(() => match.render(main, params));
}

async function safe(fn) {
  try { await fn(); }
  catch (e) {
    console.error(e);
    if (e && e.status === 401) return; // redirect already handled
    toast((getLocale() === 'en' ? 'Something went wrong: ' : 'A apărut o eroare: ') + (e.message || ''), 'err');
  }
}

/* re-render on locale change so all labels update live */
onLocaleChange(() => {
  // persist server-side preference (best effort)
  if (isAuthed()) api.setLocale(getLocale()).catch(() => {});
  route();
});

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

// kick off immediately (module may load after DOMContentLoaded)
route();
