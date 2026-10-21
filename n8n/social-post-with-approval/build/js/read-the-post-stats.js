// Read LinkedIn's per-post statistics and attach them to the report data.
//
// organizationalEntityShareStatistics returns one element per post, keyed by `share` or
// `ugcPost`, with totalShareStatistics { impressionCount, uniqueImpressionsCount, clickCount,
// likeCount, commentCount, shareCount, engagement }.
//
// A 403 is the common case for apps without Community Management API approval: the endpoint
// needs r_organization_social, which LinkedIn grants by product review, not by scope request.
// That is reported as what it is, and the report still goes out from the log alone.

const due = $('is the weekly report due?').first().json;
const res = $json || {};
const status = Number(res.statusCode || 0);
const body = (res.body && typeof res.body === 'object') ? res.body : {};

const stats = {};
let note = '';
if (status >= 200 && status < 300) {
  for (const el of body.elements || []) {
    const urn = el.share || el.ugcPost || '';
    const t = el.totalShareStatistics || {};
    if (urn) {
      stats[urn] = {
        impressions: t.impressionCount || 0,
        unique: t.uniqueImpressionsCount || 0,
        clicks: t.clickCount || 0,
        likes: t.likeCount || 0,
        comments: t.commentCount || 0,
        shares: t.shareCount || 0,
        engagement: t.engagement || 0
      };
    }
  }
  note = 'statistics for ' + Object.keys(stats).length + ' of ' + due._urns.length + ' post(s)';
} else if (status === 403) {
  note = 'no statistics: LinkedIn returned 403. This endpoint needs r_organization_social, '
    + 'which requires Community Management API approval for the app. Set STATS_ENABLED = false '
    + 'to stop asking.';
} else if (status === 401) {
  note = 'no statistics: the LinkedIn token was rejected (401) — it has probably expired';
} else {
  note = 'no statistics: HTTP ' + status + (body.message ? ' — ' + body.message : '');
}

return [{ json: Object.assign({}, due, { _stats: stats, _stats_note: note, _stats_status: status }) }];
