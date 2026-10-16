import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, sheets, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'woocommerce-back-in-stock-telegram',
  title: 'Notify Telegram subscribers when WooCommerce products are back in stock',
  summary: 'Reads a Google Sheets waitlist of Telegram chat ids and WooCommerce product ids, checks those products\' stock, messages waiting subscribers in join order (capped at a few people per unit in stock), and marks each row notified so nobody hears twice.',
  category: 'E-commerce',
  description: {
    who: 'WooCommerce shops that sell limited runs and collect "tell me when it\'s back" requests through a Telegram bot. It turns that list into messages the moment stock returns, without a waitlist plugin.',
    how: [
      'Every 30 minutes it reads the Waitlist tab (chat id, product id, joined date, status), or 10 sample rows until the sheet is set.',
      'It fetches only the waitlisted products from WooCommerce, or sample stock until WooCommerce is connected.',
      'For a product back in stock it notifies waiting subscribers in the order they joined, up to 2 people per unit in stock, so 3 units do not wake up 40 people. Products without stock tracking notify everyone.',
      'Each subscriber gets one message listing every product they waited for that is now available, with a link.',
      'After a live send each row is marked notified; the rest keep waiting for the next restock.',
    ],
    setup: [
      'Run it once as imported. It plans the messages and stops at `STOP: preview - nothing sent`.',
      'Create a sheet with a Waitlist tab (key, chat_id, product_id, joined_at, status, notified_at) and put its id in `WAITLIST_SHEET_ID`. key is chat_id:product_id.',
      'Add a WooCommerce credential to `Fetch waitlisted products`, set `STORE_URL` and `USE_WOOCOMMERCE = true`, and add your bot token to `Send the Telegram message`.',
      'Put your own chat id in `TEST_CHAT_ID` to receive every message yourself first, then set `DRY_RUN = false` to message subscribers.',
    ],
    requirements: ['A WooCommerce store with REST API keys', 'A Telegram bot that collects chat ids', 'A Google Sheet'],
    customize: [
      '`NOTIFY_PER_UNIT` sets how many subscribers are told per unit in stock.',
      '`MIN_STOCK` holds notifications until at least that many units are in.',
      '`MESSAGE_INTRO` changes the first line of the message.',
    ],
  },
  config: {
    intro: ['WAITLIST_SHEET_ID blank -> SAMPLE waitlist. USE_WOOCOMMERCE false -> SAMPLE stock.', 'DRY_RUN true -> nothing reaches subscribers. TEST_CHAT_ID set -> messages go to that chat instead and the sheet is left alone.'],
    consts: [
      { name: 'USE_WOOCOMMERCE', value: false, note: 'set true after adding the WooCommerce credential to the fetch node' },
      { name: 'STORE_URL', value: 'https://shop.yourstore.example', note: 'your store address, no trailing slash' },
      { name: 'WAITLIST_SHEET_ID', value: '', note: 'Google Sheets id with a Waitlist tab; blank uses sample rows' },
      { name: 'NOTIFY_PER_UNIT', value: 2, note: 'subscribers told per unit in stock, in join order' },
      { name: 'MIN_STOCK', value: 1, note: 'tracked products need at least this many units before anyone is told' },
      { name: 'MESSAGE_INTRO', value: 'Good news: something you asked about is back in stock.', note: 'first line of every message' },
      { name: 'TEST_CHAT_ID', value: '', note: 'your own Telegram chat id; while DRY_RUN is true, set this to receive the messages yourself' },
    ],
    flags: { sheet_enabled: "WAITLIST_SHEET_ID.trim() !== ''", test_chat_enabled: "TEST_CHAT_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 30 minutes', '*/30 * * * *'),
    ifTrue('Waitlist sheet set?', cfg('sheet_enabled')),
    sheets.read('Read the waitlist', cfg('waitlist_sheet_id'), 'Waitlist'),
    code('Load sample waitlist', `
// Used until WAITLIST_SHEET_ID is set. Five people wait for 2 pour-overs; one row is
// already notified; one chat id is not a number.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
return [
  ['5550101', 101, 10, 'waiting'], ['5550102', 101, 5, 'waiting'], ['5550103', 101, 3, 'waiting'], ['5550104', 101, 1, 'waiting'],
  ['5550105', 101, 0.5, 'waiting'], ['5550107', 101, 20, 'notified'], ['5550101', 102, 8, 'waiting'], ['5550106', 103, 2, 'waiting'],
  ['abc', 103, 2, 'waiting'], ['5550102', 104, 4, 'waiting'],
].map(([chat_id, product_id, days, status]) => ({ json: { key: chat_id + ':' + product_id, chat_id, product_id, joined_at: ago(days), status, notified_at: '' } }));`),
    merge('Combine waitlist sources'),
    code('Collect waiting product ids', `
// Only rows still waiting matter; their product ids decide what to ask WooCommerce for.
const rows = $input.all().map(i => i.json).filter(r => String(r.status || 'waiting').toLowerCase() === 'waiting' && r.product_id);
return [{ json: { rows, ids: [...new Set(rows.map(r => String(r.product_id)))] } }];`),
    ifTrue('WooCommerce connected?', cfg('use_woocommerce')),
    http('Fetch waitlisted products', {
      url: `={{ ${cfg('store_url')} + '/wp-json/wc/v3/products' }}`, auth: 'wooCommerceApi',
      query: { include: '={{ $json.ids.slice(0, 100).join(",") }}', per_page: '100' },
    }),
    code('Read product stock', `
// WooCommerce returns one item per product. stock_quantity is null when the
// product does not track stock.
return [{ json: { products: $input.all().map(i => i.json).filter(p => p && p.id).map(p => ({
  id: String(p.id), name: p.name, url: p.permalink, price: p.price, status: p.stock_status,
  qty: p.manage_stock ? Number(p.stock_quantity || 0) : null,
})) } }];`),
    code('Load sample stock', `
// Used until USE_WOOCOMMERCE is true.
return [{ json: { products: [
  { id: '101', name: 'Ceramic pour-over', url: 'https://shop.yourstore.example/p/ceramic-pour-over', price: '34.00', status: 'instock', qty: 2 },
  { id: '102', name: 'Gooseneck kettle', url: 'https://shop.yourstore.example/p/gooseneck-kettle', price: '79.00', status: 'outofstock', qty: 0 },
  { id: '103', name: 'Burr grinder', url: 'https://shop.yourstore.example/p/burr-grinder', price: '129.00', status: 'instock', qty: null },
  { id: '104', name: 'Travel tumbler', url: 'https://shop.yourstore.example/p/travel-tumbler', price: '25.00', status: 'onbackorder', qty: 0 },
] } }];`),
    merge('Combine stock sources'),
    code('Match the waitlist to stock', `
// For each product in stock: tell waiting people in join order, NOTIFY_PER_UNIT per
// unit. Everyone else keeps waiting. Status changes since the last run are noted.
const cfg = $('config').first().json;
const { rows } = $('Collect waiting product ids').first().json;
const products = Object.fromEntries($input.first().json.products.map(p => [p.id, p]));
const memory = $getWorkflowStaticData('global');
const last = memory.stock_status || {};
const transitions = Object.values(products).filter(p => last[p.id] && last[p.id] !== p.status).map(p => p.name + ': ' + last[p.id] + ' -> ' + p.status);
for (const p of Object.values(products)) last[p.id] = p.status;
memory.stock_status = last;
const notify = [], waiting = [], skipped = [];
const byProduct = {};
for (const r of rows) (byProduct[String(r.product_id)] ||= []).push(r);
for (const [pid, list] of Object.entries(byProduct)) {
  const p = products[pid];
  list.sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)));
  const valid = list.filter(r => /^-?\\d+$/.test(String(r.chat_id)));
  for (const r of list.filter(r => !valid.includes(r))) skipped.push({ key: r.key, reason: 'chat id is not numeric' });
  if (!p) { valid.forEach(r => waiting.push({ key: r.key, reason: 'product not found' })); continue; }
  if (p.status !== 'instock') { valid.forEach(r => waiting.push({ key: r.key, reason: p.status })); continue; }
  if (p.qty !== null && p.qty < cfg.min_stock) { valid.forEach(r => waiting.push({ key: r.key, reason: 'only ' + p.qty + ' in stock' })); continue; }
  const slots = p.qty === null ? valid.length : p.qty * cfg.notify_per_unit;
  valid.forEach((r, i) => i < slots ? notify.push({ ...r, product: p }) : waiting.push({ key: r.key, reason: 'queued behind ' + slots + ' for ' + p.qty + ' units' }));
}
const byChat = {};
for (const n of notify) (byChat[String(n.chat_id)] ||= []).push(n);
const messages = Object.entries(byChat).map(([chat_id, list]) => ({ chat_id, keys: list.map(n => n.key), products: list.map(n => n.product) }));
return [{ json: { messages, waiting, skipped, transitions, notified_rows: notify.length } }];`),
    code('Write each Telegram message', `
// One message per subscriber, listing every product they waited for that is back.
const cfg = $('config').first().json;
return $input.first().json.messages.map(m => ({ json: {
  chat_id: m.chat_id, keys: m.keys,
  send_to: cfg.live ? m.chat_id : cfg.test_chat_id,
  text: [(cfg.live ? '' : '[TEST for chat ' + m.chat_id + '] ') + cfg.message_intro, '',
    ...m.products.map(p => p.name + ' (' + p.price + ')' + (p.qty !== null ? ', ' + p.qty + ' left' : '') + '\\n' + p.url),
    '', 'You will not get another message about ' + (m.products.length === 1 ? 'this item' : 'these items') + '.'].join('\\n'),
} }));`),
    ifTrue('Sending switched on?', `${cfg('live')} || ${cfg('test_chat_enabled')}`),
    stop('STOP: preview - nothing sent'),
    telegram.send('Send the Telegram message', '$json.send_to', '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - waitlist untouched'),
    code('Mark rows as notified', `
// One sheet update per waitlist row, matched on key, for the chats just messaged.
const now = new Date().toISOString();
return $('Write each Telegram message').all().flatMap(m => m.json.keys.map(key => ({ json: { key, status: 'notified', notified_at: now } })));`),
    sheets.update('Update the waitlist rows', cfg('waitlist_sheet_id'), 'Waitlist', 'key'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 30 minutes', 'config'],
    ['config', 'Waitlist sheet set?'],
    ['Waitlist sheet set?', 0, 'Read the waitlist'], ['Waitlist sheet set?', 1, 'Load sample waitlist'],
    ['Read the waitlist', 'Combine waitlist sources'], ['Load sample waitlist', 0, 'Combine waitlist sources', 1],
    ['Combine waitlist sources', 'Collect waiting product ids'],
    ['Collect waiting product ids', 'WooCommerce connected?'],
    ['WooCommerce connected?', 0, 'Fetch waitlisted products'], ['WooCommerce connected?', 1, 'Load sample stock'],
    ['Fetch waitlisted products', 'Read product stock'],
    ['Read product stock', 'Combine stock sources'], ['Load sample stock', 0, 'Combine stock sources', 1],
    ['Combine stock sources', 'Match the waitlist to stock'],
    ['Match the waitlist to stock', 'Write each Telegram message'],
    ['Write each Telegram message', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send the Telegram message'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Send the Telegram message', 'Live run?'],
    ['Live run?', 0, 'Mark rows as notified'], ['Live run?', 1, 'STOP: test send - waitlist untouched'],
    ['Mark rows as notified', 'Update the waitlist rows'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Checks every 30 minutes, which is soon enough for a restock and well inside WooCommerce rate limits. The per-unit cap and message text live in `config`.', nodes: ['Run manually', 'Every 30 minutes', 'config'] },
    { title: 'Read the waitlist', why: 'The sheet is the waitlist your bot appends to. Rows already marked notified are dropped here, so `Collect waiting product ids` only asks WooCommerce about products someone still waits for.', nodes: ['Waitlist sheet set?', 'Read the waitlist', 'Load sample waitlist', 'Combine waitlist sources', 'Collect waiting product ids'] },
    { title: 'Check stock', why: 'One request for up to 100 products by id, read-only. `Load sample stock` covers in stock, out of stock, untracked and backorder until `USE_WOOCOMMERCE` is true.', nodes: ['WooCommerce connected?', 'Fetch waitlisted products', 'Read product stock', 'Load sample stock', 'Combine stock sources'] },
    { title: 'Match, send and mark', why: 'Join order decides who hears first when stock is short. With `DRY_RUN` on, messages only go to `TEST_CHAT_ID`; rows are marked notified only after a live send, so a test never uses up someone\'s place.', nodes: ['Match the waitlist to stock', 'Write each Telegram message', 'Sending switched on?', 'STOP: preview - nothing sent', 'Send the Telegram message', 'Live run?', 'STOP: test send - waitlist untouched', 'Mark rows as notified', 'Update the waitlist rows'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample waitlist', 'Load sample stock', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Match the waitlist to stock'][0];
        const chats = d.messages.map((m: any) => m.chat_id).sort().join(',');
        if (chats !== '5550101,5550102,5550103,5550104,5550106') f.push(`expected 5 chats messaged, got ${chats}`);
        if (d.notified_rows !== 5) f.push(`expected 5 rows notified, got ${d.notified_rows}`);
        const why = (k: string) => d.waiting.find((w: any) => w.key === k)?.reason || '';
        if (!why('5550105:101').startsWith('queued behind 4')) f.push(`5550105 joined last and should queue behind 4, got "${why('5550105:101')}"`);
        if (why('5550101:102') !== 'outofstock') f.push('kettle is out of stock');
        if (why('5550102:104') !== 'onbackorder') f.push('tumbler is on backorder');
        if (d.skipped[0]?.key !== 'abc:103') f.push('non-numeric chat id should be skipped');
        if (d.messages.some((m: any) => m.keys.includes('5550107:101'))) f.push('already notified row must not be messaged');
        return f;
      },
    },
    {
      name: 'test send to TEST_CHAT_ID', start: 'Run manually', overrides: { TEST_CHAT_ID: '5550199' },
      mocks: { 'Send the Telegram message': (items: any[]) => items.map(() => ({ ok: true, result: { message_id: 1 } })) },
      expect: { reached: ['Send the Telegram message', 'STOP: test send - waitlist untouched'], notReached: ['Update the waitlist rows'], outward: 'some' },
      check: out => out['Write each Telegram message'].every((m: any) => m.send_to === '5550199' && m.text.startsWith('[TEST')) ? [] : ['test sends must go to TEST_CHAT_ID'],
    },
    {
      name: 'live with the sheet and WooCommerce', start: 'Every 30 minutes',
      overrides: { WAITLIST_SHEET_ID: '1Waitlist', USE_WOOCOMMERCE: true, DRY_RUN: false },
      mocks: {
        'Read the waitlist': [
          { row_number: 2, key: '5550111:77', chat_id: 5550111, product_id: 77, joined_at: '2026-09-01T10:00:00Z', status: 'waiting', notified_at: '' },
          { row_number: 3, key: '5550112:77', chat_id: 5550112, product_id: 77, joined_at: '2026-09-02T10:00:00Z', status: 'waiting', notified_at: '' },
          { row_number: 4, key: '5550113:77', chat_id: 5550113, product_id: 77, joined_at: '2026-09-03T10:00:00Z', status: 'waiting', notified_at: '' },
        ],
        'Fetch waitlisted products': [{ id: 77, name: 'Walnut tray', permalink: 'https://shop.example/walnut-tray', price: '48.00', stock_status: 'instock', manage_stock: true, stock_quantity: 1 }],
        'Send the Telegram message': (items: any[]) => items.map(() => ({ ok: true })),
        'Update the waitlist rows': (items: any[]) => items,
      },
      expect: { reached: ['Send the Telegram message', 'Update the waitlist rows'], notReached: ['Load sample waitlist', 'Load sample stock'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const keys = out['Update the waitlist rows'].map((r: any) => r.key).join(',');
        if (keys !== '5550111:77,5550112:77') f.push(`1 unit x 2 per unit: the first two to join should be marked, got ${keys}`);
        if (out['Write each Telegram message'][0]?.send_to !== '5550111') f.push('live send should go to the subscriber chat');
        return f;
      },
    },
  ],
});
