// Prices every checked row at today's rate and decides what changed since the last list:
// new in, back in stock, sold out, last few. Also decides whether today's rate is believable
// at all (see MAX_RATE_MOVE_PCT) — the gate after this node reads `rate_ok`.
const cfg = $('config').first().json;
const stock = $('check the stock rows').first().json;
const rateIn = $input.first().json || {};
//@include lib-pricing.js

const rate = Number(rateIn.rate_24k) || 0;
const last = stock.last_rate;
const move = last ? ((rate - last) / last) * 100 : null;

let rate_ok = true, rate_note = '';
if (!(rate > 0)) { rate_ok = false; rate_note = 'no usable rate came back'; }
else if (rateIn.currency && rateIn.currency !== cfg.currency) {
  rate_ok = false; rate_note = 'rate is in ' + rateIn.currency + ', the price list is in ' + cfg.currency;
} else if (move !== null && Math.abs(move) > cfg.max_rate_move_pct) {
  rate_ok = false;
  rate_note = 'rate moved ' + move.toFixed(1) + '% since the last list (' + last + ' -> ' + rate +
    '), more than MAX_RATE_MOVE_PCT ' + cfg.max_rate_move_pct + '%';
} else if (move === null) rate_note = 'first priced list: no earlier rate to compare against';
else rate_note = 'rate ' + (move >= 0 ? 'up ' : 'down ') + Math.abs(move).toFixed(1) + '% since the last list';

const chains = stock.rows.map((r) => {
  const p = priceChain(r, rate, cfg);
  let change = '';
  if (!(r.prev_price > 0) && !r.priced_at) change = 'new';
  else if (r.qty === 0 && r.prev_qty > 0) change = 'sold out';
  else if (r.qty > 0 && r.prev_qty === 0) change = 'back in stock';
  else if (r.qty > 0 && r.qty <= cfg.low_stock_at) change = 'last few';
  return Object.assign({}, r, p, { label: chainLabel(r, cfg), change });
});

return [{ json: {
  rate_24k: rate, rate_source: rateIn.rate_source, currency: cfg.currency,
  last_rate: last, rate_move_pct: move === null ? null : Math.round(move * 10) / 10,
  rate_ok, rate_note,
  chains, held: stock.held, stock_source: stock.source
} }];
