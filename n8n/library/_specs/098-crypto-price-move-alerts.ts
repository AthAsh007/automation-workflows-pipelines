import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'crypto-price-move-alerts',
  title: 'Alert Telegram on large crypto price moves from CoinGecko',
  summary: 'Every 15 minutes reads prices and 24-hour change for a watchlist from the free CoinGecko API, compares each coin with its own move threshold, applies a per-coin cooldown that a bigger move can break, and sends one Telegram message with direction arrows.',
  category: 'Finance and billing',
  description: {
    who: 'Traders, treasury leads at crypto-paid businesses and hobby investors who want a ping when a coin they hold moves sharply, without watching charts or paying for an alert service.',
    how: [
      'Every 15 minutes it calls CoinGecko simple/price for the coins in `COINS`, with the 24-hour change. No API key is needed. Until `USE_COINGECKO` is true, a sample response is used.',
      'Each coin has its own threshold, because 5% is a big day for Bitcoin and a quiet one for a small coin.',
      'A coin past its threshold is alerted once, then held for `COOLDOWN_HOURS`. If the move grows by another `ESCALATE_PCT` points during the cooldown (from -6% to -10%, say), it alerts again.',
      'All alerts in one run go out as one Telegram message, biggest move first, with an up or down arrow, the price and the 24-hour change.',
    ],
    setup: [
      'Run it once as imported. It checks a sample response and stops at `STOP: preview - nothing sent`.',
      'Edit `COINS` with CoinGecko coin ids (the id in the coin page URL) and a threshold for each, then set `USE_COINGECKO = true`.',
      'Create a Telegram bot, add it to your chat, connect it and set `TELEGRAM_CHAT_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Set `TEST_RUN = false` to alert the real chat.',
    ],
    requirements: ['A Telegram bot and chat', 'No CoinGecko key for the public endpoint'],
    customize: [
      '`COINS` sets the watchlist and each threshold in percent.',
      '`COOLDOWN_HOURS` and `ESCALATE_PCT` decide how often one coin can alert.',
      '`VS_CURRENCY` changes the quote currency, for example eur.',
    ],
  },
  config: {
    intro: ['USE_COINGECKO false -> a SAMPLE price response so the run works offline. CoinGecko needs no key.', 'Test mode (TEST_RUN true + TEST_EMAIL set) sends to TEST_TELEGRAM_CHAT_ID and remembers nothing.'],
    consts: [
      { name: 'USE_COINGECKO', value: false, note: 'set true to read real prices (free public endpoint)' },
      { name: 'COINS', value: { bitcoin: { symbol: 'BTC', threshold_pct: 5 }, ethereum: { symbol: 'ETH', threshold_pct: 6 }, solana: { symbol: 'SOL', threshold_pct: 8 }, dogecoin: { symbol: 'DOGE', threshold_pct: 10 }, cardano: { symbol: 'ADA', threshold_pct: 8 } }, note: 'CoinGecko id -> symbol and the 24h move in percent that triggers an alert' },
      { name: 'VS_CURRENCY', value: 'usd', note: 'quote currency' },
      { name: 'COOLDOWN_HOURS', value: 6, note: 'a coin is not alerted again for this long...' },
      { name: 'ESCALATE_PCT', value: 4, note: '...unless its move grew by this many more points' },
      { name: 'TELEGRAM_CHAT_ID', value: '', note: 'chat or channel id for alerts' },
      { name: 'TEST_TELEGRAM_CHAT_ID', value: '', note: 'test mode sends here instead' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 15 minutes', '*/15 * * * *'),
    ifTrue('CoinGecko enabled?', cfg('use_coingecko')),
    http('Fetch prices from CoinGecko', {
      url: 'https://api.coingecko.com/api/v3/simple/price', auth: 'none',
      query: { ids: `={{ Object.keys(${cfg('coins')}).join(',') }}`, vs_currencies: `={{ ${cfg('vs_currency')} }}`, include_24hr_change: 'true', include_last_updated_at: 'true' },
    }),
    code('Load sample prices', `
// Used until USE_COINGECKO is true. Same shape as simple/price; cardano is missing on
// purpose, as happens when an id is misspelled.
const t = Math.floor(Date.now() / 1000) - 60;
return [{ json: {
  bitcoin: { usd: 63240.18, usd_24h_change: -6.31, last_updated_at: t },
  ethereum: { usd: 2448.9, usd_24h_change: 4.12, last_updated_at: t },
  solana: { usd: 171.42, usd_24h_change: 12.74, last_updated_at: t },
  dogecoin: { usd: 0.1187, usd_24h_change: -9.05, last_updated_at: t },
} }];`),
    merge('Combine price sources'),
    code('Find coins past their threshold', `
// |24h change| >= the coin's threshold. Cooldown per coin lives in static data; a move
// that grew by ESCALATE_PCT points since the last alert breaks through it.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global').crypto_alerts || {};
const prices = Object.assign({}, ...$input.all().map(i => i.json));
const cur = cfg.vs_currency.toLowerCase();
const now = Date.now();
const alerts = [], quiet = [];
const money = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase(), maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 2 : 4 }).format(v);
for (const [id, c] of Object.entries(cfg.coins)) {
  const p = prices[id];
  if (!p || typeof p[cur] !== 'number') { quiet.push({ coin: c.symbol, reason: 'no price returned for id ' + id }); continue; }
  const change = Math.round((p[cur + '_24h_change'] ?? 0) * 100) / 100;
  if (Math.abs(change) < c.threshold_pct) { quiet.push({ coin: c.symbol, reason: (change > 0 ? '+' : '') + change + '% is under ' + c.threshold_pct + '%' }); continue; }
  const last = memory[id];
  const cooling = last && now - last.at < cfg.cooldown_hours * 36e5;
  const grew = last && Math.sign(last.change) === Math.sign(change) && Math.abs(change) - Math.abs(last.change) >= cfg.escalate_pct;
  if (cooling && !grew) { quiet.push({ coin: c.symbol, reason: 'cooldown, alerted ' + Math.round((now - last.at) / 6e4) + ' min ago at ' + last.change + '%' }); continue; }
  alerts.push({ id, symbol: c.symbol, price: p[cur], change, threshold: c.threshold_pct, escalated: Boolean(cooling && grew),
    line: (change > 0 ? '↑ ' : '↓ ') + c.symbol + ' ' + money(p[cur]) + ' (' + (change > 0 ? '+' : '') + change.toFixed(2) + '% in 24h, limit ' + c.threshold_pct + '%)' + (cooling && grew ? ' still moving' : '') });
}
alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
const text = ['Crypto move alert', ...alerts.map(a => a.line)].join('\\n');
return [{ json: { alerts, quiet, text, send_to: cfg.mode === 'test' ? cfg.test_telegram_chat_id : cfg.telegram_chat_id } }];`),
    ifTrue('Anything to alert?', '$json.alerts.length > 0'),
    stop('STOP: no big moves'),
    ifTrue('Sending switched on?', `${cfg('sends_enabled')} && $json.send_to !== ''`),
    stop('STOP: preview - nothing sent'),
    telegram.send('Send the alert on Telegram', '$json.send_to', "($('config').first().json.mode === 'test' ? '[TEST] ' : '') + $json.text"),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - cooldown not set'),
    code('Remember alerted coins', `
// Start each alerted coin's cooldown, with the change it was alerted at.
const memory = $getWorkflowStaticData('global');
const seen = memory.crypto_alerts || {};
for (const a of $('Find coins past their threshold').first().json.alerts) seen[a.id] = { at: Date.now(), change: a.change };
memory.crypto_alerts = seen;
return [{ json: { coins_in_cooldown: Object.keys(seen).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 15 minutes', 'config'],
    ['config', 'CoinGecko enabled?'],
    ['CoinGecko enabled?', 0, 'Fetch prices from CoinGecko'], ['CoinGecko enabled?', 1, 'Load sample prices'],
    ['Fetch prices from CoinGecko', 'Combine price sources'], ['Load sample prices', 0, 'Combine price sources', 1],
    ['Combine price sources', 'Find coins past their threshold'],
    ['Find coins past their threshold', 'Anything to alert?'],
    ['Anything to alert?', 0, 'Sending switched on?'], ['Anything to alert?', 1, 'STOP: no big moves'],
    ['Sending switched on?', 0, 'Send the alert on Telegram'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Send the alert on Telegram', 'Live run?'],
    ['Live run?', 0, 'Remember alerted coins'], ['Live run?', 1, 'STOP: test send - cooldown not set'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 15 minutes, well inside the public CoinGecko rate limit. The watchlist, each coin\'s threshold and the cooldown rules live in `config`.', nodes: ['Run manually', 'Every 15 minutes', 'config'] },
    { title: 'Read prices', why: 'One simple/price call returns every coin with its 24-hour change, so the run costs a single request. `Load sample prices` returns the same shape with one coin missing, as a misspelled id would.', nodes: ['CoinGecko enabled?', 'Fetch prices from CoinGecko', 'Load sample prices', 'Combine price sources'] },
    { title: 'Check moves and cooldowns', why: 'Thresholds are per coin, and the cooldown only gives way when the move grows by `ESCALATE_PCT` in the same direction. That stops a coin hovering at its limit from alerting every 15 minutes.', nodes: ['Find coins past their threshold', 'Anything to alert?', 'STOP: no big moves'] },
    { title: 'Send and start cooldowns', why: 'Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. Cooldowns start only after a live send, so a test alert never silences the real one.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Send the alert on Telegram', 'Live run?', 'STOP: test send - cooldown not set', 'Remember alerted coins'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample prices', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const r = out['Find coins past their threshold'][0];
        const f: string[] = [];
        if (r.alerts.map((a: any) => a.symbol).join(',') !== 'SOL,BTC') f.push(`expected SOL then BTC, got ${r.alerts.map((a: any) => a.symbol).join(',')}`);
        if (!r.text.includes('↓ BTC $63,240 (-6.31% in 24h, limit 5%)')) f.push(`BTC line wrong: ${r.text}`);
        if (!r.text.includes('↑ SOL $171.42')) f.push('SOL should show an up arrow and 2 decimals');
        const why = (s: string) => r.quiet.find((q: any) => q.coin === s)?.reason;
        if (why('DOGE') !== '-9.05% is under 10%') f.push('DOGE is under its 10% threshold');
        if (!why('ADA')?.startsWith('no price returned')) f.push('ADA missing from the response');
        return f;
      },
    },
    {
      name: 'live prices and Telegram', start: 'Every 15 minutes',
      overrides: { USE_COINGECKO: true, TEST_RUN: false, TELEGRAM_CHAT_ID: '-1001234567890', VS_CURRENCY: 'eur' },
      mocks: {
        'Fetch prices from CoinGecko': [{ bitcoin: { eur: 58000, eur_24h_change: 2.1 }, ethereum: { eur: 2100, eur_24h_change: -7.4 }, solana: { eur: 150, eur_24h_change: 1 }, dogecoin: { eur: 0.1, eur_24h_change: 0 }, cardano: { eur: 0.31, eur_24h_change: -8.2 } }],
        'Send the alert on Telegram': [{ ok: true, result: { message_id: 55 } }],
      },
      expect: { reached: ['Send the alert on Telegram', 'Remember alerted coins'], notReached: ['Load sample prices'], outward: 'some' },
      check: out => {
        const r = out['Find coins past their threshold'][0];
        const f: string[] = [];
        if (r.alerts.map((a: any) => a.symbol).join(',') !== 'ADA,ETH') f.push('ADA (-8.2%) and ETH (-7.4%) should alert');
        if (!r.text.includes('€2,100')) f.push('prices should be in EUR');
        if (out['Remember alerted coins'][0].coins_in_cooldown !== 2) f.push('two cooldowns should start');
        return f;
      },
    },
  ],
});
