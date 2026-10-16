// "Active deals without future activities" — item 6's last bullet, and the report that
// proves the rule in item 4 actually holds.
//
// A rule without the report that measures it is a hope. This tab is the measurement, and
// it is written on every run whether it is empty or not: an empty Gaps tab that was written
// today is a result, an empty Gaps tab that was never written is a broken workflow.
const cfg = $('config').first().json;
const k = $('compute the KPIs').first().json;
const C = cfg.gap_columns;

const rows = (k.gap_rows || []).map(function (g) {
  const row = {};
  row[C.deal_id] = g.deal_id;
  row[C.deal] = g.deal;
  row[C.organisation] = g.organisation;
  row[C.person] = g.person;
  row[C.stage] = g.stage;
  row[C.owner] = g.owner;
  row[C.value] = g.value;
  row[C.last_activity] = g.last_activity;
  row[C.days_quiet] = g.days_quiet;
  row[C.action] = g.action;
  row[C.run_at] = k.run_at;
  return { json: row };
});

if (!rows.length) {
  const row = {};
  row[C.deal_id] = '';
  row[C.deal] = 'No open deal is missing a next activity';
  row[C.organisation] = '';
  row[C.person] = '';
  row[C.stage] = '';
  row[C.owner] = '';
  row[C.value] = '';
  row[C.last_activity] = '';
  row[C.days_quiet] = 0;
  row[C.action] = 'clean run';
  row[C.run_at] = k.run_at;
  return [{ json: row }];
}

return rows;
