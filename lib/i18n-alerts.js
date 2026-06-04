/*
 * i18n-alerts.js — builds bilingual alert messages.
 * The server stores both the Romanian and English text on each alert so the
 * web app can display whichever the user has toggled, with no extra round-trip.
 */
function fmt(n) {
  if (n === null || n === undefined) return '';
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
}

// type -> (value, threshold) -> { ro, en, severity, label }
const BUILDERS = {
  pulse_high: (v, t) => ({
    ro: `Puls crescut: ${fmt(v)} BPM (limită ${fmt(t)} BPM)`,
    en: `High pulse: ${fmt(v)} BPM (limit ${fmt(t)} BPM)`,
  }),
  pulse_low: (v, t) => ({
    ro: `Puls scăzut: ${fmt(v)} BPM (limită ${fmt(t)} BPM)`,
    en: `Low pulse: ${fmt(v)} BPM (limit ${fmt(t)} BPM)`,
  }),
  temp_high: (v, t) => ({
    ro: `Temperatură ambiantă ridicată: ${fmt(v)} °C (limită ${fmt(t)} °C)`,
    en: `High ambient temperature: ${fmt(v)} °C (limit ${fmt(t)} °C)`,
  }),
  temp_low: (v, t) => ({
    ro: `Temperatură ambiantă scăzută: ${fmt(v)} °C (limită ${fmt(t)} °C)`,
    en: `Low ambient temperature: ${fmt(v)} °C (limit ${fmt(t)} °C)`,
  }),
  humidity_high: (v, t) => ({
    ro: `Umiditate ambiantă ridicată: ${fmt(v)}% (limită ${fmt(t)}%)`,
    en: `High ambient humidity: ${fmt(v)}% (limit ${fmt(t)}%)`,
  }),
  humidity_low: (v, t) => ({
    ro: `Umiditate ambiantă scăzută: ${fmt(v)}% (limită ${fmt(t)}%)`,
    en: `Low ambient humidity: ${fmt(v)}% (limit ${fmt(t)}%)`,
  }),
  spo2_low: (v, t) => ({
    ro: `SpO₂ scăzut: ${fmt(v)}% (limită ${fmt(t)}%)`,
    en: `Low SpO₂: ${fmt(v)}% (limit ${fmt(t)}%)`,
  }),
  fall: () => ({
    ro: `Posibilă cădere detectată (accelerometru)`,
    en: `Possible fall detected (accelerometer)`,
  }),
  manual: (v, t, extra) => ({
    ro: extra?.ro || `Alertă manuală`,
    en: extra?.en || `Manual alert`,
  }),
};

const DEFAULT_SEVERITY = {
  pulse_high: 'critical', pulse_low: 'critical',
  temp_high: 'warning', temp_low: 'warning',
  humidity_high: 'info', humidity_low: 'info',
  spo2_low: 'critical', fall: 'critical', manual: 'warning',
};

function buildAlertMessage(type, value, threshold, extra) {
  const builder = BUILDERS[type] || BUILDERS.manual;
  const msg = builder(value, threshold, extra);
  return {
    message_ro: msg.ro,
    message_en: msg.en,
    severity: extra?.severity || DEFAULT_SEVERITY[type] || 'warning',
  };
}

module.exports = { buildAlertMessage };
