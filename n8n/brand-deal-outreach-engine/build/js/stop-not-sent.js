// STOP: this pitch was not sent.
//
// Open this node to read the batch. In preview — how the workflow ships — every pitch is
// here, fully written, with the inbox it would have gone from, the facts it was built on,
// and for every held one, the audit's reason in plain words.
//
// That list is the deliverable of a first run, and it is also the only honest answer to
// their audition question: "two example pitches you've written — show us what personal and
// non-templated looks like."
const cfg = $('config').first().json;
const p = $json;

const why = p.send_state === 'held'
  ? p.send_reason
  : cfg.forced_preview
    ? 'PREVIEW (forced — the demo roster cannot email a real contact)'
    : cfg.preview_only
      ? 'PREVIEW — TEST_RUN is true and TEST_EMAIL is blank'
      : 'sending is not configured (SEND_API_KEY or CAMPAIGN_ID is blank)';

return [{
  json: Object.assign({}, p, {
    sent: false,
    lead_id: null,
    send_state: p.send_state === 'held' ? 'held' : 'preview',
    send_reason: why,
    sent_at: '',
    logged_at: new Date().toISOString()
  })
}];
