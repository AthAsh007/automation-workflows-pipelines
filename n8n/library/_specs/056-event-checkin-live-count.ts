import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, switchOn, respond, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'event-checkin-live-count',
  title: 'Check in event attendees by webhook and post live counts to Slack',
  summary: 'Takes ticket scans from any QR scanner app by webhook, matches the code against an attendee list in Google Sheets, answers the scanner with checked in, already checked in or not found, stamps the sheet and posts the running count to Slack every 25 check-ins.',
  category: 'Productivity and operations',
  description: {
    who: 'Organisers of meetups, workshops and small conferences who sell tickets anywhere and check people in with a phone. The door team gets an instant answer and the rest of the team sees the room fill up in Slack.',
    how: [
      'Your scanner app posts each scanned code to a webhook. Codes are compared without case, spaces or dashes, so "tix-0007" matches "TIX 0007".',
      'The code is looked up in the Attendees tab. Unknown codes get a 404, codes already used get a 409 with the time of the first scan, and valid ones a 200 with the name and ticket type.',
      'A valid check-in is stamped in the checked_in_at column.',
      'Every 25th check-in, and the moment everyone has arrived, Slack gets the count, the share of the list and the count per ticket type.',
    ],
    setup: [
      'Run it once as imported from `Run manually`. A sample scan becomes check-in 25 and the run stops at `STOP: preview - nothing posted` and `STOP: not live - sheet untouched`.',
      'Connect Google Sheets and set `ATTENDEES_SHEET_ID`. The tab needs ticket_code, name, ticket_type and checked_in_at columns.',
      'Point your scanner app at the production webhook URL with a JSON body like {"code": "TIX-0007", "gate": "Main"}. Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post milestones with a [TEST] prefix. Set `TEST_RUN = false` on the day so check-ins are written to the sheet.',
    ],
    requirements: ['A Google Sheet with the attendee list', 'A scanner app that can POST JSON', 'A Slack workspace'],
    customize: [
      '`MILESTONE_EVERY` sets how often Slack hears about the count.',
      '`CODE_PREFIX` is added to bare numbers, so a scan of "7" can match "TIX0007".',
      '`ALLOW_REENTRY` lets the same ticket in again and answers 200 with a warning.',
    ],
  },
  config: {
    intro: ['ATTENDEES_SHEET_ID blank -> a SAMPLE attendee list with 24 people already in.', 'The scanner always gets an answer; only a live run writes to the sheet.'],
    consts: [
      { name: 'ATTENDEES_SHEET_ID', value: '', note: 'Google Sheets id with an Attendees tab; blank uses the sample list' },
      { name: 'EVENT_NAME', value: 'Ops Meetup, November', note: 'shown in the Slack posts' },
      { name: 'MILESTONE_EVERY', value: 25, note: 'post the count to Slack every this many check-ins' },
      { name: 'CODE_PREFIX', value: 'TIX', note: 'prefix added to bare numeric codes; blank to turn off' },
      { name: 'CODE_DIGITS', value: 4, note: 'digits after the prefix, for padding bare numbers' },
      { name: 'ALLOW_REENTRY', value: false, note: 'true -> a second scan of the same ticket is let in with a warning' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for milestone posts; blank skips Slack' },
    ],
    flags: { sheet_enabled: "ATTENDEES_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Ticket scan webhook', 'event-checkin', { respond: 'node' }),
    code('Read the scan', `
// The webhook body when a scanner called; nothing when the run was started by hand.
let body = null;
try { body = $('Ticket scan webhook').first().json.body || null; } catch (e) { body = null; }
return [{ json: { from_webhook: Boolean(body), scan: body || {} } }];`),
    ifTrue('Real scan?', '$json.from_webhook'),
    code('Load sample scan', `
// Used for manual runs: a scanner reading a lower-case code with a dash.
return [{ json: { from_webhook: false, scan: { code: 'tix-0031', gate: 'Main door', scanned_at: new Date().toISOString() } } }];`),
    merge('Combine scan sources'),
    ifTrue('Attendee sheet set?', cfg('sheet_enabled')),
    sheets.read('Read the attendee list', cfg('attendees_sheet_id'), 'Attendees'),
    code('Load sample attendee list', `
// Used until ATTENDEES_SHEET_ID is set: 40 tickets, 24 already checked in.
const types = ['General', 'General', 'General', 'Speaker', 'Sponsor'];
const names = ['Alma Price', 'Ben Cho', 'Cora Diaz', 'Dev Patel', 'Eli Grant', 'Fay Moss', 'Gus Lind', 'Hana Ito'];
return Array.from({ length: 40 }, (_, i) => ({ json: {
  ticket_code: 'TIX-' + String(i + 1).padStart(4, '0'), name: names[i % names.length] + ' ' + (i + 1), ticket_type: types[i % types.length],
  checked_in_at: i < 24 ? new Date(Date.now() - (60 - i) * 60e3).toISOString() : '' } }));`),
    merge('Combine attendee sources'),
    code('Validate the ticket', `
// Codes compare uppercase with spaces and dashes removed. A ticket counts as used
// if the sheet has a checked_in_at or this workflow saw it earlier today (static
// data catches two scans seconds apart, before the sheet write lands).
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
store.checked = store.checked || {};
const norm = c => { let s = String(c || '').toUpperCase().replace(/[\\s-]/g, ''); if (/^\\d+$/.test(s) && cfg.code_prefix) s = cfg.code_prefix + s.padStart(cfg.code_digits, '0'); return s; };
const scan = $('Combine scan sources').first().json.scan;
const code = norm(scan.code);
const list = $input.all().map(i => i.json).filter(r => r.ticket_code);
const used = new Set([...list.filter(r => String(r.checked_in_at || '').trim()).map(r => norm(r.ticket_code)), ...Object.keys(store.checked)]);
const byType = t => list.filter(r => r.ticket_type === t).length;
if (!code) return [{ json: { result: 'invalid', message: 'No ticket code in the scan.' } }];
const att = list.find(r => norm(r.ticket_code) === code);
if (!att) return [{ json: { result: 'unknown', code, message: 'Ticket ' + code + ' is not on the list.' } }];
const firstAt = String(att.checked_in_at || '').trim() || store.checked[code];
if (used.has(code) && !cfg.allow_reentry) return [{ json: { result: 'duplicate', code, name: att.name, first_scan: firstAt, message: att.name + ' already checked in at ' + String(firstAt).slice(11, 16) + ' UTC.' } }];
const now = new Date().toISOString();
const reentry = used.has(code);
if (!reentry) { store.checked[code] = now; used.add(code); }
const count = used.size, total = list.length;
const inByType = {};
for (const r of list) if (used.has(norm(r.ticket_code))) inByType[r.ticket_type] = (inByType[r.ticket_type] || 0) + 1;
const milestone = !reentry && (count % cfg.milestone_every === 0 || count === total);
return [{ json: { result: 'ok', code, ticket_code: att.ticket_code, name: att.name, ticket_type: att.ticket_type, gate: scan.gate || '', checked_in_at: now,
  reentry, count, total, by_type: inByType, totals_by_type: Object.fromEntries([...new Set(list.map(r => r.ticket_type))].map(t => [t, byType(t)])), milestone,
  message: (reentry ? 'Re-entry: ' : 'Welcome, ') + att.name + ' (' + att.ticket_type + ')' } }];`),
    switchOn('Route the scan result', '$json.result', ['ok', 'duplicate', 'unknown']),
    respond('Answer: checked in', '({ status: "ok", name: $json.name, ticket_type: $json.ticket_type, count: $json.count, message: $json.message })'),
    respond('Answer: already checked in', '({ status: "duplicate", name: $json.name, first_scan: $json.first_scan, message: $json.message })', 409),
    respond('Answer: ticket not found', '({ status: "unknown", code: $json.code, message: $json.message })', 404),
    respond('Answer: bad scan', '({ status: "invalid", message: $json.message })', 400),
    ifWhen('Live with a sheet?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true'], ['$json.reentry', 'false']]),
    stop('STOP: not live - sheet untouched'),
    code('Keep only the sheet columns', `
// The update writes exactly two columns: the key and the time of entry.
return [{ json: { ticket_code: $json.ticket_code, checked_in_at: $json.checked_in_at } }];`),
    sheets.update('Stamp the check-in on the sheet', cfg('attendees_sheet_id'), 'Attendees', 'ticket_code'),
    code('Write the milestone post', `
// Count, share of the list and per ticket type. Only built on a milestone.
const cfg = $('config').first().json;
const v = $('Validate the ticket').first().json;
const pct = Math.round(v.count / v.total * 100);
const types = Object.entries(v.totals_by_type).map(([t, n]) => t + ' ' + (v.by_type[t] || 0) + '/' + n).join(', ');
const head = v.count === v.total ? 'Everyone is in' : v.count + ' checked in';
const text = (cfg.mode === 'test' ? '[TEST] ' : '') + '*' + cfg.event_name + ': ' + head + '* (' + v.count + '/' + v.total + ', ' + pct + '%)\\n' + types + '\\nLatest: ' + v.name + (v.gate ? ' at ' + v.gate : '');
return [{ json: { text, milestone: v.milestone } }];`),
    ifWhen('Milestone reached?', [['$json.milestone', 'true']]),
    stop('STOP: not a milestone'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the count to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Ticket scan webhook', 'config'],
    ['config', 'Read the scan'],
    ['Read the scan', 'Real scan?'],
    ['Real scan?', 0, 'Combine scan sources'], ['Real scan?', 1, 'Load sample scan'],
    ['Load sample scan', 0, 'Combine scan sources', 1],
    ['Combine scan sources', 'Attendee sheet set?'],
    ['Attendee sheet set?', 0, 'Read the attendee list'], ['Attendee sheet set?', 1, 'Load sample attendee list'],
    ['Read the attendee list', 'Combine attendee sources'], ['Load sample attendee list', 0, 'Combine attendee sources', 1],
    ['Combine attendee sources', 'Validate the ticket'],
    ['Validate the ticket', 'Route the scan result'],
    ['Route the scan result', 0, 'Answer: checked in'], ['Route the scan result', 1, 'Answer: already checked in'],
    ['Route the scan result', 2, 'Answer: ticket not found'], ['Route the scan result', 3, 'Answer: bad scan'],
    ['Answer: checked in', 'Live with a sheet?'],
    ['Answer: checked in', 'Write the milestone post'],
    ['Live with a sheet?', 0, 'Keep only the sheet columns'], ['Keep only the sheet columns', 'Stamp the check-in on the sheet'], ['Live with a sheet?', 1, 'STOP: not live - sheet untouched'],
    ['Write the milestone post', 'Milestone reached?'],
    ['Milestone reached?', 0, 'Posting switched on?'], ['Milestone reached?', 1, 'STOP: not a milestone'],
    ['Posting switched on?', 0, 'Slack channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Slack channel set?', 0, 'Post the count to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Receive the scan', why: 'The scanner posts to `Ticket scan webhook`, which waits for a respond node so the door gets its answer in the same request. A manual run feeds `Load sample scan` through the same path.', nodes: ['Run manually', 'Ticket scan webhook', 'config', 'Read the scan', 'Real scan?', 'Load sample scan', 'Combine scan sources'] },
    { title: 'Read the attendee list', why: 'The list is read on every scan so late registrations and manual fixes in the sheet count straight away. `Load sample attendee list` has 24 people already in, so the sample scan lands on a milestone.', nodes: ['Attendee sheet set?', 'Read the attendee list', 'Load sample attendee list', 'Combine attendee sources'] },
    { title: 'Validate and answer the door', why: 'A ticket is used if the sheet says so or static data saw it, which catches two scans a second apart. Each outcome gets its own HTTP status so the scanner app can show red or green.', nodes: ['Validate the ticket', 'Route the scan result', 'Answer: checked in', 'Answer: already checked in', 'Answer: ticket not found', 'Answer: bad scan'] },
    { title: 'Stamp the sheet and post milestones', why: 'Only a live first entry writes checked_in_at. `Write the milestone post` branches off the answer, so a slow Slack call never holds up the queue at the door.', nodes: ['Live with a sheet?', 'Write the milestone post', 'STOP: not live - sheet untouched', 'Keep only the sheet columns', 'Stamp the check-in on the sheet', 'Milestone reached?', 'STOP: not a milestone', 'Posting switched on?', 'STOP: preview - nothing posted', 'Slack channel set?', 'STOP: no Slack channel', 'Post the count to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (manual sample scan)', start: 'Run manually',
      expect: { reached: ['Load sample scan', 'Load sample attendee list', 'Answer: checked in', 'STOP: preview - nothing posted', 'STOP: not live - sheet untouched'], outward: 'none' },
      check: out => {
        const v = out['Validate the ticket'][0];
        const f: string[] = [];
        if (v.result !== 'ok' || v.ticket_code !== 'TIX-0031') f.push(`expected TIX-0031 checked in, got ${JSON.stringify(v)}`);
        if (v.count !== 25 || !v.milestone) f.push(`expected count 25 and a milestone, got ${v.count}`);
        if (!out['Write the milestone post'][0].text.includes('(25/40, 63%)')) f.push('milestone text wrong');
        return f;
      },
    },
    {
      name: 'webhook: ticket already used', start: 'Ticket scan webhook',
      input: [{ headers: {}, params: {}, query: {}, body: { code: 'TIX 0003', gate: 'Side door' } }],
      expect: { reached: ['Answer: already checked in'], notReached: ['Answer: checked in', 'Stamp the check-in on the sheet'], outward: 'none' },
      check: out => out['Validate the ticket'][0].result === 'duplicate' ? [] : ['TIX 0003 should be a duplicate'],
    },
    {
      name: 'webhook: unknown and bare number', start: 'Ticket scan webhook',
      input: [{ headers: {}, params: {}, query: {}, body: { code: '777' } }],
      expect: { reached: ['Answer: ticket not found'], outward: 'none' },
      check: out => out['Validate the ticket'][0].code === 'TIX0777' ? [] : ['bare number should be padded to TIX0777'],
    },
    {
      name: 'live check-in with sheet and Slack', start: 'Ticket scan webhook',
      input: [{ headers: {}, params: {}, query: {}, body: { code: 'VIP-2', gate: 'Main' } }],
      overrides: { ATTENDEES_SHEET_ID: '1AttendeeSheet', SLACK_CHANNEL_ID: 'C0DOOR001', TEST_RUN: false, MILESTONE_EVERY: 2 },
      mocks: {
        'Read the attendee list': [
          { ticket_code: 'VIP-1', name: 'Rae Holt', ticket_type: 'VIP', checked_in_at: new Date(Date.now() - 600e3).toISOString() },
          { ticket_code: 'VIP-2', name: 'Sol Mena', ticket_type: 'VIP', checked_in_at: '' },
          { ticket_code: 'GEN-1', name: 'Tia Roe', ticket_type: 'General', checked_in_at: '' },
        ],
        'Stamp the check-in on the sheet': (items: any[]) => items,
        'Post the count to Slack': [{ ok: true }],
      },
      expect: { reached: ['Answer: checked in', 'Stamp the check-in on the sheet', 'Post the count to Slack'], outward: 'some' },
      check: out => out['Write the milestone post'][0].text.includes('VIP 2/2, General 0/1') ? [] : [`per-type counts wrong: ${out['Write the milestone post'][0].text}`],
    },
  ],
});
