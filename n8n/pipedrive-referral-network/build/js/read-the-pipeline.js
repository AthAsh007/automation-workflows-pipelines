// Folds the three Pipedrive reads into ONE item shaped {deals, activities, deal_fields}.
//
// Everything downstream — the guard, the KPIs, the dashboard — reads this shape and never
// touches a Pipedrive response directly, so the demo pipeline and the real account are
// interchangeable from here on.
const cfg = $('config').first().json;

const deals = $('[cred] Pipedrive - open deals').first().json || {};
const acts = $('[cred] Pipedrive - activities').first().json || {};
const fields = $('[cred] Pipedrive - deal fields').first().json || {};

// A Pipedrive call that 402s, times out or is rate-limited comes through here as an object
// with success:false, or as nothing at all. Say which call failed rather than reporting an
// empty pipeline as "every deal is covered" — that reading is the one dangerous mistake
// this workflow can make.
const failures = [];
function rows(payload, what) {
  if (!payload || payload.success === false) {
    failures.push(what + ': ' + (payload && payload.error ? payload.error : 'no response'));
    return [];
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

const dealRows = rows(deals, 'deals');
const actRows = rows(acts, 'activities');
const fieldRows = rows(fields, 'deal fields');

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

const out = {
  source: 'pipedrive',
  read_at: new Date().toISOString(),
  failures: failures,
  deals: dealRows.filter(function (d) {
    if (String(d.status || 'open') !== 'open') return false;
    if (!cfg.pipeline_id) return true;
    return String(d.pipeline_id) === String(cfg.pipeline_id);
  }).map(normaliseDeal),
  activities: actRows.map(normaliseActivity),
  deal_fields: fieldRows.map(function (f) {
    return { key: f.key, name: f.name || '' };
  })
};

// An empty read that did not error is a real, reportable state. An empty read that DID
// error must not be allowed to look like one.
if (failures.length && out.deals.length === 0) {
  throw new Error('Pipedrive returned nothing usable (' + failures.join('; ') +
    '). Refusing to report an empty pipeline as fully covered.');
}

return [{ json: out }];
