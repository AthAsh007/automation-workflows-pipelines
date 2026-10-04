// The one gate that decides who gets emailed. Every reason a contact is held is written on
// the contact, in words, so the sheet answers "why isn't this person in the campaign?"
// without anyone having to open an execution log.
//
// Order matters: the cheapest and most absolute rules run first, so a suppressed address is
// never reported as merely low-scoring.
const cfg = $('config').first().json;
const contacts = $input.all().map((i) => i.json);

const suppression = cfg.suppression || [];
const rolePrefixes = (cfg.role_prefixes || []).map((p) => String(p).toLowerCase());
const minScore = Number(cfg.min_icp_score || 0);
const cap = Number(cfg.daily_cap || 0);
const requireState = String(cfg.require_state || '');

const seenEmail = new Set();
let pushed = 0;

const decided = contacts.map((c) => {
  const email = String(c.email || '').trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  const local = email.split('@')[0] || '';

  let hold = '';

  if (c._no_contact) hold = c._hold_reason || 'no contact found';
  else if (!email.includes('@')) hold = 'no email address';
  else if (c.tier === 'X') hold = c._hold_reason || 'excluded title';
  else if (suppression.some((s) => s === email || s === domain || domain.endsWith('.' + s))) hold = 'on the suppression list';
  else if (seenEmail.has(email)) hold = 'duplicate of another row this run';
  else if (rolePrefixes.includes(local) || c._verifier_role_flag) hold = 'shared mailbox, not a person';
  else if (requireState && String(c.state || '').toUpperCase() !== requireState) hold = 'outside ' + requireState;
  else if (c._verdict === 'rejected') hold = 'verifier says ' + (c.email_status || 'undeliverable');
  else if (c._verdict === 'risky') hold = 'risky (' + (c.email_status || 'catch-all') + ')';
  else if (!c._verified && cfg.hold_unverified) hold = c._verdict === 'unverified' ? 'not verified yet' : 'not verified';
  else if (Number(c.score || 0) < minScore) hold = 'ICP score ' + Number(c.score || 0) + ' below ' + minScore;

  if (!hold && email) seenEmail.add(email);

  // The cap is enforced here, in code, not described in a comment somewhere.
  if (!hold && cap > 0 && pushed >= cap) hold = 'daily cap of ' + cap + ' reached';
  if (!hold) pushed++;

  const campaign = (cfg.campaign_by_category || {})[c.category] || cfg.campaign_id || '';

  return Object.assign({}, c, {
    _safe: hold === '',
    _hold_reason: hold,
    _campaign_id: hold === '' ? campaign : '',
    sending_list: hold === '' ? 'Yes' : 'No'
  });
});

const safe = decided.filter((c) => c._safe);
const withEmail = decided.filter((c) => !c._no_contact && String(c.email || '').includes('@'));
const rejected = decided.filter((c) => c._verdict === 'rejected').length;

// The numbers the KPI conversation actually needs. Reported per run, on every item, so the
// summary node and the sheet cannot disagree about them.
const stats = {
  _contacts_seen: decided.length,
  _with_email: withEmail.length,
  _safe_count: safe.length,
  _held_count: decided.length - safe.length,
  _rejected_count: rejected,
  _verified_rate: withEmail.length ? Math.round((withEmail.filter((c) => c._verified).length / withEmail.length) * 100) : 0,
  // What the bounce rate would have been had nothing been filtered.
  _bounce_risk_avoided: withEmail.length ? Math.round((rejected / withEmail.length) * 1000) / 10 : 0,
  _any_safe: safe.length > 0 && cfg.push_enabled === true
};

return decided.map((c) => ({
  json: Object.assign({}, c, stats, { _push: c._safe && cfg.push_enabled === true })
}));
