// Folds every page of the three Pipedrive reads into ONE item shaped
// {deals, activities, deal_fields, read_ok, failures}.
//
// The reads are paginated by the HTTP nodes themselves (500 rows a page, Pipedrive's
// maximum), so each node hands over one item PER PAGE. Everything downstream — the guard,
// the KPIs, the dashboard — reads this shape and never touches a Pipedrive response
// directly, so the demo pipeline and the real account are interchangeable from here on.
//
// The one dangerous mistake this workflow can make is reporting a pipeline it failed to
// read as a pipeline with nothing wrong in it. So a read is only OK when EVERY page came
// back success:true AND the last page says there is nothing more. A 402, a timeout, a
// rate limit, or MAX_PAGES cutting the read short all set read_ok = false, and the run is
// routed to the failure alert instead of the rule.
const cfg = $('config').first().json;

const failures = [];

function pagesOf(nodeName) {
  try { return $(nodeName).all().map(function (i) { return i.json || {}; }); }
  catch (e) { return []; }
}

function rows(nodeName, what, paginated) {
  const pages = pagesOf(nodeName);
  if (!pages.length) { failures.push(what + ': no response'); return []; }
  const out = [];
  let bad = 0;
  pages.forEach(function (p) {
    if (!p || p.success !== true) {
      bad++;
      const msg = p && (p.error && (p.error.message || p.error)) || (p && p.error_info) ||
        'no usable response';
      if (bad === 1) failures.push(what + ': ' + String(msg).slice(0, 200));
      return;
    }
    (Array.isArray(p.data) ? p.data : []).forEach(function (r) { out.push(r); });
  });
  const last = pages[pages.length - 1] || {};
  const more = last.additional_data && last.additional_data.pagination &&
    last.additional_data.pagination.more_items_in_collection === true;
  if (!bad && more) {
    failures.push(what + ': stopped at ' + pages.length + ' page(s) with more still to read' +
      (paginated ? ' — raise MAX_PAGES in config' : ''));
  }
  return out;
}

const dealRows = rows('[cred] Pipedrive - open deals', 'deals', true);
const actRows = rows('[cred] Pipedrive - activities', 'activities', true);
const fieldRows = rows('[cred] Pipedrive - deal fields', 'deal fields', false);

const stageById = {};
cfg.stages.forEach(function (s) { stageById[String(s.id)] = s; });

function normaliseDeal(d) {
  const stage = stageById[String(d.stage_id)] || { name: 'Unknown stage', next_type: '',
    due_in_days: 7, stale_days: 30, subject: 'Next step' };
  return {
    id: d.id,
    title: d.title || ('Deal ' + d.id),
    stage_id: d.stage_id,
    stage: stage.name,
    status: d.status || 'open',
    value: Number(d.value || 0),
    currency: d.currency || '',
    owner_id: (d.user_id && d.user_id.id) || d.user_id || null,
    owner: (d.user_id && d.user_id.name) || 'Unassigned',
    org_id: (d.org_id && d.org_id.value) || d.org_id || null,
    organisation: (d.org_id && d.org_id.name) || d.org_name || '',
    person_id: (d.person_id && d.person_id.value) || d.person_id || null,
    person: (d.person_id && d.person_id.name) || d.person_name || '',
    add_time: d.add_time || null,
    stage_change_time: d.stage_change_time || d.add_time || null,
    // Kept whole so the result fields can be read by key later, once the PHI check has
    // said which keys are allowed.
    raw: d
  };
}

function normaliseActivity(a) {
  return {
    id: a.id,
    deal_id: a.deal_id || null,
    type: a.type || '',
    subject: a.subject || '',
    note: a.note || '',
    done: a.done === true || a.done === 1,
    due_date: a.due_date || null,
    due_time: a.due_time || '',
    marked_done_time: a.marked_done_time || null,
    add_time: a.add_time || null,
    owner_id: a.user_id || null
  };
}

// Pagination by offset can return the same row twice if a deal changes while the pages are
// being read. De-duplicate by id so a deal is never counted, or acted on, twice.
function uniqueById(list) {
  const seen = {};
  return list.filter(function (r) {
    const k = String(r && r.id);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

const deals = uniqueById(dealRows).filter(function (d) {
  if (String(d.status || 'open') !== 'open') return false;
  if (!cfg.pipeline_id) return true;
  return String(d.pipeline_id) === String(cfg.pipeline_id);
}).map(normaliseDeal);

return [{
  json: {
    source: 'pipedrive',
    read_at: new Date().toISOString(),
    read_ok: failures.length === 0,
    failures: failures,
    pages: {
      deals: pagesOf('[cred] Pipedrive - open deals').length,
      activities: pagesOf('[cred] Pipedrive - activities').length
    },
    deals: deals,
    activities: uniqueById(actRows).map(normaliseActivity),
    deal_fields: fieldRows.map(function (f) {
      return { key: f.key, name: f.name || '' };
    })
  }
}];
