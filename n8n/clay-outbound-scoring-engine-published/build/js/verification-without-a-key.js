// Everyone the verifier was not called for. Three kinds arrive here:
//   * not needing it (C, Reject, duplicates, no email): passed through untouched
//   * an invented demo prospect: gets its demo verdict, so the demo shows the hold working
//   * a real prospect with no VERIFIER_API_KEY: marked "unverified", which holds it from the
//     campaign. Without a verifier nothing is emailed. That is the rule, not a fallback.
const cfg = $('config').first().json;
const accept = (cfg.accept_statuses || []).map((s) => String(s).toLowerCase());
return $input.all().map((item) => {
  const p = Object.assign({}, item.json);
  if (!p._needs_verify) return { json: p };
  if (p._demo && p._demo.verify) {
    p.email_status = String(p._demo.verify).toLowerCase();
    p._verified_by = 'demo verifier (invented)';
  } else {
    p.email_status = 'unverified';
    p._verified_by = 'none: no VERIFIER_API_KEY';
  }
  p._verified = accept.includes(p.email_status);
  return { json: p };
});
