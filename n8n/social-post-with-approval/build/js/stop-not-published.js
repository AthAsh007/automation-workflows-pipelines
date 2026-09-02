// Approved, but the publish gate is shut. Nothing was sent.
//
// Either TEST_RUN is still true, or LINKEDIN_ACCESS_TOKEN is blank. Both are the safe
// default and both are visible here rather than failing inside an HTTP node with a 401.
//
// The approval itself stays open, so setting the token and running again publishes the
// same approved draft. It does not have to be approved twice.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, s, {
    _stopped: 'not published',
    _mode: cfg.mode,
    _reason: cfg.mode !== 'live'
      ? '[BLOCKED] ' + s._approver + ' approved this, but the workflow is in ' + cfg.mode
        + ' mode. Set TEST_RUN = false in config to publish. The approval stays open.'
      : '[BLOCKED] ' + s._approver + ' approved this, but LINKEDIN_ACCESS_TOKEN is blank '
        + 'in config. The approval stays open.',
    _at: new Date().toISOString()
  })
}];
