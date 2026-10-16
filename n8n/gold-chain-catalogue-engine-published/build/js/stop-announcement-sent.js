// The broadcast went out after the owner approved it. Everyone left off, and why, is listed.
const n = $input.all().length;
const p = $('plan the broadcast').first().json;
return [{ json: { _outcome: 'sent', _reason: n + ' announcement(s) sent after the owner approved',
  mode: p.mode, not_sent_to: p.skipped } }];
