// The one place that decides where a message actually goes. Live: to the customer, and alerts
// to OWNER_WHATSAPP. Test: everything to TEST_WHATSAPP, at most test_cap, marked [TEST] with
// the real recipient. An owner alert with no OWNER_WHATSAPP is not sent and says so.
const cfg = $('config').first().json;
const out = [];
for (const i of $input.all()) {
  const m = i.json;
  if (m.kind === 'owner' && !cfg.owner_whatsapp && cfg.mode === 'live') continue;
  if (cfg.mode === 'test') {
    if (out.length >= cfg.test_cap) break;
    out.push({ json: Object.assign({}, m, { to: cfg.test_whatsapp,
      body: '[TEST: would go to ' + (m.kind === 'owner' ? 'the owner' : m.customer + ' ' + m.to) + ']\n' + m.body }) });
  } else out.push({ json: m });
}
return out.map((o) => ({ json: Object.assign({}, o.json, { to: String(o.json.to || '').replace(/^whatsapp:/, '') }) }));
