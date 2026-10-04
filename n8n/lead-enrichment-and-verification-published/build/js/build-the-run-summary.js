// The one screen that says whether the pipeline is healthy: how many organisations were
// worked, how many people came out, what the verifier threw away, and how many reached the
// campaign — plus the number the client is actually judged on, the share of the sending
// list that is verified deliverable.
const cfg = $('config').first().json;
const contacts = $('decide who is safe to email').all().map((i) => i.json);
const first = contacts[0] || {};

let pushedOk = 0;
let pushedFailed = 0;
let pushErrors = [];
try {
  for (const item of $('record what was pushed').all()) {
    if (item.json._ok) pushedOk++;
    else { pushedFailed++; if (item.json._error) pushErrors.push(item.json._error); }
  }
} catch (e) {
  // The push branch did not run this time. Preview runs land here every time.
}

const orgs = new Set(contacts.map((c) => c.org_id)).size;
const withEmail = contacts.filter((c) => !c._no_contact && String(c.email || '').includes('@'));
const held = contacts.filter((c) => !c._safe);

const reasons = {};
for (const c of held) {
  const r = c._hold_reason || 'unknown';
  reasons[r] = (reasons[r] || 0) + 1;
}
const topReasons = Object.keys(reasons)
  .sort((a, b) => reasons[b] - reasons[a])
  .slice(0, 6)
  .map((r) => reasons[r] + ' x ' + r);

const bySegment = {};
for (const c of contacts.filter((x) => x._safe)) {
  bySegment[c.category] = (bySegment[c.category] || 0) + 1;
}

const batch = $('pick this run\'s batch').first().json || {};

const lines = [
  'Evergreen partnership engine — enrich and verify',
  'Mode: ' + cfg.mode.toUpperCase() + (cfg.forced_preview ? ' (forced: demo verdicts are on)' : ''),
  '',
  'Organisations worked: ' + orgs + ' of ' + (batch._rows_in_sheet || 0) + ' rows in the sheet',
  'Contacts found: ' + withEmail.length + ' (' + (withEmail.length && orgs ? (Math.round((withEmail.length / orgs) * 10) / 10) : 0) + ' per org)',
  'Verified deliverable: ' + withEmail.filter((c) => c._verified).length + ' (' + (first._verified_rate || 0) + '%)',
  'Undeliverable caught: ' + (first._rejected_count || 0) + ' — that is ' + (first._bounce_risk_avoided || 0) + '% of bounce risk removed before sending',
  'Onto the sending list: ' + (first._safe_count || 0),
  'Held back: ' + held.length,
  '',
  'Why they were held: ' + (topReasons.length ? topReasons.join(', ') : 'nothing held'),
  'Sending list by segment: ' + (Object.keys(bySegment).length
    ? Object.keys(bySegment).map((k) => k + ' ' + bySegment[k]).join(', ') : 'none'),
  '',
  cfg.push_enabled
    ? 'Pushed to campaign: ' + pushedOk + ' ok, ' + pushedFailed + ' rejected'
      + (pushErrors.length ? ' (' + pushErrors.slice(0, 2).join('; ') + ')' : '')
    : 'Pushed to campaign: nothing — ' + (cfg.preview_only ? 'preview mode' : 'sending engine not configured')
];

// Anything here needs a human before the next run.
const warnings = [];
if (!cfg.verifier_enabled) warnings.push('no verifier key: every address is being held');
if (!cfg.apollo_enabled) warnings.push('no Apollo key: running on sheet contacts only');
if (cfg.demo_verdicts) warnings.push('DEMO_VERIFIER is on — verdicts are fabricated');
if (withEmail.length && (first._verified_rate || 0) < 60) warnings.push('verified rate under 60% — check the source of this list');
if (pushedFailed > pushedOk && pushedFailed > 0) warnings.push('more campaign rejections than successes');
if (warnings.length) lines.push('', 'Needs attention: ' + warnings.join(' | '));

const text = lines.join('\n');

return [{
  json: {
    summary_text: text,
    orgs_worked: orgs,
    contacts_found: withEmail.length,
    verified: withEmail.filter((c) => c._verified).length,
    verified_rate: first._verified_rate || 0,
    undeliverable_caught: first._rejected_count || 0,
    sending_list: first._safe_count || 0,
    held: held.length,
    pushed_ok: pushedOk,
    pushed_failed: pushedFailed,
    hold_reasons: reasons,
    warnings: warnings,
    mode: cfg.mode,
    // Slack incoming-webhook shape. Any webhook that accepts JSON will take this.
    _alert_body: { text: text }
  }
}];
