// Runs both workflows' Code nodes against the demo stock, rate, customers and messages, down
// the path an import with nothing configured takes, plus the AI and live-send paths with
// stand-in responses. Checks the logic before anything is imported into n8n.
//   bun simulate.js
const fs = require('fs');
const path = require('path');

function load(file) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  const nodes = {};
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') nodes[n.name] = n;
  return nodes;
}
let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(48) + String(got).slice(0, 70));
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

function harness(WF, overrides) {
  const store = {};
  return {
    store,
    run(name, items) {
      const node = WF[name];
      if (!node) throw new Error('no Code node named ' + name);
      if (node.executeOnce) items = items.slice(0, 1);
      const wrap = (a) => a.map((j) => ({ json: j }));
      const $input = { all: () => wrap(items), first: () => ({ json: items[0] }) };
      const $ = (n) => {
        const a = store[n];
        if (!a) throw new Error('simulate: "' + n + '" has no recorded output');
        return { all: () => wrap(a), first: () => ({ json: a[0] }) };
      };
      let src = node.parameters.jsCode;
      if (name === 'config' && overrides) {
        for (const [k, v] of Object.entries(overrides)) src = src.replace(new RegExp('^const ' + k + '\\s*=.*$', 'm'), 'const ' + k + ' = ' + v + ';');
      }
      const out = new Function('$input', '$', '"use strict";' + src)($input, $);
      store[name] = out.map((o) => o.json);
      return store[name];
    }
  };
}

// ====================================================================== 01, preview
console.log('--- 01 reprice and announce: nothing configured ---');
const W1 = load('01-reprice-and-announce.json');
const h = harness(W1);
const cfg = h.run('config', [{}])[0];
expect('mode', cfg.mode, 'preview');
expect('nothing enabled', [cfg.sheet_enabled, cfg.gold_api_enabled, cfg.send_enabled, cfg.write_enabled].join(), 'false,false,false,false');
h.run('check the stock rows', h.run('use the demo stock', [cfg]));
const checked = h.store['check the stock rows'][0];
expect('rows priceable', checked.rows.length, 9);
expect('held back', checked.held.map((x) => x.sku).join(), 'R22-18,C20-20');
expect('held reason: no weight', checked.held[0].reasons, 'no weight');
expect('held reason: 20k', checked.held[1].reasons, '20k is not in the PURITY table');
expect('last list rate (median)', checked.last_rate, 108.4);

const priced = h.run('price every chain', h.run('use the demo gold rate', [cfg]))[0];
expect('rate ok at +1.5%', priced.rate_ok, true);
expect('rate move', priced.rate_move_pct, 1.5);
const r2220 = priced.chains.find((c) => c.sku === 'R22-20');
// 18.4 g x 0.916 x 110 = 1853.97 metal; 18.4 x 3.5 = 64.4 making; x 1.02 = 1956.7 -> 1957
expect('R22-20 metal value', r2220.metal_value, 1853.98);
expect('R22-20 price', r2220.price, 1957);
const change = (sku) => priced.chains.find((c) => c.sku === sku).change;
expect('C18-20 sold out', change('C18-20'), 'sold out');
expect('F22-20 back in stock', change('F22-20'), 'back in stock');
expect('B21-18 last few', change('B21-18'), 'last few');
expect('FR22-22 new', change('FR22-22'), 'new');
expect('F18-18 unchanged', change('F18-18'), '');

const cat = h.run('build the catalogue', [priced])[0];
expect('catalogue leaves out sold out', cat.catalogue.includes('28.6 g'), false);
expect('catalogue says DEMO rate', cat.catalogue.includes('DEMO RATE'), true);
expect('announcement lists new in', /\*New in\*\n• 18k Ball 16in/.test(cat.announcement), true);
expect('announcement under 1600 chars', cat.announcement.length < 1600, true);
expect('csv rows', cat.stock_csv.split('\n').length, 10);
expect('counts', JSON.stringify(cat.counts), '{"priced":9,"in_stock":8,"new":2,"back_in_stock":1,"last_few":2,"sold_out":1,"held_back":2}');

const plan = h.run('plan the broadcast', h.run('use the demo customers', [cfg]))[0];
expect('sends', plan.sends.map((s) => s.name).join(), 'Northgate Jewellers,Al Noor Gold,Crown & Chain');
expect('skipped with reasons', plan.skipped.map((s) => s.why).join(' | '), 'opted out | not a usable number: 0100');
const shown = h.run('STOP: preview - draft shown', [plan])[0];
expect('preview outcome', shown._outcome, 'preview: nothing sent');

console.log('\n--- 01: a rate that moved 10% is refused ---');
const h2 = harness(W1, { DEMO_GOLD_RATE: '120' });
const cfg2 = h2.run('config', [{}])[0];
h2.run('check the stock rows', h2.run('use the demo stock', [cfg2]));
const p2 = h2.run('price every chain', h2.run('use the demo gold rate', [cfg2]))[0];
expect('rate refused', p2.rate_ok, false);
expect('refusal reason', /moved 10\.7%/.test(p2.rate_note), true);

console.log('\n--- 01: every goldapi.io response shape reads the same ---');
for (const [label, resp] of [
  ['price_gram_24k', { price_gram_24k: 110.5, currency: 'USD' }],
  ['melt_price_per_gram', { melt_price_per_gram: { '24k': 110.5 }, currency: 'USD' }],
  ['troy ounce only', { price: 3436.94, currency: 'USD' }]]) {
  expect('rate from ' + label, h.run('read the gold rate', [resp])[0].rate_24k, 110.5);
}
expect('no usable field reads as 0', h.run('read the gold rate', [{ error: 'x' }])[0].rate_24k, 0);

console.log('\n--- 01: test mode redirects and caps ---');
const h3 = harness(W1, { TEST_WHATSAPP: "'+12025550199'", TWILIO_WHATSAPP_FROM: "'+12025550100'" });
const cfg3 = h3.run('config', [{}])[0];
expect('mode', cfg3.mode, 'test');
expect('sending on, writing off', [cfg3.send_enabled, cfg3.write_enabled].join(), 'true,false');
h3.run('check the stock rows', h3.run('use the demo stock', [cfg3]));
h3.run('build the catalogue', h3.run('price every chain', h3.run('use the demo gold rate', [cfg3])));
const plan3 = h3.run('plan the broadcast', h3.run('use the demo customers', [cfg3]))[0];
expect('all to the test number', [...new Set(plan3.sends.map((s) => s.to))].join(), '+12025550199');
expect('owner request to the test number', plan3.owner_to, '+12025550199');
expect('marked [TEST]', plan3.sends[0].body.startsWith('[TEST: would go to Northgate'), true);
const per = h3.run('one message per customer', [{}]);
expect('one item per recipient', per.length, 3);
const notWritten = h3.run('STOP: preview - prices not written', [{}])[0];
expect('sheet not written in test', notWritten._outcome, 'preview: sheet not written');

// ====================================================================== 02
console.log('\n--- 02 WhatsApp enquiries: demo messages, keyword rules ---');
const W2 = load('02-whatsapp-enquiries.json');
const g = harness(W2);
const c = g.run('config', [{}]);
g.run('use the demo stock', c);
const read = g.run('read the message', g.store['use the demo stock']);
expect('five demo messages read', read.length, 5);
expect('rope 22k 20in read', JSON.stringify(read[0].want), '{"style":"rope","purity_k":22,"length_in":20,"qty":null}');
expect('40 pcs read', read[2].want.qty, 40);
expect('STOP read as opt-out', read[4].opt_out, true);
const kw = g.run('keyword reading only', read);
const replies = g.run('decide the reply', kw);
const to = (n) => replies.filter((r) => r.customer === n);
expect('exact match answered from the sheet', /Yes, 22k Rope 20in in stock:\n• 22k Rope 20in · 18.4 g · \$1,930/.test(to('Northgate Jewellers')[0].body), true);
expect('quotes the published price, not today\'s', to('Northgate Jewellers')[0].body.includes('list of 2026-09-18'), true);
expect('figaro 18k answered', to('Al Noor Gold')[0].body.includes('18k Figaro 18in'), true);
expect('40 pcs handed off', to('Crown & Chain').map((r) => r.kind).join(), 'reply,owner');
expect('handoff reason', to('Crown & Chain')[1].body.includes('40 pieces'), true);
expect('custom handed off', to('Northgate Jewellers')[1].kind, 'reply');
expect('custom alert to owner', replies.filter((r) => r.kind === 'owner').length, 2);
const opt = replies.find((r) => r.opt_out_record);
expect('opt-out confirmed and recorded', opt.opt_out_record.whatsapp, '+12025550104');
const addressed = g.run('address the messages', replies);
const pv = g.run('STOP: preview - replies shown', addressed);
expect('preview shows every message', pv.length, replies.length);
const rows = g.run('rows for the customers tab', [{}]);
expect('one opt-out row', rows.length, 1);

console.log('\n--- 02: the AI reading is merged, never trusted blindly ---');
const g2 = harness(W2, { AI_API_KEY: "'sk-test'" });
const c2 = g2.run('config', [{ Body: 'got any of those miami ones in twenty two carat, 22 inch?', From: 'whatsapp:+12025550101', ProfileName: 'Northgate Jewellers' }]);
g2.run('use the demo stock', c2);
const r2 = g2.run('read the message', g2.store['use the demo stock']);
expect('keyword read found the style', r2[0].want.style, 'cuban');
expect('...but not the spelled-out karat', r2[0].want.purity_k, null);
const req = g2.run('build the AI request', r2);
expect('AI is never shown a price', JSON.stringify(req[0]._ai_body).includes('$'), false);
const aiResp = [{ choices: [{ message: { content: '{"style":"cuban","purity_k":22,"length_in":22,"qty":null,"needs_person":false,"reason":"price question"}' } }] }];
const applied = g2.run('apply the AI reading', aiResp);
expect('AI filled in the karat', applied[0].want.purity_k, 22);
expect('read_by names the model', applied[0].read_by, 'AI (gpt-4o-mini)');
const rep = g2.run('decide the reply', applied);
expect('answered from stock', rep[0].body.startsWith('Yes, 22k Cuban 22in in stock:'), true);
const junk = g2.run('apply the AI reading', [{ error: 'timeout' }]);
expect('failed AI call keeps the keyword read', junk[0].read_by, 'keyword rules (AI answer did not parse)');
const bogus = g2.run('apply the AI reading', [{ choices: [{ message: { content: '{"style":"herringbone","purity_k":22}' } }] }]);
expect('unknown style from AI ignored', bogus[0].want.style, 'cuban');

// bun simulate.js --show  prints every message the demo run produces, for reading as a whole.
if (process.argv.includes('--show')) {
  console.log('\n=== announcement\n' + cat.announcement + '\n\n=== catalogue\n' + cat.catalogue +
    '\n\n=== stock list\n' + cat.stock_list + '\n\n=== owner approval request\n' + plan.owner_message);
  for (const r of replies) console.log('\n=== ' + r.kind + ' -> ' + r.customer + '\n' + r.body);
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nall simulations passed');
process.exit(failures ? 1 : 0);
