// No NOTIFY_WEBHOOK_URL, or a preview run: the summary is here instead of in the team channel.
// Read `summary`.
const j = $input.first().json;
return [{ json: { _outcome: 'summary shown, not posted', summary: j.summary, counts: j.counts, held: j.held } }];
