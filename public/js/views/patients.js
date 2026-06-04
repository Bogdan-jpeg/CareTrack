/* views/patients.js — patient list + create/edit form. */
import { t, getLocale } from '../i18n.js';
import { api, ApiError } from '../api.js';
import { el, clear, modal, toast, confirmDialog, initials, statusClass } from '../ui.js';

/* client-side CNP check mirroring the server (instant feedback). */
const CNP_KEY = '279146358279';
function cnpValid(cnp) {
  if (!/^\d{13}$/.test(cnp)) return false;
  const cm = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000 };
  const S = +cnp[0]; if (S < 1 || S > 9) return false;
  const yy = +cnp.slice(1, 3), mm = +cnp.slice(3, 5), dd = +cnp.slice(5, 7);
  if (cm[S]) { const y = cm[S] + yy; const d = new Date(Date.UTC(y, mm - 1, dd));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;
  } else if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  let s = 0; for (let i = 0; i < 12; i++) s += +cnp[i] * +CNP_KEY[i];
  let c = s % 11; if (c === 10) c = 1;
  return c === +cnp[12];
}

export async function renderPatients(root) {
  const head = el('div', { class: 'page-head' },
    el('div', {}, el('h1', { text: t('patients_title') }), el('div', { class: 'sub', text: t('patients_sub') })),
    el('div', { class: 'head-actions' }, el('button', { class: 'btn btn-primary', onClick: () => openForm(null, reload) }, '＋ ' + t('add_patient'))));
  root.appendChild(head);

  const search = el('input', { type: 'search', placeholder: t('search_patients'), style: 'max-width:300px;border:1px solid var(--line-2);border-radius:8px;padding:9px 12px;font-family:var(--ui);font-size:14px;margin-bottom:16px' });
  root.appendChild(search);

  const card = el('div', { class: 'card' });
  root.appendChild(card);

  let patients = [];
  async function reload() {
    patients = await api.listPatients();
    draw();
  }
  function draw() {
    const q = search.value.toLowerCase().trim();
    const rows = patients.filter((p) => !q || `${p.first_name} ${p.last_name} ${p.cnp || ''}`.toLowerCase().includes(q));
    clear(card);
    if (!rows.length) {
      card.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '👤' }), el('div', { text: t('no_patients') })));
      return;
    }
    const tbl = el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {},
        el('th', { text: t('col_name') }), el('th', { text: t('col_age') }), el('th', { text: t('col_cnp') }),
        el('th', { text: t('col_device') }), el('th', { text: t('col_status') }), el('th', { text: t('col_alerts') }), el('th', {}))),
      el('tbody', {}, rows.map((p) => {
        const st = p.device ? p.device.status : null;
        return el('tr', { class: 'click', onClick: (e) => { if (e.target.closest('button')) return; location.hash = '#/patients/' + p.id; } },
          el('td', {}, el('div', { class: 'row' },
            el('div', { class: 'avatar', style: 'width:30px;height:30px;border-radius:8px;font-size:12px', text: initials(p.first_name, p.last_name).toUpperCase() }),
            el('b', { text: `${p.last_name} ${p.first_name}` }))),
          el('td', { class: 'tnum', text: p.age != null ? `${p.age}` : '—' }),
          el('td', { class: 'tnum muted', text: p.cnp || '—' }),
          el('td', { class: 'muted', text: p.device ? p.device.id : '—' }),
          el('td', {}, el('span', { class: 'pill ' + statusClass(st), text: st ? t('status_' + st) : t('status_none') })),
          el('td', {}, p.open_alerts ? el('span', { class: 'pill red', text: String(p.open_alerts) }) : el('span', { class: 'muted', text: '0' })),
          el('td', { style: 'text-align:right;white-space:nowrap' },
            el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openForm(p, reload) }, t('edit')),
            ' ',
            el('button', { class: 'btn btn-ghost btn-sm', style: 'color:var(--red)', onClick: () => {
              confirmDialog(t('confirm_delete'), async () => { await api.deletePatient(p.id); toast(t('patient_deleted'), 'ok'); reload(); });
            } }, t('delete')),
          ),
        );
      })));
    card.appendChild(el('div', { class: 'tbl-wrap' }, tbl));
  }
  search.addEventListener('input', draw);
  await reload();
}

/* ---------- create / edit form ---------- */
function field(labelKey, input, opts = {}) {
  const f = el('div', { class: 'field' + (opts.full ? ' full' : '') }, el('label', { text: t(labelKey) }), input);
  return f;
}

export function openForm(patient, onSaved) {
  const isEdit = !!patient;
  const g = (k) => (patient && patient[k] != null ? patient[k] : '');

  const first = el('input', { value: g('first_name') });
  const last = el('input', { value: g('last_name') });
  const cnp = el('input', { value: g('cnp'), maxlength: '13', inputmode: 'numeric', placeholder: '1234567890123' });
  const cnpErr = el('div', { class: 'err' });
  const dob = el('input', { type: 'date', value: g('dob') });
  const gender = el('select', {}, el('option', { value: '', text: '—' }), el('option', { value: 'M', text: t('gender_m') }), el('option', { value: 'F', text: t('gender_f') }));
  gender.value = g('gender');
  const street = el('input', { value: g('addr_street') });
  const number = el('input', { value: g('addr_number') });
  const city = el('input', { value: g('addr_city') });
  const county = el('input', { value: g('addr_county') });
  const postal = el('input', { value: g('addr_postal') });
  const phone = el('input', { value: g('phone'), type: 'tel' });
  const emailF = el('input', { value: g('email'), type: 'email' });
  const profession = el('input', { value: g('profession') });
  const workplace = el('input', { value: g('workplace') });
  const history = el('textarea', { rows: '2' }); history.value = g('medical_history');
  const allergies = el('textarea', { rows: '2' }); allergies.value = g('allergies');
  const cardio = el('textarea', { rows: '2' }); cardio.value = g('cardio_consults');

  // optional account (create only)
  const makeAcct = el('input', { type: 'checkbox' });
  const acctEmail = el('input', { type: 'email', placeholder: 'pacient@caretrack.ro' });
  const acctPass = el('input', { type: 'password', placeholder: '••••••••' });
  const acctBox = el('div', { class: 'hide' },
    el('div', { class: 'form-grid' },
      field('account_email', acctEmail), field('account_password', acctPass)));
  makeAcct.addEventListener('change', () => acctBox.classList.toggle('hide', !makeAcct.checked));

  function liveCnp() {
    const v = cnp.value.trim();
    cnp.parentElement.classList.remove('invalid'); cnpErr.textContent = '';
    if (v && v.length === 13 && !cnpValid(v)) { cnp.parentElement.classList.add('invalid'); cnpErr.textContent = t('cnp_invalid'); }
  }
  cnp.addEventListener('input', liveCnp);

  const sectionTitle = (k) => el('div', { class: 'section-title', style: 'margin-top:18px', text: t(k) });

  const body = el('div', {},
    sectionTitle('section_personal'),
    el('div', { class: 'form-grid' },
      field('first_name', first), field('last_name', last),
      el('div', { class: 'field' }, el('label', { text: t('cnp') }), cnp, cnpErr),
      field('dob', dob),
      field('gender', gender),
    ),
    sectionTitle('section_address'),
    el('div', { class: 'form-grid' },
      field('addr_street', street), field('addr_number', number),
      field('addr_city', city), field('addr_county', county),
      field('addr_postal', postal),
    ),
    sectionTitle('section_contact'),
    el('div', { class: 'form-grid' },
      field('phone', phone), field('profession', profession),
      field('workplace', workplace),
    ),
    sectionTitle('section_medical'),
    field('medical_history', history, { full: true }),
    field('allergies', allergies, { full: true }),
    field('cardio_consults', cardio, { full: true }),
    isEdit ? null : el('div', {},
      sectionTitle('section_account'),
      el('label', { class: 'row', style: 'gap:8px;cursor:pointer;font-weight:600;font-size:13.5px;color:var(--ink-soft)' }, makeAcct, t('create_account')),
      acctBox,
    ),
  );

  const saveBtn = el('button', { class: 'btn btn-primary' }, t('save'));
  const { close } = modal({
    title: isEdit ? t('edit_patient') : t('new_patient'),
    size: 'lg',
    body,
    footer: [el('button', { class: 'btn btn-ghost', onClick: () => close() }, t('cancel')), saveBtn],
  });

  saveBtn.addEventListener('click', async () => {
    cnpErr.textContent = '';
    if (!first.value.trim() || !last.value.trim()) { toast(t('name_required'), 'err'); return; }
    if (!cnp.value.trim()) { cnp.parentElement.classList.add('invalid'); cnpErr.textContent = t('cnp_required'); return; }
    if (!cnpValid(cnp.value.trim())) { cnp.parentElement.classList.add('invalid'); cnpErr.textContent = t('cnp_invalid'); return; }

    const payload = {
      first_name: first.value.trim(), last_name: last.value.trim(), cnp: cnp.value.trim(),
      dob: dob.value || undefined, gender: gender.value || undefined,
      addr_street: street.value || undefined, addr_number: number.value || undefined,
      addr_city: city.value || undefined, addr_county: county.value || undefined, addr_postal: postal.value || undefined,
      phone: phone.value || undefined, email: emailF.value || undefined,
      profession: profession.value || undefined, workplace: workplace.value || undefined,
      medical_history: history.value || undefined, allergies: allergies.value || undefined, cardio_consults: cardio.value || undefined,
    };
    if (!isEdit && makeAcct.checked && acctEmail.value && acctPass.value) {
      payload.account = { email: acctEmail.value.trim(), password: acctPass.value, locale: getLocale() };
      payload.email = payload.email || acctEmail.value.trim();
    }
    saveBtn.disabled = true; saveBtn.textContent = t('saving');
    try {
      if (isEdit) { await api.updatePatient(patient.id, payload); toast(t('patient_updated'), 'ok'); }
      else { await api.createPatient(payload); toast(t('patient_created'), 'ok'); }
      close(); onSaved && onSaved();
    } catch (e) {
      saveBtn.disabled = false; saveBtn.textContent = t('save');
      if (e instanceof ApiError && e.data && e.data.code === 'patient.cnp_invalid') { cnp.parentElement.classList.add('invalid'); cnpErr.textContent = t('cnp_invalid'); }
      else if (e instanceof ApiError && e.data && e.data.code === 'auth.email_taken') toast(getLocale() === 'en' ? 'Email already in use.' : 'Email deja folosit.', 'err');
      else toast(e.message || 'Error', 'err');
    }
  });

  // first input gets focus on a tick (after modal mounts)
  setTimeout(() => first.focus(), 50);
}
