// Builds ../01-draft-and-approve.json, ../02-publish-on-approval.json and their -publish.json
// submission copies from js/*.js.     Run: bun build.mjs
//
// The Code nodes live in js/ as real JavaScript so they can be parsed and simulated without
// n8n. Nothing is hand-edited in the JSON. A line `// @include lib/<file>.js` in a node body is
// replaced by that file, so the caption rules and the log-state rules exist once and are shared
// by every node that needs them (simulate.js expands includes the same way).
//
// Layout is left to right. Each section owns a disjoint range of columns, so the sticky notes
// (written with the same geometry as tools/restyle_stickies.mjs, from stickies.json) never
// overlap. The sticky spec is also written into the repo's tools spec when it is present, so
// running restyle_stickies.mjs later reproduces this layout instead of undoing it.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const CFG = "$('config').first().json";

// ------------------------------------------------------------------ sources
function js(name) {
  const src = fs.readFileSync(path.join(HERE, 'js', name), 'utf8');
  return src.replace(/^\/\/ @include (\S+)\s*$/gm, (_, f) =>
    fs.readFileSync(path.join(HERE, 'js', f), 'utf8').trim()).trimEnd();
}

// ------------------------------------------------------------------ geometry
const COL = 240, LANE = 190;
const P = (c, l) => [Math.round(c * COL), Math.round(l * LANE)];

// ------------------------------------------------------------------ node constructors
function code(id, name, pos, file, kw = {}) {
  return Object.assign({ parameters: { jsCode: js(file) }, id, name,
    type: 'n8n-nodes-base.code', typeVersion: 2, position: pos }, kw);
}
function codeAll(id, name, pos, file, kw = {}) {
  // Run Once for All Items. The default is once per item, which would run a state machine
  // that reads the whole log once for every row in it.
  const n = code(id, name, pos, file, kw);
  n.parameters = { mode: 'runOnceForAllItems', jsCode: n.parameters.jsCode };
  return n;
}
function ifExpr(id, name, pos, left, notes) {
  const n = { parameters: { conditions: { options: { caseSensitive: true, leftValue: '',
    typeValidation: 'loose', version: 2 },
  conditions: [{ id: id + '-c', leftValue: left, rightValue: 'true',
    operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' }, looseTypeValidation: true, options: {} },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos };
  if (notes) n.notes = notes;
  return n;
}
function switchNode(id, name, pos, expr, outs, notes) {
  // outs: [value, label]. Anything else goes to the fallback output, which is always wired.
  const rules = outs.map(([value, label], i) => ({
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: id + '-r' + i, leftValue: expr, rightValue: value,
        operator: { type: 'string', operation: 'equals' } }], combinator: 'and' },
    renameOutput: true, outputKey: label }));
  const n = { parameters: { rules: { values: rules },
    options: { fallbackOutput: 'extra', renameFallbackOutput: 'other' } },
  id, name, type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: pos };
  if (notes) n.notes = notes;
  return n;
}
function merge(id, name, pos, inputs = 2) {
  return { parameters: { mode: 'append', numberInputs: inputs }, id, name,
    type: 'n8n-nodes-base.merge', typeVersion: 3, position: pos };
}
function sheet(id, name, pos, tab, { operation, matching, notes, always } = {}) {
  const p = {
    documentId: { __rl: true, mode: 'id', value: `={{ ${CFG}.sheet_id }}` },
    sheetName: { __rl: true, mode: 'name', value: `={{ ${CFG}.${tab} }}` },
    options: {} };
  if (operation) {
    p.operation = operation;
    p.columns = { mappingMode: 'autoMapInputData', value: {}, schema: [] };
    if (matching) p.columns.matchingColumns = matching;
    // RAW, not USER_ENTERED: a date Sheets reformats reads back locale-formatted and the
    // "is there a row for today" check stops matching. ignoreIt: the helper fields every row
    // carries (_reason, _status...) must not become new columns in the sheet.
    p.options = { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' };
  }
  const n = { parameters: p, id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: pos };
  if (always) n.alwaysOutputData = true;
  if (notes) n.notes = notes;
  return n;
}
function http(id, name, pos, method, url, o = {}) {
  const p = { method, url, options: { timeout: o.timeout || 30000 } };
  if (o.headers) { p.sendHeaders = true; p.headerParameters = { parameters: o.headers.map(([n, v]) => ({ name: n, value: v })) }; }
  if (o.binaryIn) { p.sendBody = true; p.contentType = 'binaryData'; p.inputDataFieldName = o.binaryIn; }
  else if (o.body !== undefined) { p.sendBody = true; p.specifyBody = 'json'; p.jsonBody = o.body; }
  if (o.binaryOut) p.options.response = { response: { responseFormat: 'file', outputPropertyName: 'data' } };
  if (o.fullResponse) {
    p.options.response = p.options.response || { response: {} };
    p.options.response.response.fullResponse = true;
    p.options.response.response.neverError = true;
  }
  const n = { parameters: p, id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos };
  if (o.onError) n.onError = o.onError;
  if (o.retry !== false) { n.retryOnFail = true; n.maxTries = 2; n.waitBetweenTries = 2000; }
  if (o.notes) n.notes = o.notes;
  return n;
}
function discordSend(id, name, pos, channelExpr, contentExpr, { file = false, replyTo, notes } = {}) {
  const p = { resource: 'message', operation: 'send',
    guildId: { __rl: true, mode: 'id', value: '' }, sendTo: 'channel',
    channelId: { __rl: true, mode: 'id', value: channelExpr },
    content: contentExpr, options: {} };
  if (replyTo) p.options.message_reference = replyTo;
  if (file) p.files = { values: [{ inputFieldName: 'data' }] };
  const n = { parameters: p, id, name, type: 'n8n-nodes-base.discord', typeVersion: 2, position: pos };
  if (notes) n.notes = notes;
  return n;
}
const trigger = (id, name, pos, rule, notes) => ({ parameters: { rule: { interval: [rule] } }, id, name,
  type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos, notes });
const manual = (id, pos) => ({ parameters: {}, id, name: 'Run it now', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos });
const noop = (id, name, pos) => ({ parameters: {}, id, name, type: 'n8n-nodes-base.noOp', typeVersion: 1, position: pos });

// ------------------------------------------------------------------ connections
const to = (...t) => ({ main: [t.map((x) => ({ node: x, type: 'main', index: 0 }))] });
const branch = (yes, no) => ({ main: [yes, no].map((g) => g.map((x) => ({ node: x, type: 'main', index: 0 }))) });
const outs = (...groups) => ({ main: groups.map((g) => g.map((x) => ({ node: x, type: 'main', index: 0 }))) });
const input = (node, i) => ({ main: [[{ node, type: 'main', index: i }]] });

const LI_HEADERS = [['Authorization', `=Bearer {{ ${CFG}.linkedin_token }}`],
  ['LinkedIn-Version', `={{ ${CFG}.linkedin_version }}`],
  ['X-Restli-Protocol-Version', '2.0.0'], ['Content-Type', 'application/json']];

// ======================================================================================
//  WORKFLOW 01 — pick, write, check, render, deliver for approval
// ======================================================================================
const w1 = [
  trigger('sched1', 'Every weekday, 08:00', P(0, 0), { field: 'cronExpression', expression: '0 8 * * 1-5' },
    '08:00 Mon-Fri in the workflow timezone. TIMEZONE in config decides which calendar day the log is keyed on; set both to the same zone.'),
  manual('manual1', P(0, 1)),
  code('cfg1', 'config', P(1, 0), 'config.js'),
  ifExpr('log-on1', 'log in a sheet?', P(2, 0), `={{ ${CFG}.sheet_enabled }}`,
    'SHEET_ID blank -> the demo log, so the whole run works with no Google account.'),
  sheet('read-log1', '[cred] Sheets - read the log', P(3, 0), 'log_tab', { always: true,
    notes: 'alwaysOutputData: a log holding only its header row must still reach the state machine.' }),
  codeAll('demo-log1', 'load the demo log', P(3, 1), 'load-the-demo-log-01.js'),
  codeAll('state', 'resolve todays state', P(4, 0), 'resolve-todays-state.js'),
  ifExpr('draftable', 'draft today?', P(5, 0), '={{ $json._draftable }}'),
  code('stop-silent', 'STOP: silent', P(5, 3), 'stop-silent.js'),

  ifExpr('bank-on', 'bank in a sheet?', P(6.5, 0), `={{ ${CFG}.sheet_enabled }}`,
    'SHEET_ID blank -> pick todays post reads DEMO_BANK from config instead.'),
  sheet('read-bank', '[cred] Sheets - read the bank', P(7.5, -1), 'bank_tab', { always: true }),
  codeAll('pick', 'pick todays post', P(8.5, 0), 'pick-todays-post.js'),
  ifExpr('has-post', 'anything to post?', P(9.5, 0), '={{ $json._has_post }}'),
  code('stop-bank', 'STOP: bank exhausted', P(9.5, 3), 'stop-bank-exhausted.js'),

  switchNode('writer', 'who writes the caption?', P(11, 0), '={{ $json._writer }}',
    [['bank', 'bank'], ['model', 'model'], ['demo', 'demo']],
    'bank: the Caption cell, used as written. model: the LLM. demo: canned answers, demo bank only. other: nobody, and the caption check holds it.'),
  http('llm', '[cred] LLM - write the caption', P(12, -1), 'POST', `={{ ${CFG}.llm_base_url }}/v1/chat/completions`, {
    headers: [['Authorization', `=Bearer {{ ${CFG}.llm_api_key }}`], ['Content-Type', 'application/json']],
    body: `={{ JSON.stringify({ model: ${CFG}.llm_model, stream: false, max_tokens: 1200, temperature: 0.7, messages: [{ role: 'system', content: $json._llm_system }, { role: 'user', content: $json._llm_user }] }) }}`,
    timeout: 120000, onError: 'continueRegularOutput',
    notes: 'OpenAI-compatible. stream:false matters: n8n cannot read a streamed body. A failure is not fatal; the next node holds an empty caption with the reason.' }),
  code('demo-w1', 'demo writer - first draft', P(12, 1), 'demo-writer-first-draft.js'),
  code('apply-caption', 'apply the caption', P(13, 0), 'apply-the-caption.js'),
  ifExpr('caption-ok', 'caption ok?', P(14, 0), '={{ $json._caption_ok }}'),
  ifExpr('rewrite-ok', 'rewrite allowed?', P(15, 1.5), '={{ $json._rewrite_allowed }}',
    'Only a model or demo caption, and only REWRITE_ATTEMPTS (1) times. A banked caption is a person\'s copy and is never rewritten.'),
  code('brief', 'build the rewrite brief', P(16, 1.5), 'build-the-rewrite-brief.js'),
  switchNode('rewriter', 'who rewrites?', P(17, 1.5), '={{ $json._writer }}', [['model', 'model'], ['demo', 'demo']]),
  http('llm2', '[cred] LLM - rewrite against the failures', P(18, 0.75), 'POST', `={{ ${CFG}.llm_base_url }}/v1/chat/completions`, {
    headers: [['Authorization', `=Bearer {{ ${CFG}.llm_api_key }}`], ['Content-Type', 'application/json']],
    body: `={{ JSON.stringify({ model: ${CFG}.llm_model, stream: false, max_tokens: 1200, temperature: 0.4, messages: $json._rewrite_messages }) }}`,
    timeout: 120000, onError: 'continueRegularOutput',
    notes: 'The brief, the failed caption as the assistant turn, and the exact failures. Lower temperature: fix, do not reinvent.' }),
  code('demo-w2', 'demo writer - rewrite', P(18, 2.25), 'demo-writer-rewrite.js'),
  code('check-rewrite', 'check the rewrite', P(19, 1.5), 'check-the-rewrite.js'),
  ifExpr('rewrite-pass', 'rewrite ok?', P(20, 1.5), '={{ $json._caption_ok }}'),
  code('stop-caption', 'STOP: caption held', P(20, 3), 'stop-no-caption.js'),

  code('build-html', 'build the HTML template', P(21.5, 0), 'build-the-html-template.js'),
  code('validate', 'validate the layout', P(22.5, 0), 'validate-the-layout.js'),
  ifExpr('layout-ok', 'layout ok?', P(23.5, 0), '={{ $json._layout_ok }}'),
  code('stop-layout', 'STOP: layout failed', P(23.5, 3), 'stop-layout-failed.js'),
  ifExpr('render-on', 'renderer configured?', P(24.5, 0), `={{ ${CFG}.render_enabled }}`),
  code('stop-render-cfg', 'STOP: renderer not configured', P(24.5, 3), 'stop-renderer-not-configured.js'),
  code('render-req', 'build the render request', P(25.5, 0), 'build-the-render-request.js'),
  switchNode('which-render', 'which renderer?', P(26.5, 0), '={{ $json._provider }}',
    [['browserless', 'browserless'], ['hcti', 'hcti']],
    'Never add a provider that renders from a URL: hosting the template somewhere fetchable publishes an unapproved draft.'),
  http('render-bl', '[cred] Browserless - HTML to PNG', P(27.5, -1), 'POST', '={{ $json._render_url }}', {
    headers: [['Content-Type', 'application/json']], body: '={{ JSON.stringify($json._render_body) }}',
    timeout: 120000, binaryOut: true, onError: 'continueRegularOutput',
    notes: 'Returns the PNG bytes. Self-host it beside n8n; the compose block is in the README.' }),
  http('render-hcti', '[cred] HCTI - HTML to image', P(27.5, 1), 'POST', '={{ $json._render_url }}', {
    headers: [['Authorization', '={{ $json._render_auth }}'], ['Content-Type', 'application/json']],
    body: '={{ JSON.stringify($json._render_body) }}', timeout: 120000, onError: 'continueRegularOutput',
    notes: 'Returns JSON { url }. The next node downloads it.' }),
  http('render-dl', 'download the rendered image', P(28.5, 1), 'GET', '={{ $json.url }}',
    { timeout: 60000, binaryOut: true, onError: 'continueRegularOutput' }),
  merge('merge-png', 'one image', P(29.5, 0)),
  code('check-png', 'check the PNG', P(30.5, 0), 'check-the-png.js', { alwaysOutputData: true }),
  ifExpr('png-ok', 'image usable?', P(31.5, 0), '={{ $json._png_ok }}',
    'Checks the PNG signature and IHDR dimensions in the bytes, not the HTTP status.'),
  code('stop-no-image', 'STOP: no image', P(31.5, 3), 'stop-no-image.js'),

  code('approval-msg', 'build the approval message', P(33, 0), 'build-the-approval-message.js'),
  ifExpr('msg-ok', 'message fits?', P(34, 0), '={{ $json._message_ok }}'),
  code('stop-too-long', 'STOP: message too long', P(34, 3), 'stop-message-too-long.js'),
  ifExpr('deliver-on', 'deliver it?', P(35, 0), `={{ ${CFG}.deliver_enabled }}`,
    'False in PREVIEW, which is how this ships. Everything above has already run.'),
  code('stop-preview', 'STOP: preview - not delivered', P(35, 3), 'stop-preview-not-delivered.js'),
  discordSend('discord-send', '[cred] Discord - deliver the draft', P(36, 0), `={{ ${CFG}.channel_id }}`,
    '={{ $json._message }}', { file: true,
      notes: 'The draft and nothing else: caption, approval line, and the PNG from binary property `data` (Files). After import, open the node once and confirm Files shows `data`.' }),
  code('log-row', 'row for the log', P(37, 0), 'row-for-the-log.js',
    { notes: 'Written AFTER the delivery succeeds. A row claiming a draft is awaiting when none was delivered would silence the day.' }),
  ifExpr('write-on1', 'write to the sheet?', P(38, 0), `={{ ${CFG}.sheet_enabled }}`),
  sheet('write-log1', '[cred] Sheets - append the log row', P(39, 0), 'log_tab', { operation: 'append' }),
  codeAll('stop-demo-log1', 'STOP: demo - log row not written', P(39, 3), 'stop-demo-log-not-written.js'),

  merge('merge-end1', 'one outcome', P(40.5, 0)),
  code('summary1', 'build the run summary', P(41.5, 0), 'build-the-run-summary.js'),
  ifExpr('report1', 'worth reporting?', P(42.5, 0), '={{ $json._notify }}',
    'True when REPORT_WEBHOOK_URL is set and the run did something worth a message.'),
  http('slack1', '[cred] Slack - post the summary', P(43.5, -1), 'POST', `={{ ${CFG}.report_webhook_url }}`, {
    body: '={{ JSON.stringify($json._slack_body) }}', onError: 'continueRegularOutput',
    notes: 'Never carries the caption: a draft reaching a second audience before approval has left the gate.' }),
  noop('done1', 'done', P(43.5, 1))
];

const c1 = {
  'Run it now': to('config'),
  'Every weekday, 08:00': to('config'),
  'config': to('log in a sheet?'),
  'log in a sheet?': branch(['[cred] Sheets - read the log'], ['load the demo log']),
  '[cred] Sheets - read the log': to('resolve todays state'),
  'load the demo log': to('resolve todays state'),
  'resolve todays state': to('draft today?'),
  'draft today?': branch(['bank in a sheet?'], ['STOP: silent']),
  'STOP: silent': input('one outcome', 1),
  'bank in a sheet?': branch(['[cred] Sheets - read the bank'], ['pick todays post']),
  '[cred] Sheets - read the bank': to('pick todays post'),
  'pick todays post': to('anything to post?'),
  'anything to post?': branch(['who writes the caption?'], ['STOP: bank exhausted']),
  'STOP: bank exhausted': input('one outcome', 1),
  'who writes the caption?': outs(['apply the caption'], ['[cred] LLM - write the caption'],
    ['demo writer - first draft'], ['apply the caption']),
  '[cred] LLM - write the caption': to('apply the caption'),
  'demo writer - first draft': to('apply the caption'),
  'apply the caption': to('caption ok?'),
  'caption ok?': branch(['build the HTML template'], ['rewrite allowed?']),
  'rewrite allowed?': branch(['build the rewrite brief'], ['STOP: caption held']),
  'build the rewrite brief': to('who rewrites?'),
  'who rewrites?': outs(['[cred] LLM - rewrite against the failures'], ['demo writer - rewrite'], ['STOP: caption held']),
  '[cred] LLM - rewrite against the failures': to('check the rewrite'),
  'demo writer - rewrite': to('check the rewrite'),
  'check the rewrite': to('rewrite ok?'),
  'rewrite ok?': branch(['build the HTML template'], ['STOP: caption held']),
  'STOP: caption held': input('one outcome', 1),
  'build the HTML template': to('validate the layout'),
  'validate the layout': to('layout ok?'),
  'layout ok?': branch(['renderer configured?'], ['STOP: layout failed']),
  'STOP: layout failed': input('one outcome', 1),
  'renderer configured?': branch(['build the render request'], ['STOP: renderer not configured']),
  'STOP: renderer not configured': input('one outcome', 1),
  'build the render request': to('which renderer?'),
  'which renderer?': outs(['[cred] Browserless - HTML to PNG'], ['[cred] HCTI - HTML to image'], ['STOP: renderer not configured']),
  '[cred] Browserless - HTML to PNG': to('one image'),
  '[cred] HCTI - HTML to image': to('download the rendered image'),
  'download the rendered image': input('one image', 1),
  'one image': to('check the PNG'),
  'check the PNG': to('image usable?'),
  'image usable?': branch(['build the approval message'], ['STOP: no image']),
  'STOP: no image': input('one outcome', 1),
  'build the approval message': to('message fits?'),
  'message fits?': branch(['deliver it?'], ['STOP: message too long']),
  'STOP: message too long': input('one outcome', 1),
  'deliver it?': branch(['[cred] Discord - deliver the draft'], ['STOP: preview - not delivered']),
  'STOP: preview - not delivered': input('one outcome', 1),
  '[cred] Discord - deliver the draft': to('row for the log'),
  'row for the log': to('write to the sheet?'),
  'write to the sheet?': branch(['[cred] Sheets - append the log row'], ['STOP: demo - log row not written']),
  '[cred] Sheets - append the log row': to('one outcome'),
  'STOP: demo - log row not written': input('one outcome', 1),
  'one outcome': to('build the run summary'),
  'build the run summary': to('worth reporting?'),
  'worth reporting?': branch(['[cred] Slack - post the summary'], ['done'])
};

// Section column ranges [first, last] and their notes, in canvas order.
const S1 = [
  [[0, 5], '## 1. Decide whether today needs a post\nReads the log. An open draft keeps the day silent; a cancelled one is drafted again. No sheet means the demo log.'],
  [[6.5, 9.5], '## 2. Pick a topic that has rested\nNext ready bank row, skipping pillars published recently, a busy topic family and layout repeats.'],
  [[11, 20], '## 3. Write, check, rewrite once\nBank, LLM or demo writer. Rules run in code. A failing model caption gets one rewrite with its failures, then a human.'],
  [[21.5, 31.5], '## 4. Render and check the image\nHTML template, layout check, Browserless or HCTI, then the PNG bytes are verified.'],
  [[33, 39], '## 5. Send for approval\nCaption and image go to a private Discord channel, then an awaiting row is logged.'],
  [[40.5, 43.5], '## 6. Report the run\nOne Slack summary per run, with a warning before the LinkedIn token expires.']
];

const MAIN1 = `## Draft LinkedIn posts with AI and send them to Discord for approval

For teams posting daily to a LinkedIn company page who want drafting automated and nothing published without a yes.

### How it works
1. Reads the post log and decides whether today needs a draft. An open draft keeps the day silent; a cancelled one is drafted again.
2. Picks the next idea from a Google Sheets bank, skipping pillars published in the last 21 days, a topic family already used twice this week, and layout repeats.
3. Takes the bank caption or has an LLM write one, then checks it in code: length, hashtags, banned phrases, links, @mentions and a repeated opening hook.
4. A failing model caption gets one rewrite with the exact failures fed back. If it still fails, it is held for a human.
5. Builds the image as HTML, checks the layout, renders it with Browserless or HCTI and verifies the PNG bytes.
6. Sends caption and image to a private Discord channel and logs it as awaiting. It never publishes; the companion workflow does.

### Setup
1. Import and click Execute workflow. With \`SHEET_ID\` blank it runs on demo data and stops before anything leaves n8n.
2. Create the Bank and Log tabs (headings in the README) and set \`SHEET_ID\`.
3. Connect Google Sheets and Discord, add an LLM key and a renderer in \`config\`.
4. Set \`TEST_CHANNEL_ID\` to a test channel, then \`TEST_RUN = false\` to go live.

### Requirements
Google Sheets, a Discord bot, an OpenAI-compatible endpoint, and Browserless or HCTI. Slack is optional.

### Customization tips
Every rule and threshold is a constant in \`config\`. The image design is \`build the HTML template\`.`;

// ======================================================================================
//  WORKFLOW 02 — read the reply, edit / publish / expire, alert, report weekly
// ======================================================================================
const w2 = [
  trigger('sched2', 'Every 5 minutes', P(0, 0), { field: 'minutes', minutesInterval: 5 },
    'Polling, not a watcher process: nothing to keep alive across reboots. Most runs end at STOP: nothing awaiting.'),
  manual('manual2', P(0, 1)),
  code('cfg2', 'config', P(1, 0), 'config.js'),
  ifExpr('log-on2', 'log in a sheet?', P(2, 0), `={{ ${CFG}.sheet_enabled }}`),
  sheet('read-log2', '[cred] Sheets - read the log', P(3, 0), 'log_tab', { always: true }),
  codeAll('demo-log2', 'load the demo log', P(3, 1), 'load-the-demo-log-02.js'),
  codeAll('pending', 'find the pending draft', P(4, 0), 'find-the-pending-draft.js',
    { notes: 'An awaiting row is open until a later row with the same message id closes it.' }),
  switchNode('draft-state', 'what state is the draft in?', P(5, 0), '={{ $json._draft_state }}',
    [['open', 'open'], ['expired', 'expired'], ['conflict', 'conflict']]),
  code('expired-row', 'row for the expired draft', P(6, 1), 'row-for-the-outcome.js'),
  code('stop-conflict', 'STOP: log conflict', P(6, 2), 'stop-log-conflict.js'),
  code('stop-idle', 'STOP: nothing awaiting', P(6, 3), 'stop-nothing-awaiting.js'),

  codeAll('report-due', 'is the weekly report due?', P(7.5, 2.5), 'is-the-weekly-report-due.js'),
  ifExpr('report-due-if', 'report due?', P(8.5, 2.5), '={{ $json._report_due }}'),
  code('stop-not-hour', 'STOP: not the report hour', P(8.5, 4), 'stop-not-the-report-hour.js'),
  ifExpr('stats-on', 'pull LinkedIn stats?', P(9.5, 2.5), '={{ $json._want_stats }}',
    'STATS_ENABLED and a token, and at least one post this week. Needs r_organization_social.'),
  http('li-stats', '[cred] LinkedIn - pull post stats', P(10.5, 1.5), 'GET', '={{ $json._stats_url }}', {
    headers: LI_HEADERS.slice(0, 3), fullResponse: true, retry: false, onError: 'continueRegularOutput',
    notes: 'organizationalEntityShareStatistics for this week\'s post URNs. A 403 means the app lacks Community Management API access; the report says so and goes out anyway.' }),
  code('read-stats', 'read the post stats', P(11.5, 1.5), 'read-the-post-stats.js'),
  code('weekly', 'build the weekly report', P(12.5, 2.5), 'build-the-weekly-report.js'),
  ifExpr('report-on2', 'post the weekly report?', P(13.5, 2.5), `={{ ${CFG}.report_enabled }}`),
  code('stop-no-hook', 'STOP: no report webhook', P(13.5, 4), 'stop-no-report-webhook.js'),
  http('slack-weekly', '[cred] Slack - post the weekly report', P(14.5, 2.5), 'POST', `={{ ${CFG}.report_webhook_url }}`, {
    body: '={{ JSON.stringify($json._report_body) }}', retry: false }),
  code('report-row', 'row for the weekly report', P(15.5, 2.5), 'row-for-the-weekly-report.js'),
  ifExpr('write-report', 'write the report row?', P(16.5, 2.5), `={{ ${CFG}.sheet_enabled }}`),
  sheet('log-report', '[cred] Sheets - log the weekly report', P(17.5, 2.5), 'log_tab', { operation: 'append' }),
  code('stop-demo-report', 'STOP: demo - report not logged', P(17.5, 4), 'stop-demo-report-not-logged.js'),

  ifExpr('demo-chan', 'demo channel?', P(19, 0), `={{ ${CFG}.using_demo_bank }}`,
    'The demo log has a made-up draft, so its reply is read from a made-up channel (DEMO_REPLY in config).'),
  { parameters: { resource: 'message', operation: 'getAll', guildId: { __rl: true, mode: 'id', value: '' },
    channelId: { __rl: true, mode: 'id', value: '={{ $json._channel_id }}' }, returnAll: false, limit: 50, options: {} },
  id: 'discord-read', name: '[cred] Discord - read the channel', type: 'n8n-nodes-base.discord', typeVersion: 2,
  position: P(20, 1), alwaysOutputData: true,
  notes: 'Newest 50. The draft message is the anchor; if it has scrolled out, the gate waits rather than guessing.' },
  codeAll('demo-chan-load', 'load the demo channel', P(20, -1), 'load-the-demo-channel.js'),
  codeAll('read-reply', 'read the approval reply', P(21, 0), 'read-the-approval-reply.js',
    { notes: 'THE GATE. After the draft only, never a bot, whole-message post/cancel, edit = first line, first decision wins.' }),
  switchNode('decision', 'what did they say?', P(22, 0), '={{ $json._decision }}',
    [['post', 'post'], ['edit', 'edit'], ['cancel', 'cancel']]),
  code('cancel-row', 'row for the cancelled outcome', P(23, 2), 'row-for-the-outcome.js'),
  code('stop-wait', 'STOP: still awaiting approval', P(23, 3), 'stop-still-awaiting.js'),

  code('check-edit', 'check the edited caption', P(24.5, 2.5), 'check-the-edited-caption.js',
    { notes: 'Same caption rules as workflow 01. An edit never publishes: it becomes a new draft that needs its own post.' }),
  ifExpr('edit-ok', 'edit passes the rules?', P(25.5, 2.5), '={{ $json._edit_ok }}'),
  ifExpr('deliver-rev', 'deliver the revision?', P(26.5, 1.5), `={{ ${CFG}.deliver_enabled }}`),
  http('rev-img', 'download the draft image', P(27.5, 1.5), 'GET', '={{ $json._image_url }}', { binaryOut: true, timeout: 60000 }),
  discordSend('discord-rev', '[cred] Discord - deliver the revised draft', P(28.5, 1.5), "={{ $('check the edited caption').first().json._channel_id }}",
    "={{ $('check the edited caption').first().json._message }}", { file: true,
      notes: 'The revised caption with the original image. After import, confirm Files shows `data`.' }),
  code('rev-rows', 'rows for the revision', P(29.5, 1.5), 'rows-for-the-revision.js'),
  code('stop-rev-preview', 'STOP: preview - revision not delivered', P(27.5, 2.6), 'stop-preview-revision-not-delivered.js'),
  ifExpr('explain-on', 'explain the refusal?', P(26.5, 3.5), `={{ ${CFG}.deliver_enabled }}`),
  discordSend('discord-refuse', '[cred] Discord - explain the refused edit', P(27.5, 3.6), '={{ $json._channel_id }}',
    '={{ $json._refusal_message }}', { replyTo: '={{ $json._reply_id }}' }),
  code('refused-row', 'row for the refused edit', P(28.5, 3.6), 'row-for-the-refused-edit.js'),
  code('stop-ref-preview', 'STOP: preview - refusal not sent', P(27.5, 4.6), 'stop-preview-refusal-not-sent.js'),

  code('approved', 'the approved draft', P(31, 0), 'the-approved-draft.js',
    { notes: 'Publishes the caption from the DISCORD MESSAGE, fingerprint-checked against what was delivered.' }),
  ifExpr('intact', 'still the approved draft?', P(32, 0), '={{ $json._publishable }}'),
  code('stop-changed', 'STOP: the approved draft changed', P(32, 3), 'stop-draft-changed.js'),
  ifExpr('publish-on', 'publish it?', P(33, 0), `={{ ${CFG}.live_publish }}`,
    'False unless TEST_RUN is false and a token is set. The approval stays open either way.'),
  code('stop-not-pub', 'STOP: not published', P(33, 3), 'stop-not-published.js'),
  http('li-init', '[cred] LinkedIn - register the upload', P(34, 0), 'POST', 'https://api.linkedin.com/rest/images?action=initializeUpload', {
    headers: LI_HEADERS, body: `={{ JSON.stringify({ initializeUploadRequest: { owner: ${CFG}.linkedin_org_urn } }) }}`,
    fullResponse: true, onError: 'continueRegularOutput',
    notes: 'Step 1 of 3, publishes nothing. fullResponse + neverError so an expired token arrives as data and is alerted, not a red execution.' }),
  code('reg', 'read the upload registration', P(35, 0), 'read-the-upload-registration.js'),
  ifExpr('token-ok', 'LinkedIn accepted the token?', P(36, 0), '={{ $json._registered }}'),
  http('li-fetch', 'download the approved image', P(37, 0), 'GET', "={{ $('the approved draft').first().json._image_url }}",
    { binaryOut: true, notes: 'The image the reviewer saw, fetched fresh from the approved message.' }),
  http('li-upload', '[cred] LinkedIn - upload the image', P(38, 0), 'PUT', "={{ $('read the upload registration').first().json._upload_url }}", {
    headers: [['Authorization', `=Bearer {{ ${CFG}.linkedin_token }}`]], binaryIn: 'data', timeout: 120000,
    notes: 'Step 2 of 3. Raw bytes, not multipart. Still not public.' }),
  http('li-post', '[cred] LinkedIn - publish the post', P(39, 0), 'POST', 'https://api.linkedin.com/rest/posts', {
    headers: LI_HEADERS,
    body: `={{ JSON.stringify({ author: ${CFG}.linkedin_org_urn, commentary: $('the approved draft').first().json._caption_escaped, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, content: { media: { id: $('read the upload registration').first().json._image_urn } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }) }}`,
    fullResponse: true, retry: false, onError: 'continueRegularOutput',
    notes: 'STEP 3 OF 3, IRREVERSIBLE. retryOnFail is OFF: a publish that timed out may have succeeded, and a retry double-posts.' }),
  code('publish-result', 'read the publish result', P(40, 0), 'read-the-publish-result.js'),
  ifExpr('posted', 'did it publish?', P(41, 0), '={{ $json._posted }}'),
  code('stop-failed', 'STOP: publish failed', P(41, 3), 'stop-publish-failed.js'),

  code('alert', 'build the LinkedIn alert', P(42.5, 1.5), 'build-the-linkedin-alert.js'),
  ifExpr('alert-due', 'alert due?', P(43.5, 1.5), '={{ $json._alert_due }}',
    'At most one alert per ALERT_REPEAT_HOURS for the same draft, read from the log.'),
  discordSend('discord-alert', '[cred] Discord - alert the channel', P(44.5, 1.5), '={{ $json._channel_id }}',
    '={{ $json._alert_text }}', { replyTo: '={{ $json._message_id }}' }),
  code('alert-row', 'row for the alert', P(45.5, 1.5), 'row-for-the-alert.js'),
  code('stop-alerted', 'STOP: LinkedIn alert already sent', P(44.5, 3), 'stop-alert-already-sent.js'),

  code('bank-row', 'mark the bank row posted', P(47, 0), 'mark-the-bank-row-posted.js'),
  sheet('write-bank', '[cred] Sheets - mark the bank row', P(48, 0), 'bank_tab', { operation: 'appendOrUpdate', matching: ['Slug'],
    notes: "Matches on 'Slug'. Rename that heading and change BANK_COLUMNS.slug AND this match field together." }),
  code('posted-row', 'row for the published outcome', P(49, 0), 'row-for-the-outcome.js'),
  merge('merge-rows', 'one log row', P(50, 0), 6),
  ifExpr('write-on2', 'write to the sheet?', P(51, 0), `={{ ${CFG}.sheet_enabled }}`),
  sheet('write-log2', '[cred] Sheets - append the log row', P(52, 0), 'log_tab', { operation: 'append' }),
  codeAll('stop-demo-log2', 'STOP: demo - log row not written', P(52, 3), 'stop-demo-log-not-written.js'),

  merge('merge-end2', 'one outcome', P(53.5, 0)),
  codeAll('summary2', 'build the run summary', P(54.5, 0), 'build-the-run-summary.js'),
  ifExpr('report2', 'worth reporting?', P(55.5, 0), '={{ $json._notify }}',
    'Idle polls (nothing awaiting, still awaiting) are quiet: they would be 280 messages a day.'),
  http('slack2', '[cred] Slack - post the summary', P(56.5, -1), 'POST', `={{ ${CFG}.report_webhook_url }}`, {
    body: '={{ JSON.stringify($json._slack_body) }}', onError: 'continueRegularOutput' }),
  noop('done2', 'done', P(56.5, 1))
];

const c2 = {
  'Run it now': to('config'),
  'Every 5 minutes': to('config'),
  'config': to('log in a sheet?'),
  'log in a sheet?': branch(['[cred] Sheets - read the log'], ['load the demo log']),
  '[cred] Sheets - read the log': to('find the pending draft', 'is the weekly report due?'),
  'load the demo log': to('find the pending draft', 'is the weekly report due?'),
  'find the pending draft': to('what state is the draft in?'),
  'what state is the draft in?': outs(['demo channel?'], ['row for the expired draft'], ['STOP: log conflict'], ['STOP: nothing awaiting']),
  'row for the expired draft': input('one log row', 2),
  'STOP: log conflict': input('one outcome', 1),
  'STOP: nothing awaiting': input('one outcome', 1),

  'is the weekly report due?': to('report due?'),
  'report due?': branch(['pull LinkedIn stats?'], ['STOP: not the report hour']),
  'pull LinkedIn stats?': branch(['[cred] LinkedIn - pull post stats'], ['build the weekly report']),
  '[cred] LinkedIn - pull post stats': to('read the post stats'),
  'read the post stats': to('build the weekly report'),
  'build the weekly report': to('post the weekly report?'),
  'post the weekly report?': branch(['[cred] Slack - post the weekly report'], ['STOP: no report webhook']),
  '[cred] Slack - post the weekly report': to('row for the weekly report'),
  'row for the weekly report': to('write the report row?'),
  'write the report row?': branch(['[cred] Sheets - log the weekly report'], ['STOP: demo - report not logged']),

  'demo channel?': branch(['load the demo channel'], ['[cred] Discord - read the channel']),
  'load the demo channel': to('read the approval reply'),
  '[cred] Discord - read the channel': to('read the approval reply'),
  'read the approval reply': to('what did they say?'),
  'what did they say?': outs(['the approved draft'], ['check the edited caption'], ['row for the cancelled outcome'], ['STOP: still awaiting approval']),
  'row for the cancelled outcome': input('one log row', 1),
  'STOP: still awaiting approval': input('one outcome', 1),

  'check the edited caption': to('edit passes the rules?'),
  'edit passes the rules?': branch(['deliver the revision?'], ['explain the refusal?']),
  'deliver the revision?': branch(['download the draft image'], ['STOP: preview - revision not delivered']),
  'download the draft image': to('[cred] Discord - deliver the revised draft'),
  '[cred] Discord - deliver the revised draft': to('rows for the revision'),
  'rows for the revision': input('one log row', 3),
  'STOP: preview - revision not delivered': input('one outcome', 1),
  'explain the refusal?': branch(['[cred] Discord - explain the refused edit'], ['STOP: preview - refusal not sent']),
  '[cred] Discord - explain the refused edit': to('row for the refused edit'),
  'row for the refused edit': input('one log row', 4),
  'STOP: preview - refusal not sent': input('one outcome', 1),

  'the approved draft': to('still the approved draft?'),
  'still the approved draft?': branch(['publish it?'], ['STOP: the approved draft changed']),
  'STOP: the approved draft changed': input('one outcome', 1),
  'publish it?': branch(['[cred] LinkedIn - register the upload'], ['STOP: not published']),
  'STOP: not published': input('one outcome', 1),
  '[cred] LinkedIn - register the upload': to('read the upload registration'),
  'read the upload registration': to('LinkedIn accepted the token?'),
  'LinkedIn accepted the token?': branch(['download the approved image'], ['build the LinkedIn alert']),
  'download the approved image': to('[cred] LinkedIn - upload the image'),
  '[cred] LinkedIn - upload the image': to('[cred] LinkedIn - publish the post'),
  '[cred] LinkedIn - publish the post': to('read the publish result'),
  'read the publish result': to('did it publish?'),
  'did it publish?': branch(['mark the bank row posted'], ['STOP: publish failed']),
  'STOP: publish failed': input('one outcome', 1),

  'build the LinkedIn alert': to('alert due?'),
  'alert due?': branch(['[cred] Discord - alert the channel'], ['STOP: LinkedIn alert already sent']),
  '[cred] Discord - alert the channel': to('row for the alert'),
  'row for the alert': input('one log row', 5),
  'STOP: LinkedIn alert already sent': input('one outcome', 1),

  'mark the bank row posted': to('[cred] Sheets - mark the bank row'),
  '[cred] Sheets - mark the bank row': to('row for the published outcome'),
  'row for the published outcome': to('one log row'),
  'one log row': to('write to the sheet?'),
  'write to the sheet?': branch(['[cred] Sheets - append the log row'], ['STOP: demo - log row not written']),
  '[cred] Sheets - append the log row': to('one outcome'),
  'STOP: demo - log row not written': input('one outcome', 1),
  'one outcome': to('build the run summary'),
  'build the run summary': to('worth reporting?'),
  'worth reporting?': branch(['[cred] Slack - post the summary'], ['done'])
};

const S2 = [
  [[0, 6], '## 1. Find the open draft\nReads the log every 5 minutes. An expired draft is closed, never published. Most runs stop here.'],
  [[7.5, 17.5], '## 2. Weekly report\nOnce a week, from the log: published, expired, cancelled and edited drafts, plus LinkedIn statistics if enabled.'],
  [[19, 23], '## 3. Read the reply\nOnly a human\'s post, cancel or edit counts. Bots, chatter and replies already handled are ignored.'],
  [[24.5, 29.5], '## 4. Check an edit\nSame caption rules. A passing edit goes out again as a new draft; a failing one gets the reasons.'],
  [[31, 41], '## 5. Verify and publish\nRefuses a changed draft. Register, upload, publish. No retry on publish, so a timeout cannot double-post.'],
  [[42.5, 45.5], '## 6. Alert on a rejected token\nOne alert in the channel per 6 hours. The approval stays open for after the fix.'],
  [[47, 52], '## 7. Record the outcome\nMarks the bank row and appends the log row with the post URN.'],
  [[53.5, 56.5], '## 8. Report the run\nSlack summary for anything worth knowing; idle polls stay quiet.']
];

const MAIN2 = `## Publish Discord-approved posts to LinkedIn with edits and token alerts

For teams using the companion drafting workflow who need approved drafts published to a LinkedIn company page, and nothing else.

### How it works
1. Every 5 minutes it reads the log. An open draft past its approval window is closed as expired, never published.
2. It reads the reply in Discord. Only a human's whole-message \`post\` or \`cancel\`, or \`edit\` with a new caption below it, counts.
3. An edit is checked against the same caption rules. If it passes, it is re-sent with the same image as a new draft that needs its own \`post\`. If not, the bot replies with the reasons.
4. On \`post\` it confirms the message is unchanged since delivery, then registers the image, uploads it and publishes. A rejected token posts one alert and keeps the approval open.
5. The post URN goes into the log and the bank row is marked posted.
6. Once a week it posts a report from the log, with LinkedIn statistics if enabled.

### Setup
1. Import and click Execute workflow. With \`SHEET_ID\` blank it plays a demo reply (\`DEMO_REPLY\`) with no credentials.
2. Use the same \`config\` as the drafting workflow.
3. Connect Google Sheets and Discord, and add a LinkedIn token with \`w_organization_social\` and your organisation URN.
4. Keep \`TEST_RUN = true\` until a full cycle ends at \`STOP: not published\`.

### Requirements
A LinkedIn company page with API access, the shared Google Sheet and the Discord approval channel. Slack is optional.

### Customization tips
Approval words, expiry, alert spacing and the report day are constants in \`config\`.`;

// ------------------------------------------------------------------ stickies (restyle_stickies.mjs geometry)
const NODE_W = 100, NODE_H = 100, PAD = 40, GAP = 60, MAIN_W = 560;
const words = (md) => md.replace(/[#*`>_\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
function textHeight(md, width) {
  let h = 0;
  for (const line of md.split('\n')) {
    if (/^#{1,2} /.test(line)) h += 40;
    else if (/^### /.test(line)) h += 32;
    else h += Math.max(1, Math.ceil((line.length * 7.5) / (width - 40))) * 22;
  }
  return h + 30;
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function specFor(sections, main) {
  return { main, sections: sections.map(([[a, b], text]) => ({ from: Math.round(a * COL) - 20, to: Math.round(b * COL) + 20, text })) };
}

function applyStickies(wf, spec) {
  const nodes = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
  const errors = [];
  const boxes = [];
  const sections = spec.sections.map((s, i) => {
    const members = nodes.filter((n) => n.position[0] >= s.from && n.position[0] <= s.to);
    if (members.length < 2) errors.push(`section ${i + 1} covers ${members.length} node(s)`);
    if (words(s.text) >= 50) errors.push(`section ${i + 1} has ${words(s.text)} words`);
    const minX = Math.min(...members.map((n) => n.position[0])), maxX = Math.max(...members.map((n) => n.position[0]));
    const minY = Math.min(...members.map((n) => n.position[1])), maxY = Math.max(...members.map((n) => n.position[1]));
    const w = Math.max(maxX - minX + NODE_W + 2 * PAD, 300);
    const head = textHeight(s.text, w);
    const box = { name: 'section ' + (i + 1), x: minX - PAD, y: minY - head - 20, w, h: maxY - minY + NODE_H + PAD + head + 20 };
    boxes.push(box);
    return { name: 'Section ' + (i + 1), box, text: s.text };
  });
  const mw = words(spec.main);
  if (mw < 100 || mw > 300) errors.push(`main sticky has ${mw} words`);
  if (!/^### How it works$/m.test(spec.main) || !/^### Setup$/m.test(spec.main)) errors.push('main sticky headings');
  const mainH = textHeight(spec.main, MAIN_W);
  const left = Math.min(...nodes.map((n) => n.position[0]), ...boxes.map((b) => b.x));
  const top = Math.min(...nodes.map((n) => n.position[1]), ...boxes.map((b) => b.y));
  const main = { name: 'main', x: left - GAP - MAIN_W, y: top, w: MAIN_W, h: mainH };
  boxes.push(main);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
    if (overlap(boxes[i], boxes[j])) errors.push(`${boxes[i].name} overlaps ${boxes[j].name}`);
  if (errors.length) throw new Error(wf.name + ': ' + errors.join('; '));
  const sticky = (name, b, content, color, id) => ({ parameters: { content, height: Math.round(b.h), width: Math.round(b.w), color },
    type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [Math.round(b.x), Math.round(b.y)], id, name });
  wf.nodes = [sticky('Overview', main, spec.main, 1, 'sticky-main'),
    ...sections.map((s, i) => sticky(s.name, s.box, s.text, 7, 'sticky-' + (i + 1))), ...nodes];
  return { words: mw, sections: sections.length };
}

// ------------------------------------------------------------------ de-identification
// The -publish.json must not say whose it is (GUIDELINES §10.6). Applied to every string.
const PUBLIC = [
  [/https:\/\/(ai\.manexus\.xyz|llm\.acme\.example)/g, 'https://llm.example.com'],
  [/(manexus|acme)_logo_12\.svg/gi, 'your_logo.svg'],
  [/manexus\.xyz|acme\.example/g, 'example.com'],
  [/urn:li:organization:96592857/g, 'urn:li:organization:0000000'],
  [/(manexus|acme)-linkedin-content skill/gi, 'house content guide'],
  [/#(Manexus|Acme)\b/g, '#YourCompany'],
  [/(MANEXUS|ACME) LINKEDIN DAILY/g, 'LINKEDIN DAILY'],
  [/(MANEXUS|ACME)<span>/g, 'YOUR BRAND<span>'],
  [/the Hermes (setup doc|job|version)/g, 'the earlier agent-based setup'],
  [/§7 of the earlier agent-based setup/g, 'the design notes'],
  [/\bHermes\b/g, 'agent'],
  [/the 9router gateway/g, 'an LLM gateway'],
  [/the drafts repo/g, 'the design repo'],
  [/\b(Manexus|Acme)\b/g, 'Your Company'],
  [/\b(manexus|acme)\b/g, 'yourcompany']
];
function deidentify(v) {
  if (typeof v === 'string') return PUBLIC.reduce((s, [re, r]) => s.replace(re, r), v);
  if (Array.isArray(v)) return v.map(deidentify);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deidentify(x)]));
  return v;
}

// Optional per-folder branding of the WORKING files (a copy of this folder for another brand).
const BRAND_FILE = path.join(HERE, 'brand.json');
const BRAND = fs.existsSync(BRAND_FILE) ? JSON.parse(fs.readFileSync(BRAND_FILE, 'utf8')) : { replace: [] };
function brand(v) {
  if (typeof v === 'string') return BRAND.replace.reduce((s, [a, b]) => s.split(a).join(b), v);
  if (Array.isArray(v)) return v.map(brand);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, brand(x)]));
  return v;
}

// ------------------------------------------------------------------ save
const write = (file, wf) => fs.writeFileSync(path.join(OUT, file), JSON.stringify(wf, null, 2) + '\n');
const TAGS = [{ name: 'linkedin' }, { name: 'approval' }];
const report = [];
const stickySpec = [];

for (const [stem, devName, title, nodes, conns, sections, main] of [
  ['01-draft-and-approve', '01 draft and approve', 'Draft LinkedIn posts with AI and send them to Discord for approval', w1, c1, S1, MAIN1],
  ['02-publish-on-approval', '02 publish on approval', 'Publish Discord-approved posts to LinkedIn with edits and token alerts', w2, c2, S2, MAIN2]
]) {
  const spec = specFor(sections, main);
  const dev = brand({ name: devName, nodes: nodes.map((n) => JSON.parse(JSON.stringify(n))), connections: conns,
    settings: { executionOrder: 'v1' }, pinData: {}, meta: { templateCredsSetupCompleted: false }, tags: TAGS });
  const devSpec = brand(spec);
  const r = applyStickies(dev, devSpec);
  write(stem + '.json', dev);

  const pubSpec = deidentify(spec);
  const pub = deidentify({ name: title, nodes: nodes.map((n) => JSON.parse(JSON.stringify(n))), connections: conns,
    settings: { executionOrder: 'v1' }, meta: { templateCredsSetupCompleted: true }, tags: [] });
  applyStickies(pub, pubSpec);
  write(stem + '-publish.json', pub);
  stickySpec.push(Object.assign({ file: '../' + stem + '-publish.json' }, pubSpec));
  report.push(`${stem}: ${nodes.length} nodes + ${r.sections + 1} stickies, overview ${r.words} words`);
}

// The sticky spec, in tools/restyle_stickies.mjs format, beside the build...
fs.writeFileSync(path.join(HERE, 'stickies.json'), JSON.stringify(stickySpec, null, 2) + '\n');
// ...and in the repo's resubmission spec, when this folder lives in that repo, so running the
// tool across all templates reproduces this layout instead of reverting it.
const REPO_SPEC = path.resolve(HERE, '..', '..', '..', 'tools', 'stickies-resubmit-2026-10.json');
if (fs.existsSync(REPO_SPEC)) {
  const all = JSON.parse(fs.readFileSync(REPO_SPEC, 'utf8'));
  const folder = path.basename(path.resolve(OUT));
  for (const s of stickySpec) {
    const file = '../workflows/' + folder + '/' + s.file.slice(3);
    const entry = { file, main: s.main, sections: s.sections };
    const i = all.findIndex((e) => e.file === file);
    if (i >= 0) all[i] = entry; else all.push(entry);
  }
  fs.writeFileSync(REPO_SPEC, JSON.stringify(all, null, 2) + '\n');
  report.push('updated ' + path.relative(path.resolve(HERE, '..', '..', '..'), REPO_SPEC));
}

console.log(report.join('\n'));
