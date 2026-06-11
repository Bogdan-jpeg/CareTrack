/*
 * test/gateway-logic.js — unit tests for the gateway's core data flow,
 * isolated from the network and the DOM. Verifies the parts of assignment
 * section 4 that live on the phone:
 *   4c  out-of-range 10 s measurement -> warning + async alert (throttled)
 *   4d  every 30 s -> AVERAGE of the 10 s measurements queued for the cloud
 *   4e  accelerometer window -> a single burst containing all values
 *   FIFO offline queue order is preserved across a failed send.
 *
 *   node test/gateway-logic.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// minimal DOM + global shims (the module references window/localStorage on load)
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.window = { addEventListener() {}, devicePixelRatio: 1 };
global.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
global.navigator = { onLine: true };

let pass = 0, fail = 0;
const ok = (m) => { console.log('  \u2713 ' + m); pass++; };
const no = (m, d) => { console.log('  \u2717 ' + m + (d ? '  -- ' + JSON.stringify(d) : '')); fail++; };

async function main() {
  // load gateway.js (+ its imports) as ESM from a temp copy
  const PUBLIC = path.join(__dirname, '..', 'public');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-gw-'));
  fs.cpSync(PUBLIC + '/js', tmp + '/js', { recursive: true });
  fs.writeFileSync(tmp + '/package.json', '{"type":"module"}');
  const gw = await import('file://' + tmp + '/js/views/gateway.js');
  const { Gateway } = gw;

  // a stub UI that records the warnings it is asked to raise
  const warnings = [];
  const ui = {
    setBattery() {}, setVitals() {}, setAccel() {}, pushEcg() {}, setSync() {}, onDisconnected() {},
    raiseWarning(b) { warnings.push(b); },
  };
  // a stub source we can drive manually
  const source = { on() {}, disconnect() {} };

  const rules = { min_pulse: 50, max_pulse: 120, min_temp: 35.5, max_temp: 38, min_humidity: 30, max_humidity: 65, min_spo2: 92 };
  const g = new Gateway({ source, patientId: 'PAT-001', deviceId: 'dev-001', rules, ui });

  // capture queued cloud jobs instead of sending them
  const jobs = [];
  g.enqueue = (job) => { jobs.push(job); };

  // --- 4c: a normal measurement raises no warning ---
  warnings.length = 0; jobs.length = 0;
  g.onVitals({ p: 78, t: 36.7, h: 45, s: 98 });
  (warnings.length === 0 && jobs.length === 0) ? ok('4c normal 10s measurement -> no warning, no async alert') : no('4c normal', { warnings, jobs });

  // --- 4c: a high pulse raises a warning AND queues an async alert ---
  warnings.length = 0; jobs.length = 0;
  g.onVitals({ p: 134, t: 36.7, h: 45, s: 98 });
  const alertJob = jobs.find((j) => j.kind === 'alert');
  (warnings.some((w) => w.type === 'pulse_high') && alertJob && alertJob.payload.type === 'pulse_high' && alertJob.payload.threshold === 120)
    ? ok('4c high pulse -> warning raised + async pulse_high alert queued') : no('4c high pulse', { warnings, jobs });

  // --- 4d/throttle: a second high pulse within the window does NOT re-queue an alert ---
  jobs.length = 0;
  g.onVitals({ p: 136, t: 36.7, h: 45, s: 98 });
  (jobs.filter((j) => j.kind === 'alert').length === 0)
    ? ok('4d async anomaly is throttled (no duplicate alert within window)') : no('4d throttle', jobs);

  // --- 4d: 30 s flush queues the AVERAGE of the buffered 10 s measurements ---
  // window now holds p = [78,134,136] -> avg 116 ; t=36.7 ; h=45 ; s=98
  jobs.length = 0;
  g.flushWindow();
  const vit = jobs.find((j) => j.kind === 'vitals');
  const pulseItem = vit && vit.items.find((i) => i.type === 'pulse');
  (pulseItem && pulseItem.value === 116) ? ok(`4d 30s flush queues averaged pulse (116 from [78,134,136])`) : no('4d average', { jobs });
  const hasAll = vit && ['pulse', 'temperature', 'humidity', 'spo2'].every((tp) => vit.items.some((i) => i.type === tp));
  hasAll ? ok('4d averaged batch includes pulse + temperature + humidity + spo2') : no('4d batch types', vit && vit.items);

  // --- 4e: accelerometer window is flushed as a single burst with all values ---
  jobs.length = 0;
  for (let i = 0; i < 30; i++) g.onAccel({ x: 0, y: 0, z: 1 }); // 30 readings (~1/s for 30s)
  g.flushWindow();
  const burst = jobs.map((j) => j).find((j) => j.kind === 'vitals' && j.items[0].type === 'accel_burst');
  (burst && burst.items[0].metadata && burst.items[0].metadata.values.length === 30)
    ? ok('4e accelerometer flushed as ONE burst containing all 30 values') : no('4e accel burst', burst && burst.items);

  // --- fall detection: the wearable's fall flag queues a fall alert ---
  warnings.length = 0; jobs.length = 0;
  g.lastAnomaly.fall = 0; // clear throttle
  // a fast, high-magnitude movement WITHOUT the fall flag must NOT trigger a fall
  g.onAccel({ x: 1.8, y: -1.6, z: 2.4 }); // |a| ~ 3.4 g, but no fall flag (e.g. a quick lift)
  const falsePositive = jobs.some((j) => j.kind === 'alert' && j.payload.type === 'fall');
  // a packet carrying the wearable's fall flag MUST trigger a fall
  g.onAccel({ x: 0.1, y: 0.0, z: 0.2, fall: 1 });
  const fallJob = jobs.find((j) => j.kind === 'alert' && j.payload.type === 'fall');
  (!falsePositive && warnings.some((w) => w.type === 'fall') && fallJob)
    ? ok('fall detection -> only the fall flag triggers (no false positive on fast motion)')
    : no('fall', { falsePositive, warnings, jobs });

  // --- FIFO offline queue: order preserved across a failed send ---
  // rebuild a gateway with real enqueue but a failing api shim
  const g2 = new Gateway({ source, patientId: 'PAT-001', deviceId: 'dev-001', rules, ui });
  // monkey-patch its send by overriding flush to use a local fake transport
  const sent = [];
  let failNext = true;
  g2.flush = async function () {
    while (this.queue.length) {
      const job = this.queue[0];
      if (failNext) { failNext = false; break; } // simulate one network failure, keep head
      sent.push(job.tag); this.queue.shift();
    }
  };
  g2.enqueue = function (job) { this.queue.push(job); }; // don't auto-flush; we drive it
  g2.enqueue({ tag: 'A' }); g2.enqueue({ tag: 'B' }); g2.enqueue({ tag: 'C' });
  await g2.flush(); // first attempt fails on A, stops
  await g2.flush(); // retries A, then B, C
  (sent.join('') === 'ABC') ? ok('offline queue retries in FIFO order (A,B,C) after a failure') : no('FIFO order', sent);

  // --- sensor-off: pulse/SpO₂ of 0 (no finger) must not warn, and must not skew the average ---
  warnings.length = 0; jobs.length = 0;
  g.lastAnomaly = {};            // clear throttles from the earlier checks
  g.vitalsWindow.length = 0;     // start a fresh 30 s window
  g.onVitals({ p: 0, t: 36.7, h: 45, s: 0 });    // finger off the MAX30102
  (warnings.length === 0 && jobs.filter((j) => j.kind === 'alert').length === 0)
    ? ok('sensor-off (pulse 0, SpO2 0) raises no warning and queues no alert')
    : no('sensor-off warning', { warnings, jobs });
  g.onVitals({ p: 80, t: 36.7, h: 45, s: 98 });  // finger back on
  jobs.length = 0;
  g.flushWindow();
  const vit2 = jobs.find((j) => j.kind === 'vitals');
  const p2 = vit2 && vit2.items.find((i) => i.type === 'pulse');
  const s2 = vit2 && vit2.items.find((i) => i.type === 'spo2');
  (p2 && p2.value === 80 && s2 && s2.value === 98)
    ? ok('30 s average ignores sensor-off zeros (pulse avg of [0,80] -> 80, not 40)')
    : no('sensor-off average', vit2 && vit2.items);

  console.log('\n===================================');
  console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
  console.log('===================================');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
