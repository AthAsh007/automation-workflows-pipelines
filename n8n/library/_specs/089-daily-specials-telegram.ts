import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'daily-specials-telegram',
  title: 'Post daily specials from Google Sheets to a Telegram channel',
  summary: 'Checks every hour whether it is posting time and the kitchen is open, picks today\'s specials from a Google Sheet by weekday or date, drops sold-out dishes, formats prices and allergen tags, and posts one menu message to a Telegram channel.',
  category: 'Local business and services',
  description: {
    who: 'Cafes, restaurants and food trucks that keep their specials in a spreadsheet and post them to a Telegram channel for regulars. The kitchen edits the sheet; the post goes out on time without anyone opening the app.',
    how: [
      'The workflow wakes every hour and posts only at `POST_HOUR` in your `TIMEZONE`. Days in `CLOSED_WEEKDAYS` and dates in `CLOSED_DATES` are skipped. A manual run always previews.',
      'It reads the Specials tab, or 9 sample rows until a sheet is set. A row counts today when its Date is today, or its Day is today\'s weekday or Daily. A dated row replaces a weekday row with the same dish.',
      'Dishes marked sold out are dropped. Prices like "12.5" or "£12.50" are formatted in `CURRENCY`, and allergens become short tags such as [V] or [N] with a legend line.',
      'Dishes are grouped by section in menu order and posted as one message. If nothing is left, nothing is posted.',
    ],
    setup: [
      'Run it once as imported. It builds today\'s post from sample rows and stops at `STOP: preview - nothing sent`.',
      'Create a Specials tab with Day, Date, Section, Dish, Description, Price, Allergens and Sold out columns, connect Google Sheets and set `SPECIALS_SHEET_ID`.',
      'Add a Telegram bot as admin of your channel, connect it and set `TELEGRAM_CHAT_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Set `TEST_RUN = false` to post to the channel.',
    ],
    requirements: ['A Google Sheet with a Specials tab', 'A Telegram bot added to your channel'],
    customize: [
      '`ALLERGEN_TAGS` maps allergen words in the sheet to the tag shown in the post.',
      '`SECTION_ORDER` sets the order sections appear in.',
      'Add holiday closures to `CLOSED_DATES` as YYYY-MM-DD.',
    ],
  },
  config: {
    intro: ['SPECIALS_SHEET_ID blank -> SAMPLE specials so the run works before any credential exists.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_TELEGRAM_CHAT_ID instead of the channel.'],
    consts: [
      { name: 'SPECIALS_SHEET_ID', value: '', note: 'Google Sheets id holding the Specials tab; blank uses sample rows' },
      { name: 'TELEGRAM_CHAT_ID', value: '@harbourcafe_specials', note: 'channel username or numeric chat id' },
      { name: 'TIMEZONE', value: 'Europe/London', note: 'IANA timezone for the posting hour and today' },
      { name: 'POST_HOUR', value: 11, note: 'hour (24h) when the scheduled run posts' },
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
// Today and the hour in TIMEZONE. The hourly schedule posts only at POST_HOUR and
// never on a closed day; a manual run always continues so it can be previewed.
const cfg = $('config').first().json;
let scheduled = false;
try { scheduled = $('Every hour').first() !== undefined; } catch (e) { scheduled = false; }
const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hourCycle: 'h23', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
  .formatToParts(new Date()).map(x => [x.type, x.value]));
const today = p.year + '-' + p.month + '-' + p.day;
const hour = Number(p.hour) % 24;
const closed = cfg.closed_weekdays.includes(p.weekday) ? 'closed on ' + p.weekday + 's' : cfg.closed_dates.includes(today) ? 'closed on ' + today : '';
const reason = !scheduled ? '' : closed ? closed : hour !== cfg.post_hour ? 'not the posting hour (' + hour + ':00)' : '';
return [{ json: { today, weekday: p.weekday, hour, scheduled, closed, post: !reason, reason } }];`),
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
    code('Build today\'s specials post', `
// Selection: dated rows for today win over weekday/Daily rows with the same dish.
// Sold out = yes/true/x/1 in the Sold out column. Output is one plain-text post.
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
const order = s => { const i = cfg.section_order.findIndex(x => norm(x) === norm(s)); return i < 0 ? 99 : i; };
dishes.sort((a, b) => order(a.Section) - order(b.Section));
const lines = [cfg.header + ', ' + d.weekday + ' ' + d.today.slice(8) + '/' + d.today.slice(5, 7), ''];
let section = null;
for (const r of dishes) {
  const sec = r.Section || 'More';
  if (sec !== section) { if (section !== null) lines.push(''); lines.push(sec.toUpperCase()); section = sec; }
  lines.push('- ' + r.Dish + (r.Description ? ', ' + r.Description : '') + ' ' + money(r.Price) + (tags(r.Allergens) ? ' ' + tags(r.Allergens) : ''));
}
const legend = Object.entries(cfg.allergen_tags).filter(([, t]) => used.has(t)).map(([w, t]) => t + ' ' + w).join(', ');
if (legend) lines.push('', legend);
const text = lines.join('\\n').slice(0, 4000);
return [{ json: { text, dishes: dishes.length, sold_out: soldOut.map(r => r.Dish), today: d.today,
  send_to: cfg.mode === 'test' ? cfg.test_telegram_chat_id : cfg.telegram_chat_id } }];`),
    ifTrue('Anything to post?', '$json.dishes > 0 && $json.send_to !== ""'),
    stop('STOP: nothing to post'),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    telegram.send('Post the specials to Telegram', '$json.send_to', "($('config').first().json.mode === 'test' ? '[TEST] ' : '') + $json.text"),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'Check day and hour'],
    ['Check day and hour', 'Post today?'],
    ['Post today?', 0, 'Specials sheet set?'], ['Post today?', 1, 'STOP: closed or not the posting hour'],
    ['Specials sheet set?', 0, 'Read the Specials tab'], ['Specials sheet set?', 1, 'Load sample specials'],
    ['Read the Specials tab', 'Combine specials sources'], ['Load sample specials', 0, 'Combine specials sources', 1],
    ['Combine specials sources', 'Build today\'s specials post'],
    ['Build today\'s specials post', 'Anything to post?'],
    ['Anything to post?', 0, 'Sending switched on?'], ['Anything to post?', 1, 'STOP: nothing to post'],
    ['Sending switched on?', 0, 'Post the specials to Telegram'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'An hourly schedule lets `POST_HOUR` live in `config` instead of in a cron string. Menu order, allergen tags, currency and closures are set there too.', nodes: ['Run manually', 'Every hour', 'config'] },
    { title: 'Check the day', why: '`Check day and hour` works in `TIMEZONE`, so a server in another region still posts at 11:00 local. Twenty-three of the 24 hourly runs, and every closed day, end at the STOP before the sheet is read.', nodes: ['Check day and hour', 'Post today?', 'STOP: closed or not the posting hour'] },
    { title: 'Read the specials', why: 'The kitchen owns the sheet; nothing here writes to it. `Load sample specials` keys its rows to today, so the dated override, sold-out and Daily rules all show in a preview.', nodes: ['Specials sheet set?', 'Read the Specials tab', 'Load sample specials', 'Combine specials sources'] },
    { title: 'Build and post', why: 'A dated row replaces the weekday row for the same dish, so the chef can change one dish for one day. An empty menu ends at `STOP: nothing to post` instead of sending a header with no dishes.', nodes: ['Build today\'s specials post', 'Anything to post?', 'STOP: nothing to post', 'Sending switched on?', 'STOP: preview - nothing sent', 'Post the specials to Telegram'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample specials', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const p = out['Build today\'s specials post'][0];
        const f: string[] = [];
        if (p.dishes !== 5) f.push(`expected 5 dishes (burrata, hake override, pudding, soda, cake), got ${p.dishes}`);
        if (!p.sold_out.includes('Mushroom risotto')) f.push('sold-out risotto should be dropped');
        if (!p.text.includes('Hake, chef changed it')) f.push('dated Hake row should replace the weekday one');
        if (p.text.includes('Lamb') || p.text.includes('Crab')) f.push('other weekday and tomorrow rows must not appear');
        if (!p.text.includes('£9.50 [V][D]')) f.push('price and tags should be formatted as £9.50 [V][D]');
        const lines = p.text.split('\n');
        if (lines.indexOf('STARTER') > lines.indexOf('MAIN') || lines.indexOf('DRINK') > lines.indexOf('SPECIAL')) f.push('sections out of SECTION_ORDER');
        if (!/N nuts/.test(p.text)) f.push('legend should explain the N tag');
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
      name: 'live post to the channel', start: 'Run manually',
      overrides: { SPECIALS_SHEET_ID: '1SpecialsSheetExample', TEST_RUN: false, CURRENCY: 'EUR' },
      mocks: {
        'Read the Specials tab': () => [
          { row_number: 2, Day: 'Daily', Date: '', Section: 'Main', Dish: 'Soup of the day', Description: '', Price: '6,50', Allergens: 'vegan', 'Sold out': '' },
          { row_number: 3, Day: 'Daily', Date: '', Section: 'Main', Dish: 'Quiche', Description: '', Price: '9', Allergens: 'egg', 'Sold out': 'TRUE' },
        ],
        'Post the specials to Telegram': [{ ok: true, result: { message_id: 101 } }],
      },
      expect: { reached: ['Post the specials to Telegram'], notReached: ['Load sample specials'], outward: 'some' },
      check: out => {
        const p = out['Build today\'s specials post'][0];
        const f: string[] = [];
        if (!p.text.includes('€6.50 [VG]')) f.push('6,50 should format as €6.50 with the VG tag');
        if (p.send_to !== '@harbourcafe_specials') f.push('live post goes to the channel');
        return f;
      },
    },
  ],
});
