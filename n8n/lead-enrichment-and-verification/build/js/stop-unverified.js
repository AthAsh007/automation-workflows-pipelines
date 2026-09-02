// Everything that could not be verified: no verifier key set, no address to check, or an
// organisation Apollo found nobody at. It is still written to the sheet — the work is not
// thrown away — it just never reaches the sending list while HOLD_UNVERIFIED is true.
//
// DEMO_VERIFIER gives these a deterministic pretend verdict so the rest of the pipeline can
// be watched on a screen-share. The config node forces preview whenever that is on, so a
// made-up verdict cannot reach a real campaign.
const cfg = $('config').first().json;
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Same address always gets the same fake verdict, so a demo is repeatable.
const pretend = (email) => {
  let h = 0;
  for (const ch of String(email)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  const n = h % 100;
  if (n < 78) return 'ok';
  if (n < 90) return 'catch_all';
  if (n < 96) return 'unknown';
  return 'invalid';
};

return $input.all().map((item) => {
  const c = item.json;

  if (c._no_contact) {
    return {
      json: Object.assign({}, c, {
        email_status: '', _verdict: 'no contact', _verified: false, _verified_at: ''
      })
    };
  }

  if (cfg.demo_verdicts) {
    const status = pretend(c.email);
    const verdict = (cfg.accept_statuses || []).includes(status) ? 'accepted'
      : ((cfg.risky_statuses || []).includes(status) ? 'risky' : 'rejected');
    return {
      json: Object.assign({}, c, {
        email_status: status + ' (demo)',
        _verdict: verdict,
        _verified: verdict === 'accepted',
        _verified_at: stamp,
        _demo_verdict: true
      })
    };
  }

  return {
    json: Object.assign({}, c, {
      email_status: 'unverified',
      _verdict: 'unverified',
      _verified: false,
      _verified_at: '',
      _hold_reason: c._hold_reason || 'not verified'
    })
  };
});
