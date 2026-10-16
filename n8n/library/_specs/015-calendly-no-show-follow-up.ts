import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'calendly-no-show-follow-up',
  title: 'Follow up Calendly no-shows with a rebooking email in Gmail',
  summary: 'Every two hours, reads Calendly meetings from the last day, finds invitees the host marked as no-show, and sends each person one short rebooking email through Gmail with the right booking link, a cooldown and a per-run cap.',
  category: 'Sales and CRM',
  description: {
    who: 'Coaches, consultants and sales teams who mark no-shows in Calendly and then forget to follow up. Each missed meeting gets a friendly rebooking email the same day, once.',
    how: [
      'Every two hours it lists your Calendly meetings that started in the last 24 hours and ended at least an hour ago, then reads their invitees. Sample invitees are used until Calendly is connected.',
      'Only invitees the host marked as no-show in Calendly are kept. Canceled meetings, internal addresses and anyone emailed in the last 30 days are skipped with a reason.',
      'A person with two missed meetings in one window gets one email. `DAILY_CAP` limits sends per run.',
      'The email names the missed meeting and links to the matching booking page from `REBOOK_LINKS`. Emailed invitees are remembered only on a live run.',
    ],
    setup: [
      'Run it once as imported. It previews against sample invitees and stops at `STOP: preview - nothing sent`.',
      'Add a Calendly credential to both Calendly nodes, paste your user URI into `CALENDLY_USER_URI`, and set `USE_CALENDLY = true`.',
      'Fill `REBOOK_LINKS` with the booking page for each event type, then connect Gmail.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Calendly account with API access (personal access token or OAuth)', 'A Gmail account'],
    customize: [
      '`REBOOK_LINKS` maps event type names to booking pages; `DEFAULT_REBOOK_URL` covers the rest.',
      '`COOLDOWN_DAYS` stops repeat emails to the same person.',
      '`INTERNAL_DOMAINS` keeps colleagues out.',
    ],
  },
  config: {
    intro: ['USE_CALENDLY false -> SAMPLE invitees so the run works before any credential exists.', 'Emailed people are remembered in workflow static data, only on a live run.'],
    consts: [
      { name: 'USE_CALENDLY', value: false, note: 'set true after adding the Calendly credential and CALENDLY_USER_URI' },
      { name: 'CALENDLY_USER_URI', value: '', note: 'your user URI, from GET https://api.calendly.com/users/me' },
      { name: 'LOOKBACK_HOURS', value: 24, note: 'meetings that started this far back are checked' },
      { name: 'MIN_HOURS_AFTER', value: 1, note: 'wait this long after the meeting so the host can mark the no-show' },
      { name: 'REBOOK_LINKS', value: { 'Discovery call': 'https://calendly.com/yourcompany/discovery', 'Onboarding session': 'https://calendly.com/yourcompany/onboarding' }, note: 'event type name -> booking page' },
      { name: 'DEFAULT_REBOOK_URL', value: 'https://calendly.com/yourcompany', note: 'used for event types not listed above' },
      { name: 'INTERNAL_DOMAINS', value: ['yourcompany.example'], note: 'invitees on these domains are never emailed' },
      { name: 'COOLDOWN_DAYS', value: 30, note: 'no second email to the same address within this many days' },
      { name: 'DAILY_CAP', value: 20, note: 'hard ceiling on emails per run' },
      { name: 'SENDER_NAME', value: 'Maya at Fieldnote', note: 'sign-off on every email' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every two hours', '0 */2 * * *'),
    ifTrue('Use sample invitees?', '!' + cfg('use_calendly')),
    code('Load sample invitees', `
// Used until USE_CALENDLY is true. Rows are already one per invitee, as the live path produces.
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const i = (n, name, email, event, startH, noShow, status = 'active') => ({ invitee_uri: 'https://api.calendly.com/scheduled_events/ev' + n + '/invitees/inv' + n,
  name, email, event_name: event, start_time: ago(startH), event_status: status, no_show: noShow });
return [
  i(1, 'Leo Hart', 'leo@hartandco.example', 'Discovery call', 5, true),
  i(2, 'Mia Chen', 'mia@chenstudio.example', 'Onboarding session', 8, true),
  i(3, 'Zed Ruiz', 'zed@ruizbuild.example', 'Discovery call', 6, false),
  i(4, 'Pat Lowe', 'pat@yourcompany.example', 'Discovery call', 4, true),
  i(5, 'Leo Hart', 'LEO@hartandco.example', 'Discovery call', 20, true),
  i(6, 'Rae Dunn', 'rae@dunnhomes.example', 'Discovery call', 10, true, 'canceled'),
].map(json => ({ json }));`),
    http('List recent Calendly meetings', {
      url: 'https://api.calendly.com/scheduled_events', auth: 'calendlyApi',
      query: { user: `={{ ${cfg('calendly_user_uri')} }}`, min_start_time: `={{ new Date(Date.now() - ${cfg('lookback_hours')} * 3600e3).toISOString() }}`,
        max_start_time: `={{ new Date(Date.now() - ${cfg('min_hours_after')} * 3600e3).toISOString() }}`, count: '100', sort: 'start_time:asc' },
    }),
    code('One item per meeting', `
// Each meeting needs its own invitees call.
const out = [];
for (const page of $input.all()) for (const e of page.json.collection || []) out.push({ json: { event_uri: e.uri, event_name: e.name, start_time: e.start_time, event_status: e.status } });
return out;`),
    http('Read invitees of each meeting', { url: "={{ $json.event_uri + '/invitees' }}", auth: 'calendlyApi', query: { count: '100' } }),
    code('Collect invitees', `
// Invitee list -> one row per invitee with the meeting fields attached.
const out = [];
const meetings = $('One item per meeting').all().map(i => i.json);
$input.all().forEach((page, k) => {
  const m = meetings[k] || {};
  for (const v of page.json.collection || []) out.push({ json: { invitee_uri: v.uri, name: v.name || '', email: v.email || '', event_name: m.event_name, start_time: m.start_time,
    event_status: m.event_status, no_show: Boolean(v.no_show) } });
});
return out;`),
    merge('Combine invitee sources'),
    code('Pick who to email', `
// Only marked no-shows on meetings that went ahead. One email per address per run,
// none inside COOLDOWN_DAYS of the last one, and never to internal domains.
const cfg = $('config').first().json;
const sent = $getWorkflowStaticData('global').emailed || {};
const cutoff = Date.now() - cfg.cooldown_days * 864e5;
const send = [], held = [], seenNow = new Set();
let attended = 0;
for (const { json: v } of $input.all()) {
  const email = v.email.trim().toLowerCase();
  if (!v.no_show) { attended++; continue; }
  const reason =
    v.event_status !== 'active' ? 'meeting ' + v.event_status :
    !email ? 'no email' :
    cfg.internal_domains.includes(email.split('@')[1]) ? 'internal address' :
    seenNow.has(email) ? 'already in this run' :
    sent[email] && new Date(sent[email]).getTime() > cutoff ? 'emailed within COOLDOWN_DAYS' : '';
  if (reason) { held.push({ name: v.name, email, reason }); continue; }
  seenNow.add(email);
  send.push({ ...v, email, link: cfg.rebook_links[v.event_name] || cfg.default_rebook_url });
}
for (const x of send.splice(cfg.daily_cap)) held.push({ name: x.name, email: x.email, reason: 'over DAILY_CAP, next run' });
return [{ json: { send, held, attended } }];`),
    code('Write the rebooking email', `
// Short and blame-free; the only ask is a new time.
const cfg = $('config').first().json;
return $input.first().json.send.map(v => {
  const day = new Date(v.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const body = [
    'Hi ' + (v.name.split(' ')[0] || 'there') + ',', '',
    'We were set to meet for your ' + v.event_name.toLowerCase() + ' on ' + day + ' but did not manage to connect. No problem, these things happen.', '',
    'If you would still like to talk, pick a new time here: ' + v.link, '',
    'If the timing is no longer right, just reply and let me know.', '',
    cfg.sender_name,
  ].join('\\n');
  return { json: { ...v, subject: 'Sorry we missed you - want to pick a new time?', body, send_to: cfg.mode === 'test' ? cfg.test_email : v.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the rebooking link', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - nobody remembered'),
    code('Remember who was emailed', `
// Live only: address -> date, so COOLDOWN_DAYS holds across runs. Old entries are pruned.
const store = $getWorkflowStaticData('global');
const sent = store.emailed || {};
for (const v of $('Write the rebooking email').all()) sent[v.json.email] = new Date().toISOString();
const keep = Date.now() - 90 * 864e5;
store.emailed = Object.fromEntries(Object.entries(sent).filter(([, d]) => new Date(d).getTime() > keep));
return [{ json: { remembered: Object.keys(store.emailed).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every two hours', 'config'],
    ['config', 'Use sample invitees?'],
    ['Use sample invitees?', 0, 'Load sample invitees'], ['Use sample invitees?', 1, 'List recent Calendly meetings'],
    ['List recent Calendly meetings', 'One item per meeting'],
    ['One item per meeting', 'Read invitees of each meeting'],
    ['Read invitees of each meeting', 'Collect invitees'],
    ['Load sample invitees', 'Combine invitee sources'], ['Collect invitees', 0, 'Combine invitee sources', 1],
    ['Combine invitee sources', 'Pick who to email'],
    ['Pick who to email', 'Write the rebooking email'],
    ['Write the rebooking email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the rebooking link'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the rebooking link', 'Live run?'],
    ['Live run?', 0, 'Remember who was emailed'], ['Live run?', 1, 'STOP: test send - nobody remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every two hours so a no-show hears back the same day. Booking links, cooldown and cap live in `config`.', nodes: ['Run manually', 'Every two hours', 'config'] },
    { title: 'Read recent invitees', why: 'Meetings are listed first, then invitees per meeting, because the no-show mark lives on the invitee. `MIN_HOURS_AFTER` gives the host time to mark it. `Load sample invitees` stands in until `USE_CALENDLY` is true.', nodes: ['Use sample invitees?', 'Load sample invitees', 'List recent Calendly meetings', 'One item per meeting', 'Read invitees of each meeting', 'Collect invitees', 'Combine invitee sources'] },
    { title: 'Choose and write', why: '`Pick who to email` lowercases addresses before the duplicate and cooldown checks, so one person with two bookings gets one email. Every skip carries a reason.', nodes: ['Pick who to email', 'Write the rebooking email'] },
    { title: 'Send and remember', why: 'A test send goes to `TEST_EMAIL` and records nothing, so the real person is still emailed later. Only `Live run?` adds addresses to the cooldown list.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the rebooking link', 'Live run?', 'STOP: test send - nobody remembered', 'Remember who was emailed'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample invitees', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const p = out['Pick who to email'][0];
        const f: string[] = [];
        if (p.send.map((v: any) => v.email).join() !== 'leo@hartandco.example,mia@chenstudio.example') f.push(`emails wrong: ${p.send.map((v: any) => v.email)}`);
        if (p.send[1].link !== 'https://calendly.com/yourcompany/onboarding') f.push('onboarding link not chosen');
        const r = p.held.map((h: any) => h.reason).sort().join('|');
        if (r !== 'already in this run|internal address|meeting canceled') f.push(`held reasons wrong: ${r}`);
        if (p.attended !== 1) f.push('one attendee should be counted');
        return f;
      },
    },
    {
      name: 'live with Calendly', start: 'Every two hours',
      overrides: { USE_CALENDLY: true, CALENDLY_USER_URI: 'https://api.calendly.com/users/AAAA', TEST_RUN: false },
      mocks: {
        'List recent Calendly meetings': [{ collection: [
          { uri: 'https://api.calendly.com/scheduled_events/E1', name: 'Strategy session', status: 'active', start_time: new Date(Date.now() - 3 * 3600e3).toISOString() },
        ], pagination: { next_page: null } }],
        'Read invitees of each meeting': [{ collection: [
          { uri: 'https://api.calendly.com/scheduled_events/E1/invitees/I1', name: 'Ada Kim', email: 'ada@kimworks.example', status: 'active', no_show: { uri: 'https://api.calendly.com/invitee_no_shows/N1', created_at: new Date().toISOString() } },
          { uri: 'https://api.calendly.com/scheduled_events/E1/invitees/I2', name: 'Bo Lund', email: 'bo@lund.example', status: 'active', no_show: null },
        ] }],
        'Email the rebooking link': [{ id: 'msg_1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Collect invitees', 'Email the rebooking link', 'Remember who was emailed'], outward: 'some' },
      check: out => {
        const w = out['Write the rebooking email'];
        return w.length === 1 && w[0].email === 'ada@kimworks.example' && w[0].link === 'https://calendly.com/yourcompany' ? [] : ['only Ada should be emailed, with the default link'];
      },
    },
  ],
});
