/*
 * auth.js — authentication, role-based access control and audit logging.
 */
const jwt = require('jsonwebtoken');
const { db } = require('../db');

// In a real deployment this comes from an env var / secrets manager.
const JWT_SECRET = process.env.CARETRACK_JWT_SECRET || 'caretrack-dev-secret-change-me';
const TOKEN_TTL = '12h';

function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, email: user.email, name: user.full_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// Attaches req.user when a valid Bearer token is present.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized', code: 'auth.required' });
  req.user = payload;
  next();
}

// Restricts a route to one or more roles.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized', code: 'auth.required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', code: 'auth.forbidden' });
    }
    next();
  };
}

/*
 * Ensures the current user may access the given patient and returns the patient row.
 *  - admin: any patient
 *  - doctor: only their own patients (patients.doctor_id === uid)
 *  - patient: only the record linked to their own user account (patients.user_id === uid)
 * Returns { ok, status, patient, code }.
 */
function resolvePatientAccess(user, patientId) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND deleted_at IS NULL').get(patientId);
  if (!patient) return { ok: false, status: 404, code: 'patient.not_found' };
  if (user.role === 'admin') return { ok: true, patient };
  if (user.role === 'doctor') {
    if (patient.doctor_id !== user.uid) return { ok: false, status: 403, code: 'auth.forbidden' };
    return { ok: true, patient };
  }
  if (user.role === 'patient') {
    if (patient.user_id !== user.uid) return { ok: false, status: 403, code: 'auth.forbidden' };
    return { ok: true, patient };
  }
  return { ok: false, status: 403, code: 'auth.forbidden' };
}

function audit(req, action, entity, entityId, details) {
  try {
    db.prepare(
      'INSERT INTO audit_logs (user_id, role, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)'
    ).run(
      req.user?.uid ?? null,
      req.user?.role ?? null,
      action,
      entity ?? null,
      entityId != null ? String(entityId) : null,
      details ? JSON.stringify(details) : null,
      req.ip || req.headers['x-forwarded-for'] || null
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}

module.exports = {
  JWT_SECRET, signToken, verifyToken,
  requireAuth, requireRole, resolvePatientAccess, audit,
};
