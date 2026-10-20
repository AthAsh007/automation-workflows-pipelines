// Runs both workflows' Code nodes against the sample payloads, the demo leads, the demo
// pipeline and a GoHighLevel-shaped response, so the logic can be checked before anything is
// imported into n8n.
//   bun simulate.js   (or node simulate.js)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const FILES = ['01-intake-and-routing.json', '02-follow-up-sequence.json'];
const WF = {};
for (const f of FILES) {
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '..', f), 'utf8'));
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') WF[n.name] = n;
}
const sample = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'sample', f), 'utf8'));

const store = {};
const applyExecuteOnce = (name, items) =>
  WF[name].executeOnce === true ? items.slice(0, 1) : items;

function run(nodeName, inputItems, prevNodeName) {
  const node = WF[nodeName];
  if (!node) throw new Error('no Code node named ' + nodeName);
  const items = applyExecuteOnce(nodeName, inputItems);
  const wrap = (arr) => arr.map((j) => ({ json: j }));
  const $input = { all: () => wrap(items), first: () => ({ json: items[0] }),
                   last: () => ({ json: items[items.length - 1] }) };
  const $ = (name) => {
    const arr = store[name];
    if (!arr) throw new Error('simulate: node "' + name + '" has no recorded output');
    return { all: () => wrap(arr), first: () => ({ json: arr[0] }),
             last: () => ({ json: arr[arr.length - 1] }) };
  };
  const $prevNode = { name: prevNodeName || '' };
  const out = new Function('$input', '$', '$prevNode', '"use strict";' + node.parameters.jsCode)($input, $, $prevNode);
  store[nodeName] = out.map((o) => o.json);
  return store[nodeName];
}

let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(46) + got);
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

const cfg = run('config', [{}])[0];
console.log('config: mode ' + cfg.mode + ', ghl_enabled ' + cfg.ghl_enabled +
  ', ' + cfg.routing_rules.length + ' routing rules, ' + cfg.sequence.length + ' touches\n');

// ================================================================= 1 — intake and routing
function intake(payload) {
  const c = run('config', [payload]);
  const lead = run('read the lead', c)[0];
  if (!lead._ok) {
    return { lead, rejected: run('STOP: not a usable lead', [lead])[0] };
  }
  const routed = run('route the lead', [lead])[0];
  const payloadItem = run('build the GoHighLevel payload', [routed])[0];
  const shown = run('STOP: GoHighLevel not configured - payload shown', [payloadItem])[0];
  return { lead, routed, payloadItem, shown };
}

console.log('--- 01: a website form ---');
const site = intake(sample('website-form.json'));
expect('source detected', site.lead.source, 'website');
expect('name read', site.lead.name, 'Rachel Okonkwo');
expect('email lowercased', site.lead.email, 'r.okonkwo@brightpath-dental.example');
expect('wants read as a rule', site.lead.wants, 'quote');
expect('routed by the quote rule', site.routed.owner, 'Ben');
expect('filed at the stage', site.routed.stage, 'Quote requested');
expect('tags carry the rule', site.routed.tags.join(','), 'automation-intake,quote');
expect('payload is the upsert endpoint',
  site.payloadItem._ghl.contact.url, 'https://services.leadconnectorhq.com/contacts/upsert');
expect('payload carries the email', site.payloadItem._ghl.contact.body.email, site.lead.email);
expect('preview stop shows the body', !!site.shown.would_post, 'true');

console.log('\n--- 01: a forwarded email ---');
const mail = intake(sample('forwarded-email.json'));
expect('source detected', mail.lead.source, 'email');
expect('name off the from line', mail.lead.name, 'Tom Beasley');
expect('wants read as support', mail.lead.wants, 'support');
expect('routed by the support rule', mail.routed.owner, 'Cara');
expect('filed at the stage', mail.routed.stage, 'Support');

console.log('\n--- 01: a phone note ---');
const call = intake(sample('phone-note.json'));
expect('source detected', call.lead.source, 'phone');
expect('number read', call.lead.phone, '07700 900456');
expect('routed by the source rule', call.routed.owner, 'Ben');
expect('contact_key falls back to the number', call.lead.contact_key, '07700900456');

console.log('\n--- 01: the gates ---');
const spam = intake(sample('spam.json'));
expect('a bot is rejected', spam.lead._ok, 'false');
expect('with both reasons', spam.rejected._reason.includes('honeypot'), 'true');
const unreachable = intake({ 'your-name': 'Someone', 'your-message': 'Ring the office please.' });
expect('no way to reach them is rejected', unreachable.lead._ok, 'false');
expect('for the right reason',
  unreachable.rejected._reason.includes('no email address and no phone number'), 'true');

console.log('\n--- 01: the demo trigger ---');
const demoItems = run('load a demo lead', [{}]);
const demoLeads = run('read the lead', run('config', demoItems));
expect('three demo leads', demoLeads.length, 3);
expect('one per source', demoLeads.map((l) => l.source).join(','), 'website,email,phone');
const demoRouted = run('route the lead', demoLeads);
expect('routed to three owners/stages',
  demoRouted.map((r) => r.owner + '/' + r.stage).join(' | '),
  'Ben/Quote requested | Cara/Support | Ben/New lead');

// ================================================================= 2 — follow-up sequence
// The demo run, walked node by node the way n8n would: the plan, then the loop over the due
// leads (window and channel, conversation check, compose, guardrails, preview), then the report.
console.log('\n--- 02: the demo pipeline, one run ---');
const pipeRows = run('use the demo pipeline', [{}]);
expect('demo pipeline rows', pipeRows.length, 12);
expect('demo timestamps are ISO', /Z$/.test(pipeRows[0].last_touch), 'true');

const mapped = run('read the pipeline', pipeRows)[0];
expect('mapped into the row shape', mapped.rows.length, 12);
expect('named as the demo source', mapped._from, 'the demo pipeline');
expect('no paging to report', mapped.more_pages, 'false');

const plan = run('plan the sequence', [mapped])[0];
expect('rows read', plan.rows_read, 12);
expect('eight due', plan.due_count, 8);
expect('one waiting (not due yet)', plan.waiting.map((w) => w.name + ':' + w.reason_key).join(','), 'Ravi Menon:not due yet');
expect('three stopped by the plan', plan.stopped.map((s) => s.reason_key).sort().join(','), 'finished,left the sequence,replied');
expect('the due list and touches',
  plan.due.map((d) => d.name.split(' ')[0] + ':' + d.touch).join(' '),
  'Rachel:1 Tom:2 Marcus:3 Lee:1 Priya:1 Owen:2 Sofia:2 Sam:1');
expect('touch 3 is flagged final', plan.due.filter((d) => d.is_final).map((d) => d.name).join(','), 'Marcus Hale');
expect('waiting says how long is left',
  /not due yet — touch 1 in \d+ h/.test(plan.waiting[0].reason), 'true');
expect('the board still counts every stage',
  Object.keys(plan.board).sort().join(','), 'New lead,Quote requested,Support,Won');

const items = run('split the due leads', [plan]);
expect('one item per due lead', items.length, 8);

// ---- the loop body, per lead
const cfgNow = store['config'][0];
const outcomes = [];
const perLead = {};
for (const item of items) {
  const win = run('check the sending window and channel', [item])[0];
  let rec;
  if (win._gate !== 'go') {
    rec = run('record the lead outcome', [win])[0];
  } else {
    // read the conversation live? -> false in the demo, so the lead goes straight to the check
    const chk = run('check replies and opt-outs', [win])[0];
    if (chk._verdict === 'send') {
      const composed = run('compose the next touch', [chk])[0];
      // AI writer configured? -> false: the guardrail node gets the compose item itself
      const fin = run('apply the guardrails', [composed])[0];
      // sending switched on? -> false
      const prev = run('keep the touch as a preview', [fin])[0];
      perLead[win.name] = { win, chk, composed, fin, prev };
      rec = run('record the lead outcome', [prev])[0];
    } else {
      // write the stop to GoHighLevel? -> false
      perLead[win.name] = { win, chk };
      rec = run('record the lead outcome', [chk])[0];
    }
  }
  if (!perLead[win.name]) perLead[win.name] = { win };
  outcomes.push(rec);
}
const oc = (name) => outcomes.filter((o) => o.name === name)[0] || {};
expect('Rachel: touch 1 previewed by email', oc('Rachel Okonkwo').outcome + ':' + oc('Rachel Okonkwo').channel, 'previewed:email');
expect('Tom: touch 2 previewed by email', oc('Tom Beasley').outcome + ':' + oc('Tom Beasley').touch, 'previewed:2');
expect('Marcus: the final touch, by SMS', oc('Marcus Hale').outcome + ':' + oc('Marcus Hale').channel, 'previewed:sms');
expect('  and it lists the task and the nurture move',
  oc('Marcus Hale').would_write.filter((w) => /task for Ben|nurture move skipped/.test(w)).length, 2);
expect('Lee: email touch falls back to SMS', oc('Lee Carter').channel + ' / ' + perLead['Lee Carter'].win.channel_note,
  'sms / no email address, so SMS instead');
expect('Priya: waiting, quiet hours', oc('Priya Shah').outcome + ':' + oc('Priya Shah').reason_key, 'waiting:quiet hours');
expect('Owen: replied in the conversation', oc('Owen Gallagher').outcome + ':' + oc('Owen Gallagher').reason_key, 'stopped:replied');
expect('  with a task prepared for the owner', perLead['Owen Gallagher'].chk._stop_writes.task.title.startsWith('Reply from Owen'), 'true');
expect('Sofia: opted out (STOP)', oc('Sofia Marin').outcome + ':' + oc('Sofia Marin').reason_key, 'stopped:opted out');
expect('  with the do-not-contact tag prepared', perLead['Sofia Marin'].chk._stop_writes.tags.tags.join(','), 'do-not-contact');
expect('Sam: unreachable', oc('Sam Doyle').outcome + ':' + oc('Sam Doyle').reason_key, 'stopped:unreachable');
expect('stops in preview are shown, not written', oc('Owen Gallagher').stop_write, 'preview, not written');

const rachel = perLead['Rachel Okonkwo'].fin;
expect('template text when the AI is not configured', rachel.text_source + ' / ' + rachel.fallback_reason, 'template / AI not configured');
expect('written to the person', rachel.body.startsWith('Hi Rachel,'), 'true');
expect('carrying the sequence subject', rachel.subject, 'Quick check-in on your enquiry');
expect('the send request is built', rachel._ghl.url, 'https://services.leadconnectorhq.com/conversations/messages');
expect('as an Email to the contact', rachel._ghl.body.type + ':' + rachel._ghl.body.contactId, 'Email:demo-1001');
expect('the write-back tags', rachel._writeback.tags.tags.join(','), 'sequence-touch-1,follow-up-sequence');
const marcus = perLead['Marcus Hale'].fin;
expect('a template SMS ends with the opt-out line', marcus.body.endsWith('Reply STOP to opt out'), 'true');
expect('an SMS carries no subject', marcus.subject + '|' + marcus._ghl.body.type, '|SMS');
expect('the AI request carries the lead context',
  JSON.parse(perLead['Marcus Hale'].composed._ai_request.messages[1].content).service_wanted, 'quote');

// ---- the report
const report = run('build the run report', outcomes)[0];
expect('report: previewed', report.previewed, 4);
expect('report: sent (preview mode)', report.sent, 0);
expect('report: waiting (plan + quiet hours)', report.waiting, 2);
expect('report: stopped (plan + loop)', report.stopped, 6);
expect('report: stopped by reason',
  Object.keys(report.stopped_by_reason).sort().map((k) => k + ' ' + report.stopped_by_reason[k]).join(', '),
  'finished 1, left the sequence 1, opted out 1, replied 2, unreachable 1');
expect('report: failed', report.failed, 0);
expect('report: AI vs template', report.ai_written + '/' + report.template_written, '0/4');
expect('report: Slack body by default', Object.keys(report._webhook_body).join(','), 'text');
const fin = run('STOP: run finished', [report])[0];
expect('the run ends on a report', fin.summary.split('\n')[0], 'Follow-up sequence run (preview, nothing sent) from the demo pipeline');
console.log('\n' + report.summary.split('\n').map((l) => '      | ' + l).join('\n'));

const quiet = run('STOP: nothing due today', [Object.assign({}, plan, { due: [], due_count: 0 })])[0];
expect('a quiet day still reports', quiet.waiting.length, 1);

// ---------------------------------------------------------------- the AI writer and the guardrails
console.log('\n--- 02: the AI writer and the guardrails ---');
const ai = (content) => ({ choices: [{ message: { content: content } }] });
store['compose the next touch'] = [perLead['Rachel Okonkwo'].composed];
const good = run('apply the guardrails', [ai(JSON.stringify({ subject: 'Your booking system enquiry',
  body: 'Hi Rachel,\n\nJust checking you saw our reply about the patient booking system. Happy to walk you through it whenever suits.' }))])[0];
expect('a clean AI email is used', good.text_source + ':' + good.subject, 'ai:Your booking system enquiry');
const pricey = run('apply the guardrails', [ai(JSON.stringify({ subject: 'Offer', body: 'Hi Rachel, we can do 20% off this week.' }))])[0];
expect('a price or discount falls back', pricey.text_source + ' / ' + /percentage/.test(pricey.fallback_reason), 'template / true');
expect('  and the rejected draft is kept for review', !!pricey.ai_draft_rejected, 'true');
const longOne = run('apply the guardrails', [ai(JSON.stringify({ subject: 'Hi', body: 'Hi Rachel, ' + 'very long '.repeat(120) }))])[0];
expect('an over-long email falls back', /longer than 900/.test(longOne.fallback_reason), 'true');
const promise = run('apply the guardrails', [ai(JSON.stringify({ subject: 'Hello', body: 'Hi Rachel, we guarantee a reply today.' }))])[0];
expect('a promise falls back', /banned words: guarantee/.test(promise.fallback_reason), 'true');
const junk = run('apply the guardrails', [ai('Sure! Here is a message for Rachel.')])[0];
expect('an unreadable reply falls back', junk.fallback_reason, 'AI reply unreadable');
const down = run('apply the guardrails', [{ error: { message: '429 Too Many Requests' } }])[0];
expect('a failed AI call falls back', down.fallback_reason, 'AI call failed: 429 Too Many Requests');
store['compose the next touch'] = [perLead['Marcus Hale'].composed];
const smsNoLine = run('apply the guardrails', [ai(JSON.stringify({ subject: '', body: 'Hi Marcus, shall I keep your wardrobe quote open?' }))])[0];
expect('an AI SMS without the opt-out line falls back', smsNoLine.fallback_reason, 'guardrail: SMS missing the opt-out line');
const smsOk = run('apply the guardrails', [ai(JSON.stringify({ subject: '', body: 'Hi Marcus, shall I keep your wardrobe quote open, or close it off for now? Reply STOP to opt out' }))])[0];
expect('a clean AI SMS is used', smsOk.text_source, 'ai');

// ---------------------------------------------------------------- the live paths, with fake responses
console.log('\n--- 02: live responses (faked) ---');
store['check the sending window and channel'] = [Object.assign({}, perLead['Rachel Okonkwo'].win, { _demo: false,
  last_touch: '2026-01-10T09:00:00Z' })];
const liveChk = run('check replies and opt-outs', [{ messages: { messages: [
  { direction: 'outbound', body: 'Quick check-in', dateAdded: '2026-01-10T09:00:00Z' },
  { direction: 'inbound', body: 'Please unsubscribe me', dateAdded: '2026-01-11T09:00:00Z' }] } }])[0];
expect('a GoHighLevel opt-out phrase is caught', liveChk._verdict, 'opted_out');
const liveReply = run('check replies and opt-outs', [{ messages: { messages: [
  { direction: 'inbound', body: 'Yes please, call me', dateAdded: '2026-01-11T09:00:00Z' }] } }])[0];
expect('a GoHighLevel reply after the last touch is caught', liveReply._verdict + ' -> ' + (liveReply._stop_writes.task.assignedTo || 'unassigned (no OWNERS user_id)'),
  'replied -> unassigned (no OWNERS user_id)');
const noConv = run('check replies and opt-outs', [{ conversations: [], total: 0 }])[0];
expect('no conversation yet means send', noConv._verdict + ':' + noConv.conversation_read_from, 'send:no conversation yet');
const oldReply = run('check replies and opt-outs', [{ messages: [
  { direction: 'inbound', body: 'Original enquiry', dateAdded: '2026-01-01T09:00:00Z' }] }])[0];
expect('an inbound before the last touch is not a reply', oldReply._verdict, 'send');

store['apply the guardrails'] = [perLead['Marcus Hale'].fin];
store['[cred] GoHighLevel - send the touch'] = [{ messageId: 'msg-1' }];
store['[cred] GoHighLevel - update the sequence fields'] = [{ succeded: true }];
store['[cred] GoHighLevel - add the touch tags'] = [{ tags: ['sequence-touch-3'] }];
store['[cred] GoHighLevel - add a note'] = [{ error: { message: '401 Unauthorized' } }];
store['[cred] GoHighLevel - create the call task'] = [{ task: { id: 't1' } }];
const confirmed = run('confirm the write-back', [{ task: { id: 't1' } }])[0];
expect('a sent touch is confirmed', confirmed._outcome + ':' + confirmed.message_id, 'sent:msg-1');
expect('a failed write-back is listed', confirmed.write_back_errors.join(','), 'note: 401 Unauthorized');
expect('the nurture move is skipped without a stage id', confirmed.writes_done.join(','), 'sequence fields,tags,note,owner task');

store['check the sending window and channel'] = [perLead['Tom Beasley'].win];
const failure = run('record a lead failure', [{ error: { message: '429 rate limited' } }], '[cred] GoHighLevel - send the touch')[0];
expect('a refused call becomes a counted failure', failure.outcome + ' at ' + failure.failed_step, 'failed at [cred] GoHighLevel - send the touch');

store['check replies and opt-outs'] = [perLead['Owen Gallagher'].chk];
store['[cred] GoHighLevel - tag the stopped lead'] = [{ tags: ['sequence-replied'] }];
const stopRec = run('record the lead outcome', [{ task: { id: 't2' } }])[0];
expect('a written stop is recorded from the decision', stopRec.reason_key + ' / ' + stopRec.stop_write, 'replied / written');

const failedReport = run('build the run report', [failure, Object.assign({}, confirmed, { outcome: 'sent', name: 'Marcus Hale', text_source: 'template' })])[0];
expect('the report counts the failure and the write-back problem', failedReport.failed + '/' + failedReport.write_back_failed, '1/1');

// ---------------------------------------------------------------- the live read
console.log('\n--- 02: reading GoHighLevel instead ---');
store['config'] = [Object.assign({}, cfg, {
  stages: [{ stage: 'New lead', id: 'stage-new' }],
  seq_touches_field_id: 'cf-touches',
  seq_last_touch_field_id: 'cf-when',
  seq_last_reply_field_id: 'cf-reply',
  custom_fields: [{ name: 'Enquiry type', id: 'cf-wants', from: 'wants' }]
})];
const ghlRead = run('read the pipeline', [{
  opportunities: [
    { id: 'opp1', contactId: 'c1', pipelineStageId: 'stage-new', assignedTo: 'user-9',
      contact: { id: 'c1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '', timezone: 'America/New_York',
                 tags: ['vip'] },
      customFields: [{ id: 'cf-touches', value: '1' },
                     { id: 'cf-when', value: '2020-01-01 00:00' },
                     { id: 'cf-wants', value: 'quote' }] },
    { id: 'opp2', contactId: 'c2', pipelineStageId: 'stage-gone', assignedTo: 'user-9',
      contact: { id: 'c2', name: 'Grace Hopper', email: 'grace@example.com' },
      customFields: [] },
    { id: 'opp3', contactId: 'c3', pipelineStageId: 'stage-new', assignedTo: 'user-9',
      contact: { id: 'c3', name: 'Alan Turing', email: 'alan@example.com', tags: ['do-not-contact'] },
      customFields: [] }
  ],
  meta: { total: 250, nextPageUrl: 'https://services.leadconnectorhq.com/opportunities/search?page=2' }
}])[0];
expect('read as GoHighLevel', ghlRead._from, 'GoHighLevel');
expect('one row per opportunity', ghlRead.rows.length, 3);
expect('stage id turned back into a name', ghlRead.rows[0].stage, 'New lead');
expect('the counter comes from the custom field', ghlRead.rows[0].touches_sent, 1);
expect('the date comes from the custom field', ghlRead.rows[0].last_touch, '2020-01-01 00:00');
expect('the opportunity id and timezone come through', ghlRead.rows[0].opportunity_id + ' ' + ghlRead.rows[0].timezone, 'opp1 America/New_York');
expect('lead context from CUSTOM_FIELDS', ghlRead.rows[0].wants, 'quote');
expect('an unmapped stage reads as unknown', ghlRead.rows[1].stage, 'unknown');
expect('more pages is reported, not dropped', ghlRead.more_pages, 'true');
expect('and the total with it', ghlRead.total_available, 250);

const ghlPlan = run('plan the sequence', [ghlRead])[0];
expect('the long-quiet lead is due touch 2', ghlPlan.due.map((d) => d.name + ':' + d.touch).join(','), 'Ada Lovelace:2');
expect('the unmapped stage is stopped, not chased',
  ghlPlan.stopped.filter((s) => /left the sequence/.test(s.reason)).length, 1);
expect('a do-not-contact tag is never touched',
  ghlPlan.stopped.filter((s) => s.reason_key === 'opted out').map((s) => s.name).join(','), 'Alan Turing');
expect('the plan carries the paging flag up', ghlPlan.more_pages, 'true');
const liveWin = run('check the sending window and channel', [ghlPlan.due[0]])[0];
expect('a real timezone gives a real local time', /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:00$/.test(liveWin.local_time) + ' ' + liveWin.timezone_used, 'true America/New_York');
const badTz = run('check the sending window and channel', [Object.assign({}, ghlPlan.due[0], { timezone: 'Mars/Olympus' })])[0];
expect('an unknown timezone falls back to the default', badTz.timezone_used, cfg.default_timezone);
store['config'] = [cfg];

console.log('\n--- the write layer sends nothing itself ---');
expect('flow 1 payload node', Object.keys(WF['build the GoHighLevel payload'].parameters).join(','), 'jsCode');
expect('flow 2 compose node', Object.keys(WF['compose the next touch'].parameters).join(','), 'jsCode');
expect('flow 2 guardrail node', Object.keys(WF['apply the guardrails'].parameters).join(','), 'jsCode');

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'));
process.exitCode = failures ? 1 : 0;
