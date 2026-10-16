// One message to the team for the replies a person has to act on now: interested, referral,
// needs a human. It quotes the reply, so nobody has to open Smartlead to know what was said.
const cfg = $('config').first().json;
const hot = $input.all().map((i) => i.json).filter((r) => r._notify);
const label = { interested: 'Interested', referral: 'Referral', needs_human: 'Needs a person' };
const lines = hot.map((r) => '• ' + label[r.class] + ': ' + (r.lead_name || r.lead_email) + ' <' + r.lead_email + '>' +
  (r.referral_email ? ' → ' + r.referral_email : '') + '\n   "' + r.text.replace(/\s+/g, ' ').slice(0, 200) + '"');
const text = (cfg.mode === 'live' ? '' : '[' + cfg.mode.toUpperCase() + '] ') +
  hot.length + ' repl' + (hot.length === 1 ? 'y needs' : 'ies need') + ' a person:\n' + lines.join('\n');
return [{ json: { _count: hot.length, text: text, _notify_body: { text: text } } }];
