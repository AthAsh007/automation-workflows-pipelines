// APPROVAL_WAIT_HOURS passed without the owner opening the approve link. Nothing is sent:
// a morning price list sent in the evening is a wrong price list.
const cfg = $('config').first().json;
return [{ json: { _outcome: 'not sent', _reason: 'no approval within ' + cfg.approval_wait_hours + ' hour(s)' } }];
