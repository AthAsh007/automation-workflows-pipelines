import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const BUILD = 'Build today\'s specials post';

export default defineSpec({
  slug: 'daily-specials-telegram',
  title: 'Post daily specials from Google Sheets to a Telegram channel',
  summary: 'Posts today\'s specials from a Google Sheet to a Telegram channel at a set hour (or late, once, if that run was missed), with dated overrides, prices and allergen tags, then keeps checking the sheet during service and posts a short update when a posted dish sells out or a new one is added. An empty sheet nudges the staff chat instead of posting nothing.',
  category: 'Local business and services',
  description: {
    who: 'Cafes, restaurants and food trucks that keep their specials in a spreadsheet and post them to a Telegram channel for regulars. The kitchen edits the sheet; the post goes out on time, and regulars hear when the hake runs out without anyone opening the app.',
    how: [
      'The workflow wakes every hour. At `POST_HOUR` in your `TIMEZONE` it posts the menu; if that run was missed, the first run before `UPDATE_UNTIL_HOUR` posts it late, once. Days in `CLOSED_WEEKDAYS` and `CLOSED_DATES` are skipped.',
      'It reads the Specials tab, or 9 sample rows until a sheet is set. A row counts today when its Date is today, or its Day is today\'s weekday or Daily. A dated row replaces a weekday row with the same dish. Sold-out dishes are dropped, prices are formatted in `CURRENCY` and allergens become tags such as [V] or [N].',
      'After the post, each hourly run up to `UPDATE_UNTIL_HOUR` compares the sheet with what was posted, kept in workflow static data. A posted dish now marked sold out or removed, or a dish added since, produces one short update. No change means no message.',
      'If the sheet has nothing for today at posting time, the staff chat in `STAFF_CHAT_ID` is told once, so the channel never gets an empty menu and the kitchen knows why.',
    ],
    setup: [
      'Run it once as imported. It builds today\'s post from sample rows and stops at `STOP: preview - nothing sent`.',
      'Create a Specials tab with Day, Date, Section, Dish, Description, Price, Allergens and Sold out columns, connect Google Sheets and set `SPECIALS_SHEET_ID`.',
      'Add a Telegram bot as admin of your channel, connect it and set `TELEGRAM_CHAT_ID` (and `STAFF_CHAT_ID` for the empty-sheet nudge).',
      'For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Test sends are not remembered. Set `TEST_RUN = false` to post to the channel.',
    ],
    requirements: ['A Google Sheet with a Specials tab', 'A Telegram bot added to your channel'],
    customize: [
      '`ALLERGEN_TAGS` maps allergen words in the sheet to the tag shown in the post; `SECTION_ORDER` sets the section order.',
      '`UPDATE_UNTIL_HOUR` ends sold-out updates for the day; set it equal to `POST_HOUR` to turn them off.',
      'Add holiday closures to `CLOSED_DATES` as YYYY-MM-DD.',
    ],
  },
  config: {
    intro: ['SPECIALS_SHEET_ID blank -> SAMPLE specials so the run works before any credential exists.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_TELEGRAM_CHAT_ID and remembers nothing.'],
    consts: [
      { name: 'SPECIALS_SHEET_ID', value: '', note: 'Google Sheets id holding the Specials tab; blank uses sample rows' },
      { name: 'TELEGRAM_CHAT_ID', value: '@harbourcafe_specials', note: 'channel username or numeric chat id' },
      { name: 'STAFF_CHAT_ID', value: '', note: 'staff chat told once when the sheet has no specials for today; blank = no nudge' },
      { name: 'TIMEZONE', value: 'Europe/London', note: 'IANA timezone for the posting hour and today' },
      { name: 'POST_HOUR', value: 11, note: 'hour (24h) when the scheduled run posts' },
      { name: 'UPDATE_UNTIL_HOUR', value: 15, note: 'last hour that posts sold-out updates (and a late post if POST_HOUR was missed)' },
      { name: 'CLOSED_WEEKDAYS', value: ['Monday'], note: 'weekdays with no post' },
      { name: 'CLOSED_DATES', value: ['2026-12-25', '2026-12-26', '2027-01-01'], note: 'dates with no post (YYYY-MM-DD)' },
      { name: 'CURRENCY', value: 'GBP', note: 'currency code for prices' },
      { name: 'SECTION_ORDER', value: ['Starter', 'Main', 'Dessert', 'Drink'], note: 'sections in this order; anything else goes last' },
      { name: 'ALLERGEN_TAGS', value: { vegetarian: 'V', vegan: 'VG', 'gluten free': 'GF', nuts: 'N', dairy: 'D', egg: 'E', fish: 'F', shellfish: 'SF', sesame: 'SE', soy: 'SO' }, note: 'allergen word in the sheet -> tag in the post' },
      { name: 'HEADER', value: 'Today at Harbour Cafe', note: 'first line of the post' },
      { name: 'TEST_TELEGRAM_CHAT_ID', value: '', note: 'test mode posts here instead of the channel' },
    ],
    flags: { sheets_enabled: "SPECIALS_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour', '0 * * * *'),
    code('Check day and hour', `
// Today and the hour in TIMEZONE, plus what was already posted today (static data).
// mode 'post'   = POST_HOUR, or a later hour up to UPDATE_UNTIL_HOUR when today's post was missed
// mode 'update' = after today's post, up to UPDATE_UNTIL_HOUR
// A manual run always continues so it can be previewed.
const cfg = $('config').first().json;
let scheduled = false;
try { scheduled = $('Every hour').first() !== undefined; } catch (e) { scheduled = false; }
const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hourCycle: 'h23', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
  .formatToParts(new Date()).map(x => [x.type, x.value]));
const today = p.year + '-' + p.month + '-' + p.day;
const hour = Number(p.hour) % 24;
const mem = $getWorkflowStaticData('global').specials || {};
const posted = mem.date === today;
const closed = cfg.closed_weekdays.includes(p.weekday) ? 'closed on ' + p.weekday + 's' : cfg.closed_dates.includes(today) ? 'closed on ' + today : '';
const inWindow = hour > cfg.post_hour && hour <= cfg.update_until_hour;
let mode = posted ? 'update' : 'post', reason = '', late = false;
if (scheduled) {
  if (closed) reason = closed;
  else if (posted && !inWindow) reason = 'already posted today, outside the update hours';
  else if (!posted && hour !== cfg.post_hour && !inWindow) reason = 'not the posting hour (' + hour + ':00)';
  else late = !posted && hour !== cfg.post_hour;
}
return [{ json: { today, weekday: p.weekday, hour, scheduled, closed, mode, late, post: !reason, reason,
  memory: posted ? mem : null, nudged_today: mem.nudged === today } }];`),
    ifTrue('Post today?', '$json.post'),
    stop('STOP: closed or not the posting hour'),
    ifTrue('Specials sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Specials tab', cfg('specials_sheet_id'), 'Specials'),
    code('Load sample specials', `
// Used until SPECIALS_SHEET_ID is set. Rows are keyed to today's weekday and date so
// every selection rule has a case whatever day it runs.
const d = $('Check day and hour').first().json;
const other = d.weekday === 'Friday' ? 'Saturday' : 'Friday';
const tomorrow = new Date(Date.parse(d.today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
const row = (Day, Date, Section, Dish, Description, Price, Allergens, Sold) => ({ Day, Date, Section, Dish, Description, Price, Allergens, 'Sold out': Sold });
return [
  row(d.weekday, '', 'Starter', 'Burrata', 'heritage tomato, basil oil', '9.5', 'vegetarian, dairy', ''),
  row(d.weekday, '', 'Main', 'Hake', 'brown shrimp butter, samphire', '£19.00', 'fish, shellfish, dairy', ''),
  row(d.weekday, '', 'Main', 'Mushroom risotto', 'aged parmesan', '16', 'vegetarian, dairy', 'yes'),
  row('Daily', '', 'Dessert', 'Sticky toffee pudding', 'clotted cream', '8.00', 'gluten, dairy, egg', ''),
  row('Daily', '', 'Drink', 'Rhubarb soda', 'house made', '4.5', 'vegan', ''),
  row(other, '', 'Main', 'Lamb shoulder', 'not today', '24', '', ''),
  row('', d.today, 'Main', 'Hake', 'chef changed it: brown butter, capers', '18.50', 'fish, dairy', ''),
  row('', d.today, 'Special', 'Pistachio cake slice', 'one tray only', '5', 'nuts, egg, gluten', ''),
  row('', tomorrow, 'Starter', 'Crab toast', 'tomorrow only', '11', 'shellfish, gluten', ''),
].map(json => ({ json }));`),
    merge('Combine specials sources'),
    code(BUILD, `
// Selection: dated rows for today win over weekday/Daily rows with the same dish.
// Sold out = yes/true/x/1 in the Sold out column.
// kind: 'post' (full menu), 'update' (diff against what was posted), 'staff' (empty
// sheet at posting time, told once) or 'none'.
const cfg = $('config').first().json;
const d = $('Check day and hour').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.Dish);
const norm = s => String(s || '').trim().toLowerCase();
const dated = rows.filter(r => String(r.Date || '').slice(0, 10) === d.today);
const weekly = rows.filter(r => !r.Date && [norm(d.weekday), 'daily'].includes(norm(r.Day)));
const byDish = new Map();
for (const r of weekly) byDish.set(norm(r.Dish), r);
for (const r of dated) byDish.set(norm(r.Dish), r);
const soldOut = [], dishes = [];
for (const r of byDish.values()) (/^(yes|true|x|1)$/i.test(String(r['Sold out'] || '').trim()) ? soldOut : dishes).push(r);
const money = v => {
  const n = Number(String(v || '').replace(/[^\\d.,]/g, '').replace(',', '.'));
  return n ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: cfg.currency }).format(n) : '';
};
const used = new Set();
const tags = a => String(a || '').split(/[,;]/).map(norm).filter(Boolean).map(x => cfg.allergen_tags[x]).filter(Boolean)
  .map(t => { used.add(t); return '[' + t + ']'; }).join('');
const line = r => '- ' + r.Dish + (r.Description ? ', ' + r.Description : '') + ' ' + money(r.Price) + (tags(r.Allergens) ? ' ' + tags(r.Allergens) : '');
const order = s => { const i = cfg.section_order.findIndex(x => norm(x) === norm(s)); return i < 0 ? 99 : i; };
dishes.sort((a, b) => order(a.Section) - order(b.Section));
const legend = () => Object.entries(cfg.allergen_tags).filter(([, t]) => used.has(t)).map(([w, t]) => t + ' ' + w).join(', ');
const hh = String(d.hour).padStart(2, '0') + ':00';
let kind = 'none', text = '', reason = '';
const mem = d.memory;
const names = Object.fromEntries(dishes.map(r => [norm(r.Dish), r.Dish]));
let memoryNext = { date: d.today, dishes: dishes.map(r => norm(r.Dish)), names, announced_gone: [] };
if (d.mode === 'update' && mem) {
  // Diff against the last post: posted dishes now sold out or gone, and new dishes.
  const avail = new Set(dishes.map(r => norm(r.Dish)));
  const announced = new Set(mem.announced_gone || []);
  const gone = mem.dishes.filter(k => !avail.has(k) && !announced.has(k));
  const added = dishes.filter(r => !mem.dishes.includes(norm(r.Dish)));
  memoryNext = { date: d.today, dishes: [...mem.dishes, ...added.map(r => norm(r.Dish))], names: { ...mem.names, ...names },
    announced_gone: [...announced, ...gone] };
  if (gone.length || added.length) {
    kind = 'update';
    const lines = ['Specials update, ' + hh];
    if (gone.length) lines.push('Sold out: ' + gone.map(k => mem.names[k] || k).join(', '));
    if (added.length) lines.push('', 'Just added:', ...added.map(line));
    if (!dishes.length) lines.push('', 'That is everything for today. Thank you!');
    if (added.length && legend()) lines.push('', legend());
    text = lines.join('\\n');
  } else reason = 'no change since the last post';
} else if (dishes.length) {
  kind = 'post';
  const lines = [cfg.header + ', ' + d.weekday + ' ' + d.today.slice(8) + '/' + d.today.slice(5, 7), ''];
  let section = null;
  for (const r of dishes) {
    const sec = r.Section || 'More';
    if (sec !== section) { if (section !== null) lines.push(''); lines.push(sec.toUpperCase()); section = sec; }
    lines.push(line(r));
  }
  if (legend()) lines.push('', legend());
  text = lines.join('\\n');
} else if (cfg.staff_chat_id && !d.nudged_today) {
  kind = 'staff';
  text = 'Specials not posted for ' + d.today + ': ' + (soldOut.length ? 'every dish for today is marked sold out' : 'the Specials tab has no rows for today') + '. Fill the sheet and the next hourly run posts it, until ' + cfg.update_until_hour + ':00.';
} else reason = d.nudged_today ? 'sheet still empty, staff already told' : 'nothing for today and no STAFF_CHAT_ID';
const target = kind === 'staff' ? cfg.staff_chat_id : cfg.telegram_chat_id;
return [{ json: { kind, reason, text: text.slice(0, 4000), dishes: dishes.length, sold_out: soldOut.map(r => r.Dish), today: d.today, late: d.late,
  memory_next: memoryNext, send_to: cfg.mode === 'test' ? cfg.test_telegram_chat_id : target } }];`),
    ifTrue('Anything to post?', '$json.kind !== "none" && $json.send_to !== ""'),
    stop('STOP: nothing to post'),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    telegram.send('Post the specials to Telegram', '$json.send_to', "($('config').first().json.mode === 'test' ? '[TEST ' + $json.kind + '] ' : '') + $json.text"),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - nothing remembered'),
    code('Remember what was posted', `
// The posted dish list is what later hourly runs diff against. A staff nudge only
// records that the staff were told today.
const b = $("${BUILD}").first().json;
const s = $getWorkflowStaticData('global');
const prev = s.specials || {};
s.specials = b.kind === 'staff' ? { ...prev, nudged: b.today } : { ...b.memory_next, nudged: prev.nudged };
return [{ json: { kind: b.kind, date: b.today, dishes_tracked: (s.specials.dishes || []).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'Check day and hour'],
    ['Check day and hour', 'Post today?'],
    ['Post today?', 0, 'Specials sheet set?'], ['Post today?', 1, 'STOP: closed or not the posting hour'],
    ['Specials sheet set?', 0, 'Read the Specials tab'], ['Specials sheet set?', 1, 'Load sample specials'],
    ['Read the Specials tab', 'Combine specials sources'], ['Load sample specials', 0, 'Combine specials sources', 1],
    ['Combine specials sources', BUILD],
    [BUILD, 'Anything to post?'],
    ['Anything to post?', 0, 'Sending switched on?'], ['Anything to post?', 1, 'STOP: nothing to post'],
    ['Sending switched on?', 0, 'Post the specials to Telegram'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Post the specials to Telegram', 'Live run?'],
    ['Live run?', 0, 'Remember what was posted'], ['Live run?', 1, 'STOP: test send - nothing remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'An hourly schedule lets `POST_HOUR` and `UPDATE_UNTIL_HOUR` live in `config` instead of in a cron string. Menu order, allergen tags, currency, closures and the staff chat are set there too.', nodes: ['Run manually', 'Every hour', 'config'] },
    { title: 'Decide post, update or skip', why: '`Check day and hour` works in `TIMEZONE` and reads what was posted today. It picks a full post at `POST_HOUR`, a late post if that run was missed, an update after it, or the STOP outside those hours and on closed days.', nodes: ['Check day and hour', 'Post today?', 'STOP: closed or not the posting hour'] },
    { title: 'Read the specials', why: 'The kitchen owns the sheet; nothing here writes to it. `Load sample specials` keys its rows to today, so the dated override, sold-out and Daily rules all show in a preview.', nodes: ['Specials sheet set?', 'Read the Specials tab', 'Load sample specials', 'Combine specials sources'] },
    { title: 'Build the post or update', why: 'A dated row replaces the weekday row for the same dish. An update lists only posted dishes that sold out or vanished and dishes added since, each announced once. An empty sheet nudges `STAFF_CHAT_ID` once rather than posting a bare header.', nodes: [BUILD, 'Anything to post?', 'STOP: nothing to post'] },
    { title: 'Post and remember', why: 'Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. The dish list is stored only after a live post, so a test run never stops the real post or swallows a sold-out update.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Post the specials to Telegram', 'Live run?', 'STOP: test send - nothing remembered', 'Remember what was posted'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample specials', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const p = out[BUILD][0];
        const f: string[] = [];
        if (p.kind !== 'post') f.push(`first run of the day is a full post, got ${p.kind}`);
        if (p.dishes !== 5) f.push(`expected 5 dishes (burrata, hake override, pudding, soda, cake), got ${p.dishes}`);
        if (!p.sold_out.includes('Mushroom risotto')) f.push('sold-out risotto should be dropped');
        if (!p.text.includes('Hake, chef changed it')) f.push('dated Hake row should replace the weekday one');
        if (p.text.includes('Lamb') || p.text.includes('Crab')) f.push('other weekday and tomorrow rows must not appear');
        if (!p.text.includes('£9.50 [V][D]')) f.push('price and tags should be formatted as £9.50 [V][D]');
        const lines = p.text.split('\n');
        if (lines.indexOf('STARTER') > lines.indexOf('MAIN') || lines.indexOf('DRINK') > lines.indexOf('SPECIAL')) f.push('sections out of SECTION_ORDER');
        if (!/N nuts/.test(p.text)) f.push('legend should explain the N tag');
        if (p.memory_next.dishes.length !== 5) f.push('the 5 posted dishes are what later runs diff against');
        return f;
      },
    },
    {
      name: 'scheduled run on a closed day', start: 'Every hour',
      overrides: { CLOSED_WEEKDAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
      expect: { reached: ['STOP: closed or not the posting hour'], notReached: ['Load sample specials'], outward: 'none' },
      check: out => out['Check day and hour'][0].reason.startsWith('closed on') ? [] : ['closed day should be the reason'],
    },
    {
      name: 'live post to the channel, then remembered', start: 'Run manually',
      overrides: { SPECIALS_SHEET_ID: '1SpecialsSheetExample', TEST_RUN: false, CURRENCY: 'EUR' },
      mocks: {
        'Read the Specials tab': () => [
          { row_number: 2, Day: 'Daily', Date: '', Section: 'Main', Dish: 'Soup of the day', Description: '', Price: '6,50', Allergens: 'vegan', 'Sold out': '' },
          { row_number: 3, Day: 'Daily', Date: '', Section: 'Main', Dish: 'Quiche', Description: '', Price: '9', Allergens: 'egg', 'Sold out': 'TRUE' },
        ],
        'Post the specials to Telegram': [{ ok: true, result: { message_id: 101 } }],
      },
      expect: { reached: ['Post the specials to Telegram', 'Remember what was posted'], notReached: ['Load sample specials'], outward: 'some' },
      check: out => {
        const p = out[BUILD][0];
        const f: string[] = [];
        if (!p.text.includes('€6.50 [VG]')) f.push('6,50 should format as €6.50 with the VG tag');
        if (p.send_to !== '@harbourcafe_specials') f.push('live post goes to the channel');
        if (out['Remember what was posted'][0].dishes_tracked !== 1) f.push('one posted dish should be tracked');
        return f;
      },
    },
    {
      name: 'hourly update after a dish sells out', start: 'Every hour',
      overrides: { SPECIALS_SHEET_ID: '1SpecialsSheetExample', TEST_RUN: false },
      mocks: {
        'Check day and hour': () => [{ today: '2026-10-21', weekday: 'Wednesday', hour: 13, scheduled: true, mode: 'update', late: false, post: true, reason: '', nudged_today: false,
          memory: { date: '2026-10-21', dishes: ['hake', 'burrata', 'soup'], names: { hake: 'Hake', burrata: 'Burrata', soup: 'Soup' }, announced_gone: ['soup'] } }],
        'Read the Specials tab': () => [
          { Day: 'Wednesday', Date: '', Section: 'Main', Dish: 'Hake', Price: '19', Allergens: 'fish', 'Sold out': 'yes' },
          { Day: 'Wednesday', Date: '', Section: 'Starter', Dish: 'Burrata', Price: '9.5', Allergens: 'dairy', 'Sold out': '' },
          { Day: '', Date: '2026-10-21', Section: 'Dessert', Dish: 'Plum tart', Description: 'last few', Price: '7', Allergens: 'gluten free', 'Sold out': '' },
        ],
        'Post the specials to Telegram': [{ ok: true, result: { message_id: 102 } }],
      },
      expect: { reached: ['Post the specials to Telegram', 'Remember what was posted'], outward: 'some' },
      check: out => {
        const p = out[BUILD][0];
        const f: string[] = [];
        if (p.kind !== 'update') f.push(`expected an update, got ${p.kind}`);
        if (!p.text.includes('Sold out: Hake') || p.text.includes('Soup')) f.push(`only the newly sold-out Hake should be announced: ${p.text}`);
        if (!p.text.includes('- Plum tart, last few £7.00 [GF]')) f.push('the added tart should be listed');
        if (p.text.includes('Burrata')) f.push('unchanged dishes are not repeated');
        if (p.memory_next.announced_gone.join() !== 'soup,hake') f.push('Hake is now announced and must not repeat');
        return f;
      },
    },
    {
      name: 'empty sheet at posting time nudges the staff', start: 'Run manually',
      overrides: { SPECIALS_SHEET_ID: '1SpecialsSheetExample', TEST_RUN: false, STAFF_CHAT_ID: '-1009876543210' },
      mocks: { 'Read the Specials tab': () => [{}], 'Post the specials to Telegram': [{ ok: true, result: { message_id: 103 } }] },
      expect: { reached: ['Post the specials to Telegram', 'Remember what was posted'], outward: 'some' },
      check: out => {
        const p = out[BUILD][0];
        return p.kind === 'staff' && p.send_to === '-1009876543210' && p.text.includes('no rows for today') ? [] : [`staff nudge expected: ${p.kind} ${p.send_to}`];
      },
    },
  ],
});
