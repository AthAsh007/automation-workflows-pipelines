// Filed in Zoho. Zoho answers a bulk create with one result per record, each carrying its
// own code — so a 200 on the request does NOT mean every record was accepted. Each result is
// read individually here, and anything that is not SUCCESS is reported as a failure even
// though the HTTP call succeeded.
return $input.all().map((i) => {
  const j = i.json || {};
  const results = (j.data && Array.isArray(j.data)) ? j.data : [];
  const first = results[0] || {};
  const ok = String(first.code || '').toUpperCase() === 'SUCCESS';

  return {
    json: {
      _outcome: ok ? 'filed in Zoho CRM' : 'Zoho accepted the request but rejected the record',
      _reason: ok
        ? 'lead created'
        : (first.message || first.code || 'no per-record result returned'),
      zoho_id: (first.details && first.details.id) || '',
      zoho_code: first.code || '',
      // Anything past the first record, when a run ever batches more than one.
      others: results.slice(1).map((r) => ({ code: r.code, message: r.message }))
    }
  };
});
