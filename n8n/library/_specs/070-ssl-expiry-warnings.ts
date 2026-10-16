import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'ssl-expiry-warnings',
  title: 'Warn before SSL certificates expire with crt.sh and Gmail',
  summary: 'Looks up every domain on crt.sh each morning, takes the newest unexpired certificate that covers it (wildcards included, replaced certificates ignored), and emails each owner once per 30, 14 and 7-day tier.',
  category: 'DevOps and engineering',
  description: {
    who: 'Agencies and small IT teams looking after 5 to 100 client domains, where one forgotten renewal means a browser warning on a client site. It needs no agent on the servers and no paid monitoring.',
    how: [
      'Every day at 07:30 it queries the public crt.sh certificate log for each domain in `DOMAINS`, or uses sample certificates until `USE_CRTSH` is true.',
      'Precertificate duplicates are merged by serial. Each domain gets the newest certificate whose names cover it, exactly or through a wildcard, so a certificate that was already renewed is ignored.',
      'A warning is due when days left drop into a tier in `WARN_DAYS` (30, 14 and 7 by default) and that tier was not sent for that certificate. A domain with no unexpired certificate on record is flagged too.',
      'Each owner gets one email listing their domains, days left and issuer.',
    ],
    setup: [
      'Run it once as imported. It checks sample certificates and stops at `STOP: preview - nothing sent`.',
      'Fill `DOMAINS` with each hostname and the owner who should hear about it, then set `USE_CRTSH = true`. crt.sh needs no account.',
      'Connect Gmail to `Email the owner`.',
      'Put your address in `TEST_EMAIL` to get every warning yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Gmail account', 'Domains with publicly logged certificates (every public CA logs them)'],
    customize: [
      '`WARN_DAYS` sets the tiers; each fires once per certificate.',
      '`IGNORE_ISSUERS` skips certificates from issuers you do not deploy, such as a CDN that renews for you.',
      'crt.sh shows what was issued, not what a server presents, so pair this with a renewal process that deploys the new certificate.',
    ],
  },
  config: {
    intro: ['USE_CRTSH false -> SAMPLE certificates, so the run works offline.', 'Tiers already sent are remembered per certificate serial in workflow static data.'],
    consts: [
      { name: 'USE_CRTSH', value: false, note: 'true queries https://crt.sh for every domain below' },
      { name: 'DOMAINS', value: [
        { domain: 'northwind.example', owner: 'ops@northwind.example' },
        { domain: 'api.northwind.example', owner: 'ops@northwind.example' },
        { domain: 'shop.orchardlane.example', owner: 'web@harbourdigital.example' },
        { domain: 'status.orchardlane.example', owner: 'web@harbourdigital.example' },
      ], note: 'hostnames to watch and who gets the warning' },
      { name: 'WARN_DAYS', value: [30, 14, 7], note: 'warning tiers in days left' },
      { name: 'IGNORE_ISSUERS', value: [], note: 'issuer name fragments to skip, e.g. a CDN that renews for you' },
      { name: 'SENDER_NAME', value: 'Northwind ops bot', note: 'sign-off on every email' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 07:30', '30 7 * * *'),
    code('List domains', `
// One item per domain so crt.sh is queried once each.
return $('config').first().json.domains.filter(d => d.domain).map(d => ({ json: { domain: d.domain.toLowerCase().trim(), owner: d.owner } }));`),
    ifTrue('crt.sh lookups on?', cfg('use_crtsh')),
    http('Look up certificates on crt.sh', { url: 'https://crt.sh/', auth: 'none', timeout: 45000, query: { q: '={{ $json.domain }}', output: 'json', exclude: 'expired', deduplicate: 'Y' } }),
    code('Load sample certificates', `
// Used until USE_CRTSH is true. crt.sh rows, dates relative to now. shop has an old
// certificate about to expire AND its replacement; status has nothing unexpired.
const at = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 19);
const le = "C=US, O=Let's Encrypt, CN=R11";
return [
  { id: 101, issuer_name: le, common_name: 'northwind.example', name_value: 'northwind.example\\nwww.northwind.example', serial_number: '04aa01', not_before: at(-78), not_after: at(12) },
  { id: 102, issuer_name: le, common_name: 'northwind.example', name_value: 'northwind.example\\nwww.northwind.example', serial_number: '04aa01', not_before: at(-78), not_after: at(12) },
  { id: 103, issuer_name: 'C=US, O=DigiCert Inc, CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1', common_name: '*.northwind.example', name_value: '*.northwind.example', serial_number: '0c77f2', not_before: at(-337), not_after: at(28) },
  { id: 104, issuer_name: le, common_name: 'shop.orchardlane.example', name_value: 'shop.orchardlane.example', serial_number: '03bb10', not_before: at(-85), not_after: at(5) },
  { id: 105, issuer_name: le, common_name: 'shop.orchardlane.example', name_value: 'shop.orchardlane.example', serial_number: '03bb99', not_before: at(-5), not_after: at(85) },
].map(json => ({ json }));`),
    merge('Combine certificate sources'),
    code('Pick the newest certificate per domain', `
// A certificate covers a domain if a name matches exactly, or is *.parent and the
// domain is exactly one label below it. The newest not_after wins, so a renewed
// certificate hides the one it replaced.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const warned = store.warned || {};
const tiers = [...cfg.warn_days].sort((a, b) => a - b);
const certs = {};
for (const { json: c } of $input.all()) {
  if (!c.serial_number || !c.not_after) continue;
  if (cfg.ignore_issuers.some(x => (c.issuer_name || '').includes(x))) continue;
  certs[c.serial_number] = c; // precert and leaf share a serial
}
const covers = (names, d) => names.some(n => n === d || (n.startsWith('*.') && d.endsWith(n.slice(1)) && d.split('.').length === n.split('.').length));
const issuerOf = s => ((s || '').match(/O=([^,]+)/) || [])[1] || s;
const due = [], fine = [];
for (const { domain, owner } of cfg.domains.map(d => ({ ...d, domain: d.domain.toLowerCase().trim() }))) {
  const mine = Object.values(certs).filter(c => covers(String(c.name_value || c.common_name).toLowerCase().split('\\n').map(s => s.trim()), domain))
    .sort((a, b) => b.not_after.localeCompare(a.not_after));
  if (!mine.length) { due.push({ domain, owner, tier: 'none', days_left: null, issuer: '', serial: '', not_after: '', replaced: 0 }); continue; }
  const c = mine[0];
  const daysLeft = Math.floor((new Date(c.not_after + 'Z') - Date.now()) / 864e5);
  const tier = daysLeft < 0 ? 0 : tiers.find(t => daysLeft <= t);
  const row = { domain, owner, days_left: daysLeft, not_after: c.not_after.slice(0, 10), issuer: issuerOf(c.issuer_name), serial: c.serial_number, replaced: mine.length - 1 };
  if (tier === undefined) { fine.push(row); continue; }
  if ((warned[c.serial_number] ?? Infinity) <= tier) { fine.push({ ...row, note: 'tier ' + tier + ' already sent' }); continue; }
  due.push({ ...row, tier });
}
return [{ json: { due, fine } }];`),
    code('Group warnings by owner', `
// One email per owner, most urgent domain first.
const cfg = $('config').first().json;
const by = {};
for (const d of $input.first().json.due) (by[d.owner] ||= []).push(d);
return Object.entries(by).map(([owner, list]) => {
  list.sort((a, b) => (a.days_left ?? -99) - (b.days_left ?? -99));
  const line = d => d.tier === 'none' ? '- ' + d.domain + ': no unexpired certificate on record at crt.sh. Check the site now.' :
    '- ' + d.domain + ': ' + (d.days_left < 0 ? 'EXPIRED ' + -d.days_left + ' days ago' : d.days_left + ' days left') + ' (expires ' + d.not_after + ', ' + d.issuer + ')';
  const worst = list[0];
  const subject = worst.tier === 'none' || worst.days_left < 0 ? 'Certificate problem on ' + worst.domain : 'Certificate for ' + worst.domain + ' expires in ' + worst.days_left + ' days' + (list.length > 1 ? ' (+' + (list.length - 1) + ' more)' : '');
  const body = ['Hi,', '', 'These certificates need renewing:', ...list.map(line), '',
    'Dates come from the public certificate log (crt.sh), so a renewal that was issued but not deployed will not show here.', '', cfg.sender_name].join('\\n');
  return { json: { owner, domains: list.map(d => ({ serial: d.serial, tier: d.tier })), subject, body, send_to: cfg.mode === 'test' ? cfg.test_email : owner } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the owner', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.owner + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - tiers not recorded'),
    code('Remember warned tiers', `
// Lowest tier sent per serial; a renewed certificate has a new serial and starts fresh.
const store = $getWorkflowStaticData('global');
const warned = store.warned || {};
for (const g of $('Group warnings by owner').all()) for (const d of g.json.domains) if (d.serial && typeof d.tier === 'number') warned[d.serial] = Math.min(warned[d.serial] ?? Infinity, d.tier);
store.warned = warned;
return [{ json: { serials: Object.keys(warned).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 07:30', 'config'],
    ['config', 'List domains'], ['List domains', 'crt.sh lookups on?'],
    ['crt.sh lookups on?', 0, 'Look up certificates on crt.sh'], ['crt.sh lookups on?', 1, 'Load sample certificates'],
    ['Look up certificates on crt.sh', 'Combine certificate sources'], ['Load sample certificates', 0, 'Combine certificate sources', 1],
    ['Combine certificate sources', 'Pick the newest certificate per domain'],
    ['Pick the newest certificate per domain', 'Group warnings by owner'],
    ['Group warnings by owner', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the owner'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the owner', 'Live run?'],
    ['Live run?', 0, 'Remember warned tiers'], ['Live run?', 1, 'STOP: test send - tiers not recorded'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every day at 07:30. Domains, owners and tiers live in `config`; `List domains` makes one item per hostname so each gets its own crt.sh query.', nodes: ['Run manually', 'Every day at 07:30', 'config', 'List domains'] },
    { title: 'Read the certificate log', why: 'crt.sh is public, so no credential is needed, but it can be slow: the lookup allows 45 seconds and retries. `Load sample certificates` returns crt.sh rows so the matching runs offline.', nodes: ['crt.sh lookups on?', 'Look up certificates on crt.sh', 'Load sample certificates', 'Combine certificate sources'] },
    { title: 'Match and group', why: 'Rows are merged by serial before matching, because crt.sh lists a precertificate and a certificate for each issue. Taking the newest covering certificate is what silences a domain that was already renewed.', nodes: ['Pick the newest certificate per domain', 'Group warnings by owner'] },
    { title: 'Email and remember', why: 'A test send goes to `TEST_EMAIL` and records nothing. A live send stores the tier per serial, so each tier fires once and a renewed certificate starts again at 30 days.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the owner', 'Live run?', 'STOP: test send - tiers not recorded', 'Remember warned tiers'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample certificates, preview)', start: 'Run manually',
      expect: { reached: ['Load sample certificates', 'STOP: preview - nothing sent'], notReached: ['Look up certificates on crt.sh'], outward: 'none' },
      check: out => {
        const p = out['Pick the newest certificate per domain'][0];
        const by = (d: string) => p.due.find((x: any) => x.domain === d);
        const f: string[] = [];
        if (by('northwind.example')?.tier !== 14) f.push(`apex has 11-12 days left, tier 14, got ${by('northwind.example')?.tier}`);
        if (by('api.northwind.example')?.tier !== 30 || by('api.northwind.example')?.serial !== '0c77f2') f.push('api is covered by the wildcard, tier 30');
        if (by('shop.orchardlane.example')) f.push('shop was renewed and must not warn');
        if (!p.fine.some((x: any) => x.domain === 'shop.orchardlane.example' && x.replaced === 1)) f.push('shop should be fine with 1 replaced certificate');
        if (by('status.orchardlane.example')?.tier !== 'none') f.push('status has no certificate on record');
        const g = out['Group warnings by owner'];
        if (g.length !== 2) f.push(`2 owners expected, got ${g.length}`);
        if (!g.find((x: any) => x.owner === 'ops@northwind.example')?.subject.includes('(+1 more)')) f.push('ops email should cover 2 domains');
        return f;
      },
    },
    {
      name: 'live crt.sh lookup, one domain inside 7 days', start: 'Every day at 07:30',
      overrides: { USE_CRTSH: true, TEST_RUN: false, DOMAINS: [{ domain: 'app.harbour.example', owner: 'it@harbour.example' }, { domain: 'harbour.example', owner: 'it@harbour.example' }] },
      mocks: {
        'Look up certificates on crt.sh': [
          { issuer_ca_id: 295815, issuer_name: "C=US, O=Let's Encrypt, CN=E6", common_name: 'app.harbour.example', name_value: 'app.harbour.example', id: 9001, entry_timestamp: '2026-08-10T10:00:00', not_before: new Date(Date.now() - 84 * 864e5).toISOString().slice(0, 19), not_after: new Date(Date.now() + 6.5 * 864e5).toISOString().slice(0, 19), serial_number: '05ee11', result_count: 2 },
          { issuer_ca_id: 295815, issuer_name: "C=US, O=Let's Encrypt, CN=E6", common_name: 'harbour.example', name_value: 'harbour.example\nwww.harbour.example', id: 9002, entry_timestamp: '2026-09-20T10:00:00', not_before: new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 19), not_after: new Date(Date.now() + 70 * 864e5).toISOString().slice(0, 19), serial_number: '05ee22', result_count: 2 },
        ],
        'Email the owner': [{ id: 'msg_1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Email the owner', 'Remember warned tiers'], notReached: ['Load sample certificates'], outward: 'some' },
      check: out => {
        const p = out['Pick the newest certificate per domain'][0];
        const f: string[] = [];
        if (p.due.length !== 1 || p.due[0].tier !== 7) f.push('app.harbour.example has 6 days left: tier 7, the only warning');
        if (out['Group warnings by owner'][0].send_to !== 'it@harbour.example') f.push('live email goes to the owner');
        if (out['Remember warned tiers'][0].serials !== 1) f.push('one serial should be recorded');
        return f;
      },
    },
  ],
});
