// COQL's answer as plain rows, in the same shape the demo pipeline uses, so ranking is one code
// path either way. An empty result is { } with no data key, which reads as an empty list.
const cfg = $('config').first().json;
const F = cfg.zoho_fields || {};
const res = $input.first().json || {};
const rows = (res.data || []).map((l) => ({
  name: [l.First_Name, l.Last_Name].filter(Boolean).join(' '),
  company: l.Company || '',
  title: l.Designation || '',
  phone: l.Phone || '',
  email: l.Email || '',
  status: l.Lead_Status || '',
  score: F.fit_score ? Number(l[F.fit_score] || 0) : null,
  action: F.recommended_action ? (l[F.recommended_action] || '') : '',
  modified: l.Modified_Time || ''
}));
return [{ json: { source: 'Zoho CRM', rows: rows, more: !!(res['info'] && res['info'].more_records) } }];
