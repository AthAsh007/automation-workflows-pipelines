import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const QUERY = 'query ($board: [ID!]) { boards (ids: $board) { name items_page (limit: 200) { items { id name url updated_at group { title } column_values { id text ... on StatusValue { label updated_at } } } } } }';
const MUTATION = 'mutation ($item: ID!, $body: String!) { create_update (item_id: $item, body: $body) { id } }';

export default defineSpec({
  slug: 'monday-stuck-item-escalation',
  title: 'Escalate monday.com items stuck in a status for too long',
  summary: 'Checks a monday.com board each weekday morning, counts business days each item has sat in its current status against a per-status limit, posts one update on each stuck item and a Slack list for the team lead, once per item and status.',
  category: 'Project management',
  description: {
    who: 'Operations and delivery leads who run client work on a monday.com board and find out a week late that an item sat in "Waiting for review". It flags only the items over their limit, once.',
    how: [
      'Every weekday at 09:30 it reads the items on one board through the monday.com GraphQL API, or 6 sample items until monday.com is connected.',
      'For each item it reads the status label and the time that status last changed, then counts business days since.',
      'Each status has its own limit in `STATUS_MAX_DAYS` (2 days for review, 5 for work in progress). Statuses not listed, like Done, are ignored.',
      'An item over its limit gets one escalation per status change. The key is remembered in workflow static data, so it is not posted again tomorrow.',
      'A live run posts an update on the item itself and the run posts one Slack message listing every stuck item with its owner.',
    ],
    setup: [
      'Run it once as imported. It checks sample items and stops at `STOP: preview - nothing sent` and `STOP: test - monday.com untouched`.',
      'Add a monday.com credential to `Query board items on monday.com` and `Post update on the monday.com item`, fill in `BOARD_ID` and set `USE_MONDAY = true`.',
      'Match `STATUS_COLUMN_ID` and `OWNER_COLUMN_ID` to your board columns, and set `SLACK_CHANNEL_ID`.',
      'Put your address in `TEST_EMAIL` to post the Slack list only, then set `TEST_RUN = false` to also comment on the items.',
    ],
    requirements: ['A monday.com account with API access', 'Optional: a Slack workspace'],
    customize: [
      '`STATUS_MAX_DAYS` sets the limit for each status label on your board.',
      'Set `COUNT_WEEKENDS = true` for boards that move seven days a week.',
      '`MAX_ESCALATIONS` caps updates per run so a board-wide stall does not spam everyone.',
    ],
  },
  config: {
    intro: ['USE_MONDAY false -> SAMPLE items so the run works before any credential exists.', 'SLACK_CHANNEL_ID blank -> no Slack list. Only a live run posts updates on items.'],
    consts: [
      { name: 'USE_MONDAY', value: false, note: 'set true after adding the monday.com credential to both monday.com nodes' },
      { name: 'BOARD_ID', value: '', note: 'board id, the number in the board URL' },
      { name: 'STATUS_COLUMN_ID', value: 'status', note: 'column id of the status column to watch' },
      { name: 'OWNER_COLUMN_ID', value: 'person', note: 'column id of the people column shown as owner' },
      { name: 'STATUS_MAX_DAYS', value: { 'Working on it': 5, 'Waiting for review': 2, 'Waiting on client': 4, Stuck: 1 }, note: 'status label -> business days allowed before escalating' },
      { name: 'COUNT_WEEKENDS', value: false, note: 'false counts business days only' },
      { name: 'MAX_ESCALATIONS', value: 10, note: 'hard ceiling on item updates per run, oldest first' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the stuck-items list; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 09:30', '30 9 * * 1-5'),
    ifTrue('monday.com connected?', cfg('use_monday')),
    http('Query board items on monday.com', {
      method: 'POST', url: 'https://api.monday.com/v2', auth: 'mondayComApi', outward: false, headers: { 'API-Version': '2024-10' },
      jsonBody: `JSON.stringify({ query: '${QUERY}', variables: { board: [String(${cfg('board_id')})] } })`,
    }),
    code('Load sample board items', `
// Used until USE_MONDAY is true. Same GraphQL shape. Status change times are counted
// back in business days so the expected escalations hold on any weekday.
const day = 864e5;
const isWeekday = t => { const d = new Date(t).getUTCDay(); return d !== 0 && d !== 6; };
const bizAgo = n => { let t = Date.now(), k = 0; while (k < n) { t -= day; if (isWeekday(t)) k++; } return new Date(t).toISOString(); };
const item = (id, name, label, changedDaysAgo, owner, group) => ({
  id, name, url: 'https://acme-example.monday.com/boards/1234/pulses/' + id, updated_at: new Date().toISOString(),
  group: { title: group },
  column_values: [
    { id: 'status', text: label, label, updated_at: bizAgo(changedDaysAgo) },
    { id: 'person', text: owner },
  ],
});
return [{ json: { data: { boards: [{ name: 'Client onboarding', items_page: { items: [
  item('5001', 'Harbour Dental onboarding', 'Waiting for review', 4, 'Dana Okafor', 'October'),
  item('5002', 'Northfield site migration', 'Working on it', 3, 'Marco Lindqvist', 'October'),
  item('5003', 'Orchard Lane contract', 'Stuck', 2, 'Priya Natarajan', 'October'),
  item('5004', 'Pine & Co kickoff', 'Done', 20, 'Dana Okafor', 'September'),
  item('5005', 'Lumen Physio data import', 'Working on it', 9, '', 'October'),
  item('5006', 'Brightside Vets welcome pack', 'Waiting on client', 4, 'Lee Chen', 'October'),
] } }] } } }];`),
    merge('Combine item sources'),
    code('Find items stuck too long', `
// Days in status = business days (or calendar days) since the status column last changed.
// One escalation per item per status change: the key includes the change time, so a
// new status resets it. Static data holds keys already escalated by a live run.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const sent = memory.escalated || {};
const day = 864e5, now = Date.now();
const counts = t => { const d = new Date(t).getUTCDay(); return cfg.count_weekends || (d !== 0 && d !== 6); };
const daysSince = from => { let d = from, n = 0; while (d + day <= now) { if (counts(d)) n++; d += day; } return n; };
const stuck = [], held = [];
let checked = 0, board = '';
for (const { json } of $input.all()) for (const b of json.data?.boards || []) {
  board = b.name;
  for (const it of b.items_page?.items || []) {
    checked++;
    const col = (it.column_values || []).find(c => c.id === cfg.status_column_id) || {};
    const label = col.label || col.text || '';
    const limit = cfg.status_max_days[label];
    if (limit === undefined) continue;
    const changed = col.updated_at || it.updated_at;
    const days = daysSince(new Date(changed).getTime());
    if (days <= limit) continue;
    const key = it.id + '|' + label + '|' + changed;
    const owner = ((it.column_values || []).find(c => c.id === cfg.owner_column_id) || {}).text || '';
    if (sent[key]) { held.push({ name: it.name, reason: 'already escalated for this status' }); continue; }
    stuck.push({ item_id: it.id, name: it.name, url: it.url, group: it.group?.title || '', status: label, days, limit, over: days - limit, owner: owner || 'nobody assigned', key,
      update_body: 'Escalation: this item has been in "' + label + '" for ' + days + ' business days (limit ' + limit + '). ' + (owner ? owner + ', can you move it on or post what is blocking it?' : 'It has no owner. Please assign someone today.') });
  }
}
stuck.sort((a, b) => b.over - a.over);
for (const s of stuck.slice(cfg.max_escalations)) held.push({ name: s.name, reason: 'over MAX_ESCALATIONS, next run' });
return [{ json: { board, checked, stuck: stuck.slice(0, cfg.max_escalations), held } }];`),
    code('Split into item updates', `
// One item per escalation so each monday.com update is its own call.
return $input.first().json.stuck.map(json => ({ json }));`),
    code('Write the Slack list', `
// One message for the team lead, worst first, with what was held back.
const cfg = $('config').first().json;
const r = $input.first().json;
const text = [
  '*Stuck items on ' + r.board + '* (' + cfg.mode + '): ' + r.stuck.length + ' over their limit, ' + r.checked + ' checked.',
  ...r.stuck.map(s => '- <' + s.url + '|' + s.name + '>: ' + s.status + ' for ' + s.days + 'd (limit ' + s.limit + '), ' + s.owner),
  ...(r.held.length ? ['Held back:', ...r.held.map(h => '- ' + h.name + ': ' + h.reason)] : []),
].join('\\n');
return [{ json: { text, stuck: r.stuck.length } }];`),
    ifWhen('Post to Slack?', [[cfg('sends_enabled'), 'true'], [cfg('slack_enabled'), 'true'], ['$json.stuck', 'gt', 0]]),
    stop('STOP: preview - nothing sent'),
    slack.post('Post stuck items to Slack', cfg('slack_channel_id'), '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test - monday.com untouched'),
    http('Post update on the monday.com item', {
      method: 'POST', url: 'https://api.monday.com/v2', auth: 'mondayComApi', headers: { 'API-Version': '2024-10' },
      jsonBody: `JSON.stringify({ query: '${MUTATION}', variables: { item: String($json.item_id), body: $json.update_body } })`,
    }),
    code('Remember escalated items', `
// Only after monday.com accepted the update: store the key so tomorrow skips it.
// Keys older than 60 days are pruned so static data stays small.
const memory = $getWorkflowStaticData('global');
const sent = memory.escalated || {};
const cutoff = Date.now() - 60 * 864e5;
for (const k of Object.keys(sent)) if (sent[k] < cutoff) delete sent[k];
const items = $('Split into item updates').all();
$input.all().forEach((res, i) => { if (res.json.data?.create_update?.id) sent[items[i].json.key] = Date.now(); });
memory.escalated = sent;
return [{ json: { remembered: Object.keys(sent).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 09:30', 'config'],
    ['config', 'monday.com connected?'],
    ['monday.com connected?', 0, 'Query board items on monday.com'], ['monday.com connected?', 1, 'Load sample board items'],
    ['Query board items on monday.com', 'Combine item sources'], ['Load sample board items', 0, 'Combine item sources', 1],
    ['Combine item sources', 'Find items stuck too long'],
    ['Find items stuck too long', 'Split into item updates'],
    ['Find items stuck too long', 'Write the Slack list'],
    ['Write the Slack list', 'Post to Slack?'],
    ['Post to Slack?', 0, 'Post stuck items to Slack'], ['Post to Slack?', 1, 'STOP: preview - nothing sent'],
    ['Split into item updates', 'Live run?'],
    ['Live run?', 0, 'Post update on the monday.com item'], ['Live run?', 1, 'STOP: test - monday.com untouched'],
    ['Post update on the monday.com item', 'Remember escalated items'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 09:30 or by hand. The per-status limits, column ids and the weekend rule all live in `config`, so a board with different labels only needs that node edited.', nodes: ['Run manually', 'Every weekday at 09:30', 'config'] },
    { title: 'Read the board', why: 'One GraphQL query returns every item with its status label and the time that label last changed. `Load sample board items` returns the same shape, with change times set in business days so the result holds any day.', nodes: ['monday.com connected?', 'Query board items on monday.com', 'Load sample board items', 'Combine item sources'] },
    { title: 'Find stuck items and tell Slack', why: 'The escalation key includes the status change time, so a moved item resets and a stalled one is flagged once. `Post to Slack?` also needs at least one stuck item, so a quiet board stays quiet.', nodes: ['Find items stuck too long', 'Split into item updates', 'Write the Slack list', 'Post to Slack?', 'STOP: preview - nothing sent', 'Post stuck items to Slack'] },
    { title: 'Comment on the items', why: 'Only a live run writes to monday.com. `Remember escalated items` stores a key only after the update call returns an id, so a failed post is retried next run instead of silently skipped.', nodes: ['Live run?', 'STOP: test - monday.com untouched', 'Post update on the monday.com item', 'Remember escalated items'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample board items', 'STOP: preview - nothing sent', 'STOP: test - monday.com untouched'], outward: 'none' },
      check: out => {
        const r = out['Find items stuck too long'][0];
        const f: string[] = [];
        const names = r.stuck.map((s: any) => s.name);
        const want = ['Lumen Physio data import', 'Harbour Dental onboarding', 'Orchard Lane contract'];
        if (names.join('|') !== want.join('|')) f.push(`stuck order should be ${want.join(', ')}; got ${names.join(', ')}`);
        if (r.stuck[0]?.owner !== 'nobody assigned') f.push('item with no owner should say so');
        if (r.stuck.find((s: any) => s.name === 'Harbour Dental onboarding')?.days !== 4) f.push('Harbour Dental should be 4 business days in review');
        if (names.includes('Brightside Vets welcome pack')) f.push('4 days waiting on client is within its limit of 4');
        if (r.checked !== 6) f.push('all 6 items should be checked');
        return f;
      },
    },
    {
      name: 'test mode posts Slack only', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0OPS' },
      mocks: { 'Post stuck items to Slack': [{ ok: true }] },
      expect: { reached: ['Post stuck items to Slack', 'STOP: test - monday.com untouched'], notReached: ['Post update on the monday.com item'], outward: 'some' },
    },
    {
      name: 'live with monday.com and Slack', start: 'Every weekday at 09:30',
      overrides: { USE_MONDAY: true, BOARD_ID: '1234567890', TEST_RUN: false, SLACK_CHANNEL_ID: 'C0OPS', COUNT_WEEKENDS: true },
      mocks: {
        'Query board items on monday.com': [{ data: { boards: [{ name: 'Delivery', items_page: { items: [
          { id: '77', name: 'Migrate DNS', url: 'https://x.monday.com/pulses/77', updated_at: new Date().toISOString(), group: { title: 'Now' },
            column_values: [{ id: 'status', text: 'Stuck', label: 'Stuck', updated_at: new Date(Date.now() - 3.5 * 864e5).toISOString() }, { id: 'person', text: 'Lee Chen' }] },
        ] } }] } }],
        'Post update on the monday.com item': [{ data: { create_update: { id: '991' } } }],
        'Post stuck items to Slack': [{ ok: true }],
      },
      expect: { reached: ['Post update on the monday.com item', 'Remember escalated items', 'Post stuck items to Slack'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Find items stuck too long'][0].stuck[0]?.days !== 3) f.push('3.5 calendar days should count as 3 with COUNT_WEEKENDS');
        if (out['Remember escalated items'][0]?.remembered !== 1) f.push('escalation key should be remembered');
        return f;
      },
    },
  ],
});
