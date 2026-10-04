// One line per run, for the optional Slack webhook.
//
// Every path through both workflows arrives here, including the ones that did nothing. A
// summary that only fires on success is a summary that goes quiet exactly when something is
// wrong, which is the failure mode this exists to catch: the job silently stopped drafting
// three weeks ago and nobody noticed because nothing was ever broken enough to alert.
//
// The caption is NOT included. It goes to the approval channel and nowhere else — a draft
// that reaches a second audience before it is approved has left the approval gate behind.

const cfg = $('config').first().json;
const s = $json;

const stopped = s._stopped || '';
const outcome = s._outcome || '';

const icon = outcome === 'POSTED' ? ':white_check_mark:'
  : outcome === 'FAILED' || outcome === 'UNKNOWN' || stopped === 'no image' ? ':x:'
  : stopped === 'still awaiting approval' || stopped === 'nothing awaiting' ? ':hourglass:'
  : ':information_source:';

const headline = outcome === 'POSTED'
  ? 'Published: ' + (s._slug || 'unknown')
  : stopped
    ? 'No post: ' + stopped
    : 'Draft delivered for approval: ' + (s.slug || s._slug || 'unknown');

const lines = [
  icon + ' *LinkedIn daily* — ' + headline,
  '*Mode:* ' + cfg.mode + (cfg.forced_preview ? ' (forced — demo bank in use)' : ''),
  s._reason ? '*Why:* ' + s._reason : '',
  s._post_url ? '*Post:* ' + s._post_url : '',
  s._approver ? '*Approved by:* ' + s._approver : '',
  (s._warnings && s._warnings.length) ? '*Warnings:* ' + s._warnings.join('; ') : ''
].filter(Boolean);

const text = lines.join('\n');

return [{
  json: {
    _summary: text,
    _slack_body: { text: text },
    _notify: cfg.report_enabled,
    _outcome: outcome || stopped || 'delivered',
    _reason: s._reason || ''
  }
}];
