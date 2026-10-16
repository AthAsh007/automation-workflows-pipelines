// Three views of one priced stock list, so they can never disagree with each other:
//   stock_list    every chain, sold-out included: the internal count sheet
//   stock_csv     the same as CSV, for the accountant or the sheet
//   catalogue     what a customer sees: in-stock chains only, grouped by style
// plus the announcement draft, which says only what CHANGED. A customer who has the
// catalogue does not need the whole list again every morning.
const cfg = $('config').first().json;
const j = $input.first().json;
//@include lib-pricing.js

const today = new Date().toISOString().slice(0, 10);
const byStyle = {};
for (const c of j.chains) (byStyle[c.style] = byStyle[c.style] || []).push(c);
const styleOrder = Object.keys(cfg.styles).filter((s) => byStyle[s]);
const sortChains = (a, b) => a.purity_k - b.purity_k || a.length_in - b.length_in || a.weight_g - b.weight_g;

// 22k is what most wholesale buyers quote in, so it is stated as well as 24k.
const rate22 = Math.round(j.rate_24k * cfg.purity[22] * 100) / 100;
const rateLine = '24k ' + money(j.rate_24k, cfg) + '/g · 22k ' + money(rate22, cfg) + '/g';
const demoTag = /DEMO/.test(j.rate_source) ? ' (DEMO RATE, NOT A MARKET PRICE)' : '';

const line = (c) => '• ' + c.purity_k + 'k ' + c.length_in + 'in · ' + c.weight_g + ' g · ' +
  money(c.price, cfg) + ' · ' + c.qty + (c.qty === 1 ? ' pc' : ' pcs');

const catalogue = ['*' + cfg.business_name + ', ' + today + '*', rateLine + demoTag, ''];
for (const s of styleOrder) {
  const inStock = byStyle[s].filter((c) => c.qty > 0).sort(sortChains);
  if (!inStock.length) continue;
  catalogue.push('*' + cfg.styles[s].label + '*');
  for (const c of inStock) catalogue.push(line(c));
  catalogue.push('');
}
catalogue.push("Prices at today's rate, valid today. Reply with the chain you want.");

const stock_list = j.chains.slice().sort((a, b) => (a.sku < b.sku ? -1 : 1))
  .map((c) => c.sku.padEnd(8) + ' ' + c.label.padEnd(18) + ' ' + String(c.weight_g).padStart(5) +
    ' g  ' + String(c.qty).padStart(3) + ' pcs  ' + money(c.price, cfg));

const csvCell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const stock_csv = [['sku', 'style', 'purity_k', 'length_in', 'weight_g', 'qty', 'price', 'currency', 'rate_24k', 'priced_on']]
  .concat(j.chains.map((c) => [c.sku, c.style, c.purity_k, c.length_in, c.weight_g, c.qty, c.price, cfg.currency, j.rate_24k, today]))
  .map((r) => r.map(csvCell).join(',')).join('\n');

// The announcement: the rate, then only what changed. Short enough to read on a phone.
const pick = (kind) => j.chains.filter((c) => c.change === kind).sort(sortChains);
const ann = ['*' + cfg.business_name + "*: today's rate", rateLine + demoTag];
if (j.rate_move_pct !== null) ann.push('(' + (j.rate_move_pct >= 0 ? 'up ' : 'down ') + Math.abs(j.rate_move_pct) + '% since our last list)');
const section = (title, list, fmt) => {
  if (!list.length) return;
  ann.push('', '*' + title + '*');
  list.forEach((c) => ann.push(fmt(c)));
};
section('New in', pick('new'), (c) => '• ' + c.label + ' · ' + c.weight_g + ' g · ' + money(c.price, cfg));
section('Back in stock', pick('back in stock'), (c) => '• ' + c.label + ' · ' + c.weight_g + ' g · ' + money(c.price, cfg));
section('Last few', pick('last few'), (c) => '• ' + c.label + ' · ' + c.qty + ' left · ' + money(c.price, cfg));
section('Sold out', pick('sold out'), (c) => '• ' + c.label);
ann.push('', "Reply with the chain you want for today's price.");
let announcement = ann.join('\n');
// WhatsApp over Twilio caps a message at 1,600 characters. Cut at a line, and say so.
if (announcement.length > 1500) {
  announcement = announcement.slice(0, 1450).replace(/\n[^\n]*$/, '') + '\n...and more. Reply for the full list.';
}

return [{ json: Object.assign({}, j, {
  today, rate_22k: rate22,
  catalogue: catalogue.join('\n').trim(),
  stock_list: stock_list.join('\n'),
  stock_csv,
  announcement,
  counts: {
    priced: j.chains.length, in_stock: j.chains.filter((c) => c.qty > 0).length,
    new: pick('new').length, back_in_stock: pick('back in stock').length,
    last_few: pick('last few').length, sold_out: pick('sold out').length, held_back: j.held.length
  }
}) }];
