// STOP: nothing was written for this deal.
//
// Open this node to read the whole decision. In preview — how the workflow ships — every
// deal the guard WOULD have acted on is here, with the activity it would have created, the
// stage rule that produced it and the due date. That list is the deliverable of a first
// run: you read it, you disagree with three of them, you change the stage rules, you run
// it again. Nothing has touched the CRM yet.
const cfg = $('config').first().json;
const deal = $json;

const why = cfg.preview_only
  ? (cfg.forced_preview
    ? 'PREVIEW (forced — the demo pipeline cannot write to a real account)'
    : 'PREVIEW — TEST_RUN is true and TEST_OWNER_ID is blank')
  : deal.action === 'escalate'
    ? 'escalated, not created — a second task on an already-overdue deal helps nobody'
    : deal.action_reason;

return [{
  json: Object.assign({}, deal, {
    written: false,
    activity_id: null,
    write_error: '',
    outcome: deal.action === 'create' || deal.action === 'reengage'
      ? 'would ' + deal.action + ': ' + deal.activity_subject + ' (due ' + deal.activity_due + ')'
      : deal.action,
    held_because: why,
    recorded_at: new Date().toISOString()
  })
}];
