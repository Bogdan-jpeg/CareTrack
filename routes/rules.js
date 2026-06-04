/*
 * routes/rules.js — per-patient normal limits / alerting rules (TA-10).
 * The doctor sets thresholds; they are then used by the rules engine.
 */
const express = require('express');
const { db, nrun } = require('../db');
const { requireAuth, requireRole, resolvePatientAccess, audit } = require('../lib/auth');

const router = express.Router();
const NUMERIC = ['min_pulse', 'max_pulse', 'min_temp', 'max_temp', 'min_humidity', 'max_humidity', 'min_spo2'];

// GET /api/patients/:id/rules
router.get('/patients/:id/rules', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const rules = db.prepare('SELECT * FROM rules WHERE patient_id = ?').get(req.params.id)
    || { patient_id: req.params.id, persistence_seconds: 0 };
  res.json(rules);
});

// PUT /api/patients/:id/rules
router.put('/patients/:id/rules', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const b = req.body || {};
  const exists = db.prepare('SELECT 1 FROM rules WHERE patient_id = ?').get(req.params.id);
  if (!exists) db.prepare('INSERT INTO rules (patient_id) VALUES (?)').run(req.params.id);

  const sets = [], params = [];
  for (const f of NUMERIC) {
    if (f in b) { sets.push(`${f} = ?`); params.push(b[f] === '' || b[f] == null ? null : Number(b[f])); }
  }
  if ('persistence_seconds' in b) { sets.push('persistence_seconds = ?'); params.push(parseInt(b.persistence_seconds, 10) || 0); }
  sets.push('updated_by = ?'); params.push(req.user.uid);
  sets.push("updated_at = datetime('now')");
  params.push(req.params.id);
  nrun(db.prepare(`UPDATE rules SET ${sets.join(', ')} WHERE patient_id = ?`), ...params);

  audit(req, 'rules.update', 'patient', req.params.id, b);
  res.json({ message: 'Rules saved successfully', rules: db.prepare('SELECT * FROM rules WHERE patient_id = ?').get(req.params.id) });
});

module.exports = router;
