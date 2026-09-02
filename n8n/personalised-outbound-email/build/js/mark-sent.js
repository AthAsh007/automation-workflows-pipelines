// The SMTP node replaces the item with its own send result, so re-attach the lead.
// "send this one?" is the last node the full lead passed through untouched.
const cfg = $('config').first().json;
const lead = $('send this one?').first().json;
const result = $input.first().json || {};

return [{
  json: Object.assign({}, lead, {
    _outcome: cfg.test_send ? 'test_send' : 'sent',
    _sent_to: cfg.test_send ? cfg.test_email : lead.email,
    _message_id: result.messageId || '',
    _accepted: Array.isArray(result.accepted) ? result.accepted.length : null,
    _rejected: Array.isArray(result.rejected) ? result.rejected.length : null
  })
}];
