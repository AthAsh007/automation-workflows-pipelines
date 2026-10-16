// Builds the COQL query that reads the open deals, from the stage list in config.
//
// It is a node rather than an expression buried in the HTTP body so the query can be read on
// a failed run, and so simulate.js can check it before anything is imported. A COQL syntax
// error is otherwise a 400 with no indication of which stage name broke it.
//
// COQL notes: the field list is Zoho API names, `limit` is capped at 200 per call by Zoho,
// and a stage that does not exist in the org does not error — it just matches nothing, which
// is why OPEN_STAGES is worth checking against the org's own picklist on setup.
const cfg = $('config').first().json;

const stages = (cfg.open_stages || [])
  .map((s) => "'" + String(s).replace(/'/g, "\\'") + "'")
  .join(', ');

const limit = Math.min(Number(cfg.deal_page_limit || 200), 200);

const query = [
  'select id, Deal_Name, Stage, Owner, Amount, Closing_Date, Next_Step, Modified_Time',
  'from Deals',
  stages ? 'where Stage in (' + stages + ')' : "where id is not null",
  'limit ' + limit
].join(' ');

return [{
  json: {
    _authed: true,
    _access_token: $input.first().json._access_token,
    query,
    select_query: query
  }
}];
