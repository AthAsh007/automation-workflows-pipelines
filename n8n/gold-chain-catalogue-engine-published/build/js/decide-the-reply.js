// Builds the reply to every message, and the alert to the owner where a person should step in.
// The rule that makes this safe to leave running: EVERY price and stock figure in a reply is
// read from the stock sheet, from the price workflow 01 last published. The AI never writes
// a reply and never states a number. In order, a message is:
//   opted out    -> confirmed, and marked so no list is ever sent to them again
//   a handoff    -> an order, a bulk quantity, a custom piece, a complaint: acknowledged, and
//                   the owner is told who, what and why. The bot does not negotiate.
//   a question   -> answered from stock: exact match, or the nearest in-stock alternatives
//   unreadable   -> asked which style and karat, with the styles actually in stock
// One item out per message to send: kind 'reply' (to the customer) or 'owner' (the alert).
const cfg = $('config').first().json;
//@include lib-pricing.js

const out = [];
for (const item of $input.all()) {
  const m = item.json;
  const w = m.want || {};
  const rows = (m._stock || []).map(readRow).filter((r) => cfg.styles[r.style] && cfg.purity[r.purity_k]);
  const who = m.name || m.from;
  const reply = (body, extra) => out.push({ json: Object.assign({ kind: 'reply', to: m.from, customer: who,
    message: m.text, read_by: m.read_by, body }, extra || {}) });
  const owner = (why) => out.push({ json: { kind: 'owner', to: cfg.owner_whatsapp, customer: who,
    message: m.text, body: 'Needs you: ' + who + ' (' + m.from + ')\nWhy: ' + why + '\nThey said: "' + m.text + '"' } });

  if (m.opt_out) {
    reply("Done. You won't receive our price lists any more. Message us any time if you need anything.",
      { opt_out_record: { whatsapp: m.from, opted_out: 'yes' } });
    continue;
  }

  const bigOrder = w.qty && w.qty >= cfg.handoff_qty;
  if (m.handoff_word || bigOrder) {
    const why = bigOrder ? w.qty + ' pieces (HANDOFF_QTY is ' + cfg.handoff_qty + ')' : 'asked about "' + m.handoff_word + '"';
    reply('Thanks, ' + (m.name || 'there') + '. ' + cfg.owner_name.charAt(0).toUpperCase() + cfg.owner_name.slice(1) +
      ' will reply to you personally about this shortly.', { handoff: why });
    owner(why);
    continue;
  }

  if (!w.style && !w.purity_k) {
    const styles = Object.keys(cfg.styles).filter((s) => rows.some((r) => r.style === s && r.qty > 0))
      .map((s) => cfg.styles[s].label);
    reply('Happy to help. Which chain are you after? In stock today: ' + styles.join(', ') +
      '. Tell me the style and karat (e.g. "22k rope 20 inch").');
    continue;
  }

  const fits = (r) => (!w.style || r.style === w.style) && (!w.purity_k || r.purity_k === w.purity_k);
  const inStock = rows.filter((r) => fits(r) && r.qty > 0)
    .sort((a, b) => Math.abs((a.length_in || 0) - (w.length_in || a.length_in)) - Math.abs((b.length_in || 0) - (w.length_in || b.length_in)));
  const exact = w.length_in ? inStock.filter((r) => r.length_in === w.length_in) : inStock;
  const show = (exact.length ? exact : inStock).slice(0, 3);
  const asked = [w.purity_k ? w.purity_k + 'k' : '', w.style ? cfg.styles[w.style].label : '', w.length_in ? w.length_in + 'in' : '']
    .filter(Boolean).join(' ');

  const priceOf = (r) => (r.prev_price > 0 ? money(r.prev_price, cfg) : 'price on request');
  const lines = show.map((r) => '• ' + chainLabel(r, cfg) + ' · ' + r.weight_g + ' g · ' + priceOf(r) + ' · ' +
    (r.qty <= cfg.low_stock_at ? 'last ' + r.qty : r.qty + ' pcs'));
  const listedOn = show.map((r) => r.priced_at).filter(Boolean).sort().pop();

  if (!show.length) {
    reply('Sorry, no ' + asked + ' in stock right now. I have let ' + cfg.owner_name + ' know you asked.');
    owner('asked for ' + asked + ', none in stock');
    continue;
  }
  const lead = exact.length || !w.length_in ? 'Yes, ' + asked + ' in stock:' : 'No ' + asked + ' right now. Closest in stock:';
  reply([lead].concat(lines,
    listedOn ? ['Prices from our list of ' + listedOn + '. Reply "order" and the number of pieces to reserve.'] :
               ['Reply "order" and the number of pieces to reserve.']).join('\n'));
}
return out;
