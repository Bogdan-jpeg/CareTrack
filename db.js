/*
 * db.js — CareTrack database layer
 * --------------------------------
 * Uses Node's built-in SQLite (node:sqlite), so there is nothing to compile
 * and no native module / ABI version to worry about. Works on Node 22+ (incl. 24).
 *
 * The schema follows the CareTrack data model: users, patients, devices,
 * vitals (scalar time-series), ecg_records (ECG bursts), rules (per-patient
 * thresholds), alerts, recommendations and audit_logs.
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.CARETRACK_DB || path.join(__dirname, 'data', 'caretrack.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  role          TEXT NOT NULL CHECK (role IN ('admin','doctor','patient')),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  locale        TEXT NOT NULL DEFAULT 'ro',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id              TEXT PRIMARY KEY,            -- e.g. PAT-001
  user_id         INTEGER REFERENCES users(id),-- patient's login account (nullable)
  doctor_id       INTEGER NOT NULL REFERENCES users(id),
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  dob             TEXT,                        -- ISO date
  cnp             TEXT,
  gender          TEXT,
  addr_street     TEXT,
  addr_number     TEXT,
  addr_city       TEXT,
  addr_county     TEXT,
  addr_postal     TEXT,
  phone           TEXT,
  email           TEXT,
  profession      TEXT,
  workplace       TEXT,
  medical_history TEXT,
  allergies       TEXT,
  cardio_consults TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id               TEXT PRIMARY KEY,           -- e.g. dev-001
  patient_id       TEXT REFERENCES patients(id),
  model            TEXT,
  serial           TEXT,
  firmware_version TEXT,
  ble_name         TEXT,                       -- advertised BLE name, e.g. CareTrack-001
  status           TEXT NOT NULL DEFAULT 'unpaired'
                     CHECK (status IN ('unpaired','paired','connected','disconnected')),
  last_seen        TEXT,
  paired_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per patient holding their personalised alert thresholds.
CREATE TABLE IF NOT EXISTS rules (
  patient_id          TEXT PRIMARY KEY REFERENCES patients(id),
  min_pulse           REAL,
  max_pulse           REAL,
  min_temp            REAL,
  max_temp            REAL,
  min_humidity        REAL,
  max_humidity        REAL,
  min_spo2            REAL,
  persistence_seconds INTEGER NOT NULL DEFAULT 0,
  updated_by          INTEGER REFERENCES users(id),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scalar time-series measurements (pulse, temperature, humidity, spo2, accel).
CREATE TABLE IF NOT EXISTS vitals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  device_id  TEXT,
  ts         TEXT NOT NULL,                    -- ISO UTC of the measurement
  type       TEXT NOT NULL,                    -- pulse|temperature|humidity|spo2|accel_magnitude
  value      REAL,
  metadata   TEXT,                             -- JSON (e.g. battery, aggregate window)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ECG bursts. For the prototype we store the samples inline as a JSON array.
CREATE TABLE IF NOT EXISTS ecg_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  TEXT NOT NULL REFERENCES patients(id),
  device_id   TEXT,
  ts          TEXT NOT NULL,
  sample_rate INTEGER NOT NULL DEFAULT 100,
  samples     TEXT NOT NULL,                   -- JSON array of integers
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id      TEXT NOT NULL REFERENCES patients(id),
  device_id       TEXT,
  ts              TEXT NOT NULL,
  type            TEXT NOT NULL,               -- pulse_high|pulse_low|temp_high|...|fall|manual
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  value           REAL,
  threshold       REAL,
  message_ro      TEXT NOT NULL,
  message_en      TEXT NOT NULL,
  note            TEXT,                        -- patient-added context (TA-14)
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','closed')),
  source          TEXT NOT NULL DEFAULT 'cloud' CHECK (source IN ('device','gateway','cloud')),
  acknowledged_by INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recommendations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id         TEXT NOT NULL REFERENCES patients(id),
  doctor_id          INTEGER REFERENCES users(id),
  type               TEXT NOT NULL,            -- walk|cycling|running|exercise|other
  title              TEXT,
  daily_duration_min INTEGER,
  instructions       TEXT,
  start_date         TEXT,
  end_date           TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER REFERENCES users(id),
  role      TEXT,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  details   TEXT,                              -- JSON
  ip        TEXT,
  ts        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient_ts  ON vitals(patient_id, ts);
CREATE INDEX IF NOT EXISTS idx_vitals_type        ON vitals(patient_id, type, ts);
CREATE INDEX IF NOT EXISTS idx_ecg_patient_ts     ON ecg_records(patient_id, ts);
CREATE INDEX IF NOT EXISTS idx_alerts_patient     ON alerts(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recos_patient      ON recommendations(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_ts           ON audit_logs(ts);
`);

// node:sqlite rejects `undefined` bind values (unlike better-sqlite3, which
// coerces them to NULL). nb() normalizes a single value and nrun() normalizes
// every parameter before executing a prepared statement, so partial form
// submissions (missing optional fields) never crash the insert/update.
function nb(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
function nrun(stmt, ...params) {
  return stmt.run(...params.map(nb));
}

module.exports = { db, DB_PATH, nb, nrun };
