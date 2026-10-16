// Smartlead answers each push with counts: how many were added, and how many it skipped
// because they were already in a campaign, blocked or unsubscribed. A failed call comes back
// with the error on it instead of stopping the run.
const src = $('pushing to Smartlead?');
return $input.all().map((reply, i) => {
  let push = {};
  try { push = src.itemMatching(i).json; } catch (e) { push = (src.all(0)[i] || { json: {} }).json; }
  const b = reply.json || {};
  const failed = !!(b.error || (b.ok === false));
  return {
    json: {
      _outcome: failed ? 'Smartlead refused the push' : 'pushed to Smartlead',
      tier: push.tier,
      campaign_id: push.campaign_id,
      sent: push.count,
      added: b.added_count !== undefined ? b.added_count : (b.upload_count !== undefined ? b.upload_count : null),
      skipped_by_smartlead: b.skipped_count !== undefined ? b.skipped_count : null,
      already_in_campaign: b.already_added_to_campaign !== undefined ? b.already_added_to_campaign : null,
      error: failed ? JSON.stringify(b.error || b).slice(0, 300) : ''
    }
  };
});
