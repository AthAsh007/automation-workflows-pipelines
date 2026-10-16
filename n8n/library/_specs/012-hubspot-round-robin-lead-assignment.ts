import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'hubspot-round-robin-lead-assignment',
  title: 'Assign new HubSpot contacts to owners by territory round-robin with Slack alerts',
  summary: 'Every 15 minutes, finds new HubSpot contacts with no owner, maps each to a territory by country and state, picks the next owner in that territory\'s rotation while respecting daily caps and away lists, sets the owner in HubSpot and tags each rep in Slack.',
  category: 'Sales and CRM',
  description: {
    who: 'Sales managers with two or more reps per region who hand out inbound HubSpot leads by hand. Leads get an owner within 15 minutes and the load stays even.',
    how: [
      'Every 15 minutes it searches HubSpot for contacts created in the last day that have no owner, or uses sample contacts until HubSpot is connected.',
      'Country and state (full names or codes) pick a territory from the `TERRITORIES` table. Anything unmatched goes to the fallback territory.',
      'Each territory keeps its own rotation pointer in workflow static data. Owners on `AWAY_OWNERS` or at their daily cap are passed over; if nobody is free the lead is held and named in Slack.',
      'On a live run the owner is written to the HubSpot contact. One Slack message tags each rep with their new leads.',
    ],
    setup: [
      'Run it once as imported. It assigns sample contacts and stops at `STOP: preview - nothing posted` and `STOP: not live - HubSpot untouched`.',
      'Create a HubSpot private app with contacts read and write scopes, add it as a credential to both HubSpot nodes, then set `USE_HUBSPOT = true`.',
      'Fill `OWNERS` with HubSpot owner ids, Slack member ids and daily caps, and edit `TERRITORIES`. Connect Slack and set `SLACK_CHANNEL_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel. The test alert lands there with no @mentions. Set `TEST_RUN = false` to write owners and post to `SLACK_CHANNEL_ID`.',
    ],
    requirements: ['A HubSpot account with a private app token', 'A Slack workspace'],
    customize: [
      '`TERRITORIES` maps countries and states to owner pools; order matters, first match wins.',
      '`OWNERS` holds each rep\'s daily cap. `AWAY_OWNERS` takes people out of rotation for the day.',
      '`LOOKBACK_HOURS` sets how old a contact can be and still get assigned.',
    ],
  },
  config: {
    intro: ['USE_HUBSPOT false -> SAMPLE contacts so the run works before any credential exists.', 'Rotation pointers and daily counts are saved only on a live run.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.'],
    consts: [
      { name: 'USE_HUBSPOT', value: false, note: 'set true after adding the HubSpot credential to both HubSpot nodes' },
      { name: 'OWNERS', value: {
        '101': { name: 'Maya Ortiz', slack_id: 'U01MAYA', daily_cap: 5 },
        '102': { name: 'Theo Grant', slack_id: 'U02THEO', daily_cap: 1 },
        '111': { name: 'Ines Park', slack_id: 'U03INES', daily_cap: 8 },
        '201': { name: 'Owen Blake', slack_id: 'U04OWEN', daily_cap: 8 },
        '301': { name: 'Lena Fox', slack_id: 'U05LENA', daily_cap: 6 },
        '302': { name: 'Ravi Shah', slack_id: 'U06RAVI', daily_cap: 6 },
        '401': { name: 'Sara Lind', slack_id: 'U07SARA', daily_cap: 10 },
      }, note: 'HubSpot owner id -> name, Slack member id, max new leads per day' },
      { name: 'TERRITORIES', value: [
        { name: 'US West', countries: ['US'], states: ['CA', 'OR', 'WA', 'NV', 'AZ', 'UT', 'CO', 'ID', 'MT', 'WY', 'NM', 'AK', 'HI'], owners: ['101', '102'] },
        { name: 'US East', countries: ['US'], states: [], owners: ['111'] },
        { name: 'UK and Ireland', countries: ['GB', 'IE'], states: [], owners: ['201'] },
        { name: 'DACH', countries: ['DE', 'AT', 'CH'], states: [], owners: ['301', '302'] },
        { name: 'Rest of world', countries: ['*'], states: [], owners: ['401'] },
      ], note: 'first match wins; empty states = whole country; * = everything else' },
      { name: 'AWAY_OWNERS', value: ['401'], note: 'owner ids skipped today (holiday, sick, full pipeline)' },
      { name: 'LOOKBACK_HOURS', value: 24, note: 'contacts created within this window are considered' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for assignment alerts; blank posts nothing' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 15 minutes', '*/15 * * * *'),
    ifTrue('Use sample contacts?', '!' + cfg('use_hubspot')),
    code('Load sample contacts', `
// Used until USE_HUBSPOT is true. Mixed name and code formats, one owned, one for an away rep.
const c = (id, firstname, lastname, country, state, owner = '') => ({ id, firstname, lastname, email: firstname.toLowerCase() + '@' + lastname.toLowerCase() + '.example', country, state, company: lastname + ' Ltd', owner_id: owner,
  created: new Date(Date.now() - (100 - Number(id.slice(-2))) * 60e3).toISOString() });
return [
  c('9001', 'Ava', 'Reed', 'US', 'CA'), c('9002', 'Ben', 'Cole', 'United States', 'Washington'), c('9003', 'Cleo', 'Hart', 'USA', 'NY'),
  c('9004', 'Dan', 'Fry', 'United Kingdom', ''), c('9005', 'Eva', 'Lang', 'Germany', 'Bavaria'), c('9006', 'Finn', 'Moss', 'US', 'OR'),
  c('9007', 'Gus', 'Hale', 'us', 'Nevada'), c('9008', 'Hana', 'Ito', 'Japan', ''), c('9009', 'Ivy', 'Shaw', 'Ireland', '', '201'),
].reverse().map(json => ({ json }));`),
    http('Search new unowned contacts', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/contacts/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: `JSON.stringify({ filterGroups: [{ filters: [
        { propertyName: 'createdate', operator: 'GTE', value: String(Date.now() - ${cfg('lookback_hours')} * 3600e3) },
        { propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' } ] }],
        properties: ['email', 'firstname', 'lastname', 'country', 'state', 'company', 'hubspot_owner_id', 'createdate'],
        sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }], limit: 100 })`,
    }),
    code('Read HubSpot contacts', `
// Search response -> one item per contact in the sample shape.
const out = [];
for (const page of $input.all()) for (const r of page.json.results || []) {
  const p = r.properties || {};
  out.push({ json: { id: r.id, firstname: p.firstname || '', lastname: p.lastname || '', email: p.email || '', country: p.country || '', state: p.state || '',
    company: p.company || '', owner_id: p.hubspot_owner_id || '', created: p.createdate || r.createdAt } });
}
return out;`),
    merge('Combine contact sources'),
    code('Assign by territory', `
// Oldest contact first. Each territory rotates through its own owner list; an owner
// who is away or at today's cap is passed over. Pointers and counts are worked on a
// copy and only saved after a live write, so previews never shift the rotation.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const today = new Date().toISOString().slice(0, 10);
const rr = { ...(store.rr || {}) };
const load = store.load?.date === today ? { ...store.load.counts } : {};
const COUNTRY = { 'united states': 'US', usa: 'US', 'u.s.': 'US', america: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  ireland: 'IE', germany: 'DE', deutschland: 'DE', austria: 'AT', switzerland: 'CH', japan: 'JP', canada: 'CA', france: 'FR' };
const STATES = 'AL:alabama,AK:alaska,AZ:arizona,AR:arkansas,CA:california,CO:colorado,CT:connecticut,DE:delaware,FL:florida,GA:georgia,HI:hawaii,ID:idaho,IL:illinois,IN:indiana,IA:iowa,KS:kansas,KY:kentucky,LA:louisiana,ME:maine,MD:maryland,MA:massachusetts,MI:michigan,MN:minnesota,MS:mississippi,MO:missouri,MT:montana,NE:nebraska,NV:nevada,NH:new hampshire,NJ:new jersey,NM:new mexico,NY:new york,NC:north carolina,ND:north dakota,OH:ohio,OK:oklahoma,OR:oregon,PA:pennsylvania,RI:rhode island,SC:south carolina,SD:south dakota,TN:tennessee,TX:texas,UT:utah,VT:vermont,VA:virginia,WA:washington,WV:west virginia,WI:wisconsin,WY:wyoming,DC:district of columbia'
  .split(',').reduce((m, p) => { const [code, name] = p.split(':'); m[name] = code; m[code.toLowerCase()] = code; return m; }, {});
const country = s => { const t = String(s || '').trim(); return COUNTRY[t.toLowerCase()] || t.toUpperCase(); };
const state = s => STATES[String(s || '').trim().toLowerCase()] || String(s || '').trim().toUpperCase();
const assigned = [], held = [], skipped = [];
const contacts = $input.all().map(i => i.json).sort((a, b) => String(a.created).localeCompare(String(b.created)));
for (const c of contacts) {
  if (c.owner_id) { skipped.push({ id: c.id, name: c.firstname + ' ' + c.lastname, reason: 'already owned by ' + c.owner_id }); continue; }
  const cc = country(c.country), st = state(c.state);
  const t = cfg.territories.find(t => (t.countries.includes(cc) && (!t.states.length || t.states.includes(st))) || t.countries.includes('*'));
  const pool = t.owners;
  let start = rr[t.name] || 0, pick = null;
  for (let k = 0; k < pool.length; k++) {
    const id = pool[(start + k) % pool.length];
    const o = cfg.owners[id];
    if (!o || cfg.away_owners.includes(id) || (load[id] || 0) >= o.daily_cap) continue;
    pick = id; rr[t.name] = (start + k + 1) % pool.length; break;
  }
  const who = { id: c.id, name: (c.firstname + ' ' + c.lastname).trim(), email: c.email, company: c.company, territory: t.name, country: cc, state: st };
  if (!pick) { held.push({ ...who, reason: 'no owner free in ' + t.name + ' (away or at daily cap)' }); continue; }
  load[pick] = (load[pick] || 0) + 1;
  assigned.push({ ...who, owner_id: pick, owner_name: cfg.owners[pick].name, owner_slack: cfg.owners[pick].slack_id });
}
return [{ json: { assigned, held, skipped, state: { rr, load: { date: today, counts: load } } } }];`),
    code('Split into one item per assignment', `
// One item per contact for the HubSpot update.
return $input.first().json.assigned.map(a => ({ json: a }));`),
    code('Write the Slack alert', `
// One message for the run, grouped by rep. Test mode names reps instead of tagging them.
const cfg = $('config').first().json;
const { assigned, held } = $input.first().json;
const byOwner = {};
for (const a of assigned) (byOwner[a.owner_id] ||= []).push(a);
const tag = id => cfg.mode === 'live' ? '<@' + cfg.owners[id].slack_id + '>' : cfg.owners[id].name;
const lines = Object.entries(byOwner).map(([id, list]) => tag(id) + ' (' + list.length + '): ' + list.map(a => a.name + (a.company ? ', ' + a.company : '') + ' [' + a.territory + ']').join('; '));
const text = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + '*New leads assigned*: ' + assigned.length + (held.length ? ', ' + held.length + ' waiting for an owner' : ''),
  ...lines,
  ...(held.length ? ['', '*Not assigned*', ...held.map(h => '- ' + h.name + ': ' + h.reason)] : []),
].join('\\n');
return [{ json: { text, send_to: cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id, post: assigned.length + held.length > 0 } }];`),
    ifTrue('Posting switched on?', `$json.post && ${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post assignments to Slack', '$json.send_to', '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: not live - HubSpot untouched'),
    http('Set the contact owner in HubSpot', {
      method: 'PATCH', url: "={{ 'https://api.hubapi.com/crm/v3/objects/contacts/' + $json.id }}", auth: 'hubspotAppToken',
      jsonBody: "JSON.stringify({ properties: { hubspot_owner_id: $json.owner_id } })",
    }),
    code('Save rotation pointers', `
// After the live writes: next run continues each rotation where this one stopped.
const store = $getWorkflowStaticData('global');
const s = $('Assign by territory').first().json.state;
store.rr = s.rr; store.load = s.load;
return [{ json: { saved: true, pointers: s.rr, today: s.load.counts } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 15 minutes', 'config'],
    ['config', 'Use sample contacts?'],
    ['Use sample contacts?', 0, 'Load sample contacts'], ['Use sample contacts?', 1, 'Search new unowned contacts'],
    ['Search new unowned contacts', 'Read HubSpot contacts'],
    ['Load sample contacts', 'Combine contact sources'], ['Read HubSpot contacts', 0, 'Combine contact sources', 1],
    ['Combine contact sources', 'Assign by territory'],
    ['Assign by territory', 'Split into one item per assignment'],
    ['Assign by territory', 'Write the Slack alert'],
    ['Write the Slack alert', 'Posting switched on?'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post assignments to Slack'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
    ['Split into one item per assignment', 'Live run?'],
    ['Live run?', 0, 'Set the contact owner in HubSpot'], ['Live run?', 1, 'STOP: not live - HubSpot untouched'],
    ['Set the contact owner in HubSpot', 'Save rotation pointers'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 15 minutes so a lead never waits long for an owner. Territories, owner caps and the away list are edited in `config` only.', nodes: ['Run manually', 'Every 15 minutes', 'config'] },
    { title: 'Find unowned contacts', why: 'The HubSpot search already filters out owned contacts; `Assign by territory` checks again in case an owner was set between the search and the write. Sample contacts stand in until `USE_HUBSPOT` is true.', nodes: ['Use sample contacts?', 'Load sample contacts', 'Search new unowned contacts', 'Read HubSpot contacts', 'Combine contact sources'] },
    { title: 'Pick owners and alert', why: 'Territory order is first match wins, so specific state rules sit above whole-country ones. A full or away pool holds the lead and names it in Slack instead of overloading one rep. A test alert goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.', nodes: ['Assign by territory', 'Split into one item per assignment', 'Write the Slack alert', 'Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post assignments to Slack'] },
    { title: 'Write owners and save the rotation', why: 'Only `Live run?` writes to HubSpot. `Save rotation pointers` runs after the writes, so a preview or test never moves anyone up or down the rotation.', nodes: ['Live run?', 'STOP: not live - HubSpot untouched', 'Set the contact owner in HubSpot', 'Save rotation pointers'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample contacts', 'STOP: preview - nothing posted', 'STOP: not live - HubSpot untouched'], outward: 'none' },
      check: out => {
        const a = out['Assign by territory'][0];
        const got = a.assigned.map((x: any) => x.id + ':' + x.owner_id).join(',');
        const f: string[] = [];
        if (got !== '9001:101,9002:102,9003:111,9004:201,9005:301,9006:101,9007:101') f.push(`assignments wrong: ${got}`);
        if (a.held.length !== 1 || a.held[0].id !== '9008') f.push('Japan lead should be held (Rest of world owner away)');
        if (a.skipped.length !== 1 || a.skipped[0].id !== '9009') f.push('already-owned contact should be skipped');
        if (a.state.load.counts['102'] !== 1) f.push('Theo should stop at his cap of 1');
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0LEADS' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank', 'STOP: not live - HubSpot untouched'], notReached: ['Post assignments to Slack', 'STOP: preview - nothing posted', 'Set the contact owner in HubSpot'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0LEADS', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post assignments to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post assignments to Slack', 'STOP: not live - HubSpot untouched'], notReached: ['Set the contact owner in HubSpot', 'Save rotation pointers'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Post assignments to Slack'][0]?.channel !== 'C0TESTCHAN') f.push(`test post must go to TEST_SLACK_CHANNEL, went to ${out['Post assignments to Slack'][0]?.channel}`);
        const text = out['Write the Slack alert'][0].text;
        if (!text.startsWith('[TEST] ')) f.push('test alert needs the [TEST] prefix');
        if (text.includes('<@')) f.push('test alert must not tag reps');
        return f;
      },
    },
    {
      name: 'live with HubSpot and Slack', start: 'Every 15 minutes',
      overrides: { USE_HUBSPOT: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0LEADS', AWAY_OWNERS: [] },
      mocks: {
        'Search new unowned contacts': [{ total: 2, results: [
          { id: '5501', properties: { firstname: 'Nora', lastname: 'Vance', email: 'nora@vance.example', country: 'Austria', state: '', company: 'Vance GmbH', hubspot_owner_id: null, createdate: '2026-10-16T08:00:00Z' } },
          { id: '5502', properties: { firstname: 'Kai', lastname: 'Berg', email: 'kai@berg.example', country: 'Switzerland', state: '', company: 'Berg AG', hubspot_owner_id: null, createdate: '2026-10-16T08:05:00Z' } },
        ] }],
        'Post assignments to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })),
        'Set the contact owner in HubSpot': (items: any[]) => items.map(i => ({ id: i.id, properties: { hubspot_owner_id: i.owner_id } })),
      },
      expect: { reached: ['Read HubSpot contacts', 'Post assignments to Slack', 'Set the contact owner in HubSpot', 'Save rotation pointers'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const a = out['Assign by territory'][0].assigned.map((x: any) => x.owner_id).join(',');
        if (a !== '301,302') f.push(`DACH should rotate 301 then 302, got ${a}`);
        if (!out['Write the Slack alert'][0].text.includes('<@U05LENA>')) f.push('live alert should tag reps');
        if (out['Post assignments to Slack'][0]?.channel !== 'C0LEADS') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
