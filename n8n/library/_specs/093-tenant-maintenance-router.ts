import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'tenant-maintenance-router',
  title: 'Route tenant maintenance requests from a form to vendors by trade and urgency',
  summary: 'Takes a tenant maintenance request from an n8n form, spots emergencies such as gas, flooding or no heat, maps the issue to a trade, picks the covering vendor from a Google Sheets table, sets a response deadline, emails the vendor and the tenant and logs a ticket.',
  category: 'Local business and services',
  description: {
    who: 'Property managers and small landlords who get repair requests by text, email and phone and then forward each one to the right contractor by hand. Every request gets a ticket number, a vendor and a deadline within a minute.',
    how: [
      'A tenant fills in the form with their unit, area, category and a description. A manual run uses a sample gas-smell report.',
      'The description is checked for emergency phrases (gas, flood, burst pipe, no heat, sparks, sewage) and urgent ones (leak, no hot water, fridge). That sets the level and a deadline of 4 hours, 24 hours or 5 days.',
      'The category maps to a trade. Emergency phrases can override it, so a gas smell reported under Appliance still goes to a gas-safe heating engineer.',
      'The Vendors tab is filtered by trade and area. Emergencies only go to vendors marked for emergency call-outs, then the lowest Priority number wins. With no match, the property manager gets the job.',
      'The vendor gets a work order, the tenant gets a confirmation with the ticket id and deadline, the manager is copied on emergencies and the ticket is logged.',
    ],
    setup: [
      'Run it once as imported. It routes the sample request and stops at `STOP: preview - nothing sent`.',
      'Create Vendors (Vendor, Trade, Email, Areas, Emergency, Priority) and Tickets tabs, connect Google Sheets and set `MAINTENANCE_SHEET_ID`.',
      'Connect Gmail, set `MANAGER_EMAIL`, and edit the Area options on the form to your patches.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet with Vendors and Tickets tabs', 'A Gmail account'],
    customize: [
      '`EMERGENCY_PATTERNS` and `URGENT_PATTERNS` decide the level from the description.',
      '`SLA_HOURS` sets the deadline for each level.',
      '`CATEGORY_TRADES` and `KEYWORD_TRADES` map requests to the Trade column of your vendors.',
    ],
  },
  config: {
    intro: ['MAINTENANCE_SHEET_ID blank -> SAMPLE vendors so the run works before any credential exists.', 'Only a live run logs the ticket; test mode emails TEST_EMAIL only.'],
    consts: [
      { name: 'MAINTENANCE_SHEET_ID', value: '', note: 'Google Sheets id with Vendors and Tickets tabs; blank uses sample vendors' },
      { name: 'MANAGER_EMAIL', value: 'maintenance@harbour-lettings.example', note: 'copied on emergencies and gets jobs no vendor covers' },
      { name: 'TIMEZONE', value: 'Europe/London', note: 'timezone for the deadline shown in emails' },
      { name: 'EMERGENCY_PATTERNS', value: ['smell of gas', 'gas leak', 'gas', 'carbon monoxide', 'flood', 'flooding', 'burst pipe', 'no heat', 'no heating', 'sparks', 'burning smell', 'smoke', 'sewage', 'no power', 'locked out'], note: 'any of these in the description makes it an emergency' },
      { name: 'URGENT_PATTERNS', value: ['leak', 'leaking', 'no hot water', 'not flushing', 'fridge', 'freezer', 'broken window', 'no water', 'front door'], note: 'any of these makes it urgent' },
      { name: 'SLA_HOURS', value: { emergency: 4, urgent: 24, routine: 120 }, note: 'hours until a vendor must respond, per level' },
      { name: 'CATEGORY_TRADES', value: { Plumbing: 'plumbing', Electrical: 'electrical', Heating: 'heating', Appliance: 'appliance', 'Locks and doors': 'locksmith', Pest: 'pest', Other: '' }, note: 'form category -> Trade on the Vendors tab' },
      { name: 'KEYWORD_TRADES', value: { gas: 'heating', 'carbon monoxide': 'heating', boiler: 'heating', flood: 'plumbing', 'burst pipe': 'plumbing', leak: 'plumbing', sparks: 'electrical', 'no power': 'electrical', 'locked out': 'locksmith' }, note: 'phrase -> trade; used for emergencies and for the Other category' },
    ],
    flags: { sheets_enabled: "MAINTENANCE_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('Maintenance request form', 'Report a repair', 'Tell us what needs fixing. For a gas smell, leave the property and call the gas emergency line first.', [
      { label: 'Your name', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Phone' },
      { label: 'Address and unit', required: true },
      { label: 'Area', type: 'dropdown', options: ['Northside', 'Riverside', 'Eastgate'], required: true },
      { label: 'Category', type: 'dropdown', options: ['Plumbing', 'Electrical', 'Heating', 'Appliance', 'Locks and doors', 'Pest', 'Other'], required: true },
      { label: 'What is the problem?', type: 'textarea', required: true },
      { label: 'Can we enter if you are out?', type: 'dropdown', options: ['Yes', 'No'] },
    ]),
    code('Read the request', `
// Form submission when there is one; an empty marker on a manual run.
let f = null;
try { f = $('Maintenance request form').first().json; } catch (e) { f = null; }
if (!f || !f['Email']) return [{ json: { has_request: false } }];
return [{ json: { has_request: true, name: String(f['Your name'] || '').trim(), email: String(f['Email']).trim().toLowerCase(), phone: f['Phone'] || '',
  unit: f['Address and unit'] || '', area: f['Area'] || '', category: f['Category'] || 'Other', problem: String(f['What is the problem?'] || '').trim(),
  access: f['Can we enter if you are out?'] || 'No', submitted_at: f.submittedAt || new Date().toISOString() } }];`),
    ifTrue('Request from the form?', '$json.has_request'),
    code('Load sample request', `
// Used on a manual run: a gas smell reported under Appliance, which must still go
// to an emergency heating engineer.
return [{ json: { has_request: true, name: 'Rosa Diaz', email: 'rosa.diaz@mail.example', phone: '(212) 555-0119', unit: '14 Quay Street, Flat 3',
  area: 'Riverside', category: 'Appliance', problem: 'There is a smell of gas near the cooker and the boiler keeps cutting out.', access: 'Yes',
  submitted_at: new Date().toISOString() } }];`),
    merge('Combine request sources'),
    ifTrue('Vendors sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Vendors tab', cfg('maintenance_sheet_id'), 'Vendors'),
    code('Load sample vendors', `
// Used until MAINTENANCE_SHEET_ID is set. Two heating firms: the cheaper one does no
// emergency call-outs, so an emergency must skip it.
const V = (Vendor, Trade, Email, Areas, Emergency, Priority) => ({ Vendor, Trade, Email, Areas, Emergency, Priority });
return [
  V('Boilerworks', 'heating', 'jobs@boilerworks.example', 'Riverside, Northside', 'no', 1),
  V('Warmline Heating', 'heating', 'dispatch@warmline.example', 'Riverside, Northside, Eastgate', 'yes', 2),
  V('Quay Plumbing', 'plumbing', 'office@quayplumbing.example', 'Riverside', 'yes', 1),
  V('Northside Drains', 'plumbing', 'hello@northsidedrains.example', 'Northside', 'no', 1),
  V('Brightspark Electrical', 'electrical', 'jobs@brightspark.example', 'Riverside, Northside, Eastgate', 'yes', 1),
  V('Fixit Appliances', 'appliance', 'repairs@fixit.example', 'Riverside', 'no', 1),
  V('PestAway', 'pest', 'book@pestaway.example', 'Northside', 'no', 1),
].map(json => ({ json }));`),
    merge('Combine vendor sources'),
    code('Route the request', `
// Level from the description, trade from category or emergency phrase, vendor from
// the table (trade + area, emergency-capable when needed, lowest Priority).
const cfg = $('config').first().json;
const r = $('Combine request sources').first().json;
const vendors = $input.all().map(i => i.json).filter(v => v.Vendor && v.Email);
const text = (r.problem + ' ' + r.category).toLowerCase();
const has = p => new RegExp('(^|[^a-z])' + p.toLowerCase().replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&') + '([^a-z]|$)').test(text);
const emergencyHit = cfg.emergency_patterns.find(has);
const urgentHit = cfg.urgent_patterns.find(has);
const level = emergencyHit ? 'emergency' : urgentHit ? 'urgent' : 'routine';
const kwTrade = Object.entries(cfg.keyword_trades).find(([k]) => has(k));
const catTrade = cfg.category_trades[r.category] || '';
const trade = (level === 'emergency' && kwTrade ? kwTrade[1] : '') || catTrade || (kwTrade ? kwTrade[1] : '') || 'handyman';
const areas = v => String(v.Areas || '').split(/[,;]/).map(a => a.trim().toLowerCase());
const yes = v => /^(yes|true|y|1)$/i.test(String(v.Emergency || '').trim());
const fits = vendors.filter(v => String(v.Trade).trim().toLowerCase() === trade && areas(v).includes(String(r.area).toLowerCase()));
const ok = fits.filter(v => level !== 'emergency' || yes(v)).sort((a, b) => Number(a.Priority || 99) - Number(b.Priority || 99));
const vendor = ok[0] || null;
const skipped = fits.filter(v => !ok.includes(v)).map(v => v.Vendor + ' (no emergency call-outs)');
const hours = cfg.sla_hours[level];
const due = new Date(Date.now() + hours * 36e5);
const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
let h = 0; for (const ch of r.email + r.submitted_at) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
const ticket = 'MT-' + stamp + '-' + h.toString(16).slice(-4).toUpperCase().padStart(4, '0');
return [{ json: { ticket, request: r, level, reason: emergencyHit || urgentHit || 'no urgent phrase', trade, vendor, skipped,
  sla_hours: hours, due_at: due.toISOString(),
  due_label: due.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: cfg.timezone }),
  gas: /gas|carbon monoxide/.test(text) } }];`),
    code('Write the emails', `
// Up to three emails: vendor work order (or the manager when no vendor fits), the
// tenant confirmation, and a manager copy on emergencies.
const cfg = $('config').first().json;
const t = $input.first().json;
const r = t.request;
const lvl = t.level.toUpperCase();
const order = [
  'Ticket: ' + t.ticket + ' (' + lvl + ', respond by ' + t.due_label + ')', '',
  'Address: ' + r.unit + ' (' + r.area + ')', 'Tenant: ' + r.name + ', ' + (r.phone || 'no phone') + ', ' + r.email,
  'Access if tenant is out: ' + r.access, 'Category: ' + r.category + ', trade: ' + t.trade, '', 'Problem as reported:', r.problem, '',
  'Reply to this email to confirm attendance.',
].join('\\n');
const mails = [];
if (t.vendor) mails.push({ role: 'vendor', to: t.vendor.Email, subject: '[' + lvl + '] ' + t.ticket + ': ' + t.trade + ' at ' + r.unit, body: 'Hello ' + t.vendor.Vendor + ',\\n\\n' + order });
else mails.push({ role: 'manager (no vendor)', to: cfg.manager_email, subject: '[NO VENDOR] ' + t.ticket + ': ' + t.trade + ' in ' + r.area, body: 'No ' + t.trade + ' vendor covers ' + r.area + (t.level === 'emergency' ? ' for emergencies' : '') + '. Please assign one.\\n\\n' + order });
if (t.level === 'emergency' && t.vendor) mails.push({ role: 'manager copy', to: cfg.manager_email, subject: '[EMERGENCY] ' + t.ticket + ' sent to ' + t.vendor.Vendor, body: order });
mails.push({ role: 'tenant', to: r.email, subject: 'Repair request received: ' + t.ticket, body: [
  'Hi ' + (r.name.split(' ')[0] || 'there') + ',', '',
  'We have logged your request as ' + t.ticket + '. ' + (t.vendor ? t.vendor.Vendor + ' has been asked to respond by ' + t.due_label + '.' : 'We are assigning a contractor and will be in touch by ' + t.due_label + '.'),
  t.gas ? '\\nIf you can smell gas: do not use switches or flames, open windows, leave the property and call the gas emergency line now.' : '',
  '', 'Reply to this email if anything changes.',
].join('\\n') });
return mails.map(m => ({ json: { ...m, ticket: t.ticket, send_to: cfg.mode === 'test' ? cfg.test_email : m.to } }));`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Send the email', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.to + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - ticket not logged'),
    code('Shape the ticket row', `
// One Tickets row per request, whatever number of emails went out.
const t = $('Route the request').first().json;
return [{ json: { Ticket: t.ticket, Logged: new Date().toISOString(), Tenant: t.request.name, Email: t.request.email, Unit: t.request.unit,
  Area: t.request.area, Level: t.level, Trade: t.trade, Vendor: t.vendor ? t.vendor.Vendor : 'UNASSIGNED', 'Respond by': t.due_at, Status: 'sent to vendor', Problem: t.request.problem } }];`),
    sheets.append('Log the ticket', cfg('maintenance_sheet_id'), 'Tickets'),
  ],
  edges: [
    ['Run manually', 'config'], ['Maintenance request form', 'config'],
    ['config', 'Read the request'],
    ['Read the request', 'Request from the form?'],
    ['Request from the form?', 0, 'Combine request sources'], ['Request from the form?', 1, 'Load sample request'],
    ['Load sample request', 0, 'Combine request sources', 1],
    ['Combine request sources', 'Vendors sheet set?'],
    ['Vendors sheet set?', 0, 'Read the Vendors tab'], ['Vendors sheet set?', 1, 'Load sample vendors'],
    ['Read the Vendors tab', 'Combine vendor sources'], ['Load sample vendors', 0, 'Combine vendor sources', 1],
    ['Combine vendor sources', 'Route the request'],
    ['Route the request', 'Write the emails'],
    ['Write the emails', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send the email'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Send the email', 'Live run?'],
    ['Live run?', 0, 'Shape the ticket row'], ['Live run?', 1, 'STOP: test send - ticket not logged'],
    ['Shape the ticket row', 'Log the ticket'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Tenants submit `Maintenance request form`; `Run manually` replays a sample gas report. Emergency phrases, deadlines and trade mappings all live in `config`, so the rules are readable in one place.', nodes: ['Run manually', 'Maintenance request form', 'config'] },
    { title: 'Read the request', why: '`Read the request` lower-cases the email and keeps the description as typed, because the urgency rules read it word by word. A manual run uses `Load sample request`.', nodes: ['Read the request', 'Request from the form?', 'Load sample request', 'Combine request sources'] },
    { title: 'Read the vendor table', why: 'Vendors live in a sheet the office already keeps, with trade, areas covered, emergency call-outs and a priority. `Load sample vendors` includes a cheaper firm with no emergency cover, so the rule is visible.', nodes: ['Vendors sheet set?', 'Read the Vendors tab', 'Load sample vendors', 'Combine vendor sources'] },
    { title: 'Route and write', why: 'Emergency phrases are matched as whole words and can override the category, so gas reported as an appliance fault still goes to a gas engineer. With no covering vendor, the manager gets the job instead of nobody.', nodes: ['Route the request', 'Write the emails'] },
    { title: 'Send and log', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. The ticket is logged only on a live run, so test requests never appear in the Tickets tab.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Send the email', 'Live run?', 'STOP: test send - ticket not logged', 'Shape the ticket row', 'Log the ticket'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample gas report, preview)', start: 'Run manually',
      expect: { reached: ['Load sample request', 'Load sample vendors', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const t = out['Route the request'][0];
        const f: string[] = [];
        if (t.level !== 'emergency') f.push(`gas smell should be an emergency, got ${t.level}`);
        if (t.trade !== 'heating') f.push(`gas should override Appliance to heating, got ${t.trade}`);
        if (t.vendor?.Vendor !== 'Warmline Heating') f.push(`emergency should skip Boilerworks, got ${t.vendor?.Vendor}`);
        if (t.sla_hours !== 4) f.push('emergency deadline is 4 hours');
        if (!/^MT-\d{6}-[0-9A-F]{4}$/.test(t.ticket)) f.push(`ticket id format wrong: ${t.ticket}`);
        const roles = out['Write the emails'].map((m: any) => m.role).join(',');
        if (roles !== 'vendor,manager copy,tenant') f.push(`expected vendor, manager copy and tenant emails, got ${roles}`);
        if (!out['Write the emails'][2].body.includes('leave the property')) f.push('tenant should get gas safety advice');
        return f;
      },
    },
    {
      name: 'form request with no covering vendor (test mode)', start: 'Maintenance request form', overrides: { TEST_EMAIL: 'you@example.com' },
      input: [{ 'Your name': 'Ken Ito', Email: 'Ken@Mail.example', Phone: '', 'Address and unit': '2 Mill Lane', Area: 'Eastgate', Category: 'Pest',
        'What is the problem?': 'Mice in the kitchen cupboards again', 'Can we enter if you are out?': 'No', submittedAt: new Date().toISOString(), formMode: 'production' }],
      mocks: { 'Send the email': (items: any[]) => items.map((_, i) => ({ id: 'msg-' + i, labelIds: ['SENT'] })) },
      expect: { reached: ['Send the email', 'STOP: test send - ticket not logged'], notReached: ['Load sample request', 'Log the ticket'], outward: 'some' },
      check: out => {
        const t = out['Route the request'][0];
        const f: string[] = [];
        if (t.level !== 'routine' || t.vendor) f.push('routine pest job in Eastgate has no vendor');
        const m = out['Write the emails'];
        if (m[0].role !== 'manager (no vendor)') f.push('manager should get the unassigned job');
        if (!m.every((x: any) => x.send_to === 'you@example.com')) f.push('test mode redirects every email');
        return f;
      },
    },
    {
      name: 'live flood report with the vendor sheet', start: 'Maintenance request form',
      overrides: { MAINTENANCE_SHEET_ID: '1MaintSheetExample', TEST_RUN: false },
      input: [{ 'Your name': 'Mia Novak', Email: 'mia@mail.example', Phone: '212-555-0131', 'Address and unit': '9 Dock Road', Area: 'Riverside', Category: 'Other',
        'What is the problem?': 'Burst pipe under the sink, water everywhere', 'Can we enter if you are out?': 'Yes', submittedAt: new Date().toISOString(), formMode: 'production' }],
      mocks: {
        'Read the Vendors tab': [
          { row_number: 2, Vendor: 'Quay Plumbing', Trade: 'Plumbing', Email: 'office@quayplumbing.example', Areas: 'Riverside', Emergency: 'Yes', Priority: 2 },
          { row_number: 3, Vendor: 'Dockside Pipes', Trade: 'plumbing', Email: 'jobs@docksidepipes.example', Areas: 'riverside;eastgate', Emergency: 'TRUE', Priority: 1 },
        ],
        'Send the email': (items: any[]) => items.map((_, i) => ({ id: 'msg-' + i })),
        'Log the ticket': (items: any[]) => items,
      },
      expect: { reached: ['Send the email', 'Log the ticket'], notReached: ['Load sample vendors'], outward: 'some' },
      check: out => {
        const t = out['Route the request'][0];
        const f: string[] = [];
        if (t.trade !== 'plumbing' || t.level !== 'emergency') f.push('burst pipe under Other is an emergency plumbing job');
        if (t.vendor?.Vendor !== 'Dockside Pipes') f.push('lowest Priority emergency plumber should win');
        if (out['Shape the ticket row'].length !== 1) f.push('one ticket row per request');
        return f;
      },
    },
  ],
});
