import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'hubspot-dormant-contact-reengagement',
  title: 'Re-engage dormant HubSpot contacts with a three-touch Gmail sequence',
  summary: 'Each weekday, finds HubSpot leads with no activity for 120 days, walks each one through a three-email Gmail sequence spaced 0, 5 and 7 days apart, stores the touch number on the contact, and ends the sequence on a reply, an unsubscribe or the last touch.',
  category: 'Sales and CRM',
  description: {
    who: 'Small sales and marketing teams with a HubSpot database full of leads nobody has spoken to in months. It works through them a few at a time from your own Gmail, so replies come back to a person, not a marketing tool.',
    how: [
      'Every weekday at 09:30 it searches HubSpot for contacts in the chosen lifecycle stages with no activity for `DORMANT_DAYS`, or uses sample contacts until HubSpot is connected.',
      'The touch already sent, its date and the sequence status are read from three custom contact properties. Touch 2 waits 5 days after touch 1, touch 3 waits 7 days after touch 2.',
      'A reply since the sequence started, or an email opt-out, closes the sequence at once. Fourteen days after touch 3 it is marked completed.',
      'Up to `DAILY_CAP` emails go out through Gmail. On a live run each send updates the touch properties and each closed sequence gets its final status.',
    ],
    setup: [
      'Run it once as imported. It plans sample touches and stops at `STOP: preview - nothing sent` and `STOP: not live - statuses unchanged`.',
      'In HubSpot create contact properties reengage_touch (number), reengage_started and reengage_last_sent (date), and reengage_status (single-line text).',
      'Add a HubSpot private app credential to the three HubSpot nodes, set `USE_HUBSPOT = true`, and connect Gmail.',
      'Put your address in `TEST_EMAIL` to receive the touches yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A HubSpot account with a private app (contacts read and write)', 'A Gmail account'],
    customize: [
      '`TOUCHES` holds the gap, subject and body of each email.',
      '`LIFECYCLE_STAGES` and `DORMANT_DAYS` decide who enters the sequence.',
      '`DAILY_CAP` keeps sending volume low enough for a personal mailbox.',
    ],
  },
  config: {
    intro: ['USE_HUBSPOT false -> SAMPLE contacts so the run works before any credential exists.', 'Sequence state lives on the contact (reengage_* properties), so it survives re-imports.'],
    consts: [
      { name: 'USE_HUBSPOT', value: false, note: 'set true after adding the HubSpot credential and creating the reengage_* properties' },
      { name: 'DORMANT_DAYS', value: 120, note: 'no activity for this many days makes a contact dormant' },
      { name: 'LIFECYCLE_STAGES', value: ['lead', 'marketingqualifiedlead', 'salesqualifiedlead'], note: 'HubSpot lifecycle stage ids that may enter the sequence' },
      { name: 'TOUCHES', value: [
        { gap_days: 0, subject: 'Still looking at {topic}, {first_name}?', body: 'Hi {first_name},\n\nWe last spoke a while ago about {topic} at {company}. Is that still on your list this quarter? If so, I can send over what has changed since then.' },
        { gap_days: 5, subject: 'A 2-minute overview for {company}', body: 'Hi {first_name},\n\nIn case it is useful, here is a 2-minute overview of how teams handle {topic} with us now: https://www.yourcompany.example/overview. Happy to walk you through it in 20 minutes.' },
        { gap_days: 7, subject: 'Should I close your file?', body: 'Hi {first_name},\n\nI have not heard back, so I will assume the timing is not right and stop emailing. If that changes, just reply to this email.' },
      ], note: 'gap_days = days after the previous touch; {first_name} {company} {topic} are filled in' },
      { name: 'DEFAULT_TOPIC', value: 'scheduling', note: 'used for {topic} when the contact has no interest recorded' },
      { name: 'COMPLETE_AFTER_DAYS', value: 14, note: 'days after the last touch before the sequence is marked completed' },
      { name: 'DAILY_CAP', value: 25, note: 'hard ceiling on emails per run' },
      { name: 'SENDER_NAME', value: 'Maya Ortiz', note: 'sign-off on every touch' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 09:30', '30 9 * * 1-5'),
    ifTrue('Use sample contacts?', '!' + cfg('use_hubspot')),
    code('Load sample contacts', `
// Used until USE_HUBSPOT is true. One contact for every branch of the sequence logic.
const ago = n => n === null ? '' : new Date(Date.now() - n * 864e5).toISOString();
const c = (id, first, company, touch, lastSent, extra = {}) => ({ id, email: first.toLowerCase() + '@' + company.toLowerCase().replace(/\\s+/g, '') + '.example', first_name: first, company,
  lifecycle: 'lead', last_activity: ago(200), optout: false, last_reply: '', touch, started: touch ? ago(lastSent + 12) : '', last_sent: ago(touch ? lastSent : null), status: touch ? 'in sequence' : '', topic: '', ...extra });
return [
  c('1', 'Amy', 'Harbour Dental', 0, null),
  c('2', 'Bo', 'Northfield', 1, 6),
  c('3', 'Cy', 'Lumen Physio', 2, 3),
  c('4', 'Di', 'Orchard Lane', 2, 8, { topic: 'online booking' }),
  c('5', 'Ed', 'Quarry Labs', 3, 15),
  c('6', 'Flo', 'Tallow', 1, 4, { last_reply: ago(2) }),
  c('7', 'Gil', 'Driftwood', 1, 3, { optout: true }),
  c('8', 'Hal', 'Beacon', 2, 30, { status: 'replied' }),
  c('9', 'Ivy', 'Pinecrest', 0, null, { lifecycle: 'customer' }),
].map(json => ({ json }));`),
    http('Search dormant contacts', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/contacts/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: `JSON.stringify({ filterGroups: [{ filters: [
        { propertyName: 'lifecyclestage', operator: 'IN', values: ${cfg('lifecycle_stages')} },
        { propertyName: 'notes_last_updated', operator: 'LT', value: String(Date.now() - ${cfg('dormant_days')} * 864e5) } ] }],
        properties: ['email', 'firstname', 'company', 'lifecyclestage', 'notes_last_updated', 'hs_email_optout', 'hs_email_last_reply_date', 'reengage_touch', 'reengage_started', 'reengage_last_sent', 'reengage_status'],
        sorts: [{ propertyName: 'notes_last_updated', direction: 'ASCENDING' }], limit: 100 })`,
    }),
    code('Read HubSpot contacts', `
// Search response -> the sample shape.
const out = [];
for (const page of $input.all()) for (const r of page.json.results || []) {
  const p = r.properties || {};
  out.push({ json: { id: r.id, email: (p.email || '').toLowerCase(), first_name: p.firstname || '', company: p.company || '', lifecycle: p.lifecyclestage || '',
    last_activity: p.notes_last_updated || '', optout: p.hs_email_optout === 'true', last_reply: p.hs_email_last_reply_date || '',
    touch: Number(p.reengage_touch || 0), started: p.reengage_started || '', last_sent: p.reengage_last_sent || '', status: p.reengage_status || '', topic: '' } });
}
return out;`),
    merge('Combine contact sources'),
    code('Plan the next touch', `
// Order of checks matters: a finished sequence is left alone, then an opt-out or a
// reply closes it, then the next touch is sent only once its gap has passed.
const cfg = $('config').first().json;
const days = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : Infinity;
const sends = [], closes = [], waiting = [], skipped = [];
for (const { json: c } of $input.all()) {
  if (!cfg.lifecycle_stages.includes(c.lifecycle)) { skipped.push({ id: c.id, reason: 'lifecycle ' + c.lifecycle + ' not targeted' }); continue; }
  if (['replied', 'unsubscribed', 'completed'].includes(c.status)) { skipped.push({ id: c.id, reason: 'sequence already ' + c.status }); continue; }
  if (!c.email) { skipped.push({ id: c.id, reason: 'no email' }); continue; }
  if (c.optout) { if (c.touch > 0) closes.push({ id: c.id, email: c.email, status: 'unsubscribed' }); else skipped.push({ id: c.id, reason: 'opted out' }); continue; }
  if (c.touch > 0 && c.last_reply && c.started && new Date(c.last_reply) > new Date(c.started)) { closes.push({ id: c.id, email: c.email, status: 'replied' }); continue; }
  if (c.touch >= cfg.touches.length) {
    if (days(c.last_sent) >= cfg.complete_after_days) closes.push({ id: c.id, email: c.email, status: 'completed' });
    else waiting.push({ id: c.id, reason: 'after last touch' });
    continue;
  }
  const next = cfg.touches[c.touch];
  if (c.touch > 0 && days(c.last_sent) < next.gap_days) { waiting.push({ id: c.id, reason: 'touch ' + (c.touch + 1) + ' due in ' + (next.gap_days - days(c.last_sent)) + ' days' }); continue; }
  sends.push({ ...c, next_touch: c.touch + 1 });
}
for (const s of sends.splice(cfg.daily_cap)) waiting.push({ id: s.id, reason: 'over DAILY_CAP, next run' });
return [{ json: { sends, closes, waiting, skipped } }];`),
    code('Write each touch', `
// Templates from TOUCHES with the contact's own details; missing values get neutral words.
const cfg = $('config').first().json;
const today = new Date().toISOString().slice(0, 10);
const fill = (s, c) => s.replace(/{first_name}/g, c.first_name || 'there').replace(/{company}/g, c.company || 'your team').replace(/{topic}/g, c.topic || cfg.default_topic);
return $input.first().json.sends.map(c => {
  const t = cfg.touches[c.next_touch - 1];
  return { json: { ...c, subject: fill(t.subject, c), body: fill(t.body, c) + '\\n\\n' + cfg.sender_name,
    props: { reengage_touch: String(c.next_touch), reengage_last_sent: today, reengage_status: 'in sequence', ...(c.next_touch === 1 ? { reengage_started: today } : {}) },
    send_to: cfg.mode === 'test' ? cfg.test_email : c.email } };
});`),
    code('One item per closed sequence', `
// Replies, opt-outs and finished sequences each get their final status written back.
return $input.first().json.closes.map(c => ({ json: c }));`),
    ifTrue('Status writes switched on?', cfg('live')),
    stop('STOP: not live - statuses unchanged'),
    http('Close the sequence in HubSpot', {
      method: 'PATCH', url: "={{ 'https://api.hubapi.com/crm/v3/objects/contacts/' + $json.id }}", auth: 'hubspotAppToken',
      jsonBody: 'JSON.stringify({ properties: { reengage_status: $json.status } })',
    }),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the touch', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - HubSpot untouched'),
    http('Record the touch on the contact', {
      method: 'PATCH', url: "={{ 'https://api.hubapi.com/crm/v3/objects/contacts/' + $('Write each touch').item.json.id }}", auth: 'hubspotAppToken',
      jsonBody: "JSON.stringify({ properties: $('Write each touch').item.json.props })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 09:30', 'config'],
    ['config', 'Use sample contacts?'],
    ['Use sample contacts?', 0, 'Load sample contacts'], ['Use sample contacts?', 1, 'Search dormant contacts'],
    ['Search dormant contacts', 'Read HubSpot contacts'],
    ['Load sample contacts', 'Combine contact sources'], ['Read HubSpot contacts', 0, 'Combine contact sources', 1],
    ['Combine contact sources', 'Plan the next touch'],
    ['Plan the next touch', 'Write each touch'],
    ['Plan the next touch', 'One item per closed sequence'],
    ['One item per closed sequence', 'Status writes switched on?'],
    ['Status writes switched on?', 0, 'Close the sequence in HubSpot'], ['Status writes switched on?', 1, 'STOP: not live - statuses unchanged'],
    ['Write each touch', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the touch'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the touch', 'Live run?'],
    ['Live run?', 0, 'Record the touch on the contact'], ['Live run?', 1, 'STOP: test send - HubSpot untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Weekday mornings only, so touches never land on a weekend. The three emails, gaps and the daily cap live in `config`.', nodes: ['Run manually', 'Every weekday at 09:30', 'config'] },
    { title: 'Find dormant contacts', why: 'HubSpot filters by lifecycle stage and last activity, and `Plan the next touch` checks lifecycle again in case a contact moved stage. `Load sample contacts` stands in until `USE_HUBSPOT` is true.', nodes: ['Use sample contacts?', 'Load sample contacts', 'Search dormant contacts', 'Read HubSpot contacts', 'Combine contact sources'] },
    { title: 'Plan touches and close sequences', why: 'Replies and opt-outs are checked before any send, so nobody who answered gets another email. Closed sequences are written back only on a live run.', nodes: ['Plan the next touch', 'Write each touch', 'One item per closed sequence', 'Status writes switched on?', 'STOP: not live - statuses unchanged', 'Close the sequence in HubSpot'] },
    { title: 'Send and record the touch', why: 'A test send goes to `TEST_EMAIL` and leaves the contact unchanged, so the real touch still goes later. The touch number is written after the email, never before.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the touch', 'Live run?', 'STOP: test send - HubSpot untouched', 'Record the touch on the contact'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample contacts', 'STOP: preview - nothing sent', 'STOP: not live - statuses unchanged'], outward: 'none' },
      check: out => {
        const p = out['Plan the next touch'][0];
        const f: string[] = [];
        const sends = p.sends.map((s: any) => s.id + ':' + s.next_touch).join(',');
        if (sends !== '1:1,2:2,4:3') f.push(`sends wrong: ${sends}`);
        const closes = p.closes.map((c: any) => c.id + ':' + c.status).join(',');
        if (closes !== '5:completed,6:replied,7:unsubscribed') f.push(`closes wrong: ${closes}`);
        if (p.waiting.map((w: any) => w.id).join() !== '3') f.push('Cy should be waiting');
        if (p.skipped.length !== 2) f.push('finished and customer contacts should be skipped');
        const w = out['Write each touch'];
        if (w[0].props.reengage_started === undefined || w[1].props.reengage_started !== undefined) f.push('reengage_started only on touch 1');
        if (!w[2].subject.startsWith('Should I close') || !w[0].body.includes('scheduling at Harbour Dental')) f.push('templates not filled');
        return f;
      },
    },
    {
      name: 'live with HubSpot', start: 'Every weekday at 09:30',
      overrides: { USE_HUBSPOT: true, TEST_RUN: false },
      mocks: {
        'Search dormant contacts': [{ total: 2, results: [
          { id: '61', properties: { email: 'Nina@Brightloom.example', firstname: 'Nina', company: 'Brightloom', lifecyclestage: 'lead', notes_last_updated: '2025-12-01T00:00:00Z', hs_email_optout: 'false', reengage_touch: null } },
          { id: '62', properties: { email: 'oli@quarrylabs.example', firstname: 'Oli', company: 'Quarry Labs', lifecyclestage: 'marketingqualifiedlead', hs_email_optout: 'false', hs_email_last_reply_date: new Date().toISOString(),
            reengage_touch: '2', reengage_started: new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10), reengage_last_sent: new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10), reengage_status: 'in sequence' } },
        ] }],
        'Email the touch': [{ id: 'msg_1', labelIds: ['SENT'] }],
        'Record the touch on the contact': (items: any[]) => items,
        'Close the sequence in HubSpot': (items: any[]) => items,
      },
      expect: { reached: ['Email the touch', 'Record the touch on the contact', 'Close the sequence in HubSpot'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const p = out['Plan the next touch'][0];
        if (p.sends[0]?.email !== 'nina@brightloom.example') f.push('Nina should get touch 1');
        if (p.closes[0]?.id !== '62' || p.closes[0]?.status !== 'replied') f.push('Oli replied and should be closed');
        return f;
      },
    },
  ],
});
