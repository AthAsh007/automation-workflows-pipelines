import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'weather-threshold-team-alerts',
  title: 'Warn field teams on Telegram when tomorrow\'s forecast crosses thresholds',
  summary: 'Every afternoon reads tomorrow\'s daily and hourly forecast from the free Open-Meteo API for each work site, warns only about rain and wind that fall inside working hours, marks severe crossings, suggests the best dry and calm work window, reports sites whose forecast could not be read, and sends each field team one Telegram message.',
  category: 'Productivity and operations',
  description: {
    who: 'Construction, landscaping, roofing and events crews that plan tomorrow\'s work across several sites and get caught out by wind or frost. Each team lead gets one message by 15:00 listing only their sites that need a plan B, and when in the day the weather allows work.',
    how: [
      'Every day at 15:00 it asks Open-Meteo for each site in `SITES` (daily and hourly values, no API key). Until `USE_OPEN_METEO` is true, sample forecasts for 6 sites are used. A site whose request fails is reported as unreadable, not skipped.',
      'Tomorrow\'s rain, rain chance, wind gusts, heat and frost are checked against `THRESHOLDS`, with per-site overrides. Rain and gusts count only if they hit inside `WORK_HOURS`, so a gale at 03:00 becomes a note, not a warning.',
      'A value past its limit by the margin in `SEVERE_MARGINS` is severe and puts SEVERE at the top of the message. For rain and wind sites, the longest run of dry, calm work hours is given as the best window.',
      'Sites are grouped by team. Each team with at least one warning or unreadable site gets one Telegram message in its own chat; teams with a clear forecast hear nothing.',
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
      '`WORK_HOURS` sets the shift, and `HOURLY_RAIN_MM` how much rain in one hour stops work.',
      '`SEVERE_MARGINS` decides how far past a limit counts as severe. Set `SEND_ALL_CLEAR = true` to message teams on clear days too.',
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
        { name: 'Coast road', lat: 50.6, lon: -3.4, team: 'East crew' },
      ], note: 'one entry per site; limits overrides THRESHOLDS for that site' },
      { name: 'TEAMS', value: { 'North crew': '-1001000000001', 'South crew': '-1001000000002', 'East crew': '-1001000000003' }, note: 'team name -> Telegram chat id' },
      { name: 'THRESHOLDS', value: { rain_mm: 10, rain_probability: 70, wind_gust_kmh: 60, heat_c: 32, frost_c: 0 }, note: 'a warning is raised at or beyond each limit' },
      { name: 'SEVERE_MARGINS', value: { rain_mm: 10, wind_gust_kmh: 20, heat_c: 4, frost_c: 4 }, note: 'this far past the limit counts as SEVERE (e.g. gusts 80+ against a 60 limit)' },
      { name: 'WORK_HOURS', value: { start: 7, end: 17 }, note: 'local working hours; rain and gusts outside them are notes, not warnings' },
      { name: 'HOURLY_RAIN_MM', value: 2, note: 'rain in one hour at or above this makes that hour unworkable' },
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
      url: 'https://api.open-meteo.com/v1/forecast', auth: 'none', continueOnError: true,
      query: { latitude: '={{ $json.lat }}', longitude: '={{ $json.lon }}', daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max',
        hourly: 'precipitation,wind_gusts_10m', timezone: 'auto', forecast_days: '2', wind_speed_unit: 'kmh' },
    }),
    code('Load sample forecasts', `
// Used until USE_OPEN_METEO is true. Same daily + hourly shape as Open-Meteo (index 1 /
// hours 24-47 are tomorrow, local time). Coast road has a gale at night only; Airport
// yard stands in for a request that failed.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const pad = h => String(h).padStart(2, '0');
const f = (max, min, prob, gustAt, rainAt) => {
  const time = [], gusts = [], rain = [];
  for (let h = 0; h < 48; h++) { time.push((h < 24 ? day(0) : day(1)) + 'T' + pad(h % 24) + ':00'); gusts.push(h < 24 ? 20 : gustAt(h - 24)); rain.push(h < 24 ? 0 : rainAt(h - 24)); }
  const tomorrow = a => a.slice(24);
  return { daily: { time: [day(0), day(1)], temperature_2m_max: [14, max], temperature_2m_min: [6, min],
      precipitation_sum: [0, Math.round(tomorrow(rain).reduce((a, b) => a + b, 0) * 10) / 10], precipitation_probability_max: [10, prob],
      wind_gusts_10m_max: [20, Math.max(...tomorrow(gusts))] },
    hourly: { time, precipitation: rain, wind_gusts_10m: gusts } };
};
const byName = {
  'Riverside depot': f(16, 8, 95, () => 30, h => (h >= 10 && h < 15 ? 4.8 : 0)),
  'Hill farm extension': f(9, -2.1, 40, h => (h >= 12 && h < 16 ? 75 : 35), () => 0.1),
  'Quay works': f(34.2, 19, 5, () => 22, () => 0),
  'Moor quarry': f(12, 4, 60, () => 72, h => (h === 9 ? 1 : 0)),
  'Coast road': f(13, 7, 30, h => (h >= 1 && h < 5 ? 95 : 30), h => (h >= 1 && h < 5 ? 3.5 : 0)),
};
return $input.all().map(i => ({ json: { site_index: i.json.index,
  ...(byName[i.json.name] || { error: { message: 'The connection timed out (sample failure)' } }) } }));`),
    merge('Combine forecast sources'),
    code('Check tomorrow against thresholds', `
// Tomorrow = daily index 1 and the hourly slots on that date. Rain and gusts only
// warn when they land inside WORK_HOURS; severity = past the limit by SEVERE_MARGINS.
// A failed request (continueOnError) arrives as { error } and becomes its own warning.
const cfg = $('config').first().json;
const sites = $('List the sites').all().map(i => i.json);
const W = cfg.work_hours, M = cfg.severe_margins;
const pad = h => String(h).padStart(2, '0');
const checks = $input.all().map((item, i) => {
  const site = sites[item.json.site_index ?? i];
  const d = item.json.daily || {};
  if (item.json.error || !d.time) {
    const why = item.json.error?.message || 'no forecast returned';
    return { site: site.name, team: site.team, unreadable: true, warnings: [{ text: 'forecast could not be read (' + why + '), check it by hand', severe: false }], notes: [], summary: '' };
  }
  const at = k => (d[k] || [])[1];
  const lim = { ...cfg.thresholds, ...(site.limits || {}) };
  const t = { date: d.time[1], max: at('temperature_2m_max'), min: at('temperature_2m_min'), rain: at('precipitation_sum'), prob: at('precipitation_probability_max'), gust: at('wind_gusts_10m_max') };
  const h = item.json.hourly || {};
  const hours = (h.time || []).map((ts, k) => ({ date: ts.slice(0, 10), hour: Number(ts.slice(11, 13)), rain: (h.precipitation || [])[k] ?? 0, gust: (h.wind_gusts_10m || [])[k] ?? 0 }))
    .filter(x => x.date === t.date && x.hour >= W.start && x.hour < W.end);
  const haveHours = hours.length > 0;
  const span = list => list.length ? pad(list[0].hour) + ':00-' + pad(list[list.length - 1].hour + 1) + ':00' : '';
  const warnings = [], notes = [];
  const warn = (text, over, margin) => warnings.push({ text, severe: over >= margin });
  // rain: total for the day, but only if some work hours are wet
  const wet = hours.filter(x => x.rain >= cfg.hourly_rain_mm);
  if (t.rain >= lim.rain_mm) {
    if (!haveHours || wet.length) warn('rain ' + t.rain + ' mm (limit ' + lim.rain_mm + ')' + (wet.length ? ', wettest ' + span(wet) : ''), t.rain - lim.rain_mm, M.rain_mm);
    else notes.push('rain ' + t.rain + ' mm falls outside working hours');
  } else if (t.prob >= lim.rain_probability && (!haveHours || wet.length || t.rain > 0)) {
    warnings.push({ text: 'rain chance ' + t.prob + '% (limit ' + lim.rain_probability + '%)', severe: false });
  }
  // gusts: the work-hour maximum decides, the daily maximum is the fallback
  const windy = hours.filter(x => x.gust >= lim.wind_gust_kmh);
  const workGust = haveHours ? Math.max(...hours.map(x => x.gust)) : t.gust;
  if (workGust >= lim.wind_gust_kmh) warn('gusts ' + Math.round(workGust) + ' km/h (limit ' + lim.wind_gust_kmh + ')' + (windy.length ? ' ' + span(windy) : ''), workGust - lim.wind_gust_kmh, M.wind_gust_kmh);
  else if (t.gust >= lim.wind_gust_kmh) notes.push('gusts ' + Math.round(t.gust) + ' km/h outside working hours, ' + Math.round(workGust) + ' km/h at most on shift');
  if (t.max >= lim.heat_c) warn('heat ' + t.max + ' C (limit ' + lim.heat_c + ')', t.max - lim.heat_c, M.heat_c);
  if (t.min <= lim.frost_c) warn('frost ' + t.min + ' C (limit ' + lim.frost_c + ')', lim.frost_c - t.min, M.frost_c);
  // best window: longest run of work hours that are dry and under the gust limit
  let best = [], run = [];
  for (const x of hours) { if (x.rain < cfg.hourly_rain_mm && x.gust < lim.wind_gust_kmh) { run.push(x); if (run.length > best.length) best = [...run]; } else run = []; }
  const weatherStops = wet.length || windy.length;
  if (haveHours && weatherStops) notes.push(best.length ? 'best window ' + span(best) + ' (' + best.length + ' h)' : 'no dry, calm hour on shift');
  return { site: site.name, team: site.team, ...t, work_gust: workGust, best_window: span(best), warnings, notes,
    summary: t.min + ' to ' + t.max + ' C, ' + (t.rain ?? 0) + ' mm, gusts ' + Math.round(t.gust ?? 0) + ' km/h' };
});
return [{ json: { checks, unreadable: checks.filter(c => c.unreadable).map(c => c.site) } }];`),
    code('Write one message per team', `
// Only a team's own sites: severe first, then warnings, then clear sites. Teams with
// nothing to report are skipped unless SEND_ALL_CLEAR is true; no chat id = held.
const cfg = $('config').first().json;
const { checks } = $input.first().json;
const teams = {};
for (const c of checks) (teams[c.team] ||= []).push(c);
const messages = [], held = [];
for (const [team, list] of Object.entries(teams)) {
  const bad = list.filter(c => c.warnings.length).sort((a, b) => b.warnings.filter(w => w.severe).length - a.warnings.filter(w => w.severe).length);
  if (!bad.length && !cfg.send_all_clear) continue;
  const chat = cfg.teams[team];
  if (!chat) { held.push({ team, reason: 'no chat id in TEAMS' }); continue; }
  const severe = bad.some(c => c.warnings.some(w => w.severe));
  const dated = list.find(c => c.date)?.date;
  const date = dated ? new Date(dated + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'tomorrow';
  const text = [
    (severe ? 'SEVERE WEATHER - ' : '') + team + ': weather for ' + date,
    ...(bad.length ? bad.map(c => (c.warnings.some(w => w.severe) ? 'SEVERE ' : 'WARNING ') + c.site + ': ' + c.warnings.map(w => w.text).join(', ') + (c.notes.length ? '. ' + c.notes.join(', ') : '')) : ['All sites clear.']),
    ...list.filter(c => !c.warnings.length).map(c => 'OK ' + c.site + ': ' + c.summary + (c.notes.length ? ' (' + c.notes.join(', ') + ')' : '')),
  ].join('\\n');
  messages.push({ team, severe, warnings: bad.reduce((n, c) => n + c.warnings.length, 0), text, chat, send_to: cfg.mode === 'test' ? cfg.test_telegram_chat_id : chat });
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
    { title: 'Start and settings', why: 'Runs every day at 15:00, late enough for a stable next-day forecast and early enough to move a crew. Sites, teams, limits, severity margins and working hours all live in `config`.', nodes: ['Run manually', 'Every day at 15:00', 'config'] },
    { title: 'Fetch forecasts per site', why: 'One Open-Meteo request per site keeps each response tied to its coordinates. The request continues on error, so a timeout for one site becomes a warning line instead of stopping every team\'s message. `Load sample forecasts` includes such a failure.', nodes: ['List the sites', 'Open-Meteo enabled?', 'Fetch the forecast from Open-Meteo', 'Load sample forecasts', 'Combine forecast sources'] },
    { title: 'Check limits per team', why: 'Hourly values decide whether rain or gusts hit the shift, so a night gale is only a note. A site can carry its own `limits`. Severe crossings lead the message, and the best dry, calm window tells a lead when work can still go ahead.', nodes: ['Check tomorrow against thresholds', 'Write one message per team', 'Anything to warn about?', 'STOP: all clear'] },
    { title: 'Send to each team', why: 'Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. Test mode sends every team message to `TEST_TELEGRAM_CHAT_ID`, so the crews never see a trial run.', nodes: ['Split into team messages', 'Sending switched on?', 'STOP: preview - nothing sent', 'Send the team warning on Telegram'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample forecasts', 'STOP: preview - nothing sent'], notReached: ['STOP: all clear'], outward: 'none' },
      check: out => {
        const r = out['Check tomorrow against thresholds'][0];
        const c = (s: string) => r.checks.find((x: any) => x.site === s);
        const w = (s: string) => c(s)?.warnings.map((x: any) => x.text + (x.severe ? '!' : '')).join(' | ');
        const f: string[] = [];
        if (w('Riverside depot') !== 'rain 24 mm (limit 10), wettest 10:00-15:00!') f.push(`Riverside: ${w('Riverside depot')}`);
        if (!c('Riverside depot')?.notes.includes('best window 07:00-10:00 (3 h)')) f.push(`Riverside best window: ${c('Riverside depot')?.notes}`);
        if (w('Hill farm extension') !== 'gusts 75 km/h (limit 60) 12:00-16:00 | frost -2.1 C (limit 0)') f.push(`Hill farm: ${w('Hill farm extension')}`);
        if (w('Quay works') !== 'heat 34.2 C (limit 32)') f.push(`Quay: ${w('Quay works')}`);
        if (w('Moor quarry') !== '') f.push('Moor quarry overrides the gust limit to 80, 72 is fine');
        if (w('Coast road') !== '' || !c('Coast road')?.notes.some((n: string) => n.includes('outside working hours'))) f.push(`Coast road night gale should be a note only: ${w('Coast road')} / ${c('Coast road')?.notes}`);
        if (!w('Airport yard')?.startsWith('forecast could not be read') || r.unreadable.join() !== 'Airport yard') f.push('Airport yard failed read must be reported');
        const msgs = out['Split into team messages'];
        if (msgs.map((m: any) => m.team).join(',') !== 'North crew,South crew') f.push(`North and South get one message each, East none: ${msgs.map((m: any) => m.team)}`);
        const north = msgs.find((m: any) => m.team === 'North crew');
        if (!north?.severe || !north.text.startsWith('SEVERE WEATHER - North crew') || !north.text.split('\n')[1].startsWith('SEVERE Riverside')) f.push('North should lead with the severe Riverside rain');
        if (msgs.find((m: any) => m.team === 'South crew')?.text.includes('Riverside')) f.push('South must only see its own sites');
        return f;
      },
    },
    {
      name: 'live forecast and Telegram', start: 'Every day at 15:00',
      overrides: { USE_OPEN_METEO: true, TEST_RUN: false, SITES: [{ name: 'Dock 4', lat: 53.4, lon: -2.99, team: 'North crew' }, { name: 'Mill site', lat: 53.5, lon: -2.2, team: 'West crew' }, { name: 'Canal bridge', lat: 53.45, lon: -2.5, team: 'North crew' }] },
      mocks: {
        'Fetch the forecast from Open-Meteo': [
          { latitude: 53.4, longitude: -2.99, daily: { time: ['2026-10-16', '2026-10-17'], temperature_2m_max: [12, 11], temperature_2m_min: [5, 4], precipitation_sum: [0, 3], precipitation_probability_max: [20, 75], wind_gusts_10m_max: [30, 52] },
            hourly: { time: ['2026-10-17T08:00', '2026-10-17T09:00', '2026-10-17T10:00'], precipitation: [0, 2.5, 0.5], wind_gusts_10m: [30, 52, 40] } },
          { latitude: 53.5, longitude: -2.2, daily: { time: ['2026-10-16', '2026-10-17'], temperature_2m_max: [12, 11], temperature_2m_min: [5, -1], precipitation_sum: [0, 0], precipitation_probability_max: [0, 0], wind_gusts_10m_max: [10, 10] } },
          { error: { message: 'getaddrinfo ENOTFOUND api.open-meteo.com' } },
        ],
        'Send the team warning on Telegram': [{ ok: true, result: { message_id: 7 } }],
      },
      expect: { reached: ['Fetch the forecast from Open-Meteo', 'Send the team warning on Telegram'], notReached: ['Load sample forecasts'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Write one message per team'][0];
        const m = w.messages[0];
        if (w.messages.length !== 1 || !m.text.includes('rain chance 75%') || !m.text.includes('best window 08:00-09:00')) f.push(`North crew should get the rain-chance warning with a window: ${m?.text}`);
        if (!m?.text.includes('WARNING Canal bridge: forecast could not be read (getaddrinfo')) f.push('the failed site must be reported to its team');
        if (!w.held.some((h: any) => h.team === 'West crew')) f.push('West crew has no chat id and should be held');
        return f;
      },
    },
  ],
});
