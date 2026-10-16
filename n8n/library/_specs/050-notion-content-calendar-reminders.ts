import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'notion-content-calendar-reminders',
  title: 'Remind writers in Slack about Notion content calendar deadlines',
  summary: 'Queries a Notion content calendar every weekday, works out which unpublished pieces are 3 days out, due tomorrow or overdue, sends each reminder step once per due date, and posts one Slack message that mentions each writer.',
  category: 'Productivity and operations',
  description: {
    who: 'Content leads who run an editorial calendar in Notion and spend Monday mornings chasing writers about drafts. Writers get a nudge before the deadline, and overdue pieces reach the editor.',
    how: [
      'Every weekday at 09:00 it queries your Notion database for pieces that are not published and due within 3 days or already overdue, or uses sample pages until Notion is connected.',
      'Each piece gets the next reminder step: 3 days out, 1 day out, then overdue at 1, 3 and 7 days late. A step missed over a weekend is caught up on Monday.',
      'A step is sent once per due date. Moving the due date in Notion starts the ladder again.',
      'One Slack message groups the reminders by writer and mentions them. Pieces with no writer, or a writer with no Slack id, are listed for the editor.',
    ],
    setup: [
      'Run it once as imported. It works through the sample calendar and stops at `STOP: preview - nothing posted`.',
      'Share the database with your Notion integration, add the credential to `Query the content calendar`, set `NOTION_DATABASE_ID` and the property names in `PROPS`, then set `USE_NOTION = true`.',
      'Fill `WRITER_SLACK_IDS` (Notion email or name to Slack member id), connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post with a [TEST] prefix and no real mentions. Set `TEST_RUN = false` to go live.',
    ],
    requirements: ['A Notion database with a title, status (or select), date and person property', 'A Slack workspace'],
    customize: [
      '`REMINDER_DAYS` and `OVERDUE_DAYS` set the ladder.',
      '`DONE_STATUSES` lists statuses that end reminders, such as Published or Cancelled.',
      '`EDITOR_SLACK_ID` gets mentioned for unassigned and overdue pieces.',
    ],
  },
  config: {
    intro: ['USE_NOTION false -> SAMPLE calendar pages.', 'SLACK_CHANNEL_ID blank -> reminders are built but not posted.'],
    consts: [
      { name: 'USE_NOTION', value: false, note: 'set true after adding the Notion credential and sharing the database with it' },
      { name: 'NOTION_DATABASE_ID', value: '', note: 'id from the database URL (32 characters)' },
      { name: 'PROPS', value: { title: 'Name', status: 'Status', due: 'Due date', writer: 'Writer' }, note: 'property names in your database' },
      { name: 'DONE_STATUSES', value: ['Published', 'Scheduled', 'Cancelled'], note: 'statuses that need no reminder' },
      { name: 'REMINDER_DAYS', value: [3, 1], note: 'days before the due date that get a reminder' },
      { name: 'OVERDUE_DAYS', value: [1, 3, 7], note: 'days late that get an overdue reminder' },
      { name: 'WRITER_SLACK_IDS', value: { 'maya@yourcompany.example': 'U01MAYA00', 'Tom Reyes': 'U01TOMR00' }, note: 'Notion person email or name -> Slack member id' },
      { name: 'EDITOR_SLACK_ID', value: 'U01EDIT00', note: 'Slack member id mentioned on overdue and unassigned pieces' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for reminders; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 09:00', '0 9 * * 1-5'),
    ifTrue('Notion connected?', cfg('use_notion')),
    http('Query the content calendar', {
      method: 'POST', outward: false, auth: 'notionApi',
      url: `={{ 'https://api.notion.com/v1/databases/' + ${cfg('notion_database_id')} + '/query' }}`,
      headers: { 'Notion-Version': '2022-06-28' },
      jsonBody: `JSON.stringify({ page_size: 100, filter: { and: [ { property: ${cfg('props')}.due, date: { on_or_before: new Date(Date.now() + Math.max(...${cfg('reminder_days')}) * 864e5).toISOString().slice(0, 10) } } ] }, sorts: [{ property: ${cfg('props')}.due, direction: 'ascending' }] })`,
    }),
    code('Read calendar pages', `
// Notion query results -> flat pieces. Status can be a status or a select
// property, writer a people property; both are read either way.
const P = $('config').first().json.props;
const text = p => (p?.title || p?.rich_text || []).map(t => t.plain_text).join('');
const pieces = $input.all().flatMap(i => i.json.results || []).map(pg => {
  const pr = pg.properties || {};
  const people = pr[P.writer]?.people || [];
  return { id: pg.id, url: pg.url, title: text(pr[P.title]) || 'Untitled',
    status: pr[P.status]?.status?.name || pr[P.status]?.select?.name || '',
    due: pr[P.due]?.date?.start?.slice(0, 10) || '',
    writers: people.map(w => ({ name: w.name || '', email: w.person?.email || '' })) };
});
return [{ json: { pieces } }];`),
    code('Load sample calendar', `
// Used until USE_NOTION is true. Already flattened, as Read calendar pages returns.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const w = (name, email) => [{ name, email }];
return [{ json: { pieces: [
  { id: 'pg-01', url: 'https://www.notion.so/pg01', title: 'Guide: onboarding emails that get read', status: 'Drafting', due: day(3), writers: w('Maya Lin', 'maya@yourcompany.example') },
  { id: 'pg-02', url: 'https://www.notion.so/pg02', title: 'Case study: Harbour Dental', status: 'In review', due: day(1), writers: w('Tom Reyes', 'tom@yourcompany.example') },
  { id: 'pg-03', url: 'https://www.notion.so/pg03', title: 'Pricing page teardown', status: 'Drafting', due: day(-2), writers: w('Maya Lin', 'maya@yourcompany.example') },
  { id: 'pg-04', url: 'https://www.notion.so/pg04', title: 'Q1 webinar recap', status: 'Idea', due: day(10), writers: w('Tom Reyes', 'tom@yourcompany.example') },
  { id: 'pg-05', url: 'https://www.notion.so/pg05', title: 'September changelog', status: 'Published', due: day(-1), writers: w('Maya Lin', 'maya@yourcompany.example') },
  { id: 'pg-06', url: 'https://www.notion.so/pg06', title: 'Interview with a support lead', status: 'Drafting', due: day(2), writers: [] },
  { id: 'pg-07', url: 'https://www.notion.so/pg07', title: 'Agency pricing survey', status: 'Drafting', due: day(0), writers: w('Ana Silva', 'ana@freelance.example') },
] } }];`),
    merge('Combine calendar sources'),
    code('Pick reminders due today', `
// Ladder per piece. Before the deadline the step is the smallest REMINDER_DAYS
// value >= days left (so Monday catches a step that fell on Sunday). After it,
// the largest OVERDUE_DAYS value <= days late. A step is sent once per due date.
const cfg = $('config').first().json;
const sent = new Set($getWorkflowStaticData('global').sent || []);
const before = [...cfg.reminder_days].sort((a, b) => a - b);
const after = [...cfg.overdue_days].sort((a, b) => a - b);
const done = new Set(cfg.done_statuses.map(s => s.toLowerCase()));
const today = new Date(new Date().toISOString().slice(0, 10));
const slackId = w => cfg.writer_slack_ids[w.email] || cfg.writer_slack_ids[w.name] || '';
const reminders = [], skipped = [];
for (const p of $input.first().json.pieces) {
  if (done.has(p.status.toLowerCase())) { skipped.push({ title: p.title, reason: 'status ' + p.status }); continue; }
  if (!p.due) { skipped.push({ title: p.title, reason: 'no due date' }); continue; }
  const left = Math.round((new Date(p.due) - today) / 864e5);
  let step = null;
  if (left >= 0) { const s = before.find(d => d >= left); if (s !== undefined) step = left === 0 ? 'due today' : s === 1 ? 'due tomorrow' : 'due in ' + left + ' days'; }
  else { const s = [...after].reverse().find(d => d <= -left); if (s !== undefined) step = 'overdue ' + s; }
  if (!step) { skipped.push({ title: p.title, reason: left > 0 ? 'not due for a reminder yet' : 'overdue, between steps' }); continue; }
  const stepKey = step.startsWith('overdue') ? step : (left === 0 ? 'due 0' : 'due ' + before.find(d => d >= left));
  const key = p.id + '|' + p.due + '|' + stepKey;
  if (sent.has(key)) { skipped.push({ title: p.title, reason: 'step already sent' }); continue; }
  const writer = p.writers[0];
  reminders.push({ key, title: p.title, url: p.url, due: p.due, status: p.status, step, days_left: left,
    writer: writer?.name || '', slack_id: writer ? slackId(writer) : '', overdue: left < 0 });
}
return [{ json: { reminders, skipped } }];`),
    code('Write the Slack reminder', `
// Grouped by writer. In test mode mentions become plain names so nobody is pinged.
const cfg = $('config').first().json;
const { reminders } = $input.first().json;
const mention = (id, name) => id ? (cfg.mode === 'test' ? '@' + (name || id) : '<@' + id + '>') : (name || 'Unassigned');
const groups = {};
for (const r of reminders) (groups[r.writer + '|' + r.slack_id] ||= []).push(r);
const blocks = Object.entries(groups).map(([k, list]) => {
  const [name, id] = k.split('|');
  return mention(id, name) + (name && !id ? ' (no Slack id in WRITER_SLACK_IDS)' : '') + '\\n' +
    list.map(r => '   - <' + r.url + '|' + r.title + '>: ' + r.step + ' (' + r.due + ', ' + r.status + ')').join('\\n');
});
const needsEditor = reminders.some(r => r.overdue || !r.writer || !r.slack_id);
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*Content calendar reminders*', ...blocks,
  needsEditor && cfg.editor_slack_id ? 'cc ' + mention(cfg.editor_slack_id, 'editor') + ' for overdue or unassigned pieces' : ''].filter(Boolean).join('\\n\\n');
return [{ json: { text, count: reminders.length, keys: reminders.map(r => r.key) } }];`),
    ifWhen('Any reminders today?', [['$json.count', 'gt', 0]]),
    stop('STOP: nothing due'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post reminders to Slack', cfg('slack_channel_id'), '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - steps not recorded'),
    code('Record sent steps', `
// Live only. Keys hold the due date, so a moved deadline starts a fresh ladder.
const store = $getWorkflowStaticData('global');
const keys = $('Write the Slack reminder').first().json.keys;
store.sent = [...keys, ...(store.sent || [])].slice(0, 2000);
return [{ json: { recorded: keys.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 09:00', 'config'],
    ['config', 'Notion connected?'],
    ['Notion connected?', 0, 'Query the content calendar'], ['Notion connected?', 1, 'Load sample calendar'],
    ['Query the content calendar', 'Read calendar pages'],
    ['Read calendar pages', 'Combine calendar sources'], ['Load sample calendar', 0, 'Combine calendar sources', 1],
    ['Combine calendar sources', 'Pick reminders due today'],
    ['Pick reminders due today', 'Write the Slack reminder'],
    ['Write the Slack reminder', 'Any reminders today?'],
    ['Any reminders today?', 0, 'Posting switched on?'], ['Any reminders today?', 1, 'STOP: nothing due'],
    ['Posting switched on?', 0, 'Slack channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Slack channel set?', 0, 'Post reminders to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Post reminders to Slack', 'Live run?'],
    ['Live run?', 0, 'Record sent steps'], ['Live run?', 1, 'STOP: test post - steps not recorded'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 09:00 or by hand. Property names, the ladder and the writer to Slack mapping all live in `config`.', nodes: ['Run manually', 'Every weekday at 09:00', 'config'] },
    { title: 'Read the calendar', why: 'The Notion query is a POST that only reads, filtered server side to pieces due within the longest reminder window. `Load sample calendar` covers every ladder step and both kinds of missing writer.', nodes: ['Notion connected?', 'Query the content calendar', 'Read calendar pages', 'Load sample calendar', 'Combine calendar sources'] },
    { title: 'Work out the reminder step', why: 'Steps are chosen by range rather than exact day, so a weekend never swallows a reminder. The sent key includes the due date, which lets a rescheduled piece get its reminders again.', nodes: ['Pick reminders due today', 'Write the Slack reminder', 'Any reminders today?', 'STOP: nothing due'] },
    { title: 'Post and record', why: 'Preview posts nothing; a test post strips real mentions so writers are not pinged. Steps are recorded only after a live post, so testing never uses up a reminder.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Slack channel set?', 'STOP: no Slack channel', 'Post reminders to Slack', 'Live run?', 'STOP: test post - steps not recorded', 'Record sent steps'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample calendar', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick reminders due today'][0];
        const steps = Object.fromEntries(p.reminders.map((r: any) => [r.title, r.step]));
        const want: Record<string, string> = { 'Guide: onboarding emails that get read': 'due in 3 days', 'Case study: Harbour Dental': 'due tomorrow', 'Pricing page teardown': 'overdue 1', 'Interview with a support lead': 'due in 2 days', 'Agency pricing survey': 'due today' };
        for (const [t, s] of Object.entries(want)) if (steps[t] !== s) f.push(`${t}: expected "${s}", got "${steps[t]}"`);
        if (p.reminders.length !== 5) f.push(`expected 5 reminders, got ${p.reminders.length}`);
        if (!p.skipped.some((s: any) => s.reason === 'status Published')) f.push('published piece not skipped');
        const text = out['Write the Slack reminder'][0].text;
        if (!text.includes('<@U01MAYA00>') || !text.includes('Ana Silva (no Slack id') || !text.includes('Unassigned') || !text.includes('cc <@U01EDIT00>')) f.push(`message grouping wrong:\n${text}`);
        return f;
      },
    },
    {
      name: 'test post strips mentions', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0CONTENT' },
      mocks: { 'Post reminders to Slack': [{ ok: true }] },
      expect: { reached: ['Post reminders to Slack', 'STOP: test post - steps not recorded'], notReached: ['Record sent steps'], outward: 'some' },
      check: out => /<@U/.test(out['Write the Slack reminder'][0].text) ? ['test message still has real mentions'] : [],
    },
    {
      name: 'live with Notion', start: 'Every weekday at 09:00',
      overrides: { USE_NOTION: true, NOTION_DATABASE_ID: 'abc123def4567890abc123def4567890', TEST_RUN: false, SLACK_CHANNEL_ID: 'C0CONTENT' },
      mocks: {
        'Query the content calendar': [{ object: 'list', has_more: false, results: [{ id: 'n-1', url: 'https://www.notion.so/n1', properties: {
          Name: { type: 'title', title: [{ plain_text: 'Launch post' }] }, Status: { type: 'status', status: { name: 'Drafting' } },
          'Due date': { type: 'date', date: { start: new Date(Date.now() + 864e5).toISOString().slice(0, 10) } },
          Writer: { type: 'people', people: [{ name: 'Tom Reyes', person: { email: 'tom@yourcompany.example' } }] } } }] }],
        'Post reminders to Slack': [{ ok: true }],
      },
      expect: { reached: ['Query the content calendar', 'Post reminders to Slack', 'Record sent steps'], outward: 'some' },
      check: out => out['Pick reminders due today'][0].reminders[0]?.slack_id === 'U01TOMR00' ? [] : ['writer should map by name to U01TOMR00'],
    },
  ],
});
