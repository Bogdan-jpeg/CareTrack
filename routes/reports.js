/*
 * routes/reports.js — patient reports (TA-19 generate, TA-20 export PDF/CSV).
 * GET /api/patients/:id/report?from=&to=&format=pdf|csv&lang=ro|en
 * Includes patient demographics, a vitals summary (min/max/avg per type) and
 * the alerts in the interval. Romanian diacritics render via an embedded font.
 */
const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db } = require('../db');
const { requireAuth, resolvePatientAccess, audit } = require('../lib/auth');
const { computeAge } = require('./patients');

const router = express.Router();
const FONT = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

const L = {
  ro: {
    title: 'Raport pacient — CareTrack', clinic: 'Clinica „Sănătatea noastră”',
    patient: 'Pacient', cnp: 'CNP', age: 'Vârstă', interval: 'Interval', generated: 'Generat la',
    summary: 'Sumar valori', type: 'Parametru', min: 'Min', max: 'Max', avg: 'Medie', count: 'Nr.',
    alerts: 'Alerte în interval', none: 'Nicio alertă în interval', when: 'Data', message: 'Mesaj', sev: 'Severitate',
    pulse: 'Puls (BPM)', temperature: 'Temperatură (°C)', humidity: 'Umiditate (%)', spo2: 'SpO₂ (%)',
  },
  en: {
    title: 'Patient report — CareTrack', clinic: 'Clinic “Sănătatea noastră”',
    patient: 'Patient', cnp: 'PIN', age: 'Age', interval: 'Interval', generated: 'Generated at',
    summary: 'Vitals summary', type: 'Parameter', min: 'Min', max: 'Max', avg: 'Average', count: 'Count',
    alerts: 'Alerts in interval', none: 'No alerts in interval', when: 'Date', message: 'Message', sev: 'Severity',
    pulse: 'Pulse (BPM)', temperature: 'Temperature (°C)', humidity: 'Humidity (%)', spo2: 'SpO₂ (%)',
  },
};

function gatherData(patientId, from, to) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  const params = [patientId];
  let where = 'patient_id = ?';
  if (from) { where += ' AND ts >= ?'; params.push(from); }
  if (to) { where += ' AND ts <= ?'; params.push(to); }
  const summary = db.prepare(
    `SELECT type, MIN(value) mn, MAX(value) mx, AVG(value) av, COUNT(*) c
       FROM vitals WHERE ${where} GROUP BY type`
  ).all(...params);
  const aparams = [patientId];
  let awhere = 'patient_id = ?';
  if (from) { awhere += ' AND created_at >= ?'; aparams.push(from); }
  if (to) { awhere += ' AND created_at <= ?'; aparams.push(to); }
  const alerts = db.prepare(`SELECT * FROM alerts WHERE ${awhere} ORDER BY created_at DESC`).all(...aparams);
  return { patient, summary, alerts };
}

router.get('/patients/:id/report', requireAuth, (req, res) => {
  const acc = resolvePatientAccess(req.user, req.params.id);
  if (!acc.ok) return res.status(acc.status).json({ error: acc.code, code: acc.code });
  const lang = req.query.lang === 'en' ? 'en' : 'ro';
  const t = L[lang];
  const from = req.query.from || null;
  const to = req.query.to || null;
  const format = req.query.format === 'csv' ? 'csv' : 'pdf';
  const { patient, summary, alerts } = gatherData(req.params.id, from, to);
  audit(req, 'report.generate', 'patient', req.params.id, { format, from, to, lang });

  const fname = `report_${patient.id}_${new Date().toISOString().slice(0, 10)}`;

  if (format === 'csv') {
    const rows = [];
    rows.push(`${t.patient};${patient.last_name} ${patient.first_name}`);
    rows.push(`${t.cnp};${patient.cnp || ''}`);
    rows.push(`${t.age};${computeAge(patient.dob) ?? ''}`);
    rows.push(`${t.interval};${from || '*'} - ${to || '*'}`);
    rows.push('');
    rows.push([t.type, t.min, t.max, t.avg, t.count].join(';'));
    for (const s of summary) {
      rows.push([t[s.type] || s.type, fmt(s.mn), fmt(s.mx), fmt(s.av), s.c].join(';'));
    }
    rows.push('');
    rows.push([t.when, t.sev, t.message].join(';'));
    for (const a of alerts) rows.push([a.created_at, a.severity, (lang === 'en' ? a.message_en : a.message_ro)].join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.csv"`);
    return res.send('\uFEFF' + rows.join('\n'));   // BOM so Excel reads UTF-8
  }

  // PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.registerFont('body', FONT);
  doc.registerFont('bold', FONT_BOLD);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}.pdf"`);
  doc.pipe(res);

  doc.font('bold').fontSize(18).text(t.title);
  doc.font('body').fontSize(10).fillColor('#666').text(t.clinic);
  doc.moveDown(0.8).fillColor('#000');

  doc.font('bold').fontSize(12).text(`${patient.last_name} ${patient.first_name}`);
  doc.font('body').fontSize(10)
    .text(`${t.cnp}: ${patient.cnp || '—'}    ${t.age}: ${computeAge(patient.dob) ?? '—'}`)
    .text(`${t.interval}: ${from || '*'} → ${to || '*'}`)
    .text(`${t.generated}: ${new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'ro-RO')}`);
  doc.moveDown(0.8);

  doc.font('bold').fontSize(13).text(t.summary);
  doc.moveDown(0.3);
  const cols = [t.type, t.min, t.max, t.avg, t.count];
  const widths = [200, 70, 70, 70, 60];
  drawRow(doc, cols, widths, true);
  for (const s of summary) drawRow(doc, [t[s.type] || s.type, fmt(s.mn), fmt(s.mx), fmt(s.av), String(s.c)], widths, false);
  doc.moveDown(1);

  doc.font('bold').fontSize(13).text(t.alerts);
  doc.moveDown(0.3);
  if (!alerts.length) {
    doc.font('body').fontSize(10).fillColor('#666').text(t.none).fillColor('#000');
  } else {
    const aw = [120, 80, 240];
    drawRow(doc, [t.when, t.sev, t.message], aw, true);
    for (const a of alerts) {
      drawRow(doc, [a.created_at.replace('T', ' ').slice(0, 19), a.severity, (lang === 'en' ? a.message_en : a.message_ro)], aw, false);
    }
  }
  doc.end();
});

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
}
function drawRow(doc, cells, widths, header) {
  const y = doc.y;
  let x = doc.x;
  doc.font(header ? 'bold' : 'body').fontSize(header ? 10 : 9.5);
  cells.forEach((c, i) => { doc.text(String(c ?? ''), x, y, { width: widths[i] }); x += widths[i]; });
  doc.moveDown(0.4);
  if (header) {
    doc.moveTo(50, doc.y - 2).lineTo(545, doc.y - 2).strokeColor('#ccc').stroke().strokeColor('#000');
  }
}

module.exports = router;
