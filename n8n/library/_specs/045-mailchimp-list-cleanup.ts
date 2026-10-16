import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, splitOut, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'mailchimp-list-cleanup',
  title: 'Archive unengaged subscribers in Mailchimp after a dry-run review',
  summary: 'Finds subscribed Mailchimp contacts who have been on the list for 90+ days without opening or clicking, protects VIPs, customer tags and partner domains, caps the batch, and archives them only when DRY_RUN is switched off.',
  category: 'Marketing and content',
  description: {
    who: 'Mailchimp account owners paying for contacts who have not opened an email in months. It gives you a reviewed list of who would be archived before a single contact is touched.',
    how: [
      'On the 1st of each month it reads every subscribed member of one audience, or 8 sample members until Mailchimp is connected.',
      'A member is a candidate when they joined 90+ days ago, their profile has not changed in 180 days, and they have no opens and no clicks (or a 1-star rating with under 5% opens).',
      'Members with a protected tag, the Mailchimp VIP flag or a protected email domain are held back with the reason.',
      'If candidates exceed 30% of the audience the run stops, because that usually means missing stats. Otherwise up to 200 are archived and the count goes to Slack.',
    ],
    setup: [
      'Run it once as imported. It reviews the sample members and stops at `STOP: dry run - nothing archived`.',
      'Add a Mailchimp credential to both Mailchimp nodes, then set `MAILCHIMP_DC`, `LIST_ID` and `USE_MAILCHIMP = true`.',
      'Run it again and read the candidates and held-back reasons in `Pick members to archive`.',
      'When the list looks right, set `DRY_RUN = false`. Archived contacts keep their history and can be re-added.',
    ],
    requirements: ['A Mailchimp audience', 'Optional: a Slack workspace for the result'],
    customize: [
      '`MIN_TENURE_DAYS` and `STALE_DAYS` decide how long someone must be quiet before they qualify.',
      '`PROTECT_TAGS` and `PROTECT_DOMAINS` keep customers, partners and staff on the list whatever their stats.',
      '`MAX_ARCHIVE_PER_RUN` and `MAX_SHARE_PCT` limit how much one run can remove.',
    ],
  },
  config: {
    intro: ['USE_MAILCHIMP false -> SAMPLE members.', 'DRY_RUN true -> candidates are listed and nothing is archived.'],
    consts: [
      { name: 'USE_MAILCHIMP', value: false, note: 'set true after adding the Mailchimp credential' },
      { name: 'MAILCHIMP_DC', value: 'us21', note: 'data centre from your API key, the part after the dash' },
      { name: 'LIST_ID', value: '', note: 'audience id (Audience > Settings > Audience name and defaults)' },
      { name: 'MIN_TENURE_DAYS', value: 90, note: 'members who joined more recently are never candidates' },
      { name: 'STALE_DAYS', value: 180, note: 'profile unchanged for this many days' },
      { name: 'LOW_RATING_OPEN_RATE', value: 0.05, note: 'a 1-star member below this open rate also qualifies (0.05 = 5%)' },
      { name: 'PROTECT_TAGS', value: ['customer', 'vip', 'partner', 'do-not-archive'], note: 'tags that are never archived (case-insensitive)' },
      { name: 'PROTECT_DOMAINS', value: ['yourcompany.example'], note: 'email domains that are never archived' },
      { name: 'MAX_ARCHIVE_PER_RUN', value: 200, note: 'hard ceiling on archives per run, oldest members first' },
      { name: 'MAX_SHARE_PCT', value: 30, note: 'if more than this share of the audience qualifies, stop and archive nothing' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the live result; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('On the 1st of each month', '0 7 1 * *'),
    ifTrue('Mailchimp connected?', cfg('use_mailchimp')),
    http('Fetch subscribed members', {
      url: `={{ 'https://' + ${cfg('mailchimp_dc')} + '.api.mailchimp.com/3.0/lists/' + ${cfg('list_id')} + '/members' }}`, auth: 'mailchimpApi',
      query: { status: 'subscribed', count: '1000', fields: 'members.id,members.email_address,members.status,members.stats,members.member_rating,members.timestamp_opt,members.timestamp_signup,members.last_changed,members.vip,members.tags,total_items' },
      timeout: 60000,
    }),
    code('Read members', `
// Mailchimp members page -> one item with the member list and the audience size.
const page = $input.first().json;
return [{ json: { members: page.members || [], total: page.total_items || (page.members || []).length } }];`),
    code('Load sample members', `
// Used until USE_MAILCHIMP is true. Same fields as Mailchimp /lists/{id}/members.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const m = (id, email, open, click, rating, joined, changed, extra = {}) => ({ id, email_address: email, status: 'subscribed',
  stats: { avg_open_rate: open, avg_click_rate: click }, member_rating: rating, timestamp_opt: ago(joined), last_changed: ago(changed), vip: false, tags: [], ...extra });
const members = [
  m('h01', 'dana.okafor@mailbox.example', 0, 0, 2, 400, 390),
  m('h02', 'lee.marsh@inbox.example', 0, 0, 2, 260, 250),
  m('h03', 'r.vance@studio.example', 0.03, 0, 1, 300, 290),
  m('h04', 'buyer@bigcustomer.example', 0, 0, 2, 500, 480, { tags: [{ id: 1, name: 'Customer' }] }),
  m('h05', 'ceo@friendly.example', 0, 0, 2, 500, 480, { vip: true }),
  m('h06', 'intern@yourcompany.example', 0, 0, 2, 365, 365),
  m('h07', 'new.signup@mailbox.example', 0, 0, 2, 30, 30),
  m('h08', 'active.reader@inbox.example', 0.62, 0.11, 4, 700, 12),
];
return [{ json: { members, total: 40 } }];`),
    merge('Combine member sources'),
    code('Pick members to archive', `
// Candidate = tenure >= MIN_TENURE_DAYS, profile unchanged for STALE_DAYS, and
// either no opens and no clicks, or a 1-star rating under LOW_RATING_OPEN_RATE.
// Protection is checked before engagement, so a held member always shows why.
const cfg = $('config').first().json;
const { members, total } = $input.first().json;
const tags = new Set(cfg.protect_tags.map(t => t.toLowerCase()));
const domains = cfg.protect_domains.map(d => d.toLowerCase());
const days = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
const candidates = [], held = [];
let active = 0;
for (const mem of members) {
  if (mem.status !== 'subscribed') continue;
  const email = String(mem.email_address).toLowerCase();
  const open = mem.stats?.avg_open_rate || 0, click = mem.stats?.avg_click_rate || 0;
  const silent = open === 0 && click === 0;
  const weak = mem.member_rating <= 1 && open < cfg.low_rating_open_rate && click === 0;
  if (!silent && !weak) { active++; continue; }
  const tag = (mem.tags || []).map(t => t.name).find(n => tags.has(String(n).toLowerCase()));
  const reason =
    mem.vip ? 'VIP flag' :
    tag ? 'protected tag "' + tag + '"' :
    domains.some(d => email.endsWith('@' + d)) ? 'protected domain' :
    days(mem.timestamp_opt) < cfg.min_tenure_days ? 'joined ' + days(mem.timestamp_opt) + ' days ago' :
    days(mem.last_changed) < cfg.stale_days ? 'profile changed ' + days(mem.last_changed) + ' days ago' : '';
  if (reason) { held.push({ email, reason }); continue; }
  candidates.push({ id: mem.id, email, tenure_days: days(mem.timestamp_opt), open_rate: open, rating: mem.member_rating, why: silent ? 'no opens or clicks' : '1-star, ' + Math.round(open * 100) + '% opens' });
}
candidates.sort((a, b) => b.tenure_days - a.tenure_days);
const share = total ? Math.round(candidates.length / total * 1000) / 10 : 0;
const aborted = share > cfg.max_share_pct;
const batch = aborted ? [] : candidates.slice(0, cfg.max_archive_per_run);
for (const c of candidates.slice(cfg.max_archive_per_run)) held.push({ email: c.email, reason: 'over MAX_ARCHIVE_PER_RUN, next run' });
return [{ json: { batch, held, candidates: candidates.length, active, audience: total, share_pct: share,
  aborted: aborted ? 'candidates are ' + share + '% of the audience, above MAX_SHARE_PCT ' + cfg.max_share_pct + '%' : '' } }];`),
    ifWhen('Live with members to archive?', [[cfg('live'), 'true'], ['$json.batch.length', 'gt', 0]]),
    stop('STOP: dry run - nothing archived'),
    splitOut('One item per member', 'batch'),
    http('Archive the member in Mailchimp', {
      method: 'DELETE', auth: 'mailchimpApi',
      url: `={{ 'https://' + ${cfg('mailchimp_dc')} + '.api.mailchimp.com/3.0/lists/' + ${cfg('list_id')} + '/members/' + $json.id }}`,
    }),
    code('Summarise the cleanup', `
// Mailchimp answers a successful archive with 204 and no body, so the count comes from the batch.
const picked = $('Pick members to archive').first().json;
const n = $input.all().length;
const text = '*Mailchimp cleanup*: archived ' + n + ' of ' + picked.audience + ' members (' + picked.candidates + ' qualified, ' + picked.held.length + ' held back).';
return [{ json: { text, archived: n } }];`),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the result to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['On the 1st of each month', 'config'],
    ['config', 'Mailchimp connected?'],
    ['Mailchimp connected?', 0, 'Fetch subscribed members'], ['Mailchimp connected?', 1, 'Load sample members'],
    ['Fetch subscribed members', 'Read members'],
    ['Read members', 'Combine member sources'], ['Load sample members', 0, 'Combine member sources', 1],
    ['Combine member sources', 'Pick members to archive'],
    ['Pick members to archive', 'Live with members to archive?'],
    ['Live with members to archive?', 0, 'One item per member'], ['Live with members to archive?', 1, 'STOP: dry run - nothing archived'],
    ['One item per member', 'Archive the member in Mailchimp'],
    ['Archive the member in Mailchimp', 'Summarise the cleanup'],
    ['Summarise the cleanup', 'Slack channel set?'],
    ['Slack channel set?', 0, 'Post the result to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs on the 1st of each month or by hand. Every rule, protection list and cap is a constant in `config`.', nodes: ['Run manually', 'On the 1st of each month', 'config'] },
    { title: 'Read the audience', why: 'One page of up to 1,000 subscribed members, trimmed with the fields parameter to the stats the rules need. `Load sample members` covers every rule so the review can be read before connecting.', nodes: ['Mailchimp connected?', 'Fetch subscribed members', 'Read members', 'Load sample members', 'Combine member sources'] },
    { title: 'Decide who qualifies', why: '`Pick members to archive` checks protections before engagement and fails closed: if candidates pass `MAX_SHARE_PCT` of the audience the batch is emptied, since that pattern usually means stats did not load.', nodes: ['Pick members to archive', 'Live with members to archive?', 'STOP: dry run - nothing archived'] },
    { title: 'Archive and report', why: 'The DELETE call archives rather than erases, so history is kept and a contact can be restored. It runs only after `DRY_RUN` is switched off, one member per request.', nodes: ['One item per member', 'Archive the member in Mailchimp', 'Summarise the cleanup', 'Slack channel set?', 'STOP: no Slack channel', 'Post the result to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run review)', start: 'Run manually',
      expect: { reached: ['Load sample members', 'STOP: dry run - nothing archived'], notReached: ['Archive the member in Mailchimp'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick members to archive'][0];
        const ids = p.batch.map((b: any) => b.id).join();
        if (ids !== 'h01,h03,h02') f.push(`expected h01,h03,h02 (oldest first), got ${ids}`);
        const reasons = p.held.map((h: any) => h.reason);
        for (const r of ['VIP flag', 'protected tag "Customer"', 'protected domain']) if (!reasons.includes(r)) f.push(`missing held reason: ${r}`);
        if (!reasons.some((r: string) => r.startsWith('joined 30'))) f.push('new signup not held');
        if (p.active !== 1) f.push(`expected 1 active member, got ${p.active}`);
        return f;
      },
    },
    {
      name: 'live archive with Slack', start: 'On the 1st of each month',
      overrides: { USE_MAILCHIMP: true, DRY_RUN: false, LIST_ID: 'a1b2c3d4e5', SLACK_CHANNEL_ID: 'C0LISTS01' },
      mocks: {
        'Fetch subscribed members': [{ total_items: 50, members: [
          { id: 'x1', email_address: 'quiet.one@mailbox.example', status: 'subscribed', stats: { avg_open_rate: 0, avg_click_rate: 0 }, member_rating: 2,
            timestamp_opt: new Date(Date.now() - 200 * 864e5).toISOString(), last_changed: new Date(Date.now() - 200 * 864e5).toISOString(), vip: false, tags: [] },
          { id: 'x2', email_address: 'reader@inbox.example', status: 'subscribed', stats: { avg_open_rate: 0.4, avg_click_rate: 0.05 }, member_rating: 4,
            timestamp_opt: new Date(Date.now() - 900 * 864e5).toISOString(), last_changed: new Date(Date.now() - 20 * 864e5).toISOString(), vip: false, tags: [] },
        ] }],
        'Archive the member in Mailchimp': (items: any[]) => items.map(() => ({})),
        'Post the result to Slack': [{ ok: true }],
      },
      expect: { reached: ['Archive the member in Mailchimp', 'Post the result to Slack'], outward: 'some' },
      check: out => out['Summarise the cleanup'][0]?.archived === 1 ? [] : ['expected exactly 1 member archived'],
    },
    {
      name: 'too many candidates fails closed', start: 'Run manually',
      overrides: { USE_MAILCHIMP: true, DRY_RUN: false, LIST_ID: 'a1b2c3d4e5' },
      mocks: {
        'Fetch subscribed members': [{ total_items: 2, members: [1, 2].map(i => ({ id: 'z' + i, email_address: 'z' + i + '@mailbox.example', status: 'subscribed', stats: { avg_open_rate: 0, avg_click_rate: 0 },
          member_rating: 2, timestamp_opt: new Date(Date.now() - 400 * 864e5).toISOString(), last_changed: new Date(Date.now() - 400 * 864e5).toISOString(), vip: false, tags: [] })) }],
      },
      expect: { reached: ['STOP: dry run - nothing archived'], notReached: ['Archive the member in Mailchimp'] },
      check: out => out['Pick members to archive'][0].aborted.includes('above MAX_SHARE_PCT') ? [] : ['run should abort above MAX_SHARE_PCT'],
    },
  ],
});
