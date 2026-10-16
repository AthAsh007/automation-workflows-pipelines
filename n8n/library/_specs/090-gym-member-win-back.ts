import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'gym-member-win-back',
  title: 'Win back gym members with no recent check-ins via Gmail',
  summary: 'Each week reads members and their last check-in from Google Sheets, puts inactive members on a 14, 30 or 60-day tier with its own offer, skips frozen, cancelled, opted-out and recently contacted members, emails up to a weekly cap and writes the contact date back.',
  category: 'Local business and services',
  description: {
    who: 'Independent gyms, studios and climbing walls that track members in a spreadsheet and notice lapsed members only when they cancel. It catches people at two weeks away, while a friendly nudge still works.',
    how: [
      'Every Tuesday at 10:00 it reads the Members tab, or 10 sample members until a sheet is set.',
      'Days inactive = days since the last check-in, or since joining for someone who never came. Members inactive 14, 30 or 60 days land on that tier, each with its own offer and tone.',
      'Frozen and cancelled memberships, opted-out members, members who joined in the last 14 days and anyone contacted in the last 30 days are held back with a reason.',
      'The 14-day tier goes first because those members come back most often, then `WEEKLY_CAP` applies. Each email is sent through Gmail and the contact date and offer are written to the member row.',
    ],
    setup: [
      'Run it once as imported. It previews against sample members and stops at `STOP: preview - nothing sent`.',
      'Make sure your Members tab has Member ID, Name, Email, Status, Joined, Last check-in, Last contacted and Opt out columns, connect Google Sheets and set `MEMBERS_SHEET_ID`.',
      'Connect Gmail and edit the offers in `TIERS` and the sign-off in `GYM_NAME`.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet of members with a last check-in date', 'A Gmail account'],
    customize: [
      '`TIERS` sets the day thresholds, offers and subject lines.',
      '`CONTACT_COOLDOWN_DAYS` stops the same member hearing from you more than once a month.',
      '`WEEKLY_CAP` limits emails per run so front desk can handle the replies.',
    ],
  },
  config: {
    intro: ['MEMBERS_SHEET_ID blank -> SAMPLE members so the run works before any credential exists.', 'Only a live run writes Last contacted back to the sheet.'],
    consts: [
      { name: 'MEMBERS_SHEET_ID', value: '', note: 'Google Sheets id holding the Members tab; blank uses sample members' },
      { name: 'TIERS', value: [
        { tier: 1, days: 14, offer: 'a free session with a coach', subject: 'We have missed you at {gym}' },
        { tier: 2, days: 30, offer: 'a free week to get back into it', subject: 'A free week on us, {first}' },
        { tier: 3, days: 60, offer: '50% off your next month', subject: 'Half price to come back to {gym}' },
      ], note: 'days inactive that unlock each tier, the offer and the subject line' },
      { name: 'CONTACT_COOLDOWN_DAYS', value: 30, note: 'members contacted this recently are skipped' },
      { name: 'NEW_MEMBER_DAYS', value: 14, note: 'members who joined this recently are never chased' },
      { name: 'SKIP_STATUSES', value: ['frozen', 'cancelled', 'canceled', 'paused'], note: 'membership statuses that are never emailed' },
      { name: 'WEEKLY_CAP', value: 40, note: 'hard ceiling on emails per run' },
      { name: 'GYM_NAME', value: 'Northside Strength', note: 'used in subjects and the sign-off' },
      { name: 'BOOKING_URL', value: 'https://northside-strength.example/book', note: 'link in every email' },
    ],
    flags: { sheets_enabled: "MEMBERS_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Tuesday at 10:00', '0 10 * * 2'),
    ifTrue('Members sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Members tab', cfg('members_sheet_id'), 'Members'),
    code('Load sample members', `
// Used until MEMBERS_SHEET_ID is set. One member per rule the picker has.
const day = n => n === null ? '' : new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const m = (id, name, status, joined, last, contacted, optOut = '') => ({
  'Member ID': id, Name: name, Email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@mail.example',
  Status: status, Joined: day(joined), 'Last check-in': day(last), 'Last contacted': day(contacted), 'Opt out': optOut });
return [
  m('M-101', 'Sam Patel', 'active', 400, 3, null),
  m('M-102', 'Rosa Diaz', 'active', 300, 16, null),
  m('M-103', 'Ken Ito', 'active', 500, 41, null),
  m('M-104', 'Mia Novak', 'active', 700, 95, null),
  m('M-105', 'Joel Grant', 'frozen', 200, 50, null),
  m('M-106', 'Ana Ruiz', 'active', 250, 33, 12),
  m('M-107', 'Lee Chen', 'active', 9, null, null),
  m('M-108', 'Dana Okafor', 'active', 40, null, null),
  m('M-109', 'Tom Becker', 'Cancelled', 900, 120, null),
  m('M-110', 'Priya Natarajan', 'active', 365, 20, null, 'yes'),
].map(json => ({ json }));`),
    merge('Combine member sources'),
    code('Pick members to win back', `
// Tier = highest threshold reached by days inactive. Hold-back rules run first and
// each one says why. Tier 1 goes first (most likely to return), then WEEKLY_CAP.
const cfg = $('config').first().json;
const tiers = [...cfg.tiers].sort((a, b) => a.days - b.days);
const today = Date.parse(new Date().toISOString().slice(0, 10));
const daysSince = s => { const t = Date.parse(String(s || '').slice(0, 10)); return t ? Math.floor((today - t) / 864e5) : null; };
const pick = [], held = [];
let read = 0;
for (const { json: r } of $input.all()) {
  if (!r['Member ID']) continue;
  read++;
  const joined = daysSince(r.Joined);
  const lastIn = daysSince(r['Last check-in']);
  const inactive = lastIn ?? joined;
  const contacted = daysSince(r['Last contacted']);
  const tier = inactive === null ? null : [...tiers].reverse().find(t => inactive >= t.days);
  const reason =
    !String(r.Email || '').includes('@') ? 'no email' :
    cfg.skip_statuses.includes(String(r.Status || '').trim().toLowerCase()) ? 'status ' + String(r.Status).toLowerCase() :
    /^(yes|true|x|1)$/i.test(String(r['Opt out'] || '').trim()) ? 'opted out' :
    joined !== null && joined < cfg.new_member_days ? 'joined ' + joined + ' days ago' :
    contacted !== null && contacted < cfg.contact_cooldown_days ? 'contacted ' + contacted + ' days ago' :
    !tier ? 'active (' + inactive + ' days since last visit)' : '';
  if (reason) { held.push({ id: r['Member ID'], name: r.Name, reason }); continue; }
  pick.push({ id: r['Member ID'], name: r.Name, email: String(r.Email).trim(), inactive, never_visited: lastIn === null, tier: tier.tier, offer: tier.offer, subject_tpl: tier.subject });
}
pick.sort((a, b) => a.tier - b.tier || a.inactive - b.inactive);
for (const p of pick.slice(cfg.weekly_cap)) held.push({ id: p.id, name: p.name, reason: 'over WEEKLY_CAP, next week' });
return [{ json: { members: pick.slice(0, cfg.weekly_cap), held, read } }];`),
    code('Write each win-back email', `
// Wording changes with the tier; the facts (days away, offer, link) come from the row.
const cfg = $('config').first().json;
const first = n => String(n || '').split(' ')[0] || 'there';
const openers = {
  1: 'We noticed it has been a couple of weeks since your last visit.',
  2: 'It has been about a month since we last saw you, and routines slip. That is normal.',
  3: 'It has been a while, and we would love to have you back.',
};
return $input.first().json.members.map(m => {
  const subject = m.subject_tpl.replace('{gym}', cfg.gym_name).replace('{first}', first(m.name));
  const body = [
    'Hi ' + first(m.name) + ',', '',
    m.never_visited ? 'You joined ' + m.inactive + ' days ago and we have not seen you on the floor yet.' : (openers[m.tier] || openers[1]),
    'To make it easy, here is ' + m.offer + '. Just mention this email at the desk.', '',
    'Book a time: ' + cfg.booking_url, '',
    'See you soon,', cfg.gym_name,
  ].join('\\n');
  return { json: { ...m, subject, body, send_to: cfg.mode === 'test' ? cfg.test_email : m.email } };
});`),
    code('Summarise the run', `
// Execution log: who gets which tier and who was held back.
const cfg = $('config').first().json;
const r = $input.first().json;
const by = t => r.members.filter(m => m.tier === t).length;
const text = [
  'Win-back (' + cfg.mode + '): ' + r.read + ' members read, ' + r.members.length + ' emails (tier 1: ' + by(1) + ', tier 2: ' + by(2) + ', tier 3: ' + by(3) + ').',
  ...r.held.map(h => '- held ' + h.name + ': ' + h.reason),
].join('\\n');
return [{ json: { text, emails: r.members.length, held: r.held.length } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the member', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - sheet untouched'),
    code('Shape the contact update', `
// Only the match column and the two columns being written.
const today = new Date().toISOString().slice(0, 10);
return $('Write each win-back email').all().map((m, i) => ({ json: { 'Member ID': m.json.id, 'Last contacted': today, 'Last offer': 'tier ' + m.json.tier + ': ' + m.json.offer } }))
  .slice(0, $input.all().length);`),
    sheets.update('Record the contact date', cfg('members_sheet_id'), 'Members', 'Member ID'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Tuesday at 10:00', 'config'],
    ['config', 'Members sheet set?'],
    ['Members sheet set?', 0, 'Read the Members tab'], ['Members sheet set?', 1, 'Load sample members'],
    ['Read the Members tab', 'Combine member sources'], ['Load sample members', 0, 'Combine member sources', 1],
    ['Combine member sources', 'Pick members to win back'],
    ['Pick members to win back', 'Write each win-back email'],
    ['Pick members to win back', 'Summarise the run'],
    ['Write each win-back email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the member'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the member', 'Live run?'],
    ['Live run?', 0, 'Shape the contact update'], ['Live run?', 1, 'STOP: test send - sheet untouched'],
    ['Shape the contact update', 'Record the contact date'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Tuesday at 10:00, after the Monday rush shows who did not come back. Tiers, offers, the cooldown and the weekly cap all live in `config`.', nodes: ['Run manually', 'Every Tuesday at 10:00', 'config'] },
    { title: 'Read members', why: 'One read of the Members tab gives status, join date, last check-in and last contact in a single row per member. `Load sample members` covers every hold-back rule until `MEMBERS_SHEET_ID` is set.', nodes: ['Members sheet set?', 'Read the Members tab', 'Load sample members', 'Combine member sources'] },
    { title: 'Pick tiers and write emails', why: 'Hold-back rules run before tiering, so a frozen member at 60 days never gets the half-price offer. A member who joined and never came uses the join date and gets different wording.', nodes: ['Pick members to win back', 'Write each win-back email', 'Summarise the run'] },
    { title: 'Send and record', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. Only a live run writes Last contacted, which is what the 30-day cooldown reads next week.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the member', 'Live run?', 'STOP: test send - sheet untouched', 'Shape the contact update', 'Record the contact date'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample members', 'STOP: preview - nothing sent', 'Summarise the run'], outward: 'none' },
      check: out => {
        const p = out['Pick members to win back'][0];
        const f: string[] = [];
        const tiers = p.members.map((m: any) => m.id + ':' + m.tier).join(',');
        if (tiers !== 'M-102:1,M-108:2,M-103:2,M-104:3') f.push(`expected M-102:1,M-108:2,M-103:2,M-104:3, got ${tiers}`);
        const reason = (id: string) => p.held.find((h: any) => h.id === id)?.reason;
        const want: Record<string, string> = { 'M-101': 'active (3 days since last visit)', 'M-105': 'status frozen', 'M-106': 'contacted 12 days ago', 'M-107': 'joined 9 days ago', 'M-109': 'status cancelled', 'M-110': 'opted out' };
        for (const [id, r] of Object.entries(want)) if (reason(id) !== r) f.push(`${id} should be held as "${r}", got "${reason(id)}"`);
        const dana = out['Write each win-back email'].find((e: any) => e.id === 'M-108');
        if (!dana?.body.includes('not seen you on the floor yet')) f.push('never-visited member needs the join-date wording');
        return f;
      },
    },
    {
      name: 'live send and write-back', start: 'Every Tuesday at 10:00',
      overrides: { MEMBERS_SHEET_ID: '1MembersSheetExample', TEST_RUN: false, WEEKLY_CAP: 1 },
      mocks: {
        'Read the Members tab': () => [
          { row_number: 2, 'Member ID': 'X1', Name: 'Ola Berg', Email: 'ola@mail.example', Status: 'Active', Joined: '2025-01-10', 'Last check-in': new Date(Date.now() - 70 * 864e5).toISOString().slice(0, 10), 'Last contacted': '', 'Opt out': '' },
          { row_number: 3, 'Member ID': 'X2', Name: 'Ivy Moss', Email: 'ivy@mail.example', Status: 'Active', Joined: '2025-01-10', 'Last check-in': new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 10), 'Last contacted': new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10), 'Opt out': '' },
        ],
        'Email the member': [{ id: 'msg-1', labelIds: ['SENT'] }],
        'Record the contact date': (items: any[]) => items,
      },
      expect: { reached: ['Email the member', 'Record the contact date'], notReached: ['Load sample members'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const u = out['Shape the contact update'];
        if (u.length !== 1 || u[0]['Member ID'] !== 'X2') f.push('cap 1 should send to tier-1 Ivy first');
        if (!out['Pick members to win back'][0].held.some((h: any) => h.id === 'X1' && h.reason.startsWith('over WEEKLY_CAP'))) f.push('Ola should wait for next week');
        return f;
      },
    },
  ],
});
