// The organisations were worked but nobody usable came out of any of them. The
// Organisations tab has already been updated with the reason per row, so the next run does
// not grind through the same dead addresses.
//
// Seeing this branch fire repeatedly means the raw list is the problem, not the pipeline —
// usually scraped rows with no website, or an Apollo plan out of credits.
const contacts = $('decide who is safe to email').all().map((i) => i.json);

const reasons = {};
for (const c of contacts) {
  const r = c._hold_reason || 'unknown';
  reasons[r] = (reasons[r] || 0) + 1;
}

return [{
  json: {
    _outcome: 'no contacts found',
    organisations_worked: new Set(contacts.map((c) => c.org_id)).size,
    reasons: reasons,
    _next_step: 'Check the Website column on those rows, and Apollo credits.'
  }
}];
