// One row per run, appended. The sheet's own history is the trend line — no separate
// "previous value" column to keep in step, and no chart that breaks when a KPI is renamed.
//
// A KPI that is not captured is written as the literal string "not captured", not as 0 and
// not as blank. Blank reads as a formula error; 0 reads as a real finding.
const cfg = $('config').first().json;
const k = $json;
const C = cfg.dashboard_columns;

function n(v) { return v === null || v === undefined ? 'not captured' : v; }

const row = {};
row[C.run_at] = k.run_at;
row[C.open_deals] = k.open_deals;
row[C.covered] = k.covered;
row[C.gaps] = k.gaps;
row[C.coverage_pct] = k.coverage_pct;
row[C.overdue] = k.overdue;
row[C.outreach_attempts] = k.outreach_attempts;
row[C.conversations] = k.conversations;
row[C.meetings] = k.meetings;
row[C.new_partners] = k.new_partners;
row[C.active_partners] = k.active_partners;
row[C.referrals_sent] = n(k.referrals_sent);
row[C.prescreen_qualified] = n(k.prescreen_qualified);
row[C.sent_to_site] = n(k.sent_to_site);
row[C.screened] = n(k.screened);
row[C.randomized] = n(k.randomized);
row[C.referral_to_screen] = n(k.referral_to_screen);
row[C.screen_to_random] = n(k.screen_to_random);
row[C.stalled] = k.stalled;
row[C.high_priority] = k.high_priority;

return [{ json: row }];
