// The log, when there is no sheet. SHEET_ID is blank, so this stands in for the Log tab.
//
// Two days of history, shaped exactly as the sheet returns them: one post that was drafted and
// published two days ago. It is there so the two date-based checks have something to bite on
// in a demo:
//
//   * topic rotation  its pillar is "Engineering insight", the same as demo slot 1, so slot 1
//                     is held (published 2 days ago, cooldown TOPIC_COOLDOWN_DAYS) and slot 2
//                     is picked instead
//   * repeated hook   its opening sentence is what the demo writer's first draft opens with,
//                     so the caption check catches a recycled hook
//
// Nothing here is read when SHEET_ID is set.

const cfg = $('config').first().json;
const L = cfg.log_columns;

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const at = (n, h) => new Date(Date.now() - n * 86400000 - h * 3600000).toISOString();

const row = (o) => {
  const r = {};
  for (const k of Object.keys(L)) r[L[k]] = o[k] === undefined ? '' : o[k];
  return r;
};

const hook = 'Most approval steps fail because nobody owns the decision.';

return [
  row({ date: day(2), slug: 'demo-earlier-post', slot: 0, status: 'awaiting', channel_id: 'demo',
    message_id: '1300000000000000001', caption_fp: '0badc0de', pillar: 'Engineering insight',
    hook: hook, note: 'delivered for approval (demo history)', at: at(2, 3) }),
  row({ date: day(2), slug: 'demo-earlier-post', slot: 0, status: 'posted', channel_id: 'demo',
    message_id: '1300000000000000001', reply_id: '1300000000000000002', caption_fp: '0badc0de',
    pillar: 'Engineering insight', hook: hook, urn: 'urn:li:share:7000000000000000001',
    note: 'by demo reviewer — "post" (demo history)', at: at(2, 2) })
].map((json) => ({ json }));
