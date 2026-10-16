import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, switchOn, merge, stop, http, gmail, slack, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const L = {
  email: 'Email',
  score: 'How likely are you to recommend us to a colleague? (0-10)',
  reason: 'What is the main reason for your score?',
  company: 'Company',
};
const answer = (email: string, score: string, reason: string, company = '') =>
  ({ [L.email]: email, [L.score]: score, [L.reason]: reason, [L.company]: company, submittedAt: new Date().toISOString(), formMode: 'production' });

export default defineSpec({
  slug: 'nps-detractor-follow-up',
  title: 'Collect NPS from an n8n form and create HubSpot tasks for detractors',
  summary: 'Hosts an NPS survey as an n8n form, scores and tags each answer, creates a HubSpot task for the account owner and a Slack alert when someone scores 0 to 6, asks promoters for a review by Gmail, and logs every answer to Google Sheets.',
  category: 'Customer support',
  description: {
    who: 'Customer success teams at B2B companies who want an NPS survey without a survey tool, and want unhappy customers to reach a named person the same day.',
    how: [
      'Customers answer a four-question n8n form: email, score from 0 to 10, reason and company. A manual run uses a sample answer.',
      'The contact and its owner are looked up in HubSpot by email. The score sets the category (promoter 9-10, passive 7-8, detractor 0-6) and keywords tag the reason with themes such as support or pricing.',
      'Every answer is appended to a Google Sheets log with its category and themes.',
      'A detractor creates a high-priority HubSpot task for the account owner, due in one business day, and tags that owner in Slack. A promoter gets a short email asking for a review. Passives are logged only.',
    ],
    setup: [
      'Run it once from `Run manually`. It handles a sample detractor and stops at `STOP: not live - no task created`, `STOP: preview - nothing posted` and `STOP: not live - nothing logged`.',
      'Add a HubSpot private app credential to both HubSpot nodes and set `USE_HUBSPOT = true`. Map owner ids to Slack ids in `OWNERS`.',
      'Connect Google Sheets with `NPS_SHEET_ID`, Slack with `SLACK_CHANNEL_ID`, and Gmail. Set `REVIEW_URL` to your review page.',
      'Put your address in `TEST_EMAIL` to receive review requests yourself, then set `TEST_RUN = false` and share the form URL.',
    ],
    requirements: ['A HubSpot account with a private app token', 'A Google Sheet for the log', 'A Gmail account', 'Optional: a Slack workspace'],
    customize: [
      '`THEMES` maps each theme to the words that tag it.',
      '`FALLBACK_OWNER_ID` takes detractors whose contact has no owner.',
      '`REVIEW_URL` and `SENDER_NAME` shape the promoter email.',
    ],
  },
  config: {
    intro: ['A manual run uses a SAMPLE answer. USE_HUBSPOT false -> SAMPLE contact and owner.', 'NPS_SHEET_ID blank -> nothing is logged. SLACK_CHANNEL_ID blank -> no alert.'],
    consts: [
      { name: 'USE_HUBSPOT', value: false, note: 'set true after adding the HubSpot credential to both HubSpot nodes' },
      { name: 'OWNERS', value: { '101': { name: 'Maya Ortiz', slack_id: 'U01MAYA' }, '102': { name: 'Theo Grant', slack_id: 'U02THEO' } }, note: 'HubSpot owner id -> name and Slack member id' },
      { name: 'FALLBACK_OWNER_ID', value: '101', note: 'owner for detractors whose contact has no owner or is not in HubSpot' },
      { name: 'THEMES', value: {
        support: ['support', 'response', 'ticket', 'answer', 'help'],
        reliability: ['bug', 'crash', 'slow', 'down', 'error', 'broken'],
        pricing: ['price', 'pricing', 'expensive', 'cost', 'invoice', 'billing'],
        onboarding: ['setup', 'onboarding', 'confusing', 'learn', 'training'],
        features: ['missing', 'feature', 'integration', 'wish', 'roadmap'],
      }, note: 'theme -> words in the reason that tag it' },
      { name: 'REVIEW_URL', value: 'https://www.g2.com/products/yourcompany/take_survey', note: 'link promoters are asked to review on' },
      { name: 'NPS_SHEET_ID', value: '', note: 'Google Sheets id with an NPS tab; blank logs nothing' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for detractor alerts; blank posts nothing' },
      { name: 'SENDER_NAME', value: 'Maya at Fieldnote', note: 'sign-off on the review request' },
    ],
    flags: { sheets_enabled: "NPS_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('NPS survey form', 'How are we doing?', 'Two minutes, four questions. Your answer goes straight to your account team.', [
      { label: L.email, type: 'email', required: true },
      { label: L.score, type: 'dropdown', required: true, options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
      { label: L.reason, type: 'textarea' },
      { label: L.company },
    ]),
    code('Read the survey answer', `
// Form submission when the form started the run; a sample detractor on a manual run.
let a = null;
try { a = $('NPS survey form').first().json; } catch (e) { a = null; }
if (!a) a = { ${JSON.stringify(L.email)}: 'priya@harbour-dental.example', ${JSON.stringify(L.score)}: '4',
  ${JSON.stringify(L.reason)}: 'Support takes days to answer and the invoice export keeps crashing.', ${JSON.stringify(L.company)}: 'Harbour Dental', submittedAt: new Date().toISOString() };
const raw = String(a[${JSON.stringify(L.score)}] ?? '').trim();
return [{ json: { email: String(a[${JSON.stringify(L.email)}] || '').trim().toLowerCase(), score: raw === '' ? null : Number(raw),
  reason: String(a[${JSON.stringify(L.reason)}] || '').trim(), company: String(a[${JSON.stringify(L.company)}] || '').trim(), submitted_at: a.submittedAt || new Date().toISOString() } }];`),
    ifTrue('Use sample owner?', '!' + cfg('use_hubspot')),
    code('Load sample owner', `
// Used until USE_HUBSPOT is true.
return [{ json: { contact_id: '801', owner_id: '101', lifecycle: 'customer', hubspot_company: 'Harbour Dental' } }];`),
    http('Find the contact in HubSpot', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/contacts/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: "JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: $json.email }] }], properties: ['hubspot_owner_id', 'lifecyclestage', 'company'], limit: 1 })",
    }),
    code('Read the contact owner', `
// Search result -> contact id and owner; a person not in HubSpot gives empty values.
const r = $input.first().json.results?.[0];
return [{ json: { contact_id: r?.id || '', owner_id: r?.properties?.hubspot_owner_id || '', lifecycle: r?.properties?.lifecyclestage || '', hubspot_company: r?.properties?.company || '' } }];`),
    merge('Combine owner sources'),
    code('Score and tag the answer', `
// Standard NPS bands. Themes come from keywords so the log can be filtered by theme
// without anyone reading every comment.
const cfg = $('config').first().json;
const a = $('Read the survey answer').first().json;
const o = $input.first().json;
const s = a.score;
const category = s === null || !(s >= 0 && s <= 10) ? 'invalid' : s >= 9 ? 'promoter' : s >= 7 ? 'passive' : 'detractor';
const low = a.reason.toLowerCase();
const themes = Object.keys(cfg.themes).filter(t => cfg.themes[t].some(w => low.includes(w)));
const owner_id = o.owner_id || cfg.fallback_owner_id;
const owner = cfg.owners[owner_id] || { name: 'owner ' + owner_id, slack_id: '' };
return [{ json: { ...a, category, themes, contact_id: o.contact_id, in_hubspot: Boolean(o.contact_id), owner_id, owner_name: owner.name, owner_slack: owner.slack_id,
  owner_was_fallback: !o.owner_id, company: a.company || o.hubspot_company } }];`),
    code('Shape the log row', `
// One flat row per answer for the NPS tab.
const r = $input.first().json;
return [{ json: { submitted_at: r.submitted_at, email: r.email, company: r.company, score: r.score ?? '', category: r.category, themes: r.themes.join(', '),
  reason: r.reason, owner: r.owner_name, in_hubspot: r.in_hubspot ? 'yes' : 'no' } }];`),
    ifWhen('Log switched on?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: not live - nothing logged'),
    sheets.append('Append to the NPS log', cfg('nps_sheet_id'), 'NPS'),
    code('Prepare the follow-up', `
// Everything each action needs, decided once: the detractor task (due next business
// day at 10:00) and Slack text, or the promoter review email. Passives need nothing.
const cfg = $('config').first().json;
const r = $input.first().json;
const out = { ...r };
if (r.category === 'detractor') {
  const due = new Date(); do { due.setDate(due.getDate() + 1); } while ([0, 6].includes(due.getDay())); due.setHours(10, 0, 0, 0);
  out.task_subject = 'NPS ' + r.score + ' from ' + (r.company || r.email) + ': call back';
  out.task_body = 'Score ' + r.score + '/10 from ' + r.email + (r.themes.length ? ' (themes: ' + r.themes.join(', ') + ')' : '') + '.\\nTheir words: "' + (r.reason || 'no comment') + '"\\nCall within one business day and log the outcome.';
  out.due_ms = due.getTime();
  const who = cfg.mode === 'live' && r.owner_slack ? '<@' + r.owner_slack + '>' : r.owner_name;
  out.slack_text = (cfg.mode === 'test' ? '[TEST] ' : '') + ':rotating_light: *Detractor: ' + r.score + '/10* from ' + (r.company || r.email) + ' (' + r.email + ')\\n'
    + '> ' + (r.reason || 'no comment') + '\\nOwner: ' + who + (r.owner_was_fallback ? ' (fallback, contact has no owner)' : '') + (r.themes.length ? ' | Themes: ' + r.themes.join(', ') : '');
}
if (r.category === 'promoter') {
  // Short, one link, no incentive: review sites do not allow paid reviews.
  out.subject = 'Thanks for the ' + r.score + '/10';
  out.body = ['Hi,', '', 'Thank you for the ' + r.score + '/10. It means a lot to the team.', '',
    'If you have two minutes, a short review would help other teams find us: ' + cfg.review_url, '', cfg.sender_name].join('\\n');
  out.send_to = cfg.mode === 'test' ? cfg.test_email : r.email;
}
return [{ json: out }];`),
    switchOn('Route by category', '$json.category', ['detractor', 'promoter', 'passive']),
    stop('STOP: passive - logged only'),
    stop('STOP: no valid score'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: not live - no task created'),
    http('Create the HubSpot task', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/tasks', auth: 'hubspotAppToken',
      jsonBody: "JSON.stringify({ properties: { hs_timestamp: String($json.due_ms), hs_task_subject: $json.task_subject, hs_task_body: $json.task_body, hs_task_status: 'NOT_STARTED', hs_task_priority: 'HIGH', hs_task_type: 'CALL', hubspot_owner_id: $json.owner_id }, associations: $json.contact_id ? [{ to: { id: $json.contact_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }] }] : [] })",
    }),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && ${cfg('slack_enabled')}`),
    stop('STOP: preview - nothing posted'),
    slack.post('Alert the owner in Slack', cfg('slack_channel_id'), '$json.slack_text'),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - no review request sent'),
    gmail.send('Email the review request', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
  ],
  edges: [
    ['Run manually', 'config'], ['NPS survey form', 'config'],
    ['config', 'Read the survey answer'],
    ['Read the survey answer', 'Use sample owner?'],
    ['Use sample owner?', 0, 'Load sample owner'], ['Use sample owner?', 1, 'Find the contact in HubSpot'],
    ['Find the contact in HubSpot', 'Read the contact owner'],
    ['Load sample owner', 'Combine owner sources'], ['Read the contact owner', 0, 'Combine owner sources', 1],
    ['Combine owner sources', 'Score and tag the answer'],
    ['Score and tag the answer', 'Prepare the follow-up'],
    ['Score and tag the answer', 'Shape the log row'],
    ['Shape the log row', 'Log switched on?'],
    ['Prepare the follow-up', 'Route by category'],
    ['Log switched on?', 0, 'Append to the NPS log'], ['Log switched on?', 1, 'STOP: not live - nothing logged'],
    ['Route by category', 0, 'Live run?'], ['Route by category', 0, 'Posting switched on?'],
    ['Route by category', 1, 'Sending switched on?'],
    ['Route by category', 2, 'STOP: passive - logged only'],
    ['Route by category', 3, 'STOP: no valid score'],
    ['Live run?', 0, 'Create the HubSpot task'], ['Live run?', 1, 'STOP: not live - no task created'],
    ['Posting switched on?', 0, 'Alert the owner in Slack'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Sending switched on?', 0, 'Email the review request'], ['Sending switched on?', 1, 'STOP: preview - no review request sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The n8n form is the survey, so there is no survey tool to pay for. `Run manually` replays a sample detractor. Themes, owners and links live in `config`.', nodes: ['Run manually', 'NPS survey form', 'config', 'Read the survey answer'] },
    { title: 'Find the owner, score and log', why: 'The owner is looked up before scoring so the log row names who is responsible. Every answer is logged, including passives, but only on a live run with `NPS_SHEET_ID` set.', nodes: ['Use sample owner?', 'Load sample owner', 'Find the contact in HubSpot', 'Read the contact owner', 'Combine owner sources', 'Score and tag the answer', 'Prepare the follow-up', 'Shape the log row', 'Log switched on?', 'STOP: not live - nothing logged', 'Append to the NPS log'] },
    { title: 'Act on the category', why: '`Route by category` sends detractors to a HubSpot task and a Slack alert, promoters to a review request, passives to the log only. A blank or out-of-range score ends at `STOP: no valid score`. Each action has its own gate.', nodes: ['Route by category', 'STOP: passive - logged only', 'STOP: no valid score', 'Live run?', 'STOP: not live - no task created', 'Create the HubSpot task', 'Posting switched on?', 'STOP: preview - nothing posted', 'Alert the owner in Slack', 'Sending switched on?', 'STOP: preview - no review request sent', 'Email the review request'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview, sample detractor)', start: 'Run manually',
      expect: { reached: ['Load sample owner', 'STOP: not live - no task created', 'STOP: preview - nothing posted', 'STOP: not live - nothing logged'], notReached: ['Sending switched on?'], outward: 'none' },
      check: out => {
        const r = out['Score and tag the answer'][0];
        const f: string[] = [];
        if (r.category !== 'detractor') f.push(`score 4 should be detractor, got ${r.category}`);
        if (r.themes.join() !== 'support,reliability,pricing') f.push(`themes wrong: ${r.themes}`);
        if (r.owner_name !== 'Maya Ortiz') f.push('owner should be Maya');
        const due = new Date(out['Prepare the follow-up'][0].due_ms).getDay();
        if (due === 0 || due === 6) f.push('task must be due on a weekday');
        return f;
      },
    },
    {
      name: 'promoter from the form, test send', start: 'NPS survey form',
      input: [answer('lee@northfield.example', '10', 'Fast setup and the team is great', 'Northfield Studio')],
      overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the review request': [{ id: 'msg_1', labelIds: ['SENT'] }] },
      expect: { reached: ['Email the review request', 'STOP: not live - nothing logged'], notReached: ['Live run?', 'Append to the NPS log'], outward: 'some' },
      check: out => {
        const r = out['Prepare the follow-up'][0];
        return r.send_to === 'you@example.com' && r.category === 'promoter' && r.themes.join() === 'onboarding' ? [] : [`promoter test send wrong: ${JSON.stringify(r)}`];
      },
    },
    {
      name: 'live detractor with HubSpot, Slack and Sheets', start: 'NPS survey form',
      input: [answer('Ken@QuarryLabs.example', '2', 'Too expensive for what we use', '')],
      overrides: { USE_HUBSPOT: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0CS', NPS_SHEET_ID: '1NpsSheet' },
      mocks: {
        'Find the contact in HubSpot': [{ total: 1, results: [{ id: '9902', properties: { hubspot_owner_id: '102', lifecyclestage: 'customer', company: 'Quarry Labs' } }] }],
        'Append to the NPS log': (items: any[]) => items,
        'Create the HubSpot task': [{ id: 'task1', properties: {} }],
        'Alert the owner in Slack': [{ ok: true }],
      },
      expect: { reached: ['Create the HubSpot task', 'Alert the owner in Slack', 'Append to the NPS log'], notReached: ['Load sample owner'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const t = out['Prepare the follow-up'][0];
        if (t.owner_id !== '102' || t.contact_id !== '9902' || t.company !== 'Quarry Labs') f.push(`task owner/contact wrong: ${t.owner_id} ${t.contact_id} ${t.company}`);
        if (!out['Prepare the follow-up'][0].slack_text.includes('<@U02THEO>')) f.push('live alert should tag Theo');
        if (out['Shape the log row'][0].themes !== 'pricing') f.push('log row themes wrong');
        return f;
      },
    },
    {
      name: 'passive is logged only', start: 'NPS survey form',
      input: [answer('mo@lumen.example', '8', 'Good overall')],
      expect: { reached: ['STOP: passive - logged only', 'STOP: not live - nothing logged'], outward: 'none' },
    },
  ],
});
