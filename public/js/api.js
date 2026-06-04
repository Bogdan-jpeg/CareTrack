/* api.js — thin client over the CareTrack REST API with JWT handling. */

const TOKEN_KEY = 'ct_token';
const USER_KEY = 'ct_user';

let token = localStorage.getItem(TOKEN_KEY) || null;
let user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');

export function getToken() { return token; }
export function getUser() { return user; }
export function isAuthed() { return !!token; }

export function setSession(tok, usr) {
  token = tok; user = usr;
  localStorage.setItem(TOKEN_KEY, tok);
  localStorage.setItem(USER_KEY, JSON.stringify(usr));
}
export function clearSession() {
  token = null; user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function req(method, path, body, opts = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !opts.noAuthRedirect) {
    clearSession();
    if (location.hash !== '#/login') { location.hash = '#/login'; }
    throw new ApiError('unauthorized', 401, { code: 'auth.required' });
  }
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) data = await res.json();
  else data = await res.text();
  if (!res.ok) throw new ApiError((data && data.error) || res.statusText, res.status, data);
  return data;
}

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

/* ---- blobs (reports) ---- */
export async function getBlob(path) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, { headers });
  if (!res.ok) throw new ApiError('report_failed', res.status);
  return res.blob();
}

export const api = {
  // auth
  login: (email, password) => req('POST', '/auth/login', { email, password }, { noAuthRedirect: true }),
  me: () => req('GET', '/auth/me'),
  setLocale: (locale) => req('PATCH', '/auth/locale', { locale }),

  // patients
  listPatients: () => req('GET', '/patients'),
  getPatient: (id) => req('GET', '/patients/' + id),
  createPatient: (b) => req('POST', '/patients', b),
  updatePatient: (id, b) => req('PUT', '/patients/' + id, b),
  deletePatient: (id) => req('DELETE', '/patients/' + id),

  // devices
  listDevices: () => req('GET', '/devices'),
  deviceStatus: (id, b) => req('POST', `/devices/${id}/status`, b),
  pairDevice: (id, patient_id) => req('POST', `/devices/${id}/pair`, { patient_id }),

  // vitals / ecg
  ingestVital: (b) => req('POST', '/vitals', b),
  ingestBatch: (items) => req('POST', '/vitals/batch', { items }),
  ingestEcg: (b) => req('POST', '/ecg', b),
  getVitals: (id, q = '') => req('GET', `/patients/${id}/vitals${q}`),
  getLatest: (id) => req('GET', `/patients/${id}/vitals/latest`),
  getEcg: (id, q = '?latest=1') => req('GET', `/patients/${id}/ecg${q}`),

  // rules
  getRules: (id) => req('GET', `/patients/${id}/rules`),
  setRules: (id, b) => req('PUT', `/patients/${id}/rules`, b),

  // alerts
  listAlerts: (q = '') => req('GET', `/alerts${q}`),
  patientAlerts: (id, q = '') => req('GET', `/patients/${id}/alerts${q}`),
  createAlert: (b) => req('POST', '/alerts', b),
  updateAlert: (id, b) => req('PATCH', `/alerts/${id}`, b),

  // recommendations
  getRecos: (id) => req('GET', `/patients/${id}/recommendations`),
  addReco: (id, b) => req('POST', `/patients/${id}/recommendations`, b),
  delReco: (id) => req('DELETE', `/recommendations/${id}`),

  // audit
  audit: (q = '') => req('GET', `/audit${q}`),
};
