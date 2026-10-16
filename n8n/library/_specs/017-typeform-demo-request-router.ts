import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const typeform = (answers: any[]) => ({
  headers: { 'content-type': 'application/json', 'typeform-signature': 'sha256=sample' }, params: {}, query: {},
  body: { event_id: '01JX0SAMPLE', event_type: 'form_response', form_response: {
    form_id: 'aBcD12', token: 'tok123', submitted_at: new Date().toISOString(), hidden: { utm_source: 'g2' },
    definition: { id: 'aBcD12', title: 'Book a demo', fields: [] }, answers } },
});
const ans = {
  text: (ref: string, text: string) => ({ type: 'text', text, field: { id: 'f_' + ref, type: 'short_text', ref } }),
  email: (ref: string, email: string) => ({ type: 'email', email, field: { id: 'f_' + ref, type: 'email', ref } }),
  choice: (ref: string, label: string) => ({ type: 'choice', choice: { id: 'c1', label }, field: { id: 'f_' + ref, type: 'multiple_choice', ref } }),
};

export default defineSpec({
  slug: 'typeform-demo-request-router',
  title: 'Route Typeform demo requests to Airtable by company size and region',
  summary: 'Takes each Typeform demo request from a webhook, reads the answers by field ref, sets a size tier and sales region, picks the owner from a routing table, sends the requester a confirmation that names the next step, and adds the request to Airtable.',
  category: 'Sales and CRM',
  description: {
    who: 'Sales and marketing teams that collect demo requests in Typeform and sort them by hand into a shared Airtable base. Each request lands with the right owner within seconds, and the requester hears back straight away.',
    how: [
      'Typeform posts each submission to the webhook. A manual run uses a sample submission.',
      'Answers are read by field ref, not by position, so reordering the form does not break anything. Company size picks the tier: SMB under 50, Mid-market up to 999, Enterprise from 1,000.',
      'Country picks the region (AMER, EMEA, APAC), and `ROUTING` picks the owner for that tier and region. SMB requests go to self-serve with a booking link.',
      'Requests with no valid email, or from a disposable domain, are rejected. Personal email addresses are flagged. The confirmation goes out through Gmail and the request is added to Airtable.',
    ],
    setup: [
      'Run it once from `Run manually`. It routes a sample request and stops at `STOP: preview - nothing sent`.',
      'In Typeform, set a ref on each question that matches `FIELD_REFS`, then add the production URL of `Typeform demo request` as a webhook.',
      'Add an Airtable token credential to `Add the request to Airtable` and fill `AIRTABLE_BASE_ID`. Connect Gmail.',
      'Put your address in `TEST_EMAIL` to receive confirmations yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Typeform account with webhooks', 'An Airtable base with a Demo requests table', 'A Gmail account'],
    customize: [
      '`SIZE_TIERS` and `REGIONS` change the cut-offs and country lists.',
      '`ROUTING` maps each tier and region to an owner and meeting link.',
      '`FIELD_REFS` matches your own question refs.',
    ],
  },
  config: {
    intro: ['A manual run uses a SAMPLE submission. AIRTABLE_BASE_ID blank -> nothing is written to Airtable.', 'Routing is a table lookup on tier and region; * matches any region.'],
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
      { name: 'FREE_EMAIL_DOMAINS', value: ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'proton.me'], note: 'accepted but flagged as personal' },
      { name: 'BLOCKED_DOMAINS', value: ['mailinator.com', 'tempmail.dev', 'guerrillamail.com'], note: 'disposable domains; the request is rejected' },
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank skips the write' },
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
return [{ json: { event_id: body.event_id || '', submitted_at: fr.submitted_at, first_name: get('first_name'), last_name: get('last_name'), email: get('email').toLowerCase(),
  company: get('company'), size_answer: get('size'), country: get('country'), use_case: get('use_case'), utm_source: fr.hidden?.utm_source || '' } }];`),
    code('Route by size and region', `
// Size answers look like "51-200", "1000+" or a bare number; the lower bound decides
// the tier. Region comes from the country list, owner from ROUTING with a * fallback.
const cfg = $('config').first().json;
const r = $input.first().json;
const low = (() => { const m = r.size_answer.replace(/,/g, '').match(/\\d+/); return m ? Number(m[0]) : null; })();
const tier = low === null ? 'SMB' : cfg.size_tiers.find(t => low >= t.min).tier;
const region = Object.keys(cfg.regions).find(k => cfg.regions[k].some(c => c.toLowerCase() === r.country.toLowerCase())) || 'Other';
const route = cfg.routing[tier + '|' + region] || cfg.routing[tier + '|*'];
const domain = r.email.split('@')[1] || '';
const flags = [];
if (low === null) flags.push('no company size, treated as SMB');
if (region === 'Other') flags.push('country not in REGIONS');
if (cfg.free_email_domains.includes(domain)) flags.push('personal email address');
const reject = !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(r.email) ? 'no valid email' : cfg.blocked_domains.includes(domain) ? 'disposable email domain' : '';
return [{ json: { ...r, tier, region, owner: route.owner, owner_email: route.email, meeting_link: route.link, flags, reject } }];`),
    ifTrue('Valid request?', "$json.reject === ''"),
    stop('STOP: rejected request'),
    code('Write the confirmation email', `
// SMB gets a group demo link straight away; larger tiers are told who will reach out.
const cfg = $('config').first().json;
const r = $input.first().json;
const next = r.tier === 'SMB'
  ? 'The quickest way to see it is our live group demo. Pick a slot that suits you: ' + r.meeting_link
  : r.owner + ' looks after ' + r.tier.toLowerCase() + ' teams in ' + r.region + ' and will be in touch within one business day. If you would rather pick a time now: ' + r.meeting_link;
const body = ['Hi ' + (r.first_name || 'there') + ',', '', 'Thanks for asking for a demo' + (r.company ? ' for ' + r.company : '') + '.', '', next, '', cfg.sender_name].join('\\n');
return [{ json: { ...r, subject: 'Your demo request' + (r.company ? ' for ' + r.company : ''), body, send_to: cfg.mode === 'test' ? cfg.test_email : r.email } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Send the confirmation', { to: "$('Write the confirmation email').first().json.send_to", subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $('Write the confirmation email').first().json.email + '] ' : '') + $('Write the confirmation email').first().json.subject", message: "$('Write the confirmation email').first().json.body" }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - Airtable untouched'),
    ifTrue('Airtable base set?', cfg('airtable_enabled')),
    stop('STOP: no Airtable base'),
    http('Add the request to Airtable', {
      method: 'POST', url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`, auth: 'airtableTokenApi',
      jsonBody: "JSON.stringify({ typecast: true, records: [{ fields: (r => ({ Name: (r.first_name + ' ' + r.last_name).trim(), Email: r.email, Company: r.company, 'Company size': r.size_answer, Tier: r.tier, Country: r.country, Region: r.region, Owner: r.owner, 'Use case': r.use_case, Source: r.utm_source, Flags: r.flags.join('; '), 'Submitted at': r.submitted_at, 'Typeform event': r.event_id }))($('Write the confirmation email').first().json) }] })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Typeform demo request', 'config'],
    ['config', 'Read answers by field ref'],
    ['Read answers by field ref', 'Route by size and region'],
    ['Route by size and region', 'Valid request?'],
    ['Valid request?', 0, 'Write the confirmation email'], ['Valid request?', 1, 'STOP: rejected request'],
    ['Write the confirmation email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send the confirmation'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Send the confirmation', 'Live run?'],
    ['Live run?', 0, 'Airtable base set?'], ['Live run?', 1, 'STOP: test send - Airtable untouched'],
    ['Airtable base set?', 0, 'Add the request to Airtable'], ['Airtable base set?', 1, 'STOP: no Airtable base'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Typeform posts to the webhook on each submission; `Run manually` replays a sample. Tiers, regions and the routing table all live in `config`.', nodes: ['Run manually', 'Typeform demo request', 'config'] },
    { title: 'Read and route', why: 'Answers are matched by field ref, so the form can be reworded without touching the workflow. `Valid request?` rejects missing and disposable emails before anything is sent.', nodes: ['Read answers by field ref', 'Route by size and region', 'Valid request?', 'STOP: rejected request'] },
    { title: 'Confirm to the requester', why: 'The email names the next step for that tier, a group demo for SMB or a named owner for larger teams. A test send goes to `TEST_EMAIL` with the real address in the subject.', nodes: ['Write the confirmation email', 'Sending switched on?', 'STOP: preview - nothing sent', 'Send the confirmation'] },
    { title: 'Record in Airtable', why: 'Only a live run writes to Airtable, and only when `AIRTABLE_BASE_ID` is set. Typecast lets Airtable create new select options such as a new region.', nodes: ['Live run?', 'STOP: test send - Airtable untouched', 'Airtable base set?', 'STOP: no Airtable base', 'Add the request to Airtable'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Route by size and region', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const r = out['Route by size and region'][0];
        const f: string[] = [];
        if (r.tier !== 'Mid-market' || r.region !== 'AMER' || r.owner !== 'Theo Grant') f.push(`sample should route Mid-market/AMER to Theo, got ${r.tier}/${r.region}/${r.owner}`);
        if (r.flags.length) f.push(`no flags expected, got ${r.flags}`);
        if (!out['Write the confirmation email'][0].body.includes('Theo Grant looks after mid-market teams in AMER')) f.push('confirmation wording wrong');
        return f;
      },
    },
    {
      name: 'enterprise request from Germany, live', start: 'Typeform demo request',
      input: [typeform([ans.text('first_name', 'Jonas'), ans.text('last_name', 'Weber'), ans.email('work_email', 'Jonas.Weber@rheinwerk.example'), ans.text('company', 'Rheinwerk AG'),
        ans.choice('company_size', '1,000-5,000'), ans.choice('country', 'Germany'), ans.text('use_case', 'Field service scheduling')])],
      overrides: { TEST_RUN: false, AIRTABLE_BASE_ID: 'appDemo123' },
      mocks: {
        'Send the confirmation': [{ id: 'msg_1', labelIds: ['SENT'] }],
        'Add the request to Airtable': [{ records: [{ id: 'recA1', fields: {} }] }],
      },
      expect: { reached: ['Send the confirmation', 'Add the request to Airtable'], outward: 'some' },
      check: out => {
        const r = out['Write the confirmation email'][0];
        const f: string[] = [];
        if (r.tier !== 'Enterprise' || r.region !== 'EMEA' || r.owner !== 'Lena Fox') f.push(`should route Enterprise/EMEA to Lena, got ${r.tier}/${r.region}/${r.owner}`);
        if (r.send_to !== 'jonas.weber@rheinwerk.example') f.push('live send should go to the lowercased requester');
        return f;
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
