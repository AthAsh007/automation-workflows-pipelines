// One due lead at a time: can it be reached, by what, and is it a sensible hour where it lives?
//
// Channel: the ladder's channel first. An email touch with no email address goes by SMS, an SMS
// touch with no phone number goes by email, and a lead with neither is stopped as unreachable.
// Window: the lead's local time from the contact's timezone (DEFAULT_TIMEZONE when blank or
// unknown). Outside SEND_WINDOW_START_HOUR..SEND_WINDOW_END_HOUR, or on a weekend when
// SEND_ON_WEEKENDS is false, the lead is "waiting: quiet hours" and a later run picks it up.
// Demo leads carry a simulated local time so the demo shows the same decisions whenever it runs.
const cfg = $('config').first().json;
const lead = $input.first().json || {};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localParts(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (t) => (parts.filter((p) => p.type === t)[0] || {}).value;
  return { weekday: DAYS.indexOf(get('weekday')), hour: Number(get('hour')) };
}

// ---- where and when
const wanted = String(lead.timezone || '').trim();
let tz = wanted || cfg.default_timezone;
let tzNote = wanted ? 'contact timezone' : 'default timezone';
let local;
if (lead._demo && lead.demo_local) {
  local = { weekday: Number(lead.demo_local.weekday), hour: Number(lead.demo_local.hour) };
  tzNote += ', simulated local time (demo)';
} else {
  try { local = localParts(tz); }
  catch (e) {
    tzNote = 'unknown timezone "' + wanted + '", used the default';
    tz = cfg.default_timezone;
    try { local = localParts(tz); } catch (e2) { tz = 'UTC'; local = localParts('UTC'); }
  }
}

// ---- how
const hasEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(lead.email || '').trim());
const hasPhone = String(lead.phone || '').replace(/\D/g, '').length >= 7;
const ladder = String(lead.channel || 'email').toLowerCase();
let channel = ladder;
let channelNote = 'the ladder channel';
if (ladder === 'email' && !hasEmail) {
  channel = hasPhone ? 'sms' : '';
  channelNote = hasPhone ? 'no email address, so SMS instead' : '';
} else if (ladder === 'sms' && !hasPhone) {
  channel = hasEmail ? 'email' : '';
  channelNote = hasEmail ? 'no phone number, so email instead' : '';
}

const out = Object.assign({}, lead, {
  ladder_channel: ladder, channel: channel, channel_note: channelNote,
  timezone_used: tz, timezone_note: tzNote,
  local_time: (DAYS[local.weekday] || '?') + ' ' + String(local.hour).padStart(2, '0') + ':00'
});

const start = Number(cfg.send_window_start_hour), end = Number(cfg.send_window_end_hour);
const weekend = local.weekday === 0 || local.weekday === 6;

if (!channel) {
  Object.assign(out, { _gate: 'stopped', _outcome: 'stopped', reason_key: 'unreachable',
    _reason: 'unreachable — no email address and no phone number' });
} else if (weekend && !cfg.send_on_weekends) {
  Object.assign(out, { _gate: 'waiting', _outcome: 'waiting', reason_key: 'quiet hours',
    _reason: 'quiet hours — it is the weekend where the lead is (' + out.local_time + ', ' + tz + ')' });
} else if (local.hour < start || local.hour >= end) {
  Object.assign(out, { _gate: 'waiting', _outcome: 'waiting', reason_key: 'quiet hours',
    _reason: 'quiet hours — ' + out.local_time + ' where the lead is (' + tz + '), window ' +
      start + ':00-' + end + ':00' });
} else {
  out._gate = 'go';
}

return [{ json: out }];
