/*
 * seed.js — populates the database with the demo / acceptance-test data.
 *
 *   node seed.js           insert seed data if the DB is empty
 *   node seed.js --reset   wipe all tables first, then insert
 *
 * The accounts and patients mirror the acceptance tests (TA-01..TA-25):
 *   doctor   medic.test@caretrack.ro / Medic#2025
 *   patient  pacient1@caretrack.ro   / Pacient#2025   -> PAT-001 Popescu Andrei
 *   patient  pacient2@caretrack.ro   / Pacient#2025   -> PAT-002 Ionescu Maria
 * Thresholds are set so the documented test values (pulse 130 > 120,
 * temp 38.5 > 38) generate alerts, while normal values (78 BPM, 36.7 °C) do not.
 */
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { buildAlertMessage } = require('./lib/i18n-alerts');

function reset() {
  const tables = ['audit_logs', 'recommendations', 'alerts', 'ecg_records', 'vitals', 'rules', 'devices', 'patients', 'users'];
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  // reset autoincrement counters if the table exists
  try { db.exec(`DELETE FROM sqlite_sequence`); } catch {}
  console.log('· existing data cleared');
}

function alreadySeeded() {
  const row = db.prepare('SELECT COUNT(*) c FROM users').get();
  return row.c > 0;
}

function hash(pw) { return bcrypt.hashSync(pw, 10); }

// generate a synthetic but realistic-looking history so charts have data on load
function seedHistory(patientId, deviceId, basePulse, baseTemp) {
  const now = Date.now();
  const insV = db.prepare('INSERT INTO vitals (patient_id, device_id, ts, type, value, metadata) VALUES (?,?,?,?,?,?)');
  // last 24h, one aggregate sample every 30 min
  for (let i = 48; i >= 1; i--) {
    const ts = new Date(now - i * 30 * 60 * 1000).toISOString();
    const wobble = Math.sin(i / 4) * 4;
    const pulse = Math.round(basePulse + wobble + (Math.random() * 4 - 2));
    const temp = +(baseTemp + Math.sin(i / 6) * 0.2 + (Math.random() * 0.1 - 0.05)).toFixed(1);
    const hum = Math.round(45 + Math.sin(i / 5) * 6 + (Math.random() * 3 - 1.5));
    const spo2 = Math.round(97 + (Math.random() * 2 - 1));
    insV.run(patientId, deviceId, ts, 'pulse', pulse, null);
    insV.run(patientId, deviceId, ts, 'temperature', temp, null);
    insV.run(patientId, deviceId, ts, 'humidity', hum, null);
    insV.run(patientId, deviceId, ts, 'spo2', spo2, null);
  }
  // one ECG burst (~3 s at 100 Hz) so the ECG viewer has something to draw
  const samples = [];
  for (let i = 0; i < 300; i++) {
    const phase = i % 50;
    let v = 2048 + Math.round(Math.sin(i / 3) * 15);     // baseline wander
    if (phase === 10) v += 350;                          // R spike
    if (phase === 11) v -= 120;                          // S dip
    if (phase === 8) v += 40;                            // Q
    if (phase >= 20 && phase <= 28) v += 60;             // T wave
    samples.push(v);
  }
  db.prepare('INSERT INTO ecg_records (patient_id, device_id, ts, sample_rate, samples) VALUES (?,?,?,?,?)')
    .run(patientId, deviceId, new Date(now - 20 * 60 * 1000).toISOString(), 100, JSON.stringify(samples));
}

function makeAlert(patientId, deviceId, type, value, threshold, ts, status) {
  const { message_ro, message_en, severity } = buildAlertMessage(type, value, threshold);
  // created_at is set equal to the event time so historical seed alerts don't
  // look "just created" to the rules-engine dedupe window.
  const createdAt = ts.replace('T', ' ').slice(0, 19);
  db.prepare(
    `INSERT INTO alerts (patient_id, device_id, ts, type, severity, value, threshold, message_ro, message_en, status, source, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(patientId, deviceId, ts, type, severity, value, threshold, message_ro, message_en, status, 'cloud', createdAt);
}

function seed() {
  console.log('Seeding CareTrack demo data…');

  // ---- users ----
  const doctorId = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('doctor', 'medic.test@caretrack.ro', hash('Medic#2025'), 'Dr. Gheorghe Ionescu', 'ro').lastInsertRowid;
  const admin = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('admin', 'admin@caretrack.ro', hash('Admin#2025'), 'Administrator', 'ro').lastInsertRowid;
  const pat1User = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('patient', 'pacient1@caretrack.ro', hash('Pacient#2025'), 'Popescu Andrei', 'ro').lastInsertRowid;
  const pat2User = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('patient', 'pacient2@caretrack.ro', hash('Pacient#2025'), 'Ionescu Maria', 'ro').lastInsertRowid;

  // ---- extra accounts for the multi-phone demo (rename/extend freely) ----
  const doctor2 = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('doctor', 'medic2@caretrack.ro', hash('Medic#2025'), 'Dr. Elena Vasilescu', 'ro').lastInsertRowid;
  const pat3User = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('patient', 'pacient3@caretrack.ro', hash('Pacient#2025'), 'Marin Gheorghe', 'ro').lastInsertRowid;
  const pat4User = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('patient', 'pacient4@caretrack.ro', hash('Pacient#2025'), 'Dumitru Ileana', 'ro').lastInsertRowid;
  const pat5User = db.prepare('INSERT INTO users (role, email, password_hash, full_name, locale) VALUES (?,?,?,?,?)')
    .run('patient', 'pacient5@caretrack.ro', hash('Pacient#2025'), 'Stan Nicolae', 'ro').lastInsertRowid;

  // ---- patients ----
  db.prepare(`INSERT INTO patients
    (id, user_id, doctor_id, first_name, last_name, dob, cnp, gender,
     addr_street, addr_number, addr_city, addr_county, addr_postal,
     phone, email, profession, workplace, medical_history, allergies, cardio_consults)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'PAT-001', pat1User, doctorId, 'Andrei', 'Popescu', '1953-04-12', '1530412350012', 'M',
    'Str. Lalelelor', '14', 'Timișoara', 'Timiș', '300001',
    '+40721000111', 'pacient1@caretrack.ro', 'Inginer pensionar', '—',
    'Cardiopatie ischemică, hipertensiune arterială grad II.',
    'Alergie la penicilină.',
    'Consult cardiologic 2024-11: fracție de ejecție 48%, recomandat monitorizare continuă.');

  db.prepare(`INSERT INTO patients
    (id, user_id, doctor_id, first_name, last_name, dob, cnp, gender,
     addr_street, addr_number, addr_city, addr_county, addr_postal,
     phone, email, profession, workplace, medical_history, allergies, cardio_consults)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'PAT-002', pat2User, doctorId, 'Maria', 'Ionescu', '1957-09-23', '2570923350021', 'F',
    'Bd. Cetății', '88', 'Timișoara', 'Timiș', '300002',
    '+40721000222', 'pacient2@caretrack.ro', 'Profesoară pensionară', '—',
    'Hipertensiune arterială, diabet zaharat tip 2.',
    'Fără alergii cunoscute.',
    'Consult cardiologic 2025-02: tensiune controlată medicamentos.');

  db.prepare(`INSERT INTO patients
    (id, user_id, doctor_id, first_name, last_name, dob, cnp, gender,
     addr_street, addr_number, addr_city, addr_county, addr_postal,
     phone, email, profession, workplace, medical_history, allergies, cardio_consults)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'PAT-003', pat3User, doctorId, 'Gheorghe', 'Marin', '1950-06-15', '1500615350013', 'M',
    'Str. Brândușei', '7', 'Timișoara', 'Timiș', '300003',
    '+40721000333', 'pacient3@caretrack.ro', 'Mecanic pensionar', '—',
    'Fibrilație atrială paroxistică, hipertensiune arterială.',
    'Fără alergii cunoscute.',
    'Consult cardiologic 2025-01: ritm controlat, recomandat Holter periodic.');

  db.prepare(`INSERT INTO patients
    (id, user_id, doctor_id, first_name, last_name, dob, cnp, gender,
     addr_street, addr_number, addr_city, addr_county, addr_postal,
     phone, email, profession, workplace, medical_history, allergies, cardio_consults)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'PAT-004', pat4User, doctorId, 'Ileana', 'Dumitru', '1956-03-22', '2560322350024', 'F',
    'Str. Mureș', '23', 'Timișoara', 'Timiș', '300004',
    '+40721000444', 'pacient4@caretrack.ro', 'Contabilă pensionară', '—',
    'Diabet zaharat tip 2, dislipidemie.',
    'Alergie la sulfamide.',
    'Consult cardiologic 2024-12: fără modificări semnificative.');

  db.prepare(`INSERT INTO patients
    (id, user_id, doctor_id, first_name, last_name, dob, cnp, gender,
     addr_street, addr_number, addr_city, addr_county, addr_postal,
     phone, email, profession, workplace, medical_history, allergies, cardio_consults)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'PAT-005', pat5User, doctor2, 'Nicolae', 'Stan', '1948-11-09', '1481109350015', 'M',
    'Calea Aradului', '102', 'Timișoara', 'Timiș', '300005',
    '+40721000555', 'pacient5@caretrack.ro', 'Profesor pensionar', '—',
    'Cardiopatie ischemică, status post-infarct (2019).',
    'Fără alergii cunoscute.',
    'Consult cardiologic 2025-03: funcție sistolică ușor redusă, monitorizare recomandată.');

  // ---- devices ----
  db.prepare("INSERT INTO devices (id, patient_id, model, serial, firmware_version, ble_name, status, paired_at, last_seen) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
    .run('dev-001', 'PAT-001', 'CareTrack ESP32', 'CT-ESP32-0001', '1.0.0', 'CareTrack-001', 'paired');
  db.prepare("INSERT INTO devices (id, patient_id, model, serial, firmware_version, ble_name, status, paired_at, last_seen) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
    .run('dev-002', 'PAT-002', 'CareTrack ESP32', 'CT-ESP32-0002', '1.0.0', 'CareTrack-002', 'paired');
  db.prepare("INSERT INTO devices (id, patient_id, model, serial, firmware_version, ble_name, status, paired_at, last_seen) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
    .run('dev-003', 'PAT-003', 'CareTrack ESP32', 'CT-ESP32-0003', '1.0.0', 'CareTrack-003', 'paired');
  db.prepare("INSERT INTO devices (id, patient_id, model, serial, firmware_version, ble_name, status, paired_at, last_seen) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
    .run('dev-004', 'PAT-004', 'CareTrack ESP32', 'CT-ESP32-0004', '1.0.0', 'CareTrack-004', 'paired');
  db.prepare("INSERT INTO devices (id, patient_id, model, serial, firmware_version, ble_name, status, paired_at, last_seen) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
    .run('dev-005', 'PAT-005', 'CareTrack ESP32', 'CT-ESP32-0005', '1.0.0', 'CareTrack-005', 'paired');

  // ---- rules (thresholds aligned with the acceptance tests) ----
  db.prepare(`INSERT INTO rules (patient_id, min_pulse, max_pulse, min_temp, max_temp, min_humidity, max_humidity, min_spo2, persistence_seconds, updated_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PAT-001', 50, 120, 15, 30, 30, 65, 92, 0, doctorId);
  db.prepare(`INSERT INTO rules (patient_id, min_pulse, max_pulse, min_temp, max_temp, min_humidity, max_humidity, min_spo2, persistence_seconds, updated_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PAT-002', 55, 115, 15, 30, 30, 65, 92, 0, doctorId);
  db.prepare(`INSERT INTO rules (patient_id, min_pulse, max_pulse, min_temp, max_temp, min_humidity, max_humidity, min_spo2, persistence_seconds, updated_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PAT-003', 50, 120, 15, 30, 30, 65, 92, 0, doctorId);
  db.prepare(`INSERT INTO rules (patient_id, min_pulse, max_pulse, min_temp, max_temp, min_humidity, max_humidity, min_spo2, persistence_seconds, updated_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PAT-004', 55, 115, 15, 30, 30, 65, 92, 0, doctorId);
  db.prepare(`INSERT INTO rules (patient_id, min_pulse, max_pulse, min_temp, max_temp, min_humidity, max_humidity, min_spo2, persistence_seconds, updated_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('PAT-005', 50, 118, 15, 30, 30, 65, 92, 0, doctor2);

  // ---- history so charts/ECG aren't empty on first load ----
  seedHistory('PAT-001', 'dev-001', 78, 22.0);
  seedHistory('PAT-002', 'dev-002', 82, 22.5);
  seedHistory('PAT-003', 'dev-003', 76, 22.2);
  seedHistory('PAT-004', 'dev-004', 80, 22.3);
  seedHistory('PAT-005', 'dev-005', 74, 22.1);

  // ---- a few sample alerts (one open, one already closed) ----
  const now = Date.now();
  makeAlert('PAT-001', 'dev-001', 'pulse_high', 130, 120, new Date(now - 3 * 3600 * 1000).toISOString(), 'open');
  makeAlert('PAT-001', 'dev-001', 'temp_high', 34.0, 30.0, new Date(now - 26 * 3600 * 1000).toISOString(), 'closed');
  makeAlert('PAT-002', 'dev-002', 'pulse_high', 122, 115, new Date(now - 5 * 3600 * 1000).toISOString(), 'open');

  // ---- recommendations ----
  db.prepare(`INSERT INTO recommendations (patient_id, doctor_id, type, title, daily_duration_min, instructions, start_date, end_date)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run('PAT-001', doctorId, 'walk', 'Plimbare zilnică', 30,
         'Plimbare în ritm lejer, dimineața. Evitați efortul intens.',
         new Date(now).toISOString().slice(0, 10),
         new Date(now + 30 * 86400000).toISOString().slice(0, 10));
  db.prepare(`INSERT INTO recommendations (patient_id, doctor_id, type, title, daily_duration_min, instructions, start_date, end_date)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run('PAT-002', doctorId, 'exercise', 'Exerciții ușoare', 20,
         'Exerciții de respirație și mobilitate articulară.',
         new Date(now).toISOString().slice(0, 10),
         new Date(now + 14 * 86400000).toISOString().slice(0, 10));
  db.prepare(`INSERT INTO recommendations (patient_id, doctor_id, type, title, daily_duration_min, instructions, start_date, end_date)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run('PAT-003', doctorId, 'walk', 'Plimbare zilnică', 25,
         'Plimbare în ritm lejer, de preferință dimineața.',
         new Date(now).toISOString().slice(0, 10),
         new Date(now + 30 * 86400000).toISOString().slice(0, 10));
  db.prepare(`INSERT INTO recommendations (patient_id, doctor_id, type, title, daily_duration_min, instructions, start_date, end_date)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run('PAT-004', doctorId, 'exercise', 'Mobilitate articulară', 20,
         'Exerciții ușoare de mobilitate și întindere.',
         new Date(now).toISOString().slice(0, 10),
         new Date(now + 21 * 86400000).toISOString().slice(0, 10));
  db.prepare(`INSERT INTO recommendations (patient_id, doctor_id, type, title, daily_duration_min, instructions, start_date, end_date)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run('PAT-005', doctor2, 'walk', 'Plimbare ușoară', 20,
         'Plimbare scurtă, evitând efortul intens; pauze la nevoie.',
         new Date(now).toISOString().slice(0, 10),
         new Date(now + 30 * 86400000).toISOString().slice(0, 10));

  console.log('✓ Seed complete.');
  console.log('  Doctor :  medic.test@caretrack.ro / Medic#2025   (Dr. Gheorghe Ionescu — PAT-001..004)');
  console.log('  Doctor :  medic2@caretrack.ro     / Medic#2025   (Dr. Elena Vasilescu — PAT-005)');
  console.log('  Admin  :  admin@caretrack.ro      / Admin#2025');
  console.log('  Patient:  pacient1@caretrack.ro   / Pacient#2025  (PAT-001 Popescu Andrei)');
  console.log('  Patient:  pacient2@caretrack.ro   / Pacient#2025  (PAT-002 Ionescu Maria)');
  console.log('  Patient:  pacient3@caretrack.ro   / Pacient#2025  (PAT-003 Marin Gheorghe)');
  console.log('  Patient:  pacient4@caretrack.ro   / Pacient#2025  (PAT-004 Dumitru Ileana)');
  console.log('  Patient:  pacient5@caretrack.ro   / Pacient#2025  (PAT-005 Stan Nicolae)');
}

if (require.main === module) {
  const RESET = process.argv.includes('--reset');
  if (RESET) reset();
  if (alreadySeeded() && !RESET) {
    console.log('Database already contains data. Use  node seed.js --reset  to wipe and reseed.');
    process.exit(0);
  }
  seed();
}

module.exports = { seed, reset, alreadySeeded };
