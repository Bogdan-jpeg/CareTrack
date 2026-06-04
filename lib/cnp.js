/*
 * cnp.js — Romanian CNP (Cod Numeric Personal) validation.
 * Format: S YY MM DD JJ NNN C  (13 digits)
 *   S   gender + century, YYMMDD birth date, JJ county, NNN sequence, C control digit.
 * The control digit uses the official constant 279146358279.
 */
const CONTROL_KEY = '279146358279';

function validateCNP(cnp) {
  if (typeof cnp !== 'string') return { valid: false, reason: 'format' };
  cnp = cnp.trim();
  if (!/^\d{13}$/.test(cnp)) return { valid: false, reason: 'format' };

  const S = Number(cnp[0]);
  if (S < 1 || S > 9) return { valid: false, reason: 'gender_digit' };

  // Century from S (1/2 -> 1900s, 3/4 -> 1800s, 5/6 -> 2000s, 7/8 -> resident, 9 -> foreigner)
  const centuryMap = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000 };
  const yy = Number(cnp.slice(1, 3));
  const mm = Number(cnp.slice(3, 5));
  const dd = Number(cnp.slice(5, 7));
  let dob = null;
  if (centuryMap[S]) {
    const year = centuryMap[S] + yy;
    const d = new Date(Date.UTC(year, mm - 1, dd));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
      return { valid: false, reason: 'date' };
    }
    dob = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  } else {
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { valid: false, reason: 'date' };
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(cnp[i]) * Number(CONTROL_KEY[i]);
  let control = sum % 11;
  if (control === 10) control = 1;
  if (control !== Number(cnp[12])) return { valid: false, reason: 'checksum' };

  const gender = S % 2 === 1 ? 'M' : 'F';
  return { valid: true, gender, dob };
}

module.exports = { validateCNP };
