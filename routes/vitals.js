/*
 * routes/vitals.js — measurement ingestion and retrieval.
 *  - POST /api/vitals          ingest one measurement (runs the rules engine)   TA-08/09/13
 *  - POST /api/vitals/batch    ingest a buffered batch in order (FIFO)          TA-21/22
 *  - POST /api/ecg             ingest an ECG burst                              TA-18
 *  - GET  /api/patients/:id/vitals?type=&from=&to=&limit=                       TA-17
 *  - GET  /api/patients/:id/vitals/latest                                       dashboard cards
 *  - GET  /api/patients/:id/ecg?latest=1|&limit=                                ECG viewer
 */
const express = require('express');
const { db, nrun } = require('../db');
const { requireAuth, resolvePatientAccess } = require('../lib/auth');
const { evaluateVital } = require('../lib/rules-engine');

const router = express.Router();

function riskFromAlert(alert) {
  if (!alert) return 'green';
  if (alert.severity === 'critical') return 'red';
  if (alert.severity === 'warning') return 'yellow';
  return 'green';
}

function ingestOne(user, b) {
  const acc = resolvePatientAccess(user, b.patient_id);
  if (!acc.ok) return { status: acc.status, body: { error: acc.code, code: acc.code } };
  const ts = b.ts || new Date().toISOString();
  nrun(db.prepare('INSERT INTO vitals (patient_id, device_id, ts, type, value, metadata) VALUES (?,?,?,?,?,?)'),
       b.patient_id, b.device_id || null, ts, b.type, b.value ?? null,
       b.metadata ? JSON.stringify(b.metadata) : null);
  if (b.device_id) {
    db.prepare("UPDATE devices SET last_seen = datetime('now') WHERE id = ?").run(b.device_id);
  }
  const alert = evaluateVital({
    patientId: b.patient_id, deviceId: b.device_id, type: b.type,
    value: b.value, ts, source: b.source || 'gateway',
  });
  return {
    status: 201,
    body: { message: 'Saved', risk_level: riskFromAlert(alert), alert_generated: !!alert, alert: alert || null },
  };
}

// POST /api/vitals
router.post('/vitals', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !b.type) return res.status(400).json({ error: 'invalid_payload', code: 'vitals.invalid' });
  const r = ingestOne(req.user, b);
  res.status(r.status).json(r.body);
});

// POST /api/vitals/batch  { items: [ {patient_id,type,value,ts,...}, ... ] }  (FIFO flush)
router.post('/vitals/batch', requireAuth, (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items_array_required' });
  const results = [];
  let alerts = 0;
  for (const it of items) {              // processed in received order = FIFO
    if (!it.patient_id || !it.type) { results.push({ ok: false, error: 'invalid' }); continue; }
    const r = ingestOne(req.user, it);
    if (r.status === 201) {
      results.push({ ok: true, alert_generated: r.body.alert_generated });
      if (r.body.alert_generated) alerts++;
    } else {
      results.push({ ok: false, error: r.body.code });
    }
  }
  res.json({ message: 'Batch processed', count: results.length, alerts_generated: alerts, results });
});

// POST /api/ecg  { patient_id, device_id, ts, sample_rate, samples:[...] }
router.post('/ecg', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !Array.isArray(b.samples)) {
    return res.status(400).json({ error: 'invalid_payload', code: 'ecg.invalid' });
  }
  const acc = resolvePatientAccess(req.user, b.patient_id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const ts = b.ts || new Date().toISOString();
  const info = db.prepare('INSERT INTO ecg_records (patient_id, device_id, ts, sample_rate, samples) VALUES (?,?,?,?,?)')
    .run(b.patient_id, b.device_id || null, ts, b.sample_rate || 100, JSON.stringify(b.samples));
  res.status(201).json({ message: 'Saved', id: info.lastInsertRowid, samples: b.samples.length });
});

// GET /api/patients/:id/vitals
router.get('/patients/:id/vitals', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const { type, from, to } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 10000);
  let sql = 'SELECT id, device_id, ts, type, value, metadata FROM vitals WHERE patient_id = ?';
  const params = [req.params.id];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (from) { sql += ' AND ts >= ?'; params.push(from); }
  if (to)   { sql += ' AND ts <= ?'; params.push(to); }
  sql += ' ORDER BY ts ASC LIMIT ?'; params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

// GET /api/patients/:id/vitals/latest  — most recent value per type
router.get('/patients/:id/vitals/latest', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const rows = db.prepare(
    `SELECT v.type, v.value, v.ts FROM vitals v
     JOIN (SELECT type, MAX(ts) mts FROM vitals WHERE patient_id = ? GROUP BY type) m
       ON m.type = v.type AND m.mts = v.ts
     WHERE v.patient_id = ?`
  ).all(req.params.id, req.params.id);
  const out = {};
  for (const r of rows) out[r.type] = { value: r.value, ts: r.ts };
  res.json(out);
});

// GET /api/patients/:id/ecg
router.get('/patients/:id/ecg', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const limit = Math.min(parseInt(req.query.limit, 10) || (req.query.latest ? 1 : 10), 100);
  const rows = db.prepare('SELECT * FROM ecg_records WHERE patient_id = ? ORDER BY ts DESC LIMIT ?')
    .all(req.params.id, limit);
  res.json(rows.map((r) => ({ ...r, samples: JSON.parse(r.samples) })));
});

module.exports = router;
