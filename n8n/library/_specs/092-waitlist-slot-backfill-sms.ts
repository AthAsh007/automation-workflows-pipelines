import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, switchOn, sheets, twilio } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const HELPERS = `
const toE164 = raw => {
  let s = String(raw || '').trim().replace(/[^\\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = s.length === 10 ? '+1' + s : s.length === 11 && s.startsWith('1') ? '+' + s : '';
  return /^\\+[1-9]\\d{9,14}$/.test(s) ? s : '';
};
const when = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: cfg.timezone });`;

export default defineSpec({
  slug: 'waitlist-slot-backfill-sms',
  title: 'Offer cancelled appointment slots to a waitlist by Twilio SMS',
  summary: 'When a booking is cancelled, texts the first eligible people on a Google Sheets waitlist (right service, available that day and time, not already offered it), then handles their SMS replies in the same workflow: the first YES gets the slot and everyone else is told it has gone.',
  category: 'Local business and services',
  description: {
    who: 'Clinics, salons and trainers who keep a waitlist but fill a late cancellation by ringing round. The gap is offered to three people by text within a minute, and the first to answer gets it.',
    how: [
      'Your booking tool posts each cancellation to `Receive a cancellation`. A manual run uses a sample cancellation.',
      'The Waitlist and Offers tabs are read. A person is eligible when they are waiting, want this service (or Any), are available on that date and time of day, have a valid mobile number and have not been offered this slot before.',
      'The longest-waiting `OFFER_TO_FIRST_N` people get a text and one row each on the Offers tab.',
      'Twilio posts replies to `Receive an SMS reply`. The first YES inside `OFFER_EXPIRY_MINUTES` wins: they get a confirmation, the other people offered that slot are told it has gone, and a NO is marked declined.',
      'Every decision is written back to the Offers tab by Offer ID, so the sheet shows who was offered what and who won.',
    ],
    setup: [
      'Run it once as imported. It offers a sample slot to sample waitlist entries and stops at `STOP: preview - nothing sent`.',
      'Create Waitlist (Name, Phone, Service, Preferred time, Available from, Available until, Added, Status) and Offers tabs, connect Google Sheets and set `WAITLIST_SHEET_ID`.',
      'Add a Twilio credential, set `TWILIO_FROM`, and set that number\'s incoming message webhook to the production URL of `Receive an SMS reply`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_PHONE` to your mobile. Set `TEST_RUN = false` to text the waitlist.',
    ],
    requirements: ['A Google Sheet with Waitlist and Offers tabs', 'A Twilio account with an SMS number', 'A booking tool that can call a webhook on cancellation'],
    customize: [
      '`OFFER_TO_FIRST_N` sets how many people hear about each slot.',
      '`OFFER_EXPIRY_MINUTES` sets how long a YES still counts.',
      '`TIME_OF_DAY` sets the hour boundaries for Morning, Afternoon and Evening.',
    ],
  },
  config: {
    intro: ['WAITLIST_SHEET_ID blank -> SAMPLE waitlist and offers so both the cancellation and the reply path run before any credential exists.', 'Test mode (TEST_RUN true + TEST_EMAIL set) texts TEST_PHONE only and writes nothing.'],
    consts: [
      { name: 'WAITLIST_SHEET_ID', value: '', note: 'Google Sheets id with Waitlist and Offers tabs; blank uses sample rows' },
      { name: 'TIMEZONE', value: 'America/New_York', note: 'IANA timezone for slot times and time-of-day matching' },
      { name: 'BUSINESS_NAME', value: 'Lumen Physio', note: 'shown in every text' },
      { name: 'TWILIO_FROM', value: '', note: 'your Twilio sending number in E.164' },
      { name: 'OFFER_TO_FIRST_N', value: 3, note: 'people texted per cancelled slot, longest waiting first' },
      { name: 'OFFER_EXPIRY_MINUTES', value: 180, note: 'a YES after this long no longer wins the slot' },
      { name: 'MIN_NOTICE_MINUTES', value: 60, note: 'slots starting sooner than this are not offered' },
      { name: 'TIME_OF_DAY', value: { Morning: [6, 12], Afternoon: [12, 17], Evening: [17, 22] }, note: 'hour ranges [from, to) for preferred times' },
      { name: 'TEST_PHONE', value: '', note: 'test mode texts this number instead of the waitlist; ships blank' },
    ],
    flags: { sheets_enabled: "WAITLIST_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Receive a cancellation', 'slot-cancelled'),
    trigger.webhook('Receive an SMS reply', 'waitlist-sms-reply'),
    code('Read the incoming event', `
// Which trigger fired decides the event. Twilio sends From/Body; the booking tool
// sends slot_id/service/starts_at. A manual run has neither.
let reply = null, cancel = null;
try { reply = $('Receive an SMS reply').first().json.body; } catch (e) { reply = null; }
try { cancel = $('Receive a cancellation').first().json.body; } catch (e) { cancel = null; }
if (reply && reply.From) return [{ json: { type: 'reply', from: String(reply.From), text: String(reply.Body || '').trim(), sid: reply.MessageSid || '' } }];
if (cancel && cancel.slot_id && cancel.starts_at) return [{ json: { type: 'cancellation', slot: {
  id: String(cancel.slot_id), service: cancel.service || '', starts_at: cancel.starts_at, provider: cancel.provider || '' } } }];
return [{ json: { type: 'none' } }];`),
    ifTrue('Event received?', "$json.type !== 'none'"),
    code('Load sample cancellation', `
// Used on a manual run: a Physio slot tomorrow at 10:30 in TIMEZONE.
const cfg = $('config').first().json;
const tz = cfg.timezone;
const parts = t => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(p => [p.type, p.value]));
const offset = t => { const p = parts(t); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t; };
const p = parts(Date.now());
const wall = Date.UTC(+p.year, +p.month - 1, +p.day + 1, 10, 30);
const starts = new Date(wall - offset(wall)).toISOString();
return [{ json: { type: 'cancellation', slot: { id: 'SLOT-2041', service: 'Physio', starts_at: starts, provider: 'Dana' } } }];`),
    merge('Combine event sources'),
    ifTrue('Waitlist sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Waitlist tab', cfg('waitlist_sheet_id'), 'Waitlist'),
    sheets.read('Read the Offers tab', cfg('waitlist_sheet_id'), 'Offers'),
    code('Load sample waitlist and offers', `
// Used until WAITLIST_SHEET_ID is set. Waitlist rows cover each eligibility rule; Offers
// rows include an open offer for SLOT-OLD-77 so the reply path has something to settle.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const minsAgo = n => new Date(Date.now() - n * 6e4).toISOString();
const W = (Name, Phone, Service, pref, added, Status = 'waiting', from = '', until = '') =>
  ({ Name, Phone, Service, 'Preferred time': pref, 'Available from': from, 'Available until': until, Added: day(-added), Status });
const O = (slot, phone, name, status, sent) => ({ 'Offer ID': slot + ':' + phone, 'Slot ID': slot, Phone: phone, Name: name, Service: 'Physio',
  'Starts at': new Date(Date.now() + 5 * 36e5).toISOString(), Provider: 'Marco', Status: status, 'Sent at': minsAgo(sent), 'Updated at': minsAgo(sent) });
return [
  W('Rosa Diaz', '(212) 555-0119', 'Physio', 'Morning', 20),
  W('Ken Ito', '212-555-0165', 'Massage', 'Any', 25),
  W('Mia Novak', '212-555-0131', 'Physio', 'Evening', 18),
  W('Joel Grant', '212-555-0177', 'Physio', 'Any', 30),
  W('Ana Ruiz', '212-555-0188', 'Physio', 'Any', 10, 'waiting', '', day(-1)),
  W('Lee Chen', '+1 917 555 0123', 'physio', 'Morning', 5),
  W('Dana Okafor', '646.555.0144', 'Any', 'Any', 2),
  W('Tom Becker', '212-555-0190', 'Physio', 'Any', 40, 'booked'),
  W('Sam Patel', '12345', 'Physio', 'Any', 35),
  O('SLOT-2041', '+12125550177', 'Joel Grant', 'lost', 600),
  O('SLOT-OLD-77', '+12125550150', 'Priya Natarajan', 'offered', 40),
  O('SLOT-OLD-77', '+12125550151', 'Marco Lindqvist', 'offered', 40),
  O('SLOT-OLD-77', '+12125550152', 'Omar Haddad', 'declined', 40),
].map(json => ({ json }));`),
    merge('Combine waitlist data', 3),
    switchOn('Cancellation or reply?', "$('Combine event sources').first().json.type", ['cancellation', 'reply']),
    stop('STOP: unknown event'),
    code('Pick who gets the offer', `
// Eligible = waiting, right service (or Any), available that date, right time of day,
// valid mobile, and no Offers row for this slot and number. Longest waiting first.
const cfg = $('config').first().json;
${HELPERS}
const { slot } = $('Combine event sources').first().json;
const rows = $input.all().map(i => i.json);
const waitlist = rows.filter(r => r.Name && 'Preferred time' in r);
const offered = new Set(rows.filter(r => r['Offer ID']).map(r => r['Slot ID'] + ':' + r.Phone));
const startMs = new Date(slot.starts_at).getTime();
const slotDate = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone }).format(new Date(startMs));
const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(startMs))) % 24;
const tod = Object.entries(cfg.time_of_day).find(([, [a, b]]) => hour >= a && hour < b)?.[0] || 'Any';
const eligible = [], skipped = [];
if (startMs - Date.now() < cfg.min_notice_minutes * 6e4) skipped.push({ name: slot.id, reason: 'slot starts too soon to fill' });
else for (const w of waitlist) {
  const phone = toE164(w.Phone);
  const svc = String(w.Service || '').trim().toLowerCase();
  const pref = String(w['Preferred time'] || 'Any').trim();
  const reason =
    String(w.Status || '').trim().toLowerCase() !== 'waiting' ? 'status ' + String(w.Status).toLowerCase() :
    svc !== 'any' && svc !== String(slot.service).toLowerCase() ? 'wants ' + w.Service :
    w['Available from'] && slotDate < String(w['Available from']).slice(0, 10) ? 'not available until ' + w['Available from'] :
    w['Available until'] && slotDate > String(w['Available until']).slice(0, 10) ? 'only available until ' + w['Available until'] :
    pref !== 'Any' && pref !== tod ? 'prefers ' + pref + ', slot is ' + tod :
    !phone ? 'no valid mobile number' :
    offered.has(slot.id + ':' + phone) ? 'already offered this slot' : '';
  if (reason) skipped.push({ name: w.Name, reason });
  else eligible.push({ name: w.Name, phone, added: String(w.Added || '') });
}
eligible.sort((a, b) => a.added.localeCompare(b.added));
const chosen = eligible.slice(0, cfg.offer_to_first_n);
for (const e of eligible.slice(cfg.offer_to_first_n)) skipped.push({ name: e.name, reason: 'waitlisted behind the first ' + cfg.offer_to_first_n });
const now = new Date().toISOString();
const texts = chosen.map(c => ({ phone: c.phone, name: c.name, body: 'Hi ' + c.name.split(' ')[0] + ', a ' + slot.service + ' slot just opened at ' + cfg.business_name + ': ' +
  when(slot.starts_at) + (slot.provider ? ' with ' + slot.provider : '') + '. Reply YES to take it. First YES gets it. Reply STOP to opt out.' }));
const rowsOut = chosen.map(c => ({ 'Offer ID': slot.id + ':' + c.phone, 'Slot ID': slot.id, Phone: c.phone, Name: c.name, Service: slot.service,
  'Starts at': slot.starts_at, Provider: slot.provider, Status: 'offered', 'Sent at': now, 'Updated at': now }));
return [{ json: { event: 'cancellation', slot_id: slot.id, texts, rows: rowsOut, skipped } }];`),
    code('Settle the reply', `
// First YES inside OFFER_EXPIRY_MINUTES wins; everyone else offered that slot is told.
// A YES for a slot already won, or an expired offer, gets a polite "gone" reply.
const cfg = $('config').first().json;
${HELPERS}
const ev = $('Combine event sources').first().json;
const offers = $input.all().map(i => i.json).filter(r => r['Offer ID']);
const from = toE164(ev.from);
const word = ev.text.toLowerCase();
const intent = /^(yes|y|yes please|ok|okay|book|book it)\\b/.test(word) ? 'yes' : /^(stop|unsubscribe)\\b/.test(word) ? 'stop' : /^(no|n|no thanks)\\b/.test(word) ? 'no' : 'unclear';
const mine = offers.filter(o => o.Phone === from).sort((a, b) => String(b['Sent at']).localeCompare(String(a['Sent at'])));
const open = mine.find(o => o.Status === 'offered');
const now = new Date().toISOString();
const texts = [], rows = [];
let outcome;
if (!open) {
  outcome = mine.length ? 'no open offer (' + mine[0].Status + ')' : 'number not on any offer';
  if (mine.length && intent === 'yes') texts.push({ phone: from, name: mine[0].Name, body: 'Sorry, that slot has already been taken. You are still on the waitlist.' });
} else if (intent === 'no' || intent === 'stop') {
  outcome = 'declined';
  rows.push({ ...open, Status: intent === 'stop' ? 'opted out' : 'declined', 'Updated at': now });
  if (intent === 'no') texts.push({ phone: from, name: open.Name, body: 'No problem. You stay on the waitlist for the next opening.' });
} else if (intent !== 'yes') {
  outcome = 'unclear reply';
  texts.push({ phone: from, name: open.Name, body: 'Sorry, we did not catch that. Reply YES to take the slot or NO to pass.' });
} else {
  const slotRows = offers.filter(o => o['Slot ID'] === open['Slot ID']);
  const won = slotRows.find(o => o.Status === 'won');
  const expired = Date.now() - new Date(open['Sent at']).getTime() > cfg.offer_expiry_minutes * 6e4;
  if (won || expired) {
    outcome = won ? 'too late, ' + won.Name + ' won' : 'offer expired';
    rows.push({ ...open, Status: won ? 'lost' : 'expired', 'Updated at': now });
    texts.push({ phone: from, name: open.Name, body: 'Sorry, that slot has gone. You are still on the waitlist and we will text you about the next one.' });
  } else {
    outcome = 'won';
    rows.push({ ...open, Status: 'won', 'Updated at': now });
    texts.push({ phone: from, name: open.Name, body: 'You are booked: ' + open.Service + ' at ' + cfg.business_name + ', ' + when(open['Starts at']) + (open.Provider ? ' with ' + open.Provider : '') + '. See you then.' });
    for (const o of slotRows.filter(o => o.Status === 'offered' && o.Phone !== from)) {
      rows.push({ ...o, Status: 'lost', 'Updated at': now });
      texts.push({ phone: o.Phone, name: o.Name, body: 'The ' + o.Service + ' slot on ' + when(o['Starts at']) + ' has been taken. You are still on the waitlist.' });
    }
  }
}
return [{ json: { event: 'reply', from, intent, outcome, slot_id: open ? open['Slot ID'] : '', texts, rows, skipped: [] } }];`),
    merge('Combine planned texts'),
    code('Split into texts', `
// One item per text; test mode sends every one to TEST_PHONE.
const cfg = $('config').first().json;
const plan = $input.first().json;
return plan.texts.map(t => ({ json: { ...t, send_to: cfg.mode === 'test' ? cfg.test_phone : t.phone } })).filter(t => t.json.send_to);`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    twilio.send('Text with Twilio', { from: cfg('twilio_from'), to: '$json.send_to', message: "($('config').first().json.mode === 'test' ? '[TEST for ' + $json.phone + '] ' : '') + $json.body" }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - Offers tab untouched'),
    code('Shape the Offers rows', `
// The rows decided above, once, after the texts went out.
return $('Combine planned texts').first().json.rows.map(json => ({ json }));`),
    sheets.upsert('Update the Offers tab', cfg('waitlist_sheet_id'), 'Offers', 'Offer ID'),
  ],
  edges: [
    ['Run manually', 'config'], ['Receive a cancellation', 'config'], ['Receive an SMS reply', 'config'],
    ['config', 'Read the incoming event'],
    ['Read the incoming event', 'Event received?'],
    ['Event received?', 0, 'Combine event sources'], ['Event received?', 1, 'Load sample cancellation'],
    ['Load sample cancellation', 0, 'Combine event sources', 1],
    ['Combine event sources', 'Waitlist sheet set?'],
    ['Waitlist sheet set?', 0, 'Read the Waitlist tab'], ['Waitlist sheet set?', 0, 'Read the Offers tab'], ['Waitlist sheet set?', 1, 'Load sample waitlist and offers'],
    ['Read the Waitlist tab', 'Combine waitlist data'], ['Read the Offers tab', 0, 'Combine waitlist data', 1], ['Load sample waitlist and offers', 0, 'Combine waitlist data', 2],
    ['Combine waitlist data', 'Cancellation or reply?'],
    ['Cancellation or reply?', 0, 'Pick who gets the offer'], ['Cancellation or reply?', 1, 'Settle the reply'], ['Cancellation or reply?', 2, 'STOP: unknown event'],
    ['Pick who gets the offer', 'Combine planned texts'], ['Settle the reply', 0, 'Combine planned texts', 1],
    ['Combine planned texts', 'Split into texts'],
    ['Split into texts', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Text with Twilio'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Text with Twilio', 'Live run?'],
    ['Live run?', 0, 'Shape the Offers rows'], ['Live run?', 1, 'STOP: test send - Offers tab untouched'],
    ['Shape the Offers rows', 'Update the Offers tab'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Two webhooks share one workflow: the booking tool calls `Receive a cancellation` and Twilio calls `Receive an SMS reply`. Keeping both together means the offer and the reply rules read the same `config`.', nodes: ['Run manually', 'Receive a cancellation', 'Receive an SMS reply', 'config'] },
    { title: 'Read the event', why: '`Read the incoming event` turns either webhook body into one event shape and rejects a body with no slot or no sender. A manual run falls through to `Load sample cancellation`.', nodes: ['Read the incoming event', 'Event received?', 'Load sample cancellation', 'Combine event sources'] },
    { title: 'Read waitlist and offers', why: 'Both events need the Offers tab: a cancellation to avoid offering the same slot twice, a reply to find the open offer. The sample rows include an open offer, so the reply path can be tested with no sheet.', nodes: ['Waitlist sheet set?', 'Read the Waitlist tab', 'Read the Offers tab', 'Load sample waitlist and offers', 'Combine waitlist data'] },
    { title: 'Decide the texts', why: 'The first YES wins because `Settle the reply` checks the Offers tab for a winner before confirming. Late or expired replies get a polite no. Both branches return texts and rows in one shape.', nodes: ['Cancellation or reply?', 'Pick who gets the offer', 'Settle the reply', 'STOP: unknown event', 'Combine planned texts', 'Split into texts'] },
    { title: 'Text and record', why: 'Nothing is texted while `TEST_RUN` is true and `TEST_EMAIL` is blank. Test texts go to `TEST_PHONE` and the Offers tab is written only on a live run, so tests never claim a slot.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Text with Twilio', 'Live run?', 'STOP: test send - Offers tab untouched', 'Shape the Offers rows', 'Update the Offers tab'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample cancellation, preview)', start: 'Run manually',
      expect: { reached: ['Load sample cancellation', 'Load sample waitlist and offers', 'Pick who gets the offer', 'STOP: preview - nothing sent'], notReached: ['Settle the reply'], outward: 'none' },
      check: out => {
        const p = out['Pick who gets the offer'][0];
        const f: string[] = [];
        const names = p.texts.map((t: any) => t.name).join(',');
        if (names !== 'Rosa Diaz,Lee Chen,Dana Okafor') f.push(`expected Rosa, Lee, Dana; got ${names}`);
        const why = (n: string) => p.skipped.find((s: any) => s.name === n)?.reason || '';
        const want: Record<string, string> = { 'Ken Ito': 'wants Massage', 'Mia Novak': 'prefers Evening, slot is Morning', 'Joel Grant': 'already offered this slot', 'Tom Becker': 'status booked', 'Sam Patel': 'no valid mobile number' };
        for (const [n, r] of Object.entries(want)) if (why(n) !== r) f.push(`${n} should be skipped as "${r}", got "${why(n)}"`);
        if (!why('Ana Ruiz').startsWith('only available until')) f.push('Ana is not available on the slot date');
        if (p.rows[1]?.Phone !== '+19175550123') f.push('Lee phone should normalise to +19175550123');
        return f;
      },
    },
    {
      name: 'first YES wins (test mode)', start: 'Receive an SMS reply',
      overrides: { TEST_EMAIL: 'you@example.com', TEST_PHONE: '+15555550199', TWILIO_FROM: '+15555550100' },
      input: [{ headers: { 'content-type': 'application/x-www-form-urlencoded' }, params: {}, query: {}, body: { From: '+12125550151', To: '+15555550100', Body: 'Yes please!', MessageSid: 'SM123' } }],
      mocks: { 'Text with Twilio': (items: any[]) => items.map((i, k) => ({ sid: 'SMt' + k, to: i.send_to })) },
      expect: { reached: ['Settle the reply', 'Text with Twilio', 'STOP: test send - Offers tab untouched'], notReached: ['Pick who gets the offer', 'Update the Offers tab'], outward: 'some' },
      check: out => {
        const s = out['Settle the reply'][0];
        const f: string[] = [];
        if (s.outcome !== 'won') f.push(`Marco should win, got ${s.outcome}`);
        const lost = s.rows.filter((r: any) => r.Status === 'lost').map((r: any) => r.Name);
        if (lost.join(',') !== 'Priya Natarajan') f.push('Priya (still offered) should lose; Omar declined already');
        if (s.texts.length !== 2) f.push('winner confirmation plus one "taken" text');
        if (!out['Split into texts'].every((t: any) => t.send_to === '+15555550199')) f.push('test mode texts TEST_PHONE');
        return f;
      },
    },
    {
      name: 'live late YES after the slot was won', start: 'Receive an SMS reply',
      overrides: { WAITLIST_SHEET_ID: '1WaitlistSheetExample', TEST_RUN: false, TWILIO_FROM: '+15555550100' },
      input: [{ headers: {}, params: {}, query: {}, body: { From: '+1 212 555 0150', Body: 'YES', MessageSid: 'SM9' } }],
      mocks: {
        'Read the Waitlist tab': [],
        'Read the Offers tab': () => {
          const t = new Date(Date.now() - 20 * 6e4).toISOString();
          const row = (phone: string, name: string, status: string) => ({ row_number: 2, 'Offer ID': 'S9:' + phone, 'Slot ID': 'S9', Phone: phone, Name: name, Service: 'Massage', 'Starts at': new Date(Date.now() + 864e5).toISOString(), Provider: '', Status: status, 'Sent at': t, 'Updated at': t });
          return [row('+12125550150', 'Priya Natarajan', 'offered'), row('+12125550151', 'Marco Lindqvist', 'won')];
        },
        'Text with Twilio': [{ sid: 'SMlive', status: 'queued' }],
        'Update the Offers tab': (items: any[]) => items,
      },
      expect: { reached: ['Text with Twilio', 'Update the Offers tab'], notReached: ['Load sample waitlist and offers'], outward: 'some' },
      check: out => {
        const s = out['Settle the reply'][0];
        const f: string[] = [];
        if (!s.outcome.startsWith('too late')) f.push(`second YES must lose, got ${s.outcome}`);
        if (s.rows[0]?.Status !== 'lost') f.push('late YES row should be marked lost');
        return f;
      },
    },
  ],
});
