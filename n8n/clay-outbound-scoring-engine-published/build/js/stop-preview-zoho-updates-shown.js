// Zoho was not written: TEST_RUN is true, the OAuth values are blank, or no reply changed a
// lead. The exact upsert, and every task that would follow it, are here.
const cfg = $('config').first().json;
const j = $input.first().json;
return [{
  json: {
    _outcome: 'preview: nothing written to Zoho',
    _reason: j._count === 0 ? 'no reply changes a lead (out-of-office only)'
      : (cfg.mode !== 'live' ? 'TEST_RUN is true, mode ' + cfg.mode
        : 'ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN is blank'),
    would_upsert: j._zoho.body,
    then_tasks: j._replies.filter((r) => r.task).map((r) => Object.assign({ lead: r.email }, r.task))
  }
}];
