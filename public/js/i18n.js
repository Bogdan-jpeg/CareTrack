/* i18n.js — bilingual RO/EN strings + helpers. Default Romanian, toggle to English. */

const STR = {
  ro: {
    // app / nav
    app_tagline: 'Monitorizare medicală purtabilă',
    nav_dashboard: 'Tablou de bord', nav_patients: 'Pacienți', nav_alerts: 'Alerte',
    nav_audit: 'Jurnal audit', nav_gateway: 'Gateway mobil', nav_my: 'Date personale',
    logout: 'Deconectare', loading: 'Se încarcă…', live: 'live',
    role_doctor: 'Medic', role_patient: 'Pacient', role_admin: 'Administrator',

    // login
    login_title: 'Autentificare', login_lead: 'Introduceți datele de acces pentru a continua.',
    email: 'Email', password: 'Parolă', sign_in: 'Conectare', signing_in: 'Se conectează…',
    login_failed: 'Email sau parolă incorecte.',
    demo_accounts: 'Conturi demonstrative (clic pentru completare)',
    hero_title: 'Îngrijire continuă, oriunde se află pacientul.',
    hero_sub: 'CareTrack reunește dispozitivul purtabil, aplicația mobilă și platforma medicului într-un singur flux de date sigur.',
    feat_realtime: 'Date în timp real', feat_alerts: 'Alerte inteligente', feat_secure: 'Date izolate per pacient',

    // dashboard
    dash_title: 'Tablou de bord', dash_sub: 'Privire de ansamblu asupra pacienților monitorizați.',
    total_patients: 'Pacienți', open_alerts: 'Alerte deschise', devices_online: 'Dispozitive active', critical: 'Critice',
    recent_alerts: 'Alerte recente', your_patients: 'Pacienții dvs.', view_all: 'Vezi tot',
    no_alerts: 'Nicio alertă. Totul este în regulă.',

    // patients list
    patients_title: 'Pacienți', patients_sub: 'Gestionați fișele pacienților monitorizați.',
    add_patient: 'Pacient nou', search_patients: 'Caută pacient…',
    col_name: 'Nume', col_age: 'Vârstă', col_cnp: 'CNP', col_device: 'Dispozitiv', col_status: 'Stare', col_alerts: 'Alerte',
    no_patients: 'Niciun pacient încă. Adăugați primul pacient.',
    status_paired: 'Asociat', status_connected: 'Conectat', status_disconnected: 'Deconectat', status_unpaired: 'Neasociat', status_none: 'Fără dispozitiv',

    // patient form
    new_patient: 'Pacient nou', edit_patient: 'Editare pacient',
    first_name: 'Prenume', last_name: 'Nume', cnp: 'CNP', dob: 'Data nașterii', gender: 'Sex',
    gender_m: 'Masculin', gender_f: 'Feminin',
    addr_street: 'Stradă', addr_number: 'Număr', addr_city: 'Oraș', addr_county: 'Județ', addr_postal: 'Cod poștal',
    phone: 'Telefon', profession: 'Profesie', workplace: 'Loc de muncă',
    medical_history: 'Istoric medical', allergies: 'Alergii', cardio_consults: 'Consultații cardiologice',
    create_account: 'Creează cont de acces pentru pacient',
    account_email: 'Email cont pacient', account_password: 'Parolă cont pacient',
    section_personal: 'Date personale', section_address: 'Adresă', section_contact: 'Contact', section_medical: 'Informații medicale', section_account: 'Cont de acces',
    save: 'Salvează', cancel: 'Anulează', saving: 'Se salvează…',
    cnp_required: 'CNP-ul este obligatoriu.', cnp_invalid: 'CNP invalid. Verificați cifrele.',
    name_required: 'Numele și prenumele sunt obligatorii.',
    patient_created: 'Pacient adăugat.', patient_updated: 'Pacient actualizat.', patient_deleted: 'Pacient șters.',
    confirm_delete: 'Sigur ștergeți acest pacient?', delete: 'Șterge', edit: 'Editează',

    // patient detail tabs
    tab_overview: 'Prezentare', tab_vitals: 'Semne vitale', tab_ecg: 'ECG', tab_alerts: 'Alerte',
    tab_rules: 'Limite', tab_reco: 'Recomandări', tab_report: 'Raport',
    back: 'Înapoi',
    latest_readings: 'Ultimele valori', last_24h: 'Ultimele 24 de ore',
    pulse: 'Puls', temperature: 'Temp. ambiantă', humidity: 'Umiditate ambiantă', spo2: 'SpO₂', accel: 'Accelerometru',
    bpm: 'BPM', no_data: 'Nu există date.',

    // rules
    rules_title: 'Limite și modele de avertizare', rules_sub: 'Valorile normale stabilite de medic. Avertizările se declanșează în afara acestor limite.',
    min: 'Minim', max: 'Maxim',
    min_pulse: 'Puls minim', max_pulse: 'Puls maxim', min_temp: 'Temp. amb. min.', max_temp: 'Temp. amb. max.',
    min_humidity: 'Umiditate amb. min.', max_humidity: 'Umiditate amb. max.', min_spo2: 'SpO₂ minim',
    persistence: 'Persistență (secunde)', rules_saved: 'Limitele au fost salvate.',
    save_rules: 'Salvează limitele',

    // recommendations
    reco_title: 'Recomandări medicale', add_reco: 'Recomandare nouă',
    reco_type: 'Tip activitate', reco_walk: 'Plimbare', reco_cycling: 'Ciclism', reco_running: 'Alergare', reco_exercise: 'Exerciții', reco_other: 'Altele',
    reco_name: 'Titlu', reco_duration: 'Durată zilnică (min)', reco_instructions: 'Instrucțiuni',
    reco_start: 'Data început', reco_end: 'Data sfârșit',
    reco_added: 'Recomandare adăugată.', reco_deleted: 'Recomandare ștearsă.', no_reco: 'Nicio recomandare.',
    activity_calendar: 'Calendar activități',

    // alerts
    alerts_title: 'Alerte', alerts_sub: 'Avertizări generate pe baza măsurătorilor.',
    filter_all: 'Toate', filter_open: 'Deschise', filter_critical: 'Critice',
    sev_critical: 'Critic', sev_warning: 'Avertizare', sev_info: 'Informativ',
    st_open: 'Deschisă', st_ack: 'Preluată', st_closed: 'Închisă',
    acknowledge: 'Preia', close_alert: 'Închide', add_note: 'Adaugă notă', patient_note: 'Nota pacientului',
    alert_updated: 'Alertă actualizată.', note_saved: 'Notă salvată.',
    note_placeholder: 'Cum vă simțiți? (ex. amețeală, durere…)',

    // report
    report_title: 'Generare raport', report_sub: 'Exportați un raport cu semnele vitale și alertele.',
    from_date: 'De la data', to_date: 'Până la data', report_lang: 'Limba raportului',
    gen_pdf: 'Descarcă PDF', gen_csv: 'Descarcă CSV', report_note: 'Raportul include date demografice, sumarul semnelor vitale și alertele din interval.',

    // audit
    audit_title: 'Jurnal de audit', audit_sub: 'Înregistrarea acțiunilor critice asupra datelor.',
    col_when: 'Data', col_user: 'Utilizator', col_action: 'Acțiune', col_entity: 'Entitate',

    // gateway
    gw_title: 'CareTrack Gateway', gw_sub: 'Conectează brățara prin Bluetooth.',
    gw_connect_title: 'Conectează dispozitivul', gw_connect_text: 'Asociază brățara CareTrack prin Bluetooth pentru a monitoriza în timp real.',
    gw_connect_btn: 'Conectează prin Bluetooth', gw_connecting: 'Se conectează…',
    gw_disconnect: 'Deconectează', gw_connected_to: 'Conectat la',
    gw_not_supported: 'Web Bluetooth nu este disponibil în acest browser. Folosiți Chrome pe Android sau desktop.',
    gw_live: 'Valori în timp real', gw_ecg: 'Semnal ECG (live)', gw_accel: 'Accelerometru',
    gw_sync: 'Sincronizare cloud', gw_synced: 'Sincronizat', gw_offline: 'Offline — date în buffer',
    gw_buffered: 'în buffer', gw_last_sync: 'Ultima trimitere',
    gw_recos: 'Recomandările medicului', gw_alarms: 'Avertizări',
    gw_sos: 'Trimite alarmă (SOS)', gw_add_note: 'Atașează o notă la alarmă',
    gw_fall: 'Posibilă cădere detectată!', gw_alarm_sent: 'Alarmă trimisă la cloud.',
    gw_pairing_info: 'Selectați dispozitivul „CareTrack-…" din lista Bluetooth.',
    gw_avg_sent: 'Medie trimisă (30s)', gw_note_sent: 'Notă trimisă cu alarma.',
    gw_simulate: 'Mod demonstrativ (fără hardware)', gw_sim_on: 'Demonstrativ activ',
    measurements_10s: 'măsurători la 10s', sent_30s: 'trimise la 30s',

    close: 'Închide', confirm: 'Confirmă', yes: 'Da', no: 'Nu',
    none: 'Niciuna', male: 'M', female: 'F', years: 'ani',
  },

  en: {
    app_tagline: 'Wearable health monitoring',
    nav_dashboard: 'Dashboard', nav_patients: 'Patients', nav_alerts: 'Alerts',
    nav_audit: 'Audit log', nav_gateway: 'Mobile gateway', nav_my: 'My data',
    logout: 'Log out', loading: 'Loading…', live: 'live',
    role_doctor: 'Doctor', role_patient: 'Patient', role_admin: 'Administrator',

    login_title: 'Sign in', login_lead: 'Enter your credentials to continue.',
    email: 'Email', password: 'Password', sign_in: 'Sign in', signing_in: 'Signing in…',
    login_failed: 'Incorrect email or password.',
    demo_accounts: 'Demo accounts (click to fill)',
    hero_title: 'Continuous care, wherever the patient is.',
    hero_sub: 'CareTrack unites the wearable, the mobile app and the clinician platform into one secure data flow.',
    feat_realtime: 'Real-time data', feat_alerts: 'Smart alerts', feat_secure: 'Per-patient isolation',

    dash_title: 'Dashboard', dash_sub: 'Overview of your monitored patients.',
    total_patients: 'Patients', open_alerts: 'Open alerts', devices_online: 'Devices online', critical: 'Critical',
    recent_alerts: 'Recent alerts', your_patients: 'Your patients', view_all: 'View all',
    no_alerts: 'No alerts. All clear.',

    patients_title: 'Patients', patients_sub: 'Manage the records of monitored patients.',
    add_patient: 'New patient', search_patients: 'Search patient…',
    col_name: 'Name', col_age: 'Age', col_cnp: 'PIN', col_device: 'Device', col_status: 'Status', col_alerts: 'Alerts',
    no_patients: 'No patients yet. Add the first one.',
    status_paired: 'Paired', status_connected: 'Connected', status_disconnected: 'Disconnected', status_unpaired: 'Unpaired', status_none: 'No device',

    new_patient: 'New patient', edit_patient: 'Edit patient',
    first_name: 'First name', last_name: 'Last name', cnp: 'PIN (CNP)', dob: 'Date of birth', gender: 'Sex',
    gender_m: 'Male', gender_f: 'Female',
    addr_street: 'Street', addr_number: 'No.', addr_city: 'City', addr_county: 'County', addr_postal: 'Postal code',
    phone: 'Phone', profession: 'Profession', workplace: 'Workplace',
    medical_history: 'Medical history', allergies: 'Allergies', cardio_consults: 'Cardiology consultations',
    create_account: 'Create a login account for the patient',
    account_email: 'Patient account email', account_password: 'Patient account password',
    section_personal: 'Personal details', section_address: 'Address', section_contact: 'Contact', section_medical: 'Medical information', section_account: 'Login account',
    save: 'Save', cancel: 'Cancel', saving: 'Saving…',
    cnp_required: 'PIN is required.', cnp_invalid: 'Invalid PIN. Check the digits.',
    name_required: 'First and last name are required.',
    patient_created: 'Patient added.', patient_updated: 'Patient updated.', patient_deleted: 'Patient deleted.',
    confirm_delete: 'Delete this patient?', delete: 'Delete', edit: 'Edit',

    tab_overview: 'Overview', tab_vitals: 'Vitals', tab_ecg: 'ECG', tab_alerts: 'Alerts',
    tab_rules: 'Limits', tab_reco: 'Recommendations', tab_report: 'Report',
    back: 'Back',
    latest_readings: 'Latest readings', last_24h: 'Last 24 hours',
    pulse: 'Pulse', temperature: 'Ambient temp.', humidity: 'Ambient humidity', spo2: 'SpO₂', accel: 'Accelerometer',
    bpm: 'BPM', no_data: 'No data.',

    rules_title: 'Limits & warning models', rules_sub: 'Normal ranges set by the doctor. Warnings trigger outside these limits.',
    min: 'Min', max: 'Max',
    min_pulse: 'Min pulse', max_pulse: 'Max pulse', min_temp: 'Min ambient temp', max_temp: 'Max ambient temp',
    min_humidity: 'Min ambient humidity', max_humidity: 'Max ambient humidity', min_spo2: 'Min SpO₂',
    persistence: 'Persistence (seconds)', rules_saved: 'Limits saved.',
    save_rules: 'Save limits',

    reco_title: 'Medical recommendations', add_reco: 'New recommendation',
    reco_type: 'Activity type', reco_walk: 'Walk', reco_cycling: 'Cycling', reco_running: 'Running', reco_exercise: 'Exercise', reco_other: 'Other',
    reco_name: 'Title', reco_duration: 'Daily duration (min)', reco_instructions: 'Instructions',
    reco_start: 'Start date', reco_end: 'End date',
    reco_added: 'Recommendation added.', reco_deleted: 'Recommendation deleted.', no_reco: 'No recommendations.',
    activity_calendar: 'Activity calendar',

    alerts_title: 'Alerts', alerts_sub: 'Warnings generated from measurements.',
    filter_all: 'All', filter_open: 'Open', filter_critical: 'Critical',
    sev_critical: 'Critical', sev_warning: 'Warning', sev_info: 'Info',
    st_open: 'Open', st_ack: 'Acknowledged', st_closed: 'Closed',
    acknowledge: 'Acknowledge', close_alert: 'Close', add_note: 'Add note', patient_note: 'Patient note',
    alert_updated: 'Alert updated.', note_saved: 'Note saved.',
    note_placeholder: 'How do you feel? (e.g. dizziness, pain…)',

    report_title: 'Generate report', report_sub: 'Export a report with vitals and alerts.',
    from_date: 'From date', to_date: 'To date', report_lang: 'Report language',
    gen_pdf: 'Download PDF', gen_csv: 'Download CSV', report_note: 'The report includes demographics, a vitals summary and alerts in the interval.',

    audit_title: 'Audit log', audit_sub: 'Record of critical actions on data.',
    col_when: 'When', col_user: 'User', col_action: 'Action', col_entity: 'Entity',

    gw_title: 'CareTrack Gateway', gw_sub: 'Connect the wearable over Bluetooth.',
    gw_connect_title: 'Connect your device', gw_connect_text: 'Pair the CareTrack wearable over Bluetooth to monitor in real time.',
    gw_connect_btn: 'Connect via Bluetooth', gw_connecting: 'Connecting…',
    gw_disconnect: 'Disconnect', gw_connected_to: 'Connected to',
    gw_not_supported: 'Web Bluetooth is not available in this browser. Use Chrome on Android or desktop.',
    gw_live: 'Live readings', gw_ecg: 'ECG signal (live)', gw_accel: 'Accelerometer',
    gw_sync: 'Cloud sync', gw_synced: 'Synced', gw_offline: 'Offline — buffering',
    gw_buffered: 'buffered', gw_last_sync: 'Last upload',
    gw_recos: "Doctor's recommendations", gw_alarms: 'Warnings',
    gw_sos: 'Send alarm (SOS)', gw_add_note: 'Attach a note to the alarm',
    gw_fall: 'Possible fall detected!', gw_alarm_sent: 'Alarm sent to cloud.',
    gw_pairing_info: 'Select the “CareTrack-…” device from the Bluetooth list.',
    gw_avg_sent: 'Average sent (30s)', gw_note_sent: 'Note sent with alarm.',
    gw_simulate: 'Demo mode (no hardware)', gw_sim_on: 'Demo mode active',
    measurements_10s: 'measurements every 10s', sent_30s: 'sent every 30s',

    close: 'Close', confirm: 'Confirm', yes: 'Yes', no: 'No',
    none: 'None', male: 'M', female: 'F', years: 'yrs',
  },
};

let locale = localStorage.getItem('ct_locale') || 'ro';
const listeners = new Set();

export function getLocale() { return locale; }
export function setLocale(l) {
  if (l !== 'ro' && l !== 'en') return;
  locale = l;
  localStorage.setItem('ct_locale', l);
  document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}
export function onLocaleChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function t(key) {
  return (STR[locale] && STR[locale][key]) || (STR.ro[key]) || key;
}
/* translate vital type labels */
export function tVital(type) {
  const map = { pulse: 'pulse', temperature: 'temperature', humidity: 'humidity', spo2: 'spo2', accel_magnitude: 'accel' };
  return t(map[type] || type);
}
document.documentElement.lang = locale;
