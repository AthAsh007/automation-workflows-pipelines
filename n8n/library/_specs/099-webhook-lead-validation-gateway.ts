import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, switchOn, http, respond } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'webhook-lead-validation-gateway',
  title: 'Validate, normalise and deduplicate webhook leads before forwarding to a CRM',
  summary: 'Sits between your web forms and your CRM: checks required fields, email syntax, common domain typos and disposable domains, normalises phone numbers to E.164 and names to proper case, drops repeats inside a dedupe window, answers 200 or 422 with reasons and forwards clean leads to a CRM webhook.',
  category: 'Sales and CRM',
  description: {
    who: 'Marketing and sales ops teams whose landing pages, ad forms and partners all post leads straight into the CRM, along with typos, throwaway addresses, bots and the same person three times. The CRM only sees leads that pass.',
    how: [
      'Each form posts its lead to `Receive a lead`. A manual run pushes 7 sample leads through the same rules.',
      'Field names are matched loosely (email, Email, email_address), and a filled honeypot field marks the lead as a bot.',
      'The email is trimmed and lower-cased, common typos like gmial.com are corrected, and syntax and `DISPOSABLE_PROVIDERS` are checked. Phone numbers become E.164 and names become proper case, including O\'Neill and Smith-Jones.',
      'A lead whose email or phone was accepted in the last `DEDUPE_HOURS` hours is a duplicate. The hash is kept in workflow static data on live runs.',
      'The form gets 200 with a lead id, 200 with duplicate true, or 422 with every reason. Accepted leads are posted to `CRM_WEBHOOK_URL` on a live run.',
    ],
    setup: [
      'Run it once as imported. It validates the sample leads and stops at `STOP: not live - lead not forwarded`.',
      'Point your forms at the production URL of `Receive a lead` and show the 422 reasons next to the form fields.',
      'Set `CRM_WEBHOOK_URL` to your CRM or automation inbound webhook and check `REQUIRED_FIELDS`.',
      'Send a few test submissions and read the replies, then set `TEST_RUN = false` to forward.',
    ],
    requirements: ['Web forms that can POST JSON', 'A CRM or tool with an inbound webhook URL'],
    customize: [
      '`DISPOSABLE_PROVIDERS` and `DOMAIN_TYPOS` are plain lists you can extend.',
      '`DEDUPE_HOURS` sets how long a repeat counts as a duplicate.',
      '`DEFAULT_COUNTRY_CODE` decides how local phone numbers are read.',
    ],
  },
  config: {
    intro: ['A manual run validates SAMPLE leads. Nothing is forwarded unless the run is live and CRM_WEBHOOK_URL is set.', 'Dedupe hashes are stored only on live runs, so tests never block a real lead.'],
    consts: [
      { name: 'CRM_WEBHOOK_URL', value: '', note: 'inbound webhook of your CRM; blank keeps leads here' },
      { name: 'REQUIRED_FIELDS', value: ['name'], note: "fields that must be present; at least one of email or phone is always required" },
      { name: 'DISPOSABLE_PROVIDERS', value: ['mailinator', 'guerrillamail', '10minutemail', 'tempmail', 'yopmail', 'trashmail', 'sharklasers'], note: 'throwaway mail providers, matched on the domain name before the TLD' },
      { name: 'DOMAIN_TYPOS', value: { gmial: 'gmail', gmai: 'gmail', gamil: 'gmail', hotmial: 'hotmail', yaho: 'yahoo', outlok: 'outlook' }, note: 'mistyped provider name -> correct one (gmial.com -> gmail.com)' },
      { name: 'DEFAULT_COUNTRY_CODE', value: '1', note: 'country code for phone numbers written without +' },
      { name: 'DEDUPE_HOURS', value: 72, note: 'same email or phone inside this window is a duplicate' },
      { name: 'HONEYPOT_FIELD', value: 'website', note: 'hidden form field; bots fill it, people do not' },
      { name: 'MAX_LINKS_IN_MESSAGE', value: 2, note: 'more links than this in the message is treated as spam' },
    ],
    flags: { crm_enabled: "CRM_WEBHOOK_URL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Receive a lead', 'lead-intake', { respond: 'node' }),
    code('Read the incoming lead', `
// The webhook body when one arrived; an empty marker on a manual run.
let body = null;
try { body = $('Receive a lead').first().json.body; } catch (e) { body = null; }
if (!body || typeof body !== 'object' || !Object.keys(body).length) return [{ json: { has_lead: false } }];
return [{ json: { has_lead: true, raw: body, received_at: new Date().toISOString() } }];`),
    ifTrue('Lead received?', '$json.has_lead'),
    code('Load sample leads', `
// Used on a manual run: one lead per rule, including a repeat of the first.
const now = new Date().toISOString();
return [
  { first_name: 'jOHN', last_name: "o'neill", Email: ' John.ONeill@Gmial.example ', phone: '(212) 555-0142', company: 'harbour dental', source: 'google-ads' },
  { name: 'Test Person', email: 'test@mailinator.example', phone: '' },
  { name: 'Mia Novak', company: 'Novak Joinery' },
  { name: 'Ana Ruiz', email: 'ana@@mail.example', phone: '646-555-0119' },
  { name: 'Cheap Pills', email: 'offers@pills.example', website: 'http://pills.example' },
  { full_name: 'JOHN ONEILL', email_address: 'john.oneill@gmail.example', source: 'facebook' },
  { name: 'dana smith-jones', tel: '+1 646 555 0123', message: 'Please call me about a quote for 3 sites.' },
].map(raw => ({ json: { has_lead: true, raw, received_at: now } }));`),
    merge('Combine lead sources'),
    code('Validate and normalise each lead', `
// Every rule adds a reason instead of stopping at the first, so a form can show all of
// them. Dedupe key = normalised email and phone; remembered only on live runs.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const seen = memory.lead_hashes || {};
const now = Date.now();
for (const k of Object.keys(seen)) if (now - seen[k] > cfg.dedupe_hours * 36e5) delete seen[k];
const pick = (o, keys) => { for (const k of keys) for (const f of Object.keys(o)) if (f.toLowerCase() === k && String(o[f] ?? '').trim()) return String(o[f]).trim(); return ''; };
const proper = s => s.toLowerCase().replace(/(^|[\\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\\bMc([a-z])/g, (m, c) => 'Mc' + c.toUpperCase());
const toE164 = raw => {
  let s = raw.replace(/[^\\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    const cc = String(cfg.default_country_code);
    s = cc === '1' ? (s.length === 10 ? '+1' + s : s.length === 11 && s.startsWith('1') ? '+' + s : '') : '+' + cc + s.replace(/^0/, '');
  }
  return /^\\+[1-9]\\d{9,14}$/.test(s) ? s : null;
};
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const batch = new Set();
const out = [];
for (const { json } of $input.all()) {
  const raw = json.raw || {};
  const errors = [], notes = [];
  let first = pick(raw, ['first_name', 'firstname', 'first name']), last = pick(raw, ['last_name', 'lastname', 'last name', 'surname']);
  const full = pick(raw, ['name', 'full_name', 'fullname', 'your name']);
  if (!first && full) { const parts = full.split(/\\s+/); first = parts.shift(); last = last || parts.join(' '); }
  first = proper(first); last = proper(last);
  let email = pick(raw, ['email', 'email_address', 'e-mail']).toLowerCase();
  const rawPhone = pick(raw, ['phone', 'tel', 'mobile', 'phone_number']);
  const company = pick(raw, ['company', 'organisation', 'organization']);
  const message = pick(raw, ['message', 'comments', 'notes']);
  if (String(raw[cfg.honeypot_field] ?? '').trim()) errors.push('spam: honeypot field filled');
  if ((message.match(/https?:\\/\\//g) || []).length > cfg.max_links_in_message) errors.push('spam: too many links in message');
  for (const f of cfg.required_fields) if (f === 'name' ? !first : !pick(raw, [f])) errors.push(f + ' is required');
  if (email) {
    const at = email.split('@');
    if (at.length === 2) {
      const labels = at[1].split('.');
      const name = labels.length > 1 ? labels[labels.length - 2] : '';
      if (cfg.domain_typos[name]) {
        labels[labels.length - 2] = cfg.domain_typos[name];
        notes.push('email domain ' + at[1] + ' corrected to ' + labels.join('.'));
        email = at[0] + '@' + labels.join('.');
      }
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[a-z]{2,}$/i.test(email)) errors.push('email is not valid');
    else if (cfg.disposable_providers.includes(email.split('@')[1].split('.').slice(-2, -1)[0])) errors.push('disposable email domain');
  }
  let phone = '';
  if (rawPhone) { const p = toE164(rawPhone); if (p === null) errors.push('phone is not a valid number'); else phone = p; }
  if (!email && !phone && !rawPhone) errors.push('email or phone is required');
  const key = hash((email || '-') + '|' + (phone || '-'));
  const emailKey = email ? hash('e|' + email) : '', phoneKey = phone ? hash('p|' + phone) : '';
  const dup = !errors.length && [emailKey, phoneKey].some(k => k && (seen[k] || batch.has(k)));
  const status = errors.length ? 'rejected' : dup ? 'duplicate' : 'accepted';
  if (status === 'accepted') {
    [emailKey, phoneKey].filter(Boolean).forEach(k => { batch.add(k); if (cfg.live) seen[k] = now; });
  }
  out.push({ status, errors, notes, lead_id: 'L-' + key, lead: { first_name: first, last_name: last, email, phone, company: company ? proper(company) : '',
    message, source: pick(raw, ['source', 'utm_source']) || 'web', received_at: json.received_at } });
}
memory.lead_hashes = seen;
return out.map(json => ({ json }));`),
    switchOn('Route by result', '$json.status', ['accepted', 'duplicate', 'rejected']),
    stop('STOP: unexpected result'),
    respond('Reply 200 accepted', 'JSON.stringify({ ok: true, lead_id: $json.lead_id, notes: $json.notes })'),
    respond('Reply 200 duplicate', 'JSON.stringify({ ok: true, duplicate: true, lead_id: $json.lead_id })'),
    stop('STOP: duplicate not forwarded'),
    respond('Reply 422 with reasons', 'JSON.stringify({ ok: false, errors: $json.errors })', 422),
    ifWhen('Forward to the CRM?', [[cfg('live'), 'true'], [cfg('crm_enabled'), 'true']]),
    stop('STOP: not live - lead not forwarded'),
    http('Post the lead to the CRM webhook', { method: 'POST', url: `={{ ${cfg('crm_webhook_url')} }}`, auth: 'none', jsonBody: 'JSON.stringify({ ...$json.lead, lead_id: $json.lead_id })' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Receive a lead', 'config'],
    ['config', 'Read the incoming lead'],
    ['Read the incoming lead', 'Lead received?'],
    ['Lead received?', 0, 'Combine lead sources'], ['Lead received?', 1, 'Load sample leads'],
    ['Load sample leads', 0, 'Combine lead sources', 1],
    ['Combine lead sources', 'Validate and normalise each lead'],
    ['Validate and normalise each lead', 'Route by result'],
    ['Route by result', 0, 'Reply 200 accepted'], ['Route by result', 1, 'Reply 200 duplicate'], ['Route by result', 2, 'Reply 422 with reasons'], ['Route by result', 3, 'STOP: unexpected result'],
    ['Reply 200 duplicate', 'STOP: duplicate not forwarded'],
    ['Reply 200 accepted', 'Forward to the CRM?'],
    ['Forward to the CRM?', 0, 'Post the lead to the CRM webhook'], ['Forward to the CRM?', 1, 'STOP: not live - lead not forwarded'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Forms post to `Receive a lead`, which waits for a reply node so the form learns the outcome. Typo and disposable lists, the dedupe window and required fields all live in `config`.', nodes: ['Run manually', 'Receive a lead', 'config'] },
    { title: 'Read the lead', why: '`Read the incoming lead` rejects an empty body before any rule runs. A manual run uses `Load sample leads`, seven leads that between them trip every rule once.', nodes: ['Read the incoming lead', 'Lead received?', 'Load sample leads', 'Combine lead sources'] },
    { title: 'Validate, dedupe and reply', why: 'All reasons are collected, not just the first, so a form can highlight every bad field in one round trip. Typos are fixed before the disposable check, and duplicates get a 200 so the visitor sees no error.', nodes: ['Validate and normalise each lead', 'Route by result', 'Reply 200 accepted', 'Reply 200 duplicate', 'Reply 422 with reasons', 'STOP: unexpected result', 'STOP: duplicate not forwarded'] },
    { title: 'Forward clean leads', why: 'The reply goes out before the CRM call, so a slow CRM never delays the form. Forwarding needs a live run and a `CRM_WEBHOOK_URL`; otherwise the lead ends at the STOP with its normalised fields visible.', nodes: ['Forward to the CRM?', 'STOP: not live - lead not forwarded', 'Post the lead to the CRM webhook'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample leads)', start: 'Run manually',
      expect: { reached: ['Load sample leads', 'Reply 422 with reasons', 'STOP: duplicate not forwarded', 'STOP: not live - lead not forwarded'], outward: 'none' },
      check: out => {
        const r = out['Validate and normalise each lead'];
        const f: string[] = [];
        const st = r.map((x: any) => x.status).join(',');
        if (st !== 'accepted,rejected,rejected,rejected,rejected,duplicate,accepted') f.push(`statuses wrong: ${st}`);
        const john = r[0].lead;
        if (john.first_name !== 'John' || john.last_name !== "O'Neill") f.push(`name casing: ${john.first_name} ${john.last_name}`);
        if (john.email !== 'john.oneill@gmail.example') f.push(`gmial typo should be fixed: ${john.email}`);
        if (john.phone !== '+12125550142') f.push('phone should be E.164');
        if (!r[1].errors.includes('disposable email domain')) f.push('mailinator should be rejected');
        if (!r[2].errors.includes('email or phone is required')) f.push('Mia has no contact details');
        if (!r[3].errors.includes('email is not valid')) f.push('ana@@ is not a valid email');
        if (!r[4].errors.includes('spam: honeypot field filled')) f.push('honeypot should catch the bot');
        if (r[6].lead.last_name !== 'Smith-Jones' || r[6].lead.phone !== '+16465550123') f.push('Dana: hyphenated surname and +1 phone');
        return f;
      },
    },
    {
      name: 'live webhook lead forwarded', start: 'Receive a lead',
      overrides: { TEST_RUN: false, CRM_WEBHOOK_URL: 'https://crm.example/hooks/inbound-leads' },
      input: [{ headers: { 'content-type': 'application/json' }, params: {}, query: {}, body: { name: 'priya natarajan', email: 'Priya@Northwind.example', phone: '646 555 0150', company: 'northwind', utm_source: 'linkedin' } }],
      mocks: { 'Post the lead to the CRM webhook': [{ id: 'crm-991', status: 'created' }] },
      expect: { reached: ['Reply 200 accepted', 'Post the lead to the CRM webhook'], notReached: ['Load sample leads', 'Reply 422 with reasons'], outward: 'some' },
      check: out => {
        const l = out['Validate and normalise each lead'][0].lead;
        const f: string[] = [];
        if (l.first_name !== 'Priya' || l.email !== 'priya@northwind.example' || l.phone !== '+16465550150' || l.source !== 'linkedin') f.push(`normalised lead wrong: ${JSON.stringify(l)}`);
        return f;
      },
    },
    {
      name: 'bad webhook lead gets 422', start: 'Receive a lead',
      overrides: { TEST_RUN: false, CRM_WEBHOOK_URL: 'https://crm.example/hooks/inbound-leads' },
      input: [{ headers: {}, params: {}, query: {}, body: { email: 'someone@yopmail.example', phone: '12' } }],
      expect: { reached: ['Reply 422 with reasons'], notReached: ['Post the lead to the CRM webhook'], outward: 'none' },
      check: out => {
        const e = out['Validate and normalise each lead'][0].errors.join('|');
        return e === 'name is required|disposable email domain|phone is not a valid number' ? [] : [`all three reasons expected, got ${e}`];
      },
    },
  ],
});
