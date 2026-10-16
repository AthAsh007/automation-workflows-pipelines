import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'influencer-shortlist-scoring',
  title: 'Score creator applications from a form into an Airtable shortlist',
  summary: 'Scores creator applications from an n8n form on engagement rate against platform benchmarks, niche fit, audience size, region and rate versus budget with weights from config, sorts them into tiers, adds them to Airtable and replies by tier, holding suspicious profiles for a person.',
  category: 'Marketing and content',
  description: {
    who: 'Brand and growth marketers running creator programmes who get more applications than they can vet. Every applicant gets an answer, and the shortlist in Airtable is sorted before anyone opens it.',
    how: [
      'Creators apply through the hosted n8n form with platform, followers, average engagements per post, niche, country and rate per post.',
      'Five parts are scored from 0 to 1 and weighted by `WEIGHTS`: engagement rate against the platform benchmark, niche fit, audience size against your target range, region, and rate against `MAX_RATE_PER_POST`.',
      'A total of 75+ is tier A (shortlist), 55-74 tier B (maybe), under 55 tier C. An engagement rate over 5 times the benchmark, or a rate above budget on an otherwise strong profile, goes to manual review with no automatic reply.',
      'Every application becomes an Airtable record with its scores and reasons, and tiers A, B and C get their own reply email.',
    ],
    setup: [
      'Run it once as imported from `Run manually`. It scores 4 sample applications and stops at `STOP: test run - Airtable untouched` and `STOP: preview - nothing sent`.',
      'Create an Airtable table with the fields listed in `Shape the Airtable record`, add the token credential and set `AIRTABLE_BASE_ID`.',
      'Set `TARGET_NICHES`, `TARGET_COUNTRIES` and `MAX_RATE_PER_POST`, connect Gmail and share the production form URL.',
      'Put your address in `TEST_EMAIL` to receive the replies yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['An Airtable base for the shortlist', 'A Gmail account'],
    customize: [
      '`WEIGHTS` must add up to 100 and decide what matters most.',
      '`ER_BENCHMARKS` holds the typical engagement rate per platform.',
      '`TIER_A` and `TIER_B` move the tier boundaries.',
    ],
  },
  config: {
    intro: ['A manual run scores SAMPLE applications. AIRTABLE_BASE_ID blank -> nothing is stored.', 'Replies follow TEST_RUN and TEST_EMAIL like every send.'],
    consts: [
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank means nothing is stored' },
      { name: 'AIRTABLE_TABLE', value: 'Creator applications', note: 'table name or id' },
      { name: 'WEIGHTS', value: { engagement: 35, niche: 25, audience: 15, region: 10, price: 15 }, note: 'points per part, adding up to 100' },
      { name: 'ER_BENCHMARKS', value: { Instagram: 0.02, TikTok: 0.05, YouTube: 0.03 }, note: 'typical engagement rate per platform (engagements / followers)' },
      { name: 'TARGET_NICHES', value: ['Personal finance', 'Small business'], note: 'niches that fit fully' },
      { name: 'ADJACENT_NICHES', value: ['Productivity', 'Tech'], note: 'niches that fit half' },
      { name: 'FOLLOWER_RANGE', value: [10000, 250000], note: 'audience size you want; above the range scores 0.6, below scales down' },
      { name: 'MIN_FOLLOWERS', value: 2000, note: 'applications below this get tier C whatever the score' },
      { name: 'TARGET_COUNTRIES', value: ['US', 'CA', 'GB', 'United States', 'Canada', 'United Kingdom'], note: 'countries that score full marks for region' },
      { name: 'MAX_RATE_PER_POST', value: 1500, note: 'budget per post in USD' },
      { name: 'TIER_A', value: 75, note: 'score for the shortlist' },
      { name: 'TIER_B', value: 55, note: 'score for maybe' },
      { name: 'SENDER_NAME', value: 'Jules, Tallyroom partnerships', note: 'sign-off on replies' },
    ],
    flags: { airtable_enabled: "AIRTABLE_BASE_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('Creator application form', 'Apply to the Tallyroom creator programme', 'Tell us about your channel. We reply to every application within 5 working days.', [
      { label: 'Name', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Handle or channel URL', required: true },
      { label: 'Main platform', type: 'dropdown', options: ['Instagram', 'TikTok', 'YouTube'], required: true },
      { label: 'Followers', type: 'number', required: true }, { label: 'Average likes plus comments (or views on YouTube) per post', type: 'number', required: true },
      { label: 'Niche', type: 'dropdown', options: ['Personal finance', 'Small business', 'Productivity', 'Tech', 'Lifestyle', 'Other'], required: true },
      { label: 'Country', required: true }, { label: 'Rate per post (USD)', type: 'number', required: true }, { label: 'Media kit link' },
    ]),
    code('Read the application', `
// The form fields when a creator applied; nothing when the run was started by hand.
let f = null;
try { f = $('Creator application form').first().json; } catch (e) { f = null; }
const a = f ? [{ name: f['Name'], email: f['Email'], handle: f['Handle or channel URL'], platform: f['Main platform'], followers: Number(f['Followers']),
  engagements: Number(f['Average likes plus comments (or views on YouTube) per post']), niche: f['Niche'], country: String(f['Country'] || '').trim(),
  rate: Number(f['Rate per post (USD)']), media_kit: f['Media kit link'] || '', submitted_at: f.submittedAt || new Date().toISOString() }] : [];
return [{ json: { from_form: Boolean(f), applications: a } }];`),
    ifTrue('Real application?', '$json.from_form'),
    code('Load sample applications', `
// Used for manual runs: a strong fit, a borderline one, a poor fit and one with
// an engagement rate too good to be true.
const now = new Date().toISOString();
return [{ json: { from_form: false, applications: [
  { name: 'Maya Ortiz', email: 'maya@creator-mail.example', handle: '@mayabudgets', platform: 'Instagram', followers: 48000, engagements: 2300, niche: 'Personal finance', country: 'US', rate: 900, media_kit: '', submitted_at: now },
  { name: 'Theo Grant', email: 'theo@creator-mail.example', handle: '@theobuilds', platform: 'TikTok', followers: 320000, engagements: 14000, niche: 'Productivity', country: 'Canada', rate: 1200, media_kit: '', submitted_at: now },
  { name: 'Lina Park', email: 'lina@creator-mail.example', handle: '@linalives', platform: 'Instagram', followers: 6000, engagements: 90, niche: 'Lifestyle', country: 'Germany', rate: 400, media_kit: '', submitted_at: now },
  { name: 'Rex Hale', email: 'rex@creator-mail.example', handle: '@rexmoney', platform: 'Instagram', followers: 30000, engagements: 9000, niche: 'Personal finance', country: 'CA', rate: 700, media_kit: '', submitted_at: now },
] } }];`),
    merge('Combine application sources'),
    code('Score each application', `
// Each part is 0..1, multiplied by its WEIGHTS points. Engagement is capped at 2x
// the platform benchmark; over 5x is treated as a warning sign and held for review.
const cfg = $('config').first().json;
const W = cfg.weights;
const [lo, hi] = cfg.follower_range;
const r2 = v => Math.round(v * 100) / 100;
return $input.first().json.applications.map(a => {
  const bench = cfg.er_benchmarks[a.platform] || 0.03;
  const er = a.followers > 0 ? a.engagements / a.followers : 0;
  const parts = {
    engagement: Math.min(1, er / (2 * bench)),
    niche: cfg.target_niches.includes(a.niche) ? 1 : cfg.adjacent_niches.includes(a.niche) ? 0.5 : 0,
    audience: a.followers < lo ? a.followers / lo : a.followers <= hi ? 1 : 0.6,
    region: cfg.target_countries.map(c => c.toLowerCase()).includes(a.country.toLowerCase()) ? 1 : 0.3,
    price: a.rate <= cfg.max_rate_per_post ? 1 - 0.5 * (a.rate / cfg.max_rate_per_post) : 0,
  };
  const score = Math.round(Object.entries(parts).reduce((s, [k, v]) => s + v * W[k], 0));
  const reasons = Object.entries(parts).filter(([, v]) => v < 0.5).map(([k]) => k + ' ' + r2(parts[k]));
  let tier = score >= cfg.tier_a ? 'A' : score >= cfg.tier_b ? 'B' : 'C';
  let review = '';
  if (er > bench * 5) review = 'engagement rate ' + (er * 100).toFixed(1) + '% is over 5x the ' + a.platform + ' benchmark';
  else if (tier === 'A' && a.rate > cfg.max_rate_per_post) review = 'strong profile, rate above budget';
  if (a.followers < cfg.min_followers) { tier = 'C'; reasons.push('under MIN_FOLLOWERS'); }
  return { json: { ...a, engagement_rate: r2(er * 100), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r2(v)])), score, tier: review ? 'review' : tier, review_reason: review, reasons } };
});`),
    ifWhen('Live with Airtable?', [[cfg('live'), 'true'], [cfg('airtable_enabled'), 'true']]),
    code('Write the reply by tier', `
// One reply per tier. Review cases get no automatic reply; a person answers them.
const cfg = $('config').first().json;
const text = {
  A: 'Thanks for applying. Your channel is a strong fit, and someone from our partnerships team will email you within 3 working days with campaign details and dates.',
  B: 'Thanks for applying. We do not have a campaign that fits your channel right now, and we keep every application on file for the next ones.',
  C: 'Thanks for applying. After looking at your channel we do not think we are the right fit for now. We appreciate the time you took.',
};
return $input.all().map(({ json: a }) => ({ json: { email: a.email, tier: a.tier, auto_reply: a.tier !== 'review',
  subject: a.tier === 'A' ? 'Your application to the creator programme: next steps' : 'Your application to the creator programme',
  body: 'Hi ' + (a.name || '').split(' ')[0] + ',\\n\\n' + (text[a.tier] || '') + '\\n\\n' + cfg.sender_name, send_to: cfg.mode === 'test' ? cfg.test_email : a.email } }));`),
    stop('STOP: test run - Airtable untouched'),
    code('Shape the Airtable record', `
// Fields: Name, Email, Handle, Platform, Followers, Engagement rate, Niche,
// Country, Rate, Score, Tier, Review reason, Weak parts, Media kit, Applied at.
const records = $input.all().map(({ json: a }) => ({ fields: {
  Name: a.name, Email: a.email, Handle: a.handle, Platform: a.platform, Followers: a.followers, 'Engagement rate': a.engagement_rate, Niche: a.niche,
  Country: a.country, Rate: a.rate, Score: a.score, Tier: a.tier, 'Review reason': a.review_reason, 'Weak parts': a.reasons.join('; '), 'Media kit': a.media_kit, 'Applied at': a.submitted_at } }));
return [{ json: { payload: { records, typecast: true } } }];`),
    http('Create the Airtable records', {
      method: 'POST', auth: 'airtableTokenApi',
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`,
      jsonBody: 'JSON.stringify($json.payload)',
    }),
    ifWhen('Reply automatically?', [['$json.auto_reply', 'true']]),
    stop('STOP: held for a personal reply'),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the reply', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + ', tier ' + $json.tier + '] ' : '') + $json.subject", message: '$json.body' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Creator application form', 'config'],
    ['config', 'Read the application'],
    ['Read the application', 'Real application?'],
    ['Real application?', 0, 'Combine application sources'], ['Real application?', 1, 'Load sample applications'],
    ['Load sample applications', 0, 'Combine application sources', 1],
    ['Combine application sources', 'Score each application'],
    ['Score each application', 'Live with Airtable?'],
    ['Score each application', 'Write the reply by tier'],
    ['Live with Airtable?', 0, 'Shape the Airtable record'], ['Live with Airtable?', 1, 'STOP: test run - Airtable untouched'],
    ['Shape the Airtable record', 'Create the Airtable records'],
    ['Write the reply by tier', 'Reply automatically?'],
    ['Reply automatically?', 0, 'Sending switched on?'], ['Reply automatically?', 1, 'STOP: held for a personal reply'],
    ['Sending switched on?', 0, 'Email the reply'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Receive the application', why: 'The hosted `Creator application form` asks for numbers rather than screenshots, so scoring needs no scraping. A manual run feeds `Load sample applications` through the same path.', nodes: ['Run manually', 'Creator application form', 'config', 'Read the application', 'Real application?', 'Load sample applications', 'Combine application sources'] },
    { title: 'Score against your weights', why: 'Engagement is judged against the platform benchmark, because 3% is weak on TikTok and strong on Instagram. An implausibly high rate is held for review instead of being rewarded.', nodes: ['Score each application'] },
    { title: 'Add to Airtable and reply', why: 'Every application is stored, review cases included, but only on a live run with a base id. Review cases never get an automatic reply, and the rest follow the preview and test gates.', nodes: ['Live with Airtable?', 'Write the reply by tier', 'STOP: test run - Airtable untouched', 'Shape the Airtable record', 'Create the Airtable records', 'Reply automatically?', 'STOP: held for a personal reply', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the reply'] },
  ],
  scenarios: [
    {
      name: 'shipped config (manual sample applications)', start: 'Run manually',
      expect: { reached: ['Load sample applications', 'STOP: test run - Airtable untouched', 'STOP: held for a personal reply', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const s = Object.fromEntries(out['Score each application'].map((a: any) => [a.name.split(' ')[0], a]));
        if (s.Maya?.tier !== 'A') f.push(`Maya should be tier A, got ${s.Maya?.tier} (${s.Maya?.score})`);
        if (s.Theo?.tier !== 'B') f.push(`Theo should be tier B, got ${s.Theo?.tier} (${s.Theo?.score})`);
        if (s.Lina?.tier !== 'C') f.push(`Lina should be tier C, got ${s.Lina?.tier} (${s.Lina?.score})`);
        if (s.Rex?.tier !== 'review' || !s.Rex.review_reason.includes('over 5x')) f.push(`Rex should be held for review: ${s.Rex?.tier}`);
        if (s.Maya?.engagement_rate !== 4.79) f.push(`Maya engagement rate should be 4.79%, got ${s.Maya?.engagement_rate}`);
        if (out['Write the reply by tier'].filter((r: any) => r.auto_reply).length !== 3) f.push('3 automatic replies expected');
        return f;
      },
    },
    {
      name: 'live form application', start: 'Creator application form',
      input: [{ Name: 'Ivy Chen', Email: 'ivy@creator-mail.example', 'Handle or channel URL': 'https://youtube.example/@ivyrunsabiz', 'Main platform': 'YouTube', Followers: 85000,
        'Average likes plus comments (or views on YouTube) per post': 4100, Niche: 'Small business', Country: 'United Kingdom', 'Rate per post (USD)': 1200, 'Media kit link': '',
        submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { AIRTABLE_BASE_ID: 'appCreators001', TEST_RUN: false },
      mocks: {
        'Create the Airtable records': [{ records: [{ id: 'recC1', fields: {} }] }],
        'Email the reply': [{ id: 'msg-1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Create the Airtable records', 'Email the reply'], notReached: ['Load sample applications'], outward: 'some' },
      check: out => {
        const a = out['Score each application'][0];
        return a.tier === 'A' && out['Write the reply by tier'][0].send_to === 'ivy@creator-mail.example' ? [] : [`Ivy should be tier A and get the reply: ${a.tier} ${a.score}`];
      },
    },
  ],
});
