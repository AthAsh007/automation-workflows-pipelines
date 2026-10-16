// The management dashboard, computed once per run.
//
// Pipedrive Insights already counts deals by stage and activities by type. What it cannot
// do is the recruitment funnel, because that spans three objects and a set of aggregate
// custom fields: outreach -> conversation -> meeting -> referral partner -> referrals ->
// pre-screen -> site -> screened -> randomised. That funnel is this node.
//
// Two rules run through all of it:
//
//   A number that is not captured is reported as "not captured", never as zero. A zero
//   means the practice referred nobody; a blank means nobody wired the field up. Printing
//   the second as the first is how a dashboard loses a manager's trust in week two.
//
//   Nothing here reads a field the PHI check blocked. Counts only — a number of patients
//   is not a patient.
const cfg = $('config').first().json;
const items = $input.all().map(function (i) { return i.json; });

const DAY = 86400000;
const now = Date.now();
const windowStart = now - Number(cfg.report_window_days || 7) * DAY;
const runAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

const clean = items.filter(function (j) { return j._has_gaps === false; })[0];
const deals = items.filter(function (j) { return j._has_gaps !== false && j.id; });
const pipeline = (deals[0] && deals[0]._pipeline) || {
  read_at: clean && clean.read_at, source: clean && clean.source,
  phi_violations: (clean && clean.phi_violations) || [],
  results_not_captured: (clean && clean.results_not_captured) || []
};

// Activities have to be re-read from the pipeline item: the per-deal fan-out above carries
// verdicts, not the raw activity list.
const upstream = $('check the PHI boundary').first().json;
const activities = upstream.activities || [];
const resultKeys = upstream.result_field_keys || {};
const notCaptured = upstream.results_not_captured || [];

function stamp(s) {
  if (!s) return null;
  const ms = Date.parse(String(s).replace(' ', 'T') +
    (String(s).indexOf('Z') === -1 ? 'Z' : ''));
  return isNaN(ms) ? null : ms;
}

function inWindow(a) {
  const t = stamp(a.marked_done_time) || stamp(a.add_time);
  return t !== null && t >= windowStart;
}

const noAnswer = cfg.no_answer_words || [];
function isConversation(a) {
  if (!a.done) return false;
  if (cfg.conversation_types.indexOf(a.type) === -1) return false;
  const text = (String(a.subject || '') + ' ' + String(a.note || '')).toLowerCase();
  for (let i = 0; i < noAnswer.length; i++) {
    if (text.indexOf(noAnswer[i]) !== -1) return false;
  }
  return true;
}

const dealById = {};
deals.forEach(function (d) { dealById[String(d.id)] = d; });

// ------------------------------------------------------------------ activity-based counts
const recent = activities.filter(inWindow);
const outreach = recent.filter(function (a) {
  return a.done && cfg.outreach_types.indexOf(a.type) !== -1;
});
const conversations = recent.filter(isConversation);
const meetings = recent.filter(function (a) {
  return a.done && cfg.meeting_types.indexOf(a.type) !== -1;
});
const overdue = activities.filter(function (a) {
  if (a.done || !a.due_date) return false;
  const due = Date.parse(String(a.due_date).slice(0, 10) + 'T00:00:00Z');
  return !isNaN(due) && due < now - Number(cfg.overdue_days || 0) * DAY;
});

// ------------------------------------------------------------------ result-field counts
// A deal contributes a number only when the field is configured AND present on the deal.
function resultOf(deal, name) {
  const key = resultKeys[name];
  if (!key) return null;
  const raw = deal.raw ? deal.raw[key] : undefined;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

const RESULTS = ['referrals_sent', 'prescreen_qualified', 'sent_to_site', 'screened',
  'randomized'];
const totals = {};
const captured = {};
RESULTS.forEach(function (r) { totals[r] = 0; captured[r] = 0; });

deals.forEach(function (d) {
  RESULTS.forEach(function (r) {
    const v = resultOf(d, r);
    if (v !== null) { totals[r] += v; captured[r]++; }
  });
});

function reported(r) { return captured[r] > 0 ? totals[r] : null; }
function pct(a, b) {
  if (a === null || b === null || !b) return null;
  return Math.round((a / b) * 100);
}

// ------------------------------------------------------------------ deal-based counts
const open = deals.length;
const covered = deals.filter(function (d) { return d.covered; }).length;
const gaps = deals.filter(function (d) { return !d.covered; });
const stalled = deals.filter(function (d) { return d.stale; });
const partners = deals.filter(function (d) {
  return cfg.partner_stages.indexOf(d.stage) !== -1;
});
const newPartners = partners.filter(function (d) {
  const t = stamp(d.stage_change_time);
  return t !== null && t >= windowStart;
});
const activePartners = partners.filter(function (d) {
  const v = resultOf(d, 'referrals_sent');
  return v !== null && v > 0;
});

// ------------------------------------------------------------------ by rep
const byRep = {};
deals.forEach(function (d) {
  const k = d.owner || 'Unassigned';
  if (!byRep[k]) {
    byRep[k] = { rep: k, open_deals: 0, gaps: 0, overdue: 0, outreach_attempts: 0,
      conversations: 0, meetings: 0, new_partners: 0, referrals_sent: 0,
      referrals_captured: 0 };
  }
  const r = byRep[k];
  r.open_deals++;
  if (!d.covered) r.gaps++;
  if (cfg.partner_stages.indexOf(d.stage) !== -1 &&
      stamp(d.stage_change_time) >= windowStart) r.new_partners++;
  const v = resultOf(d, 'referrals_sent');
  if (v !== null) { r.referrals_sent += v; r.referrals_captured++; }
});

function repOf(activity) {
  const d = dealById[String(activity.deal_id)];
  return d ? (d.owner || 'Unassigned') : null;
}
outreach.forEach(function (a) { const r = byRep[repOf(a)]; if (r) r.outreach_attempts++; });
conversations.forEach(function (a) { const r = byRep[repOf(a)]; if (r) r.conversations++; });
meetings.forEach(function (a) { const r = byRep[repOf(a)]; if (r) r.meetings++; });
overdue.forEach(function (a) { const r = byRep[repOf(a)]; if (r) r.overdue++; });

// ------------------------------------------------------------------ by practice
const byPractice = deals.map(function (d) {
  const row = { organisation: d.organisation || d.title, stage: d.stage,
    owner: d.owner, last_referral: '' };
  RESULTS.forEach(function (r) {
    const v = resultOf(d, r);
    row[r] = v === null ? '' : v;
  });
  const acts = activities.filter(function (a) {
    return String(a.deal_id) === String(d.id) && a.done &&
      a.type === cfg.activity_types.referral_follow_up;
  }).map(function (a) { return stamp(a.marked_done_time); })
    .filter(function (t) { return t !== null; }).sort(function (a, b) { return b - a; });
  row.last_referral = acts.length ? new Date(acts[0]).toISOString().slice(0, 10) : '';
  return row;
}).sort(function (a, b) { return Number(b.referrals_sent || 0) - Number(a.referrals_sent || 0); });

return [{
  json: {
    run_at: runAt,
    window_days: Number(cfg.report_window_days || 7),
    source: pipeline.source,
    phi_violations: pipeline.phi_violations || [],
    results_not_captured: notCaptured,

    open_deals: open,
    covered: covered,
    gaps: gaps.length,
    coverage_pct: open ? Math.round((covered / open) * 100) : 100,
    overdue: overdue.length,

    outreach_attempts: outreach.length,
    conversations: conversations.length,
    meetings: meetings.length,
    new_partners: newPartners.length,
    active_partners: activePartners.length,

    referrals_sent: reported('referrals_sent'),
    prescreen_qualified: reported('prescreen_qualified'),
    sent_to_site: reported('sent_to_site'),
    screened: reported('screened'),
    randomized: reported('randomized'),
    referral_to_screen: pct(reported('screened'), reported('referrals_sent')),
    screen_to_random: pct(reported('randomized'), reported('screened')),

    stalled: stalled.length,
    high_priority: stalled.filter(function (d) { return d.high_priority; }).length,

    gap_rows: gaps.map(function (d) {
      return { deal_id: d.id, deal: d.title, organisation: d.organisation,
        person: d.person, stage: d.stage, owner: d.owner, value: d.value,
        last_activity: d.last_activity, days_quiet: d.days_quiet,
        action: d.parked_due ? 'only activity parked at ' + d.parked_due
          : 'no open activity' };
    }).sort(function (a, b) { return Number(b.days_quiet || 0) - Number(a.days_quiet || 0); }),
    by_rep: Object.keys(byRep).map(function (k) { return byRep[k]; })
      .sort(function (a, b) { return b.open_deals - a.open_deals; }),
    by_practice: byPractice
  }
}];
