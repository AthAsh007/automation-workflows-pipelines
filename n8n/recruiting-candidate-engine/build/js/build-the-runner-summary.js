// The runner posts a summary only when there is something worth reading. A workflow that
// fires every fifteen minutes and reports "0 sent" ninety-six times a day trains everyone
// to ignore it, and then nobody notices the morning it says "42 permanent failures".
const cfg = $('config').first().json;
const j = $input.first().json || {};

const preview = String(j._outcome || '').indexOf('preview') === 0;
const nothing = j._outcome === 'nothing due' || j._outcome === 'everything due was deferred';

const c = j.counts || {};
const sent = Number(c.sent) || 0;
const transient = Number(c.transient) || 0;
const permanent = Number(c.permanent) || 0;
const carrierOptOut = Number(c.carrier_opt_out) || 0;
const deferred = Number(j.deferred) || Number(j.deferred_count) || 0;

const lines = [];
const attention = [];

if (preview) {
  lines.push('*Outreach runner — preview*',
    (j.would_send || 0) + ' touches ready: ' + (j.sms_count || 0) + ' SMS, '
      + (j.voice_count || 0) + ' calls. Nothing was sent.');
  (j.warnings || []).forEach((w) => attention.push(w));
} else if (nothing) {
  lines.push('*Outreach runner*', j._outcome + ' — ' + (j.rows_returned_by_the_queue || 0)
    + ' rows in the queue, ' + (j.deferred || 0) + ' deferred.');
} else {
  const modeLabel = cfg.mode === 'live' ? '' : '  [' + String(cfg.mode).toUpperCase() + ']';
  lines.push('*Outreach runner*' + modeLabel,
    sent + ' sent · ' + deferred + ' deferred · ' + transient + ' retrying · '
      + permanent + ' undeliverable');

  if (carrierOptOut) {
    lines.push('', carrierOptOut + ' carrier-level opt-out'
      + (carrierOptOut === 1 ? '' : 's') + ' recorded (Twilio 21610).');
  }

  const notable = (j.explanations || [])
    .filter((e) => /gave up|permanent|carrier|undeliverable/.test(String(e.action)))
    .slice(0, 6);
  if (notable.length) {
    lines.push('', 'Stopped:');
    notable.forEach((e) => lines.push('• ' + e.id.slice(0, 8) + ' — ' + e.action));
  }

  if (permanent > 5) {
    attention.push(permanent + ' permanent failures in one pass. That is usually a phone '
      + 'field mapped to a landline column, not a bad batch of numbers.');
  }
  if (transient > sent && sent > 0) {
    attention.push('More transient failures than sends — check the Twilio account balance '
      + 'and the rate limit before the backoff spreads them over the next six hours.');
  }
}

if (attention.length) lines.push('', '*Needs attention*', ...attention.map((a) => '• ' + a));

// Only speak up when there is news, or when something is wrong.
const worthPosting = attention.length > 0 || sent > 0 || permanent > 0 || preview;

return [{
  json: {
    _outcome: j._outcome || 'runner complete',
    sent: sent,
    deferred: deferred,
    retrying: transient,
    undeliverable: permanent,
    carrier_opt_outs: carrierOptOut,
    needs_attention: attention,
    _post: worthPosting && cfg.slack_enabled,
    slack_text: lines.join('\n'),
    slack_payload: { text: lines.join('\n') }
  }
}];
