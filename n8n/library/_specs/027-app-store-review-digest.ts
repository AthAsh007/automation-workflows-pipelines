import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'app-store-review-digest',
  title: 'Summarise new App Store reviews from Apple\'s RSS feed into Slack',
  summary: 'Reads the public App Store customer review feed for several countries each morning, keeps only reviews not posted before, and sends Slack a digest with star breakdown, average per country, 1 and 2 star reviews tagged by complaint topic, and the app version low ratings cluster on.',
  category: 'Customer support',
  description: {
    who: 'Mobile product and support teams who ship an iOS app in more than one country and check reviews in App Store Connect when they remember to. No Apple credentials are needed.',
    how: [
      'Every morning at 09:00 it reads Apple\'s public review feed (newest 50 per country) for each country in `COUNTRIES`, or 12 sample reviews until `APP_ID` is set.',
      'Reviews already posted on an earlier run are dropped; on the very first run only the last 7 days count.',
      'It counts reviews per star and the average per country, and tags 1 and 2 star reviews with topics such as crash, login or pricing.',
      'If most low ratings come from one app version, the digest says so, which usually points at a regression.',
    ],
    setup: [
      'Run it once as imported. It builds a digest from the sample reviews and stops at `STOP: no Slack channel`.',
      'Put your numeric App Store id (from the app URL, after `id`) in `APP_ID` and pick `COUNTRIES`.',
      'Add a Slack credential to `Post the digest to Slack` and set `SLACK_CHANNEL_ID`.',
      'Set `DRY_RUN = false` and activate the workflow. Posted review ids are kept in static data, which n8n saves on activated runs.',
    ],
    requirements: ['An app on the App Store', 'A Slack workspace'],
    customize: [
      '`COMPLAINT_TOPICS` maps each topic to the words that mark it; add words in your users\' languages.',
      '`LOW_STARS` sets which ratings are flagged.',
      '`VERSION_ALERT_SHARE` sets the share of low ratings on one version that triggers the regression line.',
    ],
  },
  config: {
    intro: ['APP_ID blank -> SAMPLE reviews. The feed is public, so no credential is needed to read it.', 'SLACK_CHANNEL_ID blank -> nothing is posted. DRY_RUN true -> nothing is posted or remembered.'],
    consts: [
      { name: 'APP_ID', value: '', note: 'numeric App Store id, e.g. 284882215; blank uses sample reviews' },
      { name: 'COUNTRIES', value: ['us', 'gb', 'de', 'au'], note: 'two-letter storefront codes to read' },
      { name: 'FIRST_RUN_DAYS', value: 7, note: 'on the first run, only reviews from this many days are included' },
      { name: 'LOW_STARS', value: 2, note: 'reviews at or below this rating are flagged' },
      { name: 'COMPLAINT_TOPICS', value: {
        crash: ['crash', 'closes', 'freez', 'stuck', 'abstürz', 'stürzt'],
        login: ['login', 'log in', 'sign in', 'password', 'anmeld'],
        pricing: ['price', 'subscription', 'expensive', 'charged', 'refund', 'abo'],
        sync: ['sync', 'lost', 'missing', 'disappeared'],
        ads: [' ads', 'advert', 'werbung'],
      }, note: 'topic -> word fragments (lower case) that tag a low review' },
      { name: 'VERSION_ALERT_SHARE', value: 60, note: 'percent of low ratings on one version that adds a regression line' },
      { name: 'EXCERPT_CHARS', value: 160, note: 'review text length shown in Slack' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the digest; blank posts nothing' },
    ],
    flags: { feed_enabled: "APP_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 09:00', '0 9 * * *'),
    ifTrue('Sample mode?', `!${cfg('feed_enabled')}`),
    code('Load sample reviews', `
// Used until APP_ID is set. Twelve reviews over three storefronts; the 1-2 star
// ones cluster on version 3.2.0, and one review is older than FIRST_RUN_DAYS.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
return [
  { country: 'us', id: 'r101', author: 'mkdaly', rating: 5, version: '3.2.0', title: 'Best budget app', text: 'Clean and fast. The new charts are great.', updated: ago(0.5) },
  { country: 'us', id: 'r102', author: 'jenpk', rating: 1, version: '3.2.0', title: 'Crashes on launch', text: 'Since the update it crashes every time I open it. iPhone 13.', updated: ago(0.8) },
  { country: 'us', id: 'r103', author: 'trailrun22', rating: 2, version: '3.2.0', title: 'Lost my data', text: 'After updating, two months of entries are missing. Sync did nothing.', updated: ago(1.2) },
  { country: 'us', id: 'r104', author: 'ccole', rating: 4, version: '3.1.4', title: 'Good', text: 'Does what I need. Would like widgets.', updated: ago(2) },
  { country: 'us', id: 'r105', author: 'pricewatch', rating: 1, version: '3.1.4', title: 'Too expensive now', text: 'Subscription price doubled with no warning.', updated: ago(3) },
  { country: 'gb', id: 'r201', author: 'Hollie B', rating: 5, version: '3.2.0', title: 'Lovely', text: 'Use it every day.', updated: ago(0.3) },
  { country: 'gb', id: 'r202', author: 'dsmith', rating: 1, version: '3.2.0', title: 'Freezes', text: 'App freezes on the budget screen and then closes.', updated: ago(1.5) },
  { country: 'gb', id: 'r203', author: 'pm_uk', rating: 3, version: '3.2.0', title: 'OK', text: 'Fine but the login takes ages.', updated: ago(4) },
  { country: 'de', id: 'r301', author: 'Lena K.', rating: 2, version: '3.2.0', title: 'Abstürze', text: 'Die App stürzt seit dem Update ständig ab.', updated: ago(0.9) },
  { country: 'de', id: 'r302', author: 'Tobi', rating: 5, version: '3.2.0', title: 'Super', text: 'Sehr übersichtlich.', updated: ago(2.5) },
  { country: 'de', id: 'r303', author: 'Jonas', rating: 4, version: '3.1.4', title: 'Gut', text: 'Gute App, ein paar Kleinigkeiten fehlen.', updated: ago(5) },
  { country: 'de', id: 'r304', author: 'alt', rating: 1, version: '3.0.9', title: 'Alt', text: 'Old complaint about sign in.', updated: ago(10) },
].map(json => ({ json }));`),
    code('Build one request per country', `
// One feed URL per storefront; Apple returns the newest 50 reviews per page.
const cfg = $('config').first().json;
return cfg.countries.map(country => ({ json: { country,
  url: 'https://itunes.apple.com/' + country + '/rss/customerreviews/id=' + cfg.app_id + '/sortby=mostrecent/json' } }));`),
    http('Fetch the review feed', { url: '={{ $json.url }}', auth: 'none' }),
    code('Read feed entries', `
// Feed JSON uses { label } wrappers. A feed with one review returns entry as an
// object, not an array; an entry without a rating is the app itself and is skipped.
const reqs = $('Build one request per country').all();
const out = [];
$input.all().forEach((page, i) => {
  const country = reqs[i]?.json.country || '';
  let entries = page.json.feed?.entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  for (const e of entries) {
    if (!e['im:rating']) continue;
    out.push({ json: { country, id: e.id?.label, author: e.author?.name?.label || '', rating: Number(e['im:rating'].label),
      version: e['im:version']?.label || '', title: e.title?.label || '', text: e.content?.label || '', updated: e.updated?.label || '' } });
  }
});
return out;`),
    merge('Combine review sources'),
    code('Keep reviews not posted before', `
// Static memory holds ids already posted, per country. With no memory yet (first
// run), only reviews from the last FIRST_RUN_DAYS count, so the first digest is not 200 lines.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const seen = memory.posted || {};
const firstRun = Object.keys(seen).length === 0;
const cutoff = Date.now() - cfg.first_run_days * 864e5;
const fresh = [], dropped = { already_posted: 0, too_old: 0 };
for (const { json: r } of $input.all()) {
  if ((seen[r.country] || []).includes(r.id)) { dropped.already_posted++; continue; }
  if (firstRun && new Date(r.updated).getTime() < cutoff) { dropped.too_old++; continue; }
  fresh.push(r);
}
return [{ json: { reviews: fresh, dropped, first_run: firstRun } }];`),
    code('Count stars and tag complaints', `
// Star breakdown and average per country; low reviews get topic tags from
// COMPLAINT_TOPICS. If one version holds VERSION_ALERT_SHARE of low ratings, say so.
const cfg = $('config').first().json;
const { reviews, dropped } = $input.first().json;
const per = {};
for (const r of reviews) {
  const c = per[r.country] ||= { country: r.country, n: 0, sum: 0, stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  c.n++; c.sum += r.rating; c.stars[r.rating]++;
}
const countries = Object.values(per).map(c => ({ ...c, avg: Math.round(c.sum / c.n * 10) / 10 })).sort((a, b) => b.n - a.n);
const low = reviews.filter(r => r.rating <= cfg.low_stars).map(r => {
  const text = (' ' + r.title + ' ' + r.text).toLowerCase();
  const topics = Object.entries(cfg.complaint_topics).filter(([, words]) => words.some(w => text.includes(w))).map(([t]) => t);
  return { ...r, topics: topics.length ? topics : ['other'] };
}).sort((a, b) => a.rating - b.rating || b.updated.localeCompare(a.updated));
const byVersion = {};
for (const r of low) byVersion[r.version] = (byVersion[r.version] || 0) + 1;
const topVersion = Object.entries(byVersion).sort((a, b) => b[1] - a[1])[0];
const share = topVersion ? Math.round(topVersion[1] / low.length * 100) : 0;
const topicCounts = {};
for (const r of low) for (const t of r.topics) topicCounts[t] = (topicCounts[t] || 0) + 1;
return [{ json: {
  total: reviews.length, countries, low, topic_counts: topicCounts, dropped,
  version_alert: topVersion && low.length >= 3 && share >= cfg.version_alert_share ? { version: topVersion[0], count: topVersion[1], share } : null,
  ids: reviews.map(r => ({ country: r.country, id: r.id })),
} }];`),
    code('Write the review digest', `
// Slack mrkdwn: one line per country, then the flagged reviews with their topics.
const cfg = $('config').first().json;
const d = $input.first().json;
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const cut = s => s.length > cfg.excerpt_chars ? s.slice(0, cfg.excerpt_chars - 1) + '…' : s;
const lines = [
  '*App Store reviews* - ' + d.total + ' new' + (cfg.mode === 'preview' ? ' (dry run)' : ''),
  ...d.countries.map(c => '• ' + c.country.toUpperCase() + ': ' + c.n + ' reviews, avg ' + c.avg + ' (5★ ' + c.stars[5] + ' / 4★ ' + c.stars[4] + ' / 3★ ' + c.stars[3] + ' / 2★ ' + c.stars[2] + ' / 1★ ' + c.stars[1] + ')'),
];
if (d.version_alert) lines.push('', ':warning: ' + d.version_alert.count + ' of ' + d.low.length + ' low ratings (' + d.version_alert.share + '%) are on version ' + d.version_alert.version + '.');
if (d.low.length) {
  lines.push('', '*' + d.low.length + ' low reviews* (' + Object.entries(d.topic_counts).map(([t, n]) => t + ' ' + n).join(', ') + ')');
  for (const r of d.low) lines.push(stars(r.rating) + ' ' + r.country.toUpperCase() + ' v' + r.version + ' [' + r.topics.join(', ') + '] *' + r.title + '*: ' + cut(r.text));
}
return [{ json: { text: lines.join('\\n'), total: d.total } }];`),
    ifTrue('Anything new?', '$json.total > 0'),
    stop('STOP: no new reviews'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the digest to Slack', cfg('slack_channel_id'), '$json.text'),
    code('Remember posted reviews', `
// Only after a live post. Keeps the newest 500 ids per country.
const memory = $getWorkflowStaticData('global');
const seen = memory.posted || {};
for (const { country, id } of $('Count stars and tag complaints').first().json.ids) {
  seen[country] = [id, ...(seen[country] || []).filter(x => x !== id)].slice(0, 500);
}
memory.posted = seen;
return [{ json: { remembered: Object.values(seen).reduce((n, a) => n + a.length, 0) } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 09:00', 'config'],
    ['config', 'Sample mode?'],
    ['Sample mode?', 0, 'Load sample reviews'], ['Sample mode?', 1, 'Build one request per country'],
    ['Build one request per country', 'Fetch the review feed'],
    ['Fetch the review feed', 'Read feed entries'],
    ['Load sample reviews', 'Combine review sources'], ['Read feed entries', 0, 'Combine review sources', 1],
    ['Combine review sources', 'Keep reviews not posted before'],
    ['Keep reviews not posted before', 'Count stars and tag complaints'],
    ['Count stars and tag complaints', 'Write the review digest'],
    ['Write the review digest', 'Anything new?'],
    ['Anything new?', 0, 'Slack channel set?'], ['Anything new?', 1, 'STOP: no new reviews'],
    ['Slack channel set?', 0, 'Live run?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live run?', 0, 'Post the digest to Slack'], ['Live run?', 1, 'STOP: dry run - nothing posted'],
    ['Post the digest to Slack', 'Remember posted reviews'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every morning at 09:00. The app id, storefronts and complaint word lists live in `config`; a blank `APP_ID` is what keeps the first run on sample data.', nodes: ['Run manually', 'Every day at 09:00', 'config'] },
    { title: 'Read the review feeds', why: 'Apple\'s feed is public JSON, one URL per storefront, so there is no credential to set up. `Read feed entries` handles the single-review case, where Apple returns an object instead of a list.', nodes: ['Sample mode?', 'Load sample reviews', 'Build one request per country', 'Fetch the review feed', 'Read feed entries', 'Combine review sources'] },
    { title: 'Find new reviews and count', why: 'The feed always returns the newest 50, so `Keep reviews not posted before` drops ids already sent. The version check needs at least 3 low ratings, so one angry review does not cry regression.', nodes: ['Keep reviews not posted before', 'Count stars and tag complaints'] },
    { title: 'Post and remember', why: 'A quiet day, a blank channel and a dry run each end on their own STOP. Ids are remembered only after `Post the digest to Slack` succeeds, so a failed post is repeated tomorrow, not lost.', nodes: ['Write the review digest', 'Anything new?', 'STOP: no new reviews', 'Slack channel set?', 'STOP: no Slack channel', 'Live run?', 'STOP: dry run - nothing posted', 'Post the digest to Slack', 'Remember posted reviews'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample reviews', 'STOP: no Slack channel'], notReached: ['Fetch the review feed'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Count stars and tag complaints'][0];
        if (d.total !== 11) f.push(`expected 11 reviews inside FIRST_RUN_DAYS, got ${d.total}`);
        if (d.low.length !== 5) f.push(`expected 5 low reviews, got ${d.low.length}`);
        const us = d.countries.find((c: any) => c.country === 'us');
        if (us?.avg !== 2.6) f.push(`US average should be 2.6, got ${us?.avg}`);
        if (d.version_alert?.version !== '3.2.0' || d.version_alert?.count !== 4) f.push('4 of 5 low ratings are on 3.2.0 and should raise the version line');
        if ((d.topic_counts.crash || 0) !== 3) f.push(`3 crash reviews expected (incl. the German one), got ${d.topic_counts.crash}`);
        if (!d.low.find((r: any) => r.id === 'r105')?.topics.includes('pricing')) f.push('r105 should be tagged pricing');
        return f;
      },
    },
    {
      name: 'live feed for two countries to Slack', start: 'Every day at 09:00',
      overrides: { APP_ID: '1234567890', COUNTRIES: ['us', 'gb'], DRY_RUN: false, SLACK_CHANNEL_ID: 'C0REVIEWS' },
      mocks: {
        'Fetch the review feed': (items: any[]) => items.map(r => r.country === 'us'
          ? { feed: { entry: [
              { 'im:name': { label: 'Budget Buddy' } },
              { author: { name: { label: 'zed' } }, 'im:version': { label: '4.0.1' }, 'im:rating': { label: '1' }, id: { label: '9001' }, title: { label: 'Cannot sign in' }, content: { label: 'Password reset loop since 4.0.1', attributes: { type: 'text' } }, updated: { label: new Date().toISOString() } },
              { author: { name: { label: 'amy' } }, 'im:version': { label: '4.0.1' }, 'im:rating': { label: '5' }, id: { label: '9002' }, title: { label: 'Great' }, content: { label: 'Love it' }, updated: { label: new Date().toISOString() } },
            ] } }
          : { feed: { entry: { author: { name: { label: 'olly' } }, 'im:version': { label: '4.0.1' }, 'im:rating': { label: '4' }, id: { label: '9101' }, title: { label: 'Nice' }, content: { label: 'Solid app' }, updated: { label: new Date().toISOString() } } } }),
        'Post the digest to Slack': [{ ok: true }],
      },
      expect: { reached: ['Post the digest to Slack', 'Remember posted reviews'], notReached: ['Load sample reviews'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const d = out['Count stars and tag complaints'][0];
        if (d.total !== 3) f.push(`app entry skipped and single-entry feed read: expected 3 reviews, got ${d.total}`);
        if (!d.low[0]?.topics.includes('login')) f.push('the 1 star review should be tagged login');
        if (out['Remember posted reviews'][0].remembered !== 3) f.push('3 ids should be remembered');
        return f;
      },
    },
  ],
});
