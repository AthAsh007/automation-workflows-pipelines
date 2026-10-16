import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'trello-done-card-archiver',
  title: 'Archive old Done cards on Trello with a dry-run report',
  summary: 'Every Sunday evening finds cards in Trello Done lists with no activity for 30 days, keeps anything labelled keep, archives the oldest up to a per-run cap and reports exactly what moved, with a dry run as the default.',
  category: 'Project management',
  description: {
    who: 'Teams whose Trello boards have a Done column with hundreds of cards that nobody scrolls past. It archives the old ones on a schedule, so the board stays fast and the history stays searchable.',
    how: [
      'Every Sunday at 20:00 it reads the lists and open cards on one board, or a sample board until Trello is connected.',
      'Lists whose name matches `DONE_LIST_PATTERNS` (Done, Shipped, Released by default) are the only ones considered.',
      'A card qualifies when its last activity is older than `ARCHIVE_AFTER_DAYS`. Cards with a label in `KEEP_LABELS` and cards whose due date has not passed are kept with a reason.',
      'The oldest cards are archived first, up to `MAX_ARCHIVE_PER_RUN`. Archiving sets closed=true, so every card can be restored from the board menu.',
      'A report lists every archived and kept card per list, and is posted to Slack on a live run.',
    ],
    setup: [
      'Run it once as imported. It reports on a sample board and stops at `STOP: dry run - nothing archived`.',
      'Add a Trello credential to `Fetch lists and cards from Trello` and `Archive the card on Trello`, fill in `BOARD_ID` and set `USE_TRELLO = true`.',
      'Read the report in `Write the archive report` for your real board and adjust the patterns and labels.',
      'Set `DRY_RUN = false` to archive. Optionally set `SLACK_CHANNEL_ID` to get the report in Slack.',
    ],
    requirements: ['A Trello account and board', 'Optional: a Slack workspace'],
    customize: [
      '`ARCHIVE_AFTER_DAYS` decides how long a finished card stays visible.',
      '`KEEP_LABELS` protects reference cards, such as release notes, from ever being archived.',
      '`MAX_ARCHIVE_PER_RUN` keeps the first live run on a big board to a reviewable size.',
    ],
  },
  config: {
    intro: ['USE_TRELLO false -> a SAMPLE board so the run works before any credential exists.', 'DRY_RUN true -> the report is built, no card is archived.'],
    consts: [
      { name: 'USE_TRELLO', value: false, note: 'set true after adding the Trello credential to both Trello nodes' },
      { name: 'BOARD_ID', value: '', note: 'board id or short link, the code after trello.com/b/ in the board URL' },
      { name: 'DONE_LIST_PATTERNS', value: ['done', 'shipped', 'released'], note: 'a list is a Done list when its name contains one of these (case ignored)' },
      { name: 'ARCHIVE_AFTER_DAYS', value: 30, note: 'days since the last activity on a card before it is archived' },
      { name: 'KEEP_LABELS', value: ['keep', 'pinned', 'reference'], note: 'cards with one of these label names are never archived' },
      { name: 'MAX_ARCHIVE_PER_RUN', value: 50, note: 'hard ceiling on cards archived per run, oldest first' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the report on live runs; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Sunday at 20:00', '0 20 * * 0'),
    ifTrue('Trello connected?', cfg('use_trello')),
    http('Fetch lists and cards from Trello', {
      url: `={{ 'https://api.trello.com/1/boards/' + ${cfg('board_id')} + '/lists' }}`, auth: 'trelloApi',
      query: { cards: 'open', card_fields: 'name,dateLastActivity,labels,due,dueComplete,shortUrl', filter: 'open', fields: 'name' },
    }),
    code('Load sample Trello board', `
// Used until USE_TRELLO is true. One item per list with its open cards, like the API.
const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const card = (id, name, days, labels = [], due = null) => ({ id, name, dateLastActivity: ago(days), labels: labels.map(l => ({ name: l })), due, dueComplete: false, shortUrl: 'https://trello.com/c/' + id });
return [
  { id: 'l1', name: 'Backlog', cards: [card('b1', 'Research competitor pricing', 120)] },
  { id: 'l2', name: 'Doing', cards: [card('d1', 'Spring newsletter', 3)] },
  { id: 'l3', name: 'Done', cards: [
    card('c1', 'Fix checkout button on mobile', 45),
    card('c2', 'Update team handbook', 31),
    card('c3', 'Release notes template', 60, ['Keep']),
    card('c4', 'Q3 board report', 10),
    card('c5', 'Migrate old blog posts', 90),
    card('c6', 'Renew domain', 40, [], new Date(Date.now() + 20 * 864e5).toISOString()),
  ] },
  { id: 'l4', name: 'Shipped - September', cards: [card('s1', 'Dark mode', 35, ['frontend'])] },
].map(json => ({ json }));`),
    merge('Combine board sources'),
    code('Pick cards to archive', `
// Only Done lists. Old = no activity for ARCHIVE_AFTER_DAYS. Protected cards and
// future-dated cards are kept with a reason. Oldest first, then MAX_ARCHIVE_PER_RUN.
const cfg = $('config').first().json;
const now = Date.now();
const patterns = cfg.done_list_patterns.map(p => p.toLowerCase());
const keep = cfg.keep_labels.map(l => l.toLowerCase());
const candidates = [], kept = [];
let doneLists = 0, scanned = 0;
for (const { json: list } of $input.all()) {
  if (!list.name || !patterns.some(p => list.name.toLowerCase().includes(p))) continue;
  doneLists++;
  for (const c of list.cards || []) {
    scanned++;
    const idle = Math.floor((now - new Date(c.dateLastActivity).getTime()) / 864e5);
    const base = { id: c.id, name: c.name, list: list.name, idle_days: idle, url: c.shortUrl };
    const label = (c.labels || []).map(l => String(l.name || '').toLowerCase()).find(l => keep.includes(l));
    if (idle < cfg.archive_after_days) continue;
    if (label) { kept.push({ ...base, reason: 'label ' + label }); continue; }
    if (c.due && !c.dueComplete && new Date(c.due).getTime() > now) { kept.push({ ...base, reason: 'due date still ahead' }); continue; }
    candidates.push(base);
  }
}
candidates.sort((a, b) => b.idle_days - a.idle_days);
const archive = candidates.slice(0, cfg.max_archive_per_run);
for (const c of candidates.slice(cfg.max_archive_per_run)) kept.push({ ...c, reason: 'over MAX_ARCHIVE_PER_RUN, next run' });
return [{ json: { archive, kept, done_lists: doneLists, scanned } }];`),
    code('Split into cards to archive', `
// One item per card so each archive call stands alone and can retry on its own.
return $input.first().json.archive.map(json => ({ json }));`),
    ifTrue('Archive for real?', cfg('live')),
    stop('STOP: dry run - nothing archived'),
    http('Archive the card on Trello', { method: 'PUT', url: "={{ 'https://api.trello.com/1/cards/' + $json.id }}", auth: 'trelloApi', query: { closed: 'true' } }),
    code('Write the archive report', `
// Grouped per list so a reviewer can scan it; kept cards say why.
const cfg = $('config').first().json;
const r = $input.first().json;
const verb = cfg.live ? 'Archived' : 'Would archive';
const byList = {};
for (const c of r.archive) (byList[c.list] ||= []).push(c);
const text = [
  '*Trello clean-up* (' + cfg.mode + '): ' + verb.toLowerCase() + ' ' + r.archive.length + ' of ' + r.scanned + ' cards in ' + r.done_lists + ' Done list(s).',
  ...Object.entries(byList).flatMap(([list, cards]) => [list + ':', ...cards.map(c => '- ' + c.name + ' (' + c.idle_days + ' days idle)')]),
  ...(r.kept.length ? ['Kept:', ...r.kept.map(k => '- ' + k.name + ': ' + k.reason)] : []),
].join('\\n');
return [{ json: { text, archived: r.archive.length, kept: r.kept.length } }];`),
    ifWhen('Post the report to Slack?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true'], ['$json.archived', 'gt', 0]]),
    stop('STOP: report not posted'),
    slack.post('Post the report to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Sunday at 20:00', 'config'],
    ['config', 'Trello connected?'],
    ['Trello connected?', 0, 'Fetch lists and cards from Trello'], ['Trello connected?', 1, 'Load sample Trello board'],
    ['Fetch lists and cards from Trello', 'Combine board sources'], ['Load sample Trello board', 0, 'Combine board sources', 1],
    ['Combine board sources', 'Pick cards to archive'],
    ['Pick cards to archive', 'Split into cards to archive'],
    ['Pick cards to archive', 'Write the archive report'],
    ['Write the archive report', 'Post the report to Slack?'],
    ['Post the report to Slack?', 0, 'Post the report to Slack'], ['Post the report to Slack?', 1, 'STOP: report not posted'],
    ['Split into cards to archive', 'Archive for real?'],
    ['Archive for real?', 0, 'Archive the card on Trello'], ['Archive for real?', 1, 'STOP: dry run - nothing archived'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Sunday at 20:00, when nobody is moving cards, or by hand. Board id, list patterns, the age limit and protected labels all live in `config`.', nodes: ['Run manually', 'Every Sunday at 20:00', 'config'] },
    { title: 'Read the board', why: 'One call returns every open list with its open cards and their last activity date, so no per-list request is needed. `Load sample Trello board` returns the same shape until `USE_TRELLO` is true.', nodes: ['Trello connected?', 'Fetch lists and cards from Trello', 'Load sample Trello board', 'Combine board sources'] },
    { title: 'Choose cards and report', why: 'Only lists matching `DONE_LIST_PATTERNS` are touched, so an old Backlog card is never archived by accident. Every kept card carries a reason, and the report goes to Slack only after a live run.', nodes: ['Pick cards to archive', 'Split into cards to archive', 'Write the archive report', 'Post the report to Slack?', 'STOP: report not posted', 'Post the report to Slack'] },
    { title: 'Archive on Trello', why: '`Archive for real?` opens only when `DRY_RUN` is false. Archiving sets closed=true rather than deleting, so a mistake is undone from the board menu in two clicks.', nodes: ['Archive for real?', 'STOP: dry run - nothing archived', 'Archive the card on Trello'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample Trello board', 'STOP: dry run - nothing archived', 'STOP: report not posted'], outward: 'none' },
      check: out => {
        const r = out['Pick cards to archive'][0];
        const f: string[] = [];
        const ids = r.archive.map((c: any) => c.id).join(',');
        if (ids !== 'c5,c1,s1,c2') f.push(`archive order should be c5,c1,s1,c2; got ${ids}`);
        if (!r.kept.some((k: any) => k.id === 'c3' && k.reason === 'label keep')) f.push('Keep label (any case) should protect c3');
        if (!r.kept.some((k: any) => k.id === 'c6' && k.reason === 'due date still ahead')) f.push('future-due card should be kept');
        if (r.archive.some((c: any) => c.id === 'b1')) f.push('Backlog cards must never be archived');
        if (r.done_lists !== 2) f.push('Done and Shipped lists should both match');
        if (!out['Write the archive report'][0].text.includes('Would archive') && !out['Write the archive report'][0].text.includes('would archive')) f.push('dry-run report should say would archive');
        return f;
      },
    },
    {
      name: 'live archive with Slack report', start: 'Every Sunday at 20:00',
      overrides: { USE_TRELLO: true, BOARD_ID: 'AbCd1234', DRY_RUN: false, SLACK_CHANNEL_ID: 'C0TEAM', MAX_ARCHIVE_PER_RUN: 1 },
      mocks: {
        'Fetch lists and cards from Trello': [
          { id: 'L1', name: 'To Do', cards: [] },
          { id: 'L2', name: 'DONE', cards: [
            { id: 'k1', name: 'Old task A', dateLastActivity: new Date(Date.now() - 50 * 864e5).toISOString(), labels: [], due: null, dueComplete: false, shortUrl: 'https://trello.com/c/k1' },
            { id: 'k2', name: 'Old task B', dateLastActivity: new Date(Date.now() - 70 * 864e5).toISOString(), labels: [], due: null, dueComplete: false, shortUrl: 'https://trello.com/c/k2' },
          ] },
        ],
        'Archive the card on Trello': (items: any[]) => items.map(i => ({ id: i.id, closed: true })),
        'Post the report to Slack': [{ ok: true }],
      },
      expect: { reached: ['Archive the card on Trello', 'Post the report to Slack'], notReached: ['Load sample Trello board'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Archive the card on Trello'].length !== 1 || out['Archive the card on Trello'][0].id !== 'k2') f.push('cap of 1 should archive only the oldest card k2');
        if (!out['Pick cards to archive'][0].kept.some((k: any) => k.reason.startsWith('over MAX'))) f.push('k1 should be held by the cap');
        return f;
      },
    },
  ],
});
