import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'birthday-anniversary-slack',
  title: 'Post birthdays and work anniversaries from Google Sheets to Slack',
  summary: 'Reads a staff sheet every weekday, finds today\'s birthdays and work anniversaries (weekend ones on Friday, 29 February on the 28th), respects opt-outs, calls out milestone years and posts one combined Slack message.',
  category: 'HR and people',
  description: {
    who: 'Office managers and people teams at companies of 15 to 500 who keep a staff list in Google Sheets and keep missing birthdays that fall on a weekend. One message a day, nobody forgotten, nobody posted against their wishes.',
    how: [
      'Every weekday at 09:00 it reads the People tab, or sample staff until a sheet id is set.',
      'Birthdays and start-date anniversaries matching today are collected. On Friday, Saturday and Sunday dates are included too, and 29 February counts on 28 February in non-leap years.',
      'People with `birthday`, `anniversary` or `all` in the opt_out column are left out, as are inactive rows and anniversaries under one year.',
      'Anniversaries in `MILESTONE_YEARS` get their own line. Everything goes out as one Slack message, at most once per day.',
    ],
    setup: [
      'Run it once as imported. It builds the message for sample staff and stops at `STOP: dry run - nothing posted`.',
      'Create a People tab with name, slack_user_id, birthday (MM-DD or YYYY-MM-DD), start_date, opt_out and active columns. Connect Google Sheets and set `PEOPLE_SHEET_ID`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Check the text in `Write the message`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Google Sheet listing staff', 'A Slack workspace'],
    customize: [
      '`MILESTONE_YEARS` picks the anniversaries that get a bigger shout-out.',
      '`LEAP_DAY_RULE` moves 29 February birthdays to `feb28` or `mar1` in non-leap years.',
      '`WEEKEND_ON_FRIDAY = false` posts weekend dates on Monday instead.',
    ],
  },
  config: {
    intro: ['PEOPLE_SHEET_ID blank -> SAMPLE staff. SLACK_CHANNEL_ID blank -> nothing is posted.', 'DRY_RUN true -> the message is built and shown, not posted.'],
    consts: [
      { name: 'PEOPLE_SHEET_ID', value: '', note: 'Google Sheets id with a People tab; blank uses sample staff' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the daily message; blank skips Slack' },
      { name: 'MILESTONE_YEARS', value: [1, 5, 10, 15, 20, 25], note: 'anniversaries that get their own line' },
      { name: 'LEAP_DAY_RULE', value: 'feb28', note: "29 February in non-leap years: 'feb28' or 'mar1'" },
      { name: 'WEEKEND_ON_FRIDAY', value: true, note: 'true: Friday also covers Saturday and Sunday. false: Monday covers the weekend just gone' },
      { name: 'RUN_DATE', value: '', note: "blank = today. Set 'YYYY-MM-DD' to preview another day" },
    ],
    flags: { sheets_enabled: "PEOPLE_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 09:00', '0 9 * * 1-5'),
    ifTrue('People sheet set?', cfg('sheets_enabled')),
    sheets.read('Read People tab', cfg('people_sheet_id'), 'People'),
    code('Load sample people', `
// Used until PEOPLE_SHEET_ID is set. Dates are relative to the run date so there is always a match.
const cfg = $('config').first().json;
const base = new Date((cfg.run_date || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
const md = n => new Date(base.getTime() + n * 864e5).toISOString().slice(5, 10);
const yearsAgo = (y, n = 0) => (base.getUTCFullYear() - y) + '-' + md(n);
return [
  { name: 'Amara Osei', slack_user_id: 'U01AMARA', birthday: md(0), start_date: yearsAgo(3, 40), opt_out: '', active: 'yes' },
  { name: 'Ben Hollis', slack_user_id: 'U01BENH', birthday: '1990-' + md(0), start_date: yearsAgo(2, 90), opt_out: 'birthday', active: 'yes' },
  { name: 'Carla Mendes', slack_user_id: 'U01CARLA', birthday: md(120), start_date: yearsAgo(10), opt_out: '', active: 'yes' },
  { name: 'Dev Raman', slack_user_id: '', birthday: md(200), start_date: yearsAgo(3), opt_out: '', active: 'yes' },
  { name: 'Elif Kaya', slack_user_id: 'U01ELIF', birthday: md(60), start_date: yearsAgo(0), opt_out: '', active: 'yes' },
  { name: 'Finn Doyle', slack_user_id: 'U01FINN', birthday: md(0), start_date: yearsAgo(6, 10), opt_out: '', active: 'no' },
  { name: 'Gia Romano', slack_user_id: 'U01GIA', birthday: md(150), start_date: yearsAgo(4), opt_out: 'all', active: 'yes' },
].map(json => ({ json }));`),
    merge('Combine people sources'),
    code('Find today\'s celebrations', `
// Which calendar days this run covers: today, plus Sat/Sun on a Friday (or the weekend
// just gone on a Monday). 29 Feb maps to LEAP_DAY_RULE in non-leap years.
const cfg = $('config').first().json;
const runDate = cfg.run_date || new Date().toISOString().slice(0, 10);
const base = new Date(runDate + 'T00:00:00Z');
const dow = base.getUTCDay();
const offsets = [0];
if (cfg.weekend_on_friday && dow === 5) offsets.push(1, 2);
if (!cfg.weekend_on_friday && dow === 1) offsets.push(-1, -2);
const days = offsets.map(n => new Date(base.getTime() + n * 864e5));
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const label = d => ({ 0: 'today', 1: 'Saturday', 2: 'Sunday', '-1': 'Sunday', '-2': 'Saturday' })[Math.round((d - base) / 864e5)];
// the day a MM-DD is celebrated in the year of d
const celebrated = (mmdd, d) => {
  if (mmdd !== '02-29' || leap(d.getUTCFullYear())) return mmdd;
  return cfg.leap_day_rule === 'mar1' ? '03-01' : '02-28';
};
const mmddOf = v => { const m = String(v || '').trim().match(/(\\d{2})-(\\d{2})$/); return m ? m[1] + '-' + m[2] : ''; };
const birthdays = [], anniversaries = [], skipped = [];
for (const { json: p } of $input.all()) {
  if (!p.name) continue;
  const optOut = String(p.opt_out || '').toLowerCase();
  const inactive = ['no', 'false', 'inactive', 'left'].includes(String(p.active || 'yes').toLowerCase());
  const tag = p.slack_user_id ? '<@' + p.slack_user_id + '>' : p.name;
  const b = mmddOf(p.birthday);
  const bDay = b && days.find(d => celebrated(b, d) === d.toISOString().slice(5, 10));
  if (bDay) {
    if (inactive) skipped.push({ name: p.name, reason: 'inactive' });
    else if (['birthday', 'all'].includes(optOut)) skipped.push({ name: p.name, reason: 'opted out of birthdays' });
    else birthdays.push({ name: p.name, tag, when: label(bDay) });
  }
  const s = String(p.start_date || '').slice(0, 10);
  const aDay = s && days.find(d => celebrated(s.slice(5), d) === d.toISOString().slice(5, 10));
  if (aDay) {
    const years = aDay.getUTCFullYear() - Number(s.slice(0, 4));
    if (years < 1) continue;
    if (inactive) skipped.push({ name: p.name, reason: 'inactive' });
    else if (['anniversary', 'all'].includes(optOut)) skipped.push({ name: p.name, reason: 'opted out of anniversaries' });
    else anniversaries.push({ name: p.name, tag, years, milestone: cfg.milestone_years.includes(years), when: label(aDay) });
  }
}
anniversaries.sort((a, b) => b.years - a.years);
return [{ json: { run_date: runDate, covers: days.map(d => d.toISOString().slice(0, 10)), birthdays, anniversaries, skipped } }];`),
    ifTrue('Anyone to celebrate?', '$json.birthdays.length + $json.anniversaries.length > 0'),
    stop('STOP: nobody to celebrate today'),
    code('Write the message', `
// One message. Milestones first, then the rest; weekend dates say which day.
const store = $getWorkflowStaticData('global');
const c = $input.first().json;
const when = x => x.when === 'today' ? '' : ' (' + x.when + ')';
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
const lines = [];
const big = c.anniversaries.filter(a => a.milestone), rest = c.anniversaries.filter(a => !a.milestone);
if (c.birthdays.length) lines.push(':birthday: Happy birthday ' + c.birthdays.map(b => b.tag + when(b)).join(', ') + '!');
for (const a of big) lines.push(':tada: ' + a.tag + ' celebrates ' + a.years + (a.years === 1 ? ' year' : ' years') + ' with us' + when(a) + '. A ' + ord(a.years) + ' work anniversary milestone!');
if (rest.length) lines.push(':clap: Work anniversaries: ' + rest.map(a => a.tag + ' (' + a.years + ' years)' + when(a)).join(', ') + '.');
return [{ json: { text: lines.join('\\n'), already_posted: store.last_posted === c.run_date, run_date: c.run_date } }];`),
    ifWhen('Post to Slack?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true'], ['$json.already_posted', 'false']]),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post celebrations to Slack', cfg('slack_channel_id'), "$('Write the message').first().json.text"),
    code('Remember today\'s post', `
// A second run on the same day stops at Post to Slack? instead of posting twice.
const store = $getWorkflowStaticData('global');
store.last_posted = $('Write the message').first().json.run_date;
return [{ json: { last_posted: store.last_posted } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 09:00', 'config'],
    ['config', 'People sheet set?'],
    ['People sheet set?', 0, 'Read People tab'], ['People sheet set?', 1, 'Load sample people'],
    ['Read People tab', 'Combine people sources'], ['Load sample people', 0, 'Combine people sources', 1],
    ['Combine people sources', 'Find today\'s celebrations'],
    ['Find today\'s celebrations', 'Anyone to celebrate?'],
    ['Anyone to celebrate?', 0, 'Write the message'], ['Anyone to celebrate?', 1, 'STOP: nobody to celebrate today'],
    ['Write the message', 'Post to Slack?'],
    ['Post to Slack?', 0, 'Post celebrations to Slack'], ['Post to Slack?', 1, 'STOP: dry run - nothing posted'],
    ['Post celebrations to Slack', 'Remember today\'s post'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 09:00 or by hand. `RUN_DATE` lets you preview any day, which is the quickest way to check the Friday and 29 February rules before going live.', nodes: ['Run manually', 'Every weekday at 09:00', 'config'] },
    { title: 'Read the staff list', why: '`People sheet set?` reads the People tab once `PEOPLE_SHEET_ID` is filled. `Load sample people` builds dates from the run date, so the sample always has a birthday, an opt-out and a 10-year anniversary to show.', nodes: ['People sheet set?', 'Read People tab', 'Load sample people', 'Combine people sources'] },
    { title: 'Find who to celebrate', why: '`Find today\'s celebrations` works out every calendar day the run covers first, then matches birthdays and start dates against it. Opt-outs and inactive rows are recorded as skipped, not silently dropped, and an empty day ends at its own STOP.', nodes: ['Find today\'s celebrations', 'Anyone to celebrate?', 'STOP: nobody to celebrate today'] },
    { title: 'Post once', why: 'One message per day. `Post to Slack?` needs a live run, a channel and no post already recorded for the run date, so a manual re-run after the 09:00 post does nothing.', nodes: ['Write the message', 'Post to Slack?', 'STOP: dry run - nothing posted', 'Post celebrations to Slack', 'Remember today\'s post'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample people', 'Write the message', 'STOP: dry run - nothing posted'], outward: 'none' },
      check: out => {
        const c = out['Find today\'s celebrations'][0];
        const f: string[] = [];
        const bnames = c.birthdays.map((b: any) => b.name);
        if (!bnames.includes('Amara Osei')) f.push('Amara has a birthday today');
        if (bnames.includes('Ben Hollis')) f.push('Ben opted out of birthdays');
        if (bnames.includes('Finn Doyle')) f.push('Finn is inactive');
        const carla = c.anniversaries.find((a: any) => a.name === 'Carla Mendes');
        if (carla?.years !== 10 || !carla?.milestone) f.push('Carla should have a 10-year milestone');
        if (c.anniversaries.some((a: any) => a.name === 'Elif Kaya')) f.push('a start date this year is not an anniversary');
        if (!c.anniversaries.some((a: any) => a.name === 'Dev Raman' && a.tag === 'Dev Raman' && !a.milestone)) f.push('Dev (no Slack id) should be named in plain text, 3 years');
        if (!out['Write the message'][0].text.includes('10th work anniversary')) f.push('milestone line missing');
        return f;
      },
    },
    {
      name: 'live, Friday before a leap-day weekend', start: 'Every weekday at 09:00',
      overrides: { PEOPLE_SHEET_ID: '1SheetIdExample', SLACK_CHANNEL_ID: 'C0123456', DRY_RUN: false, RUN_DATE: '2027-02-26' },
      mocks: {
        'Read People tab': [
          { row_number: 2, name: 'Hugo Laine', slack_user_id: 'U02HUGO', birthday: '1992-02-29', start_date: '2023-06-01', opt_out: '', active: 'yes' },
          { row_number: 3, name: 'Ivy Brandt', slack_user_id: 'U02IVY', birthday: '04-11', start_date: '2022-02-27', opt_out: '', active: 'yes' },
          { row_number: 4, name: 'Jon Weller', slack_user_id: 'U02JON', birthday: '02-26', start_date: '2019-02-26', opt_out: 'all', active: 'yes' },
          { row_number: 5, name: 'Kai Moreau', slack_user_id: 'U02KAI', birthday: '03-01', start_date: '2026-02-26', opt_out: '', active: 'yes' },
          { row_number: 6, name: 'Lena Voss', slack_user_id: 'U02LENA', birthday: '02-28', start_date: '2024-02-28', opt_out: 'anniversary', active: 'yes' },
        ],
        'Post celebrations to Slack': [{ ok: true, channel: 'C0123456', ts: '1700000000.0002' }],
      },
      expect: { reached: ['Post celebrations to Slack', 'Remember today\'s post'], notReached: ['Load sample people'], outward: 'some' },
      check: out => {
        const c = out['Find today\'s celebrations'][0];
        const f: string[] = [];
        if (c.covers.join() !== '2027-02-26,2027-02-27,2027-02-28') f.push(`Friday should cover the weekend, got ${c.covers}`);
        if (!c.birthdays.some((b: any) => b.name === 'Hugo Laine' && b.when === 'Sunday')) f.push('29 Feb birthday should land on Sunday 28 Feb in 2027');
        if (!c.birthdays.some((b: any) => b.name === 'Lena Voss')) f.push('Lena only opted out of anniversaries');
        if (c.birthdays.some((b: any) => b.name === 'Kai Moreau')) f.push('1 March is not covered');
        const ivy = c.anniversaries.find((a: any) => a.name === 'Ivy Brandt');
        if (ivy?.years !== 5 || !ivy.milestone) f.push('Ivy should have a 5-year milestone on Saturday');
        if (!c.anniversaries.some((a: any) => a.name === 'Kai Moreau' && a.years === 1 && a.milestone)) f.push('Kai has a first anniversary today');
        if (c.skipped.filter((s: any) => s.name === 'Jon Weller').length !== 2) f.push('Jon opted out of both');
        return f;
      },
    },
  ],
});
