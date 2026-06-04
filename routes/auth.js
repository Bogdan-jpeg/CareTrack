/*
 * routes/auth.js — login, whoami, account creation, locale preference.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signToken, requireAuth, requireRole, audit } = require('../lib/auth');

const router = express.Router();

// POST /api/auth/login  { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'missing_credentials', code: 'auth.missing' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', code: 'auth.invalid' });
  }
  const token = signToken(user);
  audit({ user: { uid: user.id, role: user.role }, ip: req.ip }, 'login', 'user', user.id);

  // For a patient account, surface the linked patient id so the app can route to it.
  let patientId = null;
  if (user.role === 'patient') {
    const p = db.prepare('SELECT id FROM patients WHERE user_id = ? AND deleted_at IS NULL').get(user.id);
    patientId = p ? p.id : null;
  }
  res.json({
    token,
    user: { id: user.id, role: user.role, email: user.email, name: user.full_name, locale: user.locale, patientId },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, role, email, full_name, locale FROM users WHERE id = ?').get(req.user.uid);
  if (!user) return res.status(404).json({ error: 'not_found' });
  let patientId = null;
  if (user.role === 'patient') {
    const p = db.prepare('SELECT id FROM patients WHERE user_id = ? AND deleted_at IS NULL').get(user.id);
    patientId = p ? p.id : null;
  }
  res.json({ id: user.id, role: user.role, email: user.email, name: user.full_name, locale: user.locale, patientId });
});

// POST /api/auth/register  (admin or doctor creates doctor/patient accounts)
router.post('/register', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const { email, password, full_name, role, locale } = req.body || {};
  if (!email || !password || !role) return res.status(400).json({ error: 'missing_fields', code: 'auth.missing' });
  if (!['doctor', 'patient', 'admin'].includes(role)) return res.status(400).json({ error: 'bad_role' });
  // doctors may only create patients
  if (req.user.role === 'doctor' && role !== 'patient') return res.status(403).json({ error: 'forbidden', code: 'auth.forbidden' });

  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'email_taken', code: 'auth.email_taken' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run(role, String(email).toLowerCase().trim(), hash, full_name || null, locale || 'ro');
  audit(req, 'user.create', 'user', info.lastInsertRowid, { role, email });
  res.status(201).json({ id: info.lastInsertRowid, role, email });
});

// PATCH /api/auth/locale  { locale }
router.patch('/locale', requireAuth, (req, res) => {
  const { locale } = req.body || {};
  if (!['ro', 'en'].includes(locale)) return res.status(400).json({ error: 'bad_locale' });
  db.prepare('UPDATE users SET locale = ? WHERE id = ?').run(locale, req.user.uid);
  res.json({ ok: true, locale });
});

module.exports = router;
