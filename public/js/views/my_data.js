/* views/my_data.js — the patient's own landing page.
   Delegates to the shared patient-detail view, which is already role-aware
   (patients get overview / vitals / ECG / alerts / recommendations tabs,
   the recommendations tab carrying the activity calendar — assignment 4a/4b). */
import { t } from '../i18n.js';
import { getUser } from '../api.js';
import { el } from '../ui.js';
import { renderPatientDetail } from './patient_detail.js';

export async function renderMyData(root) {
  const u = getUser();
  // Staff hitting #/my just go to their dashboard.
  if (u && u.role !== 'patient') { location.hash = '#/dashboard'; return; }
  if (!u || !u.patientId) {
    root.appendChild(el('div', { class: 'empty' },
      el('div', { class: 'ic', text: '👤' }),
      el('div', { text: t('no_data') })));
    return;
  }
  await renderPatientDetail(root, [u.patientId]);
}
