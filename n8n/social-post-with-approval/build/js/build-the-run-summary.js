// One message per run that is worth a message, for the optional Slack webhook.
//
// Every path through both workflows arrives here, including the ones that did nothing, so a
// job that silently stopped drafting three weeks ago is noticed. But workflow 02 polls every
// five minutes, and almost every poll ends "nothing awaiting" or "still awaiting approval" —
// posting those would bury the one message that matters under 280 that do not. Those are
// QUIET: visible in the execution list, not sent.
//
// The caption is NOT included. It goes to the approval channel and nowhere else — a draft
// that reaches a second audience before it is approved has left the approval gate behind.

const cfg = $('config').first().json;
const s = $json;

const stopped = s._stopped || '';
const outcome = s._outcome || '';
const status = s._status || '';

const QUIET = ['nothing awaiting', 'still awaiting approval', 'LinkedIn alert already sent'];

const icon = outcome === 'POSTED' ? ':white_check_mark:'
  : s._token_problem ? ':rotating_light:'
  : outcome === 'FAILED' || outcome === 'UNKNOWN' || stopped === 'no image' ? ':x:'
  : stopped === 'caption held' || stopped === 'log conflict' ? ':warning:'
  : ':information_source:';

const headline = outcome === 'POSTED'
  ? 'Published: ' + (s._slug || 'unknown')
  : s._token_problem
    ? 'LinkedIn rejected the token — approved draft waiting: ' + (s._slug || 'unknown')
    : stopped
      ? 'No post: ' + stopped
      : status
        ? 'Draft ' + (s._slug || s.Slug || '') + ' ' + status
        : 'Draft delivered for approval: ' + (s.slug || s._slug || 'unknown');

// The early warning for the failure that has actually happened: a 60-day token lapsing on a
// weekend with nothing to say so.
const warnings = (s._warnings || []).slice();
const left = cfg.linkedin_token_days_left;
if (left !== null && left !== undefined && left <= cfg.token_warn_days) {
  warnings.push(left < 0
    ? 'the LinkedIn token expired ' + (-left) + ' day(s) ago (LINKEDIN_TOKEN_EXPIRES_ON). '
      + 'Approved drafts will not publish until it is refreshed.'
    : 'the LinkedIn token expires in ' + left + ' day(s). Refresh it and update '
      + 'LINKEDIN_TOKEN_EXPIRES_ON.');
}

const lines = [
  icon + ' *LinkedIn daily* — ' + headline,
  '*Mode:* ' + cfg.mode + (cfg.forced_preview ? ' (forced — demo bank in use)' : ''),
  s._reason ? '*Why:* ' + s._reason : '',
  s._post_url ? '*Post:* ' + s._post_url : '',
  s._approver ? '*By:* ' + s._approver : '',
  warnings.length ? '*Warnings:* ' + warnings.join('; ') : ''
].filter(Boolean);

const text = lines.join('\n');
// The token warning rides on workflow 01's once-a-day summary; it does not un-quiet a poll.
const quiet = QUIET.includes(stopped);

return [{
  json: {
    _summary: text,
    _slack_body: { text: text },
    _notify: cfg.report_enabled && !quiet,
    _quiet: quiet,
    _outcome: outcome || stopped || status || 'delivered',
    _reason: s._reason || ''
  }
}];
