/* views/patient_detail.js — full patient record with tabs. Shared by doctor & patient. */
import { t, getLocale, tVital } from '../i18n.js';
import { api, getUser, getBlob } from '../api.js';
import { el, clear, modal, toast, confirmDialog, fmtNum, fmtDate, fmtDateTime, timeAgo, alertMsg, sevClass, initials, VITAL_META } from '../ui.js';
import { lineChart, EcgRenderer, fmtTimeLabels } from '../charts.js';

export async function renderPatientDetail(root, params) {
  const id = params[0];
  const me = getUser();
  const isStaff = me.role === 'doctor' || me.role === 'admin';

  const wrap = el('div', {});
  root.appendChild(wrap);
  wrap.appendChild(el('div', { class: 'muted', text: t('loading') }));

  let p;
  try { p = await api.getPatient(id); }
  catch (e) { clear(wrap); wrap.appendChild(el('div', { class: 'empty' }, el('div', { text: '⚠ ' + (e.message || 'error') }))); return; }

  clear(wrap);

  // header
  wrap.appendChild(el('div', { class: 'page-head' },
    el('div', { class: 'detail-head' },
      el('div', { class: 'big-av', text: initials(p.first_name, p.last_name).toUpperCase() }),
      el('div', {},
        isStaff ? el('a', { href: '#/patients', class: 'small muted', text: '← ' + t('back') }) : null,
        el('h1', { text: `${p.last_name} ${p.first_name}` }),
        el('div', { class: 'sub', text: `${p.age ?? '—'} ${t('years')} · ${p.cnp || ''}` }),
      )),
    isStaff ? el('div', { class: 'head-actions' },
      el('button', { class: 'btn btn-ghost', onClick: () => import('./patients.js').then(m => m.openForm(p, () => renderPatientDetail(root, params))) }, t('edit')),
    ) : null,
  ));

  // tabs
  const tabs = isStaff
    ? ['overview', 'vitals', 'ecg', 'alerts', 'rules', 'reco', 'report']
    : ['overview', 'vitals', 'ecg', 'alerts', 'reco'];
  const tabbar = el('div', { class: 'tabbar' });
  const panel = el('div', {});
  wrap.appendChild(tabbar);
  wrap.appendChild(panel);

  let active = 'overview';
  const renderers = {
    overview: () => tabOverview(panel, p, isStaff),
    vitals: () => tabVitals(panel, p),
    ecg: () => tabEcg(panel, p),
    alerts: () => tabAlerts(panel, p, isStaff, me),
    rules: () => tabRules(panel, p),
    reco: () => tabReco(panel, p, isStaff),
    report: () => tabReport(panel, p),
  };
  function setTab(name) {
    active = name;
    clear(tabbar);
    tabs.forEach((tb) => tabbar.appendChild(el('button', { class: active === tb ? 'on' : '', onClick: () => setTab(tb) }, t('tab_' + tb))));
    clear(panel); panel.appendChild(el('div', { class: 'muted', text: t('loading') }));
    Promise.resolve(renderers[name]()).catch((e) => { clear(panel); panel.appendChild(el('div', { class: 'empty', text: '⚠ ' + (e.message || '') })); });
  }
  setTab('overview');
}

/* ---------------- Overview ---------------- */
async function tabOverview(panel, p, isStaff) {
  const latest = await api.getLatest(p.id).catch(() => ({}));
  clear(panel);

  // vital cards
  const cards = el('div', { class: 'grid grid-4', style: 'margin-bottom:18px' });
  const rules = p.rules || {};
  const order = ['pulse', 'temperature', 'humidity', 'spo2'];
  order.forEach((typ) => {
    const meta = VITAL_META[typ];
    const v = latest[typ];
    let cls = '';
    if (v) {
      const val = v.value;
      const overMax = (typ === 'pulse' && rules.max_pulse && val > rules.max_pulse) || (typ === 'temperature' && rules.max_temp && val > rules.max_temp) || (typ === 'humidity' && rules.max_humidity && val > rules.max_humidity);
      const underMin = (typ === 'pulse' && rules.min_pulse && val < rules.min_pulse) || (typ === 'spo2' && rules.min_spo2 && val < rules.min_spo2) || (typ === 'temperature' && rules.min_temp && val < rules.min_temp);
      if (overMax || underMin) cls = (typ === 'pulse' || typ === 'spo2') ? 'is-red' : 'is-amber';
      else cls = 'is-green';
    }
    cards.appendChild(el('div', { class: 'stat ' + cls },
      el('div', { class: 'lbl', text: tVital(typ) }),
      el('div', { class: 'val tnum', html: v ? `${fmtNum(v.value)}<span class="unit">${meta.unit}</span>` : '—' }),
      el('div', { class: 'foot', text: v ? timeAgo(v.ts) : t('no_data') }),
    ));
  });
  panel.appendChild(cards);

  // demographic + medical
  const dem = el('div', { class: 'card card-pad' },
    el('div', { class: 'section-title', text: t('section_personal') }),
    el('dl', { class: 'kv' },
      kv('cnp', p.cnp), kv('dob', fmtDate(p.dob)), kv('gender', p.gender === 'M' ? t('gender_m') : p.gender === 'F' ? t('gender_f') : '—'),
      kv('phone', p.phone), kv('email', p.email), kv('profession', p.profession), kv('workplace', p.workplace),
      kv('addr_street', [p.addr_street, p.addr_number].filter(Boolean).join(' ')),
      kv('addr_city', [p.addr_city, p.addr_county, p.addr_postal].filter(Boolean).join(', ')),
    ),
  );
  const med = el('div', { class: 'card card-pad' },
    el('div', { class: 'section-title', text: t('section_medical') }),
    el('dl', { class: 'kv' },
      kv('medical_history', p.medical_history),
      kv('allergies', p.allergies),
      kv('cardio_consults', p.cardio_consults),
    ),
  );
  panel.appendChild(el('div', { class: 'grid grid-2' }, dem, med));

  // device info
  if (p.devices && p.devices.length) {
    const d = p.devices[0];
    panel.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:18px' },
      el('div', { class: 'section-title', text: t('col_device') }),
      el('dl', { class: 'kv' },
        kv2('ID', d.id), kv2('BLE', d.ble_name || '—'), kv2('Firmware', d.firmware_version || '—'),
        kv2(t('col_status'), t('status_' + d.status)),
      )));
  }

  function kv(labelKey, val) { return [el('dt', { text: t(labelKey) }), el('dd', { text: val || '—' })]; }
  function kv2(label, val) { return [el('dt', { text: label }), el('dd', { text: val || '—' })]; }
}

/* ---------------- Vitals charts ---------------- */
async function tabVitals(panel, p) {
  clear(panel);
  panel.appendChild(el('div', { class: 'small muted mb', text: t('last_24h') }));
  const grid = el('div', { class: 'grid grid-2' });
  panel.appendChild(grid);

  const types = [
    { typ: 'pulse', color: '#cf4438' },
    { typ: 'temperature', color: '#c97f12' },
    { typ: 'humidity', color: '#0f7361' },
    { typ: 'spo2', color: '#2b6fb0' },
  ];
  for (const { typ, color } of types) {
    const box = el('div', { class: 'card card-pad' }, el('h3', { style: 'font-size:15px;margin-bottom:10px', text: tVital(typ) }));
    const canvasWrap = el('div', { class: 'chart-box sm' });
    const canvas = el('canvas', {});
    canvasWrap.appendChild(canvas); box.appendChild(canvasWrap); grid.appendChild(box);

    const rows = await api.getVitals(p.id, `?type=${typ}&limit=300`).catch(() => []);
    if (!rows.length) { clear(canvasWrap); canvasWrap.classList.remove('chart-box'); canvasWrap.appendChild(el('div', { class: 'empty', text: t('no_data') })); continue; }
    lineChart(canvas, {
      labels: fmtTimeLabels(rows),
      datasets: [{ label: tVital(typ), data: rows.map((r) => r.value), color, fill: color + '14' }],
    });
  }
}

/* ---------------- ECG ---------------- */
async function tabEcg(panel, p) {
  clear(panel);
  const recs = await api.getEcg(p.id, '?limit=1').catch(() => []);
  if (!recs.length) { panel.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '📈' }), el('div', { text: t('no_data') }))); return; }
  const rec = recs[0];
  panel.appendChild(el('div', { class: 'card card-pad' },
    el('div', { class: 'row between mb' },
      el('h3', { style: 'font-size:15px', text: t('tab_ecg') }),
      el('span', { class: 'small muted', text: `${rec.sample_rate} Hz · ${fmtDateTime(rec.ts)}` })),
    el('div', { class: 'ecg-box' }, (() => { const c = el('canvas', { style: 'height:220px' }); setTimeout(() => { const r = new EcgRenderer(c); r.setSamples(rec.samples); }, 30); return c; })()),
  ));
}

/* ---------------- Alerts ---------------- */
async function tabAlerts(panel, p, isStaff, me) {
  const alerts = await api.patientAlerts(p.id, '?limit=100');
  clear(panel);
  if (!alerts.length) { panel.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '✓' }), el('div', { text: t('no_alerts') }))); return; }
  const card = el('div', { class: 'card card-pad' });
  alerts.forEach((a) => card.appendChild(alertRow(a, p, isStaff, me, () => tabAlerts(panel, p, isStaff, me))));
  panel.appendChild(card);
}

function alertRow(a, p, isStaff, me, reload) {
  const actions = el('div', { class: 'row', style: 'gap:6px;margin-top:8px' });
  if (isStaff && a.status === 'open') {
    actions.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { await api.updateAlert(a.id, { status: 'ack' }); toast(t('alert_updated'), 'ok'); reload(); } }, t('acknowledge')));
    actions.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { await api.updateAlert(a.id, { status: 'closed' }); toast(t('alert_updated'), 'ok'); reload(); } }, t('close_alert')));
  }
  if (!isStaff) {
    actions.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openNote(a, reload) }, t('add_note')));
  }
  const stPill = el('span', { class: 'pill ' + (a.status === 'open' ? sevClass(a.severity) : 'gray'), text: t('st_' + a.status) });
  return el('div', { class: 'alert-row sev-' + a.severity },
    el('div', { class: 'ic', text: a.severity === 'critical' ? '⚠' : a.severity === 'warning' ? '!' : 'i' }),
    el('div', { class: 'body' },
      el('div', { class: 'msg', text: alertMsg(a) }),
      el('div', { class: 'when', text: fmtDateTime(a.created_at) }),
      a.note ? el('div', { class: 'note' }, el('b', { text: t('patient_note') + ': ' }), a.note) : null,
      actions,
    ),
    stPill,
  );
}

function openNote(a, reload) {
  const ta = el('textarea', { rows: '3', placeholder: t('note_placeholder') }); ta.value = a.note || '';
  const save = el('button', { class: 'btn btn-primary' }, t('save'));
  const { close } = modal({ title: t('add_note'), body: el('div', { class: 'field' }, ta), footer: [el('button', { class: 'btn btn-ghost', onClick: () => close() }, t('cancel')), save] });
  save.addEventListener('click', async () => { await api.updateAlert(a.id, { note: ta.value }); toast(t('note_saved'), 'ok'); close(); reload(); });
}

/* ---------------- Rules / limits (doctor) ---------------- */
async function tabRules(panel, p) {
  const rules = await api.getRules(p.id);
  clear(panel);
  panel.appendChild(el('div', { class: 'card card-pad' },
    el('div', { class: 'section-title', text: t('rules_title') }),
    el('p', { class: 'small muted mb', text: t('rules_sub') }),
    (() => {
      const num = (k) => { const i = el('input', { type: 'number', step: 'any', value: rules[k] != null ? rules[k] : '' }); i.dataset.k = k; return i; };
      const inputs = {};
      const mk = (k) => { const i = num(k); inputs[k] = i; return el('div', { class: 'field' }, el('label', { text: t(k) }), i); };
      const grid = el('div', { class: 'form-grid' },
        mk('min_pulse'), mk('max_pulse'),
        mk('min_temp'), mk('max_temp'),
        mk('min_humidity'), mk('max_humidity'),
        mk('min_spo2'),
        mk('persistence_seconds'),
      );
      const btn = el('button', { class: 'btn btn-primary', style: 'margin-top:8px' }, t('save_rules'));
      btn.addEventListener('click', async () => {
        const payload = {};
        Object.entries(inputs).forEach(([k, i]) => { payload[k] = i.value === '' ? null : Number(i.value); });
        btn.disabled = true; btn.textContent = t('saving');
        try { await api.setRules(p.id, payload); toast(t('rules_saved'), 'ok'); }
        finally { btn.disabled = false; btn.textContent = t('save_rules'); }
      });
      // persistence label fix (it's not in i18n numeric keys list above)
      grid.querySelectorAll('label').forEach((l, idx) => {});
      return el('div', {}, grid, btn);
    })(),
  ));
  // relabel persistence field (last)
  const labels = panel.querySelectorAll('.form-grid label');
  if (labels.length) labels[labels.length - 1].textContent = t('persistence');
}

/* ---------------- Recommendations + calendar ---------------- */
async function tabReco(panel, p, isStaff) {
  const recos = await api.getRecos(p.id);
  clear(panel);

  if (isStaff) {
    panel.appendChild(el('div', { class: 'row between mb' },
      el('div', { class: 'section-title', style: 'margin:0', text: t('reco_title') }),
      el('button', { class: 'btn btn-primary btn-sm', onClick: () => openReco(p, () => tabReco(panel, p, isStaff)) }, '＋ ' + t('add_reco'))));
  } else {
    panel.appendChild(el('div', { class: 'section-title', text: t('reco_title') }));
  }

  const RICON = { walk: '🚶', cycling: '🚴', running: '🏃', exercise: '🤸', other: '📋' };
  if (!recos.length) {
    panel.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ic', text: '📋' }), el('div', { text: t('no_reco') })));
  } else {
    const list = el('div', { class: 'grid grid-2' });
    recos.forEach((r) => {
      const det = [];
      if (r.daily_duration_min) det.push(`${r.daily_duration_min} min/${getLocale() === 'en' ? 'day' : 'zi'}`);
      if (r.start_date) det.push(`${fmtDate(r.start_date)}${r.end_date ? ' → ' + fmtDate(r.end_date) : ''}`);
      list.appendChild(el('div', { class: 'reco-card' },
        el('div', { class: 'ric', text: RICON[r.type] || '📋' }),
        el('div', { style: 'flex:1' },
          el('h4', { text: r.title || t('reco_' + r.type) }),
          el('div', { class: 'det', text: det.join(' · ') }),
          r.instructions ? el('div', { class: 'det', style: 'margin-top:4px', text: r.instructions }) : null,
          isStaff ? el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px;color:var(--red)', onClick: () => confirmDialog(t('confirm_delete'), async () => { await api.delReco(r.id); toast(t('reco_deleted'), 'ok'); tabReco(panel, p, isStaff); }) }, t('delete')) : null,
        ),
      ));
    });
    panel.appendChild(list);
  }

  // activity calendar (current month) showing days covered by any recommendation
  panel.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:18px' },
    el('div', { class: 'section-title', text: t('activity_calendar') }),
    buildCalendar(recos)));
}

function buildCalendar(recos) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday=0
  const days = new Date(year, month + 1, 0).getDate();
  const covered = new Set();
  recos.forEach((r) => {
    if (!r.start_date) return;
    const s = new Date(r.start_date); const e = r.end_date ? new Date(r.end_date) : s;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === year && d.getMonth() === month) covered.add(d.getDate());
    }
  });
  const dows = getLocale() === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
  const cal = el('div', { class: 'cal' });
  dows.forEach((d) => cal.appendChild(el('div', { class: 'dow', text: d })));
  for (let i = 0; i < startDow; i++) cal.appendChild(el('div', { class: 'day out' }));
  for (let d = 1; d <= days; d++) {
    cal.appendChild(el('div', { class: 'day' + (covered.has(d) ? ' has' : '') + (d === now.getDate() ? '' : '') }, el('span', { class: 'n', text: String(d) })));
  }
  return cal;
}

function openReco(p, reload) {
  const type = el('select', {}, ['walk', 'cycling', 'running', 'exercise', 'other'].map((tp) => el('option', { value: tp, text: t('reco_' + tp) })));
  const title = el('input', {});
  const dur = el('input', { type: 'number', min: '0' });
  const instr = el('textarea', { rows: '3' });
  const start = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const end = el('input', { type: 'date' });
  const save = el('button', { class: 'btn btn-primary' }, t('save'));
  const { close } = modal({
    title: t('add_reco'),
    body: el('div', {},
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', { text: t('reco_type') }), type),
        el('div', { class: 'field' }, el('label', { text: t('reco_name') }), title),
        el('div', { class: 'field' }, el('label', { text: t('reco_duration') }), dur),
        el('div', { class: 'field' }, el('label', { text: t('reco_start') }), start),
        el('div', { class: 'field' }, el('label', { text: t('reco_end') }), end),
      ),
      el('div', { class: 'field' }, el('label', { text: t('reco_instructions') }), instr),
    ),
    footer: [el('button', { class: 'btn btn-ghost', onClick: () => close() }, t('cancel')), save],
  });
  save.addEventListener('click', async () => {
    await api.addReco(p.id, {
      type: type.value, title: title.value || undefined,
      daily_duration_min: dur.value || undefined, instructions: instr.value || undefined,
      start_date: start.value || undefined, end_date: end.value || undefined,
    });
    toast(t('reco_added'), 'ok'); close(); reload();
  });
}

/* ---------------- Report ---------------- */
async function tabReport(panel, p) {
  clear(panel);
  const from = el('input', { type: 'date' });
  const to = el('input', { type: 'date' });
  const lang = el('select', {}, el('option', { value: 'ro', text: 'Română' }), el('option', { value: 'en', text: 'English' }));
  lang.value = getLocale();

  async function download(fmt) {
    const qs = new URLSearchParams();
    if (from.value) qs.set('from', from.value);
    if (to.value) qs.set('to', to.value + 'T23:59:59');
    qs.set('format', fmt); qs.set('lang', lang.value);
    try {
      const blob = await getBlob(`/patients/${p.id}/report?${qs.toString()}`);
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `report_${p.id}.${fmt}` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message || 'Error', 'err'); }
  }

  panel.appendChild(el('div', { class: 'card card-pad', style: 'max-width:560px' },
    el('div', { class: 'section-title', text: t('report_title') }),
    el('p', { class: 'small muted mb', text: t('report_sub') }),
    el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { text: t('from_date') }), from),
      el('div', { class: 'field' }, el('label', { text: t('to_date') }), to),
      el('div', { class: 'field full' }, el('label', { text: t('report_lang') }), lang),
    ),
    el('div', { class: 'row', style: 'gap:10px;margin-top:8px' },
      el('button', { class: 'btn btn-primary', onClick: () => download('pdf') }, '⬇ ' + t('gen_pdf')),
      el('button', { class: 'btn btn-ghost', onClick: () => download('csv') }, '⬇ ' + t('gen_csv')),
    ),
    el('p', { class: 'hint', style: 'margin-top:14px', text: t('report_note') }),
  ));
}
