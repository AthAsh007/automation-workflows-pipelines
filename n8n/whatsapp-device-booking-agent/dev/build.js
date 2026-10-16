// Builds the final 01-05 workflow files from the live n8n exports.
// usage: bun build.js ../_raw-exports ..
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [, , EXP, OUT] = process.argv;
const SRC = path.join(__dirname, 'src');
const read = (f) => JSON.parse(fs.readFileSync(path.join(EXP, f), 'utf8'));
const src = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').trim();
const node = (wf, name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`${wf.name}: no node "${name}"`);
  return n;
};
const rename = (wf, from, to) => {
  node(wf, from).name = to;
  const c = {};
  for (const [k, v] of Object.entries(wf.connections)) {
    for (const outs of Object.values(v)) for (const list of outs) for (const l of list || []) if (l.node === from) l.node = to;
    c[k === from ? to : k] = v;
  }
  wf.connections = c;
};
const removeNode = (wf, name, rewireFrom, rewireTo) => {
  wf.nodes = wf.nodes.filter((n) => n.name !== name);
  delete wf.connections[name];
  if (rewireFrom) wf.connections[rewireFrom] = { main: [[{ node: rewireTo, type: 'main', index: 0 }]] };
};
// stable ids for nodes added here, so rebuilding doesn't churn the diff
const uuid = (seed) => {
  const h = crypto.createHash('md5').update('school-ipad-booking:' + seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const addNode = (wf, n) => {
  wf.nodes.push(Object.assign({ id: uuid(wf.name + '/' + n.name) }, n));
  return n;
};
const link = (wf, from, to, output = 0) => {
  const c = (wf.connections[from] = wf.connections[from] || { main: [] });
  while (c.main.length <= output) c.main.push([]);
  c.main[output] = (c.main[output] || []).concat([{ node: to, type: 'main', index: 0 }]);
};
const STICKY = 'n8n-nodes-base.stickyNote';
const sticky = (wf, content) => { wf.nodes.find((n) => n.type === STICKY).parameters.content = content; };
// Single-sticky workflows: put the note just above the nodes. Then move the canvas near the origin.
const tidy = (wf) => {
  const real = wf.nodes.filter((n) => n.type !== STICKY);
  const notes = wf.nodes.filter((n) => n.type === STICKY);
  const minX = Math.min(...real.map((n) => n.position[0]));
  const minY = Math.min(...real.map((n) => n.position[1]));
  if (notes.length === 1) notes[0].position = [minX - 40, minY - (notes[0].parameters.height || 160) - 60];
  const ox = Math.min(...wf.nodes.map((n) => n.position[0]));
  const oy = Math.min(...wf.nodes.map((n) => n.position[1]));
  for (const n of wf.nodes) n.position = [n.position[0] - ox, n.position[1] - oy];
};
const col = (id, type = 'string') => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type, canBeUsedToMatch: true, removed: false });
const inputs = (...names) => ({ values: names.map((n) => (Array.isArray(n) ? { name: n[0], type: n[1] } : { name: n })) });

// ---- Config blocks (placeholders only; real values live in n8n, never in git) ----
const CORE = {
  TIMEZONE: 'Asia/Kolkata',
  SCHOOL_OPEN: '07:00',
  SCHOOL_CLOSE: '12:00',
  CLOSED_WEEKDAYS: [7],
};
const SHEET_ID = { SPREADSHEET_ID: 'PUT YOUR GOOGLE SHEET ID HERE' };
const SHEETS = { ...SHEET_ID, DEVICES_TAB: 'Devices', BOOKINGS_TAB: 'Bookings' };
const BOOKINGS_ONLY = { ...SHEET_ID, BOOKINGS_TAB: 'Bookings' };
const KAPSO = {
  KAPSO_PHONE_NUMBER_ID: 'PUT YOUR KAPSO PHONE NUMBER ID HERE',
  KAPSO_API_BASE: 'https://api.kapso.ai/meta/whatsapp/v24.0',
};
const configCode = (title, cfg) => {
  const notes = {
    TIMEZONE: '// school time zone (IANA name)',
    CLOSED_WEEKDAYS: '// 1 = Mon ... 7 = Sun; no bookings or availability on these days',
    SCAN_DAYS: '// how many days (today included) availability scans when no date is given',
    DEFAULT_MINUTES: '// duration availability assumes when no hours are given',
    MAX_DAYS_AHEAD: '// furthest a booking can be made, in days from today',
    WEBHOOK_TOKEN: '// long random string; Kapso must call the webhook with ?token=<this>',
    ALLOWED_PHONES: "// teacher numbers allowed to use the bot, digits only, e.g. ['919812345678']; empty = anyone",
  };
  const lines = Object.entries(cfg).map(([k, v]) => `  ${k}: ${JSON.stringify(v).replace(/"/g, "'").replace(/,/g, ', ')},${notes[k] ? ' ' + notes[k] : ''}`);
  return `// School iPad booking - CONFIG (${title}). Fill in the PUT ... HERE values.\nconst cfg = {\n${lines.join('\n')}\n};\nreturn $input.all().map((i) => ({ json: Object.assign({}, i.json, { _cfg: cfg }) }));`;
};
const sheetRead = (n) => { n.alwaysOutputData = true; n.executeOnce = true; };
const clean = (wf, name) => {
  wf.name = name;
  wf.active = false;
  wf.pinData = {};
  delete wf.versionId;
  delete wf.id;
  delete wf.nodeGroups;
  wf.meta = { templateCredsSetupCompleted: true };
  wf.tags = [];
  tidy(wf);
  return wf;
};

// ================= 02 Book =================
const book = read('Tool_ Book the slot.json');
sticky(book, '## Book a slot\nChecks the request (real date, start/end inside school hours, iPad count, not in the past, not too far ahead), returns the existing booking instead of booking the same thing twice, works out which iPads are free for the whole window, appends the booking and returns `toolResult` with a `reply` for the teacher.');
node(book, 'When the chatbot books').parameters.workflowInputs = inputs('phone', 'name', ['devices', 'number'], 'date', 'start', 'end');
node(book, 'config').parameters.jsCode = configCode('book', { ...SHEETS, ...CORE, MAX_DEVICES_PER_BOOKING: 10, MAX_DAYS_AHEAD: 60 });
node(book, 'Demo request').parameters.jsCode = "return { json: { phone: '12025550167', name: 'Alice Johnson', devices: 2, date: 'tomorrow', start: '09:00', end: '11:00' } };";
sheetRead(node(book, 'Sheets - read the devices'));
sheetRead(node(book, 'Sheets - read the bookings'));
node(book, 'Plan the booking').parameters.jsCode = src('02-plan.js');
const BOOK_COLS = ['booking_id', 'phone', 'teacher_name', 'date', 'start_time', 'end_time', 'device_ids', 'devices', 'status', 'created_at'];
node(book, 'Sheets - add the booking').parameters.columns = {
  mappingMode: 'defineBelow',
  value: Object.fromEntries(BOOK_COLS.map((c) => [c, `={{ $json.booking.${c} }}`])),
  matchingColumns: [],
  schema: BOOK_COLS.map((c) => col(c)),
  attemptToConvertTypes: false,
  convertFieldsToString: false,
};
node(book, 'Return success').parameters.jsCode = "const p = $('Plan the booking').first().json;\nreturn [{ json: { toolResult: { action: 'book', success: true, data: Object.assign({}, p.booking, { reply: p.reply }) } } }];";
node(book, 'Return failure').parameters.jsCode = [
  "// A duplicate request is not an error: the booking exists, nothing new was written.",
  "const p = $('Plan the booking').first().json;",
  "return [{ json: { toolResult: { action: 'book', success: !!p.duplicate, data: Object.assign({}, p.booking, { duplicate: !!p.duplicate, reply: p.reply }) } } }];",
].join('\n');

// ================= 03 Cancel =================
const cancel = read('Tool_ Cancel the slot.json');
sticky(cancel, '## Cancel a booking\nFinds the teacher\'s upcoming booking (not ended yet; by `booking_id`, or the only one they have), sets its status to cancelled and returns `toolResult` with a `reply`. Never touches other teachers\' bookings.');
node(cancel, 'When the chatbot cancels').parameters.workflowInputs = inputs('phone', 'booking_id');
node(cancel, 'Demo request').parameters.jsCode = "return { json: { phone: '12025550167', booking_id: '' } };";
node(cancel, 'config').parameters.jsCode = configCode('cancel', { ...BOOKINGS_ONLY, TIMEZONE: CORE.TIMEZONE });
sheetRead(node(cancel, 'Sheets - read the bookings'));
node(cancel, 'Find my booking').parameters.jsCode = src('03-find.js');
node(cancel, 'Booking found?').parameters.conditions.conditions = [{ id: 'c', leftValue: '={{ $json.found }}', rightValue: 'true', operator: { type: 'boolean', operation: 'true', singleValue: true } }];
node(cancel, 'Sheets - mark the booking cancelled').parameters.columns = {
  mappingMode: 'defineBelow',
  value: { booking_id: '={{ $json.booking_id }}', status: 'cancelled' },
  matchingColumns: ['booking_id'],
  schema: [col('booking_id'), col('status')],
  attemptToConvertTypes: false,
  convertFieldsToString: false,
};
node(cancel, 'Return success').parameters.jsCode = "const f = $('Find my booking').first().json;\nreturn [{ json: { toolResult: { action: 'cancel', success: true, data: Object.assign({}, f.booking, { reply: f.reply }) } } }];";
node(cancel, 'Return failure').parameters.jsCode = "const f = $('Find my booking').first().json;\nreturn [{ json: { toolResult: { action: 'cancel', success: false, data: { reply: f.reply, bookings: f.bookings || [] } } } }];";

// ================= 04 Availability =================
const avail = read('Tool_ Check availability.json');
sticky(avail, '## Check iPad availability\nDate + start + end: how many iPads are free for that window.\nOtherwise: the start times on the school morning when `devices` iPads are free for `hours`, on the date given or over the next SCAN_DAYS days.\nClosed days and past times are never reported as free. Returns `toolResult` with a `reply`.');
node(avail, 'When the chatbot checks avail').parameters.workflowInputs = inputs(['devices', 'number'], ['hours', 'number'], 'date', 'start', 'end');
node(avail, 'Demo request').parameters.jsCode = "return { json: { devices: 2, hours: 1, date: 'tomorrow', start: '', end: '' } };";
node(avail, 'config').parameters.jsCode = configCode('availability', { ...SHEETS, ...CORE, SCAN_DAYS: 7, DEFAULT_MINUTES: 60, DEFAULT_DEVICES: 1 });
sheetRead(node(avail, 'Sheets - Devices'));
sheetRead(node(avail, 'Sheets - Bookings'));
node(avail, 'Scan for windows').parameters.jsCode = src('04-scan.js');
node(avail, 'Return result').parameters.jsCode = "const p = $('Scan for windows').first().json;\nreturn [{ json: { toolResult: { action: 'availability', success: p.success !== false, data: p } } }];";

// ================= 05 My bookings =================
const mine = read('Tool_ My bookings.json');
sticky(mine, '## My bookings\nLists the teacher\'s upcoming bookings (not cancelled, not ended yet) with their IDs, soonest first. Returns `toolResult` with a `reply`.');
node(mine, 'When the chatbot checks bookings').parameters.workflowInputs = inputs('phone');
node(mine, 'Demo request').parameters.jsCode = "return { json: { phone: '12025550167' } };";
node(mine, 'config').parameters.jsCode = configCode('my bookings', { ...BOOKINGS_ONLY, TIMEZONE: CORE.TIMEZONE });
const devPos = node(mine, 'Sheets - Devices').position;
removeNode(mine, 'Sheets - Devices', 'config', 'Sheets - Bookings');
node(mine, 'Sheets - Bookings').position = devPos;
sheetRead(node(mine, 'Sheets - Bookings'));
node(mine, 'List bookings').parameters.jsCode = src('05-list.js');
node(mine, 'Return result').parameters.jsCode = "const p = $('List bookings').first().json;\nreturn [{ json: { toolResult: { action: 'my_bookings', success: true, data: p } } }];";

// ================= Kapso send (lives in 01) =================
// The old "Tool: Send WhatsApp" export is only used as a template for the HTTP node; 01 sends replies itself.
// The API key sits in a Header Auth credential (X-API-Key), never in a node, so it never shows up in execution data.
const kapsoSend = (position) => {
  const http = JSON.parse(JSON.stringify(node(read('Tool_ Send WhatsApp.json'), 'Send on WhatsApp (Kapso)')));
  http.id = uuid('01/Send reply on WhatsApp');
  http.name = 'Send reply on WhatsApp';
  http.position = position;
  http.parameters.url = "={{ $('config').first().json._cfg.KAPSO_API_BASE + '/' + $('config').first().json._cfg.KAPSO_PHONE_NUMBER_ID + '/messages' }}";
  http.parameters.authentication = 'genericCredentialType';
  http.parameters.genericAuthType = 'httpHeaderAuth';
  http.parameters.sendHeaders = false;
  delete http.parameters.headerParameters;
  delete http.credentials;
  http.parameters.jsonBody = "={{ JSON.stringify({ messaging_product: 'whatsapp', to: String($json.to || '').replace(/\\D/g, ''), type: 'text', text: { body: $json.text, preview_url: false } }) }}";
  http.onError = 'continueRegularOutput';
  http.retryOnFail = true;
  http.maxTries = 3;
  http.waitBetweenTries = 2000;
  return http;
};

// ================= 01 Orchestrator =================
const orch = read('WhatsApp Chatbot Orchestrator.json');
const TOOLS = [
  ['Book iPads', 'book_ipads'],
  ['Cancel Booking', 'cancel_booking'],
  ['Check Availability', 'check_availability'],
  ['List My Bookings', 'list_my_bookings'],
];
for (const [from, to] of TOOLS) rename(orch, from, to);
// Replies no longer go out through an agent tool: the agent's final answer is the reply, so the
// window memory holds it and a later "yes" can see the proposal it confirms.
removeNode(orch, 'Send WhatsApp');

const [s1, s2] = orch.nodes.filter((n) => n.type === STICKY);
s1.parameters.content = '## School iPad booking - intake\nKapso webhook (`?token=` checked) -> Config -> Read message -> School clock.\nRead message drops fake calls, retried webhooks and outbound echoes, merges a teacher\'s batched messages into one turn, and answers media / unknown numbers with a fixed reply.';
s2.parameters.width = 1600; // also frames Prepare reply and Send reply on WhatsApp
s2.parameters.content = '## Agent, tools and reply\nThe agent (LLM + per-phone memory) works out what the teacher wants, asks for anything missing and confirms before booking or cancelling. Its final answer **is** the reply.\nTools: book_ipads, cancel_booking, check_availability, list_my_bookings. The phone number is filled in from the incoming message, never by the LLM.\nPrepare reply always produces one message (apology if the agent failed) -> Send reply on WhatsApp posts it to Kapso (API key in the Header Auth credential).';
node(orch, 'config').parameters.jsCode = configCode('orchestrator', { ...CORE, WEBHOOK_TOKEN: 'PUT A LONG RANDOM TOKEN HERE', ALLOWED_PHONES: [], ...KAPSO });
node(orch, 'Demo message').parameters.jsCode = "return { json: { body: { message: { id: 'wamid.demo.' + Date.now(), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', from: '12025550167', text: { body: 'book 2 iPads tomorrow 9 to 11' }, kapso: { direction: 'inbound' } }, conversation: { id: 'conv_demo', contact_name: 'Alice Johnson', phone_number: '12025550167' } } } };";
node(orch, 'Read message').parameters.jsCode = src('01-read.js');
node(orch, 'School clock').parameters.jsCode = [
  "// Today's date, time and the coming week in the school's time zone, so the agent can turn",
  '// "tomorrow" or "Monday" into a real date.',
  'return $input.all().map((i) => {',
  '  const now = $now.setZone(i.json._cfg.TIMEZONE);',
  "  const upcoming = [];",
  "  for (let d = 1; d <= 7; d++) upcoming.push(now.plus({ days: d }).toFormat('cccc yyyy-MM-dd'));",
  '  return { json: Object.assign({}, i.json, {',
  "    school_today: now.toFormat('yyyy-MM-dd'),",
  "    school_day: now.toFormat('cccc'),",
  "    school_time: now.toFormat('HH:mm'),",
  "    upcoming_days: upcoming.join(', '),",
  '  }) };',
  '});',
].join('\n');

const agent = node(orch, 'AI Agent');
agent.parameters.text = '={{ $json.text }}';
agent.parameters.options = Object.assign({}, agent.parameters.options, { systemMessage: '=' + src('01-prompt.txt') });
const mem = node(orch, 'Window Buffer Memory');
mem.parameters.sessionKey = '={{ $json.from }}';
mem.parameters.contextWindowLength = 10;

// Tool sub-nodes see the agent's current input item as $json, so each teacher in a batch gets their own number.
const SENDER = '={{ $json.from }}';
const ai = (key, desc, type = 'string') => `={{ $fromAI('${key}', '${desc.replace(/'/g, "\\'")}', '${type}') }}`;
const tool = (name, description, value, schema) => {
  const p = node(orch, name).parameters;
  p.description = description;
  p.workflowInputs = { mappingMode: 'defineBelow', value, matchingColumns: [], schema, attemptToConvertTypes: false, convertFieldsToString: false };
};
tool('book_ipads',
  'Create an iPad booking on the school sheet. Only call this after the teacher has confirmed your booking proposal. Returns toolResult { success, data.reply, data.duplicate }.',
  {
    phone: SENDER,
    name: '={{ $json.name }}',
    devices: ai('devices', 'Number of iPads to book', 'number'),
    date: ai('date', 'Booking date as YYYY-MM-DD'),
    start: ai('start', 'Start time as HH:MM, 24-hour'),
    end: ai('end', 'End time as HH:MM, 24-hour'),
  },
  [col('phone'), col('name'), col('devices', 'number'), col('date'), col('start'), col('end')]);
tool('cancel_booking',
  "Cancel one of the teacher's upcoming bookings. Only call this after the teacher has confirmed your cancellation proposal. Returns toolResult { success, data.reply }; on failure data.bookings lists their bookings.",
  {
    phone: SENDER,
    booking_id: ai('booking_id', 'ID of the booking to cancel, e.g. BK-0007-K7, from list_my_bookings. Empty string only if the teacher has exactly one booking.'),
  },
  [col('phone'), col('booking_id')]);
tool('check_availability',
  'Check free iPads. With date, start and end: how many are free in that window. With only a date (or nothing): the start times free on the school morning. Pass empty strings / 0 for anything the teacher did not say. Returns toolResult { success, data.reply }.',
  {
    devices: ai('devices', 'Number of iPads needed, 0 if not given', 'number'),
    hours: ai('hours', 'How many hours they need them for, 0 if not given', 'number'),
    date: ai('date', 'Date as YYYY-MM-DD, empty string if not given'),
    start: ai('start', 'Start time as HH:MM 24-hour, empty string if not given'),
    end: ai('end', 'End time as HH:MM 24-hour, empty string if not given'),
  },
  [col('devices', 'number'), col('hours', 'number'), col('date'), col('start'), col('end')]);
tool('list_my_bookings',
  "List the teacher's upcoming bookings with their booking IDs. Use it to show their bookings and to find the booking_id before cancelling. Returns toolResult { success, data.reply, data.bookings }.",
  { phone: SENDER },
  [col('phone')]);

// School clock -> Needs the agent? -yes-> AI Agent -> Prepare reply -> Send reply on WhatsApp (Kapso)
//                                  -no (fixed reply)----------^
const [ax, ay] = agent.position;
const clock = node(orch, 'School clock');
delete orch.connections['School clock'];
delete orch.connections['AI Agent'];
addNode(orch, {
  name: 'Needs the agent?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [Math.round((clock.position[0] + ax) / 2), ay],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: 'r', leftValue: '={{ $json.reply }}', rightValue: '', operator: { type: 'string', operation: 'empty', singleValue: true } }],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  },
});
addNode(orch, {
  name: 'Prepare reply',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [ax + 736, ay],
  parameters: { mode: 'runOnceForEachItem', jsCode: src('01-reply.js') },
});
orch.nodes.push(kapsoSend([ax + 976, ay]));
link(orch, 'School clock', 'Needs the agent?');
link(orch, 'Needs the agent?', 'AI Agent', 0);
link(orch, 'Needs the agent?', 'Prepare reply', 1);
link(orch, 'AI Agent', 'Prepare reply');
link(orch, 'Prepare reply', 'Send reply on WhatsApp');

// ================= write =================
const files = [
  ['01-orchestrator.json', clean(orch, 'WhatsApp Chatbot Orchestrator')],
  ['02-book-the-slot.json', clean(book, 'Tool: Book the slot')],
  ['03-cancel-the-slot.json', clean(cancel, 'Tool: Cancel the slot')],
  ['04-check-availability.json', clean(avail, 'Tool: Check availability')],
  ['05-my-bookings.json', clean(mine, 'Tool: My bookings')],
];
for (const [f, wf] of files) {
  const json = JSON.stringify(wf, null, 2);
  // live exports carry a 64-hex Kapso key and real IDs; the output must only hold placeholders
  if (/[0-9a-f]{64}/.test(json) || /KAPSO_API_KEY/.test(json) || /(KAPSO_PHONE_NUMBER_ID|SPREADSHEET_ID|WEBHOOK_TOKEN): '(?!PUT )/.test(json)) throw new Error(`${f} still contains a secret`);
  // every connection must point at a node that exists
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [from, outs] of Object.entries(wf.connections)) {
    if (!names.has(from)) throw new Error(`${f}: connection from missing node "${from}"`);
    for (const list of Object.values(outs)) for (const l of list) for (const x of l || []) if (!names.has(x.node)) throw new Error(`${f}: connection to missing node "${x.node}"`);
  }
  fs.writeFileSync(path.join(OUT, f), json + '\n');
  console.log('wrote', f, wf.nodes.length, 'nodes');
}
