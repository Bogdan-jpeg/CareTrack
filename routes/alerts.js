/*
 * routes/alerts.js — alerts / warnings.
 *  - GET   /api/alerts?patient_id=&status=&severity=   list (strictly isolated)  TA-23/25
 *  - GET   /api/patients/:id/alerts
 *  - POST  /api/alerts                                  manual / event alert
 *  - PATCH /api/alerts/:id   { status?, note? }         ack/close + patient note  TA-14
 */
const express = require('express');
const { db, nrun } = require('../db');
const { requireAuth, requireRole, resolvePatientAccess, audit } = require('../lib/auth');
const { createEventAlert } = require('../lib/rules-engine');

const router = express.Router();

// patient ids the current user is allowed to see
function allowedPatientIds(user) {
  if (user.role === 'admin') {
    return db.prepare('SELECT id FROM patients WHERE deleted_at IS NULL').all().map((r) => r.id);
  }
  if (user.role === 'doctor') {
    return db.prepare('SELECT id FROM patients WHERE doctor_id = ? AND deleted_at IS NULL').all(user.uid).map((r) => r.id);
  }
  const p = db.prepare('SELECT id FROM patients WHERE user_id = ? AND deleted_at IS NULL').get(user.uid);
  return p ? [p.id] : [];
}

// GET /api/alerts
router.get('/alerts', requireAuth, (req, res) => {
  const { status, severity } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);
  let ids;
  if (req.query.patient_id) {
    const acc = resolvePatientAccess(req.user, req.query.patient_id);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
    ids = [req.query.patient_id];
  } else {
    ids = allowedPatientIds(req.user);
  }
  if (!ids.length) return res.json([]);
  let sql = `SELECT * FROM alerts WHERE patient_id IN (${ids.map(() => '?').join(',')})`;
  const params = [...ids];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (severity) { sql += ' AND severity = ?'; params.push(severity); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

// GET /api/patients/:id/alerts
router.get('/patients/:id/alerts', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);
  res.json(db.prepare('SELECT * FROM alerts WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(req.params.id, limit));
});

// POST /api/alerts  — manual or event alert (doctor raise / gateway fall / patient SOS)
router.post('/alerts', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !b.type) return res.status(400).json({ error: 'invalid_payload' });
  const acc = resolvePatientAccess(req.user, b.patient_id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const extra = {};
  if (b.message_ro) extra.ro = b.message_ro;
  if (b.message_en) extra.en = b.message_en;
  if (b.severity) extra.severity = b.severity;
  const alert = createEventAlert({
    patientId: b.patient_id, deviceId: b.device_id, type: b.type,
    ts: b.ts, value: b.value, threshold: b.threshold,
    source: b.source || (req.user.role === 'patient' ? 'gateway' : 'cloud'), extra,
  });
  if (b.note) db.prepare('UPDATE alerts SET note = ? WHERE id = ?').run(b.note, alert.id);
  audit(req, 'alert.create', 'alert', alert.id, { type: b.type, patient_id: b.patient_id });
  res.status(201).json(db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id));
});

// PATCH /api/alerts/:id  { status?, note? }
router.patch('/alerts/:id', requireAuth, (req, res) => {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'not_found' });
  const acc = resolvePatientAccess(req.user, alert.patient_id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });

  const b = req.body || {};
  const sets = [], params = [];
  // A patient may attach a note to their own alert (TA-14).
  if (typeof b.note === 'string') { sets.push('note = ?'); params.push(b.note); }
  // Status changes (ack/close) are for clinical staff.
  if (b.status) {
    if (!['open', 'ack', 'closed'].includes(b.status)) return res.status(400).json({ error: 'bad_status' });
    if (req.user.role === 'patient') return res.status(403).json({ error: 'forbidden', code: 'auth.forbidden' });
    sets.push('status = ?'); params.push(b.status);
    sets.push('acknowledged_by = ?'); params.push(req.user.uid);
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });
  params.push(req.params.id);
  nrun(db.prepare(`UPDATE alerts SET ${sets.join(', ')} WHERE id = ?`), ...params);
  audit(req, 'alert.update', 'alert', req.params.id, { status: b.status, note: typeof b.note === 'string' });
  res.json(db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id));
});

module.exports = router;
