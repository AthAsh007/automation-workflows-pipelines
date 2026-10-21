// Builds both workflows, their -publish.json submission copies, the SUBMISSION-*.md pages,
// the sheet headers and the demo fixture export — from js/*.js and the specs below.
//   bun build/build.mjs
//
// The two workflows share a config node, a paginated Pipedrive read, the failed-read
// branch, the PHI check and the coverage rule, all generated from the same source files.
// A stage renamed in js/config.js changes both workflows, which is the only way the guard
// and the report can be guaranteed to mean the same thing by "Referral Partner".
//
// `/* @include <file> */` inside a js/ file is replaced by that file at build time, so the
// business-day calendar is one source, inlined into every node that counts days.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const CFG = "$('config').first().json";

// ---------------------------------------------------------------- provenance
// Working files name the client and the job; -publish.json files must not (GUIDELINES §10.6).
const CLIENT = 'Trialbridge';
const JOB_URL = 'https://example.com/jobs/~022093811915701331307/';
const DEIDENTIFY = [[CLIENT + "'s", "your company's"], [CLIENT, 'your company']];

export function js(name) {
  const src = fs.readFileSync(path.join(HERE, 'js', name), 'utf8').replace(/\r\n/g, '\n');
  return src.replace(/^[ \t]*\/\* @include ([\w.-]+) \*\/[ \t]*$/gm, (_, f) => js(f)).trimEnd();
}

// ---------------------------------------------------------------- node builders
// Parameter shapes are copied from workflows in this repo that n8n has already imported
// (house build.py, library/_kit/n.ts); HTTP pagination is n8n's own httpRequest v4.2 schema.
function id(name) {
  let h = 2166136261;
  for (const ch of name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h), b = hex(Math.imul(h, 2654435761)), d = hex(Math.imul(h ^ 0x5bd1e995, 40503));
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${d.slice(1, 4)}-${d}${a.slice(0, 4)}`;
}
const node = (name, type, typeVersion, position, parameters, extra = {}) =>
  ({ parameters, id: id(name), name, type, typeVersion, position, ...extra });

const code = (name, pos, file, extra) =>
  node(name, 'n8n-nodes-base.code', 2, pos, { jsCode: js(file) }, extra);
const noop = (name, pos) => node(name, 'n8n-nodes-base.noOp', 1, pos, {});
const ifExpr = (name, pos, left) => node(name, 'n8n-nodes-base.if', 2.2, pos, {
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: id(name + '-c'), leftValue: left, rightValue: 'true',
      operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and'
  },
  looseTypeValidation: true, options: {}
});
// Rejoins the two halves of an IF into one run. Without it the next node sees only the
// branch that happened to fire and reports half a run as a whole one.
const merge = (name, pos) => node(name, 'n8n-nodes-base.merge', 3, pos,
  { mode: 'append', numberInputs: 2 });

const PIPEDRIVE_PAGES = {
  pagination: {
    pagination: {
      paginationMode: 'updateAParameterInEachRequest',
      parameters: { parameters: [{ type: 'qs', name: 'start',
        value: '={{ $response.body.additional_data.pagination.next_start }}' }] },
      paginationCompleteWhen: 'other',
      completeExpression: '={{ !($response.body.additional_data && ' +
        '$response.body.additional_data.pagination && ' +
        '$response.body.additional_data.pagination.more_items_in_collection) }}',
      limitPagesFetched: true,
      maxRequests: `={{ ${CFG}.max_pages }}`,
      requestInterval: 250
    }
  }
};

function http(name, pos, method, url, o = {}) {
  const p = { method, url, options: { timeout: o.timeout || 30000, ...(o.paginate ? PIPEDRIVE_PAGES : {}) } };
  if (o.headers) {
    p.sendHeaders = true;
    p.headerParameters = { parameters: o.headers.map(([n, v]) => ({ name: n, value: v })) };
  }
  if (o.query) {
    p.sendQuery = true;
    p.queryParameters = { parameters: o.query.map(([n, v]) => ({ name: n, value: v })) };
  }
  if (o.body) { p.sendBody = true; p.specifyBody = 'json'; p.jsonBody = o.body; }
  // A call that rate-limits or times out must not end the run silently. 'read the pipeline'
  // turns a missing or partial answer into a named FAILED read, routed to its own alert.
  const extra = { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2,
    waitBetweenTries: 2000 };
  if (o.always) extra.alwaysOutputData = true;
  if (o.once) extra.executeOnce = true;
  if (o.notes) extra.notes = o.notes;
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, p, extra);
}

const rl = (value, mode = 'id') => ({ __rl: true, mode, value });
function sheetAppend(name, pos, tab, notes) {
  return node(name, 'n8n-nodes-base.googleSheets', 4.5, pos, {
    operation: 'append',
    documentId: rl(`={{ ${CFG}.sheet_id }}`),
    sheetName: rl(`={{ ${CFG}.${tab} }}`, 'name'),
    columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
    // RAW, not USER_ENTERED. Let Sheets reinterpret "not captured" or a date and the next
    // run reads back something it cannot compare against what it wrote.
    options: { cellFormat: 'RAW' }
  }, notes ? { notes } : {});
}
function sheetRead(name, pos, tab, notes) {
  return node(name, 'n8n-nodes-base.googleSheets', 4.5, pos, {
    documentId: rl(`={{ ${CFG}.sheet_id }}`),
    sheetName: rl(`={{ ${CFG}.${tab} }}`, 'name'),
    options: {}
  }, { alwaysOutputData: true, onError: 'continueRegularOutput', ...(notes ? { notes } : {}) });
}
const slackPost = (name, pos, channelJs, textJs, notes) =>
  node(name, 'n8n-nodes-base.slack', 2.2, pos, {
    select: 'channel', channelId: rl(`={{ ${channelJs} }}`), text: `={{ ${textJs} }}`,
    otherOptions: {}
  }, { onError: 'continueRegularOutput', ...(notes ? { notes } : {}) });

// ---------------------------------------------------------------- connections
const conn = {};
const link = (from, to, out = 0, input = 0) => {
  const c = (conn[from] = conn[from] || { main: [] });
  while (c.main.length <= out) c.main.push([]);
  c.main[out].push({ node: to, type: 'main', index: input });
};
const chain = (...names) => names.slice(1).forEach((n, i) => link(names[i], n));

// ---------------------------------------------------------------- stickies
// Section notes are white (color 7), under 50 words, stretched behind their nodes; the
// overview is yellow (color 1), left of everything. Geometry mirrors tools/restyle_stickies.mjs.
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
function stickies(nodes, overview, sections) {
  const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
  const out = sections.map((s, i) => {
    const members = s.nodes.map((n) => {
      if (!byName[n]) throw new Error('section "' + s.text.split('\n')[0] + '" names missing node ' + n);
      return byName[n];
    });
    const xs = members.map((n) => n.position[0]), ys = members.map((n) => n.position[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX + NODE_W + 2 * PAD, 300);
    const head = textHeight(s.text, w);
    return { name: 'Section ' + (i + 1), text: s.text, color: 7, members: s.nodes,
      x: minX - PAD, y: minY - head - 20, w, h: maxY - minY + NODE_H + PAD + head + 20 };
  });
  const left = Math.min(...nodes.map((n) => n.position[0]), ...out.map((b) => b.x));
  const top = Math.min(...nodes.map((n) => n.position[1]), ...out.map((b) => b.y));
  out.unshift({ name: 'Overview', text: overview, color: 1, members: [],
    x: left - GAP - MAIN_W, y: top, w: MAIN_W, h: textHeight(overview, MAIN_W) });
  return out.map((b) => ({
    parameters: { content: b.text, height: Math.round(b.h), width: Math.round(b.w), color: b.color },
    id: id('sticky ' + b.name + b.text.slice(0, 20)), name: b.name,
    type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [Math.round(b.x), Math.round(b.y)], _members: b.members
  }));
}

// ---------------------------------------------------------------- shared front half
// Lane y: 140 = the credentialed read, 300 = the main line, 460 = the fallback branch,
// 520-700 = the failed-read branch, in its own column band after the read.
const ACTIVITIES_SINCE = `={{ new Date(Date.now() - (${CFG}.reengage_after_days + 90) * 86400000)` +
  '.toISOString().slice(0,10) }}';

function frontHalf(scheduleName, cron) {
  const w = [];
  w.push(node('Run it now', 'n8n-nodes-base.manualTrigger', 1, [0, 200], {}));
  w.push(node(scheduleName, 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 400],
    { rule: { interval: [{ field: 'cronExpression', expression: cron }] } }));
  w.push(code('config', [240, 300], 'config.js'));
  w.push(ifExpr('Pipedrive configured?', [480, 300], `={{ ${CFG}.pipedrive_enabled }}`));

  w.push(http('[cred] Pipedrive - open deals', [720, 140], 'GET', `={{ ${CFG}.base_url }}/deals`, {
    query: [['api_token', `={{ ${CFG}.api_token }}`], ['status', 'open'], ['limit', '500']],
    paginate: true, always: true,
    notes: 'Pipedrive v1 GET /deals, every page: start = additional_data.pagination.next_start ' +
      'until more_items_in_collection is false, at most MAX_PAGES pages. One item per page.'
  }));
  w.push(http('[cred] Pipedrive - activities', [960, 140], 'GET', `={{ ${CFG}.base_url }}/activities`, {
    query: [['api_token', `={{ ${CFG}.api_token }}`], ['user_id', '0'],
      ['start_date', ACTIVITIES_SINCE], ['limit', '500']],
    paginate: true, always: true, once: true,
    notes: 'user_id=0 means every user. Execute Once: the deals node hands over one item per ' +
      'page, and this read must happen once, not once per page.'
  }));
  w.push(http('[cred] Pipedrive - deal fields', [1200, 140], 'GET', `={{ ${CFG}.base_url }}/dealFields`, {
    query: [['api_token', `={{ ${CFG}.api_token }}`], ['limit', '500']],
    always: true, once: true,
    notes: "Field NAMES, which is what the PHI check reads. A custom field's 40-character key " +
      'says nothing about what is in it.'
  }));
  w.push(code('read the pipeline', [1440, 140], 'read-the-pipeline.js'));
  w.push(code('STOP: demo pipeline', [960, 460], 'stop-demo-pipeline.js'));
  w.push(merge('one pipeline', [1680, 300]));
  w.push(ifExpr('read succeeded?', [1920, 300], '={{ $json.read_ok === true }}'));

  // A failed read is reported as a failure, never as a quiet day.
  w.push(code('build the read-failure alert', [2160, 600], 'build-the-read-failure-alert.js'));
  w.push(ifExpr('failure alert configured?', [2400, 600], `={{ ${CFG}.failure_alert_enabled }}`));
  w.push(http('Post the read-failure alert', [2640, 520], 'POST', `={{ ${CFG}.failure_url }}`, {
    headers: [['Content-Type', 'application/json']],
    body: '={{ JSON.stringify($json._failure_body) }}', timeout: 15000,
    notes: 'ALERT_WEBHOOK_URL, or MANAGER_WEBHOOK_URL if that is the only one set.'
  }));
  w.push(noop('STOP: no failure webhook', [2640, 700]));
  w.push(code('STOP: fail the run on a bad read', [2880, 600], 'stop-fail-the-run.js'));

  w.push(code('check the PHI boundary', [2160, 300], 'check-the-phi-boundary.js'));
  w.push(code('check every deal for a next activity', [2400, 300],
    'check-every-deal-for-a-next-activity.js'));
  return w;
}

function frontConnections(scheduleName) {
  link('Run it now', 'config');
  link(scheduleName, 'config');
  link('config', 'Pipedrive configured?');
  link('Pipedrive configured?', '[cred] Pipedrive - open deals', 0);
  link('Pipedrive configured?', 'STOP: demo pipeline', 1);
  chain('[cred] Pipedrive - open deals', '[cred] Pipedrive - activities',
    '[cred] Pipedrive - deal fields', 'read the pipeline', 'one pipeline');
  link('STOP: demo pipeline', 'one pipeline', 0, 1);
  link('one pipeline', 'read succeeded?');
  link('read succeeded?', 'check the PHI boundary', 0);
  link('read succeeded?', 'build the read-failure alert', 1);
  link('build the read-failure alert', 'failure alert configured?');
  link('failure alert configured?', 'Post the read-failure alert', 0);
  link('failure alert configured?', 'STOP: no failure webhook', 1);
  link('Post the read-failure alert', 'STOP: fail the run on a bad read');
  link('STOP: no failure webhook', 'STOP: fail the run on a bad read');
  link('check the PHI boundary', 'check every deal for a next activity');
}

const S_START = { nodes: ['Run it now', null, 'config', 'Pipedrive configured?'],
  text: '## 1. Start and settings\nWeekday schedule or the Run button. Every setting lives in `config`; no token means the demo pipeline.' };
const S_READ = { nodes: ['[cred] Pipedrive - open deals', '[cred] Pipedrive - activities',
  '[cred] Pipedrive - deal fields', 'read the pipeline', 'STOP: demo pipeline', 'one pipeline',
  'read succeeded?'],
  text: '## 2. Read every page\nOpen deals and activities, 500 a page until Pipedrive says there is no more. A partial read counts as a failed read.' };
const S_FAIL = { nodes: ['build the read-failure alert', 'failure alert configured?',
  'Post the read-failure alert', 'STOP: no failure webhook', 'STOP: fail the run on a bad read'],
  text: '## 3. If the read fails\nAlert with the call that failed, then fail the execution. A broken token never looks like a clean pipeline.' };

// ---------------------------------------------------------------- write helpers
function finish(nodes, overview, sections) {
  // The failed-read branch sits in its own column band right after the read, below the
  // main line, so every section is a contiguous x-range (the shape restyle_stickies.mjs
  // describes). Everything after it moves right to make room.
  for (const n of nodes) {
    if (n.position[0] >= 2160 && !S_FAIL.nodes.includes(n.name)) n.position[0] += 960;
  }
  const st = stickies(nodes, overview, sections);
  return { nodes: st.concat(nodes), stickyMeta: st };
}
function save(file, wf) {
  const clean = JSON.parse(JSON.stringify(wf, (k, v) => (k === '_members' ? undefined : v)));
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(clean, null, 2) + '\n');
}
function publishCopy(wf, title, overview, sections) {
  const nodes = JSON.parse(JSON.stringify(wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote')));
  for (const n of nodes) {
    if (n.parameters.jsCode) for (const [a, b] of DEIDENTIFY) n.parameters.jsCode = n.parameters.jsCode.split(a).join(b);
  }
  return { name: title, nodes: stickies(nodes, overview, sections).concat(nodes),
    connections: wf.connections, settings: { executionOrder: 'v1' },
    meta: { templateCredsSetupCompleted: true }, tags: [] };
}
function submissionMd(overview) {
  // The description page is generated from the canvas overview so the two cannot drift.
  return overview.replace(/^### (.*)$/gm, '**$1**').replace(/^## /m, '# ') + '\n';
}
function workingOverview(publishOverview, builtFor) {
  const parts = publishOverview.split('\n\n');
  parts.splice(2, 0, builtFor);
  return parts.join('\n\n');
}

// ===================================================================  01 ACTIVITY GUARD
function build01() {
  for (const k of Object.keys(conn)) delete conn[k];
  const SCHED = 'Every weekday, 07:00';
  const w = frontHalf(SCHED, '0 7 * * 1-5');

  w.push(ifExpr('anything to act on?', [2640, 300], '={{ $json._has_work }}'));
  w.push(code('STOP: every open deal is covered', [2640, 640], 'stop-every-deal-is-covered.js'));
  w.push(code('decide the next activity', [2880, 300], 'decide-the-next-activity.js'));
  w.push(ifExpr('creating this activity?', [3120, 300], '={{ $json._create }}'));
  w.push(http('[cred] Pipedrive - create the next activity', [3360, 140], 'POST',
    `={{ ${CFG}.base_url }}/activities?api_token={{ ${CFG}.api_token }}`, {
      headers: [['Content-Type', 'application/json']],
      body: '={{ JSON.stringify($json._body) }}',
      notes: "Pipedrive v1 POST /activities. The body — business-day, load-levelled due date " +
        "included — is built in 'decide the next activity' so it is readable without opening this node."
    }));
  w.push(code('record what was created', [3600, 140], 'record-what-was-created.js'));
  w.push(code('STOP: not created', [3360, 460], 'stop-not-created.js'));
  w.push(merge('what happened', [3840, 300]));
  w.push(code('build the run summary', [4080, 300], 'build-the-run-summary.js'));
  w.push(code('compare with earlier runs', [4320, 300], 'compare-with-earlier-runs.js'));

  w.push(ifExpr('alert configured?', [4560, 100], `={{ ${CFG}.alert_enabled }}`));
  w.push(http('Post the run summary', [4800, 20], 'POST', `={{ ${CFG}.alert_webhook_url }}`, {
    headers: [['Content-Type', 'application/json']],
    body: '={{ JSON.stringify($json._alert_body) }}', timeout: 15000,
    notes: 'Slack incoming webhook shape. Any endpoint that accepts JSON works.'
  }));
  w.push(noop('STOP: no alert webhook', [4800, 200]));
  w.push(ifExpr('escalations to send?', [4560, 380],
    `={{ $json._has_escalations && ${CFG}.manager_enabled }}`));
  w.push(code('build the escalation', [4800, 380], 'build-the-escalation.js'));
  w.push(http('Post the management escalation', [5040, 380], 'POST', `={{ ${CFG}.manager_url }}`, {
    headers: [['Content-Type', 'application/json']],
    body: '={{ JSON.stringify($json._escalation_body) }}', timeout: 15000,
    notes: 'MANAGER_WEBHOOK_URL if set, otherwise ALERT_WEBHOOK_URL. New and reminder deals only.'
  }));
  w.push(noop('STOP: nothing new to escalate', [4800, 540]));
  w.push(code('build one message per owner', [4560, 720], 'build-one-message-per-owner.js'));
  w.push(ifExpr('sending owner DMs?', [4800, 720],
    `={{ ${CFG}.slack_dm_enabled && !${CFG}.preview_only && $json.send_to !== '' }}`));
  w.push(slackPost('[cred] Slack - DM each owner', [5040, 660], '$json.send_to', '$json.text',
    'Slack chat.postMessage with a member id as the channel opens the bot DM with that rep. ' +
    'Bot scope: chat:write.'));
  w.push(noop('STOP: owner DMs not sent', [5040, 820]));
  w.push(noop('End', [5280, 380]));

  frontConnections(SCHED);
  link('check every deal for a next activity', 'anything to act on?');
  link('anything to act on?', 'decide the next activity', 0);
  link('anything to act on?', 'STOP: every open deal is covered', 1);
  link('STOP: every open deal is covered', 'build the run summary');
  link('decide the next activity', 'creating this activity?');
  link('creating this activity?', '[cred] Pipedrive - create the next activity', 0);
  link('creating this activity?', 'STOP: not created', 1);
  chain('[cred] Pipedrive - create the next activity', 'record what was created', 'what happened');
  link('STOP: not created', 'what happened', 0, 1);
  chain('what happened', 'build the run summary', 'compare with earlier runs');
  link('compare with earlier runs', 'alert configured?');
  link('compare with earlier runs', 'escalations to send?');
  link('compare with earlier runs', 'build one message per owner');
  link('alert configured?', 'Post the run summary', 0);
  link('alert configured?', 'STOP: no alert webhook', 1);
  link('escalations to send?', 'build the escalation', 0);
  link('escalations to send?', 'STOP: nothing new to escalate', 1);
  link('build the escalation', 'Post the management escalation');
  link('build one message per owner', 'sending owner DMs?');
  link('sending owner DMs?', '[cred] Slack - DM each owner', 0);
  link('sending owner DMs?', 'STOP: owner DMs not sent', 1);
  for (const n of ['Post the run summary', 'STOP: no alert webhook', 'Post the management escalation',
    'STOP: nothing new to escalate', '[cred] Slack - DM each owner', 'STOP: owner DMs not sent']) link(n, 'End');

  const sections = [
    { ...S_START, nodes: ['Run it now', SCHED, 'config', 'Pipedrive configured?'] },
    S_READ,
    S_FAIL,
    { nodes: ['check the PHI boundary', 'check every deal for a next activity', 'anything to act on?',
      'STOP: every open deal is covered'],
      text: '## 4. Check compliance and coverage\nMedical-looking fields are blocked first. Covered means an open activity due inside the horizon; overdue is counted in business days.' },
    { nodes: ['decide the next activity', 'creating this activity?',
      '[cred] Pipedrive - create the next activity', 'record what was created', 'STOP: not created', 'what happened'],
      text: '## 5. Decide and create\nStage rule, business-day due date, moved to a lighter day if the rep is full. Overdue deals escalate instead. Preview creates nothing.' },
    { nodes: ['build the run summary', 'compare with earlier runs'],
      text: '## 6. Remember\nCoverage trend and who the manager was already told, kept in workflow static data.' },
    { nodes: ['alert configured?', 'Post the run summary', 'STOP: no alert webhook', 'escalations to send?',
      'build the escalation', 'Post the management escalation', 'STOP: nothing new to escalate',
      'build one message per owner', 'sending owner DMs?', '[cred] Slack - DM each owner',
      'STOP: owner DMs not sent', 'End'],
      text: '## 7. Tell the team, the manager and each rep\nTeam summary, manager escalation (new or reminder only) and one Slack DM per rep. Blank settings skip a branch.' },
  ];

  const title = 'Schedule missing next activities for open Pipedrive deals with Slack escalation';
  const overview = `## ${title}

For sales and partnership teams who want one rule enforced in Pipedrive: no open deal without a next activity.

### How it works
1. Every weekday it reads all open deals and activities, page by page. A failed or cut-short read raises an alert and fails the run instead of passing as a clean day.
2. Fields named like patient or medical data are blocked before anything is read.
3. A deal counts as covered only by an open activity due within \`HORIZON_DAYS\`.
4. Uncovered deals get the activity their stage calls for, due in business days and moved to a lighter day when the rep is already full.
5. Overdue deals never get a second task: 3 business days late goes to the rep, 7 to the manager, who hears about each deal once plus a reminder if it stays open.
6. A team summary with the coverage trend, a manager escalation and one Slack DM per rep are sent.

### Setup
1. Run it as imported: a demo pipeline runs end to end and nothing is written.
2. In \`config\` set \`COMPANY_DOMAIN\`, \`API_TOKEN\` and the stage map.
3. Add Slack webhook URLs; for rep DMs add a Slack credential, \`SLACK_DMS\` and \`OWNER_SLACK_IDS\`.
4. Set \`TEST_OWNER_ID\` to test on one user, then \`TEST_RUN = false\` to go live.

### Requirements
A Pipedrive API token. Slack is optional; a blank setting skips that branch.

### How to customize
Stage rules, escalation tiers, \`HOLIDAYS\`, \`MAX_PER_OWNER_PER_DAY\` and \`DAILY_CAP\` are all in \`config\`.`;

  return { file: '01-activity-guard', title, overview, sections, nodes: w,
    tags: ['pipedrive', 'crm', 'activity-guard'] };
}

// ===============================================================  02 RECRUITMENT REPORTING
function build02() {
  for (const k of Object.keys(conn)) delete conn[k];
  const SCHED = 'Every Monday, 08:00';
  const w = frontHalf(SCHED, '0 8 * * 1');

  w.push(code('compute the KPIs', [2640, 300], 'compute-the-kpis.js'));
  w.push(ifExpr('sheet in use?', [2880, 300], `={{ ${CFG}.sheet_live }}`));
  w.push(sheetRead('[cred] Sheets - read the dashboard history', [3120, 140], 'dashboard_tab',
    'Reads the Dashboard tab back. Its own history is the trend; last week is a row in it.'));
  w.push(code("pick last week's row", [3360, 140], 'pick-last-weeks-row.js'));
  w.push(code('STOP: no sheet history', [3120, 460], 'stop-no-sheet-history.js'));
  w.push(merge('one baseline', [3600, 300]));
  w.push(code('compare with last week', [3840, 300], 'compare-with-last-week.js'));

  w.push(ifExpr('writing the dashboard?', [4080, 300], `={{ ${CFG}.sheet_live }}`));
  w.push(code('rows for the dashboard', [4320, 140], 'rows-for-the-dashboard.js'));
  w.push(sheetAppend('[cred] Sheets - append the dashboard row', [4560, 140], 'dashboard_tab',
    "One row per run. The tab's own history is the trend, and next week's baseline."));
  w.push(code('rows for the gaps tab', [4800, 140], 'rows-for-the-gaps-tab.js'));
  w.push(sheetAppend('[cred] Sheets - write the gaps', [5040, 140], 'gaps_tab',
    "'Active deals without future activities'. Written on every run, including clean ones — an " +
    'empty tab written today is a result; one never written is a broken workflow.'));
  w.push(code('rows for the by rep tab', [5280, 140], 'rows-for-the-by-rep-tab.js'));
  w.push(sheetAppend('[cred] Sheets - write by rep', [5520, 140], 'by_rep_tab'));
  w.push(code('rows for the by practice tab', [5760, 140], 'rows-for-the-by-practice-tab.js'));
  w.push(sheetAppend('[cred] Sheets - write by practice', [6000, 140], 'by_practice_tab',
    'Aggregate counts only. This tab is why the PHI check upstream exists.'));
  w.push(code('STOP: no sheet', [4320, 460], 'stop-no-sheet.js'));
  w.push(merge('reported', [6240, 300]));
  w.push(code('build the management report', [6480, 300], 'build-the-management-report.js'));
  w.push(ifExpr('report webhook configured?', [6720, 300], `={{ ${CFG}.manager_enabled }}`));
  w.push(http('Post the management report', [6960, 140], 'POST', `={{ ${CFG}.manager_url }}`, {
    headers: [['Content-Type', 'application/json']],
    body: '={{ JSON.stringify($json._report_body) }}', timeout: 15000,
    notes: 'MANAGER_WEBHOOK_URL if set, otherwise ALERT_WEBHOOK_URL.'
  }));
  w.push(noop('STOP: no report webhook', [6960, 460]));
  w.push(noop('End', [7200, 300]));

  frontConnections(SCHED);
  chain('check every deal for a next activity', 'compute the KPIs', 'sheet in use?');
  link('sheet in use?', '[cred] Sheets - read the dashboard history', 0);
  link('sheet in use?', 'STOP: no sheet history', 1);
  chain('[cred] Sheets - read the dashboard history', "pick last week's row", 'one baseline');
  link('STOP: no sheet history', 'one baseline', 0, 1);
  chain('one baseline', 'compare with last week', 'writing the dashboard?');
  link('writing the dashboard?', 'rows for the dashboard', 0);
  link('writing the dashboard?', 'STOP: no sheet', 1);
  chain('rows for the dashboard', '[cred] Sheets - append the dashboard row', 'rows for the gaps tab',
    '[cred] Sheets - write the gaps', 'rows for the by rep tab', '[cred] Sheets - write by rep',
    'rows for the by practice tab', '[cred] Sheets - write by practice', 'reported');
  link('STOP: no sheet', 'reported', 0, 1);
  chain('reported', 'build the management report', 'report webhook configured?');
  link('report webhook configured?', 'Post the management report', 0);
  link('report webhook configured?', 'STOP: no report webhook', 1);
  link('Post the management report', 'End');
  link('STOP: no report webhook', 'End');

  const sections = [
    { ...S_START, nodes: ['Run it now', SCHED, 'config', 'Pipedrive configured?'],
      text: S_START.text.replace('Weekday schedule', 'Monday schedule') },
    S_READ,
    S_FAIL,
    { nodes: ['check the PHI boundary', 'check every deal for a next activity', 'compute the KPIs'],
      text: '## 4. Check and compute the funnel\nMedical-looking fields blocked, the guard\'s coverage rule applied, funnel KPIs computed.' },
    { nodes: ['sheet in use?', '[cred] Sheets - read the dashboard history', "pick last week's row",
      'STOP: no sheet history', 'one baseline', 'compare with last week'],
      text: '## 5. Compare with last week\nLast week\'s Dashboard row is read back for week-over-week changes. Reps are flagged for coaching.' },
    { nodes: ['writing the dashboard?', 'rows for the dashboard', '[cred] Sheets - append the dashboard row',
      'rows for the gaps tab', '[cred] Sheets - write the gaps', 'rows for the by rep tab',
      '[cred] Sheets - write by rep', 'rows for the by practice tab', '[cred] Sheets - write by practice',
      'STOP: no sheet', 'reported'],
      text: '## 6. Write the four tabs\nDashboard, gaps, by rep and by practice. Unmapped fields read "not captured", never 0. Demo numbers are never written.' },
    { nodes: ['build the management report', 'report webhook configured?', 'Post the management report',
      'STOP: no report webhook', 'End'],
      text: '## 7. Send the digest\nCoverage, funnel, week-over-week and coaching flags in one Slack message. A blank webhook skips it.' },
  ];

  const title = 'Report a weekly Pipedrive referral funnel to Google Sheets with trends';
  const overview = `## ${title}

For managers of a referral or partnership pipeline in Pipedrive who need a weekly funnel that Insights cannot build.

### How it works
1. Every Monday it reads every page of open deals, activities and deal fields. A failed read alerts and fails the run.
2. Medical-looking fields are blocked, and coverage uses the same definition as the companion activity guard.
3. The funnel is computed: attempts, conversations, meetings, partners, referrals, screened, enrolled.
4. Last week's row is read back from the Dashboard tab, so every headline number shows its week-over-week change.
5. Reps are flagged for coaching: many attempts but few conversations, or too many deals without a next step.
6. Four tabs are written and a digest is posted to Slack. Unmapped fields read **not captured**, never 0.

### Setup
1. Run it as imported: a demo pipeline and a sample last-week row produce the full digest, and nothing is written.
2. In \`config\` set \`COMPANY_DOMAIN\`, \`API_TOKEN\` and \`RESULT_FIELDS\`.
3. Create a Google Sheet with the four tabs, put its id in \`SHEET_ID\` and add a Google Sheets credential.
4. Add a Slack webhook URL for the digest.

### Requirements
A Pipedrive API token and a Google Sheet. Slack is optional.

### How to customize
\`REPORT_WINDOW_DAYS\`, the \`COACH_*\` thresholds and the funnel field map are in \`config\`.`;

  return { file: '02-recruitment-reporting', title, overview, sections, nodes: w,
    tags: ['pipedrive', 'crm', 'reporting'] };
}

// ---------------------------------------------------------------- main
const builtFor = (n) => `**Built for:** ${CLIENT}, clinical-trial recruitment, physician referral ` +
  `network — workflow ${n} of 2. The job: ${JOB_URL}`;

for (const [b, n] of [[build01, 1], [build02, 2]]) {
  const spec = b();
  const connections = JSON.parse(JSON.stringify(conn));
  const working = finish(spec.nodes, workingOverview(spec.overview, builtFor(n)), spec.sections);
  const wf = { name: spec.file, nodes: working.nodes, connections,
    settings: { executionOrder: 'v1' }, pinData: {},
    meta: { templateCredsSetupCompleted: false }, tags: spec.tags };
  save(spec.file + '.json', wf);
  save(spec.file + '-publish.json', publishCopy(wf, spec.title, spec.overview, spec.sections));
  fs.writeFileSync(path.join(OUT, 'SUBMISSION-' + spec.file + '.md'), submissionMd(spec.overview));
  const count = spec.nodes.length;
  console.log(`wrote ${spec.file}.json + -publish.json + SUBMISSION (${count} nodes, overview ${words(spec.overview)} words)`);
}

// ===================================================================  THE SHEET
// Generated from the config node's column names, so the tabs and the workflows can never
// disagree about a heading.
const c = new Function(js('config.js'))()[0].json;
const ORDER = {
  'Dashboard.csv': [c.dashboard_columns, ['run_at', 'open_deals', 'covered', 'gaps', 'coverage_pct',
    'overdue', 'outreach_attempts', 'conversations', 'meetings', 'new_partners', 'active_partners',
    'referrals_sent', 'prescreen_qualified', 'sent_to_site', 'screened', 'randomized',
    'referral_to_screen', 'screen_to_random', 'stalled', 'high_priority']],
  'Gaps.csv': [c.gap_columns, ['deal_id', 'deal', 'organisation', 'person', 'stage', 'owner',
    'value', 'last_activity', 'days_quiet', 'action', 'run_at']],
  'By rep.csv': [c.by_rep_columns, ['rep', 'open_deals', 'gaps', 'overdue', 'outreach_attempts',
    'conversations', 'meetings', 'new_partners', 'referrals_sent', 'run_at']],
  'By practice.csv': [c.by_practice_columns, ['organisation', 'stage', 'owner', 'referrals_sent',
    'prescreen_qualified', 'sent_to_site', 'screened', 'randomized', 'last_referral', 'run_at']]
};
const csvCell = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const writeCsv = (name, rows) => fs.writeFileSync(path.join(OUT, 'sheet', name),
  '﻿' + rows.map((r) => r.map((x) => csvCell(String(x))).join(',')).join('\r\n') + '\r\n');
fs.mkdirSync(path.join(OUT, 'sheet'), { recursive: true });
for (const [file, [cols, order]] of Object.entries(ORDER)) writeCsv(file, [order.map((k) => cols[k])]);
const stages = c.stages.map((s) => s.name), types = Object.values(c.activity_types);
const lists = [['Stage', 'Activity type']];
for (let i = 0; i < Math.max(stages.length, types.length); i++) lists.push([stages[i] || '', types[i] || '']);
writeCsv('Lists.csv', lists);
console.log('wrote sheet/*.csv');

// ===================================================================  THE FIXTURE
// The demo pipeline, exported so it can be read without running anything.
const demo = new Function('$', js('stop-demo-pipeline.js'))(() => ({ first: () => ({ json: c }) }))[0].json;
fs.mkdirSync(path.join(OUT, 'sample'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'sample', 'demo-pipeline.json'), JSON.stringify(demo, null, 2) + '\n');
console.log(`wrote sample/demo-pipeline.json (${demo.deals.length} deals, ${demo.activities.length} activities)`);
