// WordPress contact forms all post slightly different field names, so rather than
// hard-coding one plugin's shape we look for the field by what it is likely to be
// called. Contact Form 7, WPForms, Gravity Forms, Elementor and Fluent Forms all land
// here cleanly, and an unknown form still gets its message through.
const cfg = $('config').first().json;
const raw = $input.first().json || {};

// The payload might be the body itself, or wrapped in body/data/fields by the plugin.
const merge = (obj, depth) => {
  let flat = {};
  if (!obj || typeof obj !== 'object' || depth > 3) return flat;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flat = Object.assign(flat, merge(v, depth + 1));
    } else {
      flat[String(k).toLowerCase().replace(/[^a-z0-9]/g, '')] = Array.isArray(v) ? v.join(', ') : v;
    }
  }
  return flat;
};
const f = merge(raw, 0);

const pick = (...names) => {
  for (const n of names) {
    const v = f[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+(]?[0-9][0-9\s().-]{7,}$/;
const NAME_RE  = /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){1,2}$/;

// Some forms post numbered fields rather than named ones - WPForms sends fields.0,
// fields.1, Gravity Forms sends input_1, input_2. Names get us nowhere there, so after
// the named lookup fails we go by the shape of the value instead.
const values = Object.entries(f)
  .map(([k, v]) => [k, String(v ?? '').trim()])
  .filter(([, v]) => v !== '');

const scan = (test, exclude) => {
  for (const [, v] of values) {
    if (exclude.includes(v)) continue;
    if (test(v)) return v;
  }
  return '';
};

let contact = pick('yourname', 'name', 'fullname', 'contactname', 'firstname');
let email   = pick('youremail', 'email', 'emailaddress', 'contactemail');
let phone   = pick('yourphone', 'phone', 'telephone', 'tel', 'mobile', 'contactnumber');
const company = pick('company', 'companyname', 'business', 'businessname', 'organisation', 'organization');
let message = pick('yourmessage', 'message', 'comments', 'enquiry', 'details', 'notes');
const premises = pick('premises', 'propertytype', 'typeofpremises', 'sitetype', 'subject', 'yoursubject');

if (!email)   email = scan((v) => EMAIL_RE.test(v), []);
if (!phone)   phone = scan((v) => PHONE_RE.test(v) && v.replace(/[^0-9]/g, '').length >= 9, [email]);
if (!contact) contact = scan((v) => NAME_RE.test(v), [email, phone, company]);
if (!message) {
  // The longest thing they typed is the message, near enough.
  const taken = [email, phone, contact, company, premises];
  message = values.map(([, v]) => v)
    .filter((v) => !taken.includes(v) && v.length > 25)
    .sort((a, b) => b.length - a.length)[0] || '';
}

// The postcode may be its own field, or buried in the message. Try the field first.
const postcodeField = pick('postcode', 'postalcode', 'zip', 'zipcode', 'address', 'siteaddress', 'location');
const UK_POSTCODE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/i;
const fromField = String(postcodeField).match(UK_POSTCODE);
const fromMessage = (String(message) + ' ' + String(postcodeField)).match(UK_POSTCODE);
const found = fromField || fromMessage;
const postcode = found ? (found[1] + ' ' + found[2]).toUpperCase() : postcodeField;

// Spam gates. A honeypot field that plugins leave empty for humans, and the basics.
const honeypot = pick('honeypot', 'hp', 'website2', 'url2', 'nickname');

const problems = [];
if (honeypot) problems.push('honeypot field was filled in');
if (!EMAIL_RE.test(email)) problems.push(email ? 'email address is not valid' : 'no email address');
if (!message && !company && !contact) problems.push('nothing in the form but an address');

const now = new Date();
const stamp = now.toISOString();
// A short reference a human can read out on the phone: CE-20260831-4821
const ref = 'CE-' + stamp.slice(0, 10).replace(/-/g, '') + '-' +
  String(Math.abs(([...(email + stamp)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7))) % 10000)
    .padStart(4, '0');

return [{
  json: {
    _looks_real: problems.length === 0,
    _problems: problems,
    ref,
    received: stamp,
    contact,
    email: email.toLowerCase(),
    phone,
    company: company || (contact ? contact + ' (no company given)' : ''),
    premises,
    postcode,
    message,
    _raw_field_names: Object.keys(f).slice(0, 40)
  }
}];
