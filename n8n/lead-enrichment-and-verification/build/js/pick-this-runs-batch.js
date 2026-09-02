// Decide which organisations this run works on.
//
// Three things happen here and nowhere else: rows already enriched recently are skipped,
// the same organisation appearing twice in the raw list is collapsed to one, and the run is
// capped at BATCH_SIZE. The cap is what keeps Apollo credits and verifier spend predictable
// — a scraper that dumps 4,000 rows in overnight does not turn into 4,000 API calls at 07:00.
const cfg = $('config').first().json;
const col = cfg.org_columns;
const rows = $input.all().map((i) => i.json);

const ready = (cfg.ready_statuses || []).map((s) => String(s).trim().toLowerCase());
const staleMs = Number(cfg.reenrich_after_days || 90) * 24 * 60 * 60 * 1000;
const now = Date.now();

const key = (row) => {
  const site = String(row[col.website] || '').toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
  if (site) return 'd:' + site;
  return 'n:' + String(row[col.name] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const seen = new Set();
const picked = [];
const skipped = { not_ready: 0, too_recent: 0, duplicate: 0, no_name: 0 };

for (const row of rows) {
  const name = String(row[col.name] || '').trim();
  if (!name) { skipped.no_name++; continue; }

  const status = String(row[col.status] || '').trim().toLowerCase();
  if (ready.length && !ready.includes(status)) { skipped.not_ready++; continue; }

  const enriched = String(row[col.enriched_at] || '').trim();
  if (enriched && status !== 're-enrich') {
    const when = Date.parse(enriched);
    if (!isNaN(when) && now - when < staleMs) { skipped.too_recent++; continue; }
  }

  const k = key(row);
  if (seen.has(k)) { skipped.duplicate++; continue; }
  seen.add(k);

  picked.push(row);
  if (picked.length >= Number(cfg.batch_size || 25)) break;
}

// The read node has alwaysOutputData on, so a tab holding only a header row arrives here as
// one empty item rather than as nothing at all. Telling those two apart is the difference
// between "your sheet is empty" and "your workflow is broken".
const emptyTab = rows.length === 0
  || rows.every((r) => Object.keys(r).filter((k) => String(r[k] || '').trim() !== '').length === 0);

const stats = {
  _rows_in_sheet: emptyTab ? 0 : rows.length,
  _picked: picked.length,
  _skipped: skipped,
  _sheet_empty: emptyTab,
  _tab: cfg.orgs_tab,
  _has_work: picked.length > 0
};

if (!picked.length) return [{ json: stats }];

return picked.map((row, idx) => ({
  json: Object.assign({}, stats, {
    _row: row,
    // A stable id, so a re-run updates the same row instead of appending a second one.
    org_id: String(row[col.org_id] || '').trim()
      || 'ORG-' + key(row).replace(/[^a-z0-9]/g, '').slice(0, 24) || 'ORG-' + (idx + 1)
  })
}));
