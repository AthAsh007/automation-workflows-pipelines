import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, switchOn, respond } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'utm-lead-attribution-airtable',
  title: 'Capture form leads with UTM attribution into Airtable',
  summary: 'Receives website form leads by webhook, reads UTM tags and click ids from the page URL, classifies the channel (paid, organic, social, email, referral, direct), keeps first touch and last touch per email and upserts the lead into Airtable.',
  category: 'Sales and CRM',
  description: {
    who: 'Marketers and founders who run ads and content at the same time and cannot say which channel a lead came from. Every form lead gets a channel, and a returning lead keeps the channel that first brought them in.',
    how: [
      'Your website form posts the lead plus the page URL and referrer to a webhook. The form gets an answer straight away.',
      'Invalid emails are rejected with a 422 and honeypot submissions are answered quietly and dropped.',
      'UTM tags, gclid, fbclid and msclkid are read from the page URL, and the referrer decides between organic, social, referral and direct when there are no tags.',
      'The lead is looked up in Airtable by email. A new lead gets first touch = last touch; a returning lead keeps its first touch, gets a new last touch and a touch count, and is upserted on the Email field.',
    ],
    setup: [
      'Run it once as imported from `Run manually`. It classifies a sample returning lead and stops at `STOP: dry run - Airtable untouched`.',
      'Create a Leads table with the columns listed in `Merge first and last touch`, add an Airtable token credential to both Airtable nodes and fill in `AIRTABLE_BASE_ID`.',
      'Point your form at the production webhook URL with fields email, name, company, page_url, referrer and website (left empty, a honeypot).',
      'Send one test lead, check the classification in the execution, then set `DRY_RUN = false`.',
    ],
    requirements: ['A website form that can post JSON to a URL', 'An Airtable base with a Leads table'],
    customize: [
      '`PAID_MEDIUMS`, `SOCIAL_HOSTS` and `SEARCH_HOSTS` hold the classification rules.',
      '`OWN_DOMAINS` keeps your own site from showing up as a referral.',
      '`HONEYPOT_FIELD` names the hidden field that bots fill in.',
    ],
  },
  config: {
    intro: ['AIRTABLE_BASE_ID blank -> no lookup; a SAMPLE existing record is used instead.', 'DRY_RUN true -> the lead is classified and answered, Airtable is not written.'],
    consts: [
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank uses the sample lookup' },
      { name: 'AIRTABLE_TABLE', value: 'Leads', note: 'table name or id holding the leads' },
      { name: 'OWN_DOMAINS', value: ['yourcompany.example'], note: 'your own sites; a referrer from these counts as direct' },
      { name: 'PAID_MEDIUMS', value: ['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'display', 'cpm', 'retargeting'], note: 'utm_medium values that mean paid' },
      { name: 'EMAIL_MEDIUMS', value: ['email', 'newsletter', 'e-mail'], note: 'utm_medium values that mean email' },
      { name: 'SOCIAL_HOSTS', value: ['facebook.com', 'instagram.com', 'linkedin.com', 'lnkd.in', 't.co', 'x.com', 'twitter.com', 'reddit.com', 'youtube.com', 'threads.net'], note: 'referrer hosts or utm_source values that mean social' },
      { name: 'SEARCH_HOSTS', value: ['google.', 'bing.com', 'duckduckgo.com', 'search.yahoo.com', 'ecosia.org', 'search.brave.com'], note: 'referrer hosts that mean organic search' },
      { name: 'HONEYPOT_FIELD', value: 'website', note: 'hidden form field; a filled value marks the submission as spam' },
    ],
    flags: { airtable_enabled: "AIRTABLE_BASE_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Lead form webhook', 'lead-attribution', { respond: 'node' }),
    code('Read the submission', `
// The webhook body when this run came from the form; nothing when it was started by hand.
let body = null;
try { body = $('Lead form webhook').first().json.body || null; } catch (e) { body = null; }
return [{ json: { from_webhook: Boolean(body), body: body || {} } }];`),
    ifTrue('Real submission?', '$json.from_webhook'),
    code('Load sample lead', `
// Used for manual runs. A returning visitor who clicked a Google ad.
return [{ json: { from_webhook: false, body: {
  email: 'Priya.Nair@northwind-labs.example', name: 'Priya Nair', company: 'Northwind Labs', website: '',
  page_url: 'https://www.yourcompany.example/demo?utm_source=google&utm_medium=cpc&utm_campaign=q4-demo&utm_term=crm%20for%20agencies&gclid=EAIaIQobChMI-sample',
  referrer: 'https://www.google.com/',
} } }];`),
    merge('Combine submission sources'),
    code('Check and classify the lead', `
// Validates, then classifies. Order of the channel rules matters: a click id or a
// paid medium beats everything, then email, then social, then search referrers,
// then any other outside referrer. No tags and no outside referrer is direct.
const cfg = $('config').first().json;
const b = $input.first().json.body;
const email = String(b.email || '').trim().toLowerCase();
if (String(b[cfg.honeypot_field] || '').trim()) return [{ json: { verdict: 'spam', email } }];
if (!/^[^\\s@'"]+@[^\\s@'"]+\\.[a-z]{2,}$/.test(email)) return [{ json: { verdict: 'invalid', error: 'Please enter a valid email address.' } }];
let url; try { url = new URL(String(b.page_url || '')); } catch (e) { url = null; }
const q = k => (url?.searchParams.get(k) || '').trim().toLowerCase();
let refHost = ''; try { refHost = new URL(String(b.referrer || '')).hostname.replace(/^www\\./, ''); } catch (e) {}
const own = cfg.own_domains.some(d => refHost === d || refHost.endsWith('.' + d));
if (own) refHost = '';
const utm = { source: q('utm_source'), medium: q('utm_medium'), campaign: q('utm_campaign'), term: q('utm_term'), content: q('utm_content') };
const clickId = ['gclid', 'msclkid', 'fbclid', 'li_fat_id', 'ttclid'].find(k => url?.searchParams.get(k));
const isSocial = h => cfg.social_hosts.some(s => h === s || h.endsWith('.' + s) || h.split('.')[0] === s.split('.')[0]);
let channel, rule;
if (cfg.paid_mediums.includes(utm.medium) || (clickId && clickId !== 'fbclid')) { channel = 'paid'; rule = utm.medium ? 'utm_medium=' + utm.medium : clickId; }
else if (cfg.email_mediums.includes(utm.medium)) { channel = 'email'; rule = 'utm_medium=' + utm.medium; }
else if ((utm.source && isSocial(utm.source)) || (refHost && isSocial(refHost))) { channel = 'social'; rule = utm.source ? 'utm_source=' + utm.source : 'referrer ' + refHost; }
else if (refHost && cfg.search_hosts.some(s => refHost.includes(s))) { channel = 'organic'; rule = 'referrer ' + refHost; }
else if (utm.source || refHost) { channel = 'referral'; rule = utm.source ? 'utm_source=' + utm.source : 'referrer ' + refHost; }
else { channel = 'direct'; rule = 'no tags, no outside referrer'; }
const landing = url ? url.origin + url.pathname : '';
return [{ json: { verdict: 'accept', email, name: String(b.name || '').trim(), company: String(b.company || '').trim(),
  touch: { channel, rule, source: utm.source || refHost || '(direct)', medium: utm.medium, campaign: utm.campaign, term: utm.term, content: utm.content,
    click_id: clickId || '', landing, at: new Date().toISOString() } } }];`),
    switchOn('Route the submission', '$json.verdict', ['accept', 'spam']),
    respond('Reply to the form', "({ ok: true, channel: $json.touch.channel })"),
    respond('Answer spam quietly', "({ ok: true })"),
    stop('STOP: spam dropped'),
    respond('Reject the submission', "({ ok: false, error: $json.error })", 422),
    ifTrue('Airtable connected?', cfg('airtable_enabled')),
    http('Find the lead in Airtable', {
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`, auth: 'airtableTokenApi',
      query: { filterByFormula: `={{ "LOWER({Email})='" + $json.email + "'" }}`, maxRecords: '1' },
    }),
    code('Load sample existing record', `
// Used until AIRTABLE_BASE_ID is set: the sample lead first arrived 23 days ago from organic search.
return [{ json: { records: [{ id: 'recSample001', fields: {
  Email: 'priya.nair@northwind-labs.example', 'First touch channel': 'organic', 'First touch source': 'google.com', 'First touch campaign': '',
  'First touch date': new Date(Date.now() - 23 * 864e5).toISOString(), 'First landing page': 'https://www.yourcompany.example/blog/agency-crm-checklist', Touches: 1,
} }] } }];`),
    merge('Combine lookup results'),
    code('Merge first and last touch', `
// Airtable columns: Email, Name, Company, First touch channel/source/campaign/date,
// First landing page, Last touch channel/source/medium/campaign/content/term/date,
// Last landing page, Click id, Touches. First touch is written once and never moved.
const lead = $('Check and classify the lead').first().json;
const existing = ($input.first().json.records || [])[0]?.fields;
const t = lead.touch;
const first = existing && existing['First touch channel'] ? {
  'First touch channel': existing['First touch channel'], 'First touch source': existing['First touch source'] || '',
  'First touch campaign': existing['First touch campaign'] || '', 'First touch date': existing['First touch date'] || '', 'First landing page': existing['First landing page'] || '',
} : { 'First touch channel': t.channel, 'First touch source': t.source, 'First touch campaign': t.campaign, 'First touch date': t.at, 'First landing page': t.landing };
const fields = { Email: lead.email, ...(lead.name ? { Name: lead.name } : {}), ...(lead.company ? { Company: lead.company } : {}), ...first,
  'Last touch channel': t.channel, 'Last touch source': t.source, 'Last touch medium': t.medium, 'Last touch campaign': t.campaign,
  'Last touch content': t.content, 'Last touch term': t.term, 'Last touch date': t.at, 'Last landing page': t.landing, 'Click id': t.click_id,
  Touches: Number(existing?.Touches || 0) + 1 };
return [{ json: { returning: Boolean(existing), fields, payload: { performUpsert: { fieldsToMergeOn: ['Email'] }, typecast: true, records: [{ fields }] } } }];`),
    ifWhen('Live and Airtable set?', [[cfg('live'), 'true'], [cfg('airtable_enabled'), 'true']]),
    stop('STOP: dry run - Airtable untouched'),
    http('Upsert the lead in Airtable', {
      method: 'PATCH', auth: 'airtableTokenApi',
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`,
      jsonBody: 'JSON.stringify($json.payload)',
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Lead form webhook', 'config'],
    ['config', 'Read the submission'],
    ['Read the submission', 'Real submission?'],
    ['Real submission?', 0, 'Combine submission sources'], ['Real submission?', 1, 'Load sample lead'],
    ['Load sample lead', 0, 'Combine submission sources', 1],
    ['Combine submission sources', 'Check and classify the lead'],
    ['Check and classify the lead', 'Route the submission'],
    ['Route the submission', 0, 'Reply to the form'], ['Route the submission', 1, 'Answer spam quietly'], ['Route the submission', 2, 'Reject the submission'],
    ['Answer spam quietly', 'STOP: spam dropped'],
    ['Reply to the form', 'Airtable connected?'],
    ['Airtable connected?', 0, 'Find the lead in Airtable'], ['Airtable connected?', 1, 'Load sample existing record'],
    ['Find the lead in Airtable', 'Combine lookup results'], ['Load sample existing record', 0, 'Combine lookup results', 1],
    ['Combine lookup results', 'Merge first and last touch'],
    ['Merge first and last touch', 'Live and Airtable set?'],
    ['Live and Airtable set?', 0, 'Upsert the lead in Airtable'], ['Live and Airtable set?', 1, 'STOP: dry run - Airtable untouched'],
  ],
  groups: [
    { title: 'Receive the lead', why: 'The form posts to `Lead form webhook`, which waits for a respond node so the visitor gets an answer within the same request. A manual run feeds `Load sample lead` through the same path.', nodes: ['Run manually', 'Lead form webhook', 'config', 'Read the submission', 'Real submission?', 'Load sample lead', 'Combine submission sources'] },
    { title: 'Validate, classify and answer', why: 'Rules run in a fixed order: click id or paid medium, then email, social, search and referral. The form is answered before Airtable is touched, so a slow lookup never delays the visitor. Spam gets a normal reply and is dropped.', nodes: ['Check and classify the lead', 'Route the submission', 'Reply to the form', 'Answer spam quietly', 'STOP: spam dropped', 'Reject the submission'] },
    { title: 'Look up the email', why: 'A lookup by lowercased email finds a returning lead before anything is written. Without a base id `Load sample existing record` returns a first touch from 23 days ago, so the merge rule is visible.', nodes: ['Airtable connected?', 'Find the lead in Airtable', 'Load sample existing record', 'Combine lookup results'] },
    { title: 'Keep first touch, write last touch', why: 'First touch fields are copied from the existing record and never overwritten. The upsert merges on Email, so a double submit updates one row instead of creating two. It runs only when `DRY_RUN` is false.', nodes: ['Merge first and last touch', 'Live and Airtable set?', 'STOP: dry run - Airtable untouched', 'Upsert the lead in Airtable'] },
  ],
  scenarios: [
    {
      name: 'shipped config (manual run, sample returning lead)', start: 'Run manually',
      expect: { reached: ['Load sample lead', 'Reply to the form', 'Load sample existing record', 'STOP: dry run - Airtable untouched'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const t = out['Check and classify the lead'][0].touch;
        if (t.channel !== 'paid' || t.click_id !== 'gclid' || t.campaign !== 'q4-demo') f.push(`classification wrong: ${JSON.stringify(t)}`);
        const m = out['Merge first and last touch'][0];
        if (m.fields['First touch channel'] !== 'organic' || m.fields['Last touch channel'] !== 'paid' || m.fields.Touches !== 2) f.push(`first/last touch merge wrong: ${JSON.stringify(m.fields)}`);
        if (m.fields.Email !== 'priya.nair@northwind-labs.example') f.push('email not lowercased');
        return f;
      },
    },
    {
      name: 'live webhook, new social lead', start: 'Lead form webhook',
      input: [{ headers: { 'content-type': 'application/json' }, params: {}, query: {}, body: { email: 'sam@harbourdesign.example', name: 'Sam Ortiz', company: 'Harbour Design', website: '',
        page_url: 'https://www.yourcompany.example/pricing', referrer: 'https://lnkd.in/abc123' } }],
      overrides: { AIRTABLE_BASE_ID: 'appSample12345', DRY_RUN: false },
      mocks: {
        'Find the lead in Airtable': [{ records: [] }],
        'Upsert the lead in Airtable': [{ records: [{ id: 'recNew', fields: {} }], createdRecords: ['recNew'], updatedRecords: [] }],
      },
      expect: { reached: ['Reply to the form', 'Upsert the lead in Airtable'], notReached: ['Load sample lead', 'Load sample existing record'], outward: 'some' },
      check: out => {
        const m = out['Merge first and last touch'][0];
        return m.fields['First touch channel'] === 'social' && m.fields.Touches === 1 && !m.returning ? [] : [`new social lead wrong: ${JSON.stringify(m.fields)}`];
      },
    },
    {
      name: 'honeypot and bad email', start: 'Lead form webhook',
      input: [{ headers: {}, params: {}, query: {}, body: { email: 'bot@spam.example', website: 'http://spam.example' } }],
      expect: { reached: ['Answer spam quietly', 'STOP: spam dropped'], notReached: ['Reply to the form', 'Airtable connected?'], outward: 'none' },
    },
    {
      name: 'invalid email is rejected', start: 'Lead form webhook',
      input: [{ headers: {}, params: {}, query: {}, body: { email: 'not-an-email', page_url: 'https://www.yourcompany.example/' } }],
      expect: { reached: ['Reject the submission'], notReached: ['Reply to the form'], outward: 'none' },
    },
  ],
});
