/*
 * test/run-all.js — runs the full test suite.
 * Each suite that needs data runs against a throwaway database so your real
 * dev data (server/data/caretrack.db) is never touched.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB = '/tmp/caretrack-testrun.db';
const env = { ...process.env, CARETRACK_DB: DB, CARETRACK_JWT_SECRET: 'test-secret' };

function run(label, file, args = []) {
  console.log('\n\u2500\u2500 ' + label + ' ' + '\u2500'.repeat(Math.max(2, 44 - label.length)));
  try {
    execFileSync('node', [path.join('test', file), ...args], { cwd: ROOT, env, stdio: 'inherit' });
    return true;
  } catch (e) {
    return false;
  }
}

(function main() {
  // fresh seed for the suites that hit the DB
  try { require('fs').rmSync(DB, { force: true }); require('fs').rmSync(DB + '-wal', { force: true }); require('fs').rmSync(DB + '-shm', { force: true }); } catch {}
  execFileSync('node', ['seed.js', '--reset'], { cwd: ROOT, env, stdio: 'ignore' });

  const results = [];
  results.push(['Backend API (acceptance)', run('Backend API (acceptance)', 'smoke.js')]);
  // reseed between suites so counts are deterministic
  execFileSync('node', ['seed.js', '--reset'], { cwd: ROOT, env, stdio: 'ignore' });
  results.push(['Frontend (jsdom)', run('Frontend (jsdom)', 'frontend.js')]);
  results.push(['Gateway data-flow', run('Gateway data-flow', 'gateway-logic.js')]);

  console.log('\n' + '='.repeat(46));
  let allPass = true;
  for (const [name, okk] of results) { console.log(`  ${okk ? '\u2713 PASS' : '\u2717 FAIL'}  ${name}`); if (!okk) allPass = false; }
  console.log('='.repeat(46));
  process.exit(allPass ? 0 : 1);
})();
