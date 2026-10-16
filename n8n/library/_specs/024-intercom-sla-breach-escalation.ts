import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'intercom-sla-breach-escalation',
  title: 'Escalate Intercom conversations waiting past SLA to Slack',
  summary: 'Every 10 minutes measures how long each open Intercom conversation has waited since the customer last wrote, against a per-tier SLA counted in business hours, and posts each breach to Slack once, with a second, louder post at twice the SLA.',
  category: 'Customer support',
  description: {
    who: 'Support managers on Intercom who promise reply times by plan (one hour for enterprise, four business hours for pro) and only find out about a miss when the customer complains.',
    how: [
      'Every 10 minutes it searches Intercom for open conversations, or uses 7 sample conversations until Intercom is connected.',
      'Each conversation gets a tier from its tags or priority flag, and the time since the customer last wrote is measured on that tier\'s clock: around the clock for enterprise, weekdays 09:00 to 18:00 for the rest.',
      'Past 80% of the SLA it is at risk; past 100% it is breached; past 200% it escalates with a mention.',
      'Each breach level posts once. The key is the conversation and the moment the customer started waiting, so a new customer message starts a new clock.',
    ],
    setup: [
      'Run it once as imported. It measures the sample conversations and stops at `STOP: dry run - nothing posted`.',
      'Add an Intercom credential to `Search open Intercom conversations` and set `USE_INTERCOM = true`.',
      'Set `SLACK_CHANNEL_ID`, and check `TIER_TAGS`, `SLA_BY_TIER` and `BUSINESS_HOURS` match your plans and team.',
      'Set `DRY_RUN = false` and activate the workflow. Escalation memory is kept in workflow static data, which n8n only saves on activated runs.',
    ],
    requirements: ['An Intercom workspace with API access', 'A Slack workspace'],
    customize: [
      '`SLA_BY_TIER` sets minutes and clock (`24x7` or `business`) per tier.',
      '`WARN_AT_PCT` and `ESCALATE_AT_PCT` set the at-risk and second-level lines.',
      '`ESCALATION_MENTION` is who gets tagged at the second level, for example `<!here>` or a user group.',
    ],
  },
  config: {
    intro: ['USE_INTERCOM false -> SAMPLE conversations.', 'SLACK_CHANNEL_ID blank -> nothing is posted. DRY_RUN true -> nothing is posted or remembered.'],
    consts: [
      { name: 'USE_INTERCOM', value: false, note: 'set true after adding the Intercom credential to the search node' },
      { name: 'TIER_TAGS', value: { Enterprise: 'enterprise', VIP: 'enterprise', 'Pro plan': 'pro' }, note: 'Intercom tag name -> tier; untagged conversations are standard' },
      { name: 'PRIORITY_TIER', value: 'enterprise', note: 'tier for conversations marked priority in Intercom' },
      { name: 'SLA_BY_TIER', value: { enterprise: { minutes: 60, clock: '24x7' }, pro: { minutes: 240, clock: 'business' }, standard: { minutes: 480, clock: 'business' } }, note: 'reply target per tier and which clock it runs on' },
      { name: 'BUSINESS_HOURS', value: { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 18 }, note: 'business clock: ISO weekdays (1 = Monday) and hours in TIMEZONE' },
      { name: 'TIMEZONE', value: 'Europe/London', note: 'IANA timezone of the support team' },
      { name: 'WARN_AT_PCT', value: 80, note: 'conversations past this share of their SLA are listed as at risk' },
      { name: 'ESCALATE_AT_PCT', value: 200, note: 'past this share the breach is posted again with a mention' },
      { name: 'ESCALATION_MENTION', value: '<!here>', note: 'Slack mention for the second level' },
      { name: 'INTERCOM_APP_URL', value: 'https://app.intercom.com/a/inbox/your-workspace-id/inbox/conversation/', note: 'prefix for conversation links in Slack' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'escalation channel; blank posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 10 minutes', '*/10 * * * *'),
    ifTrue('Intercom connected?', cfg('use_intercom')),
    http('Search open Intercom conversations', {
      method: 'POST', url: 'https://api.intercom.io/conversations/search', auth: 'intercomApi', outward: false,
      headers: { 'Intercom-Version': '2.11', Accept: 'application/json' },
      jsonBody: "JSON.stringify({ query: { operator: 'AND', value: [{ field: 'state', operator: '=', value: 'open' }] }, pagination: { per_page: 150 } })",
    }),
    code('Read Intercom conversations', `
// Search response -> one item per conversation. waiting_since is the moment the
// customer last wrote after an admin reply; null means the team spoke last.
const out = [];
for (const page of $input.all()) {
  for (const c of page.json.conversations || []) {
    out.push({ json: {
      id: String(c.id), subject: c.source?.subject || c.title || (c.source?.body || '').replace(/<[^>]+>/g, '').slice(0, 60),
      customer: c.source?.author?.name || c.source?.author?.email || 'unknown',
      tags: (c.tags?.tags || []).map(t => t.name), priority: c.priority === 'priority',
      waiting_since: c.waiting_since ? new Date(c.waiting_since * 1000).toISOString() : null,
      snoozed: c.state === 'snoozed' || Boolean(c.snoozed_until), assignee: c.admin_assignee_id ? String(c.admin_assignee_id) : '',
    } });
  }
}
return out;`),
    code('Load sample conversations', `
// Used until USE_INTERCOM is true. Waits are relative to now so the result does not
// depend on when it runs: the business-clock breach waited 3 days.
const ago = m => new Date(Date.now() - m * 60000).toISOString();
return [
  { id: '1001', subject: 'SSO login loop after IdP change', customer: 'Priya Shah (Kestrel Bank)', tags: ['Enterprise'], priority: false, waiting_since: ago(95), snoozed: false, assignee: '4412' },
  { id: '1002', subject: 'API returning 429 for all keys', customer: 'Marco Diaz (Halcyon Air)', tags: ['VIP'], priority: false, waiting_since: ago(150), snoozed: false, assignee: '' },
  { id: '1003', subject: 'Payment failed on renewal', customer: 'Lena Fischer', tags: [], priority: true, waiting_since: ago(50), snoozed: false, assignee: '4415' },
  { id: '1004', subject: 'Where do I change my logo?', customer: 'Owen Price', tags: [], priority: false, waiting_since: ago(30), snoozed: false, assignee: '' },
  { id: '1005', subject: 'Waiting on customer screenshots', customer: 'Ada Brooks', tags: ['Pro plan'], priority: false, waiting_since: ago(300), snoozed: true, assignee: '4412' },
  { id: '1006', subject: 'Thanks, that worked', customer: 'Hugo Lam', tags: [], priority: false, waiting_since: null, snoozed: false, assignee: '4415' },
  { id: '1007', subject: 'Report export missing columns', customer: 'Sara Quinn (Tallow Foods)', tags: ['Pro plan'], priority: false, waiting_since: ago(3 * 1440), snoozed: false, assignee: '4419' },
].map(json => ({ json }));`),
    merge('Combine conversation sources'),
    code('Measure waiting time against SLA', `
// Tier from tags (or the priority flag), then minutes waited on that tier's clock.
// The business clock walks the wait in 5 minute steps in TIMEZONE, capped at 10 days.
const cfg = $('config').first().json;
const bh = cfg.business_hours;
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
const DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const cache = {};
const isOpen = ms => {
  const k = Math.floor(ms / 900000);
  if (!(k in cache)) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(k * 900000)).map(x => [x.type, x.value]));
    const h = Number(p.hour) % 24;
    cache[k] = bh.days.includes(DAY[p.weekday]) && h >= bh.start_hour && h < bh.end_hour;
  }
  return cache[k];
};
const businessMinutes = (from, to) => {
  let m = 0;
  for (let t = Math.max(from, to - 10 * 864e5); t < to; t += 300000) if (isOpen(t)) m += Math.min(5, (to - t) / 60000);
  return Math.round(m);
};
const now = Date.now();
const rows = [];
for (const { json: c } of $input.all()) {
  if (c.snoozed) { rows.push({ ...c, status: 'skipped', note: 'snoozed' }); continue; }
  if (!c.waiting_since) { rows.push({ ...c, status: 'not waiting', note: 'team replied last' }); continue; }
  const tagTier = c.tags.map(t => cfg.tier_tags[t]).find(Boolean);
  const tier = c.priority ? cfg.priority_tier : (tagTier || 'standard');
  const sla = cfg.sla_by_tier[tier] || cfg.sla_by_tier.standard;
  const from = new Date(c.waiting_since).getTime();
  const waited = sla.clock === '24x7' ? Math.round((now - from) / 60000) : businessMinutes(from, now);
  const pct = Math.round(waited / sla.minutes * 100);
  const level = pct >= cfg.escalate_at_pct ? 2 : pct >= 100 ? 1 : 0;
  const status = level ? 'breached' : pct >= cfg.warn_at_pct ? 'at risk' : 'ok';
  rows.push({ ...c, tier, sla_minutes: sla.minutes, clock: sla.clock, waited_minutes: waited, pct, level, status, note: '' });
}
return rows.map(json => ({ json }));`),
    code('Keep new breaches only', `
// A breach is posted once per level. The key is conversation + waiting_since + level,
// so a fresh customer message starts a new clock and a reposted level never repeats.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const seen = memory.escalated || {};
const rows = $input.all().map(i => i.json);
const escalate = [], already = [];
for (const r of rows.filter(r => r.status === 'breached')) {
  const key = r.id + ':' + r.waiting_since + ':L' + r.level;
  if (seen[key]) already.push({ id: r.id, key, reason: 'level ' + r.level + ' already posted ' + seen[key] });
  else escalate.push({ ...r, key });
}
escalate.sort((a, b) => b.level - a.level || b.pct - a.pct);
return [{ json: {
  escalate, already,
  at_risk: rows.filter(r => r.status === 'at risk'),
  counts: rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}),
} }];`),
    code('Write the escalation', `
// One Slack message per run. Second-level breaches lead and carry the mention.
const cfg = $('config').first().json;
const d = $input.first().json;
const dur = m => m >= 120 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
const line = r => '- <' + cfg.intercom_app_url + r.id + '|' + r.subject + '> (' + r.customer + ', ' + r.tier + ') waited ' + dur(r.waited_minutes)
  + (r.clock === 'business' ? ' business' : '') + ' of ' + dur(r.sla_minutes) + ' (' + r.pct + '%)' + (r.assignee ? '' : ', *unassigned*');
const l2 = d.escalate.filter(r => r.level === 2), l1 = d.escalate.filter(r => r.level === 1);
const text = [
  ...(l2.length ? [cfg.escalation_mention + ' *' + l2.length + ' conversation' + (l2.length === 1 ? '' : 's') + ' past ' + cfg.escalate_at_pct + '% of SLA*', ...l2.map(line), ''] : []),
  ...(l1.length ? ['*' + l1.length + ' new SLA breach' + (l1.length === 1 ? '' : 'es') + '*', ...l1.map(line), ''] : []),
  ...(d.at_risk.length ? ['At risk: ' + d.at_risk.map(r => r.subject + ' (' + r.pct + '%)').join(', ')] : []),
].join('\\n').trim();
return [{ json: { text, new_breaches: d.escalate.length, keys: d.escalate.map(r => r.key) } }];`),
    ifTrue('Anything new to escalate?', '$json.new_breaches > 0'),
    stop('STOP: no new breaches'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the escalation to Slack', cfg('slack_channel_id'), '$json.text'),
    code('Remember escalated breaches', `
// Only after a live post: record each key so the next run stays quiet about it.
// Keys older than 14 days are dropped to keep static data small.
const memory = $getWorkflowStaticData('global');
const seen = memory.escalated || {};
const now = new Date().toISOString();
for (const k of $('Write the escalation').first().json.keys) seen[k] = now;
const cutoff = new Date(Date.now() - 14 * 864e5).toISOString();
for (const [k, v] of Object.entries(seen)) if (v < cutoff) delete seen[k];
memory.escalated = seen;
return [{ json: { remembered: Object.keys(seen).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 10 minutes', 'config'],
    ['config', 'Intercom connected?'],
    ['Intercom connected?', 0, 'Search open Intercom conversations'], ['Intercom connected?', 1, 'Load sample conversations'],
    ['Search open Intercom conversations', 'Read Intercom conversations'],
    ['Read Intercom conversations', 'Combine conversation sources'], ['Load sample conversations', 0, 'Combine conversation sources', 1],
    ['Combine conversation sources', 'Measure waiting time against SLA'],
    ['Measure waiting time against SLA', 'Keep new breaches only'],
    ['Keep new breaches only', 'Write the escalation'],
    ['Write the escalation', 'Anything new to escalate?'],
    ['Anything new to escalate?', 0, 'Slack channel set?'], ['Anything new to escalate?', 1, 'STOP: no new breaches'],
    ['Slack channel set?', 0, 'Live run?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live run?', 0, 'Post the escalation to Slack'], ['Live run?', 1, 'STOP: dry run - nothing posted'],
    ['Post the escalation to Slack', 'Remember escalated breaches'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Checks every 10 minutes. Tiers, SLA targets, the business-hours clock and the timezone sit in `config`, so a new plan or a changed rota is one edit.', nodes: ['Run manually', 'Every 10 minutes', 'config'] },
    { title: 'Read open conversations', why: 'One search call returns up to 150 open conversations with `waiting_since`, which already marks when the customer last wrote. `Load sample conversations` gives the same shape until `USE_INTERCOM` is true.', nodes: ['Intercom connected?', 'Search open Intercom conversations', 'Read Intercom conversations', 'Load sample conversations', 'Combine conversation sources'] },
    { title: 'Measure against the SLA', why: 'A Friday 17:55 message on a business clock has used 5 minutes by Monday morning, not 64 hours. `Keep new breaches only` checks static memory so each breach level is announced exactly once.', nodes: ['Measure waiting time against SLA', 'Keep new breaches only'] },
    { title: 'Post and remember', why: 'Three gates keep a quiet run, a blank channel and a dry run silent. Breaches are remembered only after `Post the escalation to Slack` succeeds, so a failed post is retried next run.', nodes: ['Write the escalation', 'Anything new to escalate?', 'STOP: no new breaches', 'Slack channel set?', 'STOP: no Slack channel', 'Live run?', 'STOP: dry run - nothing posted', 'Post the escalation to Slack', 'Remember escalated breaches'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample conversations', 'STOP: no Slack channel'], notReached: ['Remember escalated breaches'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const rows = out['Measure waiting time against SLA'];
        const by = (id: string) => rows.find((r: any) => r.id === id);
        const want: Record<string, [string, number?]> = { '1001': ['breached', 1], '1002': ['breached', 2], '1003': ['at risk'], '1004': ['ok'], '1005': ['skipped'], '1006': ['not waiting'], '1007': ['breached', 2] };
        for (const [id, [st, lvl]] of Object.entries(want)) {
          if (by(id)?.status !== st) f.push(`${id} should be ${st}, got ${by(id)?.status}`);
          if (lvl !== undefined && by(id)?.level !== lvl) f.push(`${id} should be level ${lvl}, got ${by(id)?.level}`);
        }
        if (by('1004').waited_minutes > 30) f.push('business clock cannot exceed wall clock');
        if (by('1003').tier !== 'enterprise') f.push('priority conversation should use PRIORITY_TIER');
        const w = out['Write the escalation'][0];
        if (w.new_breaches !== 3 || !w.text.startsWith('<!here>')) f.push('3 new breaches expected, second level first with the mention');
        return f;
      },
    },
    {
      name: 'live with Intercom and Slack', start: 'Every 10 minutes',
      overrides: { USE_INTERCOM: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0SUPPORT' },
      mocks: {
        'Search open Intercom conversations': [{ type: 'conversation.list', total_count: 2, conversations: [
          { type: 'conversation', id: '88001', title: null, state: 'open', priority: 'not_priority', waiting_since: Math.floor(Date.now() / 1000) - 75 * 60, snoozed_until: null,
            admin_assignee_id: null, tags: { type: 'tag.list', tags: [{ type: 'tag', id: '1', name: 'Enterprise' }] },
            source: { subject: '', body: '<p>Our webhooks stopped firing at noon</p>', author: { type: 'user', name: 'Iris Wong', email: 'iris@pellucid.example' } } },
          { type: 'conversation', id: '88002', title: 'Quick question', state: 'open', priority: 'not_priority', waiting_since: null, snoozed_until: null,
            admin_assignee_id: 5, tags: { type: 'tag.list', tags: [] }, source: { subject: 'Quick question', body: '', author: { type: 'user', name: 'Ray', email: 'ray@pellucid.example' } } },
        ] }],
        'Post the escalation to Slack': [{ ok: true }],
      },
      expect: { reached: ['Post the escalation to Slack', 'Remember escalated breaches'], notReached: ['Load sample conversations'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Write the escalation'][0];
        if (w.new_breaches !== 1 || !w.text.includes('Our webhooks stopped firing')) f.push('88001 should be the one new breach, subject from the body');
        if (!w.text.includes('unassigned')) f.push('unassigned conversation should be marked');
        if (out['Remember escalated breaches'][0].remembered !== 1) f.push('one key should be remembered');
        return f;
      },
    },
  ],
});
