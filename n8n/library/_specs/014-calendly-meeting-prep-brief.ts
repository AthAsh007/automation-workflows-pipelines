import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const booking = (event = 'invitee.created') => ({
  headers: { 'content-type': 'application/json', 'user-agent': 'Calendly-Webhooks' }, params: {}, query: {},
  body: {
    event, created_at: new Date().toISOString(),
    payload: {
      email: 'kai@bergfreight.example', name: 'Kai Berg', first_name: 'Kai', timezone: 'Europe/Berlin',
      questions_and_answers: [{ question: 'What would you like to cover?', answer: 'Pricing for 40 drivers' }],
      tracking: { utm_source: 'google', utm_campaign: 'fleet-q4' },
      scheduled_event: { name: 'Discovery call', start_time: new Date(Date.now() + 26 * 3600e3).toISOString(), end_time: new Date(Date.now() + 26.5 * 3600e3).toISOString(),
        location: { type: 'google_conference', join_url: 'https://meet.google.com/abc-defg-hij' },
        event_memberships: [{ user_email: 'theo@yourcompany.example', user_name: 'Theo Grant' }] },
    },
  },
});

export default defineSpec({
  slug: 'calendly-meeting-prep-brief',
  title: 'Send prep briefs for new Calendly bookings with HubSpot context by Gmail',
  summary: 'When someone books through Calendly, looks up the invitee\'s contact, company and deals in HubSpot, writes a one-screen prep note with rule-based talking points, and emails it to the host through Gmail.',
  category: 'Sales and CRM',
  description: {
    who: 'Account executives and founders who take sales calls through Calendly and open HubSpot five minutes before each one to remember who they are talking to. The prep note arrives in the host\'s inbox as soon as the meeting is booked.',
    how: [
      'A Calendly webhook fires on invitee.created. A manual run uses a sample booking instead. Cancellations and event types not listed in `EVENT_TYPES` are ignored.',
      'HubSpot is searched three times: the contact by email, the company by email domain, and deals linked to the contact.',
      'Rules turn that into talking points: not in HubSpot yet, existing customer, an open deal in a late stage, a deal lost before, a free email address, and the campaign that brought them in.',
      'The note (meeting time in your timezone, their answers, company size, open pipeline) is emailed to the Calendly host.',
    ],
    setup: [
      'Run it once from `Run manually`. It writes a note for a sample booking and stops at `STOP: preview - nothing sent`.',
      'Create a HubSpot private app with contacts, companies and deals read scopes, add it to the three HubSpot nodes, and set `USE_HUBSPOT = true`.',
      'Activate the workflow and register the production URL of `Calendly booking received` as a Calendly webhook subscription for invitee.created.',
      'Connect Gmail. Put your address in `TEST_EMAIL` to receive every note yourself, then set `TEST_RUN = false` to email hosts.',
    ],
    requirements: ['A Calendly plan with webhooks (Standard or above)', 'A HubSpot account with a private app token', 'A Gmail account'],
    customize: [
      '`EVENT_TYPES` limits notes to named event types, such as Discovery call.',
      '`HOST_TIMEZONE` sets the time shown in each note.',
      '`LATE_STAGES` lists deal stages that count as late.',
    ],
  },
  config: {
    intro: ['A manual run uses a SAMPLE booking. USE_HUBSPOT false -> SAMPLE CRM context.', 'This workflow only reads HubSpot. The one send is the email to the host.'],
    consts: [
      { name: 'USE_HUBSPOT', value: false, note: 'set true after adding the HubSpot credential to the three HubSpot nodes' },
      { name: 'EVENT_TYPES', value: [], note: "Calendly event type names that get a note, e.g. ['Discovery call']; empty = all" },
      { name: 'HOST_TIMEZONE', value: 'America/New_York', note: 'timezone for the meeting time in the note' },
      { name: 'LATE_STAGES', value: ['decisionmakerboughtin', 'contractsent'], note: 'HubSpot deal stage ids that count as late-stage' },
      { name: 'FREE_EMAIL_DOMAINS', value: ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'proton.me'], note: 'domains that are not a company' },
      { name: 'FALLBACK_HOST_EMAIL', value: 'sales@yourcompany.example', note: 'used when the booking names no host' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Calendly booking received', 'calendly-prep-brief'),
    code('Pick up the booking', `
// Webhook body when Calendly called; a sample booking on a manual run. Only new
// bookings for the listed event types go further.
const cfg = $('config').first().json;
let body = null;
try { body = $('Calendly booking received').first().json.body; } catch (e) { body = null; }
const sample = !body;
if (sample) {
  body = { event: 'invitee.created', payload: {
    email: 'nora@vance-logistics.example', name: 'Nora Vance', first_name: 'Nora', timezone: 'America/Chicago',
    questions_and_answers: [{ question: 'What would you like to cover?', answer: 'Moving our dispatch team off spreadsheets' }, { question: 'Company size', answer: '50-200' }],
    tracking: { utm_source: 'linkedin', utm_campaign: 'ops-webinar' },
    scheduled_event: { name: 'Discovery call', start_time: new Date(Date.now() + 2 * 864e5).toISOString(), end_time: new Date(Date.now() + 2 * 864e5 + 30 * 60e3).toISOString(),
      location: { type: 'zoom', join_url: 'https://zoom.example/j/5550100' }, event_memberships: [{ user_email: 'maya@yourcompany.example', user_name: 'Maya Ortiz' }] },
  } };
}
const p = body.payload || {};
const ev = p.scheduled_event || {};
const host = (ev.event_memberships || [])[0] || {};
const email = String(p.email || '').toLowerCase();
const wanted = body.event === 'invitee.created' && (!cfg.event_types.length || cfg.event_types.includes(ev.name));
return [{ json: { wanted, sample, event: body.event, event_name: ev.name || '', email, domain: email.split('@')[1] || '', name: p.name || '', first_name: p.first_name || (p.name || '').split(' ')[0],
  invitee_tz: p.timezone || '', start: ev.start_time, end: ev.end_time, join_url: ev.location?.join_url || ev.location?.location || '',
  answers: (p.questions_and_answers || []).filter(q => q.answer), utm: p.tracking || {},
  host_email: host.user_email || cfg.fallback_host_email, host_name: host.user_name || '' } }];`),
    ifTrue('New booking to prepare?', '$json.wanted'),
    stop('STOP: not a new booking for a listed event type'),
    ifTrue('Use sample CRM data?', '!' + cfg('use_hubspot')),
    code('Load sample CRM data', `
// Used until USE_HUBSPOT is true: known contact, sized company, one open and one lost deal.
const day = n => new Date(Date.now() + n * 864e5).toISOString();
return [{ json: {
  contact: { id: '501', firstname: 'Nora', lastname: 'Vance', jobtitle: 'Head of Operations', lifecyclestage: 'salesqualifiedlead', last_activity: day(-12) },
  company: { name: 'Vance Logistics', industry: 'TRANSPORTATION_TRUCKING_RAILROAD', employees: 120, revenue: 18000000, city: 'Tulsa', country: 'United States' },
  deals: [
    { name: 'Vance Logistics - dispatch pilot', stage: 'presentationscheduled', amount: 24000, closedate: day(30) },
    { name: 'Vance - 2024 trial', stage: 'closedlost', amount: 6000, closedate: day(-300) },
  ],
} }];`),
    http('Find the contact in HubSpot', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/contacts/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: "JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: $json.email }] }], properties: ['firstname', 'lastname', 'jobtitle', 'lifecyclestage', 'notes_last_updated'], limit: 1 })",
    }),
    http('Find the company by domain', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/companies/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: "JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: $('Pick up the booking').first().json.domain }] }], properties: ['name', 'industry', 'numberofemployees', 'annualrevenue', 'city', 'country'], limit: 1 })",
    }),
    http('Find deals for the contact', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/deals/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: "JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'associations.contact', operator: 'EQ', value: $('Find the contact in HubSpot').first().json.results?.[0]?.id || '0' }] }], properties: ['dealname', 'dealstage', 'amount', 'closedate'], limit: 20 })",
    }),
    code('Collect the CRM context', `
// Three search responses -> the sample shape. A missing record is null, not an error.
const c = $('Find the contact in HubSpot').first().json.results?.[0];
const co = $('Find the company by domain').first().json.results?.[0];
const deals = ($input.first().json.results || []).map(d => ({ name: d.properties.dealname, stage: d.properties.dealstage, amount: Number(d.properties.amount || 0), closedate: d.properties.closedate }));
return [{ json: {
  contact: c ? { id: c.id, firstname: c.properties.firstname, lastname: c.properties.lastname, jobtitle: c.properties.jobtitle || '', lifecyclestage: c.properties.lifecyclestage || '', last_activity: c.properties.notes_last_updated || null } : null,
  company: co ? { name: co.properties.name, industry: co.properties.industry || '', employees: Number(co.properties.numberofemployees || 0), revenue: Number(co.properties.annualrevenue || 0), city: co.properties.city || '', country: co.properties.country || '' } : null,
  deals: c ? deals : [],
} }];`),
    merge('Combine CRM sources'),
    code('Build the prep note', `
// Facts first, then talking points from fixed rules, so every note reads the same way.
const cfg = $('config').first().json;
const b = $('Pick up the booking').first().json;
const { contact, company, deals } = $input.first().json;
const when = new Date(b.start).toLocaleString('en-US', { timeZone: cfg.host_timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const open = deals.filter(d => !/^closed/.test(d.stage));
const lost = deals.filter(d => d.stage === 'closedlost');
const points = [];
if (!contact) points.push('Not in HubSpot yet: first conversation, qualify budget and timeline.');
if (contact?.lifecyclestage === 'customer') points.push('Existing customer: check for open support issues and renewal date before the call.');
for (const d of open) if (cfg.late_stages.includes(d.stage)) points.push('Late-stage deal "' + d.name + '" (' + money(d.amount) + '): this call may decide it.');
if (open.length && !open.some(d => cfg.late_stages.includes(d.stage))) points.push('Open pipeline of ' + money(open.reduce((s, d) => s + d.amount, 0)) + ' across ' + open.length + ' deal(s).');
if (lost.length) points.push('Lost before: "' + lost[0].name + '". Ask what changed since then.');
if (cfg.free_email_domains.includes(b.domain)) points.push('Booked with a personal email (' + b.domain + '): confirm the company name.');
if (contact?.last_activity) { const d = Math.floor((Date.now() - new Date(contact.last_activity)) / 864e5); points.push('Last logged activity ' + d + ' days ago.'); }
if (b.utm.utm_source) points.push('Came in through ' + b.utm.utm_source + (b.utm.utm_campaign ? ' / ' + b.utm.utm_campaign : '') + '.');
const li = a => a.map(x => '<li>' + x + '</li>').join('');
const html = '<div style="font-family:Arial,sans-serif;font-size:14px">'
  + '<h3>' + b.event_name + ' with ' + b.name + (company ? ', ' + company.name : '') + '</h3>'
  + '<p><b>' + when + '</b> (' + cfg.host_timezone + ')' + (b.join_url ? '<br>Join: ' + b.join_url : '') + (b.invitee_tz ? '<br>Their timezone: ' + b.invitee_tz : '') + '</p>'
  + '<p><b>Person</b><br>' + b.name + ' &lt;' + b.email + '&gt;' + (contact?.jobtitle ? '<br>' + contact.jobtitle : '') + (contact?.lifecyclestage ? '<br>Lifecycle: ' + contact.lifecyclestage : '') + '</p>'
  + (company ? '<p><b>Company</b><br>' + company.name + (company.industry ? ', ' + company.industry.toLowerCase().replace(/_/g, ' ') : '') + (company.employees ? '<br>' + company.employees + ' employees' : '') + (company.revenue ? ', ' + money(company.revenue) + ' revenue' : '') + (company.city ? '<br>' + company.city + ', ' + company.country : '') + '</p>' : '')
  + (b.answers.length ? '<p><b>They said</b></p><ul>' + li(b.answers.map(a => a.question + ': ' + a.answer)) + '</ul>' : '')
  + (deals.length ? '<p><b>Deals</b></p><ul>' + li(deals.map(d => d.name + ' - ' + d.stage + ', ' + money(d.amount))) + '</ul>' : '')
  + '<p><b>Talking points</b></p><ul>' + li(points) + '</ul></div>';
return [{ json: { html, points, subject: 'Prep: ' + b.name + (company ? ' (' + company.name + ')' : '') + ', ' + when,
  host_email: b.host_email, send_to: cfg.mode === 'test' ? cfg.test_email : b.host_email } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the note to the host', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.host_email + '] ' : '') + $json.subject", message: '$json.html', html: true }),
  ],
  edges: [
    ['Run manually', 'config'], ['Calendly booking received', 'config'],
    ['config', 'Pick up the booking'],
    ['Pick up the booking', 'New booking to prepare?'],
    ['New booking to prepare?', 0, 'Use sample CRM data?'], ['New booking to prepare?', 1, 'STOP: not a new booking for a listed event type'],
    ['Use sample CRM data?', 0, 'Load sample CRM data'], ['Use sample CRM data?', 1, 'Find the contact in HubSpot'],
    ['Find the contact in HubSpot', 'Find the company by domain'],
    ['Find the company by domain', 'Find deals for the contact'],
    ['Find deals for the contact', 'Collect the CRM context'],
    ['Load sample CRM data', 'Combine CRM sources'], ['Collect the CRM context', 0, 'Combine CRM sources', 1],
    ['Combine CRM sources', 'Build the prep note'],
    ['Build the prep note', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the note to the host'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Calendly calls the webhook on every booking; `Run manually` replays a sample one. Event type filter, timezone and late stages are set in `config`.', nodes: ['Run manually', 'Calendly booking received', 'config'] },
    { title: 'Read the booking', why: '`Pick up the booking` works for both triggers and drops cancellations and unlisted event types before any HubSpot call is made.', nodes: ['Pick up the booking', 'New booking to prepare?', 'STOP: not a new booking for a listed event type'] },
    { title: 'Look up HubSpot', why: 'The company is found by email domain rather than through the contact, so a person new to HubSpot still gets company context. `Load sample CRM data` stands in until `USE_HUBSPOT` is true.', nodes: ['Use sample CRM data?', 'Load sample CRM data', 'Find the contact in HubSpot', 'Find the company by domain', 'Find deals for the contact', 'Collect the CRM context', 'Combine CRM sources'] },
    { title: 'Write and send the note', why: 'Talking points come from fixed rules, not a model, so the host can trust each line. A test send goes to `TEST_EMAIL` with the host named in the subject.', nodes: ['Build the prep note', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the note to the host'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample CRM data', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const n = out['Build the prep note'][0];
        const f: string[] = [];
        if (n.points.length !== 4) f.push(`expected 4 talking points, got ${JSON.stringify(n.points)}`);
        if (!n.points.some((p: string) => p.startsWith('Open pipeline of $24,000'))) f.push('open pipeline point missing');
        if (!n.points.some((p: string) => p.startsWith('Lost before'))) f.push('lost deal point missing');
        if (!n.points.some((p: string) => p === 'Last logged activity 12 days ago.')) f.push('last activity point wrong');
        if (!n.html.includes('Vance Logistics') || !n.html.includes('120 employees')) f.push('company block missing');
        return f;
      },
    },
    {
      name: 'webhook booking, HubSpot on, test send', start: 'Calendly booking received', input: [booking()],
      overrides: { USE_HUBSPOT: true, TEST_EMAIL: 'you@example.com', EVENT_TYPES: ['Discovery call'] },
      mocks: {
        'Find the contact in HubSpot': [{ total: 0, results: [] }],
        'Find the company by domain': [{ total: 1, results: [{ id: '900', properties: { name: 'Berg Freight', industry: 'LOGISTICS_AND_SUPPLY_CHAIN', numberofemployees: '45', annualrevenue: '', city: 'Hamburg', country: 'Germany' } }] }],
        'Find deals for the contact': [{ total: 0, results: [] }],
        'Email the note to the host': [{ id: 'msg_1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Collect the CRM context', 'Email the note to the host'], notReached: ['Load sample CRM data'], outward: 'some' },
      check: out => {
        const n = out['Build the prep note'][0];
        const f: string[] = [];
        if (n.send_to !== 'you@example.com' || n.host_email !== 'theo@yourcompany.example') f.push('test send should go to TEST_EMAIL and name the host');
        if (!n.points[0].startsWith('Not in HubSpot yet')) f.push('unknown contact point missing');
        if (!n.html.includes('Berg Freight')) f.push('company found by domain should be in the note');
        return f;
      },
    },
    {
      name: 'cancellation is ignored', start: 'Calendly booking received', input: [booking('invitee.canceled')],
      expect: { reached: ['STOP: not a new booking for a listed event type'], notReached: ['Use sample CRM data?'], outward: 'none' },
    },
  ],
});
