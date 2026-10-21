// LinkedIn said no before anything was published. Tell the people who approved it — once.
//
// The alert goes to the approval channel because that is where the approver is waiting to see
// the post go out. It repeats only after ALERT_REPEAT_HOURS: the poll runs every five minutes,
// and an alert every five minutes is an alert people mute. When the last one went out is read
// from the log (`alert` rows for this draft's message id), so the dedupe survives restarts.
//
// The bot's own alert message can never approve anything — the gate ignores the bot's messages.

const cfg = $('config').first().json;
const draft = $('the approved draft').first().json;
const reg = $json;

const last = Date.parse(draft._last_alert_at || '');
const hoursSince = isNaN(last) ? Infinity : (Date.now() - last) / 3600000;
const due = hoursSince >= cfg.alert_repeat_hours;

const text = [
  ':rotating_light: **Approved, but not published.**',
  'The draft above was approved by ' + (draft._approver || 'a reviewer') + ', but LinkedIn '
    + 'refused the request: ' + reg._reason,
  '',
  'Nothing was posted. No need to approve again — once this is fixed, it publishes on the next '
    + 'check. It still expires ' + cfg.approval_expires_hours + 'h after it was delivered.'
].join('\n').slice(0, cfg.discord_message_limit);

return [{
  json: Object.assign({}, draft, {
    _kind: reg._kind,
    _token_problem: true,
    _alert_text: text,
    _alert_due: due,
    _hours_since_alert: isFinite(hoursSince) ? Math.round(hoursSince * 10) / 10 : null,
    _reason: reg._reason
  })
}];
