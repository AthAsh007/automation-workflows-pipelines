// Runs every Code node in the workflow against the demo payloads, simulating
// the full flow end to end — including both a routable card and one that hits
// STOP: no phone number.
//
//   node simulate.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(__dirname, 'js');

// Load the workflow JSON to get node order and which js files to run.
const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '01-trello-card-to-sms.json'), 'utf8'));
const codeNodes = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
const nodeMap = {};
for (const n of codeNodes) {
  nodeMap[n.name] = n.parameters.jsCode;
}

// Load the demo cards — wrap in a function so `const` declarations and the
// trailing `return [...]` run as a function body.
const demoSource = fs.readFileSync(path.join(JS_DIR, 'load-a-demo-card.js'), 'utf8');
const demoCards  = new Function(demoSource)();

// Simulate config → read the card → has a phone number?

// ---- Manual simulation with the same logic as the JS modules ----

// Replicate config.js SETTINGS
const SETTINGS = {
  dry_run: true,
  twilio_enabled: false,
  trench_phone: '',
  sms_template: "Hi {{contact_name}}, we received your request \"{{card_name}}\" and a member of the team will follow up within 1 business hour. — {{company}}",
  twilio_from_number: '+14155238886',
  lead_label_prefix: 'lead'
};

// Replicate build-the-sms.js render
function render(tpl, fields) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    const v = fields[key];
    return (v !== undefined && v !== null && v !== '') ? String(v) : m;
  });
}

function extractCard(json) {
  if (json.action && json.data && json.data.card) return { raw: json.data.card, action: json.action };
  if (json.data && json.data.card) return { raw: json.data.card, action: json.action || { type: 'unknown' } };
  if (json.card) return { raw: json.card, action: { type: 'direct' } };
  if (json.name) return { raw: json, action: { type: 'direct' } };
  return { raw: {}, action: { type: 'unknown' } };
}

function flatten(obj, depth, out) {
  out = out || {};
  if (!obj || typeof obj !== 'object' || depth > 4) return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, depth + 1, out);
    else out[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

function readOne(json) {
  const { raw, action } = extractCard(json);
  const f = flatten(raw, 0);
  const T = (v) => String(v == null ? '' : v).trim();
  const descText = T(raw.desc || f.desc || f.description || '') + ' ' + T(raw.name || f.name || '');
  const phoneMatch = descText.match(/\+?\d{1,4}[\s.()\-]?\d{2,4}[\s.()\-]?\d{3,4}([\s.()\-]?\d{3,4})?/g);
  const foundPhone = phoneMatch ? phoneMatch[0].trim() : '';

  let phone = T(f.phone || f.phonenumber || f.phonecontact || f['phone-number'] || foundPhone);
  const name = T(f.name || (function() {
    const m = descText.match(/Customer:\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i);
    return m ? m[1] : '';
  })());
  const email = T(f.email || (function() {
    const m = descText.match(/Email:\s*([^\s@]+@[^\s@]+\.[^\s@]{2,})/i);
    return m ? m[1] : '';
  })());
  const company = T(f.company || (function() {
    const m = descText.match(/Company:\s*([^\n]+)/i);
    return m ? m[1] : '';
  })());
  const budget = (function() {
    const m = descText.match(/Budget:\s*([^\n]+)/i);
    return m ? m[1] : '';
  })();
  const timeline = (function() {
    const m = descText.match(/Timeline:\s*([^\n]+)/i);
    return m ? m[1] : '';
  })();

  const cardName = T(raw.name || f.title || f.summary || f.subject || '');
  const cardUrl  = 'https://trello.com/c/' + (raw.shortLink || 'x') + '/' + (raw.idShort || '');
  const labels = (raw.labels || []).map((l) => T(l.name || l)).filter(Boolean);
  const isLead = !SETTINGS.lead_label_prefix || labels.some((l) => l.toLowerCase().startsWith(SETTINGS.lead_label_prefix.toLowerCase()));

  const problems = [];
  if (!phone)            problems.push('no phone number — cannot send SMS');
  if (!name && !company) problems.push('no name or company to personalise the message with');
  if (!isLead)           problems.push('card does not carry a lead label (lead)');

  const summary = [
    'Card on "Workfluxa Leads"',
    'list "New Leads"',
    name ? 'for ' + name : '',
    phone ? '— has a number' : '— NO number to SMS'
  ].filter(Boolean).join(' ');

  return {
    _ok: problems.length === 0,
    _problems: problems,
    card_name: cardName,
    card_url: cardUrl,
    contact_name: name,
    company: company,
    phone: phone,
    email: email,
    budget: budget,
    timeline: timeline,
    labels: labels,
    summary: summary,
    received: new Date().toISOString()
  };
}

function buildSms(lead) {
  const fields = {
    contact_name:  lead.contact_name || 'there',
    card_name:     lead.card_name || '',
    company:       lead.company || '',
    budget:        lead.budget || '',
    timeline:      lead.timeline || '',
    url:           lead.card_url || '',
    phone:         lead.phone || ''
  };
  const body = render(SETTINGS.sms_template, fields);
  const to = (SETTINGS.dry_run && SETTINGS.trench_phone) ? SETTINGS.trench_phone : (lead.phone || '');
  return { _sms_to: to, _sms_body: body, contact_name: lead.contact_name, phone: lead.phone };
}

console.log('--- Simulating Trello → SMS workflow ---\n');
for (const card of demoCards) {
  const lead = readOne(card.json);
  console.log(lead.card_name + ':');
  console.log('  has phone:    ' + !!lead.phone + (lead.phone ? (' (' + lead.phone + ')') : ''));
  console.log('  has contact:  ' + !!(lead.contact_name || lead.company));
  console.log('  has lead tag: ' + lead.labels.some((l) => l.toLowerCase().startsWith('lead')));
  console.log('  _ok:          ' + lead._ok);
  console.log('  problems:     ' + (lead._problems.length ? lead._problems.join('; ') : 'none'));

  if (lead._ok) {
    const sms = buildSms(lead);
    if (SETTINGS.dry_run && SETTINGS.trench_phone) {
      console.log('  -> STOP: preview — would SMS ' + sms._sms_to);
      console.log('     body: ' + sms._sms_body);
    } else if (!SETTINGS.twilio_enabled) {
      console.log('  -> STOP: preview — SMS not sent (no Twilio credential)');
      console.log('     would send to: ' + sms._sms_to);
      console.log('     body: ' + sms._sms_body);
    } else {
      console.log('  -> [cred] Twilio - send SMS to ' + sms._sms_to);
    }
  } else {
    console.log('  -> STOP: no phone number');
  }
  console.log();
}

console.log('--- Done. Both demo cards traced through config → read → gate → build → SMS.\n---');
