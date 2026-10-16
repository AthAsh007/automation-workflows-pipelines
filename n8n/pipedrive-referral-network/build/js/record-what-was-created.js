// Reads Pipedrive's answer to each create and turns it into one honest line.
//
// A create that came back with success:false is NOT recorded as done. It is recorded as
// failed, with whatever Pipedrive said, and the deal stays uncovered so the next run picks
// it up again. The alternative — treating a 4xx as "handled" — is how a coverage report
// slowly becomes fiction.
const cfg = $('config').first().json;
const deal = $('decide the next activity').item.json;
const resp = $json || {};

// `a && b && c` evaluates to c, not to true. Without the coercion `ok` is the new
// activity's numeric id, `ok === true` is false, and every successful create is
// recorded as a failure — a coverage report that only ever goes down.
const ok = resp.success === true && !!(resp.data && resp.data.id);

return [{
  json: Object.assign({}, deal, {
    written: ok === true,
    activity_id: ok ? resp.data.id : null,
    write_error: ok ? '' : (resp.error || resp.error_info || 'no id returned'),
    outcome: ok
      ? (cfg.test_write ? 'created (test — assigned to the test user)' : 'created')
      : 'FAILED to create',
    recorded_at: new Date().toISOString()
  })
}];
