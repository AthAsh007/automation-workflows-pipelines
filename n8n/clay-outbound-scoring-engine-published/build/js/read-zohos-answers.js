// Zoho answers an upsert with one result per record, each with its own code, so a 200 on the
// request does NOT mean every record landed. Each result is read against the email it was
// sent for, and anything that is not SUCCESS is reported by name.
const sent = $('build the Zoho upsert').first().json._emails || [];
const res = $input.first().json || {};
const results = Array.isArray(res.data) ? res.data : [];

const rows = results.map((r, i) => ({
  email: sent[i] || '',
  code: r.code || '',
  action: r.action || '',
  zoho_id: (r.details && r.details.id) || '',
  message: r.code === 'SUCCESS' ? '' : (r.message || '') + (r.details ? ' ' + JSON.stringify(r.details).slice(0, 160) : '')
}));
const ok = rows.filter((r) => r.code === 'SUCCESS');

return [{
  json: {
    _outcome: 'written to Zoho',
    inserted: ok.filter((r) => r.action === 'insert').length,
    updated: ok.filter((r) => r.action === 'update').length,
    refused: rows.filter((r) => r.code !== 'SUCCESS'),
    results: rows
  }
}];
