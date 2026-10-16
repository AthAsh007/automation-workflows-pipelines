// Builds ../01-score-enrich-and-route.json and ../02-classify-replies-and-call-list.json from
// js/*.js. Run: bun build.js   (or: node build.js)
// `//@include <file>` inside a node's code is replaced by that file, so shared logic (the
// Zoho token check, the reply keyword rules) is one function in one place.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, '..');
const CFG = "$('config').first().json";

function js(file) {
  const src = fs.readFileSync(path.join(HERE, 'js', file), 'utf8').trimEnd();
  return src.replace(/^\/\/@include (\S+)\s*$/m, (_, inc) =>
    fs.readFileSync(path.join(HERE, 'js', inc), 'utf8').trimEnd());
}
const pos = (col, lane) => [col * 260, Math.round(lane * 200)];

const code = (id, name, p, file, extra) => Object.assign({ parameters: { jsCode: js(file) }, id, name,
  type: 'n8n-nodes-base.code', typeVersion: 2, position: p }, extra || {});

function ifExpr(id, name, p, left) {
  return { parameters: { conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: id + '-c', leftValue: left, rightValue: 'true',
        operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: p };
}
const ifFlag = (id, name, p, flag) => ifExpr(id, name, p, '={{ ' + CFG + '.' + flag + ' }}');

const merge = (id, name, p, n) => ({ parameters: { mode: 'append', numberInputs: n }, id, name,
  type: 'n8n-nodes-base.merge', typeVersion: 3, position: p });

// One HTTP node shape for every call. `json` is an expression for the body; `query` and
// `headers` are [name, value] pairs.
function http(id, name, p, o) {
  const parameters = { method: o.method || 'POST', url: o.url, options: { timeout: o.timeout || 30000 } };
  if (o.query) { parameters.sendQuery = true; parameters.queryParameters = { parameters: o.query.map(([n, v]) => ({ name: n, value: v })) }; }
  if (o.headers) { parameters.sendHeaders = true; parameters.headerParameters = { parameters: o.headers.map(([n, v]) => ({ name: n, value: v })) }; }
  if (o.json) { parameters.sendBody = true; parameters.specifyBody = 'json'; parameters.jsonBody = o.json; }
  return { parameters, id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: p,
    onError: o.onError || 'continueRegularOutput', notes: o.notes };
}
const zohoToken = (id, name, p) => http(id, name, p, {
  url: '={{ ' + CFG + ".zoho_accounts_base + '/oauth/v2/token' }}",
  query: [['refresh_token', '={{ ' + CFG + '.zoho_refresh_token }}'], ['client_id', '={{ ' + CFG + '.zoho_client_id }}'],
    ['client_secret', '={{ ' + CFG + '.zoho_client_secret }}'], ['grant_type', 'refresh_token']],
  timeout: 20000,
  notes: 'Exchanges the refresh token for a one-hour access token. The OAuth values come from config; this node only runs when Zoho is connected and the run is live.' });
const zohoCall = (id, name, p, urlExpr, bodyExpr, notes) => http(id, name, p, {
  url: urlExpr,
  headers: [['Authorization', "={{ 'Zoho-oauthtoken ' + $json._access_token }}"], ['Content-Type', 'application/json']],
  json: bodyExpr, onError: 'continueErrorOutput', notes });
const notify = (id, name, p, notes) => http(id, name, p, {
  url: '={{ ' + CFG + '.notify_webhook_url }}', headers: [['Content-Type', 'application/json']],
  json: '={{ JSON.stringify($json._notify_body) }}', timeout: 15000, notes });

const sticky = (id, p, w, h, colour, content) => ({ parameters: { content, height: h, width: w, color: colour },
  id, name: 'Sticky Note ' + id, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: p });

// Connection helpers. A target may be 'node' or ['node', inputIndex] for a merge input.
const t = (x) => (Array.isArray(x) ? { node: x[0], type: 'main', index: x[1] } : { node: x, type: 'main', index: 0 });
const link = (...to) => ({ main: [to.map(t)] });
const branch = (yes, no) => ({ main: [yes.map(t), no.map(t)] });

function save(file, name, nodes, connections) {
  const wf = { name, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {},
    meta: { templateCredsSetupCompleted: false }, tags: [] };
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(wf, null, 2) + '\n');
  console.log('wrote ' + file + ' (' + nodes.filter((n) => !/sticky/i.test(n.type)).length + ' nodes + ' +
    nodes.filter((n) => /sticky/i.test(n.type)).length + ' notes)');
}

// ===================================================================== WORKFLOW 01
const w1 = [
  { parameters: { httpMethod: 'POST', path: 'clay-prospect', responseMode: 'onReceived', options: {} },
    id: 'hook', name: 'A Clay row arrives', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0, 0),
    webhookId: 'clay-prospect',
    notes: "Paste this node's production URL into a Clay HTTP API column (method POST). Clay posts one row per request; map the columns in CLAY_FIELDS." },
  { parameters: {}, id: 'demo', name: 'Run the demo prospects', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1) },
  code('demo-load', 'load the demo prospects', pos(1, 1), 'load-the-demo-prospects.js'),
  code('cfg1', 'config', pos(2, 0.5), 'config.js'),
  code('read', 'read the prospects', pos(3, 0.5), 'read-the-prospects.js'),
  code('score', 'score and tier', pos(4, 0.5), 'score-and-tier.js'),
  code('plan', 'plan the enrichment', pos(5, 0.5), 'plan-the-enrichment.js'),
  ifExpr('worth', 'worth a credit?', pos(6, 0.5), '={{ $json._needs_enrich }}'),
  ifFlag('enrich-on', 'enrichment configured?', pos(7, 0), 'enrich_enabled'),
  code('skip-enrich', 'not worth a credit', pos(8, 1.5), 'not-worth-a-credit.js'),
  http('enrich', 'Apollo - enrich the contact', pos(8, -0.5), {
    url: '={{ ' + CFG + '.enrich_url }}',
    headers: [['x-api-key', '={{ ' + CFG + '.enrich_api_key }}'], ['Content-Type', 'application/json'], ['Cache-Control', 'no-cache']],
    json: '={{ JSON.stringify($json._enrich_body) }}',
    notes: 'One people/match call per funded prospect: A or B tier, missing an email, within ENRICH_BUDGET. The key comes from config.' }),
  code('enrich-demo', 'use the demo enrichment', pos(8, 0.5), 'use-the-demo-enrichment.js'),
  code('enrich-read', 'read the enrichment', pos(9, -0.5), 'read-the-enrichment.js'),
  merge('m-pros', 'one list of prospects', pos(10, 0.5), 2),
  code('need-verify', 'who needs verifying', pos(11, 0.5), 'who-needs-verifying.js'),
  ifExpr('verify-on', 'verify with a key?', pos(12, 0.5),
    '={{ $json._needs_verify && ' + CFG + '.verifier_enabled }}'),
  http('verify', 'Verifier - check the address', pos(13, 0), {
    method: 'GET', url: '={{ ' + CFG + '.verifier_url }}', timeout: 20000,
    query: [['api', '={{ ' + CFG + '.verifier_api_key }}'], ['email', '={{ $json.email }}'], ['timeout', '10']],
    notes: 'One check per A/B address. A failed call reads as unknown, which holds the lead from the campaign.' }),
  code('verify-none', 'verification without a key', pos(13, 1), 'verification-without-a-key.js'),
  code('verify-apply', 'apply the verification', pos(14, 0), 'apply-the-verification.js'),
  merge('m-verdicts', 'one list of verdicts', pos(15, 0.5), 2),
  code('decide', 'decide what goes where', pos(16, 0.5), 'decide-what-goes-where.js'),
  code('zoho-build', 'build the Zoho upsert', pos(17, 0.5), 'build-the-zoho-upsert.js'),
  ifExpr('zoho-on', 'writing to Zoho?', pos(18, 0.5), '={{ ' + CFG + '.zoho_enabled && $json._count > 0 }}'),
  zohoToken('zoho-token', 'Zoho - get an access token', pos(19, 0)),
  code('zoho-preview', 'STOP: preview - Zoho payload shown', pos(19, 1.5), 'stop-preview-zoho-payload-shown.js'),
  code('zoho-read-token', 'read the access token', pos(20, 0), 'read-the-access-token.js'),
  ifExpr('zoho-authed', 'authenticated?', pos(21, 0), '={{ $json._authed }}'),
  zohoCall('zoho-upsert', 'Zoho CRM - upsert the leads', pos(22, -0.5), '={{ $json._zoho.url }}',
    '={{ JSON.stringify($json._zoho.body) }}',
    'Leads/upsert, matched on ZOHO_DUPLICATE_CHECK: a re-posted Clay row updates its lead instead of duplicating it.'),
  code('zoho-noauth', 'STOP: could not authenticate with Zoho', pos(22, 0.7), 'stop-could-not-authenticate.js'),
  code('zoho-answers', "read Zoho's answers", pos(23, -1), 'read-zohos-answers.js'),
  code('zoho-rejected', 'STOP: Zoho rejected the write', pos(23, 0), 'stop-zoho-rejected-the-write.js'),
  code('sl-build', 'build the Smartlead pushes', pos(24, 0.5), 'build-the-smartlead-pushes.js'),
  ifExpr('sl-on', 'pushing to Smartlead?', pos(25, 0.5),
    '={{ ' + CFG + '.smartlead_enabled && !$json._none && !$json._placeholder }}'),
  http('sl-push', 'Smartlead - add leads to the campaign', pos(26, 0), {
    url: '={{ $json._url }}', query: [['api_key', '={{ ' + CFG + '.smartlead_api_key }}']],
    headers: [['Content-Type', 'application/json']], json: '={{ JSON.stringify($json._body) }}',
    notes: "One call per tier campaign, up to SMARTLEAD_BATCH leads. Smartlead's block and unsubscribe lists are always respected." }),
  code('sl-preview', 'STOP: preview - Smartlead payload shown', pos(26, 1.2), 'stop-preview-smartlead-payload-shown.js'),
  code('sl-read', "read Smartlead's answer", pos(27, 0), 'read-smartleads-answer.js'),
  merge('m-campaign', 'after the campaign step', pos(28, 0.5), 2),
  code('summary', 'build the run summary', pos(29, 0.5), 'build-the-run-summary.js', { executeOnce: true }),
  ifFlag('summary-on', 'posting the summary?', pos(30, 0.5), 'notify_enabled'),
  notify('summary-post', 'Notify - post the run summary', pos(31, 0),
    'A Slack, Teams or Google Chat incoming webhook from NOTIFY_WEBHOOK_URL. Posts only outside preview.'),
  code('summary-none', 'STOP: summary not posted', pos(31, 1), 'stop-summary-not-posted.js'),
  code('summary-done', 'STOP: summary posted', pos(32, 0), 'stop-posted.js'),
  sticky('start1', [-40, -700], 640, 600, 4,
    '## Score, enrich and route — start here\n\n' +
    'The first of two workflows. Import it alongside **02-classify-replies-and-call-list**; both share the same **config** node.\n\n' +
    '**Run it before you configure anything.** Press **Execute Workflow** on **Run the demo prospects**: twelve invented prospects in ' +
    "Clay's row shape go through scoring, the enrichment budget, verification and routing. Open **decide what goes where** for the " +
    'routing, **STOP: preview - Zoho payload shown** and **STOP: preview - Smartlead payload shown** for the exact requests, and ' +
    '**STOP: summary not posted** for the run summary. Nothing is written or sent.\n\n' +
    '**Setup, in order**\n' +
    '1. **config**: replace `SCORING`, `TIERS`, `PERSONAS` and `RECOMMENDED_ACTION` with your own model, and map your Clay columns in `CLAY_FIELDS`.\n' +
    "2. In Clay, add an HTTP API column that POSTs each row to **A Clay row arrives**'s production URL.\n" +
    '3. `ENRICH_API_KEY` and `ENRICH_BUDGET`; `VERIFIER_API_KEY`.\n' +
    '4. Zoho: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, and your custom field API names in `ZOHO_FIELDS`.\n' +
    '5. Smartlead: `SMARTLEAD_API_KEY` and a campaign per tier. Set `TEST_CAMPAIGN_ID` to a test campaign and run once.\n' +
    '6. Only then `TEST_RUN = false`.'),
  sticky('s1', [700, 420], 1800, 260, 7,
    '### 1. Score first, then spend\n\n`score and tier` scores every row on the fields Clay already sent, sets the tier, persona and recommended action, and catches duplicates in the run. ' +
    '`plan the enrichment` then funds only A and B rows missing an email, highest score first, up to `ENRICH_BUDGET`. A C, a Reject or a duplicate never costs a credit.'),
  sticky('s2', [2800, 420], 1400, 260, 7,
    '### 2. Verify before anything is sequenced\n\nOnly A and B addresses are checked, because only they can reach a campaign. It fails closed: a verifier that did not answer, or no verifier key at all, holds the lead from Smartlead.'),
  sticky('s3', [4160, 420], 2600, 260, 7,
    '### 3. Route: Zoho for the record, Smartlead for the sequence\n\n`decide what goes where` writes A, B and C to Zoho as one upsert matched on email, and pushes verified A and B to their own Smartlead campaign. ' +
    'Everyone held back is listed with the reason, and the run summary counts the credits used against the credits the ordering saved.')
];
const c1 = {
  'A Clay row arrives': link('config'),
  'Run the demo prospects': link('load the demo prospects'),
  'load the demo prospects': link('config'),
  config: link('read the prospects'),
  'read the prospects': link('score and tier'),
  'score and tier': link('plan the enrichment'),
  'plan the enrichment': link('worth a credit?'),
  'worth a credit?': branch(['enrichment configured?'], ['not worth a credit']),
  'enrichment configured?': branch(['Apollo - enrich the contact'], ['use the demo enrichment']),
  'Apollo - enrich the contact': link('read the enrichment'),
  'read the enrichment': link(['one list of prospects', 0]),
  'use the demo enrichment': link(['one list of prospects', 0]),
  'not worth a credit': link(['one list of prospects', 1]),
  'one list of prospects': link('who needs verifying'),
  'who needs verifying': link('verify with a key?'),
  'verify with a key?': branch(['Verifier - check the address'], ['verification without a key']),
  'Verifier - check the address': link('apply the verification'),
  'apply the verification': link(['one list of verdicts', 0]),
  'verification without a key': link(['one list of verdicts', 1]),
  'one list of verdicts': link('decide what goes where'),
  'decide what goes where': link('build the Zoho upsert'),
  'build the Zoho upsert': link('writing to Zoho?'),
  'writing to Zoho?': branch(['Zoho - get an access token'], ['STOP: preview - Zoho payload shown']),
  'Zoho - get an access token': link('read the access token'),
  'read the access token': link('authenticated?'),
  'authenticated?': branch(['Zoho CRM - upsert the leads'], ['STOP: could not authenticate with Zoho']),
  'Zoho CRM - upsert the leads': branch(["read Zoho's answers"], ['STOP: Zoho rejected the write']),
  "read Zoho's answers": link('build the Smartlead pushes'),
  'STOP: Zoho rejected the write': link('build the Smartlead pushes'),
  'STOP: could not authenticate with Zoho': link('build the Smartlead pushes'),
  'STOP: preview - Zoho payload shown': link('build the Smartlead pushes'),
  'build the Smartlead pushes': link('pushing to Smartlead?'),
  'pushing to Smartlead?': branch(['Smartlead - add leads to the campaign'], ['STOP: preview - Smartlead payload shown']),
  'Smartlead - add leads to the campaign': link("read Smartlead's answer"),
  "read Smartlead's answer": link(['after the campaign step', 0]),
  'STOP: preview - Smartlead payload shown': link(['after the campaign step', 1]),
  'after the campaign step': link('build the run summary'),
  'build the run summary': link('posting the summary?'),
  'posting the summary?': branch(['Notify - post the run summary'], ['STOP: summary not posted']),
  'Notify - post the run summary': link('STOP: summary posted')
};
save('01-score-enrich-and-route.json', '01 Score Clay prospects, enrich only the qualified, route to Zoho CRM and Smartlead', w1, c1);

// ===================================================================== WORKFLOW 02
const w2 = [
  { parameters: { httpMethod: 'POST', path: 'smartlead-reply', responseMode: 'onReceived', options: {} },
    id: 'hook2', name: 'A Smartlead reply arrives', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0, 0),
    webhookId: 'smartlead-reply',
    notes: "In Smartlead: Settings > Webhooks, event EMAIL_REPLY, pointed at this node's production URL." },
  { parameters: {}, id: 'demo2', name: 'Run the demo replies', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1) },
  { parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 7 * * 1-5' }] } },
    id: 'cron2', name: 'Every weekday, 07:30', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, 3) },
  { parameters: {}, id: 'calls-now', name: 'Build the call list now', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 4) },
  code('demo-replies', 'load the demo replies', pos(1, 1), 'load-the-demo-replies.js'),
  code('cfg2', 'config', pos(2, 2), 'config.js'),
  ifExpr('route', 'building the call list?', pos(3, 2),
    "={{ $('Every weekday, 07:30').isExecuted || $('Build the call list now').isExecuted }}"),
  code('reply-read', 'read the reply', pos(4, 0.5), 'read-the-reply.js'),
  ifFlag('ai-on', 'AI configured?', pos(5, 0.5), 'ai_enabled'),
  code('ai-req', 'build the AI request', pos(6, 0), 'build-the-ai-request.js'),
  code('kw', 'classify by keywords', pos(6, 1), 'classify-by-keywords.js'),
  http('ai', 'OpenAI - classify the reply', pos(7, 0), {
    url: '={{ ' + CFG + '.openai_url }}',
    headers: [['Authorization', "={{ 'Bearer ' + " + CFG + '.openai_api_key }}'], ['Content-Type', 'application/json']],
    json: '={{ JSON.stringify($json._ai_body) }}',
    notes: 'The model reads the reply into one class from REPLY_CLASSES, in a strict JSON schema. It decides nothing else, and a failed call falls back to the keyword rules.' }),
  code('ai-apply', 'apply the AI reading', pos(8, 0), 'apply-the-ai-reading.js'),
  code('follow', 'decide the follow-up', pos(9, 0.5), 'decide-the-follow-up.js'),

  code('zu-build', 'build the Zoho updates', pos(10, -1), 'build-the-zoho-updates.js'),
  ifExpr('zu-on', 'writing to Zoho?', pos(11, -1), '={{ ' + CFG + '.zoho_enabled && $json._count > 0 }}'),
  zohoToken('zu-token', 'Zoho - get an access token', pos(12, -1.5)),
  code('zu-preview', 'STOP: preview - Zoho updates shown', pos(12, -0.4), 'stop-preview-zoho-updates-shown.js'),
  code('zu-read-token', 'read the access token', pos(13, -1.5), 'read-the-access-token-02.js'),
  ifExpr('zu-authed', 'authenticated?', pos(14, -1.5), '={{ $json._authed }}'),
  zohoCall('zu-upsert', 'Zoho CRM - update the leads', pos(15, -2), '={{ $json._zoho.url }}',
    '={{ JSON.stringify($json._zoho.body) }}',
    'Upserts each lead matched on email: the new Lead_Status, and Email_Opt_Out for an unsubscribe. Returns the record ids the tasks hang off.'),
  code('zu-noauth', 'STOP: could not authenticate with Zoho', pos(15, -0.8), 'stop-could-not-authenticate.js'),
  code('zu-tasks', 'build the tasks', pos(16, -2.5), 'build-the-tasks.js'),
  code('zu-rejected', 'STOP: Zoho rejected the write', pos(17, -1.5), 'stop-zoho-rejected-the-write.js'),
  ifExpr('zu-any', 'tasks to create?', pos(17, -2.5), '={{ $json._task_count > 0 }}'),
  zohoCall('zu-create', 'Zoho CRM - create the tasks', pos(18, -3), '={{ $json._tasks.url }}',
    '={{ JSON.stringify($json._tasks.body) }}',
    'One task per reply a person has to act on, attached to the lead by its record id.'),
  code('zu-done', 'STOP: Zoho updated', pos(19, -2.5), 'stop-zoho-updated.js'),

  code('unsub', 'unsubscribes for Smartlead', pos(10, 1), 'unsubscribes-for-smartlead.js'),
  ifExpr('unsub-on', 'suppressing in Smartlead?', pos(11, 1),
    '={{ ' + CFG + '.smartlead_enabled && !$json._none && !!$json.lead_id }}'),
  http('unsub-call', 'Smartlead - unsubscribe the lead', pos(12, 0.6), {
    url: '={{ $json._url }}', query: [['api_key', '={{ ' + CFG + '.smartlead_api_key }}']],
    notes: 'Unsubscribes the lead from every campaign, not just the one they replied to.' }),
  code('unsub-preview', 'STOP: preview - unsubscribe not sent', pos(12, 1.5), 'stop-preview-unsubscribe-not-sent.js'),
  code('unsub-done', 'STOP: unsubscribed in Smartlead', pos(13, 0.6), 'stop-unsubscribed-in-smartlead.js'),

  code('alert', 'compose the team alert', pos(10, 2.5), 'compose-the-team-alert.js'),
  ifExpr('alert-on', 'alerting the team?', pos(11, 2.5), '={{ ' + CFG + '.notify_enabled && $json._count > 0 }}'),
  notify('alert-post', 'Notify - post the team alert', pos(12, 2.2),
    'Interested, referral and needs-a-person replies, quoted, to NOTIFY_WEBHOOK_URL.'),
  code('alert-preview', 'STOP: preview - alert not posted', pos(12, 3), 'stop-preview-alert-not-posted.js'),
  code('alert-done', 'STOP: alert posted', pos(13, 2.2), 'stop-posted.js'),

  ifFlag('cl-on', 'Zoho connected for the call list?', pos(4, 5), 'zoho_auth_ready'),
  zohoToken('cl-token', 'Zoho - get a token for the call list', pos(5, 4.5)),
  code('cl-demo', 'use the demo pipeline', pos(5, 6), 'use-the-demo-pipeline.js'),
  code('cl-query', 'build the call list query', pos(6, 4.5), 'build-the-call-list-query.js'),
  ifExpr('cl-authed', 'authenticated for the call list?', pos(7, 4.5), '={{ $json._authed }}'),
  zohoCall('cl-read', 'Zoho CRM - read the call list', pos(8, 4), '={{ $json._coql.url }}',
    '={{ JSON.stringify($json._coql.body) }}',
    'One COQL query for every lead whose status is in CALL_LIST_STATUSES. Reading is allowed in any mode; it changes nothing.'),
  code('cl-noauth', 'STOP: call list could not authenticate', pos(8, 5.2), 'stop-could-not-authenticate.js'),
  code('cl-leads', 'read the leads', pos(9, 4), 'read-the-leads.js'),
  code('cl-fail', 'STOP: could not read Zoho', pos(9, 4.8), 'stop-could-not-read-zoho.js'),
  code('cl-rank', 'rank the call list', pos(10, 5), 'rank-the-call-list.js'),
  ifFlag('cl-post-on', 'posting the call list?', pos(11, 5), 'notify_enabled'),
  notify('cl-post', 'Notify - post the call list', pos(12, 4.7), 'The morning call list to NOTIFY_WEBHOOK_URL.'),
  code('cl-preview', 'STOP: preview - call list shown', pos(12, 5.6), 'stop-preview-call-list-shown.js'),
  code('cl-done', 'STOP: call list posted', pos(13, 4.7), 'stop-posted.js'),

  sticky('start2', [-40, -1300], 640, 620, 4,
    '## Classify replies and build the call list — start here\n\n' +
    'The second of two workflows. Import it alongside **01-score-enrich-and-route**; both share the same **config** node.\n\n' +
    '**Run it before you configure anything.**\n' +
    '- **Run the demo replies**: six invented Smartlead replies (interested, not now, a referral, an unsubscribe, an out-of-office, and one only a person should answer). ' +
    'Open **decide the follow-up** for each class and action, and the three preview STOP nodes for the Zoho writes, the Smartlead unsubscribe and the team alert.\n' +
    '- **Build the call list now**: the morning list from a demo pipeline. Open **STOP: preview - call list shown**.\n\n' +
    '**Setup, in order**\n' +
    "1. In Smartlead, point an EMAIL_REPLY webhook at **A Smartlead reply arrives**'s production URL.\n" +
    '2. The same Zoho and Smartlead values as workflow 01; the refresh token also needs `ZohoCRM.coql.READ`.\n' +
    '3. Optional: `OPENAI_API_KEY`, for replies the keyword rules cannot place.\n' +
    '4. `NOTIFY_WEBHOOK_URL` for the alerts and the call list.\n' +
    '5. `TEST_RUN = false` to write for real.'),
  sticky('s21', [1000, 380], 1400, 240, 7,
    '### 1. Read and classify the reply\n\nThe quoted history is cut off first. Keyword rules always run; with `OPENAI_API_KEY` a model classifies into the same fixed list, in a strict schema. ' +
    'An unparseable answer falls back to the rules, a low-confidence one goes to a person, and an unsubscribe the rules catch always wins.'),
  sticky('s22', [2560, -1100], 2600, 240, 7,
    '### 2. Follow up through people, not the bot\n\nNothing replies automatically. Interested, referral and unclear replies become a Zoho task for a person and a quoted alert to the team; not-now becomes a task in 60 days. ' +
    'An unsubscribe is written to Zoho as Email_Opt_Out and removed from every Smartlead campaign. An out-of-office is ignored and the sequence carries on.'),
  sticky('s23', [1000, 1300], 2600, 240, 7,
    '### 3. The morning call list\n\nEvery weekday at 07:30, one COQL read of Zoho: interested replies first, most recent at the top, then referrals, then A tier by fit score, capped at `CALL_LIST_SIZE`. ' +
    'A lead with no phone stays on the list marked "email instead". With Zoho not connected, a demo pipeline stands in.')
];
const c2 = {
  'A Smartlead reply arrives': link('config'),
  'Run the demo replies': link('load the demo replies'),
  'load the demo replies': link('config'),
  'Every weekday, 07:30': link('config'),
  'Build the call list now': link('config'),
  config: link('building the call list?'),
  'building the call list?': branch(['Zoho connected for the call list?'], ['read the reply']),
  'read the reply': link('AI configured?'),
  'AI configured?': branch(['build the AI request'], ['classify by keywords']),
  'build the AI request': link('OpenAI - classify the reply'),
  'OpenAI - classify the reply': link('apply the AI reading'),
  'apply the AI reading': link('decide the follow-up'),
  'classify by keywords': link('decide the follow-up'),
  'decide the follow-up': link('build the Zoho updates', 'unsubscribes for Smartlead', 'compose the team alert'),
  'build the Zoho updates': link('writing to Zoho?'),
  'writing to Zoho?': branch(['Zoho - get an access token'], ['STOP: preview - Zoho updates shown']),
  'Zoho - get an access token': link('read the access token'),
  'read the access token': link('authenticated?'),
  'authenticated?': branch(['Zoho CRM - update the leads'], ['STOP: could not authenticate with Zoho']),
  'Zoho CRM - update the leads': branch(['build the tasks'], ['STOP: Zoho rejected the write']),
  'build the tasks': link('tasks to create?'),
  'tasks to create?': branch(['Zoho CRM - create the tasks'], ['STOP: Zoho updated']),
  'Zoho CRM - create the tasks': branch(['STOP: Zoho updated'], ['STOP: Zoho rejected the write']),
  'unsubscribes for Smartlead': link('suppressing in Smartlead?'),
  'suppressing in Smartlead?': branch(['Smartlead - unsubscribe the lead'], ['STOP: preview - unsubscribe not sent']),
  'Smartlead - unsubscribe the lead': link('STOP: unsubscribed in Smartlead'),
  'compose the team alert': link('alerting the team?'),
  'alerting the team?': branch(['Notify - post the team alert'], ['STOP: preview - alert not posted']),
  'Notify - post the team alert': link('STOP: alert posted'),
  'Zoho connected for the call list?': branch(['Zoho - get a token for the call list'], ['use the demo pipeline']),
  'Zoho - get a token for the call list': link('build the call list query'),
  'build the call list query': link('authenticated for the call list?'),
  'authenticated for the call list?': branch(['Zoho CRM - read the call list'], ['STOP: call list could not authenticate']),
  'Zoho CRM - read the call list': branch(['read the leads'], ['STOP: could not read Zoho']),
  'read the leads': link('rank the call list'),
  'use the demo pipeline': link('rank the call list'),
  'rank the call list': link('posting the call list?'),
  'posting the call list?': branch(['Notify - post the call list'], ['STOP: preview - call list shown']),
  'Notify - post the call list': link('STOP: call list posted')
};
save('02-classify-replies-and-call-list.json', '02 Classify Smartlead replies into Zoho CRM tasks and build a daily call list', w2, c2);
