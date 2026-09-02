// Bump the chase counter on every row we just nudged, so the second reminder is the
// last one and nobody gets a daily drip about the same job.
const cfg = $('config').first().json;
const C = cfg.columns;
const g = $('write the nudge').first().json;
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

return (g.items || []).map((it) => {
  const row = {};
  row[C.ref]         = it.ref;
  row[C.chases_sent] = (Number(it.chases_sent) || 0) + 1;
  row[C.notes]       = [it.notes, stamp + ': chased ' + it.owner].filter(Boolean).join(' | ').slice(0, 900);
  return { json: Object.assign({}, row, { _ref: it.ref, _owner: it.owner }) };
});
