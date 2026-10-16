// Reads the token, then builds one COQL query for everyone who belongs on today's list: the
// Lead_Status values in CALL_LIST_STATUSES. COQL returns at most 2000 rows a call and 200 by
// default; the list is capped far below that.
//@include lib-zoho-token.js
const cfg = $('config').first().json;
const t = readToken($input.first().json || {}, {});
if (!t._authed) return [{ json: t }];

const F = cfg.zoho_fields || {};
const fields = ['First_Name', 'Last_Name', 'Company', 'Phone', 'Email', 'Lead_Status', 'Designation', 'Modified_Time'];
if (F.fit_score) fields.push(F.fit_score);
if (F.tier) fields.push(F.tier);
if (F.recommended_action) fields.push(F.recommended_action);
const statuses = (cfg.call_list_statuses || []).map((s) => "'" + String(s).replace(/'/g, "\\'") + "'").join(', ');

return [{
  json: Object.assign(t, {
    _coql: {
      url: cfg.zoho_api_base + '/crm/' + cfg.zoho_api_version + '/coql',
      body: { select_query: 'select ' + fields.join(', ') + ' from Leads where Lead_Status in (' + statuses +
        ') order by Modified_Time desc limit 200' }
    }
  })
}];
