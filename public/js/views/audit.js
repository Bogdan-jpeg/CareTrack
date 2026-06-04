/* views/audit.js — critical-action audit log. */
import { t, getLocale } from '../i18n.js';
import { api } from '../api.js';
import { el, clear, fmtDateTime } from '../ui.js';

const ACTION_LABEL = {
  ro: {
    'login': 'Autentificare', 'user.create': 'Creare cont', 'patient.create': 'Creare pacient',
    'patient.update': 'Modificare pacient', 'patient.delete': 'Ștergere pacient', 'rules.update': 'Modificare limite',
    'alert.create': 'Creare alertă', 'alert.update': 'Actualizare alertă', 'recommendation.create': 'Creare recomandare',
    'recommendation.delete': 'Ștergere recomandare', 'device.create': 'Înregistrare dispozitiv', 'device.pair': 'Asociere dispozitiv',
    'report.generate': 'Generare raport',
  },
  en: {
    'login': 'Login', 'user.create': 'Create account', 'patient.create': 'Create patient',
    'patient.update': 'Update patient', 'patient.delete': 'Delete patient', 'rules.update': 'Update limits',
    'alert.create': 'Create alert', 'alert.update': 'Update alert', 'recommendation.create': 'Create recommendation',
    'recommendation.delete': 'Delete recommendation', 'device.create': 'Register device', 'device.pair': 'Pair device',
    'report.generate': 'Generate report',
  },
};

export async function renderAudit(root) {
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {}, el('h1', { text: t('audit_title') }), el('div', { class: 'sub', text: t('audit_sub') }))));

  const card = el('div', { class: 'card' });
  root.appendChild(card);
  card.appendChild(el('div', { class: 'card-pad muted', text: t('loading') }));

  const logs = await api.audit('?limit=300');
  clear(card);
  if (!logs.length) { card.appendChild(el('div', { class: 'empty', text: t('no_data') })); return; }

  const al = (a) => (ACTION_LABEL[getLocale()] && ACTION_LABEL[getLocale()][a]) || a;
  const tbl = el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {}, el('th', { text: t('col_when') }), el('th', { text: t('col_action') }), el('th', { text: t('col_entity') }), el('th', { text: 'ID' }))),
    el('tbody', {}, logs.map((l) => el('tr', {},
      el('td', { class: 'muted small', text: fmtDateTime(l.ts) }),
      el('td', {}, el('span', { class: 'pill teal', text: al(l.action) })),
      el('td', { class: 'muted', text: l.entity || '—' }),
      el('td', { class: 'muted tnum small', text: l.entity_id || '—' }),
    ))));
  card.appendChild(el('div', { class: 'tbl-wrap' }, tbl));
}
