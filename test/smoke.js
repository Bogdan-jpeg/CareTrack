/*
 * test/smoke.js — self-contained acceptance smoke test.
 * Starts the Express app on an ephemeral port, runs the TA-style checks using
 * the global fetch, prints a summary, and exits. Nothing is left running.
 *
 * Run with a fresh seeded DB:
 *   CARETRACK_DB=/tmp/ct-test.db node seed.js --reset
 *   CARETRACK_DB=/tmp/ct-test.db node test/smoke.js
 */
process.env.CARETRACK_JWT_SECRET = process.env.CARETRACK_JWT_SECRET || 'test-secret';

const path = require('path');
const express = require('express');
const cors = require('cors');

require('../db');
const authRoutes = require('../routes/auth');
const { router: patientRoutes } = require('../routes/patients');
const deviceRoutes = require('../routes/devices');
const vitalsRoutes = require('../routes/vitals');
const alertRoutes = require('../routes/alerts');
const ruleRoutes = require('../routes/rules');
const recoRoutes = require('../routes/recommendations');
const reportRoutes = require('../routes/reports');
const auditRoutes = require('../routes/audit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api', vitalsRoutes);
app.use('/api', alertRoutes);
app.use('/api', ruleRoutes);
app.use('/api', recoRoutes);
app.use('/api', reportRoutes);
app.use('/api', auditRoutes);

let pass = 0, fail = 0;
const ok = (m) => { console.log('  \u2713 ' + m); pass++; };
const no = (m, d) => { console.log('  \u2717 ' + m + (d ? '  -- ' + JSON.stringify(d) : '')); fail++; };

async function main() {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const J = (tok, extra = {}) => ({ 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...extra });

  try {
    // TA-01/02 doctor login
    let r = await fetch(base + '/auth/login', { method: 'POST', headers: J(), body: JSON.stringify({ email: 'medic.test@caretrack.ro', password: 'Medic#2025' }) });
    let d = await r.json();
    const dtok = d.token;
    dtok ? ok('TA-02 doctor login returns token') : no('TA-02 doctor login', d);

    // TA-01 wrong password
    r = await fetch(base + '/auth/login', { method: 'POST', headers: J(), body: JSON.stringify({ email: 'medic.test@caretrack.ro', password: 'nope' }) });
    r.status === 401 ? ok('TA-01 wrong password -> 401') : no('TA-01 wrong password', r.status);

    // TA-03 list patients
    r = await fetch(base + '/patients', { headers: J(dtok) });
    d = await r.json();
    Array.isArray(d) && d.length === 2 ? ok(`TA-03 doctor sees ${d.length} patients`) : no('TA-03 patient list', d);

    // TA-05 full fiche
    r = await fetch(base + '/patients/PAT-001', { headers: J(dtok) });
    d = await r.json();
    (d.allergies || '').includes('penicilin') ? ok(`TA-05 fiche has allergies, age=${d.age}`) : no('TA-05 fiche', d);

    // TA-04 invalid CNP rejected
    r = await fetch(base + '/patients', { method: 'POST', headers: J(dtok), body: JSON.stringify({ first_name: 'X', last_name: 'Y', cnp: '1234567890123' }) });
    r.status === 400 ? ok('TA-04 invalid CNP -> 400') : no('TA-04 invalid CNP', r.status);

    // TA-04 valid CNP accepted
    r = await fetch(base + '/patients', { method: 'POST', headers: J(dtok), body: JSON.stringify({ first_name: 'Vasile', last_name: 'Test', cnp: '1800101350018' }) });
    d = await r.json();
    (d.id || '').startsWith('PAT-') ? ok(`TA-04 valid CNP create -> ${d.id}`) : no('TA-04 valid CNP create', d);

    // TA-10 set rules
    r = await fetch(base + '/patients/PAT-001/rules', { method: 'PUT', headers: J(dtok), body: JSON.stringify({ max_pulse: 120, max_temp: 38, min_spo2: 92 }) });
    d = await r.json();
    /saved successfully/.test(d.message || '') ? ok('TA-10 rules saved') : no('TA-10 rules', d);

    // TA-08/09 patient login
    r = await fetch(base + '/auth/login', { method: 'POST', headers: J(), body: JSON.stringify({ email: 'pacient1@caretrack.ro', password: 'Pacient#2025' }) });
    d = await r.json();
    const ptok = d.token; const ppid = d.user && d.user.patientId;
    ppid === 'PAT-001' ? ok('TA-09 patient login linked to PAT-001') : no('TA-09 patient link', d.user);

    // TA-13 normal pulse -> no alert
    r = await fetch(base + '/vitals', { method: 'POST', headers: J(ptok), body: JSON.stringify({ patient_id: 'PAT-001', device_id: 'dev-001', type: 'pulse', value: 78 }) });
    d = await r.json();
    (d.alert_generated === false && d.risk_level === 'green') ? ok('TA-13 normal pulse -> no alert (green)') : no('TA-13 normal pulse', d);

    // TA-08 high pulse -> alert
    r = await fetch(base + '/vitals', { method: 'POST', headers: J(ptok), body: JSON.stringify({ patient_id: 'PAT-001', device_id: 'dev-001', type: 'pulse', value: 130 }) });
    d = await r.json();
    if (d.alert_generated === true && d.risk_level === 'red') {
      ok('TA-08 high pulse -> alert (red)');
      console.log('      RO: ' + d.alert.message_ro);
      console.log('      EN: ' + d.alert.message_en);
    } else no('TA-08 high pulse', d);

    // TA-08 high temp -> alert
    r = await fetch(base + '/vitals', { method: 'POST', headers: J(ptok), body: JSON.stringify({ patient_id: 'PAT-001', device_id: 'dev-001', type: 'temperature', value: 38.5 }) });
    d = await r.json();
    d.alert_generated === true ? ok('TA-08 high temp -> alert') : no('TA-08 high temp', d);

    // TA-23/25 isolation: patient cannot read PAT-002
    r = await fetch(base + '/patients/PAT-002', { headers: J(ptok) });
    r.status === 403 ? ok('TA-23 patient blocked from PAT-002 -> 403') : no('TA-23 isolation', r.status);

    // TA-25 patient cannot list patients
    r = await fetch(base + '/patients', { headers: J(ptok) });
    r.status === 403 ? ok('TA-25 patient blocked from list -> 403') : no('TA-25 list isolation', r.status);

    // TA-14 patient note on own alert
    r = await fetch(base + '/patients/PAT-001/alerts', { headers: J(ptok) });
    d = await r.json();
    const aid = d[0] && d[0].id;
    r = await fetch(base + '/alerts/' + aid, { method: 'PATCH', headers: J(ptok), body: JSON.stringify({ note: 'M\u0103 sim\u021beam ame\u021bit.' }) });
    d = await r.json();
    (d.note || '').includes('ame\u021bit') ? ok(`TA-14 patient note saved on alert ${aid}`) : no('TA-14 patient note', d);

    // TA-14 patient cannot change status
    r = await fetch(base + '/alerts/' + aid, { method: 'PATCH', headers: J(ptok), body: JSON.stringify({ status: 'closed' }) });
    r.status === 403 ? ok('TA-14 patient blocked from status change -> 403') : no('TA-14 status isolation', r.status);

    // TA-12 doctor acks alert
    r = await fetch(base + '/alerts/' + aid, { method: 'PATCH', headers: J(dtok), body: JSON.stringify({ status: 'ack' }) });
    d = await r.json();
    d.status === 'ack' ? ok('TA-12 doctor set alert to ack') : no('TA-12 doctor ack', d);

    // TA-17 vitals history
    r = await fetch(base + '/patients/PAT-001/vitals?type=pulse&limit=10', { headers: J(dtok) });
    d = await r.json();
    Array.isArray(d) && d.length > 0 ? ok(`TA-17 pulse history returns ${d.length} points`) : no('TA-17 vitals history', d);

    // TA-18 ECG burst
    r = await fetch(base + '/patients/PAT-001/ecg?latest=1', { headers: J(dtok) });
    d = await r.json();
    (d[0] && d[0].samples && d[0].samples.length > 0) ? ok(`TA-18 ECG burst has ${d[0].samples.length} samples`) : no('TA-18 ecg', d);

    // TA-21/22 FIFO batch
    r = await fetch(base + '/vitals/batch', { method: 'POST', headers: J(ptok), body: JSON.stringify({ items: [
      { patient_id: 'PAT-001', device_id: 'dev-001', type: 'pulse', value: 80 },
      { patient_id: 'PAT-001', device_id: 'dev-001', type: 'pulse', value: 81 },
    ] }) });
    d = await r.json();
    d.count === 2 ? ok('TA-21/22 batch processed 2 buffered items') : no('TA-21/22 batch', d);

    // TA-16 patient reads recommendations
    r = await fetch(base + '/patients/PAT-001/recommendations', { headers: J(ptok) });
    d = await r.json();
    Array.isArray(d) && d.length > 0 ? ok(`TA-16 patient sees ${d.length} recommendation(s)`) : no('TA-16 recommendations', d);

    // TA-19/20 PDF + CSV
    r = await fetch(base + '/patients/PAT-001/report?format=pdf&lang=ro', { headers: J(dtok) });
    const pdfBuf = Buffer.from(await r.arrayBuffer());
    pdfBuf.slice(0, 4).toString() === '%PDF' ? ok(`TA-20 PDF report generated (${pdfBuf.length} bytes)`) : no('TA-20 pdf', pdfBuf.slice(0, 8).toString());

    r = await fetch(base + '/patients/PAT-001/report?format=csv&lang=en', { headers: J(dtok) });
    const csvBuf = Buffer.from(await r.arrayBuffer());
    (csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf) ? ok('TA-20 CSV report has UTF-8 BOM') : no('TA-20 csv bom', csvBuf.slice(0, 4));

    // TA-24 audit log
    r = await fetch(base + '/audit?limit=50', { headers: J(dtok) });
    d = await r.json();
    Array.isArray(d) && d.length > 0 ? ok(`TA-24 audit log has ${d.length} entries`) : no('TA-24 audit', d);

    // TA-07 device status
    r = await fetch(base + '/devices/dev-001/status', { method: 'POST', headers: J(ptok), body: JSON.stringify({ status: 'connected', firmware_version: '1.0.0' }) });
    d = await r.json();
    d.status === 'connected' ? ok('TA-07 device status -> connected') : no('TA-07 device status', d);

  } catch (e) {
    no('UNCAUGHT', e.message);
    console.error(e);
  } finally {
    server.close();
    console.log('\n===================================');
    console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
    console.log('===================================');
    process.exit(fail ? 1 : 0);
  }
}

main();
