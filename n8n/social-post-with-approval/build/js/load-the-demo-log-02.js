// The log, when there is no sheet. SHEET_ID is blank, so this stands in for the Log tab.
//
// It holds what workflow 01's demo would have left behind, plus a little history:
//
//   * one OPEN draft, delivered 50 minutes ago, for the post 01's demo wrote — this is what
//     "find the pending draft" finds, and what the demo reply in "load the demo channel" answers
//   * two posts published earlier this week, and one draft that expired unanswered — so the
//     weekly report has a week to report on
//
// Nothing here is read when SHEET_ID is set.

// @include lib/caption-rules.js
// @include lib/demo-content.js

const cfg = $('config').first().json;
const L = cfg.log_columns;

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const at = (n, h) => new Date(Date.now() - n * 86400000 - h * 3600000).toISOString();
const row = (o) => {
  const r = {};
  for (const k of Object.keys(L)) r[L[k]] = o[k] === undefined ? '' : o[k];
  return r;
};

const earlierHook = 'Most approval steps fail because nobody owns the decision.';

return [
  row({ date: day(4), slug: 'demo-map-the-failure-mode', slot: 1, status: 'awaiting', channel_id: 'demo',
    message_id: '1300000000000000010', caption_fp: 'aaaa0001', pillar: 'Engineering insight',
    hook: 'Most teams can name the tools they depend on.', at: at(4, 3) }),
  row({ date: day(4), slug: 'demo-map-the-failure-mode', slot: 1, status: 'posted', channel_id: 'demo',
    message_id: '1300000000000000010', reply_id: '1300000000000000011', caption_fp: 'aaaa0001',
    pillar: 'Engineering insight', hook: 'Most teams can name the tools they depend on.',
    urn: 'urn:li:share:7000000000000000010', note: 'by demo reviewer — "post"', at: at(4, 1) }),
  row({ date: day(3), slug: 'demo-reporting-costs-a-day', slot: 3, status: 'awaiting', channel_id: 'demo',
    message_id: '1300000000000000020', caption_fp: 'aaaa0002', pillar: 'AI workflow, reporting',
    hook: 'The weekly report is rarely slow because of the analysis.', at: at(3, 22) }),
  row({ date: day(3), slug: 'demo-reporting-costs-a-day', slot: 3, status: 'expired', channel_id: 'demo',
    message_id: '1300000000000000020', caption_fp: 'aaaa0002', pillar: 'AI workflow, reporting',
    note: 'open 21 hours, past the 20 hour limit', at: at(2, 0) }),
  row({ date: day(2), slug: 'demo-earlier-post', slot: 0, status: 'awaiting', channel_id: 'demo',
    message_id: '1300000000000000030', caption_fp: 'aaaa0003', pillar: 'Engineering insight',
    hook: earlierHook, at: at(2, 3) }),
  row({ date: day(2), slug: 'demo-earlier-post', slot: 0, status: 'posted', channel_id: 'demo',
    message_id: '1300000000000000030', reply_id: '1300000000000000031', caption_fp: 'aaaa0003',
    pillar: 'Engineering insight', hook: earlierHook, urn: 'urn:li:share:7000000000000000030',
    note: 'by demo reviewer — "post"', at: at(2, 1) }),
  // Today's open draft — the one the demo reply answers.
  row({ date: day(0), slug: DEMO_DRAFT.slug, slot: DEMO_DRAFT.slot, status: 'awaiting', channel_id: 'demo',
    message_id: DEMO_DRAFT.message_id, caption_fp: fingerprint(DEMO_DRAFT_CAPTION),
    pillar: DEMO_DRAFT.pillar, hook: hookOf(DEMO_DRAFT_CAPTION),
    note: 'delivered for approval (demo)', at: new Date(Date.now() - 50 * 60000).toISOString() })
].map((json) => ({ json }));
