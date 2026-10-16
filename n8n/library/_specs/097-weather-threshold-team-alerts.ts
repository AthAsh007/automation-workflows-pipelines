import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'weather-threshold-team-alerts',
  title: 'Warn field teams on Telegram when tomorrow\'s forecast crosses thresholds',
  summary: 'Every afternoon fetches tomorrow\'s forecast from the free Open-Meteo API for each work site, checks rain, rain chance, wind gusts, heat and frost against set limits and sends each field team one Telegram message covering only its own sites.',
  category: 'Productivity and operations',
  description: {
    who: 'Construction, landscaping, roofing and events crews that plan tomorrow\'s work across several sites and get caught out by wind or frost. Each team lead gets one message by 15:00 listing only their sites that need a plan B.',
    how: [
      'Every day at 15:00 it takes each site in `SITES` (name, latitude, longitude, team) and asks Open-Meteo for the daily forecast. No API key is needed. Until `USE_OPEN_METEO` is true, sample forecasts for 5 sites are used.',
      'Tomorrow\'s rain total, rain probability, maximum wind gust, high and low temperature are checked against `THRESHOLDS` (10 mm, 70%, 60 km/h, 32 C and 0 C by default).',
      'Every crossed limit becomes a short line with the value and the limit, such as "gusts 75 km/h (limit 60)".',
      'Sites are grouped by team. Each team with at least one warning gets one Telegram message in its own chat; teams with a clear forecast hear nothing.',
    ],
    setup: [
      'Run it once as imported. It checks sample forecasts and stops at `STOP: preview - nothing sent`.',
      'Fill in `SITES` with your locations and set `USE_OPEN_METEO = true`. No credential is needed.',
      'Add a Telegram bot to each team chat, connect it, and put each chat id in `TEAMS`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to your own chat. Set `TEST_RUN = false` to message the teams.',
    ],
    requirements: ['A Telegram bot added to each team chat', 'Latitude and longitude for each site'],
    customize: [
      '`THRESHOLDS` sets each limit; a site can override any of them with its own `limits`.',
      'Set `SEND_ALL_CLEAR = true` to message teams on clear days too.',
      '`TEAMS` maps team names to Telegram chat ids.',
    ],
  },
  config: {
    intro: ['USE_OPEN_METEO false -> SAMPLE forecasts so the run works offline. Open-Meteo needs no key.', 'Test mode (TEST_RUN true + TEST_EMAIL set) sends every team message to TEST_TELEGRAM_CHAT_ID.'],
    consts: [
      { name: 'USE_OPEN_METEO', value: false, note: 'set true to fetch real forecasts (free, no key)' },
      { name: 'SITES', value: [
        { name: 'Riverside depot', lat: 51.505, lon: -0.09, team: 'North crew' },
        { name: 'Hill farm extension', lat: 51.62, lon: -0.2, team: 'North crew' },
        { name: 'Quay works', lat: 50.72, lon: -1.88, team: 'South crew' },
        { name: 'Airport yard', lat: 50.95, lon: -1.36, team: 'South crew' },
        { name: 'Moor quarry', lat: 50.57, lon: -3.92, team: 'East crew', limits: { wind_gust_kmh: 80 } },
      ], note: 'one entry per site; limits overrides THRESHOLDS for that site' },
      { name: 'TEAMS', value: { 'North crew': '-1001000000001', 'South crew': '-1001000000002', 'East crew': '-1001000000003' }, note: 'team name -> Telegram chat id' },
      { name: 'THRESHOLDS', value: { rain_mm: 10, rain_probability: 70, wind_gust_kmh: 60, heat_c: 32, frost_c: 0 }, note: 'a warning is raised at or beyond each limit' },
      { name: 'SEND_ALL_CLEAR', value: false, note: 'true also messages teams whose sites are all clear' },
      { name: 'TEST_TELEGRAM_CHAT_ID', value: '', note: 'test mode sends every team message here' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 15:00', '0 15 * * *'),
    code('List the sites', `
// One item per site, so each forecast request carries its own coordinates.
return $('config').first().json.sites.map((s, i) => ({ json: { index: i, ...s } }));`),
    ifTrue('Open-Meteo enabled?', cfg('use_open_meteo')),
    http('Fetch the forecast from Open-Meteo', {
      url: 'https://api.open-meteo.com/v1/forecast', auth: 'none',
      query: { latitude: '={{ $json.lat }}', longitude: '={{ $json.lon }}', daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max',
        timezone: 'auto', forecast_days: '2', wind_speed_unit: 'kmh' },
    }),
    code('Load sample forecasts', `
// Used until USE_OPEN_METEO is true. Same daily shape as Open-Meteo; index 1 is tomorrow.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const f = (max, min, rain, prob, gust) => ({ daily_units: { temperature_2m_max: '°C', precipitation_sum: 'mm', wind_gusts_10m_max: 'km/h' },
  daily: { time: [day(0), day(1)], temperature_2m_max: [14, max], temperature_2m_min: [6, min], precipitation_sum: [0, rain], precipitation_probability_max: [10, prob], wind_gusts_10m_max: [20, gust] } });
const byName = {
  'Riverside depot': f(16, 8, 18.4, 90, 35),
  'Hill farm extension': f(9, -2.1, 1.2, 40, 75),
  'Quay works': f(34.2, 19, 0, 5, 22),
  'Airport yard': f(21, 11, 2, 30, 41),
  'Moor quarry': f(12, 4, 6, 60, 72),
};
return $input.all().map(i => ({ json: { site_index: i.json.index, ...(byName[i.json.name] || f(15, 8, 0, 0, 10)) } }));`),
    merge('Combine forecast sources'),
    code('Check tomorrow against thresholds', `
// Tomorrow = index 1 of each daily array. Responses line up with the site list by
// position (one request per site); the sample carries site_index explicitly.
const cfg = $('config').first().json;
const sites = $('List the sites').all().map(i => i.json);
const checks = $input.all().map((item, i) => {
  const site = sites[item.json.site_index ?? i];
  const d = item.json.daily || {};
  const at = k => (d[k] || [])[1];
  const lim = { ...cfg.thresholds, ...(site.limits || {}) };
  const t = { date: (d.time || [])[1], max: at('temperature_2m_max'), min: at('temperature_2m_min'), rain: at('precipitation_sum'), prob: at('precipitation_probability_max'), gust: at('wind_gusts_10m_max') };
  const w = [];
  if (t.rain >= lim.rain_mm) w.push('rain ' + t.rain + ' mm (limit ' + lim.rain_mm + ')');
  else if (t.prob >= lim.rain_probability) w.push('rain chance ' + t.prob + '% (limit ' + lim.rain_probability + '%)');
  if (t.gust >= lim.wind_gust_kmh) w.push('gusts ' + Math.round(t.gust) + ' km/h (limit ' + lim.wind_gust_kmh + ')');
  if (t.max >= lim.heat_c) w.push('heat ' + t.max + ' C (limit ' + lim.heat_c + ')');
  if (t.min <= lim.frost_c) w.push('frost ' + t.min + ' C (limit ' + lim.frost_c + ')');
  const missing = t.date === undefined;
  return { site: site.name, team: site.team, ...t, warnings: missing ? ['no forecast returned'] : w,
    summary: missing ? '' : t.min + ' to ' + t.max + ' C, ' + (t.rain ?? 0) + ' mm, gusts ' + Math.round(t.gust ?? 0) + ' km/h' };
});
return [{ json: { checks } }];`),
    code('Write one message per team', `
// Only a team's own sites, warnings first. Teams with nothing to report are skipped
// unless SEND_ALL_CLEAR is true; a team with no chat id is held back.
const cfg = $('config').first().json;
const { checks } = $input.first().json;
const teams = {};
for (const c of checks) (teams[c.team] ||= []).push(c);
const messages = [], held = [];
for (const [team, list] of Object.entries(teams)) {
  const bad = list.filter(c => c.warnings.length);
  if (!bad.length && !cfg.send_all_clear) continue;
  const chat = cfg.teams[team];
  if (!chat) { held.push({ team, reason: 'no chat id in TEAMS' }); continue; }
  const date = list[0].date ? new Date(list[0].date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'tomorrow';
  const text = [
    team + ': weather for ' + date,
    ...(bad.length ? bad.map(c => 'WARNING ' + c.site + ': ' + c.warnings.join(', ')) : ['All sites clear.']),
    ...list.filter(c => !c.warnings.length).map(c => 'OK ' + c.site + ': ' + c.summary),
  ].join('\\n');
  messages.push({ team, warnings: bad.reduce((n, c) => n + c.warnings.length, 0), text, chat, send_to: cfg.mode === 'test' ? cfg.test_telegram_chat_id : chat });
}
return [{ json: { messages: messages.filter(m => m.send_to), held: [...held, ...messages.filter(m => !m.send_to).map(m => ({ team: m.team, reason: 'test mode needs TEST_TELEGRAM_CHAT_ID' }))] } }];`),
    ifTrue('Anything to warn about?', '$json.messages.length > 0'),
    stop('STOP: all clear'),
    code('Split into team messages', `
// One Telegram message per team.
return $input.first().json.messages.map(json => ({ json }));`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    telegram.send('Send the team warning on Telegram', '$json.send_to', "($('config').first().json.mode === 'test' ? '[TEST for ' + $json.team + '] ' : '') + $json.text"),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 15:00', 'config'],
    ['config', 'List the sites'],
    ['List the sites', 'Open-Meteo enabled?'],
    ['Open-Meteo enabled?', 0, 'Fetch the forecast from Open-Meteo'], ['Open-Meteo enabled?', 1, 'Load sample forecasts'],
    ['Fetch the forecast from Open-Meteo', 'Combine forecast sources'], ['Load sample forecasts', 0, 'Combine forecast sources', 1],
    ['Combine forecast sources', 'Check tomorrow against thresholds'],
    ['Check tomorrow against thresholds', 'Write one message per team'],
    ['Write one message per team', 'Anything to warn about?'],
    ['Anything to warn about?', 0, 'Split into team messages'], ['Anything to warn about?', 1, 'STOP: all clear'],
    ['Split into team messages', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send the team warning on Telegram'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every day at 15:00, late enough for a stable next-day forecast and early enough to move a crew. Sites, teams and limits all live in `config`.', nodes: ['Run manually', 'Every day at 15:00', 'config'] },
    { title: 'Fetch forecasts per site', why: 'One Open-Meteo request per site keeps each response tied to its coordinates. It is free and needs no key, but `Load sample forecasts` still stands in until `USE_OPEN_METEO` is true, so the run works offline.', nodes: ['List the sites', 'Open-Meteo enabled?', 'Fetch the forecast from Open-Meteo', 'Load sample forecasts', 'Combine forecast sources'] },
    { title: 'Check limits per team', why: 'A site can carry its own `limits`, so an exposed quarry tolerates more wind than a scaffold. Each warning line shows the value and the limit, which lets a lead judge it without opening a weather app.', nodes: ['Check tomorrow against thresholds', 'Write one message per team', 'Anything to warn about?', 'STOP: all clear'] },
    { title: 'Send to each team', why: 'Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. Test mode sends every team message to `TEST_TELEGRAM_CHAT_ID`, so the crews never see a trial run.', nodes: ['Split into team messages', 'Sending switched on?', 'STOP: preview - nothing sent', 'Send the team warning on Telegram'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample forecasts', 'STOP: preview - nothing sent'], notReached: ['STOP: all clear'], outward: 'none' },
      check: out => {
        const checks = out['Check tomorrow against thresholds'][0].checks;
        const w = (s: string) => checks.find((c: any) => c.site === s)?.warnings.join(' | ');
        const f: string[] = [];
        if (w('Riverside depot') !== 'rain 18.4 mm (limit 10)') f.push(`Riverside: ${w('Riverside depot')}`);
        if (w('Hill farm extension') !== 'gusts 75 km/h (limit 60) | frost -2.1 C (limit 0)') f.push(`Hill farm: ${w('Hill farm extension')}`);
        if (w('Quay works') !== 'heat 34.2 C (limit 32)') f.push(`Quay: ${w('Quay works')}`);
        if (w('Moor quarry') !== '') f.push('Moor quarry overrides the gust limit to 80, 72 is fine');
        const msgs = out['Split into team messages'];
        if (msgs.map((m: any) => m.team).join(',') !== 'North crew,South crew') f.push('North and South get one message each, East none');
        if (msgs.find((m: any) => m.team === 'South crew')?.text.includes('Riverside')) f.push('South must only see its own sites');
        return f;
      },
    },
    {
      name: 'live forecast and Telegram', start: 'Every day at 15:00',
      overrides: { USE_OPEN_METEO: true, TEST_RUN: false, SITES: [{ name: 'Dock 4', lat: 53.4, lon: -2.99, team: 'North crew' }, { name: 'Mill site', lat: 53.5, lon: -2.2, team: 'West crew' }] },
      mocks: {
        'Fetch the forecast from Open-Meteo': [
          { latitude: 53.4, longitude: -2.99, daily: { time: ['2026-10-16', '2026-10-17'], temperature_2m_max: [12, 11], temperature_2m_min: [5, 4], precipitation_sum: [0, 3], precipitation_probability_max: [20, 75], wind_gusts_10m_max: [30, 52] } },
          { latitude: 53.5, longitude: -2.2, daily: { time: ['2026-10-16', '2026-10-17'], temperature_2m_max: [12, 11], temperature_2m_min: [5, -1], precipitation_sum: [0, 0], precipitation_probability_max: [0, 0], wind_gusts_10m_max: [10, 10] } },
        ],
        'Send the team warning on Telegram': [{ ok: true, result: { message_id: 7 } }],
      },
      expect: { reached: ['Fetch the forecast from Open-Meteo', 'Send the team warning on Telegram'], notReached: ['Load sample forecasts'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Write one message per team'][0];
        if (w.messages.length !== 1 || !w.messages[0].text.includes('rain chance 75%')) f.push('North crew should get the rain-chance warning');
        if (!w.held.some((h: any) => h.team === 'West crew')) f.push('West crew has no chat id and should be held');
        return f;
      },
    },
  ],
});
