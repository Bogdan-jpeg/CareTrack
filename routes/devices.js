/*
 * routes/devices.js — wearable devices: register, pair to a patient, status.
 * Pairing associates a device with a patient (TA-07). The gateway calls
 * /status to report connected/disconnected and the current firmware version.
 */
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole, resolvePatientAccess, audit } = require('../lib/auth');

const router = express.Router();

// GET /api/devices
router.get('/', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare('SELECT * FROM devices').all();
  } else {
    rows = db.prepare(
      `SELECT d.* FROM devices d
       JOIN patients p ON p.id = d.patient_id
       WHERE p.doctor_id = ? AND p.deleted_at IS NULL`
    ).all(req.user.uid);
  }
  res.json(rows);
});

// POST /api/devices  { id, model, serial, firmware_version, ble_name, patient_id? }
router.post('/', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: 'id_required' });
  const exists = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(b.id);
  if (exists) return res.status(409).json({ error: 'device_exists' });
  db.prepare('INSERT INTO devices (id, model, serial, firmware_version, ble_name, patient_id) VALUES (?,?,?,?,?,?)')
    .run(b.id, b.model || 'CareTrack ESP32', b.serial || null, b.firmware_version || null, b.ble_name || null, b.patient_id || null);
  audit(req, 'device.create', 'device', b.id, { model: b.model });
  res.status(201).json(db.prepare('SELECT * FROM devices WHERE id = ?').get(b.id));
});

// POST /api/devices/:id/pair  { patient_id }
router.post('/:id/pair', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const { patient_id } = req.body || {};
  if (!patient_id) return res.status(400).json({ error: 'patient_id_required' });
  const acc = resolvePatientAccess(req.user, patient_id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  let dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!dev) {
    db.prepare("INSERT INTO devices (id, patient_id, status, paired_at, last_seen) VALUES (?,?,?,datetime('now'),datetime('now'))")
      .run(req.params.id, patient_id, 'paired');
  } else {
    db.prepare("UPDATE devices SET patient_id = ?, status = 'paired', paired_at = datetime('now') WHERE id = ?")
      .run(patient_id, req.params.id);
  }
  audit(req, 'device.pair', 'device', req.params.id, { patient_id });
  res.json(db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id));
});

// POST /api/devices/:id/status  { status, firmware_version }  — called by the gateway
router.post('/:id/status', requireAuth, (req, res) => {
  const { status, firmware_version } = req.body || {};
  const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'device_not_found' });
  const allowed = ['unpaired', 'paired', 'connected', 'disconnected'];
  const next = allowed.includes(status) ? status : dev.status;
  db.prepare("UPDATE devices SET status = ?, firmware_version = COALESCE(?, firmware_version), last_seen = datetime('now') WHERE id = ?")
    .run(next, firmware_version || null, req.params.id);
  res.json(db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id));
});

module.exports = router;
