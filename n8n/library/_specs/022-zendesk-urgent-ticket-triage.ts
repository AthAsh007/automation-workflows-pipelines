import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'zendesk-urgent-ticket-triage',
  title: 'Triage new Zendesk tickets by urgency with OpenAI and alert Slack',
  summary: 'Scores every new Zendesk ticket with outage, urgency, billing and VIP rules (plus an optional OpenAI read), raises its priority and tags it, and pages a Slack channel for tickets that just became urgent.',
  category: 'Customer support',
  description: {
    who: 'Support leads on Zendesk whose queue is sorted by arrival time, so an outage report from a key account can sit behind twenty password resets. It checks the new queue every 15 minutes.',
    how: [
      'Every 15 minutes it searches Zendesk for new tickets from the last 30 minutes that are not yet tagged `auto_triaged`, or uses 6 sample tickets until Zendesk is connected.',
      'Each ticket gets points for outage words (40), urgency words (25), billing words (20), a VIP organisation or domain (30) and a requester with several new tickets (10).',
      'With `USE_OPENAI` on, a model also rates each ticket and the higher of the two levels wins. A ticket is never lowered below the priority it already has.',
      'A live run sets priority and tags on the ticket with an internal note listing the reasons, and pages Slack for tickets that just became urgent.',
    ],
    setup: [
      'Run it once as imported. It scores the sample tickets and stops at `STOP: dry run - tickets untouched`.',
      'Add a Zendesk credential to `Search new Zendesk tickets` and `Set priority and tags in Zendesk`, fill in `ZENDESK_SUBDOMAIN` and set `USE_ZENDESK = true`.',
      'Put your key accounts in `VIP_ORGS` and `VIP_DOMAINS`, and a channel id in `SLACK_CHANNEL_ID`.',
      'Optionally add an OpenAI credential and set `USE_OPENAI = true`. Set `DRY_RUN = false` once the levels look right.',
    ],
    requirements: ['A Zendesk Support account with API access', 'A Slack workspace', 'Optional: an OpenAI API key'],
    customize: [
      '`OUTAGE_WORDS`, `URGENT_WORDS` and `MONEY_WORDS` hold the phrases; `POINTS` sets what each is worth.',
      '`LEVEL_THRESHOLDS` decides how many points make a ticket urgent, high or normal.',
      '`PAGE_LEVELS` lists the levels that page Slack.',
    ],
  },
  config: {
    intro: ['USE_ZENDESK false -> SAMPLE tickets. USE_OPENAI false -> rules only.', 'SLACK_CHANNEL_ID blank -> nobody is paged. DRY_RUN true -> Zendesk is not changed.'],
    consts: [
      { name: 'USE_ZENDESK', value: false, note: 'set true after adding the Zendesk credential to both Zendesk nodes' },
      { name: 'ZENDESK_SUBDOMAIN', value: 'yourcompany', note: 'the part before .zendesk.com' },
      { name: 'LOOKBACK_MINUTES', value: 30, note: 'new tickets created in this window are read; overlap with the 15 minute schedule is intended' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model under Rate urgency with OpenAI' },
      { name: 'VIP_ORGS', value: ['Brightlane Logistics', 'Northwind Health'], note: 'Zendesk organisation names that count as key accounts' },
      { name: 'VIP_DOMAINS', value: ['brightlane.example', 'northwind-health.example'], note: 'requester email domains that count as key accounts' },
      { name: 'OUTAGE_WORDS', value: ['down', 'outage', 'cannot log in', 'unable to log in', '500 error', 'not working', 'stopped working', 'data loss'], note: 'phrases that suggest something is broken' },
      { name: 'URGENT_WORDS', value: ['urgent', 'asap', 'immediately', 'emergency', 'critical'], note: 'phrases that ask for speed' },
      { name: 'MONEY_WORDS', value: ['charged twice', 'refund', 'double charge', 'overcharged', 'wrong invoice'], note: 'billing problems' },
      { name: 'POINTS', value: { outage: 40, urgent: 25, money: 20, vip: 30, repeat: 10 }, note: 'points per rule that fires' },
      { name: 'LEVEL_THRESHOLDS', value: { urgent: 60, high: 35, normal: 15 }, note: 'minimum points for each level; below normal is low' },
      { name: 'PAGE_LEVELS', value: ['urgent'], note: 'levels that page Slack when this run raised a ticket to them' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'on-call channel; blank pages nobody' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 15 minutes', '*/15 * * * *'),
    ifTrue('Zendesk connected?', cfg('use_zendesk')),
    http('Search new Zendesk tickets', {
      url: `={{ 'https://' + ${cfg('zendesk_subdomain')} + '.zendesk.com/api/v2/search.json' }}`, auth: 'zendeskApi',
      query: {
        query: `={{ 'type:ticket status:new -tags:auto_triaged created>' + new Date(Date.now() - ${cfg('lookback_minutes')} * 60000).toISOString().slice(0, 19) + 'Z' }}`,
        sort_by: 'created_at', sort_order: 'asc', include: 'tickets(users,organizations)',
      },
    }),
    code('Read Zendesk tickets', `
// Search response -> one item per ticket. Requester email and organisation name
// come from the sideloaded users and organizations arrays.
const out = [];
for (const page of $input.all()) {
  const users = Object.fromEntries((page.json.users || []).map(u => [u.id, u]));
  const orgs = Object.fromEntries((page.json.organizations || []).map(o => [o.id, o]));
  for (const t of page.json.results || []) {
    if (t.result_type && t.result_type !== 'ticket') continue;
    out.push({ json: {
      id: t.id, subject: t.subject || '', body: t.description || '', priority: t.priority || null,
      tags: t.tags || [], requester_email: users[t.requester_id]?.email || '', requester_name: users[t.requester_id]?.name || '',
      org_name: orgs[t.organization_id]?.name || '', created_at: t.created_at, channel: t.via?.channel || '',
    } });
  }
}
return out;`),
    code('Load sample tickets', `
// Used until USE_ZENDESK is true. Six new tickets that hit every rule at least once.
const ago = m => new Date(Date.now() - m * 60000).toISOString();
return [
  { id: 9101, subject: 'Dashboard down for our whole team', body: "Since 9am none of our 40 users can log in, everyone gets a 500 error. This is urgent.", priority: null, tags: [], requester_email: 'ops@brightlane.example', requester_name: 'Dana Pruitt', org_name: 'Brightlane Logistics', created_at: ago(12), channel: 'email' },
  { id: 9102, subject: 'Charged twice for October', body: 'My card was charged twice this month. Please refund the duplicate payment.', priority: 'normal', tags: [], requester_email: 'sam@fernhill.example', requester_name: 'Sam Okafor', org_name: '', created_at: ago(20), channel: 'web' },
  { id: 9103, subject: 'How do I export invoices to CSV?', body: 'Looking for the export button for last quarter. Thanks!', priority: null, tags: [], requester_email: 'lee@maplecourt.example', requester_name: 'Lee Varga', org_name: '', created_at: ago(25), channel: 'web' },
  { id: 9104, subject: 'Need admin access asap', body: 'Our admin left and I need owner rights asap, board meeting at 2pm. Urgent please.', priority: 'low', tags: [], requester_email: 'cfo@northwind-health.example', requester_name: 'Ravi Menon', org_name: '', created_at: ago(8), channel: 'email' },
  { id: 9105, subject: 'Sync not working', body: 'Calendar sync has stopped working since the update yesterday.', priority: null, tags: [], requester_email: 'jo@quarrystone.example', requester_name: 'Jo Harlow', org_name: 'Quarrystone', created_at: ago(28), channel: 'email' },
  { id: 9106, subject: 'Following up: sync still not working', body: 'Any news? Still not working for the team.', priority: 'urgent', tags: ['vip_followup'], requester_email: 'jo@quarrystone.example', requester_name: 'Jo Harlow', org_name: 'Quarrystone', created_at: ago(5), channel: 'email' },
].map(json => ({ json }));`),
    merge('Combine ticket sources'),
    code('Score tickets by rules', `
// Plain rules first, so triage works with no model and every level can be explained.
// Each rule that fires adds its POINTS and a reason; LEVEL_THRESHOLDS turns points into a level.
const cfg = $('config').first().json;
const tickets = $input.all().map(i => i.json);
const lc = s => String(s || '').toLowerCase();
const hits = (text, words) => words.filter(w => text.includes(w.toLowerCase()));
const perRequester = {};
for (const t of tickets) perRequester[lc(t.requester_email)] = (perRequester[lc(t.requester_email)] || 0) + 1;
const vipOrgs = cfg.vip_orgs.map(lc), vipDomains = cfg.vip_domains.map(lc);
const P = cfg.points, th = cfg.level_thresholds;
return tickets.map(t => {
  const text = lc(t.subject + ' ' + t.body);
  const domain = lc(t.requester_email).split('@')[1] || '';
  const reasons = []; let score = 0;
  const o = hits(text, cfg.outage_words); if (o.length) { score += P.outage; reasons.push('outage: ' + o.join(', ')); }
  const u = hits(text, cfg.urgent_words); if (u.length) { score += P.urgent; reasons.push('urgency: ' + u.join(', ')); }
  const m = hits(text, cfg.money_words); if (m.length) { score += P.money; reasons.push('billing: ' + m.join(', ')); }
  if (vipOrgs.includes(lc(t.org_name)) || vipDomains.includes(domain)) { score += P.vip; reasons.push('key account: ' + (t.org_name || domain)); }
  if (t.requester_email && perRequester[lc(t.requester_email)] > 1) { score += P.repeat; reasons.push(perRequester[lc(t.requester_email)] + ' new tickets from this requester'); }
  const level = score >= th.urgent ? 'urgent' : score >= th.high ? 'high' : score >= th.normal ? 'normal' : 'low';
  return { json: { ...t, rule_score: score, rule_level: level, rule_reasons: reasons } };
});`),
    ifTrue('OpenAI switched on?', cfg('use_openai')),
    aiAgent('Rate urgency with OpenAI', {
      prompt: 'Ticket subject: {{ $json.subject }}\nTicket body: {{ $json.body }}\nOrganisation: {{ $json.org_name || "none" }}',
      system: 'You triage customer support tickets for a software company. Rate how urgent this ticket is: urgent (service down, data loss, many users blocked, a deadline today), high (one user blocked, billing error), normal (a problem with a workaround) or low (a question or request). Give a reason under 15 words. Do not invent facts.',
      schemaExample: { level: 'high', reason: 'Single admin locked out before a meeting today' },
    }),
    code('Keep rule levels', `
// USE_OPENAI is off: the rule level is the final level.
return $input.all().map(it => ({ json: { ...it.json, ai_level: null, ai_reason: '', level: it.json.rule_level, reasons: it.json.rule_reasons } }));`),
    merge('Combine scored tickets'),
    code('Blend model and rule levels', `
// Model items carry only { output }, so they are paired back to the scored ticket by
// position. The higher of the rule level and the model level wins: the model can
// raise a ticket the rules missed but can never lower one the rules caught.
const rank = { low: 0, normal: 1, high: 2, urgent: 3 };
const scored = $('Score tickets by rules').all();
return $input.all().map((it, i) => {
  if (!('output' in it.json)) return it;
  const t = scored[i].json;
  const ai = it.json.output || {};
  const aiLevel = rank[ai.level] !== undefined ? ai.level : null;
  const useAi = aiLevel && rank[aiLevel] > rank[t.rule_level];
  return { json: { ...t, ai_level: aiLevel, ai_reason: ai.reason || '',
    level: useAi ? aiLevel : t.rule_level,
    reasons: useAi ? [...t.rule_reasons, 'model: ' + (ai.reason || aiLevel)] : t.rule_reasons } };
});`),
    code('Decide priority changes', `
// A ticket is never lowered: Zendesk's current priority is the floor. Every ticket is
// tagged auto_triaged so the next run's search skips it. Pages go out only for tickets
// this run raised into PAGE_LEVELS; one that was already urgent is someone's already.
const cfg = $('config').first().json;
const rank = { low: 0, normal: 1, high: 2, urgent: 3 };
const updates = [], pages = [], held = [];
for (const { json: t } of $input.all()) {
  const current = t.priority && rank[t.priority] !== undefined ? t.priority : null;
  const finalLevel = current && rank[current] > rank[t.level] ? current : t.level;
  const raise = !current || rank[finalLevel] > rank[current];
  const note = 'Auto-triage: ' + finalLevel + ' (' + t.rule_score + ' rule points). ' + (t.reasons.length ? 'Reasons: ' + t.reasons.join('; ') + '.' : 'No rule fired.');
  updates.push({ id: t.id, subject: t.subject, from: current, to: finalLevel, raise, tags: ['auto_triaged', 'triage_' + finalLevel], note });
  if (cfg.page_levels.includes(finalLevel)) {
    if (raise) pages.push({ id: t.id, subject: t.subject, level: finalLevel, requester: t.requester_name || t.requester_email, org: t.org_name, reasons: t.reasons });
    else held.push({ id: t.id, reason: 'already ' + current + ' in Zendesk, not paged' });
  }
}
return [{ json: { updates, pages, held, checked: updates.length, raised: updates.filter(u => u.raise).length } }];`),
    code('Prepare each ticket update', `
// One item per ticket, carrying the exact body the Zendesk update endpoint takes.
// Priority is only sent when it goes up; tags are always added, never replaced.
return $input.first().json.updates.map(u => ({ json: { ...u, body: { ticket: {
  ...(u.raise ? { priority: u.to } : {}),
  additional_tags: u.tags,
  comment: { body: u.note, public: false },
} } } }));`),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - tickets untouched'),
    http('Set priority and tags in Zendesk', {
      method: 'PUT', auth: 'zendeskApi',
      url: `={{ 'https://' + ${cfg('zendesk_subdomain')} + '.zendesk.com/api/v2/tickets/' + $json.id + '.json' }}`,
      jsonBody: 'JSON.stringify($json.body)',
    }),
    code('Write the Slack page', `
// One message for every ticket this run raised into PAGE_LEVELS, newest problem first.
const cfg = $('config').first().json;
const d = $input.first().json;
const link = id => 'https://' + cfg.zendesk_subdomain + '.zendesk.com/agent/tickets/' + id;
const lines = d.pages.map(p => '- <' + link(p.id) + '|#' + p.id + '> *' + p.subject + '* (' + p.requester + (p['org'] ? ', ' + p['org'] : '') + ')\\n   ' + p.reasons.join('; '));
const text = [
  ':rotating_light: *' + d.pages.length + ' ticket' + (d.pages.length === 1 ? '' : 's') + ' raised to ' + cfg.page_levels.join('/') + '*' + (cfg.mode === 'preview' ? ' (dry run)' : ''),
  ...lines,
  '', d.checked + ' new tickets triaged, ' + d.raised + ' priorities raised.',
].join('\\n');
return [{ json: { text, pages: d.pages.length } }];`),
    ifTrue('Anyone to page?', '$json.pages > 0'),
    stop('STOP: nothing urgent'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live page?', cfg('live')),
    stop('STOP: dry run - nobody paged'),
    slack.post('Page the on-call channel', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 15 minutes', 'config'],
    ['config', 'Zendesk connected?'],
    ['Zendesk connected?', 0, 'Search new Zendesk tickets'], ['Zendesk connected?', 1, 'Load sample tickets'],
    ['Search new Zendesk tickets', 'Read Zendesk tickets'],
    ['Read Zendesk tickets', 'Combine ticket sources'], ['Load sample tickets', 0, 'Combine ticket sources', 1],
    ['Combine ticket sources', 'Score tickets by rules'],
    ['Score tickets by rules', 'OpenAI switched on?'],
    ['OpenAI switched on?', 0, 'Rate urgency with OpenAI'], ['OpenAI switched on?', 1, 'Keep rule levels'],
    ['Rate urgency with OpenAI model', 'Rate urgency with OpenAI', 'ai_languageModel'],
    ['Rate urgency with OpenAI output format', 'Rate urgency with OpenAI', 'ai_outputParser'],
    ['Rate urgency with OpenAI', 'Combine scored tickets'], ['Keep rule levels', 0, 'Combine scored tickets', 1],
    ['Combine scored tickets', 'Blend model and rule levels'],
    ['Blend model and rule levels', 'Decide priority changes'],
    ['Decide priority changes', 'Prepare each ticket update'],
    ['Decide priority changes', 'Write the Slack page'],
    ['Prepare each ticket update', 'Live run?'],
    ['Live run?', 0, 'Set priority and tags in Zendesk'], ['Live run?', 1, 'STOP: dry run - tickets untouched'],
    ['Write the Slack page', 'Anyone to page?'],
    ['Anyone to page?', 0, 'Slack channel set?'], ['Anyone to page?', 1, 'STOP: nothing urgent'],
    ['Slack channel set?', 0, 'Live page?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live page?', 0, 'Page the on-call channel'], ['Live page?', 1, 'STOP: dry run - nobody paged'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 15 minutes or by hand. Word lists, points, thresholds and VIP accounts all live in `config`, so tuning the triage never means editing a Code node.', nodes: ['Run manually', 'Every 15 minutes', 'config'] },
    { title: 'Read the new queue', why: 'The search excludes tickets already tagged `auto_triaged`, so the overlapping 30 minute window never handles a ticket twice. `Load sample tickets` feeds the same shape until `USE_ZENDESK` is true.', nodes: ['Zendesk connected?', 'Search new Zendesk tickets', 'Read Zendesk tickets', 'Load sample tickets', 'Combine ticket sources'] },
    { title: 'Score by rules, then the model', why: 'Rules run on every ticket first and the model is optional. `Blend model and rule levels` takes the higher of the two, so turning OpenAI on can only add catches, never drop an outage the rules found.', nodes: ['Score tickets by rules', 'OpenAI switched on?', 'Rate urgency with OpenAI', 'Keep rule levels', 'Combine scored tickets', 'Blend model and rule levels'] },
    { title: 'Raise priority and page on-call', why: 'The current priority is a floor, so an agent who set urgent by hand is never overruled and that ticket does not page. Priority is only sent when it rises, tags are added, not replaced, and nothing is written or posted until `DRY_RUN` is false.', nodes: ['Decide priority changes', 'Prepare each ticket update', 'Live run?', 'STOP: dry run - tickets untouched', 'Set priority and tags in Zendesk', 'Write the Slack page', 'Anyone to page?', 'STOP: nothing urgent', 'Slack channel set?', 'STOP: no Slack channel', 'Live page?', 'STOP: dry run - nobody paged', 'Page the on-call channel'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample tickets', 'Keep rule levels', 'STOP: dry run - tickets untouched', 'STOP: no Slack channel'], notReached: ['Rate urgency with OpenAI'], outward: 'none' },
      check: out => {
        const d = out['Decide priority changes'][0];
        const f: string[] = [];
        const to = (id: number) => d.updates.find((u: any) => u.id === id)?.to;
        const want: Record<number, string> = { 9101: 'urgent', 9102: 'normal', 9103: 'low', 9104: 'high', 9105: 'high', 9106: 'urgent' };
        for (const [id, lvl] of Object.entries(want)) if (to(Number(id)) !== lvl) f.push(`#${id} should be ${lvl}, got ${to(Number(id))}`);
        if (d.raised !== 4) f.push(`expected 4 priorities raised, got ${d.raised}`);
        if (d.pages.length !== 1 || d.pages[0].id !== 9101) f.push('only #9101 should page');
        if (!d.held.some((h: any) => h.id === 9106)) f.push('#9106 was already urgent and should be held');
        if (out['Prepare each ticket update'].find((u: any) => u.id === 9102)?.body.ticket.priority) f.push('#9102 priority unchanged, must not be sent');
        return f;
      },
    },
    {
      name: 'live with Zendesk, OpenAI and Slack', start: 'Every 15 minutes',
      overrides: { USE_ZENDESK: true, USE_OPENAI: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0ONCALL' },
      mocks: {
        'Search new Zendesk tickets': [{ count: 2, results: [
          { result_type: 'ticket', id: 501, subject: 'Exports are empty', description: 'All our CSV exports since this morning are blank files.', priority: null, tags: [], requester_id: 11, organization_id: 21, created_at: new Date().toISOString(), via: { channel: 'email' } },
          { result_type: 'ticket', id: 502, subject: 'Change my username', description: 'Can I change my username?', priority: null, tags: [], requester_id: 12, organization_id: null, created_at: new Date().toISOString(), via: { channel: 'web' } },
        ], users: [{ id: 11, name: 'Ana Ruiz', email: 'ana@tidewater.example' }, { id: 12, name: 'Ben Cole', email: 'ben@cole.example' }],
        organizations: [{ id: 21, name: 'Tidewater Freight' }] }],
        'Rate urgency with OpenAI': (items: any[]) => items.map(t => ({ output: t.id === 501 ? { level: 'urgent', reason: 'All exports blank for a whole company' } : { level: 'low', reason: 'Account question' } })),
        'Set priority and tags in Zendesk': (items: any[]) => items.map(i => ({ ticket: { id: i.id } })),
        'Page the on-call channel': [{ ok: true, ts: '1700000000.0001' }],
      },
      expect: { reached: ['Set priority and tags in Zendesk', 'Page the on-call channel'], notReached: ['Load sample tickets', 'Keep rule levels'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const d = out['Decide priority changes'][0];
        if (d.updates.find((u: any) => u.id === 501)?.to !== 'urgent') f.push('model should raise #501 to urgent');
        if (d.updates.find((u: any) => u.id === 502)?.to !== 'low') f.push('#502 should stay low');
        if (out['Set priority and tags in Zendesk'].length !== 2) f.push('both tickets should be tagged');
        if (!String(out['Write the Slack page'][0].text).includes('#501')) f.push('Slack page should name #501');
        return f;
      },
    },
  ],
});
