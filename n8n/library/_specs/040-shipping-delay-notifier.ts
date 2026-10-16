import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, gmail, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'shipping-delay-notifier',
  title: 'Warn customers from Gmail when AfterShip shows a stalled shipment',
  summary: 'Checks every open shipment in a Google Sheet against AfterShip tracking, finds parcels with no scan for 3 days, carrier exceptions and labels never collected, emails each affected customer once before they ask, and posts an internal digest to Slack.',
  category: 'E-commerce',
  description: {
    who: 'Online shops that ship with several carriers and hear about lost or stuck parcels only when the customer writes in angry. A short, early email turns most of those tickets into a thank-you.',
    how: [
      'Every weekday at 10:00 it reads open shipments from the Shipments tab, or 7 sample shipments until the sheet is set.',
      'It looks up all tracking numbers in one AfterShip call, or uses sample tracking until `AFTERSHIP_ENABLED` is on.',
      'A shipment is delayed if the carrier reports an exception or failed attempt, if the last scan is 3 or more days old, or if the label was created 4 or more days ago and never scanned.',
      'Each delayed shipment gets one email in plain words for its case; a filled notified_at column means it never gets another.',
      'The team gets one Slack digest of every delay, plus tracking numbers AfterShip does not know.',
    ],
    setup: [
      'Run it once as imported. It checks the sample shipments and stops at `STOP: preview - nothing sent`.',
      'Create a Shipments tab (order, email, first_name, carrier, tracking_number, shipped_at, notified_at, delay_reason) and put its id in `SHIPMENT_SHEET_ID`.',
      'Add a Header Auth credential named `as-api-key` with your AfterShip key to `Fetch tracking from AfterShip`, and set `AFTERSHIP_ENABLED = true`.',
      'Connect Gmail and Slack, set `SLACK_CHANNEL_ID`, then put your address in `TEST_EMAIL` before setting `TEST_RUN = false`.',
    ],
    requirements: ['An AfterShip account with API access', 'A Google Sheet of shipments', 'A Gmail account', 'Optional: a Slack workspace'],
    customize: [
      '`STALL_DAYS` and `LABEL_ONLY_DAYS` set when silence counts as a delay.',
      '`EXCEPTION_TAGS` lists AfterShip statuses that trigger an email at once.',
      '`MESSAGES` holds the wording for each delay type.',
    ],
  },
  config: {
    intro: ['SHIPMENT_SHEET_ID blank -> SAMPLE shipments. AFTERSHIP_ENABLED false -> SAMPLE tracking.', 'TEST_RUN true + TEST_EMAIL blank -> preview only. The sheet is updated only on a live run.'],
    consts: [
      { name: 'SHIPMENT_SHEET_ID', value: '', note: 'Google Sheets id with a Shipments tab; blank uses sample shipments' },
      { name: 'AFTERSHIP_ENABLED', value: false, note: 'set true after adding the AfterShip Header Auth credential' },
      { name: 'STALL_DAYS', value: 3, note: 'no carrier scan for this many days counts as stalled' },
      { name: 'LABEL_ONLY_DAYS', value: 4, note: 'a label never scanned this many days after shipping counts as delayed' },
      { name: 'EXCEPTION_TAGS', value: ['Exception', 'AttemptFail', 'Expired'], note: 'AfterShip tags that mean a problem now' },
      { name: 'DONE_TAGS', value: ['Delivered', 'AvailableForPickup'], note: 'AfterShip tags that close a shipment' },
      { name: 'MESSAGES', value: {
        stalled: 'Your parcel for order {order} has not been scanned by {carrier} since {last_scan} ({location}). That usually means it is waiting at a depot; we have asked the carrier to check.',
        exception: 'The carrier reported a problem with your parcel for order {order}: "{detail}". We are on it and will update you as soon as we hear back.',
        label_only: 'The shipping label for order {order} was created on {shipped}, but {carrier} has not collected the parcel yet. We are chasing the pickup today.',
      }, note: 'email text per delay type; {order}, {carrier}, {last_scan}, {location}, {detail}, {shipped} are filled in' },
      { name: 'SHOP_NAME', value: 'Larch & Loom', note: 'used in the subject and sign-off' },
      { name: 'DAILY_CAP', value: 40, note: 'hard ceiling on emails per run' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the internal digest; blank skips Slack' },
    ],
    flags: { sheet_enabled: "SHIPMENT_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 10:00', '0 10 * * 1-5'),
    ifTrue('Shipment sheet set?', cfg('sheet_enabled')),
    sheets.read('Read open shipments', cfg('shipment_sheet_id'), 'Shipments'),
    code('Load sample shipments', `
// Used until SHIPMENT_SHEET_ID is set. 3006 was already told about its delay.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [
  ['3001', 'hana@cobblestone.example', 'Hana', 'ups', '1Z555A0101', day(6), ''],
  ['3002', 'ivo@riverbend.example', 'Ivo', 'usps', '9400555010200', day(3), ''],
  ['3003', 'jon@meadowlark.example', 'Jon', 'dhl', 'JD5550103', day(4), ''],
  ['3004', 'kai@westbrook.example', 'Kai', 'fedex', '555010400001', day(5), ''],
  ['3005', 'lou@bayside.example', 'Lou', 'usps', '9400555010500', day(5), ''],
  ['3006', 'mae@ashgrove.example', 'Mae', 'ups', '1Z555A0106', day(9), day(2)],
  ['3007', 'ned@fernhill.example', 'Ned', 'royal-mail', 'RM555010700GB', day(2), ''],
].map(([order, email, first_name, carrier, tracking_number, shipped_at, notified_at]) => ({ json: { order, email, first_name, carrier, tracking_number, shipped_at, notified_at, delay_reason: '' } }));`),
    merge('Combine shipment sources'),
    code('Collect tracking numbers', `
// One item with every open shipment; delivered rows and blank tracking numbers are dropped.
const rows = $input.all().map(i => i.json).filter(r => r.tracking_number && String(r.status || '').toLowerCase() !== 'delivered');
return [{ json: { shipments: rows, numbers: rows.map(r => String(r.tracking_number).trim()) } }];`),
    ifTrue('AfterShip connected?', cfg('aftership_enabled')),
    http('Fetch tracking from AfterShip', {
      url: 'https://api.aftership.com/tracking/2024-07/trackings', auth: 'header',
      query: { tracking_numbers: '={{ $json.numbers.slice(0, 50).join(",") }}', limit: '50' },
    }),
    code('Read AfterShip trackings', `
// Trackings -> status tag, last checkpoint and carrier message, keyed by number.
const t = {};
for (const page of $input.all()) for (const x of page.json.data?.trackings || []) {
  const cps = (x.checkpoints || []).slice().sort((a, b) => String(a.checkpoint_time).localeCompare(String(b.checkpoint_time)));
  const last = cps[cps.length - 1];
  t[x.tracking_number] = { tag: x.tag, subtag_message: x.subtag_message || '', last_scan: last?.checkpoint_time || null,
    location: last?.location || [last?.city, last?.country_region].filter(Boolean).join(', ') || '', detail: last?.message || x.subtag_message || '', scans: cps.length };
}
return [{ json: { tracking: t } }];`),
    code('Load sample tracking', `
// Used until AFTERSHIP_ENABLED is true. 3007 is unknown to the carrier feed.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
return [{ json: { tracking: {
  '1Z555A0101': { tag: 'InTransit', last_scan: ago(4), location: 'Louisville, KY', detail: 'Departed facility', scans: 4 },
  '9400555010200': { tag: 'InTransit', last_scan: ago(1), location: 'Denver, CO', detail: 'Arrived at hub', scans: 3 },
  'JD5550103': { tag: 'Exception', last_scan: ago(1), location: 'Leipzig, DE', detail: 'Held by customs: invoice required', scans: 5 },
  '555010400001': { tag: 'Delivered', last_scan: ago(1), location: 'Austin, TX', detail: 'Delivered, front door', scans: 6 },
  '9400555010500': { tag: 'InfoReceived', last_scan: ago(5), location: '', detail: 'Shipping label created', scans: 1 },
  '1Z555A0106': { tag: 'InTransit', last_scan: ago(6), location: 'Ontario, CA', detail: 'In transit', scans: 3 },
} } }];`),
    merge('Combine tracking sources'),
    code('Find delayed shipments', `
// Exception first, then label never collected, then stalled. One email per shipment
// ever: a filled notified_at means skip. Unknown numbers go to the team, not the customer.
const cfg = $('config').first().json;
const { shipments } = $('Collect tracking numbers').first().json;
const tracking = $input.first().json.tracking || {};
const days = iso => iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : null;
const notify = [], quiet = [], unknown = [], already = [];
for (const s of shipments) {
  const t = tracking[String(s.tracking_number).trim()];
  if (!t) { unknown.push({ order: s.order, tracking: s.tracking_number }); continue; }
  if (cfg.done_tags.includes(t.tag)) { quiet.push({ order: s.order, reason: t.tag }); continue; }
  const sinceScan = days(t.last_scan), sinceShip = days(s.shipped_at);
  const type =
    cfg.exception_tags.includes(t.tag) ? 'exception' :
    (t.tag === 'InfoReceived' || t.tag === 'Pending' || t.scans <= 1) && sinceShip >= cfg.label_only_days ? 'label_only' :
    sinceScan !== null && sinceScan >= cfg.stall_days ? 'stalled' : '';
  if (!type) { quiet.push({ order: s.order, reason: 'moving (last scan ' + Math.floor(sinceScan) + 'd ago)' }); continue; }
  if (String(s.notified_at || '').trim()) { already.push({ order: s.order, type, notified_at: s.notified_at }); continue; }
  notify.push({ ...s, type, tag: t.tag, last_scan: t.last_scan ? t.last_scan.slice(0, 10) : '', location: t.location || 'unknown location', detail: t.detail, days_quiet: Math.floor(sinceScan ?? sinceShip) });
}
const capped = notify.slice(0, cfg.daily_cap);
return [{ json: { notify: capped, deferred: notify.slice(cfg.daily_cap).map(n => n.order), quiet, unknown, already } }];`),
    code('Write each delay email', `
// Wording per delay type from MESSAGES, filled with the carrier's own facts.
const cfg = $('config').first().json;
return $input.first().json.notify.map(n => {
  const text = cfg.messages[n.type].replace('{order}', n.order).replace('{carrier}', n.carrier.toUpperCase()).replace('{last_scan}', n.last_scan)
    .replace('{location}', n.location).replace('{detail}', n.detail).replace('{shipped}', n.shipped_at);
  return { json: { ...n, subject: 'An update on your order ' + n.order,
    body: ['Hi ' + (n.first_name || 'there') + ',', '', text, '', 'Tracking: ' + n.tracking_number + ' (' + n.carrier.toUpperCase() + ')', '', 'Sorry for the wait. Reply to this email if you need anything.', '', cfg.shop_name].join('\\n'),
    send_to: cfg.mode === 'test' ? cfg.test_email : n.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the customer', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifWhen('Live run?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: test send - sheet untouched'),
    code('Mark shipments as notified', `
// notified_at is what stops a second email; delay_reason records which case it was.
const now = new Date().toISOString();
return $('Write each delay email').all().map(({ json: n }) => ({ json: { tracking_number: n.tracking_number, notified_at: now, delay_reason: n.type } }));`),
    sheets.update('Update the shipment rows', cfg('shipment_sheet_id'), 'Shipments', 'tracking_number'),
    code('Write the internal digest', `
// What the team should know today, including what customers were told.
const cfg = $('config').first().json;
const d = $input.first().json;
const label = { stalled: 'no scan', exception: 'carrier exception', label_only: 'not collected' };
const text = [
  '*Shipping delays* (' + cfg.mode + '): ' + d.notify.length + ' customer' + (d.notify.length === 1 ? '' : 's') + (cfg.mode === 'live' ? ' emailed' : ' to email'),
  ...d.notify.map(n => '• ' + n.order + ' ' + n.carrier.toUpperCase() + ' ' + n.tracking_number + ': ' + label[n.type] + ' (' + n.detail + ', ' + n.days_quiet + 'd)'),
  ...(d.already.length ? ['Still delayed, already told: ' + d.already.map(a => a.order).join(', ')] : []),
  ...(d.unknown.length ? ['Not found in AfterShip: ' + d.unknown.map(u => u.order + ' (' + u.tracking + ')').join(', ')] : []),
  ...(d.deferred.length ? ['Over DAILY_CAP, tomorrow: ' + d.deferred.join(', ')] : []),
].join('\\n');
return [{ json: { text, items: d.notify.length + d.already.length + d.unknown.length } }];`),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Digest switched on?', `${cfg('sends_enabled')} && $json.items > 0`),
    stop('STOP: preview or nothing to report'),
    slack.post('Post the digest to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 10:00', 'config'],
    ['config', 'Shipment sheet set?'],
    ['Shipment sheet set?', 0, 'Read open shipments'], ['Shipment sheet set?', 1, 'Load sample shipments'],
    ['Read open shipments', 'Combine shipment sources'], ['Load sample shipments', 0, 'Combine shipment sources', 1],
    ['Combine shipment sources', 'Collect tracking numbers'],
    ['Collect tracking numbers', 'AfterShip connected?'],
    ['AfterShip connected?', 0, 'Fetch tracking from AfterShip'], ['AfterShip connected?', 1, 'Load sample tracking'],
    ['Fetch tracking from AfterShip', 'Read AfterShip trackings'],
    ['Read AfterShip trackings', 'Combine tracking sources'], ['Load sample tracking', 0, 'Combine tracking sources', 1],
    ['Combine tracking sources', 'Find delayed shipments'],
    ['Find delayed shipments', 'Write each delay email'],
    ['Find delayed shipments', 'Write the internal digest'],
    ['Write each delay email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the customer'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the customer', 'Live run?'],
    ['Live run?', 0, 'Mark shipments as notified'], ['Live run?', 1, 'STOP: test send - sheet untouched'],
    ['Mark shipments as notified', 'Update the shipment rows'],
    ['Write the internal digest', 'Slack channel set?'],
    ['Slack channel set?', 0, 'Digest switched on?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Digest switched on?', 0, 'Post the digest to Slack'], ['Digest switched on?', 1, 'STOP: preview or nothing to report'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs weekdays at 10:00, after carriers have posted the overnight scans. The delay thresholds and every email sentence live in `config`.', nodes: ['Run manually', 'Every weekday at 10:00', 'config'] },
    { title: 'Read open shipments', why: 'The sheet is the list of what you shipped and the memory of who was told. `Collect tracking numbers` makes one item so AfterShip is called once for up to 50 parcels.', nodes: ['Shipment sheet set?', 'Read open shipments', 'Load sample shipments', 'Combine shipment sources', 'Collect tracking numbers'] },
    { title: 'Look up tracking', why: 'One read-only AfterShip call with a Header Auth key. `Read AfterShip trackings` keeps only the newest checkpoint per parcel, which is all the delay rules need.', nodes: ['AfterShip connected?', 'Fetch tracking from AfterShip', 'Read AfterShip trackings', 'Load sample tracking', 'Combine tracking sources'] },
    { title: 'Decide, email and record', why: 'A carrier exception outranks silence, so a customs hold is described as one. A shipment AfterShip does not know goes to the team only, because the number itself may be wrong. Only a live send fills notified_at.', nodes: ['Find delayed shipments', 'Write each delay email', 'Write the internal digest', 'Sending switched on?', 'Slack channel set?', 'STOP: preview - nothing sent', 'Email the customer', 'STOP: no Slack channel', 'Digest switched on?', 'Live run?', 'STOP: preview or nothing to report', 'Post the digest to Slack', 'STOP: test send - sheet untouched', 'Mark shipments as notified', 'Update the shipment rows'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample shipments', 'Load sample tracking', 'STOP: preview - nothing sent', 'STOP: no Slack channel'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Find delayed shipments'][0];
        const types = Object.fromEntries(d.notify.map((n: any) => [n.order, n.type]));
        if (JSON.stringify(types) !== JSON.stringify({ '3001': 'stalled', '3003': 'exception', '3005': 'label_only' })) f.push(`expected 3001 stalled, 3003 exception, 3005 label_only, got ${JSON.stringify(types)}`);
        if (d.already[0]?.order !== '3006') f.push('3006 was already told and must not be emailed again');
        if (d.unknown[0]?.order !== '3007') f.push('3007 is unknown to AfterShip and goes to the digest only');
        if (!d.quiet.some((q: any) => q.order === '3004' && q.reason === 'Delivered')) f.push('3004 is delivered');
        if (!out['Write each delay email'].find((e: any) => e.order === '3003')?.body.includes('Held by customs')) f.push('exception email should quote the carrier message');
        return f;
      },
    },
    {
      name: 'live with the sheet, AfterShip and Slack', start: 'Every weekday at 10:00',
      overrides: { SHIPMENT_SHEET_ID: '1Shipments', AFTERSHIP_ENABLED: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0SHIP' },
      mocks: {
        'Read open shipments': [
          { row_number: 2, order: '7101', email: 'Ola@Brightside.example', first_name: 'Ola', carrier: 'dhl', tracking_number: 'JD555710100', shipped_at: new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10), notified_at: '', delay_reason: '' },
          { row_number: 3, order: '7102', email: 'pat@brightside.example', first_name: 'Pat', carrier: 'dhl', tracking_number: 'JD555710200', shipped_at: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), notified_at: '', delay_reason: '' },
        ],
        'Fetch tracking from AfterShip': [{ meta: { code: 200 }, data: { trackings: [
          { tracking_number: 'JD555710100', slug: 'dhl', tag: 'AttemptFail', subtag_message: 'Recipient not available', checkpoints: [
            { checkpoint_time: new Date(Date.now() - 3 * 864e5).toISOString(), message: 'Processed at hub', location: 'Leipzig' },
            { checkpoint_time: new Date(Date.now() - 864e5).toISOString(), message: 'Delivery attempted, recipient not available', location: 'Manchester' }] },
          { tracking_number: 'JD555710200', slug: 'dhl', tag: 'InTransit', checkpoints: [{ checkpoint_time: new Date(Date.now() - 864e5).toISOString(), message: 'In transit', location: 'Leipzig' }] },
        ] } }],
        'Email the customer': (items: any[]) => items.map(() => ({ id: 'msg_1' })),
        'Update the shipment rows': (items: any[]) => items,
        'Post the digest to Slack': [{ ok: true }],
      },
      expect: { reached: ['Email the customer', 'Update the shipment rows', 'Post the digest to Slack'], notReached: ['Load sample shipments', 'Load sample tracking'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const e = out['Write each delay email'];
        if (e.length !== 1 || e[0].type !== 'exception' || !e[0].body.includes('recipient not available')) f.push('7101 failed attempt should be emailed as an exception with the carrier message');
        if (out['Update the shipment rows'][0]?.tracking_number !== 'JD555710100') f.push('7101 row should be marked notified');
        return f;
      },
    },
  ],
});
