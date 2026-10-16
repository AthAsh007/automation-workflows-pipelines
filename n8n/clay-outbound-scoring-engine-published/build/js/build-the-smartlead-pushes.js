// One Smartlead request per campaign: POST /campaigns/{id}/leads with up to SMARTLEAD_BATCH
// leads. A and B go to their own campaigns, and the tier, persona, score and recommended
// action travel as custom fields so the copy can use them.
//
// In test mode every push is redirected to TEST_CAMPAIGN_ID and capped at TEST_CAP. That can
// only ever redirect a push, never cause a live one.
//
// Smartlead's own block and unsubscribe lists are always respected (the three `ignore_*`
// settings are false), so a lead who opted out of another campaign is not re-added here.
const cfg = $('config').first().json;
const run = $('decide what goes where').first().json;
const test = cfg.mode === 'test';

const toLead = (p) => ({
  first_name: p.first_name,
  last_name: p.last_name,
  email: p.email,
  phone_number: p.phone || undefined,
  company_name: p.company,
  website: p.domain || undefined,
  linkedin_profile: p.linkedin_url || undefined,
  custom_fields: { tier: p.tier, persona: p.persona, fit_score: String(p.score),
    recommended_action: p.recommended_action, clay_row_id: p.clay_row_id }
});

const pushes = [];
const skipped = [];
let testLeft = Number(cfg.test_cap || 3);

for (const [tier, list] of Object.entries(run.campaign || {})) {
  let campaignId = String((cfg.smartlead_campaigns || {})[tier] || '').trim();
  let leads = list;
  if (test) {
    campaignId = cfg.test_campaign_id;
    leads = list.slice(0, Math.max(0, testLeft));
    testLeft -= leads.length;
  }
  // In preview a blank campaign id still builds the push, with a placeholder, so the demo shows
  // the exact payload. The gate after this node never sends a placeholder.
  let placeholder = false;
  if (!campaignId) {
    if (cfg.mode !== 'preview') { skipped.push('tier ' + tier + ': no campaign id in SMARTLEAD_CAMPAIGNS'); continue; }
    campaignId = '<SMARTLEAD_CAMPAIGNS.' + tier + '>';
    placeholder = true;
  }
  for (let i = 0; i < leads.length; i += Number(cfg.smartlead_batch || 100)) {
    const chunk = leads.slice(i, i + Number(cfg.smartlead_batch || 100));
    pushes.push({
      _placeholder: placeholder,
      tier: tier,
      campaign_id: campaignId,
      count: chunk.length,
      emails: chunk.map((p) => p.email),
      _url: cfg.smartlead_api_base + '/campaigns/' + campaignId + '/leads',
      _body: {
        lead_list: chunk.map(toLead),
        settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false,
          ignore_duplicate_leads_in_other_campaign: false }
      }
    });
  }
}

if (!pushes.length) return [{ json: { _none: true, skipped: skipped } }];
return pushes.map((p) => ({ json: Object.assign(p, { skipped: skipped }) }));
