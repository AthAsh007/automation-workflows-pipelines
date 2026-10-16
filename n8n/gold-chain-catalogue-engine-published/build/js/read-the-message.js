// Reads each WhatsApp message into one shape and makes the keyword read of it. The keyword
// read always runs: with no AI key it IS the read, and with a key it is the fallback when the
// model's answer does not parse.
//
// Messages come from `config` (one item per webhook call). Run by hand, config carries no
// message, so the invented DEMO_MESSAGES stand in. The stock arrives on $input from whichever
// stock branch ran, and rides along on every item so the reply can be built from it.
// Twilio posts form fields (From, Body, ProfileName), sometimes wrapped under `body`.
const cfg = $('config').first().json;
const stock = ($input.first().json || {}).rows || [];
const stockSource = ($input.first().json || {}).source || '';

function unwrap(inc) { return inc && inc.body && typeof inc.body === 'object' ? inc.body : (inc || {}); }
let messages = $('config').all().map((i) => unwrap(i.json.incoming)).filter((m) => m.Body || m.body || m.text);
const demo = messages.length === 0;
if (demo) messages = cfg.demo_messages;

function words(text) { return ' ' + text.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ') + ' '; }
const has = (t, w) => t.indexOf(' ' + w + ' ') !== -1;

return messages.map((p) => {
  const text = String(p.Body || p.body || p.text || '').trim();
  const from = String(p.From || p.from || '').replace(/^whatsapp:/, '').trim();
  const name = String(p.ProfileName || p.name || '').trim();
  const t = words(text);

  let style = '';
  for (const key of Object.keys(cfg.styles)) {
    if (cfg.styles[key].words.some((w) => has(t, w))) { style = key; break; }
  }
  const k = t.match(/\s(\d{2})\s?(k|kt|karat|carat|ct)\s/);
  const len = t.match(/\s(\d{2})\s?(in|inch|inches)\s/);
  const qty = t.match(/\s(\d{1,4})\s?(pcs|pc|pieces|piece|units|chains)\s/);

  return { json: {
    from, name, text, demo,
    opt_out: cfg.opt_out_words.some((w) => t.trim() === w || has(t, w)),
    handoff_word: cfg.handoff_words.find((w) => has(t, w)) || '',
    want: {
      style,
      purity_k: k ? Number(k[1]) : null,
      length_in: len ? Number(len[1]) : null,
      qty: qty ? Number(qty[1]) : null
    },
    read_by: 'keyword rules',
    _stock: stock, _stock_source: stockSource
  } };
});
