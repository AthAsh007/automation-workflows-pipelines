// One Slack DM per rep, containing only that rep's deals.
//
// The team summary says "14 activities created". A rep needs "these are the four that are
// yours, and these two are overdue". Each item is one owner: what was scheduled for them
// today (or would be, in preview), and what they are overdue on (owner tier — the manager
// has not been told yet). Built in every mode so preview shows the
// exact text; whether it is SENT is decided by the next node.
//
// Test mode never DMs a real rep: every message is redirected to the Slack id mapped for
// TEST_OWNER_ID, prefixed [TEST]. No mapping for that user = nothing is sent.
const cfg = $('config').first().json;
const s = $json;
const map = cfg.owner_slack_ids || {};

const owners = {};
function ownerOf(id, name) {
  const k = String(id === null || id === undefined ? 'none' : id);
  if (!owners[k]) owners[k] = { owner_id: id, owner: name || 'Unassigned', scheduled: [],
    overdue: [] };
  return owners[k];
}

(s.decisions || []).forEach(function (d) {
  const o = ownerOf(d.rep_id, d.rep);
  if (d.action === 'create' || d.action === 'reengage') {
    if (d.outcome && d.outcome.indexOf('FAILED') === 0) return;
    o.scheduled.push(d);
  }
});
(s.owner_tier || []).forEach(function (r) { ownerOf(r.owner_id, r.owner).overdue.push(r); });

const verb = cfg.preview_only ? 'would be scheduled' : 'scheduled';
const testTarget = cfg.test_write ? (map[String(cfg.test_owner_id)] || '') : '';

return Object.keys(owners).map(function (k) {
  const o = owners[k];
  const lines = [];
  lines.push((cfg.test_write ? '[TEST] ' : '') + 'Good morning ' +
    String(o.owner).split(' ')[0] + ' — your referral pipeline today');
  if (o.scheduled.length) {
    lines.push('');
    lines.push('*' + o.scheduled.length + ' next step(s) ' + verb + ' for you*');
    o.scheduled.slice(0, 10).forEach(function (d) {
      lines.push('• ' + d.practice + ' — ' + d.activity + ' (due ' + d.due + ')');
    });
  }
  if (o.overdue.length) {
    lines.push('');
    lines.push('*' + o.overdue.length + ' overdue — please clear or reschedule*');
    o.overdue.slice(0, 10).forEach(function (r) {
      lines.push('• ' + r.organisation + ' — overdue ' + r.overdue_business_days +
        ' business day(s), since ' + r.overdue_since + '. After ' + cfg.manager_after_days +
        ' it goes to your manager.');
    });
  }
  const real = map[String(o.owner_id)] || '';
  const sendTo = cfg.test_write ? testTarget : real;
  const nothing = !o.scheduled.length && !o.overdue.length;
  return {
    json: {
      owner: o.owner,
      owner_id: o.owner_id,
      slack_id: real,
      send_to: nothing ? '' : sendTo,
      scheduled: o.scheduled.length,
      overdue: o.overdue.length,
      text: lines.join('\n'),
      held_because: nothing ? 'nothing for this rep today'
        : !cfg.slack_dm_enabled ? 'SLACK_DMS is off or OWNER_SLACK_IDS is empty'
        : cfg.preview_only ? 'preview — DMs are only sent in test or live mode'
        : !sendTo ? (cfg.test_write ? 'test mode: TEST_OWNER_ID has no Slack id in OWNER_SLACK_IDS'
          : 'no Slack id for this rep in OWNER_SLACK_IDS') : ''
    }
  };
});
