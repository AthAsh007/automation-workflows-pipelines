import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// An RDAP lookup for an unsupported TLD returns 404; that must come back as data so the
// other domains are still checked. The kit's http() has no switch for this.
const rdapNode = (() => {
  const n = http('Look up the RDAP record', { url: "={{ 'https://rdap.org/domain/' + encodeURIComponent($json.domain) }}", auth: 'none', headers: { Accept: 'application/rdap+json' } });
  n.parameters.options.response = { response: { neverError: true } };
  (n as any).onError = 'continueRegularOutput';
  return n;
})();

export default defineSpec({
  slug: 'domain-expiry-rdap',
  title: 'Warn in Slack before domains expire with RDAP lookups',
  summary: 'Reads each domain\'s public RDAP record daily, warns in Slack at 60, 30, 14 and 7 days before expiry, and flags a missing transfer lock, hold or redemption status, an unexpected registrar and changed nameservers, each issue once.',
  category: 'DevOps and engineering',
  description: {
    who: 'Agencies and IT leads who hold 5 to 200 domains across several registrars, often bought on different cards by different people. One Slack thread replaces checking every registrar dashboard.',
    how: [
      'Every day at 08:15 it fetches the RDAP record for each domain in `DOMAINS` from rdap.org, which forwards to the right registry. Sample records are used until `USE_RDAP` is true.',
      'The expiration event gives days left. A warning fires once per tier in `WARN_DAYS` for each expiry date, so a renewal resets the ladder.',
      'Status codes are checked: `REQUIRED_STATUS` (a transfer lock by default) must be present, and hold, redemption or pending-delete statuses are critical. The registrar and nameservers are compared with what you expect and with the last run.',
      'Only new issues and resolved ones are posted, in one Slack message.',
    ],
    setup: [
      'Run it once as imported. It checks sample records and stops at `STOP: dry run - nothing posted`.',
      'List your domains in `DOMAINS`, with an optional expected registrar each, and set `USE_RDAP = true`. RDAP needs no account.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `DRY_RUN = false` and activate the workflow. Reported issues are kept in workflow static data, saved for active workflows.',
    ],
    requirements: ['A Slack workspace', 'Domains on TLDs that publish RDAP (all gTLDs and most ccTLDs)'],
    customize: [
      '`WARN_DAYS` sets the expiry tiers.',
      '`REQUIRED_STATUS` lists statuses every domain should carry, such as client delete prohibited.',
      '`CRITICAL_STATUS` lists statuses that get a `MENTION` in Slack.',
    ],
  },
  config: {
    intro: ['USE_RDAP false -> SAMPLE records, so the run works offline.', 'SLACK_CHANNEL_ID blank -> nothing is posted.'],
    consts: [
      { name: 'USE_RDAP', value: false, note: 'true fetches https://rdap.org/domain/<name> for each domain' },
      { name: 'DOMAINS', value: [
        { domain: 'northwind.example', registrar: 'Example Registrar' },
        { domain: 'northwind-shop.example', registrar: '' },
        { domain: 'orchardlane.example', registrar: '' },
        { domain: 'harbourdigital.example', registrar: 'Example Registrar' },
        { domain: 'oldbrand.invalid', registrar: '' },
      ], note: 'domains to watch; registrar = a fragment of the expected registrar name, blank to skip' },
      { name: 'WARN_DAYS', value: [60, 30, 14, 7], note: 'expiry tiers in days left' },
      { name: 'REQUIRED_STATUS', value: ['client transfer prohibited'], note: 'RDAP statuses every domain should have' },
      { name: 'CRITICAL_STATUS', value: ['redemption period', 'pending delete', 'client hold', 'server hold'], note: 'statuses that mean the domain is or will soon be offline' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the daily message; blank skips Slack' },
      { name: 'MENTION', value: '<!channel>', note: 'added when a critical issue is new; blank for none' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 08:15', '15 8 * * *'),
    code('List domains', `
// One item per domain; the RDAP answer for item i belongs to domain i.
return $('config').first().json.domains.filter(d => d.domain).map(d => ({ json: { domain: d.domain.toLowerCase().trim(), registrar: d.registrar || '' } }));`),
    ifTrue('RDAP lookups on?', cfg('use_rdap')),
    rdapNode,
    code('Load sample RDAP records', `
// Used until USE_RDAP is true. RDAP JSON as registries return it, dates relative to now.
const at = d => new Date(Date.now() + d * 864e5).toISOString().replace(/\\.\\d{3}/, '');
const registrar = name => [{ objectClassName: 'entity', roles: ['registrar'], publicIds: [{ type: 'IANA Registrar ID', identifier: '9999' }], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', name]]] }];
const ns = (...n) => n.map(ldhName => ({ objectClassName: 'nameserver', ldhName }));
const rec = (name, days, status, reg, nameservers) => ({ objectClassName: 'domain', ldhName: name.toUpperCase(), status, entities: registrar(reg), nameservers,
  events: [{ eventAction: 'registration', eventDate: at(-900) }, { eventAction: 'expiration', eventDate: at(days) }, { eventAction: 'last changed', eventDate: at(-30) }] });
return [
  rec('northwind.example', 25.5, ['client delete prohibited', 'client transfer prohibited', 'client update prohibited'], 'Example Registrar, Inc.', ns('NS1.DNSHOST.EXAMPLE', 'NS2.DNSHOST.EXAMPLE')),
  rec('northwind-shop.example', 200.5, ['active'], 'Budget Names LLC', ns('NS1.DNSHOST.EXAMPLE', 'NS2.DNSHOST.EXAMPLE')),
  rec('orchardlane.example', -4.5, ['redemption period'], 'Budget Names LLC', ns('NS1.PARKING.EXAMPLE')),
  rec('harbourdigital.example', 400.5, ['client transfer prohibited'], 'Other Registrar GmbH', ns('A.NS.EXAMPLE', 'B.NS.EXAMPLE')),
  { error: { message: 'Request failed with status code 404', name: 'AxiosError' } },
].map(json => ({ json }));`),
    merge('Combine RDAP records'),
    code('Check expiry and status', `
// Turn each record into a list of issues with stable keys. Expiry keys include the
// expiry date, so renewing restarts the tiers; other keys are per domain and code.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const nsSeen = store.nameservers || {};
const domains = $('List domains').all().map(i => i.json);
const tiers = [...cfg.warn_days].sort((a, b) => a - b);
const out = [];
$input.all().forEach(({ json: r }, i) => {
  const want = domains.find(d => d.domain === String(r.ldhName || '').toLowerCase()) || domains[i] || { domain: 'unknown', registrar: '' };
  const d = want.domain;
  const issues = [];
  if (r.error || !r.ldhName) {
    issues.push({ key: d + '|lookup', severity: 'warn', text: 'RDAP lookup failed (' + (r.error?.message || 'no record').slice(0, 60) + ')' });
    out.push({ domain: d, issues, days_left: null });
    return;
  }
  const exp = (r.events || []).find(e => e.eventAction === 'expiration')?.eventDate;
  const daysLeft = exp ? Math.floor((new Date(exp) - Date.now()) / 864e5) : null;
  if (daysLeft === null) issues.push({ key: d + '|noexpiry', severity: 'warn', text: 'no expiration date in RDAP' });
  else if (daysLeft < 0) issues.push({ key: d + '|expired|' + exp.slice(0, 10), severity: 'critical', text: 'expired ' + -daysLeft + ' days ago (' + exp.slice(0, 10) + ')' });
  else {
    const t = tiers.find(x => daysLeft <= x);
    if (t !== undefined) issues.push({ key: d + '|expiry|' + exp.slice(0, 10) + '|' + t, severity: t <= 14 ? 'critical' : 'warn', text: 'expires in ' + daysLeft + ' days (' + exp.slice(0, 10) + ')' });
  }
  const status = (r.status || []).map(s => s.toLowerCase());
  for (const s of cfg.required_status) if (!status.includes(s)) issues.push({ key: d + '|missing|' + s, severity: 'warn', text: 'status "' + s + '" is missing' });
  for (const s of cfg.critical_status) if (status.includes(s)) issues.push({ key: d + '|status|' + s, severity: 'critical', text: 'status is "' + s + '"' });
  const reg = (r.entities || []).find(e => (e.roles || []).includes('registrar'));
  const regName = ((reg?.vcardArray?.[1] || []).find(v => v[0] === 'fn') || [])[3] || '';
  if (want.registrar && !regName.toLowerCase().includes(want.registrar.toLowerCase()))
    issues.push({ key: d + '|registrar|' + regName, severity: 'critical', text: 'registrar is "' + regName + '", expected ' + want.registrar });
  const ns = (r.nameservers || []).map(n => n.ldhName.toLowerCase()).sort().join(',');
  if (nsSeen[d] && nsSeen[d] !== ns) issues.push({ key: d + '|ns|' + ns, severity: 'warn', text: 'nameservers changed to ' + ns.replace(/,/g, ', ') });
  out.push({ domain: d, issues, days_left: daysLeft, registrar: regName, nameservers: ns });
});
const reported = store.reported || {};
const now = out.flatMap(o => o.issues.map(x => ({ ...x, domain: o.domain })));
const nowKeys = new Set(now.map(x => x.key));
const checked = new Set(out.map(o => o.domain));
const fresh = now.filter(x => !reported[x.key]);
const resolved = Object.keys(reported).filter(k => checked.has(k.split('|')[0]) && !nowKeys.has(k) && !k.includes('|expiry|')).map(k => ({ key: k, domain: k.split('|')[0], text: reported[k] }));
return [{ json: { domains: out, fresh, resolved, open: now.length } }];`),
    ifTrue('Anything new?', '$json.fresh.length + $json.resolved.length > 0'),
    stop('STOP: nothing new to report'),
    code('Write the Slack message', `
// Critical first, then warnings, then what got fixed since the last post.
const cfg = $('config').first().json;
const c = $input.first().json;
const crit = c.fresh.filter(x => x.severity === 'critical'), warn = c.fresh.filter(x => x.severity !== 'critical');
const lines = [
  ...(crit.length && cfg.mention ? [cfg.mention] : []),
  '*Domain check*: ' + c.fresh.length + ' new, ' + c.resolved.length + ' resolved, ' + c.open + ' open in total.',
  ...crit.map(x => ':rotating_light: *' + x.domain + '*: ' + x.text),
  ...warn.map(x => ':warning: *' + x.domain + '*: ' + x.text),
  ...c.resolved.map(x => ':white_check_mark: *' + x.domain + '*: resolved (' + x.text + ')'),
];
return [{ json: { text: lines.join('\\n') } }];`),
    ifWhen('Post to Slack?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the domain report', cfg('slack_channel_id'), '$json.text'),
    code('Remember reported issues', `
// Live only: store what was posted and the nameservers seen, so tomorrow posts only changes.
const store = $getWorkflowStaticData('global');
const c = $('Check expiry and status').first().json;
const reported = store.reported || {};
for (const x of c.fresh) reported[x.key] = x.text;
for (const x of c.resolved) delete reported[x.key];
store.reported = reported;
store.nameservers = Object.fromEntries(c.domains.filter(d => d.nameservers).map(d => [d.domain, d.nameservers]));
return [{ json: { open_issues: Object.keys(reported).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 08:15', 'config'],
    ['config', 'List domains'], ['List domains', 'RDAP lookups on?'],
    ['RDAP lookups on?', 0, 'Look up the RDAP record'], ['RDAP lookups on?', 1, 'Load sample RDAP records'],
    ['Look up the RDAP record', 'Combine RDAP records'], ['Load sample RDAP records', 0, 'Combine RDAP records', 1],
    ['Combine RDAP records', 'Check expiry and status'],
    ['Check expiry and status', 'Anything new?'],
    ['Anything new?', 0, 'Write the Slack message'], ['Anything new?', 1, 'STOP: nothing new to report'],
    ['Write the Slack message', 'Post to Slack?'],
    ['Post to Slack?', 0, 'Post the domain report'], ['Post to Slack?', 1, 'STOP: dry run - nothing posted'],
    ['Post the domain report', 'Remember reported issues'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs daily at 08:15. Domains, expected registrars, tiers and the status rules live in `config`; `List domains` makes one item per domain for the lookup.', nodes: ['Run manually', 'Every day at 08:15', 'config', 'List domains'] },
    { title: 'Read RDAP records', why: 'The rdap.org service forwards to the registry that owns each TLD, so one URL pattern covers every domain. A 404 for an unsupported TLD comes back as data, and `Load sample RDAP records` includes one.', nodes: ['RDAP lookups on?', 'Look up the RDAP record', 'Load sample RDAP records', 'Combine RDAP records'] },
    { title: 'Find what changed', why: 'Every issue has a stable key, and only keys not posted before count as new. Expiry keys include the expiry date, so a renewal quietly restarts the 60, 30, 14 and 7-day ladder.', nodes: ['Check expiry and status', 'Anything new?', 'STOP: nothing new to report'] },
    { title: 'Post and remember', why: '`Post to Slack?` needs a live run and a channel. `Remember reported issues` runs only after a post, so a dry run never hides an issue from the first real one.', nodes: ['Write the Slack message', 'Post to Slack?', 'STOP: dry run - nothing posted', 'Post the domain report', 'Remember reported issues'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample records, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample RDAP records', 'Write the Slack message', 'STOP: dry run - nothing posted'], notReached: ['Look up the RDAP record'], outward: 'none' },
      check: out => {
        const c = out['Check expiry and status'][0];
        const texts = (d: string) => c.domains.find((x: any) => x.domain === d)?.issues.map((i: any) => i.text).join(' | ') || '';
        const f: string[] = [];
        if (!/expires in 25 days/.test(texts('northwind.example'))) f.push(`northwind.example should be in the 30-day tier: ${texts('northwind.example')}`);
        if (!texts('northwind-shop.example').includes('"client transfer prohibited" is missing')) f.push('shop has no transfer lock');
        if (!/expired 5 days ago/.test(texts('orchardlane.example')) || !texts('orchardlane.example').includes('redemption period')) f.push('orchardlane is expired and in redemption');
        if (!texts('harbourdigital.example').includes('registrar is "Other Registrar GmbH"')) f.push('harbourdigital has an unexpected registrar');
        if (!texts('oldbrand.invalid').includes('RDAP lookup failed')) f.push('the 404 should be reported as a failed lookup');
        if (c.fresh.length !== 7) f.push(`7 new issues expected, got ${c.fresh.length}`);
        if (!out['Write the Slack message'][0].text.startsWith('<!channel>')) f.push('critical issues should mention the channel');
        return f;
      },
    },
    {
      name: 'live RDAP and Slack', start: 'Every day at 08:15',
      overrides: { USE_RDAP: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0DOMAINS', DOMAINS: [{ domain: 'harbour.example', registrar: '' }, { domain: 'quay.example', registrar: '' }] },
      mocks: {
        'Look up the RDAP record': [
          { objectClassName: 'domain', ldhName: 'quay.example', status: ['client transfer prohibited'], events: [{ eventAction: 'expiration', eventDate: new Date(Date.now() + 9.5 * 864e5).toISOString() }], entities: [], nameservers: [{ ldhName: 'ns1.quay.example' }] },
          { objectClassName: 'domain', ldhName: 'HARBOUR.EXAMPLE', status: ['client transfer prohibited', 'client hold'], events: [{ eventAction: 'expiration', eventDate: new Date(Date.now() + 300 * 864e5).toISOString() }], entities: [], nameservers: [{ ldhName: 'ns1.harbour.example' }] },
        ],
        'Post the domain report': [{ ok: true, ts: '1700000000.0005' }],
      },
      expect: { reached: ['Post the domain report', 'Remember reported issues'], notReached: ['Load sample RDAP records'], outward: 'some' },
      check: out => {
        const c = out['Check expiry and status'][0];
        const f: string[] = [];
        if (c.fresh.length !== 2) f.push(`quay in the 14-day tier and harbour on hold: 2 issues, got ${c.fresh.length}`);
        if (!c.fresh.some((x: any) => x.domain === 'harbour.example' && x.text.includes('client hold'))) f.push('records are matched by ldhName, not position');
        if (out['Remember reported issues'][0].open_issues !== 2) f.push('both issues should be remembered');
        return f;
      },
    },
  ],
});
