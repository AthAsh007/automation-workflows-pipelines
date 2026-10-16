// Builds ../01-reprice-and-announce.json and ../02-whatsapp-enquiries.json from js/*.js.
// Run: bun build.js   (or: node build.js)
// Same role as build.py in the other workflow folders, in JS because it was written on a
// machine without Python. `//@include lib-pricing.js` inside a node's code is replaced by
// that file, so both workflows price a chain with the exact same function.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, '..');
const CFG = "$('config').first().json";

function js(file) {
  let src = fs.readFileSync(path.join(HERE, 'js', file), 'utf8').trimEnd();
  return src.replace(/^\/\/@include (\S+)\s*$/m, (_, inc) =>
    fs.readFileSync(path.join(HERE, 'js', inc), 'utf8').trimEnd());
}
const pos = (col, lane) => [col * 260, lane * 200];

const code = (id, name, p, file, extra) => Object.assign({ parameters: { jsCode: js(file) }, id, name,
  type: 'n8n-nodes-base.code', typeVersion: 2, position: p }, extra || {});
const noop = (id, name, p) => ({ parameters: {}, id, name, type: 'n8n-nodes-base.noOp', typeVersion: 1, position: p });

function ifExpr(id, name, p, left) {
  return { parameters: { conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: id + '-c', leftValue: left, rightValue: 'true',
        operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: p };
}
const ifFlag = (id, name, p, flag) => ifExpr(id, name, p, '={{ ' + CFG + '.' + flag + ' }}');

function sheet(id, name, p, tab, operation, matching) {
  const parameters = {
    documentId: { __rl: true, mode: 'id', value: '={{ ' + CFG + '.sheet_id }}' },
    sheetName: { __rl: true, mode: 'name', value: '={{ ' + CFG + '.' + tab + ' }}' },
    options: {} };
  const node = { parameters, id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: p };
  if (operation) {
    parameters.operation = operation;
    parameters.columns = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: matching, schema: [] };
    parameters.options = { cellFormat: 'RAW' };
  } else node.alwaysOutputData = true;   // an empty tab still continues, to a named outcome
  return node;
}

const twilio = (id, name, p, to, message, note) => ({
  parameters: { from: '={{ ' + CFG + '.twilio_whatsapp_from }}', to, toWhatsapp: true, message, options: {} },
  id, name, type: 'n8n-nodes-base.twilio', typeVersion: 1, position: p, notes: note });

const sticky = (id, p, w, h, colour, content) => ({ parameters: { content, height: h, width: w, color: colour },
  id, name: 'Sticky Note ' + id, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: p });

const link = (...t) => ({ main: [t.map((n) => ({ node: n, type: 'main', index: 0 }))] });
const branch = (yes, no) => ({ main: [yes.map((n) => ({ node: n, type: 'main', index: 0 })),
                                        no.map((n) => ({ node: n, type: 'main', index: 0 }))] });

function save(file, name, nodes, connections) {
  const wf = { name, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {},
    meta: { templateCredsSetupCompleted: false }, tags: [] };
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(wf, null, 2) + '\n');
  console.log('wrote ' + file + ' (' + nodes.length + ' nodes)');
}

// ===================================================================== WORKFLOW 01
const w1 = [
  { parameters: {}, id: 'run', name: 'Run it now', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 0) },
  { parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1-5' }] } },
    id: 'cron', name: 'Every weekday, 08:00', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, 1) },
  code('cfg1', 'config', pos(1, 0.5), 'config.js'),
  ifFlag('stock-on', 'stock sheet configured?', pos(2, 0.5), 'sheet_enabled'),
  sheet('stock-read', '[cred] Sheets - read the stock', pos(3, 0), 'stock_tab'),
  code('stock-collect', 'collect the stock', pos(4, 0), 'collect-the-stock.js', { executeOnce: false }),
  code('stock-demo', 'use the demo stock', pos(4, 1), 'use-the-demo-stock.js'),
  code('check', 'check the stock rows', pos(5, 0.5), 'check-the-stock-rows.js'),
  ifFlag('rate-on', 'gold rate configured?', pos(6, 0.5), 'gold_api_enabled'),
  { parameters: { url: '={{ ' + CFG + ".gold_api_base + '/XAU/' + " + CFG + '.currency }}',
      sendHeaders: true, headerParameters: { parameters: [
        { name: 'x-access-token', value: '={{ ' + CFG + '.gold_api_key }}' },
        { name: 'Accept', value: 'application/json' }] }, options: { timeout: 20000 } },
    id: 'rate-http', name: "Gold rate - today's price", type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: pos(7, 0), onError: 'continueErrorOutput',
    notes: 'goldapi.io, one call a day. The key comes from config; a blank key means this node never executes and the demo rate stands in.' },
  code('rate-read', 'read the gold rate', pos(8, 0), 'read-the-gold-rate.js'),
  code('rate-fail', 'STOP: gold rate unavailable', pos(8, -1), 'stop-gold-rate-unavailable.js'),
  code('rate-demo', 'use the demo gold rate', pos(8, 1), 'use-the-demo-gold-rate.js'),
  code('price', 'price every chain', pos(9, 0.5), 'price-every-chain.js'),
  ifExpr('rate-ok', 'rate looks right?', pos(10, 0.5), '={{ $json.rate_ok }}'),
  code('rate-wrong', 'STOP: rate looks wrong', pos(11, 1.5), 'stop-rate-looks-wrong.js'),
  code('catalogue', 'build the catalogue', pos(11, 0.5), 'build-the-catalogue.js'),
  ifFlag('cust-on', 'customer list configured?', pos(12, 0.5), 'sheet_enabled'),
  sheet('cust-read', '[cred] Sheets - read the customers', pos(13, 0), 'customers_tab'),
  code('cust-collect', 'collect the customers', pos(14, 0), 'collect-the-customers.js'),
  code('cust-demo', 'use the demo customers', pos(14, 1), 'use-the-demo-customers.js'),
  code('plan', 'plan the broadcast', pos(15, 0.5), 'plan-the-broadcast.js'),
  ifFlag('send-on', 'sending on?', pos(16, 0.5), 'send_enabled'),
  code('preview', 'STOP: preview - draft shown', pos(17, 1.5), 'stop-preview-draft-shown.js'),
  twilio('ask', '[cred] Twilio - ask the owner to approve', pos(17, 0), '={{ $json.owner_to }}',
    "={{ $json.owner_message + '\\n\\nApprove and send: ' + $execution.resumeUrl + '?approve=yes\\n(Ignore this to cancel.)' }}",
    'The owner gets the whole message and an approve link. The link resumes the wait node below; nothing is sent to a customer without it.'),
  { parameters: { resume: 'webhook', options: {}, limitWaitTime: true, limitType: 'afterTimeInterval',
      resumeAmount: '={{ ' + CFG + '.approval_wait_hours }}', resumeUnit: 'hours' },
    id: 'wait', name: "wait for the owner's approval", type: 'n8n-nodes-base.wait', typeVersion: 1.1,
    position: pos(18, 0), webhookId: 'gold-catalogue-approve' },
  ifExpr('approved', 'approved?', pos(19, 0), "={{ !!($json.query && $json.query.approve === 'yes') }}"),
  code('not-approved', 'STOP: not approved', pos(20, 1), 'stop-not-approved.js'),
  code('per-customer', 'one message per customer', pos(20, -1), 'one-message-per-customer.js'),
  twilio('send', '[cred] Twilio - send the announcement', pos(21, -1), '={{ $json.to }}', '={{ $json.body }}',
    'One message per customer, exactly as the owner approved it. BROADCAST_CAP is enforced in plan the broadcast.'),
  code('sent', 'STOP: announcement sent', pos(22, -1), 'stop-announcement-sent.js', { executeOnce: true }),
  ifFlag('write-on', 'writing on?', pos(20, 0), 'write_enabled'),
  code('rows', 'rows for the stock sheet', pos(21, 0), 'rows-for-the-stock-sheet.js', { executeOnce: true }),
  sheet('write', "[cred] Sheets - write today's prices", pos(22, 0), 'stock_tab', 'update', ['sku']),
  code('written', 'STOP: prices written', pos(23, 0), 'stop-prices-written.js', { executeOnce: true }),
  code('not-written', 'STOP: preview - prices not written', pos(21, 1), 'stop-preview-prices-not-written.js', { executeOnce: true }),
  sticky('start1', [-40, -620], 620, 540, 4,
    '## Reprice and announce — start here\n\n' +
    'The first of two workflows. Import it alongside **02-whatsapp-enquiries**; both share the same **config** node.\n\n' +
    '**Run it before you configure anything.** Press **Execute Workflow** on **Run it now**: eleven invented chains, an ' +
    'invented DEMO gold rate and five invented customers, through the whole thing. Open **STOP: preview - draft shown** ' +
    'to read the catalogue, the stock list, the CSV, the announcement and who it would go to. Nothing is sent.\n\n' +
    '**Setup, in order**\n' +
    '1. **config**: `PURITY`, `STYLES` (making charge per gram), `WHOLESALE_MARGIN_PCT`.\n' +
    '2. `SHEET_ID`: a sheet with a Stock and a Customers tab (columns in config). Connect Google Sheets on the three `[cred] Sheets` nodes.\n' +
    '3. `GOLD_API_KEY` from goldapi.io.\n' +
    '4. `TWILIO_WHATSAPP_FROM`, `OWNER_WHATSAPP`, and Twilio on the two `[cred] Twilio` nodes.\n' +
    '5. `TEST_WHATSAPP` = your own number: a real run, every message redirected to you.\n' +
    '6. Only then `TEST_RUN = false`.'),
  sticky('s1', [480, 420], 1760, 260, 7,
    '### 1. Price the stock at today\'s rate\n\nEvery row is checked first: a chain with no weight or a karat missing from `PURITY` is **held back with its reason**, never priced on a guess. ' +
    'The price is weight x purity x the 24k rate, plus the making charge, plus margin. **rate looks right?** refuses to publish if the rate moved more than `MAX_RATE_MOVE_PCT` since the last list: that is far likelier a wrong currency or a stale feed than the market.'),
  sticky('s2', [2840, 420], 1560, 260, 7,
    '### 2. One stock list, three views, one approval\n\n`build the catalogue` makes the catalogue, the internal stock list, the CSV and the announcement from the same priced rows, so they cannot disagree. ' +
    'The announcement says only what changed: new in, back in stock, last few, sold out. **Nothing reaches a customer until the owner opens the approve link**, and an approval that never comes means nothing is sent: a morning price is wrong by the evening.'),
  sticky('s3', [4880, 420], 1300, 260, 7,
    '### 3. Send, then write back\n\nOpted-out, unusable and duplicate numbers are skipped with a reason; `BROADCAST_CAP` is enforced in code. ' +
    "Today's price, rate and quantity are written back to the Stock tab only after the owner approved and only in live mode, which is how tomorrow's run knows what is new and what sold out.")
];
const c1 = {
  'Run it now': link('config'),
  'Every weekday, 08:00': link('config'),
  config: link('stock sheet configured?'),
  'stock sheet configured?': branch(['[cred] Sheets - read the stock'], ['use the demo stock']),
  '[cred] Sheets - read the stock': link('collect the stock'),
  'collect the stock': link('check the stock rows'),
  'use the demo stock': link('check the stock rows'),
  'check the stock rows': link('gold rate configured?'),
  'gold rate configured?': branch(["Gold rate - today's price"], ['use the demo gold rate']),
  "Gold rate - today's price": branch(['read the gold rate'], ['STOP: gold rate unavailable']),
  'read the gold rate': link('price every chain'),
  'use the demo gold rate': link('price every chain'),
  'price every chain': link('rate looks right?'),
  'rate looks right?': branch(['build the catalogue'], ['STOP: rate looks wrong']),
  'build the catalogue': link('customer list configured?'),
  'customer list configured?': branch(['[cred] Sheets - read the customers'], ['use the demo customers']),
  '[cred] Sheets - read the customers': link('collect the customers'),
  'collect the customers': link('plan the broadcast'),
  'use the demo customers': link('plan the broadcast'),
  'plan the broadcast': link('sending on?'),
  'sending on?': branch(['[cred] Twilio - ask the owner to approve'], ['STOP: preview - draft shown']),
  '[cred] Twilio - ask the owner to approve': link("wait for the owner's approval"),
  "wait for the owner's approval": link('approved?'),
  'approved?': branch(['one message per customer', 'writing on?'], ['STOP: not approved']),
  'one message per customer': link('[cred] Twilio - send the announcement'),
  '[cred] Twilio - send the announcement': link('STOP: announcement sent'),
  'writing on?': branch(['rows for the stock sheet'], ['STOP: preview - prices not written']),
  'rows for the stock sheet': link("[cred] Sheets - write today's prices"),
  "[cred] Sheets - write today's prices": link('STOP: prices written')
};
save('01-reprice-and-announce.json', '01 Reprice gold chain stock and announce it on WhatsApp', w1, c1);

// ===================================================================== WORKFLOW 02
const w2 = [
  { parameters: { httpMethod: 'POST', path: 'gold-whatsapp', responseMode: 'onReceived', options: {} },
    id: 'hook', name: 'A WhatsApp message arrives', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: pos(0, 0), webhookId: 'gold-whatsapp',
    notes: "Point Twilio's WhatsApp sender 'A message comes in' webhook at this URL (HTTP POST)." },
  { parameters: {}, id: 'demo', name: 'Run the demo messages', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1) },
  code('cfg2', 'config', pos(1, 0.5), 'config.js'),
  ifFlag('stock-on2', 'stock sheet configured?', pos(2, 0.5), 'sheet_enabled'),
  sheet('stock-read2', '[cred] Sheets - read the stock', pos(3, 0), 'stock_tab'),
  code('stock-collect2', 'collect the stock', pos(4, 0), 'collect-the-stock.js'),
  code('stock-demo2', 'use the demo stock', pos(4, 1), 'use-the-demo-stock.js', { executeOnce: true }),
  code('read', 'read the message', pos(5, 0.5), 'read-the-message.js'),
  ifFlag('ai-on', 'AI configured?', pos(6, 0.5), 'ai_enabled'),
  code('ai-req', 'build the AI request', pos(7, 0), 'build-the-ai-request.js'),
  { parameters: { method: 'POST', url: '={{ ' + CFG + ".ai_base_url + '/chat/completions' }}",
      sendHeaders: true, headerParameters: { parameters: [
        { name: 'Authorization', value: "={{ 'Bearer ' + " + CFG + '.ai_api_key }}' },
        { name: 'Content-Type', value: 'application/json' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json._ai_body) }}',
      options: { timeout: 30000 } },
    id: 'ai-http', name: 'AI - read what they want', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: pos(8, 0), onError: 'continueRegularOutput',
    notes: 'The model only reads the message into style / karat / length / quantity. It never sees a price and never writes the reply. A failed call keeps the keyword read for that message.' },
  code('ai-apply', 'apply the AI reading', pos(9, 0), 'apply-the-ai-reading.js'),
  code('kw', 'keyword reading only', pos(9, 1), 'keyword-reading-only.js'),
  code('decide', 'decide the reply', pos(10, 0.5), 'decide-the-reply.js'),
  code('address', 'address the messages', pos(11, 0), 'address-the-messages.js'),
  ifFlag('send-on2', 'sending on?', pos(12, 0), 'send_enabled'),
  twilio('reply', '[cred] Twilio - send on WhatsApp', pos(13, -0.5), '={{ $json.to }}', '={{ $json.body }}',
    'Replies to customers and alerts to the owner. Where each one goes was decided in address the messages.'),
  code('replied', 'STOP: replies sent', pos(14, -0.5), 'stop-replies-sent.js', { executeOnce: true }),
  code('reply-preview', 'STOP: preview - replies shown', pos(13, 0.5), 'stop-preview-replies-shown.js'),
  code('optouts', 'rows for the customers tab', pos(11, 1.5), 'rows-for-the-customers-tab.js', { executeOnce: true }),
  ifFlag('write-on2', 'writing on?', pos(12, 1.5), 'write_enabled'),
  sheet('optout-write', '[cred] Sheets - record the opt-outs', pos(13, 1.5), 'customers_tab', 'update', ['whatsapp']),
  code('optout-done', 'STOP: opt-outs recorded', pos(14, 1.5), 'stop-opt-outs-recorded.js', { executeOnce: true }),
  code('optout-preview', 'STOP: preview - opt-outs not recorded', pos(13, 2.5), 'stop-preview-opt-outs-not-recorded.js', { executeOnce: true }),
  sticky('start2', [-40, -600], 620, 500, 4,
    '## WhatsApp enquiries — start here\n\n' +
    'The second of two workflows. Import it alongside **01-reprice-and-announce**; both share the same **config** node, and 01 is what writes the prices this one quotes.\n\n' +
    '**Run it before you configure anything.** Press **Execute Workflow** on **Run the demo messages**: five invented customer messages (a price question, a vague one, a 40-piece order, a custom request, an opt-out). ' +
    'Open **STOP: preview - replies shown** to read every reply and every alert to the owner. Nothing is sent.\n\n' +
    '**Setup, in order**\n' +
    '1. The same `SHEET_ID`, Twilio sender and `OWNER_WHATSAPP` as workflow 01.\n' +
    "2. Point your Twilio WhatsApp sender's incoming-message webhook at **A WhatsApp message arrives**.\n" +
    '3. Optional: `AI_API_KEY`, for messages the keyword rules cannot read.\n' +
    '4. `TEST_WHATSAPP`, then `TEST_RUN = false`.'),
  sticky('s21', [1180, 420], 1400, 240, 7,
    '### 1. Read what they want\n\nKeyword rules always run. With `AI_API_KEY` set, a model reads the message too, but only into fields: style, karat, length, quantity, and whether a person is needed. ' +
    'A style it returns that is not in `STYLES` is ignored, and an answer that does not parse keeps the keyword read.'),
  sticky('s22', [2580, 700], 1300, 260, 7,
    '### 2. Answer from the sheet, or hand to a person\n\nEvery price and stock count in a reply comes from the Stock tab, at the price workflow 01 last published: the bot cannot quote a number the owner never approved. ' +
    'Orders, bulk quantities (`HANDOFF_QTY`), custom pieces and complaints are acknowledged and sent to the owner, never negotiated. An opt-out is confirmed and written back so 01 never messages that number again.')
];
const c2 = {
  'A WhatsApp message arrives': link('config'),
  'Run the demo messages': link('config'),
  config: link('stock sheet configured?'),
  'stock sheet configured?': branch(['[cred] Sheets - read the stock'], ['use the demo stock']),
  '[cred] Sheets - read the stock': link('collect the stock'),
  'collect the stock': link('read the message'),
  'use the demo stock': link('read the message'),
  'read the message': link('AI configured?'),
  'AI configured?': branch(['build the AI request'], ['keyword reading only']),
  'build the AI request': link('AI - read what they want'),
  'AI - read what they want': link('apply the AI reading'),
  'apply the AI reading': link('decide the reply'),
  'keyword reading only': link('decide the reply'),
  'decide the reply': link('address the messages', 'rows for the customers tab'),
  'address the messages': link('sending on?'),
  'sending on?': branch(['[cred] Twilio - send on WhatsApp'], ['STOP: preview - replies shown']),
  '[cred] Twilio - send on WhatsApp': link('STOP: replies sent'),
  'rows for the customers tab': link('writing on?'),
  'writing on?': branch(['[cred] Sheets - record the opt-outs'], ['STOP: preview - opt-outs not recorded']),
  '[cred] Sheets - record the opt-outs': link('STOP: opt-outs recorded')
};
save('02-whatsapp-enquiries.json', '02 Answer gold chain stock and price questions on WhatsApp', w2, c2);
