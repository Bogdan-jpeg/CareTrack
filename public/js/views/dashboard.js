/* views/dashboard.js — doctor/admin overview. Auto-refreshes in place. */
import { t } from '../i18n.js';
import { api } from '../api.js';
import { el, clear, timeAgo, alertMsg, sevClass, statusClass, initials, autoRefresh } from '../ui.js';

const REFRESH_MS = 5000;

export async function renderDashboard(root) {
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {}, el('h1', { text: t('dash_title') }), el('div', { class: 'sub', text: t('dash_sub') })),
    el('div', { class: 'head-actions' }, liveBadge())));

  const statsRow = el('div', { class: 'grid grid-4', style: 'margin-bottom:18px' });
  const cols = el('div', { class: 'cols-main' });
  const alertCard = el('div', { class: 'card card-pad' });
  const patCard = el('div', { class: 'card card-pad' });
  cols.appendChild(alertCard); cols.appendChild(patCard);
  root.appendChild(statsRow);
  root.appendChild(cols);

  // initial skeleton so the grid has height before the first fetch resolves
  for (let i = 0; i < 4; i++) statsRow.appendChild(el('div', { class: 'stat' }, el('div', { class: 'lbl', text: '…' }), el('div', { class: 'val', text: '—' })));

  async function refresh() {
    let patients, alerts;
    try { [patients, alerts] = await Promise.all([api.listPatients(), api.listAlerts('?limit=8')]); }
    catch { return; }   // transient error: keep showing the last good data

    const openAlerts = patients.reduce((s, p) => s + (p.open_alerts || 0), 0);
    const online = patients.filter((p) => p.device && (p.device.status === 'connected' || p.device.status === 'paired')).length;
    const critical = alerts.filter((a) => a.severity === 'critical' && a.status === 'open').length;

    const stat = (lbl, val, cls = '') => el('div', { class: 'stat ' + cls },
      el('div', { class: 'lbl', text: lbl }), el('div', { class: 'val tnum', text: String(val) }));
    clear(statsRow);
    statsRow.appendChild(stat(t('total_patients'), patients.length));
    statsRow.appendChild(stat(t('open_alerts'), openAlerts, openAlerts ? 'is-amber' : 'is-green'));
    statsRow.appendChild(stat(t('devices_online'), online, 'is-green'));
    statsRow.appendChild(stat(t('critical'), critical, critical ? 'is-red' : ''));

    const pname = (id) => { const p = patients.find((x) => x.id === id); return p ? `${p.last_name} ${p.first_name}` : id; };

    clear(alertCard);
    alertCard.appendChild(el('div', { class: 'row between mb' }, el('h3', { text: t('recent_alerts') }), el('a', { href: '#/alerts', class: 'small', text: t('view_all') })));
    if (!alerts.length) {
      alertCard.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '✓' }), el('div', { text: t('no_alerts') })));
    } else {
      alerts.forEach((a) => alertCard.appendChild(el('div', { class: 'alert-row sev-' + a.severity },
        el('div', { class: 'ic', text: a.severity === 'critical' ? '⚠' : a.severity === 'warning' ? '!' : 'i' }),
        el('div', { class: 'body' },
          el('div', { class: 'msg', text: alertMsg(a) }),
          el('div', { class: 'when' }, `${pname(a.patient_id)} · ${timeAgo(a.created_at)}`)),
        el('span', { class: 'pill ' + sevClass(a.severity), text: t('sev_' + a.severity) }))));
    }

    clear(patCard);
    patCard.appendChild(el('div', { class: 'row between mb' }, el('h3', { text: t('your_patients') }), el('a', { href: '#/patients', class: 'small', text: t('view_all') })));
    if (!patients.length) {
      patCard.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '👤' }), el('div', { text: t('no_patients') })));
    } else {
      patients.slice(0, 7).forEach((p) => {
        const st = p.device ? p.device.status : null;
        patCard.appendChild(el('div', { class: 'alert-row', style: 'cursor:pointer', onClick: () => location.hash = '#/patients/' + p.id },
          el('div', { class: 'avatar', style: 'border-radius:9px', text: initials(p.first_name, p.last_name).toUpperCase() }),
          el('div', { class: 'body' },
            el('div', { class: 'msg', text: `${p.last_name} ${p.first_name}` }),
            el('div', { class: 'when', text: `${p.age ?? '—'} ${t('years')}` })),
          el('span', { class: 'pill ' + statusClass(st), text: st ? t('status_' + st) : t('status_none') })));
      });
    }
  }

  await refresh();
  autoRefresh(refresh, REFRESH_MS);
}

function liveBadge() {
  return el('span', { class: 'live-badge' }, el('span', { class: 'd' }), el('span', { text: t('live') }));
}
