// Results by physician / practice. Aggregate counts only — this tab is why the PHI check
// upstream exists. Every column here is a number of patients, never a patient.
const cfg = $('config').first().json;
const k = $('compute the KPIs').first().json;
const C = cfg.by_practice_columns;

return (k.by_practice || []).map(function (p) {
  const row = {};
  row[C.organisation] = p.organisation;
  row[C.stage] = p.stage;
  row[C.owner] = p.owner;
  row[C.referrals_sent] = p.referrals_sent === '' ? 'not captured' : p.referrals_sent;
  row[C.prescreen_qualified] = p.prescreen_qualified === '' ? 'not captured' : p.prescreen_qualified;
  row[C.sent_to_site] = p.sent_to_site === '' ? 'not captured' : p.sent_to_site;
  row[C.screened] = p.screened === '' ? 'not captured' : p.screened;
  row[C.randomized] = p.randomized === '' ? 'not captured' : p.randomized;
  row[C.last_referral] = p.last_referral;
  row[C.run_at] = k.run_at;
  return { json: row };
});
