// Zoho could not be read, so the sweep did not run. It deliberately does NOT fall back to
// the demo pipeline: sweeping invented deals against a real org would create tasks on records
// that do not exist and report a clean pipeline that was never looked at.
//
// A sweep that could not see the pipeline must say so and stop. That is the whole point of
// this node existing rather than an empty result.
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'sweep did not run',
      _reason: 'Zoho refused the read — no deals were checked and no tasks were created',
      _hint: 'a COQL read needs the ZohoCRM.coql.READ scope as well as deals.READ; ' +
             'a 400 with INVALID_QUERY usually means a stage name in OPEN_STAGES does not ' +
             'exist in this org',
      zoho_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)
    }
  };
});
