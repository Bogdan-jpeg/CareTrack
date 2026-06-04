/* views/login.js */
import { t, getLocale } from '../i18n.js';
import { api, setSession } from '../api.js';
import { el, toast } from '../ui.js';

const EKG = `<svg class="ekg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 300 H160 l30 -90 l40 180 l36 -260 l30 380 l34 -210 l40 200 H800" fill="none" stroke="#fff" stroke-width="3"/>
</svg>`;

const DEMO = [
  { role: 'role_doctor', email: 'medic.test@caretrack.ro', pass: 'Medic#2025' },
  { role: 'role_patient', email: 'pacient1@caretrack.ro', pass: 'Pacient#2025' },
];

export function renderLogin(root) {
  const emailIn = el('input', { type: 'email', value: '', autocomplete: 'username', placeholder: 'nume@exemplu.ro' });
  const passIn = el('input', { type: 'password', value: '', autocomplete: 'current-password', placeholder: '••••••••' });
  const errBox = el('div', { class: 'field-err muted small', style: 'color:var(--red);min-height:18px;font-weight:600' });
  const btn = el('button', { class: 'btn btn-primary', style: 'width:100%;padding:12px;font-size:15px;margin-top:6px' }, t('sign_in'));

  async function submit() {
    errBox.textContent = '';
    if (!emailIn.value || !passIn.value) { errBox.textContent = t('login_failed'); return; }
    btn.disabled = true; btn.textContent = t('signing_in');
    try {
      const r = await api.login(emailIn.value.trim(), passIn.value);
      setSession(r.token, r.user);
      location.hash = r.user.role === 'patient' ? '#/my' : '#/dashboard';
    } catch (e) {
      errBox.textContent = t('login_failed');
      btn.disabled = false; btn.textContent = t('sign_in');
    }
  }
  btn.addEventListener('click', submit);
  passIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  emailIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') passIn.focus(); });

  const creds = el('div', { class: 'demo-creds' },
    el('div', { class: 'small muted', style: 'font-weight:700;margin-bottom:4px', text: t('demo_accounts') }),
    DEMO.map((d) => el('div', {
      class: 'cred',
      onClick: () => { emailIn.value = d.email; passIn.value = d.pass; passIn.focus(); },
    },
      el('span', { text: t(d.role) }),
      el('code', { text: d.email }),
    )),
  );

  const langMini = el('div', { class: 'lang-toggle', style: 'position:absolute;top:20px;right:20px' },
    el('button', { class: getLocale() === 'ro' ? 'on' : '', onClick: () => import('../i18n.js').then(m => m.setLocale('ro')) }, 'RO'),
    el('button', { class: getLocale() === 'en' ? 'on' : '', onClick: () => import('../i18n.js').then(m => m.setLocale('en')) }, 'EN'));

  root.appendChild(el('div', { class: 'auth-screen' },
    el('div', { class: 'auth-art' },
      el('div', { html: EKG }),
      el('div', { class: 'a-brand', html: `<svg viewBox="0 0 32 32" width="30" height="30" fill="none"><rect x="1" y="1" width="30" height="30" rx="9" fill="#ffffff" fill-opacity="0.18"/><path d="M5 16.5h4.2l2-5 3 9 2.4-6 1.8 2h3.6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>CareTrack</span>` }),
      el('div', {},
        el('h2', { text: t('hero_title') }),
        el('p', { text: t('hero_sub') }),
        el('div', { class: 'feats' },
          el('div', {}, el('b', { text: '24/7' }), t('feat_realtime')),
          el('div', {}, el('b', { text: '⚠' }), t('feat_alerts')),
          el('div', {}, el('b', { text: '🔒' }), t('feat_secure')),
        ),
      ),
    ),
    el('div', { class: 'auth-form-side', style: 'position:relative' },
      langMini,
      el('div', { class: 'auth-card' },
        el('h1', { text: t('login_title') }),
        el('p', { class: 'lead', text: t('login_lead') }),
        el('div', { class: 'field' }, el('label', { text: t('email') }), emailIn),
        el('div', { class: 'field' }, el('label', { text: t('password') }), passIn),
        errBox,
        btn,
        creds,
      ),
    ),
  ));
}
