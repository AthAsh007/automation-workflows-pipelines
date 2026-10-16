// Results by marketing representative.
//
// Attempts and conversations are kept in separate columns deliberately. A rep with 200
// attempts and 6 conversations and a rep with 40 attempts and 22 conversations have very
// different problems, and a single "activity" number hides both.
const cfg = $('config').first().json;
const k = $('compute the KPIs').first().json;
const C = cfg.by_rep_columns;

return (k.by_rep || []).map(function (r) {
  const row = {};
  row[C.rep] = r.rep;
  row[C.open_deals] = r.open_deals;
  row[C.gaps] = r.gaps;
  row[C.overdue] = r.overdue;
  row[C.outreach_attempts] = r.outreach_attempts;
  row[C.conversations] = r.conversations;
  row[C.meetings] = r.meetings;
  row[C.new_partners] = r.new_partners;
  row[C.referrals_sent] = r.referrals_captured ? r.referrals_sent : 'not captured';
  row[C.run_at] = k.run_at;
  return { json: row };
});
