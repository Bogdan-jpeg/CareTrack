/*
 * routes/audit.js — audit log for critical actions (TA-24).
 * Admin sees everything; a doctor sees actions related to their own patients
 * plus their own actions.
 */
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../lib/auth');

const router = express.Router();

// GET /api/audit?entity=&action=&limit=
router.get('/audit', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);
  const { entity, action } = req.query;

  if (req.user.role === 'admin') {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (entity) { sql += ' AND entity = ?'; params.push(entity); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    sql += ' ORDER BY ts DESC LIMIT ?'; params.push(limit);
    return res.json(db.prepare(sql).all(...params));
  }

  // doctor: own actions OR actions on their patients
  const patientIds = db.prepare('SELECT id FROM patients WHERE doctor_id = ?').all(req.user.uid).map((r) => r.id);
  const placeholders = patientIds.length ? patientIds.map(() => '?').join(',') : "''";
  let sql = `SELECT * FROM audit_logs
             WHERE (user_id = ? OR (entity = 'patient' AND entity_id IN (${placeholders})))`;
  const params = [req.user.uid, ...patientIds];
  if (entity) { sql += ' AND entity = ?'; params.push(entity); }
  if (action) { sql += ' AND action = ?'; params.push(action); }
  sql += ' ORDER BY ts DESC LIMIT ?'; params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
