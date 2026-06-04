/*
 * routes/patients.js — patient records (fișa pacientului): list, create, read,
 * update, soft-delete. Enforces ownership (a doctor sees only their patients;
 * a patient sees only their own record).  Covers TA-03..TA-06, TA-23, TA-25.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, nrun } = require('../db');
const { requireAuth, requireRole, resolvePatientAccess, audit } = require('../lib/auth');
const { validateCNP } = require('../lib/cnp');

const router = express.Router();

function computeAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function serialize(p) {
  return { ...p, age: computeAge(p.dob) };
}

function nextPatientId() {
  const rows = db.prepare("SELECT id FROM patients WHERE id LIKE 'PAT-%'").all();
  let max = 0;
  for (const r of rows) {
    const n = parseInt(String(r.id).replace('PAT-', ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return 'PAT-' + String(max + 1).padStart(3, '0');
}

const FIELDS = [
  'first_name', 'last_name', 'dob', 'cnp', 'gender',
  'addr_street', 'addr_number', 'addr_city', 'addr_county', 'addr_postal',
  'phone', 'email', 'profession', 'workplace',
  'medical_history', 'allergies', 'cardio_consults',
];

// GET /api/patients  — doctors see their own; admins see all.
router.get('/', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare('SELECT * FROM patients WHERE deleted_at IS NULL ORDER BY last_name, first_name').all();
  } else {
    rows = db.prepare('SELECT * FROM patients WHERE doctor_id = ? AND deleted_at IS NULL ORDER BY last_name, first_name')
      .all(req.user.uid);
  }
  // attach a lightweight latest-alert flag for the dashboard
  const out = rows.map((p) => {
    const open = db.prepare("SELECT COUNT(*) c FROM alerts WHERE patient_id = ? AND status = 'open'").get(p.id).c;
    const dev = db.prepare('SELECT id, status FROM devices WHERE patient_id = ? LIMIT 1').get(p.id);
    return { ...serialize(p), open_alerts: open, device: dev || null };
  });
  res.json(out);
});

// GET /api/patients/:id  — full fiche
router.get('/:id', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const dev = db.prepare('SELECT * FROM devices WHERE patient_id = ?').all(acc.patient.id);
  const rules = db.prepare('SELECT * FROM rules WHERE patient_id = ?').get(acc.patient.id) || null;
  res.json({ ...serialize(acc.patient), devices: dev, rules });
});

// POST /api/patients  — create (doctor/admin). Optional linked login account.
router.post('/', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const b = req.body || {};
  if (!b.first_name || !b.last_name) {
    return res.status(400).json({ error: 'name_required', code: 'patient.name_required' });
  }
  if (!b.cnp) return res.status(400).json({ error: 'cnp_required', code: 'patient.cnp_required' });
  const cnp = validateCNP(b.cnp);
  if (!cnp.valid) return res.status(400).json({ error: 'cnp_invalid', code: 'patient.cnp_invalid', reason: cnp.reason });

  // Optionally create a patient login account.
  let userId = null;
  if (b.account && b.account.email && b.account.password) {
    const email = String(b.account.email).toLowerCase().trim();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'email_taken', code: 'auth.email_taken' });
    }
    const hash = bcrypt.hashSync(b.account.password, 10);
    const u = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
      .run('patient', email, hash, `${b.first_name} ${b.last_name}`, b.account.locale || 'ro');
    userId = u.lastInsertRowid;
  }

  const id = b.id || nextPatientId();
  const dob = b.dob || cnp.dob || null;
  const gender = b.gender || cnp.gender || null;
  const cols = ['id', 'user_id', 'doctor_id', ...FIELDS];
  const vals = [id, userId, req.user.uid,
    b.first_name, b.last_name, dob, b.cnp, gender,
    b.addr_street, b.addr_number, b.addr_city, b.addr_county, b.addr_postal,
    b.phone, b.email, b.profession, b.workplace,
    b.medical_history, b.allergies, b.cardio_consults];
  nrun(db.prepare(`INSERT INTO patients (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`), ...vals);

  // Seed an empty rules row so thresholds can be set later.
  db.prepare('INSERT OR IGNORE INTO rules (patient_id, updated_by) VALUES (?, ?)').run(id, req.user.uid);

  audit(req, 'patient.create', 'patient', id, { first_name: b.first_name, last_name: b.last_name });
  const created = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  res.status(201).json(serialize(created));
});

// PUT /api/patients/:id  — update (doctor/admin)
router.put('/:id', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const b = req.body || {};
  if (b.cnp) {
    const cnp = validateCNP(b.cnp);
    if (!cnp.valid) return res.status(400).json({ error: 'cnp_invalid', code: 'patient.cnp_invalid', reason: cnp.reason });
  }
  const sets = [], vals = [];
  for (const f of FIELDS) {
    if (f in b) { sets.push(`${f} = ?`); vals.push(b[f]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });
  sets.push("updated_at = datetime('now')");
  vals.push(req.params.id);
  nrun(db.prepare(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`), ...vals);
  audit(req, 'patient.update', 'patient', req.params.id, { fields: Object.keys(b) });
  res.json(serialize(db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id)));
});

// DELETE /api/patients/:id  — soft delete (doctor/admin)
router.delete('/:id', requireAuth, requireRole('admin', 'doctor'), (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  db.prepare("UPDATE patients SET deleted_at = datetime('now') WHERE id = ?").run(req.params.id);
  audit(req, 'patient.delete', 'patient', req.params.id, {
    first_name: acc.patient.first_name, last_name: acc.patient.last_name,
  });
  res.json({ ok: true, deleted: req.params.id });
});

module.exports = { router, computeAge, serialize };
