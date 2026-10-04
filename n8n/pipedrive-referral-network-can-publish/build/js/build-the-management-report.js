// The weekly management report, in the order a manager reads it: is the pipeline covered,
// is anyone talking to anybody, and is any of that turning into enrolled patients.
//
// Every "not captured" in here is load-bearing. It says the CRM field has not been wired
// up, which is a setup task, not a recruitment result — and it stops the number being read
// as a zero in a meeting.
const cfg = $('config').first().json;
const k = $('compute the KPIs').first().json;
const stored = $json.written !== false;

function n(v, suffix) {
  return v === null || v === undefined ? '_not captured_' : (v + (suffix || ''));
}

const lines = [];
lines.push('*Referral network — last ' + k.window_days + ' days*');
lines.push('');
lines.push('*Coverage*');
lines.push('• ' + k.open_deals + ' open deals, ' + k.coverage_pct + '% with a next activity');
lines.push('• ' + k.gaps + ' without one · ' + k.overdue + ' overdue activities');
lines.push('• ' + k.stalled + ' stalled' +
  (k.high_priority ? ' (' + k.high_priority + ' high-value)' : ''));
lines.push('');
lines.push('*Activity*');
lines.push('• ' + k.outreach_attempts + ' outreach attempts → ' + k.conversations +
  ' meaningful conversations → ' + k.meetings + ' meetings');
lines.push('• ' + k.new_partners + ' new referral partners · ' + k.active_partners +
  ' practices actively referring');
lines.push('');
lines.push('*Recruitment*');
lines.push('• ' + n(k.referrals_sent) + ' referrals → ' + n(k.prescreen_qualified) +
  ' pre-screen qualified → ' + n(k.sent_to_site) + ' sent to site');
lines.push('• ' + n(k.screened) + ' screened → ' + n(k.randomized) + ' randomised');
lines.push('• referral → screen ' + n(k.referral_to_screen, '%') +
  ' · screen → randomised ' + n(k.screen_to_random, '%'));

if ((k.results_not_captured || []).length) {
  lines.push('');
  lines.push(':information_source: not yet captured in the CRM: ' +
    k.results_not_captured.join(', ') + ' — these are setup tasks, not zeroes.');
}
if ((k.phi_violations || []).length) {
  lines.push('');
  lines.push(':rotating_light: ' + k.phi_violations.length + ' CRM field(s) are named like ' +
    'patient clinical data and were not read: ' +
    k.phi_violations.map(function (v) { return v.name; }).join(', '));
}
lines.push('');
lines.push(stored
  ? 'Written to the dashboard sheet · source: ' + k.source
  : 'Not written down (no SHEET_ID) · source: ' + k.source);

// The three deals a manager should ask about by name, and no more than three. A digest
// that lists forty rows is a spreadsheet with extra steps.
const worst = (k.gap_rows || []).slice(0, 3);
if (worst.length) {
  lines.push('');
  lines.push('*Quietest uncovered deals*');
  worst.forEach(function (g) {
    lines.push('• ' + g.organisation + ' (' + g.stage + ', ' + g.owner + ') — ' +
      g.days_quiet + ' days quiet, ' + g.action);
  });
}

return [{
  json: Object.assign({}, k, {
    written: stored,
    report: lines.join('\n'),
    _report_body: { text: lines.join('\n') }
  })
}];
