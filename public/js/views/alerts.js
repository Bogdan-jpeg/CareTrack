/* views/alerts.js — doctor/admin alerts feed across all patients. */
import { t } from '../i18n.js';
import { api } from '../api.js';
import { el, clear, toast, fmtDateTime, alertMsg, sevClass, autoRefresh } from '../ui.js';

export async function renderAlerts(root) {
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {}, el('h1', { text: t('alerts_title') }), el('div', { class: 'sub', text: t('alerts_sub') })),
    el('div', { class: 'head-actions' }, el('span', { class: 'live-badge' }, el('span', { class: 'd' }), el('span', { text: t('live') })))));

  let filter = 'all';
  const filterBar = el('div', { class: 'row', style: 'gap:8px;margin-bottom:16px' });
  const card = el('div', { class: 'card card-pad' });
  root.appendChild(filterBar);
  root.appendChild(card);

  const patients = await api.listPatients().catch(() => []);
  const pname = (id) => { const p = patients.find((x) => x.id === id); return p ? `${p.last_name} ${p.first_name}` : id; };

  function fbtn(key, val) {
    return el('button', { class: 'btn ' + (filter === val ? 'btn-primary' : 'btn-ghost') + ' btn-sm', onClick: () => { filter = val; draw(); load(); } }, t(key));
  }
  function drawFilter() { clear(filterBar); filterBar.appendChild(fbtn('filter_all', 'all')); filterBar.appendChild(fbtn('filter_open', 'open')); filterBar.appendChild(fbtn('filter_critical', 'critical')); }
  function draw() { drawFilter(); }

  async function load() {
    let q = '?limit=200';
    if (filter === 'open') q += '&status=open';
    if (filter === 'critical') q += '&severity=critical';
    let alerts;
    try { alerts = await api.listAlerts(q); } catch { return; }  // keep last good data on transient error
    clear(card);
    if (!alerts.length) { card.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '✓' }), el('div', { text: t('no_alerts') }))); return; }
    alerts.forEach((a) => {
      const actions = el('div', { class: 'row', style: 'gap:6px;margin-top:8px' });
      if (a.status === 'open') {
        actions.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { await api.updateAlert(a.id, { status: 'ack' }); toast(t('alert_updated'), 'ok'); load(); } }, t('acknowledge')));
        actions.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { await api.updateAlert(a.id, { status: 'closed' }); toast(t('alert_updated'), 'ok'); load(); } }, t('close_alert')));
      }
      card.appendChild(el('div', { class: 'alert-row sev-' + a.severity },
        el('div', { class: 'ic', text: a.severity === 'critical' ? '⚠' : a.severity === 'warning' ? '!' : 'i' }),
        el('div', { class: 'body' },
          el('div', { class: 'msg' }, el('a', { href: '#/patients/' + a.patient_id, style: 'color:inherit;text-decoration:none' }, alertMsg(a))),
          el('div', { class: 'when', text: `${pname(a.patient_id)} · ${fmtDateTime(a.created_at)}` }),
          a.note ? el('div', { class: 'note' }, el('b', { text: t('patient_note') + ': ' }), a.note) : null,
          actions,
        ),
        el('span', { class: 'pill ' + (a.status === 'open' ? sevClass(a.severity) : 'gray'), text: t('st_' + a.status) }),
      ));
    });
  }

  draw();
  await load();
  autoRefresh(load, 5000);
}
