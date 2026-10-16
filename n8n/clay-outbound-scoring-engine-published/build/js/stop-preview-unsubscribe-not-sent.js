// No Smartlead call was made: a preview run, no SMARTLEAD_API_KEY, no lead id, or nobody
// unsubscribed. Each unsubscribe that would have been sent is listed.
const cfg = $('config').first().json;
const items = $input.all().map((i) => i.json);
return [{
  json: {
    _outcome: 'preview: no unsubscribe sent to Smartlead',
    _reason: items[0] && items[0]._none ? items[0]._reason
      : (!cfg.smartlead_enabled ? (cfg.mode === 'preview' ? 'TEST_RUN is true' : 'SMARTLEAD_API_KEY is blank') : 'no lead id'),
    would_unsubscribe: items.filter((u) => !u._none).map((u) => ({ email: u.email, url: u._url, note: u._reason }))
  }
}];
