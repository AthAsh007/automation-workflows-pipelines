// Nothing was pushed to Smartlead: TEST_RUN is true with no TEST_CAMPAIGN_ID, the key is
// blank, or no tier had anyone ready. Every push that WOULD have gone is listed here in full.
const cfg = $('config').first().json;
const items = $input.all().map((i) => i.json);
const pushes = items.filter((p) => !p._none);
return [{
  json: {
    _outcome: 'preview: nothing pushed to Smartlead',
    _reason: !pushes.length ? 'no verified A or B lead with a campaign to go to'
      : (cfg.mode === 'preview' ? 'TEST_RUN is true and TEST_CAMPAIGN_ID is blank'
        : (!cfg.smartlead_enabled ? 'SMARTLEAD_API_KEY is blank' : 'a tier has no campaign id')),
    skipped: (items[0] || {}).skipped || [],
    would_push: pushes.map((p) => ({ tier: p.tier, campaign_id: p.campaign_id, url: p._url, body: p._body }))
  }
}];
