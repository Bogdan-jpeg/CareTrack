/* views/gateway.js — CareTrack mobile gateway (PWA).
 *
 * Implements assignment section 4:
 *   (a) shows the patient's activities + calendar
 *   (b) shows the doctor's recommendations
 *   (c) the MOBILE APP raises warnings from the 10 s measurements, against the
 *       doctor's limits, when a value is out of the normal range
 *   (d) receives data over Bluetooth and sends it to the cloud every 30 s as the
 *       AVERAGE of the 10 s measurements; anomalies are sent ASYNC, immediately
 *   (e) reads the accelerometer 1x/second and sends it every 30 s as a full BURST
 *   (f) ECG = 100 values/s, visualised live on the phone AND stored for the web
 *   (g) a text NOTE can be attached to an alarm and is sent async with it
 *
 * Two data sources share the exact same downstream logic:
 *   - BleSource : real ESP32 over Web Bluetooth GATT
 *   - SimSource : hardware-free demo mode (same event shape and timings)
 *
 * ===========================================================================
 *  BLE PROTOCOL  (the ESP32 firmware MUST expose exactly these)
 * ===========================================================================
 *  Service        c0de1000-feed-4a1e-b100-d00000000001
 *  Vitals  notify c0de1001-feed-4a1e-b100-d00000000001
 *                 UTF-8 JSON, one object every 10 s:
 *                 {"p":78,"t":36.7,"h":45,"s":98}   p=pulse t=tempC h=hum% s=SpO2%
 *  ECG     notify c0de1002-feed-4a1e-b100-d00000000001
 *                 binary Int16 little-endian samples (raw ADC), streamed ~100/s
 *  Accel   notify c0de1003-feed-4a1e-b100-d00000000001
 *                 UTF-8 JSON, once per second: {"x":0.01,"y":-0.02,"z":1.00}  (g)
 *  Battery notify c0de1004-feed-4a1e-b100-d00000000001   uint8 percent (0..100)
 * ===========================================================================
 */
import { t, getLocale } from '../i18n.js';
import { api, getUser } from '../api.js';
import { el, clear, toast, modal, fmtNum, fmtDate, timeAgo, VITAL_META, onViewCleanup } from '../ui.js';
import { EcgRenderer } from '../charts.js';

export const BLE = {
  SERVICE: 'c0de1000-feed-4a1e-b100-d00000000001',
  VITALS:  'c0de1001-feed-4a1e-b100-d00000000001',
  ECG:     'c0de1002-feed-4a1e-b100-d00000000001',
  ACCEL:   'c0de1003-feed-4a1e-b100-d00000000001',
  BATTERY: 'c0de1004-feed-4a1e-b100-d00000000001',
};

const AGG_MS = 30000;     // cloud send / accel-burst interval  (assignment 4d/4e)
const ECG_FLUSH_MS = 5000; // how often we persist an ECG burst for the web
const ANOMALY_THROTTLE_MS = 60000; // client throttle, matches server dedupe window

/* ---------------- data sources ---------------- */

export class SimSource {
  constructor() { this.handlers = {}; this.timers = []; this._spikePulse = 0; this._fall = false; this.name = 'CareTrack-SIM'; }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, d) { if (this.handlers[ev]) this.handlers[ev](d); }
  async connect() {
    // 10 s vitals
    this.timers.push(setInterval(() => {
      let p = 76 + Math.round(Math.sin(Date.now() / 9000) * 4 + (Math.random() * 4 - 2));
      if (this._spikePulse > 0) { p = 132 + Math.round(Math.random() * 6); this._spikePulse--; }
      const temp = +(22.5 + Math.sin(Date.now() / 20000) * 0.4 + (Math.random() * 0.1 - 0.05)).toFixed(1);
      const hum = 45 + Math.round(Math.sin(Date.now() / 15000) * 4 + (Math.random() * 2 - 1));
      const spo2 = 97 + Math.round(Math.random() * 2);
      this.emit('vitals', { p, t: temp, h: hum, s: spo2 });
    }, 10000));
    // 1 s accel
    this.timers.push(setInterval(() => {
      const x = (Math.random() * 0.06 - 0.03), y = (Math.random() * 0.06 - 0.03), z = 1 + (Math.random() * 0.04 - 0.02);
      const packet = { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) };
      if (this._fall) { packet.x = 1.8; packet.y = -1.6; packet.z = 2.4; packet.fall = 1; this._fall = false; }
      this.emit('accel', packet);
    }, 1000));
    // ECG ~100/s in small chunks (every 100 ms -> 10 samples)
    let phase = 0;
    this.timers.push(setInterval(() => {
      const chunk = [];
      for (let k = 0; k < 10; k++) {
        const ph = phase % 50;
        let v = 2048 + Math.round(Math.sin(phase / 3) * 12);
        if (ph === 10) v += 360; if (ph === 11) v -= 130; if (ph === 8) v += 45;
        if (ph >= 20 && ph <= 28) v += 55;
        chunk.push(v); phase++;
      }
      this.emit('ecg', chunk);
    }, 100));
    // battery
    this.emit('battery', 86);
    this.timers.push(setInterval(() => this.emit('battery', 84 + Math.round(Math.random() * 3)), 20000));
    // fire one vitals + accel immediately so the UI isn't empty
    setTimeout(() => this.emit('vitals', { p: 78, t: 22.5, h: 45, s: 98 }), 150);
    return true;
  }
  triggerHighPulse() { this._spikePulse = 4; }   // ~40 s of high pulse
  triggerFall() { this._fall = true; }
  disconnect() { this.timers.forEach(clearInterval); this.timers = []; if (this.handlers.disconnected) this.handlers.disconnected(); }
}

class BleSource {
  constructor() { this.handlers = {}; this.device = null; this.server = null; this.name = ''; }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, d) { if (this.handlers[ev]) this.handlers[ev](d); }
  async connect() {
    if (!navigator.bluetooth) throw new Error('web_bluetooth_unavailable');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'CareTrack' }],
      optionalServices: [BLE.SERVICE],
    });
    this.name = this.device.name || 'CareTrack';
    this.device.addEventListener('gattserverdisconnected', () => { if (this.handlers.disconnected) this.handlers.disconnected(); });
    this.server = await this.device.gatt.connect();
    const svc = await this.server.getPrimaryService(BLE.SERVICE);

    const dec = new TextDecoder();
    // vitals
    try {
      const c = await svc.getCharacteristic(BLE.VITALS);
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', (e) => {
        try { this.emit('vitals', JSON.parse(dec.decode(e.target.value))); } catch {}
      });
    } catch (e) { console.warn('vitals char missing', e); }
    // ecg (binary int16 LE)
    try {
      const c = await svc.getCharacteristic(BLE.ECG);
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', (e) => {
        const dv = e.target.value; const n = Math.floor(dv.byteLength / 2); const out = [];
        for (let i = 0; i < n; i++) out.push(dv.getInt16(i * 2, true));
        if (out.length) this.emit('ecg', out);
      });
    } catch (e) { console.warn('ecg char missing', e); }
    // accel
    try {
      const c = await svc.getCharacteristic(BLE.ACCEL);
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', (e) => {
        try { this.emit('accel', JSON.parse(dec.decode(e.target.value))); } catch {}
      });
    } catch (e) { console.warn('accel char missing', e); }
    // battery
    try {
      const c = await svc.getCharacteristic(BLE.BATTERY);
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', (e) => this.emit('battery', e.target.value.getUint8(0)));
      const v = await c.readValue().catch(() => null); if (v) this.emit('battery', v.getUint8(0));
    } catch (e) { console.warn('battery char missing', e); }
    return true;
  }
  disconnect() { try { this.device && this.device.gatt.connected && this.device.gatt.disconnect(); } catch {} }
}

/* ---------------- controller (shared logic) ---------------- */

export class Gateway {
  constructor({ source, patientId, deviceId, rules, ui }) {
    this.source = source; this.patientId = patientId; this.deviceId = deviceId;
    this.rules = rules || {}; this.ui = ui;
    this.vitalsWindow = [];     // 10 s measurements within the current 30 s window
    this.accelWindow = [];      // 1 s accel magnitudes within the current 30 s window
    this.ecgBuffer = [];        // ECG samples awaiting persistence
    this.queue = [];            // offline FIFO retry queue
    this.lastAnomaly = {};      // type -> ts (client throttle)
    this.latest = {};           // last seen value per vital
    this.online = navigator.onLine;
    this.lastSync = null;
    this.aggTimer = null; this.ecgTimer = null;

    source.on('vitals', (v) => this.onVitals(v));
    source.on('accel', (a) => this.onAccel(a));
    source.on('ecg', (s) => this.onEcg(s));
    source.on('battery', (b) => this.ui.setBattery(b));
    source.on('disconnected', () => this.ui.onDisconnected());

    window.addEventListener('online', () => { this.online = true; this.flush(); this.ui.setSync(this); });
    window.addEventListener('offline', () => { this.online = false; this.ui.setSync(this); });
  }

  start() {
    this.aggTimer = setInterval(() => this.flushWindow(), AGG_MS);
    this.ecgTimer = setInterval(() => this.flushEcg(), ECG_FLUSH_MS);
  }
  stop() { clearInterval(this.aggTimer); clearInterval(this.ecgTimer); this.source.disconnect(); }

  /* ---- 4c: evaluate each 10 s measurement locally against doctor's limits ---- */
  onVitals(v) {
    // A pulse-oximeter value of 0 means "no finger on the sensor" — the absence of
    // a measurement, not a measurement of 0. Normalise to null so it is neither
    // displayed (shows —), nor alerted on locally, nor included in the 30 s average.
    v = { ...v, p: v.p > 0 ? v.p : null, s: v.s > 0 ? v.s : null };
    this.latest = { ...this.latest, pulse: v.p, temperature: v.t, humidity: v.h, spo2: v.s };
    this.vitalsWindow.push(v);
    this.ui.setVitals(this.latest, this.breaches(v));

    const breaches = this.breaches(v);
    for (const b of breaches) {
      // The mobile app raises the warning (banner + notification).
      this.ui.raiseWarning(b);
      // 4d: send the anomaly async, immediately — throttled to one per type / 60 s.
      const now = Date.now();
      if (!this.lastAnomaly[b.type] || now - this.lastAnomaly[b.type] > ANOMALY_THROTTLE_MS) {
        this.lastAnomaly[b.type] = now;
        this.enqueue({ kind: 'alert', payload: {
          patient_id: this.patientId, device_id: this.deviceId,
          type: b.type, value: b.value, threshold: b.threshold, source: 'gateway',
        } });
      }
    }
  }

  // returns array of { type, value, threshold, label } for any out-of-range field
  breaches(v) {
    const r = this.rules; const out = [];
    const chk = (val, min, max, lowType, highType, label, unit) => {
      if (val == null) return;
      if (max != null && val > max) out.push({ type: highType, value: val, threshold: max, label, unit, dir: 'high' });
      else if (min != null && val < min) out.push({ type: lowType, value: val, threshold: min, label, unit, dir: 'low' });
    };
    chk(v.p, r.min_pulse, r.max_pulse, 'pulse_low', 'pulse_high', t('pulse'), 'BPM');
    chk(v.t, r.min_temp, r.max_temp, 'temp_low', 'temp_high', t('temperature'), '°C');
    chk(v.h, r.min_humidity, r.max_humidity, 'humidity_low', 'humidity_high', t('humidity'), '%');
    chk(v.s, r.min_spo2, null, 'spo2_low', null, t('spo2'), '%');
    return out;
  }

  /* ---- 4e: accelerometer 1x/s, kept for the 30 s burst + fall detection ---- */
  onAccel(a) {
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    this.accelWindow.push({ x: a.x, y: a.y, z: a.z, mag: +mag.toFixed(3), ts: new Date().toISOString() });
    this.ui.setAccel(mag);
    // Fall detection runs on the wearable (free-fall followed by impact) and is
    // signalled with a `fall` flag. Trusting that flag — rather than raw magnitude —
    // avoids false positives from ordinary fast movements (e.g. lifting the device).
    if (a.fall) {
      const now = Date.now();
      if (!this.lastAnomaly.fall || now - this.lastAnomaly.fall > ANOMALY_THROTTLE_MS) {
        this.lastAnomaly.fall = now;
        this.ui.raiseWarning({ type: 'fall', label: t('gw_fall'), dir: 'high' });
        this.enqueue({ kind: 'alert', payload: {
          patient_id: this.patientId, device_id: this.deviceId, type: 'fall',
          value: +mag.toFixed(2), source: 'gateway',
        } });
      }
    }
  }

  /* ---- 4f: ECG 100/s, live on phone + buffered for the web ---- */
  onEcg(samples) {
    this.ui.pushEcg(samples);
    this.ecgBuffer.push(...samples);
  }

  /* ---- 4d: every 30 s send the AVERAGE of the 10 s measurements ---- */
  flushWindow() {
    if (this.vitalsWindow.length) {
      const avg = (key) => {
        const xs = this.vitalsWindow.map((m) => m[key]).filter((x) => x != null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      };
      const items = [];
      const push = (type, val, dp) => { if (val != null) items.push({ patient_id: this.patientId, device_id: this.deviceId, type, value: +val.toFixed(dp) }); };
      push('pulse', avg('p'), 0); push('temperature', avg('t'), 1); push('humidity', avg('h'), 0); push('spo2', avg('s'), 0);
      if (items.length) this.enqueue({ kind: 'vitals', items });
      this.vitalsWindow = [];
    }
    // 4e: send the accelerometer window as one burst (all values)
    if (this.accelWindow.length) {
      this.enqueue({ kind: 'vitals', items: [{
        patient_id: this.patientId, device_id: this.deviceId, type: 'accel_burst',
        value: +(this.accelWindow.reduce((a, b) => a + b.mag, 0) / this.accelWindow.length).toFixed(3),
        metadata: { rate_hz: 1, values: this.accelWindow.map((s) => s.mag) },
      }] });
      this.accelWindow = [];
    }
    this.ui.setSync(this);
  }

  flushEcg() {
    if (!this.ecgBuffer.length) return;
    const samples = this.ecgBuffer.splice(0, this.ecgBuffer.length);
    this.enqueue({ kind: 'ecg', payload: { patient_id: this.patientId, device_id: this.deviceId, sample_rate: 100, samples } });
  }

  /* ---- offline-tolerant FIFO send queue ---- */
  enqueue(job) { this.queue.push(job); this.flush(); }
  async flush() {
    if (this._flushing) return; this._flushing = true;
    try {
      while (this.queue.length) {
        const job = this.queue[0];
        try {
          if (job.kind === 'vitals') await api.ingestBatch(job.items);
          else if (job.kind === 'alert') await api.createAlert(job.payload);
          else if (job.kind === 'ecg') await api.ingestEcg(job.payload);
          this.queue.shift();
          this.lastSync = new Date();
          this.online = true;
        } catch (e) {
          this.online = false; // keep job at head; retry later (FIFO preserved)
          break;
        }
      }
    } finally { this._flushing = false; this.ui.setSync(this); }
  }

  /* attach a note to a freshly raised alarm (4g): send a manual alert + note */
  async sendNoteAlarm(noteText) {
    this.enqueue({ kind: 'alert', payload: {
      patient_id: this.patientId, device_id: this.deviceId, type: 'manual',
      severity: 'warning', source: 'gateway', note: noteText,
      message_ro: 'Avertizare cu notă de la pacient', message_en: 'Patient warning with note',
    } });
  }
  async sendSOS() {
    this.enqueue({ kind: 'alert', payload: {
      patient_id: this.patientId, device_id: this.deviceId, type: 'manual',
      severity: 'critical', source: 'gateway',
      message_ro: 'Alarmă SOS declanșată de pacient', message_en: 'SOS alarm triggered by patient',
    } });
  }
}

/* ---------------- view ---------------- */

export async function renderGateway(root) {
  const me = getUser();
  let patientId = me.patientId;
  let demoNote = null;

  // staff opening the gateway: demo against their first patient
  if (!patientId && (me.role === 'doctor' || me.role === 'admin')) {
    const ps = await api.listPatients().catch(() => []);
    if (ps.length) { patientId = ps[0].id; demoNote = `${ps[0].last_name} ${ps[0].first_name}`; }
  }
  if (!patientId) { root.appendChild(el('div', { class: 'empty', text: t('no_data') })); return; }

  const patient = await api.getPatient(patientId);
  const rules = patient.rules || {};
  const deviceId = (patient.devices && patient.devices[0] && patient.devices[0].id) || null;
  const recos = await api.getRecos(patientId).catch(() => []);

  const view = el('div', { class: 'gw' });
  root.appendChild(view);

  // header + status
  const bleStatus = el('span', { class: 'ble-status' }, el('span', { class: 'dot gray' }), el('span', { text: '—' }));
  view.appendChild(el('div', { class: 'gw-head' },
    el('div', {}, el('div', { class: 't', text: t('gw_title') }), demoNote ? el('div', { class: 'small muted', text: 'demo · ' + demoNote }) : el('div', { class: 'small muted', text: `${patient.last_name} ${patient.first_name}` })),
    bleStatus));

  const body = el('div', {});
  view.appendChild(body);

  let gw = null;
  let ecgRenderer = null;
  const nodes = {};

  // stop sensors / timers / BLE when the user navigates away from the gateway
  onViewCleanup(() => { if (gw) { try { gw.stop(); } catch (e) {} gw = null; } });

  /* ---- the UI object the controller talks to ---- */
  const ui = {
    setBattery(pct) { if (nodes.batt) nodes.batt.textContent = `🔋 ${pct}%`; },
    setVitals(latest, breaches) {
      const bset = new Set(breaches.map((b) => b.type.split('_')[0] === 'temp' ? 'temperature' : b.type.split('_')[0]));
      ['pulse', 'temperature', 'humidity', 'spo2'].forEach((typ) => {
        const n = nodes['v_' + typ]; if (!n) return;
        const meta = VITAL_META[typ];
        n.value.innerHTML = latest[typ] != null ? `${fmtNum(latest[typ])}<span class="u">${meta.unit}</span>` : '—';
        n.card.classList.toggle('alarm', bset.has(typ));
      });
    },
    setAccel(mag) { if (nodes.accel) nodes.accel.textContent = `${mag.toFixed(2)} g`; },
    pushEcg(samples) { if (ecgRenderer) ecgRenderer.push(samples); },
    raiseWarning(b) {
      const txt = b.type === 'fall' ? t('gw_fall')
        : `${b.label}: ${fmtNum(b.value)}${b.unit || ''} ${b.dir === 'high' ? '▲' : '▼'} (${t('max')}/${t('min')} ${fmtNum(b.threshold)})`;
      showAlarmBanner(txt, b.type === 'fall' || b.dir);
      notify(t('gw_alarms'), txt);
    },
    setSync(g) {
      if (!nodes.sync) return;
      clear(nodes.sync);
      const offline = !g.online || g.queue.length > 0;
      nodes.sync.appendChild(el('span', { class: 'd' + (offline ? ' off' : '') }));
      nodes.sync.appendChild(el('span', { text: offline ? t('gw_offline') : t('gw_synced') }));
      if (g.queue.length) nodes.sync.appendChild(el('span', { class: 'buf-badge', text: `${g.queue.length} ${t('gw_buffered')}` }));
      if (g.lastSync) nodes.sync.appendChild(el('span', { class: 'muted', text: ` · ${t('gw_last_sync')}: ${timeAgo(g.lastSync.toISOString())}` }));
    },
    onDisconnected() {
      bleStatus.firstChild.className = 'dot gray';
      bleStatus.lastChild.textContent = t('status_disconnected');
      toast(t('status_disconnected'), 'warn');
      renderConnect();
    },
  };

  function showAlarmBanner(text, critical) {
    const banner = el('div', { class: 'gw-alarm-banner', style: critical ? '' : 'background:var(--amber)' },
      el('span', { class: 'ic', text: '⚠' }), el('div', { style: 'flex:1', text }),
      el('button', { class: 'x-btn', style: 'color:#fff', onClick: () => banner.remove() }, '×'));
    body.insertBefore(banner, body.firstChild);
    setTimeout(() => banner.remove(), 9000);
  }

  function notify(title, text) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') new Notification(title, { body: text });
    } catch {}
  }

  /* ---- connect screen ---- */
  function renderConnect() {
    clear(body);
    bleStatus.firstChild.className = 'dot gray';
    bleStatus.lastChild.textContent = t('status_disconnected');

    const supported = !!navigator.bluetooth;
    const connectBtn = el('button', { class: 'btn' }, t('gw_connect_btn'));
    const simBtn = el('button', { class: 'btn btn-ghost', style: 'width:100%;margin-top:10px' }, '▶ ' + t('gw_simulate'));

    connectBtn.addEventListener('click', () => start(new BleSource(), connectBtn));
    simBtn.addEventListener('click', () => start(new SimSource(), simBtn));

    body.appendChild(el('div', { class: 'gw-connect' },
      el('h2', { text: t('gw_connect_title') }),
      el('p', { text: t('gw_connect_text') }),
      connectBtn,
      el('div', { class: 'small', style: 'opacity:.85;margin-top:10px', text: t('gw_pairing_info') }),
    ));
    if (!supported) body.appendChild(el('div', { class: 'gw-card', style: 'border-color:var(--amber)' }, el('div', { class: 'small', text: '⚠ ' + t('gw_not_supported') })));
    body.appendChild(simBtn);

    // recommendations + calendar are visible even before connecting (4a/4b)
    body.appendChild(recosCard());
  }

  async function start(source, btn) {
    btn.disabled = true; const old = btn.textContent; btn.textContent = t('gw_connecting');
    try {
      // ask for notification permission so the app can raise warnings (4c)
      if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
      await source.connect();
    } catch (e) {
      btn.disabled = false; btn.textContent = old;
      if (String(e.message).includes('web_bluetooth')) toast(t('gw_not_supported'), 'err');
      else toast(getLocale() === 'en' ? 'Connection cancelled.' : 'Conectare anulată.', 'warn');
      return;
    }
    bleStatus.firstChild.className = 'dot green';
    bleStatus.lastChild.textContent = `${t('gw_connected_to')} ${source.name || 'CareTrack'}`;

    gw = new Gateway({ source, patientId, deviceId, rules, ui });
    renderLive(source);
    gw.start();
  }

  /* ---- live dashboard ---- */
  function renderLive(source) {
    clear(body);
    const isSim = source instanceof SimSource;

    // live vital cards
    const live = el('div', { class: 'gw-live' });
    const mkVital = (typ) => {
      const meta = VITAL_META[typ];
      const value = el('div', { class: 'v', text: '—' });
      const card = el('div', { class: 'gw-vital' },
        el('div', { class: 'lbl' }, el('span', { text: meta.icon }), el('span', { text: typLabel(typ) })),
        value);
      nodes['v_' + typ] = { card, value };
      return card;
    };
    ['pulse', 'temperature', 'humidity', 'spo2'].forEach((typ) => live.appendChild(mkVital(typ)));
    body.appendChild(live);

    // sync + accel + battery line
    nodes.sync = el('div', { class: 'sync-line' });
    nodes.accel = el('b', { text: '—' });
    nodes.batt = el('b', { text: '—' });
    body.appendChild(el('div', { class: 'gw-card' },
      el('div', { class: 'row between' },
        el('div', { style: 'font-weight:700;font-size:14px', text: t('gw_sync') }),
        el('div', { class: 'metric-mini' },
          el('span', {}, t('gw_accel') + ': ', nodes.accel),
          nodes.batt),
      ),
      nodes.sync,
      el('div', { class: 'metric-mini', style: 'margin-top:8px' },
        el('span', { text: `${t('measurements_10s')} → ${t('sent_30s')}` })),
    ));
    ui.setSync(gw);

    // ECG live
    const ecgCanvas = el('canvas', { style: 'height:130px' });
    body.appendChild(el('div', { class: 'gw-card' },
      el('h3', { text: t('gw_ecg') }),
      el('div', { class: 'gw-ecg' }, ecgCanvas)));
    setTimeout(() => { ecgRenderer = new EcgRenderer(ecgCanvas); }, 30);

    // actions: SOS + note
    body.appendChild(el('div', { class: 'gw-card' },
      el('div', { class: 'gw-actions' },
        el('button', { class: 'btn btn-danger', onClick: doSOS }, '🆘 ' + t('gw_sos')),
        el('button', { class: 'btn btn-ghost', onClick: doNote }, '📝 ' + t('gw_add_note'))),
    ));

    // demo controls (only in simulation mode) — makes 4c & fall demoable reliably
    if (isSim) {
      body.appendChild(el('div', { class: 'gw-card', style: 'border-style:dashed' },
        el('div', { class: 'small muted mb', text: t('gw_sim_on') }),
        el('div', { class: 'row', style: 'gap:8px' },
          el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { source.triggerHighPulse(); toast(getLocale() === 'en' ? 'Injecting high pulse…' : 'Se simulează puls crescut…', 'warn'); } }, '❤ ' + (getLocale() === 'en' ? 'High pulse' : 'Puls crescut')),
          el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { source.triggerFall(); toast(getLocale() === 'en' ? 'Injecting fall…' : 'Se simulează cădere…', 'warn'); } }, '🤕 ' + (getLocale() === 'en' ? 'Fall' : 'Cădere')),
        )));
    }

    // disconnect + recommendations
    body.appendChild(el('button', { class: 'btn btn-ghost', style: 'width:100%;margin-top:12px', onClick: () => { gw.stop(); gw = null; renderConnect(); } }, t('gw_disconnect')));
    body.appendChild(recosCard());
  }

  async function doSOS() {
    await gw.sendSOS();
    toast(t('gw_alarm_sent'), 'ok');
    showAlarmBanner(getLocale() === 'en' ? 'SOS sent.' : 'SOS trimis.', true);
  }
  function doNote() {
    const ta = el('textarea', { rows: '3', placeholder: t('note_placeholder') });
    const save = el('button', { class: 'btn btn-primary' }, t('save'));
    const { close } = modal({ title: t('gw_add_note'), body: el('div', { class: 'field' }, ta), footer: [el('button', { class: 'btn btn-ghost', onClick: () => close() }, t('cancel')), save] });
    save.addEventListener('click', async () => { await gw.sendNoteAlarm(ta.value || ''); toast(t('gw_note_sent'), 'ok'); close(); });
  }

  /* recommendations + calendar card (4a / 4b) */
  function recosCard() {
    const RICON = { walk: '🚶', cycling: '🚴', running: '🏃', exercise: '🤸', other: '📋' };
    const card = el('div', { class: 'gw-card' }, el('h3', { text: t('gw_recos') }));
    if (!recos.length) card.appendChild(el('div', { class: 'small muted', text: t('no_reco') }));
    else recos.forEach((r) => {
      const det = [];
      if (r.daily_duration_min) det.push(`${r.daily_duration_min} min/${getLocale() === 'en' ? 'day' : 'zi'}`);
      if (r.start_date) det.push(`${fmtDate(r.start_date)}${r.end_date ? ' → ' + fmtDate(r.end_date) : ''}`);
      card.appendChild(el('div', { class: 'gw-row' },
        el('div', { class: 'row', style: 'gap:10px' }, el('span', { text: RICON[r.type] || '📋' }), el('div', {}, el('b', { text: r.title || t('reco_' + r.type) }), el('div', { class: 'small muted', text: det.join(' · ') }))),
      ));
    });
    card.appendChild(el('div', { class: 'section-title', style: 'margin-top:14px', text: t('activity_calendar') }));
    card.appendChild(miniCalendar(recos));
    return card;
  }

  function typLabel(typ) { return ({ pulse: t('pulse'), temperature: t('temperature'), humidity: t('humidity'), spo2: t('spo2') })[typ]; }

  renderConnect();
}

/* compact month calendar marking days covered by a recommendation */
function miniCalendar(recos) {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const covered = new Set();
  recos.forEach((r) => {
    if (!r.start_date) return;
    const s = new Date(r.start_date), e = r.end_date ? new Date(r.end_date) : s;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getFullYear() === y && d.getMonth() === m) covered.add(d.getDate());
  });
  const dows = getLocale() === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
  const cal = el('div', { class: 'cal' });
  dows.forEach((d) => cal.appendChild(el('div', { class: 'dow', text: d })));
  for (let i = 0; i < startDow; i++) cal.appendChild(el('div', { class: 'day out' }));
  for (let d = 1; d <= days; d++) cal.appendChild(el('div', { class: 'day' + (covered.has(d) ? ' has' : '') }, el('span', { class: 'n', text: String(d) })));
  return cal;
}
