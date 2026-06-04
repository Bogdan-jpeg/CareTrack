/*
 * server.js — CareTrack backend entry point.
 * Mounts the REST API under /api, serves the web app from /public, and exposes
 * a health check. Run with:  npm start   (seed first with: npm run seed)
 */
const path = require('path');
const express = require('express');
const cors = require('cors');

require('./db'); // ensure schema exists before routes load

// Optional: seed demo data at boot if the database is empty. Useful on hosts with
// ephemeral storage (e.g. Render's free tier resets the disk on restart/sleep), so
// the demo accounts and data are always present. Enable with CARETRACK_AUTOSEED=1.
if (process.env.CARETRACK_AUTOSEED === '1') {
  try {
    const { seed, alreadySeeded } = require('./seed');
    if (!alreadySeeded()) {
      seed();
      console.log('Auto-seeded demo data (CARETRACK_AUTOSEED=1).');
    }
  } catch (e) {
    console.error('Auto-seed at boot failed:', e);
  }
}

const authRoutes = require('./routes/auth');
const { router: patientRoutes } = require('./routes/patients');
const deviceRoutes = require('./routes/devices');
const vitalsRoutes = require('./routes/vitals');
const alertRoutes = require('./routes/alerts');
const ruleRoutes = require('./routes/rules');
const recoRoutes = require('./routes/recommendations');
const reportRoutes = require('./routes/reports');
const auditRoutes = require('./routes/audit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'caretrack', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api', vitalsRoutes);   // /api/vitals, /api/ecg, /api/patients/:id/vitals
app.use('/api', alertRoutes);    // /api/alerts, /api/patients/:id/alerts
app.use('/api', ruleRoutes);     // /api/patients/:id/rules
app.use('/api', recoRoutes);     // /api/patients/:id/recommendations
app.use('/api', reportRoutes);   // /api/patients/:id/report
app.use('/api', auditRoutes);    // /api/audit

// Serve the web app (doctor / patient / gateway) — built in the next phase.
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
// SPA fallback: any non-API route returns index.html
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err) res.status(200).send('CareTrack API is running. The web app will be served here once built.');
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CareTrack backend listening on http://localhost:${PORT}`);
  console.log(`Health check:  http://localhost:${PORT}/api/health`);
});
