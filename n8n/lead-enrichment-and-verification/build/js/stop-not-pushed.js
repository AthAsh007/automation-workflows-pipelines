// Nothing was pushed to a campaign this run. Open this node to see why, per contact.
//
// In preview mode — how the workflow ships — this is where every run lands, and its output
// is the review screen: name, title, score, verifier verdict and hold reason for everyone
// the pipeline touched. Read it before turning the sending gate on.
const cfg = $('config').first().json;

const reason = cfg.forced_preview
    ? 'forced to preview: DEMO_VERIFIER is on, so the verdicts are not real'
  : cfg.preview_only
    ? 'preview mode — TEST_RUN is true and TEST_CAMPAIGN_ID is blank'
  : !cfg.instantly_api_key
    ? 'no Instantly API key in config'
  : !cfg.campaign_id
    ? 'no campaign id in config'
    : 'nothing passed verification and scoring this run';

return $('decide who is safe to email').all().map((i) => {
  const c = i.json;
  return {
    json: {
      _outcome: 'not pushed',
      _why: reason,
      organisation: c.org_name,
      name: c.full_name || '(no contact found)',
      title: c.title || '',
      email: c.email || '',
      email_status: c.email_status || '',
      score: c.score,
      tier: c.tier,
      would_be_sent: Boolean(c._safe),
      hold_reason: c._hold_reason || '',
      campaign_it_would_go_to: c._campaign_id || cfg.campaign_id || '(none set)'
    }
  };
});
