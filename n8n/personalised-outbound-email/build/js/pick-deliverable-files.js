// Turn a GitHub directory listing into the exact URLs this email needs.
// A missing folder is normal, not an error: not every redesigned row has been
// pushed to this branch yet. It routes to "STOP: no deliverables in repo".
const cfg = $('config').first().json;
const lead = $('Loop over leads').first().json;

const api = 'https://api.github.com/repos/' + cfg.github_owner + '/' + cfg.github_repo + '/contents/';
const rawUrl = (path) => api + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.github_branch);

// The HTTP node splits a JSON array into items; a 404 body arrives as one item
// with a `message`. Both shapes land here, so normalise before reading.
const files = [];
for (const item of $input.all()) {
  const j = item.json || {};
  if (Array.isArray(j)) { files.push(...j); continue; }
  if (Array.isArray(j.data)) { files.push(...j.data); continue; }
  if (j.name && j.path) files.push(j);
}

const flat = files.filter((f) => f && f.type === 'file' && typeof f.name === 'string');
const named = (n) => flat.find((f) => f.name.toLowerCase() === n);

const notes = named('facelift-cro-and-pitch-notes.txt');
const seo   = named('seo-geo-tip.txt');

// "establishment-modern.pdf" -> "establishment-modern". The PDF is the canonical
// per-direction artefact; the .desktop/.mobile PNGs are previews of the same thing.
const directions = flat
  .filter((f) => /\.pdf$/i.test(f.name))
  .map((f) => f.name.replace(/\.pdf$/i, ''))
  .filter((d) => !/^(facelift|seo)/i.test(d))
  .sort();

const previews = {};
for (const d of directions) {
  const desktop = named(d.toLowerCase() + '.desktop.png');
  const pdf = named(d.toLowerCase() + '.pdf');
  previews[d] = {
    desktop_png:       desktop ? rawUrl(desktop.path) : '',
    desktop_png_name:  desktop ? desktop.name : '',
    desktop_png_bytes: desktop ? Number(desktop.size || 0) : 0,
    pdf:               pdf ? rawUrl(pdf.path) : '',
    pdf_name:          pdf ? pdf.name : '',
    pdf_bytes:         pdf ? Number(pdf.size || 0) : 0
  };
}

const hasDeliverables = Boolean(notes) && directions.length > 0;

return [{
  json: Object.assign({}, lead, {
    _has_deliverables: hasDeliverables,
    _deliverable_path: cfg.github_path + '/' + lead.domain,
    _file_count: flat.length,
    notes_url: notes ? rawUrl(notes.path) : '',
    seo_url:   seo ? rawUrl(seo.path) : '',
    directions,
    previews,
    _skip_reason: hasDeliverables
      ? ''
      : (flat.length === 0
          ? 'no folder for ' + lead.domain + ' on branch ' + cfg.github_branch
          : 'folder exists but has no pitch notes or no design directions')
  })
}];
