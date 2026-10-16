import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, gmail, slack, sheets, respond } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// Link signature shared by the email writer and the score reader, so a score
// cannot be posted for a ticket by editing the URL. Not cryptographic; it stops
// casual tampering and typos. Kept free of backslashes so it embeds cleanly.
const SIGN = `const sign = (salt, ticket, score) => { let a = 2166136261, b = 5381; const s = salt + '|' + ticket + '|' + score; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) ^ c) >>> 0; } return (a >>> 0).toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'); };`;
const signFn = new Function(`${SIGN} return sign;`)() as (s: string, t: string, n: number | string) => string;

export default defineSpec({
  slug: 'freshdesk-csat-survey',
  title: 'Send CSAT surveys after Freshdesk tickets close and log scores in Google Sheets',
  summary: 'Emails a one-click 1 to 5 satisfaction survey for every Freshdesk ticket resolved in the last day, skipping repeats and internal requesters, records each click through the same workflow\'s webhook into Google Sheets, and flags 1 and 2 scores to Slack.',
  category: 'Customer support',
  description: {
    who: 'Support teams on Freshdesk plans without built-in surveys, or who want CSAT scores in a sheet they own. One workflow sends the survey and records the answer.',
    how: [
      'Every day at 10:00 it lists Freshdesk tickets updated in the last 24 hours and keeps the resolved and closed ones, or 9 sample tickets until Freshdesk is connected.',
      'A ticket is skipped if it was resolved under 2 hours ago, already surveyed, tagged `no_survey`, from an internal domain, or if the requester had a survey in the last 30 days.',
      'Each survey email has five signed links that point back to this workflow\'s own webhook.',
      'A click records the score against the ticket in the Surveys tab, shows a thank-you message, and posts any 1 or 2 to Slack with a link to the ticket.',
    ],
    setup: [
      'Run it once as imported. It previews against sample tickets and stops at `STOP: preview - nothing sent`.',
      'Add a Freshdesk credential to `Fetch recently updated tickets`, fill in `FRESHDESK_DOMAIN` and set `USE_FRESHDESK = true`.',
      'Create a sheet with a Surveys tab (ticket_id, requester_email, subject, sent_at, score, scored_at, mode) and put its id in `SURVEY_SHEET_ID`.',
      'Activate the workflow, copy the production URL of `Score link clicked` into `WEBHOOK_URL` and change `LINK_SALT` to any phrase.',
      'Put your address in `TEST_EMAIL` to receive the surveys yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Freshdesk account with API access', 'A Gmail account', 'A Google Sheet', 'Optional: a Slack workspace'],
    customize: [
      '`COOLDOWN_DAYS` stops frequent requesters getting a survey after every ticket.',
      '`MIN_HOURS_AFTER_RESOLVE` waits before asking, in case the customer reopens.',
      '`ALERT_AT_OR_BELOW` sets which scores reach Slack.',
    ],
  },
  config: {
    intro: ['USE_FRESHDESK false -> SAMPLE tickets. SURVEY_SHEET_ID blank -> SAMPLE survey log, nothing recorded.', 'SLACK_CHANNEL_ID blank -> low scores are not posted.'],
    consts: [
      { name: 'USE_FRESHDESK', value: false, note: 'set true after adding the Freshdesk credential to the fetch node' },
      { name: 'FRESHDESK_DOMAIN', value: 'yourcompany', note: 'the part before .freshdesk.com' },
      { name: 'LOOKBACK_HOURS', value: 24, note: 'tickets resolved in this window are considered' },
      { name: 'MIN_HOURS_AFTER_RESOLVE', value: 2, note: 'wait this long after resolution before asking' },
      { name: 'COOLDOWN_DAYS', value: 30, note: 'one survey per requester in this many days' },
      { name: 'SKIP_DOMAINS', value: ['yourcompany.example'], note: 'requester domains that never get a survey (your own staff)' },
      { name: 'DAILY_CAP', value: 100, note: 'hard ceiling on surveys per run' },
      { name: 'SURVEY_SHEET_ID', value: '', note: 'Google Sheets id with a Surveys tab; blank uses a sample log and records nothing' },
      { name: 'WEBHOOK_URL', value: 'https://your-n8n.example/webhook/freshdesk-csat', note: 'production URL of the Score link clicked node' },
      { name: 'LINK_SALT', value: 'change-this-phrase', note: 'any phrase; signs survey links so scores cannot be forged by editing the URL' },
      { name: 'COMPANY_NAME', value: 'Acme Support', note: 'shown in the email and the thank-you message' },
      { name: 'ALERT_AT_OR_BELOW', value: 2, note: 'scores at or below this are posted to Slack' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for low scores; blank skips Slack' },
    ],
    flags: { sheet_enabled: "SURVEY_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 10:00', '0 10 * * *'),
    trigger.webhook('Score link clicked', 'freshdesk-csat', { method: 'GET', respond: 'node' }),
    code('Which trigger fired?', `
// The schedule and the score links share one config node. If the webhook ran, this
// execution is a click to record; otherwise it is a survey run.
let hook = null;
try { if ($('Score link clicked').isExecuted) hook = $('Score link clicked').first().json; } catch (e) { hook = null; }
return [{ json: { route: hook ? 'score' : 'send', query: hook?.query || {} } }];`),
    ifTrue('Survey run?', "$json.route === 'send'"),
    code('Read the clicked score', `
// Query is ?t=<ticket>&s=<1-5>&k=<signature>. The signature is recomputed from
// LINK_SALT, so a link with an edited ticket id or score is rejected.
${SIGN}
const cfg = $('config').first().json;
const q = $input.first().json.query || {};
const ticket = String(q.t || '').replace(/[^0-9]/g, '');
const score = Number(q.s);
const ok = ticket !== '' && Number.isInteger(score) && score >= 1 && score <= 5 && q.k === sign(cfg.link_salt, ticket, score);
return [{ json: {
  valid: ok, ticket_id: ticket, score: ok ? score : null, scored_at: new Date().toISOString(),
  message: ok ? 'Thanks, your rating of ' + score + '/5 for ticket #' + ticket + ' was recorded by ' + cfg.company_name + '.' : 'Sorry, this survey link was not recognised.',
} }];`),
    respond('Show the thank-you message', '({ message: $json.message })'),
    ifTrue('Score valid?', '$json.valid'),
    stop('STOP: link not recognised'),
    ifWhen('Recording switched on?', [[cfg('sends_enabled'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: preview or no sheet - score not saved'),
    code('Shape the score row', `
// Matches the Surveys tab by ticket_id so the score lands on the row written at send time.
const cfg = $('config').first().json;
const s = $input.first().json;
return [{ json: { ticket_id: s.ticket_id, score: s.score, scored_at: s.scored_at, mode: cfg.mode } }];`),
    sheets.upsert('Record the score in Google Sheets', cfg('survey_sheet_id'), 'Surveys', 'ticket_id'),
    ifTrue('Low score?', `$('Read the clicked score').first().json.score <= ${cfg('alert_at_or_below')}`),
    stop('STOP: score above the alert line'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Flag the low score in Slack', cfg('slack_channel_id'),
      `':warning: Ticket <https://' + ${cfg('freshdesk_domain')} + '.freshdesk.com/a/tickets/' + $('Read the clicked score').first().json.ticket_id + '|#' + $('Read the clicked score').first().json.ticket_id + '> was rated ' + $('Read the clicked score').first().json.score + '/5. Worth a call today.'`),
    ifTrue('Freshdesk connected?', cfg('use_freshdesk')),
    http('Fetch recently updated tickets', {
      url: `={{ 'https://' + ${cfg('freshdesk_domain')} + '.freshdesk.com/api/v2/tickets' }}`, auth: 'freshdeskApi',
      query: { updated_since: `={{ new Date(Date.now() - ${cfg('lookback_hours')} * 3600000).toISOString().slice(0, 19) + 'Z' }}`, include: 'requester,stats', per_page: '100', order_by: 'updated_at' },
    }),
    code('Read Freshdesk tickets', `
// Ticket list -> one item per ticket. Status 4 is resolved, 5 is closed; resolved_at
// comes from the stats include and falls back to closed_at, then updated_at.
const out = [];
for (const page of $input.all()) {
  const list = Array.isArray(page.json) ? page.json : (page.json.data || [page.json]);
  for (const t of list) {
    if (!t || !t.id) continue;
    out.push({ json: {
      id: t.id, subject: t.subject || '', status: t.status, tags: t.tags || [],
      requester_email: t.requester?.email || '', requester_name: t.requester?.name || '',
      resolved_at: t.stats?.resolved_at || t.stats?.closed_at || t.updated_at,
    } });
  }
}
return out;`),
    code('Load sample tickets', `
// Used until USE_FRESHDESK is true. Nine tickets, one for every skip rule.
const ago = h => new Date(Date.now() - h * 3600000).toISOString();
return [
  { id: 101, subject: 'Cannot reset my password', status: 4, tags: [], requester_email: 'mia@larkspur.example', requester_name: 'Mia Chen', resolved_at: ago(5) },
  { id: 102, subject: 'Invoice shows the wrong VAT number', status: 5, tags: [], requester_email: 'tom@brookfield.example', requester_name: 'Tom Adeyemi', resolved_at: ago(20) },
  { id: 103, subject: 'Import keeps timing out', status: 2, tags: [], requester_email: 'ola@finchworks.example', requester_name: 'Ola Berg', resolved_at: ago(3) },
  { id: 104, subject: 'Add a second admin', status: 4, tags: [], requester_email: 'raj@ivyhall.example', requester_name: 'Raj Patel', resolved_at: ago(1) },
  { id: 105, subject: 'Webhook retries', status: 4, tags: [], requester_email: 'kim@solent.example', requester_name: 'Kim Novak', resolved_at: ago(6) },
  { id: 106, subject: 'Change billing email', status: 4, tags: [], requester_email: 'ed@marlowe.example', requester_name: 'Ed Marlowe', resolved_at: ago(8) },
  { id: 107, subject: 'Test ticket from QA', status: 4, tags: [], requester_email: 'qa@yourcompany.example', requester_name: 'QA Bot', resolved_at: ago(3) },
  { id: 108, subject: 'Legal hold on account', status: 5, tags: ['no_survey'], requester_email: 'counsel@harrow.example', requester_name: 'Harrow Legal', resolved_at: ago(10) },
  { id: 109, subject: 'Password reset email in spam', status: 4, tags: [], requester_email: 'mia@larkspur.example', requester_name: 'Mia Chen', resolved_at: ago(4) },
].map(json => ({ json }));`),
    merge('Combine ticket sources'),
    ifTrue('Survey log set?', cfg('sheet_enabled')),
    sheets.read('Read the survey log', cfg('survey_sheet_id'), 'Surveys'),
    code('Load sample survey log', `
// Used until SURVEY_SHEET_ID is set. Ticket 105 was surveyed already; Ed had a survey 10 days ago.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
return [
  { ticket_id: '105', requester_email: 'kim@solent.example', subject: 'Webhook retries', sent_at: ago(0.2), score: '', scored_at: '', mode: 'live' },
  { ticket_id: '88', requester_email: 'ed@marlowe.example', subject: 'Seats on the plan', sent_at: ago(10), score: 5, scored_at: ago(9), mode: 'live' },
  { ticket_id: '61', requester_email: 'tom@brookfield.example', subject: 'Export to Xero', sent_at: ago(45), score: 4, scored_at: ago(44), mode: 'live' },
].map(json => ({ json }));`),
    merge('Combine survey logs'),
    code('Pick tickets to survey', `
// Every resolved or closed ticket is either picked or held with a reason. One survey
// per requester per run (the most recently resolved ticket), none inside COOLDOWN_DAYS.
const cfg = $('config').first().json;
const tickets = $('Combine ticket sources').all().map(i => i.json);
const log = $input.all().map(i => i.json).filter(r => r.ticket_id !== undefined && r.ticket_id !== '');
const surveyed = new Set(log.map(r => String(r.ticket_id)));
const lastSent = {};
for (const r of log) {
  const e = String(r.requester_email || '').toLowerCase();
  if (e && (!lastSent[e] || r.sent_at > lastSent[e])) lastSent[e] = r.sent_at;
}
const now = Date.now();
const picked = [], held = [];
const sorted = tickets.filter(t => t.status === 4 || t.status === 5)
  .sort((a, b) => String(b.resolved_at).localeCompare(String(a.resolved_at)));
for (const t of tickets.filter(t => t.status !== 4 && t.status !== 5)) held.push({ id: t.id, reason: 'not resolved (status ' + t.status + ')' });
const thisRun = new Set();
for (const t of sorted) {
  const email = t.requester_email.toLowerCase();
  const hours = (now - new Date(t.resolved_at)) / 36e5;
  const days = lastSent[email] ? (now - new Date(lastSent[email])) / 864e5 : null;
  const reason =
    !email ? 'no requester email' :
    surveyed.has(String(t.id)) ? 'already surveyed' :
    t.tags.includes('no_survey') ? 'tagged no_survey' :
    cfg.skip_domains.includes(email.split('@')[1]) ? 'internal requester' :
    hours > cfg.lookback_hours ? 'resolved before the lookback window' :
    hours < cfg.min_hours_after_resolve ? 'resolved under ' + cfg.min_hours_after_resolve + 'h ago, may reopen' :
    days !== null && days < cfg.cooldown_days ? 'surveyed ' + Math.floor(days) + ' days ago' :
    thisRun.has(email) ? 'newer ticket from the same person this run' : '';
  if (reason) { held.push({ id: t.id, reason }); continue; }
  thisRun.add(email);
  picked.push(t);
}
for (const t of picked.slice(cfg.daily_cap)) held.push({ id: t.id, reason: 'over DAILY_CAP, next run' });
return [{ json: { surveys: picked.slice(0, cfg.daily_cap), held, checked: tickets.length } }];`),
    code('Write each survey email', `
// Five signed links per email, each a one-click answer. The ticket subject is quoted
// so the customer knows which conversation the question is about.
${SIGN}
const cfg = $('config').first().json;
const labels = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
return $input.first().json.surveys.map(t => {
  const link = n => cfg.webhook_url + '?t=' + t.id + '&s=' + n + '&k=' + sign(cfg.link_salt, String(t.id), n);
  const buttons = [1, 2, 3, 4, 5].map(n => '<a href="' + link(n) + '" style="display:inline-block;margin:4px;padding:10px 14px;border:1px solid #ccc;border-radius:6px;text-decoration:none;color:#222">' + n + ' ' + labels[n] + '</a>').join('');
  const html = '<p>Hi ' + (t.requester_name.split(' ')[0] || 'there') + ',</p>'
    + '<p>We closed your request "' + t.subject + '" (#' + t.id + '). How did we do?</p>'
    + '<p>' + buttons + '</p><p>One click is all it takes. Reply to this email if anything is still not right.</p><p>' + cfg.company_name + '</p>';
  return { json: { ticket_id: String(t.id), email: t.requester_email, subject_line: 'How did we do on "' + t.subject + '"?', html,
    send_to: cfg.mode === 'test' ? cfg.test_email : t.requester_email, ticket_subject: t.subject } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the survey', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject_line", message: '$json.html', html: true }),
    ifWhen('Log this send?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: test send or no sheet - log untouched'),
    code('Shape the log row', `
// One Surveys row per email sent; the score columns are filled when the link is clicked.
const cfg = $('config').first().json;
return $('Write each survey email').all().map(s => ({ json: { ticket_id: s.json.ticket_id, requester_email: s.json.email,
  subject: s.json.ticket_subject, sent_at: new Date().toISOString(), score: '', scored_at: '', mode: cfg.mode } }));`),
    sheets.append('Log the survey as sent', cfg('survey_sheet_id'), 'Surveys'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 10:00', 'config'], ['Score link clicked', 'config'],
    ['config', 'Which trigger fired?'],
    ['Which trigger fired?', 'Survey run?'],
    ['Survey run?', 0, 'Freshdesk connected?'], ['Survey run?', 1, 'Read the clicked score'],
    ['Read the clicked score', 'Show the thank-you message'],
    ['Show the thank-you message', 'Score valid?'],
    ['Score valid?', 0, 'Recording switched on?'], ['Score valid?', 1, 'STOP: link not recognised'],
    ['Recording switched on?', 0, 'Shape the score row'], ['Recording switched on?', 1, 'STOP: preview or no sheet - score not saved'],
    ['Shape the score row', 'Record the score in Google Sheets'],
    ['Record the score in Google Sheets', 'Low score?'],
    ['Low score?', 0, 'Slack channel set?'], ['Low score?', 1, 'STOP: score above the alert line'],
    ['Slack channel set?', 0, 'Flag the low score in Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Freshdesk connected?', 0, 'Fetch recently updated tickets'], ['Freshdesk connected?', 1, 'Load sample tickets'],
    ['Fetch recently updated tickets', 'Read Freshdesk tickets'],
    ['Read Freshdesk tickets', 'Combine ticket sources'], ['Load sample tickets', 0, 'Combine ticket sources', 1],
    ['Combine ticket sources', 'Survey log set?'],
    ['Survey log set?', 0, 'Read the survey log'], ['Survey log set?', 1, 'Load sample survey log'],
    ['Read the survey log', 'Combine survey logs'], ['Load sample survey log', 0, 'Combine survey logs', 1],
    ['Combine survey logs', 'Pick tickets to survey'],
    ['Pick tickets to survey', 'Write each survey email'],
    ['Write each survey email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the survey'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the survey', 'Log this send?'],
    ['Log this send?', 0, 'Shape the log row'], ['Log this send?', 1, 'STOP: test send or no sheet - log untouched'],
    ['Shape the log row', 'Log the survey as sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Three ways in: by hand, the 10:00 schedule, or a customer clicking a score link. All three read the same `config`, so the link signature and sheet id are set once.', nodes: ['Run manually', 'Every day at 10:00', 'Score link clicked', 'config'] },
    { title: 'Record a clicked score', why: '`Read the clicked score` recomputes the link signature before anything is saved, and the customer gets a reply either way. The score is written onto the ticket\'s existing Surveys row; only 1 and 2 go to Slack.', nodes: ['Which trigger fired?', 'Survey run?', 'Read the clicked score', 'Show the thank-you message', 'Score valid?', 'STOP: link not recognised', 'Recording switched on?', 'STOP: preview or no sheet - score not saved', 'Shape the score row', 'Record the score in Google Sheets', 'Low score?', 'STOP: score above the alert line', 'Slack channel set?', 'STOP: no Slack channel', 'Flag the low score in Slack'] },
    { title: 'Read resolved tickets', why: 'Freshdesk has no resolved-since filter, so `Fetch recently updated tickets` lists the last day of updates and the status check happens in code. `Load sample tickets` stands in until `USE_FRESHDESK` is true.', nodes: ['Freshdesk connected?', 'Fetch recently updated tickets', 'Read Freshdesk tickets', 'Load sample tickets', 'Combine ticket sources'] },
    { title: 'Skip anyone already asked', why: 'The Surveys tab is the memory: a ticket in it is never asked twice, and a requester asked inside `COOLDOWN_DAYS` is held. Every skipped ticket carries its reason in `Pick tickets to survey`.', nodes: ['Survey log set?', 'Read the survey log', 'Load sample survey log', 'Combine survey logs', 'Pick tickets to survey'] },
    { title: 'Send and log', why: 'Nothing goes out while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send reaches you and leaves the log alone, so the real customer still gets asked once you go live.', nodes: ['Write each survey email', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the survey', 'Log this send?', 'STOP: test send or no sheet - log untouched', 'Shape the log row', 'Log the survey as sent'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample tickets', 'Load sample survey log', 'STOP: preview - nothing sent'], notReached: ['Read the clicked score'], outward: 'none' },
      check: out => {
        const p = out['Pick tickets to survey'][0];
        const f: string[] = [];
        const ids = p.surveys.map((t: any) => t.id).sort();
        if (JSON.stringify(ids) !== '[102,109]') f.push(`expected surveys for 102 and 109, got ${JSON.stringify(ids)}`);
        const why = (id: number) => p.held.find((h: any) => h.id === id)?.reason || '';
        const want: Record<number, string> = { 101: 'same person', 103: 'not resolved', 104: 'may reopen', 105: 'already surveyed', 106: 'surveyed 10 days ago', 107: 'internal', 108: 'no_survey' };
        for (const [id, w] of Object.entries(want)) if (!why(Number(id)).includes(w)) f.push(`ticket ${id} should be held for "${w}", got "${why(Number(id))}"`);
        const mail = out['Write each survey email'][0];
        if ((mail.html.match(/href=/g) || []).length !== 5) f.push('survey email should carry 5 links');
        return f;
      },
    },
    {
      name: 'live survey run with Freshdesk and the sheet', start: 'Every day at 10:00',
      overrides: { USE_FRESHDESK: true, SURVEY_SHEET_ID: '1SurveyLogSheet', TEST_RUN: false },
      mocks: {
        'Fetch recently updated tickets': [
          { id: 7001, subject: 'Bulk edit fails', status: 4, tags: [], requester: { email: 'nina@corbel.example', name: 'Nina Holt' }, stats: { resolved_at: new Date(Date.now() - 5 * 36e5).toISOString() }, updated_at: new Date().toISOString() },
          { id: 7002, subject: 'Still waiting', status: 3, tags: [], requester: { email: 'paul@vesta.example', name: 'Paul Ito' }, stats: {}, updated_at: new Date().toISOString() },
        ],
        'Read the survey log': [{ ticket_id: '6900', requester_email: 'someone@else.example', sent_at: new Date(Date.now() - 3 * 864e5).toISOString() }],
        'Email the survey': (items: any[]) => items.map(() => ({ id: 'msg_1', labelIds: ['SENT'] })),
        'Log the survey as sent': (items: any[]) => items,
      },
      expect: { reached: ['Email the survey', 'Log the survey as sent'], notReached: ['Load sample tickets'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const mail = out['Write each survey email'];
        if (mail.length !== 1 || mail[0].send_to !== 'nina@corbel.example') f.push('only ticket 7001 should be surveyed, to the requester');
        if (out['Shape the log row'][0]?.ticket_id !== '7001') f.push('log row should be for 7001');
        return f;
      },
    },
    {
      name: 'customer clicks a 2 (live)', start: 'Score link clicked',
      input: [{ headers: { host: 'your-n8n.example' }, params: {}, query: { t: '102', s: '2', k: signFn('change-this-phrase', '102', 2) }, body: {} }],
      overrides: { SURVEY_SHEET_ID: '1SurveyLogSheet', TEST_RUN: false, SLACK_CHANNEL_ID: 'C0CSAT' },
      mocks: {
        'Record the score in Google Sheets': (items: any[]) => items,
        'Flag the low score in Slack': [{ ok: true }],
      },
      expect: { reached: ['Show the thank-you message', 'Record the score in Google Sheets', 'Flag the low score in Slack'], notReached: ['Freshdesk connected?'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Shape the score row'][0]?.score !== 2) f.push('score 2 should be recorded');
        if (!out['Read the clicked score'][0].valid) f.push('signed link should validate');
        return f;
      },
    },
    {
      name: 'tampered link is rejected', start: 'Score link clicked',
      input: [{ headers: {}, params: {}, query: { t: '102', s: '5', k: signFn('change-this-phrase', '102', 2) }, body: {} }],
      overrides: { SURVEY_SHEET_ID: '1SurveyLogSheet', TEST_RUN: false },
      expect: { reached: ['Show the thank-you message', 'STOP: link not recognised'], notReached: ['Record the score in Google Sheets'], outward: 'none' },
    },
  ],
});
