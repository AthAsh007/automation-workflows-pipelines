// Turn a scraped row into something a data provider can be asked about.
//
// Apollo is only as good as the domain you hand it. "www.NorthgateHealth.example/about" and
// "https://northgate-health.example" are the same building, and asking twice costs twice. The
// category is decided by the keyword rules in config; anything the rules cannot place is
// flagged _needs_ai and the optional classifier picks it up.
//
// The two provider payloads are built here rather than inside the HTTP nodes, so the prompt
// and the search are readable — and editable — without opening a body expression.
const cfg = $('config').first().json;
const col = cfg.org_columns;

const text = (v) => String(v == null ? '' : v).trim();
const categories = (cfg.category_rules || []).map((r) => r.category);

// Only the specific titles are searched on. The catch-all "director"/"manager" rule exists to
// score whoever comes back, not to ask Apollo for every manager in a hospital.
const searchTitles = [];
for (const rule of (cfg.title_rules || []).slice(0, 3)) {
  for (const w of rule.words || []) if (searchTitles.length < 25) searchTitles.push(w);
}

return $input.all().map((entry) => {
  const item = entry.json;
  const row = item._row || {};

  const name = text(row[col.name]);

  const domain = text(row[col.website]).toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/[^a-z0-9.-]/g, '');

  const haystack = (name + ' ' + domain).toLowerCase();

  // A category already typed into the sheet by a human beats any rule here.
  let category = text(row[col.category]);
  let matchedOn = '';
  let confident = category !== '';

  if (!category) {
    for (const rule of cfg.category_rules || []) {
      const hit = (rule.words || []).find((w) => haystack.includes(String(w).toLowerCase()));
      if (hit) { category = rule.category; matchedOn = hit; confident = true; break; }
    }
  }

  if (!category) { category = 'Unclassified'; confident = false; }

  const aiSystem = 'You classify Midstate health and social-service organisations for a referral '
    + 'partnership programme. Answer with one JSON object and nothing else: '
    + '{"category": "<one of the listed categories, or Other>", "confidence": <0-1>, '
    + '"reason": "<12 words max>"}. Never invent a category that is not listed.';

  const aiUser = 'Categories: ' + categories.join(' | ') + ' | Other\n\n'
    + 'Organisation: ' + (name || '(no name)') + '\n'
    + 'Website: ' + (domain || '(none)') + '\n'
    + 'City/County: ' + [text(row[col.city]), text(row[col.county])].filter(Boolean).join(', ')
    + '\n\nWhich category is it?';

  const apolloBody = {
    q_organization_domains_list: domain ? [domain] : [],
    q_organization_name: domain ? undefined : name,
    person_titles: searchTitles,
    person_locations: cfg.require_state === 'MW' ? ['Midstate, US'] : undefined,
    page: 1,
    per_page: Math.max(Number(cfg.max_contacts_per_org || 3) * 3, 5)
  };

  return {
    json: {
      org_id:   item.org_id,
      org_name: name,
      domain:   domain,
      category: category,
      county:   text(row[col.county]),
      city:     text(row[col.city]),
      state:    text(row[col.state]).toUpperCase().slice(0, 2),
      phone:    text(row[col.phone]),
      source:   text(row[col.source]) || 'sheet',

      // whatever the raw list already knew — the fallback when Apollo is not configured
      _row: row,

      _category_matched_on: matchedOn,
      _category_confident:  confident,
      // Only an unclassified org is worth an AI call. The rest already have an answer.
      _needs_ai: !confident && cfg.ai_enabled === true,
      _domain_missing: domain === '',

      _ai_system: aiSystem,
      _ai_user:   aiUser,
      // JSON round-trip drops the undefined keys, which Apollo would otherwise reject.
      _apollo_body: JSON.parse(JSON.stringify(apolloBody))
    }
  };
});
