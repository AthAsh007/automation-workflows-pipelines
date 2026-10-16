// Tasks created. As with any Zoho bulk write, a 200 on the request does not mean every
// record was accepted — each result carries its own code, so they are read individually and
// anything that is not SUCCESS is counted as a failure even though the call succeeded.
return $input.all().map((i) => {
  const j = i.json || {};
  const results = (j.data && Array.isArray(j.data)) ? j.data : [];
  const ok = results.filter((r) => String(r.code || '').toUpperCase() === 'SUCCESS');
  const bad = results.filter((r) => String(r.code || '').toUpperCase() !== 'SUCCESS');

  return {
    json: {
      _outcome: bad.length ? 'created with rejections' : 'tasks created',
      _reason: bad.length
        ? bad.length + ' of ' + results.length + ' task(s) were rejected by Zoho'
        : results.length + ' task(s) created',
      created: ok.length,
      rejected: bad.length,
      ids: ok.map((r) => (r.details && r.details.id) || ''),
      rejections: bad.map((r) => ({ code: r.code, message: r.message }))
    }
  };
});
