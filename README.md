# CareTrack — Wearable Health Monitoring

A complete wearable health-monitoring system: a **Node.js/Express cloud API** plus a
**single web application** serving three roles — the **doctor** dashboard, the
**patient** view, and the **mobile gateway** (an installable PWA that talks to the
ESP32 wearable over Bluetooth). The interface is fully **bilingual (Romanian / English)**
with a live toggle.

This repository is the cloud + web app. The ESP32 firmware is a separate component
that connects to the gateway over Bluetooth LE.

## What's inside

```
Doctor / Admin            Patient                   Mobile gateway (PWA)
──────────────            ───────                   ────────────────────
• patient records         • own record & vitals     • Bluetooth pairing to ESP32
• vitals charts + ECG     • ECG + alerts            • 10s warnings (on the phone)
• alerts & audit log      • recommended activities  • 30s averaged upload
• thresholds (limits)       + calendar              • accelerometer burst, live ECG
• PDF / CSV reports       • add a note to an alert  • SOS + note-on-alarm
```

The web app is **vanilla JavaScript ES modules + Chart.js** — there is **no build
step**. The backend serves it as static files, so `npm start` runs the whole thing.

---

## Requirements

- **Node.js 22 or newer** (tested on Node 22 and 24).
  The database uses Node's built-in SQLite (`node:sqlite`), so there is
  **nothing to compile** and no native modules to install — it just works.

Check your version:

```bash
node --version
```

---

## Setup

```bash
cd server
npm install        # installs express, jsonwebtoken, bcryptjs, pdfkit, cors (all pure JS)
```

## Seed the demo data

This creates the test accounts and two patients used by the acceptance tests,
including historical vitals so the charts are populated on first load.

```bash
npm run seed       # seeds only if the database is empty
npm run reset      # wipes the database and re-seeds from scratch
```

Seed accounts:

| Role     | Email                     | Password       | Notes                         |
|----------|---------------------------|----------------|-------------------------------|
| Admin    | admin@caretrack.ro        | `Admin#2025`   | sees everything               |
| Doctor   | medic.test@caretrack.ro   | `Medic#2025`   | sees PAT-001 and PAT-002      |
| Doctor 2 | medic2@caretrack.ro       | `Medic#2025`   | sees PAT-005                  |
| Patient  | pacient1@caretrack.ro     | `Pacient#2025` | linked to PAT-001 (Popescu A.)|
| Patient  | pacient2@caretrack.ro     | `Pacient#2025` | linked to PAT-002 (Ionescu M.)|
| Patient  | pacient3@caretrack.ro     | `Pacient#2025` | linked to PAT-003 (Marin G.)  |
| Patient  | pacient4@caretrack.ro     | `Pacient#2025` | linked to PAT-004 (Dumitru I.)|
| Patient  | pacient5@caretrack.ro     | `Pacient#2025` | linked to PAT-005 (Stan N.)   |


## Run

```bash
npm start          # http://localhost:3000
```

Open **http://localhost:3000** and sign in. The web app for all three roles is
served at `/`. The API lives under `/api` (health check: `/api/health`).

## Using the web app

- **Doctor / admin** (`medic.test@caretrack.ro`): manage patients, set per-patient
  limits, watch vitals charts and the ECG, triage alerts, read the audit log and
  export PDF / CSV reports.
- **Patient** (`pacient1@caretrack.ro`): see their own vitals, ECG and alerts, the
  doctor's recommended activities with a calendar, and attach a note to an alert.
- **Mobile gateway** (the *Mobile gateway* tab): connect to the wearable.
  - Tap **Connect via Bluetooth** to pair a real ESP32 (Chrome on Android/desktop), or
  - Tap **Demo mode (no hardware)** to run the full data flow with simulated sensors —
    useful for a presentation. In demo mode you also get buttons to inject a high
    pulse and a fall so the warning flow is easy to show.

Switch **RO / EN** any time with the toggle in the top bar.

### Installing the gateway on a phone (PWA)

The gateway is a Progressive Web App. On Android Chrome, open the site and choose
**Add to Home screen** — it installs as a standalone app. Web Bluetooth requires a
secure context, so serve over **HTTPS** (or `localhost` during development).

## Tests

Three suites, all runnable with one command (they use a throwaway database and never
touch your dev data):

```bash
npm test               # runs all three suites below
```

| Suite                | Command                | What it checks |
|----------------------|------------------------|----------------|
| Backend (acceptance) | `npm run test:backend` | 24 endpoint scenarios mapped to TA-01..TA-25 |
| Frontend (jsdom)     | `npm run test:frontend`| static serving, every module loads, RO/EN toggle, login renders |
| Gateway data-flow    | `npm run test:gateway` | 10s warnings, 30s averaging, accel burst, fall, FIFO offline queue |

(`npm install` pulls in `jsdom`, used only by the frontend test.)

---

## Configuration (environment variables)

| Variable                 | Default                          | Purpose                          |
|--------------------------|----------------------------------|----------------------------------|
| `PORT`                   | `3000`                           | HTTP port                        |
| `CARETRACK_DB`           | `server/data/caretrack.db`       | SQLite file location             |
| `CARETRACK_JWT_SECRET`   | dev fallback (change in prod)    | JWT signing secret               |

---

## API overview

All endpoints are under `/api`. Authenticated requests send `Authorization: Bearer <token>`.

**Auth**
- `POST /api/auth/login` → `{ token, user }`
- `GET  /api/auth/me`
- `POST /api/auth/register` (admin/doctor)
- `PATCH /api/auth/locale` `{ locale: "ro" | "en" }`

**Patients** (doctor sees own; patient sees self)
- `GET  /api/patients`
- `GET  /api/patients/:id`
- `POST /api/patients` (CNP validated)
- `PUT  /api/patients/:id`
- `DELETE /api/patients/:id` (soft delete)

**Devices**
- `GET  /api/devices`
- `POST /api/devices`
- `POST /api/devices/:id/pair` `{ patient_id }`
- `POST /api/devices/:id/status` `{ status, firmware_version }` (gateway)

**Vitals / ECG**
- `POST /api/vitals` (single; runs rules engine → `{ risk_level, alert_generated, alert }`)
- `POST /api/vitals/batch` `{ items: [...] }` (FIFO offline flush)
- `POST /api/ecg` `{ samples: [...] }`
- `GET  /api/patients/:id/vitals?type=&from=&to=&limit=`
- `GET  /api/patients/:id/vitals/latest`
- `GET  /api/patients/:id/ecg?latest=1`

**Rules (thresholds)**
- `GET  /api/patients/:id/rules`
- `PUT  /api/patients/:id/rules` (doctor)

**Alerts**
- `GET   /api/alerts?patient_id=&status=&severity=`
- `GET   /api/patients/:id/alerts`
- `POST  /api/alerts` (manual / event / fall / SOS)
- `PATCH /api/alerts/:id` `{ status?, note? }` (patient may add note; only staff change status)

**Recommendations**
- `GET    /api/patients/:id/recommendations`
- `POST   /api/patients/:id/recommendations` (doctor)
- `DELETE /api/recommendations/:id` (doctor)

**Reports**
- `GET /api/patients/:id/report?from=&to=&format=pdf|csv&lang=ro|en`

**Audit**
- `GET /api/audit?entity=&action=&limit=` (admin/doctor)

---

## Project structure

```
server/
  server.js            Express entry point (mounts /api, serves /public)
  seed.js              demo / acceptance-test data
  db.js                node:sqlite connection + schema + nrun() helper
  lib/
    auth.js            JWT, requireAuth/requireRole, access checks, audit()
    cnp.js             Romanian CNP validation
    i18n-alerts.js     bilingual RO/EN alert message builder
    rules-engine.js    threshold evaluation + alert creation (with dedupe)
  routes/              auth, patients, devices, vitals, alerts, rules,
                       recommendations, reports, audit
  assets/fonts/        DejaVu Sans (embedded in PDFs for Romanian diacritics)
  test/
    run-all.js         runs all suites
    smoke.js           backend acceptance suite (24 checks)
    frontend.js        jsdom frontend load/render suite (12 checks)
    gateway-logic.js   gateway data-flow unit suite (8 checks)
  public/              the web app (served at /)
    index.html
    manifest.json  sw.js           PWA install + offline shell
    icons/                          app icons (svg + 192/512 png)
    css/styles.css                  clinical design system, RO/EN, responsive
    js/
      app.js                        bootstrap, top bar, RO/EN toggle, router
      i18n.js  api.js  ui.js  charts.js
      views/  login, dashboard, patients, patient_detail,
              alerts, audit, my_data, gateway
```

### Bluetooth LE protocol (gateway ⇄ ESP32)

The gateway connects to a device advertising name prefix **`CareTrack`** and the
service below. The firmware must expose exactly these (defined once in
`public/js/views/gateway.js` as `BLE`):

| Role | UUID | Format |
|------|------|--------|
| Service | `c0de1000-feed-4a1e-b100-d00000000001` | — |
| Vitals (notify) | `c0de1001-…` | UTF-8 JSON every 10 s: `{"p":78,"t":36.7,"h":45,"s":98}` |
| ECG (notify) | `c0de1002-…` | Int16 little-endian samples, ~100/s |
| Accel (notify) | `c0de1003-…` | UTF-8 JSON once/sec: `{"x":..,"y":..,"z":..}` (g) |
| Battery (notify) | `c0de1004-…` | uint8 percent |

---

## Notes

- **Authoritative alerts** are created server-side by the rules engine. The
  mobile gateway also shows a local notification immediately, but the cloud is
  the source of truth.
- **Data isolation** is enforced on every patient-scoped route: a doctor can only
  reach their own patients, a patient only their own record.
- **Diacritics** in PDFs render correctly because DejaVu Sans is embedded; CSVs
  include a UTF-8 BOM so Excel opens them correctly.
