import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, stop, http, gmail, merge } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const typeform = (answers: any[], o: { submitted?: string; event?: string } = {}) => ({
  headers: { 'content-type': 'application/json', 'typeform-signature': 'sha256=sample' }, params: {}, query: {},
  body: { event_id: o.event || '01JX0SAMPLE', event_type: 'form_response', form_response: {
    form_id: 'aBcD12', token: 'tok123', submitted_at: o.submitted || new Date().toISOString(), hidden: { utm_source: 'g2' },
    definition: { id: 'aBcD12', title: 'Book a demo', fields: [] }, answers } },
});
const ans = {
  text: (ref: string, text: string) => ({ type: 'text', text, field: { id: 'f_' + ref, type: 'short_text', ref } }),
  email: (ref: string, email: string) => ({ type: 'email', email, field: { id: 'f_' + ref, type: 'email', ref } }),
  choice: (ref: string, label: string) => ({ type: 'choice', choice: { id: 'c1', label }, field: { id: 'f_' + ref, type: 'multiple_choice', ref } }),
};
const jonas = () => [ans.text('first_name', 'Jonas'), ans.text('last_name', 'Weber'), ans.email('work_email', 'Jonas.Weber@rheinwerk.example'), ans.text('company', 'Rheinwerk AG'),
  ans.choice('company_size', '1,000-5,000'), ans.choice('country', 'Germany'), ans.text('use_case', 'Field service scheduling')];
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

export default defineSpec({
  slug: 'typeform-demo-request-router',
  title: 'Route Typeform demo requests to Airtable by company size and region',
  summary: 'Takes each Typeform demo request from a webhook, checks Airtable for a repeat or a retried delivery, sets a size tier and sales region, picks the owner from a routing table, works out a respond-by time in that region\'s business hours, confirms to the requester, alerts the owner, and adds or updates the Airtable record.',
  category: 'Sales and CRM',
  description: {
    who: 'Sales and marketing teams that collect demo requests in Typeform and sort them by hand into a shared Airtable base. Each request lands with the right owner within seconds, with a deadline that respects their working hours.',
    how: [
      'Typeform posts each submission to the webhook. A manual run uses a sample submission. Answers are read by field ref, so reordering the form does not break anything.',
      'Airtable is searched for earlier requests from the same email. A retried delivery of the same Typeform event stops here. A repeat within `REPEAT_WINDOW_DAYS` goes back to the owner who already has it, and if the lookup fails the request carries on with a flag.',
      'Company size picks the tier, country picks the region, and `ROUTING` picks the owner. Missing and disposable emails are rejected.',
      'A respond-by time is counted in the region\'s business hours from `RESPONSE_SLA_HOURS`, so a Friday evening request is due Monday morning, not Saturday.',
      'The requester gets a confirmation, the owner of a sales-led tier gets a heads-up with the deadline, and Airtable gets a new record or an update to the earlier one.',
    ],
    setup: [
      'Run it once from `Run manually`. It routes a sample request against sample Airtable history and stops at `STOP: preview - nothing sent`.',
      'In Typeform, set a ref on each question that matches `FIELD_REFS`, then add the production URL of `Typeform demo request` as a webhook.',
      'Add an Airtable token credential to the three Airtable nodes and fill `AIRTABLE_BASE_ID`. The table needs Email, Owner, Submitted at and Typeform event fields. Connect Gmail.',
      'Put your address in `TEST_EMAIL` to receive both emails yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Typeform account with webhooks', 'An Airtable base with a Demo requests table', 'A Gmail account'],
    customize: [
      '`SIZE_TIERS`, `REGIONS` and `ROUTING` change the cut-offs, country lists and owners.',
      '`BUSINESS_HOURS`, `WORK_DAYS` and `RESPONSE_SLA_HOURS` set the deadline maths. A tier with no SLA gets no owner alert.',
      '`REPEAT_WINDOW_DAYS` sets how long a repeat request stays with the same owner.',
    ],
  },
  config: {
    intro: ['A manual run uses a SAMPLE submission. AIRTABLE_BASE_ID blank -> SAMPLE request history and nothing is written to Airtable.', 'Routing is a table lookup on tier and region; * matches any region. Respond-by times count only business hours.'],
    consts: [
      { name: 'FIELD_REFS', value: { first_name: 'first_name', last_name: 'last_name', email: 'work_email', company: 'company', size: 'company_size', country: 'country', use_case: 'use_case' }, note: 'our field -> Typeform question ref' },
      { name: 'SIZE_TIERS', value: [{ tier: 'Enterprise', min: 1000 }, { tier: 'Mid-market', min: 50 }, { tier: 'SMB', min: 0 }], note: 'checked top to bottom on the lower bound of the size answer' },
      { name: 'REGIONS', value: {
        AMER: ['US', 'United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia'],
        EMEA: ['United Kingdom', 'Ireland', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Norway', 'Denmark', 'Poland', 'Austria', 'Switzerland', 'South Africa', 'United Arab Emirates', 'Israel'],
        APAC: ['Australia', 'New Zealand', 'Japan', 'Singapore', 'India', 'South Korea', 'Indonesia', 'Philippines'],
      }, note: 'region -> country names as they appear in the form' },
      { name: 'ROUTING', value: {
        'Enterprise|AMER': { owner: 'Maya Ortiz', email: 'maya@yourcompany.example', link: 'https://calendly.com/yourcompany/maya' },
        'Enterprise|EMEA': { owner: 'Lena Fox', email: 'lena@yourcompany.example', link: 'https://calendly.com/yourcompany/lena' },
        'Enterprise|*': { owner: 'Ravi Shah', email: 'ravi@yourcompany.example', link: 'https://calendly.com/yourcompany/ravi' },
        'Mid-market|*': { owner: 'Theo Grant', email: 'theo@yourcompany.example', link: 'https://calendly.com/yourcompany/theo' },
        'SMB|*': { owner: 'Self-serve team', email: 'hello@yourcompany.example', link: 'https://calendly.com/yourcompany/group-demo' },
      }, note: "'tier|region' -> owner; 'tier|*' is the fallback for that tier" },
      { name: 'RESPONSE_SLA_HOURS', value: { Enterprise: 2, 'Mid-market': 8 }, note: 'business hours the owner has to reply, per tier; a tier not listed gets no owner alert' },
      { name: 'BUSINESS_HOURS', value: {
        AMER: { tz: 'America/New_York', start: 9, end: 17 }, EMEA: { tz: 'Europe/Berlin', start: 9, end: 17 },
        APAC: { tz: 'Asia/Singapore', start: 9, end: 17 }, Other: { tz: 'UTC', start: 9, end: 17 },
      }, note: 'region -> timezone and working hours used for the respond-by time' },
      { name: 'WORK_DAYS', value: [1, 2, 3, 4, 5], note: 'working weekdays, 1 = Monday ... 7 = Sunday' },
      { name: 'REPEAT_WINDOW_DAYS', value: 30, note: 'a new request from an email seen in Airtable within this many days stays with the same owner and updates that record' },
      { name: 'FREE_EMAIL_DOMAINS', value: ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'proton.me'], note: 'accepted but flagged as personal' },
      { name: 'BLOCKED_DOMAINS', value: ['mailinator.com', 'tempmail.dev', 'guerrillamail.com'], note: 'disposable domains; the request is rejected' },
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank uses sample history and skips the write' },
      { name: 'AIRTABLE_TABLE', value: 'Demo requests', note: 'table that receives each request' },
      { name: 'SENDER_NAME', value: 'The Fieldnote team', note: 'sign-off on the confirmation' },
    ],
    flags: { airtable_enabled: "AIRTABLE_BASE_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Typeform demo request', 'typeform-demo-request'),
    code('Read answers by field ref', `
// Typeform answers are typed (text, email, choice, number...). Each is read by its
// field ref through FIELD_REFS, so question order and wording can change freely.
const cfg = $('config').first().json;
let body = null;
try { body = $('Typeform demo request').first().json.body; } catch (e) { body = null; }
if (!body) body = { event_id: 'sample', form_response: { submitted_at: new Date().toISOString(), hidden: { utm_source: 'newsletter' }, answers: [
  { type: 'text', text: 'Dana', field: { ref: 'first_name' } }, { type: 'text', text: 'Cole', field: { ref: 'last_name' } },
  { type: 'email', email: 'dana@pinecrest-health.example', field: { ref: 'work_email' } }, { type: 'text', text: 'Pinecrest Health', field: { ref: 'company' } },
  { type: 'choice', choice: { label: '201-1000' }, field: { ref: 'company_size' } }, { type: 'choice', choice: { label: 'Canada' }, field: { ref: 'country' } },
  { type: 'long_text', text: 'Scheduling for 14 clinics, currently on paper', field: { ref: 'use_case' } },
] } };
const fr = body.form_response || {};
const byRef = {};
for (const a of fr.answers || []) {
  const v = a.type === 'choice' ? a.choice?.label ?? a.choice?.other : a.type === 'choices' ? (a.choices?.labels || []).join(', ') : a[a.type] ?? a.text;
  byRef[a.field?.ref] = v;
}
const get = k => String(byRef[cfg.field_refs[k]] ?? '').trim();
return [{ json: { event_id: body.event_id || '', submitted_at: fr.submitted_at || new Date().toISOString(), first_name: get('first_name'), last_name: get('last_name'), email: get('email').toLowerCase(),
  company: get('company'), size_answer: get('size'), country: get('country'), use_case: get('use_case'), utm_source: fr.hidden?.utm_source || '' } }];`),
    ifTrue('Airtable connected?', cfg('airtable_enabled')),
    http('Find earlier requests in Airtable', {
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`, auth: 'airtableTokenApi',
      query: { filterByFormula: `={{ "LOWER(Email) = '" + $json.email.replace(/'/g, '') + "'" }}`, maxRecords: '20' },
      continueOnError: true,
    }),
    code('Load sample earlier requests', `
// Used until AIRTABLE_BASE_ID is set: one earlier request from someone else, in Airtable's shape.
const at = new Date(Date.now() - 12 * 864e5).toISOString();
return [{ json: { records: [
  { id: 'recSample1', createdTime: at, fields: { Email: 'olu@harbourline.example', Owner: 'Theo Grant', 'Typeform event': '01JWSAMPLE', 'Submitted at': at } },
] } }];`),
    merge('Combine request history'),
    code('Check for repeats', `
// Same Typeform event already recorded -> a retried delivery, stop. Same email inside
// REPEAT_WINDOW_DAYS -> a repeat: keep the earlier owner and update that record.
// A failed lookup arrives as an error item; it becomes a flag so the lead is still routed.
const cfg = $('config').first().json;
const r = $('Read answers by field ref').first().json;
const j = $input.first()?.json || {};
const h = j.error ? { records: [], lookup_failed: String(j.error.message || j.error).slice(0, 120) } : { lookup_failed: '',
  records: (j.records || []).map(x => ({ id: x.id, email: String(x.fields?.Email || '').toLowerCase(), owner: x.fields?.Owner || '',
    event: x.fields?.['Typeform event'] || '', submitted_at: x.fields?.['Submitted at'] || x.createdTime || '' })) };
const mine = h.records.filter(x => x.email === r.email).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
const duplicate = Boolean(r.event_id) && r.event_id !== 'sample' && mine.some(x => x.event === r.event_id);
const recent = mine.find(x => x.submitted_at && (Date.now() - new Date(x.submitted_at).getTime()) / 864e5 <= cfg.repeat_window_days);
return [{ json: { ...r, duplicate, repeat_of: recent && !duplicate ? recent.id : '', previous_owner: recent ? recent.owner : '',
  previous_at: recent ? recent.submitted_at : '', lookup_failed: h.lookup_failed } }];`),
    ifTrue('New submission?', '!$json.duplicate'),
    stop('STOP: duplicate delivery - already recorded'),
    code('Route by size and region', `
// Size answers look like "51-200", "1000+" or a bare number; the lower bound decides
// the tier. Region comes from the country list, owner from ROUTING with a * fallback.
// A repeat stays with its earlier owner while that owner still covers the tier.
const cfg = $('config').first().json;
const r = $input.first().json;
const low = (() => { const m = r.size_answer.replace(/,/g, '').match(/\\d+/); return m ? Number(m[0]) : null; })();
const tier = low === null ? 'SMB' : cfg.size_tiers.find(t => low >= t.min).tier;
const region = Object.keys(cfg.regions).find(k => cfg.regions[k].some(c => c.toLowerCase() === r.country.toLowerCase())) || 'Other';
let route = cfg.routing[tier + '|' + region] || cfg.routing[tier + '|*'];
const domain = r.email.split('@')[1] || '';
const flags = [];
if (r.repeat_of) {
  const kept = Object.entries(cfg.routing).find(([k, x]) => k.startsWith(tier + '|') && x.owner === r.previous_owner);
  if (kept && kept[1].owner !== route.owner) { route = kept[1]; flags.push('repeat request, kept with ' + route.owner); }
  else flags.push('repeat request');
}
if (r.lookup_failed) flags.push('Airtable lookup failed, repeat check skipped');
if (low === null) flags.push('no company size, treated as SMB');
if (region === 'Other') flags.push('country not in REGIONS');
if (cfg.free_email_domains.includes(domain)) flags.push('personal email address');
const reject = !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(r.email) ? 'no valid email' : cfg.blocked_domains.includes(domain) ? 'disposable email domain' : '';
return [{ json: { ...r, tier, region, owner: route.owner, owner_email: route.email, meeting_link: route.link, flags, reject } }];`),
    ifTrue('Valid request?', "$json.reject === ''"),
    stop('STOP: rejected request'),
    code('Work out the respond-by time', `
// Walks forward from the submission in 15-minute steps, counting only steps inside the
// region's working hours and WORK_DAYS, until RESPONSE_SLA_HOURS are used up.
const cfg = $('config').first().json;
const r = $input.first().json;
const hours = Number(cfg.response_sla_hours[r.tier] || 0);
const bh = cfg.business_hours[r.region] || cfg.business_hours.Other;
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: bh.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const isOpen = t => {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  const mins = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return cfg.work_days.includes(dow) && mins >= bh.start * 60 && mins < bh.end * 60;
};
const STEP = 15 * 60e3;
const submitted = new Date(r.submitted_at).getTime();
let t = Math.ceil(submitted / STEP) * STEP, left = hours * 4, guard = 0;
while (left > 0 && guard++ < 4 * 24 * 21) { if (isOpen(t)) left--; t += STEP; }
const respond_by = hours > 0 ? new Date(t).toISOString() : '';
const local = respond_by ? new Date(t).toLocaleString('en-US', { timeZone: bh.tz, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' ' + bh.tz : '';
return [{ json: { ...r, sla_hours: hours, respond_by, respond_by_local: local, arrived_out_of_hours: !isOpen(submitted) } }];`),
    code('Write the confirmation email', `
// SMB gets a group demo link straight away; larger tiers are told who will reach out.
// The owner heads-up carries the deadline in the owner's own timezone.
const cfg = $('config').first().json;
const r = $input.first().json;
const next = r.tier === 'SMB'
  ? 'The quickest way to see it is our live group demo. Pick a slot that suits you: ' + r.meeting_link
  : r.owner + ' looks after ' + r.tier.toLowerCase() + ' teams in ' + r.region + ' and will be in touch within one business day. If you would rather pick a time now: ' + r.meeting_link;
const body = ['Hi ' + (r.first_name || 'there') + ',', '', 'Thanks for asking for a demo' + (r.company ? ' for ' + r.company : '') + '.', '', next, '', cfg.sender_name].join('\\n');
const owner_body = [
  r.tier + ' demo request routed to you' + (r.repeat_of ? ' (repeat, earlier request ' + String(r.previous_at).slice(0, 10) + ')' : '') + '.', '',
  'Reply by: ' + (r.respond_by_local || 'no SLA for this tier') + (r.arrived_out_of_hours ? ' (arrived outside working hours)' : ''), '',
  'Name: ' + (r.first_name + ' ' + r.last_name).trim(), 'Email: ' + r.email, 'Company: ' + (r.company || '-') + ' (' + (r.size_answer || 'size not given') + ')',
  'Country: ' + r.country + ' / ' + r.region, 'Use case: ' + (r.use_case || '-'), 'Source: ' + (r.utm_source || '-'),
  ...(r.flags.length ? ['', 'Flags: ' + r.flags.join('; ')] : []),
].join('\\n');
const test = cfg.mode === 'test';
return [{ json: { ...r, subject: 'Your demo request' + (r.company ? ' for ' + r.company : ''), body, send_to: test ? cfg.test_email : r.email,
  owner_subject: (test ? '[TEST to ' + r.owner_email + '] ' : '') + r.tier + ' demo: ' + (r.company || r.email) + (r.respond_by_local ? ', reply by ' + r.respond_by_local : ''),
  owner_body, owner_send_to: test ? cfg.test_email : r.owner_email } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Send the confirmation', { to: "$('Write the confirmation email').first().json.send_to", subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $('Write the confirmation email').first().json.email + '] ' : '') + $('Write the confirmation email').first().json.subject", message: "$('Write the confirmation email').first().json.body" }),
    ifTrue('Owner reply due?', "$('Write the confirmation email').first().json.sla_hours > 0"),
    gmail.send('Email the owner a heads-up', { to: "$('Write the confirmation email').first().json.owner_send_to", subject: "$('Write the confirmation email').first().json.owner_subject", message: "$('Write the confirmation email').first().json.owner_body" }),
    stop('STOP: self-serve tier - no owner alert'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - Airtable untouched'),
    ifTrue('Airtable base set?', cfg('airtable_enabled')),
    stop('STOP: no Airtable base'),
    ifTrue('Repeat of an earlier request?', "$('Write the confirmation email').first().json.repeat_of !== ''"),
    http('Update the earlier request in Airtable', {
      method: 'PATCH', url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) + '/' + $('Write the confirmation email').first().json.repeat_of }}`, auth: 'airtableTokenApi',
      jsonBody: "JSON.stringify({ typecast: true, fields: (r => ({ Owner: r.owner, 'Use case': r.use_case, Flags: r.flags.join('; '), 'Respond by': r.respond_by || null, 'Last requested at': r.submitted_at, 'Typeform event': r.event_id }))($('Write the confirmation email').first().json) })",
    }),
    http('Add the request to Airtable', {
      method: 'POST', url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`, auth: 'airtableTokenApi',
      jsonBody: "JSON.stringify({ typecast: true, records: [{ fields: (r => ({ Name: (r.first_name + ' ' + r.last_name).trim(), Email: r.email, Company: r.company, 'Company size': r.size_answer, Tier: r.tier, Country: r.country, Region: r.region, Owner: r.owner, 'Use case': r.use_case, Source: r.utm_source, Flags: r.flags.join('; '), 'Respond by': r.respond_by || null, 'Submitted at': r.submitted_at, 'Typeform event': r.event_id }))($('Write the confirmation email').first().json) }] })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Typeform demo request', 'config'],
    ['config', 'Read answers by field ref'],
    ['Read answers by field ref', 'Airtable connected?'],
    ['Airtable connected?', 0, 'Find earlier requests in Airtable'], ['Airtable connected?', 1, 'Load sample earlier requests'],
    ['Find earlier requests in Airtable', 'Combine request history'], ['Load sample earlier requests', 0, 'Combine request history', 1],
    ['Combine request history', 'Check for repeats'],
    ['Check for repeats', 'New submission?'],
    ['New submission?', 0, 'Route by size and region'], ['New submission?', 1, 'STOP: duplicate delivery - already recorded'],
    ['Route by size and region', 'Valid request?'],
    ['Valid request?', 0, 'Work out the respond-by time'], ['Valid request?', 1, 'STOP: rejected request'],
    ['Work out the respond-by time', 'Write the confirmation email'],
    ['Write the confirmation email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send the confirmation'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Send the confirmation', 'Owner reply due?'],
    ['Owner reply due?', 0, 'Email the owner a heads-up'], ['Owner reply due?', 1, 'STOP: self-serve tier - no owner alert'],
    ['Send the confirmation', 'Live run?'],
    ['Live run?', 0, 'Airtable base set?'], ['Live run?', 1, 'STOP: test send - Airtable untouched'],
    ['Airtable base set?', 0, 'Repeat of an earlier request?'], ['Airtable base set?', 1, 'STOP: no Airtable base'],
    ['Repeat of an earlier request?', 0, 'Update the earlier request in Airtable'], ['Repeat of an earlier request?', 1, 'Add the request to Airtable'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Typeform posts to the webhook on each submission; `Run manually` replays a sample. Tiers, regions, routing, working hours and SLAs all live in `config`.', nodes: ['Run manually', 'Typeform demo request', 'config', 'Read answers by field ref'] },
    { title: 'Check for repeats', why: 'Typeform retries a delivery it thinks failed, and people submit twice. `Check for repeats` stops a retried event and marks a repeat inside `REPEAT_WINDOW_DAYS`. `Find earlier requests in Airtable` carries on after an error, so a lookup failure becomes a flag, not a lost lead.', nodes: ['Airtable connected?', 'Find earlier requests in Airtable', 'Load sample earlier requests', 'Combine request history', 'Check for repeats', 'New submission?', 'STOP: duplicate delivery - already recorded'] },
    { title: 'Route and set a deadline', why: 'Answers decide tier and region; a repeat keeps its earlier owner if that owner still covers the tier. `Work out the respond-by time` counts only working minutes in the region\'s timezone, so weekends and nights do not eat the SLA.', nodes: ['Route by size and region', 'Valid request?', 'STOP: rejected request', 'Work out the respond-by time'] },
    { title: 'Confirm and alert the owner', why: 'The requester hears the next step for their tier. Sales-led tiers also email the owner with the deadline in their own timezone. A test send goes to `TEST_EMAIL` with the real recipient in the subject.', nodes: ['Write the confirmation email', 'Sending switched on?', 'STOP: preview - nothing sent', 'Send the confirmation', 'Live run?', 'Owner reply due?', 'STOP: test send - Airtable untouched', 'Email the owner a heads-up', 'STOP: self-serve tier - no owner alert'] },
    { title: 'Add or update in Airtable', why: 'Only a live run writes, and only with `AIRTABLE_BASE_ID` set. A repeat updates the earlier record instead of adding a second row for the same person, so the table stays one row per open request.', nodes: ['Airtable base set?', 'STOP: no Airtable base', 'Repeat of an earlier request?', 'Update the earlier request in Airtable', 'Add the request to Airtable'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample earlier requests', 'Work out the respond-by time', 'STOP: preview - nothing sent'], notReached: ['Find earlier requests in Airtable'], outward: 'none' },
      check: out => {
        const r = out['Work out the respond-by time'][0];
        const f: string[] = [];
        if (r.tier !== 'Mid-market' || r.region !== 'AMER' || r.owner !== 'Theo Grant') f.push(`sample should route Mid-market/AMER to Theo, got ${r.tier}/${r.region}/${r.owner}`);
        if (r.flags.length || r.repeat_of) f.push(`no flags or repeat expected, got ${r.flags} ${r.repeat_of}`);
        if (r.sla_hours !== 8 || !r.respond_by || r.respond_by <= r.submitted_at) f.push(`an 8-hour respond-by after submission expected, got ${r.respond_by}`);
        if (!out['Write the confirmation email'][0].body.includes('Theo Grant looks after mid-market teams in AMER')) f.push('confirmation wording wrong');
        return f;
      },
    },
    {
      name: 'enterprise request from Germany on a Friday afternoon, live', start: 'Typeform demo request',
      input: [typeform(jonas(), { submitted: '2026-10-23T14:00:00Z' })],
      overrides: { TEST_RUN: false, AIRTABLE_BASE_ID: 'appDemo123' },
      mocks: {
        'Find earlier requests in Airtable': [{ records: [] }],
        'Send the confirmation': [{ id: 'msg_1', labelIds: ['SENT'] }],
        'Email the owner a heads-up': [{ id: 'msg_2', labelIds: ['SENT'] }],
        'Add the request to Airtable': [{ records: [{ id: 'recA1', fields: {} }] }],
      },
      expect: { reached: ['Send the confirmation', 'Email the owner a heads-up', 'Add the request to Airtable'], notReached: ['Update the earlier request in Airtable'], outward: 'some' },
      check: out => {
        const r = out['Write the confirmation email'][0];
        const f: string[] = [];
        if (r.tier !== 'Enterprise' || r.region !== 'EMEA' || r.owner !== 'Lena Fox') f.push(`should route Enterprise/EMEA to Lena, got ${r.tier}/${r.region}/${r.owner}`);
        if (r.send_to !== 'jonas.weber@rheinwerk.example' || r.owner_send_to !== 'lena@yourcompany.example') f.push('live sends should go to the lowercased requester and to Lena');
        // Friday 16:00 Berlin + 2 business hours = 1h Friday + 1h Monday -> Monday 10:00 CET (09:00Z)
        if (r.respond_by !== '2026-10-26T09:00:00.000Z') f.push(`respond-by should be Monday 10:00 Berlin, got ${r.respond_by}`);
        if (!r.owner_subject.includes('reply by Mon')) f.push(`owner subject should name Monday, got ${r.owner_subject}`);
        return f;
      },
    },
    {
      name: 'repeat request stays with its earlier owner and updates the record', start: 'Typeform demo request',
      input: [typeform(jonas(), { event: '01JX0SECOND' })],
      overrides: { TEST_RUN: false, AIRTABLE_BASE_ID: 'appDemo123' },
      mocks: {
        'Find earlier requests in Airtable': [{ records: [{ id: 'recOld7', createdTime: daysAgo(10), fields: { Email: 'jonas.weber@rheinwerk.example', Owner: 'Ravi Shah', 'Typeform event': '01JX0FIRST', 'Submitted at': daysAgo(10) } }] }],
        'Send the confirmation': [{ id: 'msg_1' }],
        'Email the owner a heads-up': [{ id: 'msg_2' }],
        'Update the earlier request in Airtable': [{ id: 'recOld7', fields: {} }],
      },
      expect: { reached: ['Update the earlier request in Airtable', 'Email the owner a heads-up'], notReached: ['Add the request to Airtable'], outward: 'some' },
      check: out => {
        const r = out['Write the confirmation email'][0];
        return r.owner === 'Ravi Shah' && r.repeat_of === 'recOld7' && r.flags.includes('repeat request, kept with Ravi Shah') ? [] : [`repeat should stay with Ravi and point at recOld7, got ${r.owner} ${r.repeat_of} ${r.flags}`];
      },
    },
    {
      name: 'retried delivery of the same event stops', start: 'Typeform demo request',
      input: [typeform(jonas(), { event: '01JX0FIRST' })],
      overrides: { TEST_RUN: false, AIRTABLE_BASE_ID: 'appDemo123' },
      mocks: {
        'Find earlier requests in Airtable': [{ records: [{ id: 'recOld7', fields: { Email: 'jonas.weber@rheinwerk.example', Owner: 'Lena Fox', 'Typeform event': '01JX0FIRST', 'Submitted at': daysAgo(0.01) } }] }],
      },
      expect: { reached: ['STOP: duplicate delivery - already recorded'], notReached: ['Route by size and region', 'Send the confirmation'], outward: 'none' },
    },
    {
      name: 'failed lookup is flagged and SMB gets no owner alert', start: 'Typeform demo request',
      input: [typeform([ans.text('first_name', 'Ana'), ans.email('work_email', 'ana@brightloop.example'), ans.choice('company_size', '11-50'), ans.choice('country', 'Australia')])],
      overrides: { TEST_RUN: false, AIRTABLE_BASE_ID: 'appDemo123' },
      mocks: {
        'Find earlier requests in Airtable': [{ error: { message: 'Request failed with status code 503' } }],
        'Send the confirmation': [{ id: 'msg_1' }],
        'Add the request to Airtable': [{ records: [{ id: 'recA2', fields: {} }] }],
      },
      expect: { reached: ['STOP: self-serve tier - no owner alert', 'Add the request to Airtable'], notReached: ['Email the owner a heads-up'], outward: 'some' },
      check: out => {
        const r = out['Write the confirmation email'][0];
        return r.tier === 'SMB' && r.flags.includes('Airtable lookup failed, repeat check skipped') && r.respond_by === '' ? [] : [`expected SMB with lookup flag and no deadline, got ${r.tier} ${r.flags} ${r.respond_by}`];
      },
    },
    {
      name: 'disposable email is rejected', start: 'Typeform demo request',
      input: [typeform([ans.text('first_name', 'Sam'), ans.email('work_email', 'sam@mailinator.com'), ans.choice('company_size', '1-10'), ans.choice('country', 'Japan')])],
      expect: { reached: ['STOP: rejected request'], notReached: ['Write the confirmation email'], outward: 'none' },
      check: out => {
        const r = out['Route by size and region'][0];
        return r.reject === 'disposable email domain' && r.tier === 'SMB' && r.region === 'APAC' ? [] : [`expected rejected SMB/APAC, got ${r.reject} ${r.tier} ${r.region}`];
      },
    },
  ],
});
