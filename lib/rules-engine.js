/*
 * rules-engine.js — turns incoming measurements into alerts.
 *
 * For each scalar vital we look up the patient's personalised thresholds and,
 * if the value is out of range, create an alert with a bilingual message.
 * A short per-(patient,type) dedupe window prevents the 1 Hz / 10 s stream
 * from producing a flood of identical alerts during sustained breaches.
 */
const { db } = require('../db');
const { buildAlertMessage } = require('./i18n-alerts');

const DEDUPE_SECONDS = 60;

// Maps a vital type to the [low, high] threshold columns and the alert types.
const THRESHOLDS = {
  pulse:       { min: 'min_pulse',    max: 'max_pulse',    lowType: 'pulse_low',    highType: 'pulse_high' },
  temperature: { min: 'min_temp',     max: 'max_temp',     lowType: 'temp_low',     highType: 'temp_high' },
  humidity:    { min: 'min_humidity', max: 'max_humidity', lowType: 'humidity_low', highType: 'humidity_high' },
  spo2:        { min: 'min_spo2',     max: null,           lowType: 'spo2_low',     highType: null },
};

function recentlyAlerted(patientId, type, ts) {
  const eventTime = ts || new Date().toISOString();
  const row = db.prepare(
    `SELECT ts FROM alerts
      WHERE patient_id = ? AND type = ?
      ORDER BY ts DESC LIMIT 1`
  ).get(patientId, type);
  if (!row) return false;
  const deltaMs = new Date(eventTime).getTime() - new Date(row.ts).getTime();
  // suppress only if the previous alert of this type is within the dedupe window
  return deltaMs >= 0 && deltaMs < DEDUPE_SECONDS * 1000;
}

function insertAlert({ patientId, deviceId, ts, type, value, threshold, source, extra }) {
  const { message_ro, message_en, severity } = buildAlertMessage(type, value, threshold, extra);
  const info = db.prepare(
    `INSERT INTO alerts (patient_id, device_id, ts, type, severity, value, threshold,
                         message_ro, message_en, source)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(patientId, deviceId || null, ts, type, severity, value ?? null,
        threshold ?? null, message_ro, message_en, source || 'cloud');
  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid);
}

// Evaluate one scalar vital. Returns the created alert, or null.
function evaluateVital({ patientId, deviceId, type, value, ts, source }) {
  const conf = THRESHOLDS[type];
  if (!conf || value == null) return null;
  value = Number(value);                 // tolerate numeric strings from JSON/forms
  if (Number.isNaN(value)) return null;
  // A pulse/SpO₂ of 0 means the optical sensor had no skin contact (sensor off /
  // no finger) — a missing measurement rather than a reading. Never alert on it.
  if ((type === 'pulse' || type === 'spo2') && value <= 0) return null;
  const rules = db.prepare('SELECT * FROM rules WHERE patient_id = ?').get(patientId);
  if (!rules) return null;

  let breach = null; // { type, threshold }
  if (conf.max && rules[conf.max] != null && value > rules[conf.max]) {
    breach = { type: conf.highType, threshold: rules[conf.max] };
  } else if (conf.min && rules[conf.min] != null && value < rules[conf.min]) {
    breach = { type: conf.lowType, threshold: rules[conf.min] };
  }
  if (!breach) return null;
  if (recentlyAlerted(patientId, breach.type, ts)) return null;

  return insertAlert({
    patientId, deviceId, ts: ts || new Date().toISOString(),
    type: breach.type, value, threshold: breach.threshold, source: source || 'cloud',
  });
}

// Explicit event alert (fall detection, manual SOS, doctor-raised, etc.).
function createEventAlert({ patientId, deviceId, type, ts, source, value, threshold, extra }) {
  return insertAlert({
    patientId, deviceId, ts: ts || new Date().toISOString(),
    type, value, threshold, source: source || 'gateway', extra,
  });
}

module.exports = { evaluateVital, createEventAlert };
