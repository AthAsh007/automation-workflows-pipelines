// No sheet configured yet: emit the built-in demo board rows instead. Rows come out keyed
// by the same HEADINGS a Google Sheets read would produce, so everything downstream is
// identical whether the data is real or fabricated. Every customer here is invented.
const cfg = $('config').first().json;
const cols = cfg.columns || {};
const rows = (cfg.demo_orders || []).map(function (o) {
  const row = {};
  for (const k of Object.keys(cols)) row[cols[k]] = (o[k] != null ? String(o[k]) : '');
  row._demo = true;
  return row;
});
return rows.map((r) => ({ json: r }));
