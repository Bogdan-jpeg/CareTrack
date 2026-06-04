/*
 * routes/recommendations.js — medical recommendations / activities (TA-15, TA-16).
 * Doctor creates them; the patient (and the mobile gateway) reads them, including
 * the activity type, daily duration and date range used to render a calendar.
 */
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole, resolvePatientAccess, audit } = require('../lib/auth');

const router = express.Router();
const TYPES = ['walk', 'cycling', 'running', 'exercise', 'other'];

// GET /api/patients/:id/recommendations
router.get('/patients/:id/recommendations', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  res.json(db.prepare('SELECT * FROM recommendations WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.id));
});

// POST /api/patients/:id/recommendations  (doctor)
router.post('/patients/:id/recommendations', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const b = req.body || {};
  const type = TYPES.includes(b.type) ? b.type : 'other';
  const info = db.prepare(
    `INSERT INTO recommendations (patient_id, doctor_id, type, title, daily_duration_min, instructions, start_date, end_date)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(req.params.id, req.user.uid, type, b.title || null,
        b.daily_duration_min != null ? parseInt(b.daily_duration_min, 10) : null,
        b.instructions || null, b.start_date || null, b.end_date || null);
  audit(req, 'recommendation.create', 'patient', req.params.id, { type, title: b.title });
  res.status(201).json(db.prepare('SELECT * FROM recommendations WHERE id = ?').get(info.lastInsertRowid));
});

// DELETE /api/recommendations/:id  (doctor)
router.delete('/recommendations/:id', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const rec = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'not_found' });
  const acc = resolvePatientAccess(req.user, rec.patient_id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  db.prepare('DELETE FROM recommendations WHERE id = ?').run(req.params.id);
  audit(req, 'recommendation.delete', 'recommendation', req.params.id, {});
  res.json({ ok: true, deleted: Number(req.params.id) });
});

module.exports = router;
