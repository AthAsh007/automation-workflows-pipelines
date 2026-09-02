// Turns whatever the ATS posted into one job spec, using the ATS_FIELDS.job map in config.
// Bullhorn sends `publicDescription` and `address.city`; CEIPAL sends `job_description` and
// `city`. Only the map changes between them — nothing downstream of this node knows which
// ATS it is talking to, which is the whole point of having the map.
const cfg = $('config').first().json;
const map = (cfg.ats_fields && cfg.ats_fields.job) || {};

// A webhook body arrives under .body; a manual run may have the job pasted at the top level;
// some ATSs wrap the payload in `data` or an array of one.
const raw0 = $input.first().json || {};
let src = raw0.body !== undefined ? raw0.body : raw0;
if (src && src.data && typeof src.data === 'object') src = src.data;
if (Array.isArray(src)) src = src[0] || {};
if (src && Array.isArray(src.jobOrders)) src = src.jobOrders[0] || {};

// Dotted paths, because every ATS nests something. Missing links give undefined, not a throw.
const dig = (obj, path) => {
  if (!path) return undefined;
  return String(path).split('.').reduce(
    (o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
};

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Skills arrive as an array, a comma string, a semicolon string, or an array of
// {id,name} objects. All four are the same list.
const asList = (v) => {
  if (!v) return [];
  const flat = Array.isArray(v) ? v : String(v).split(/[,;|]/);
  return flat
    .map((x) => (x && typeof x === 'object' ? (x.name || x.label || x.value || '') : x))
    .map((x) => str(x).toLowerCase())
    .filter((x) => x.length > 1);
};

const title = str(dig(src, map.title) || src.title || src.job_title || src.name);
const ats_job_id = str(dig(src, map.id) || src.id || src.job_id || src.jobOrderId);

const description = str(dig(src, map.description) || src.description || src.job_description);
const required = asList(dig(src, map.skills) || src.skills || src.required_skills);
const nice = asList(src.nice_to_have || src.preferred_skills);

// Pay rate can be "$22.50/hr", "22.50", 22.5, or a {min,max} object.
const payRaw = dig(src, map.pay_rate);
let pay_rate = null;
if (payRaw !== undefined && payRaw !== null && payRaw !== '') {
  const n = typeof payRaw === 'object'
    ? Number(payRaw.max || payRaw.min || 0)
    : Number(String(payRaw).replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n) && n > 0) pay_rate = n;
}

const city = str(dig(src, map.city));
const state = str(dig(src, map.state)).toUpperCase().slice(0, 2);

// The recruiter is who the candidate will be booked with. A job order with no recruiter is
// still usable — it falls back to the client's default — but it is worth saying so.
const recruiter_name = str(dig(src, map.recruiter)) || 'the recruiting team';
const recruiter_email = str(dig(src, map.recruiter_mail)).toLowerCase();

// The idempotency key for the campaign. An ATS that delivers the same webhook three times
// (Bullhorn does, on subscription redelivery) produces one campaign, because this key is
// the same all three times and the unique index on campaigns rejects the second and third.
const day = new Date().toISOString().slice(0, 10);
const idempotency_key = ['campaign', cfg.client_slug, ats_job_id, day].join(':');

const problems = [];
if (!ats_job_id) problems.push('no job id in the payload');
if (!title) problems.push('no job title');
if (!required.length && !description) {
  problems.push('nothing to match on — neither a skill list nor a description');
}

// Whether the AI reader is worth calling. A job order that already carries a real skill
// list does not need a model; one that carries three paragraphs of prose does, because
// matching 20,000 candidates against an empty skill list finds nobody.
const thinSkills = required.length <= Number(cfg.min_skills_before_ai || 0);
const needsAi = thinSkills && description.length > 80;

return [{
  json: {
    _job_usable: problems.length === 0,
    _problems: problems,
    _ats_vendor: cfg.ats_vendor,
    _received_keys: Object.keys(src || {}).slice(0, 25),
    _needs_ai: needsAi,
    _ai_worth_calling: needsAi && cfg.ai_enabled,
    _skills_from_ats: required.length,

    client_id: cfg.client_id,
    client_slug: cfg.client_slug,
    ats_job_id: ats_job_id,
    title: title,
    description: description.slice(0, 4000),
    required_skills: required,
    nice_to_have: nice,
    city: city,
    state: state,
    pay_rate: pay_rate,
    shift: str(dig(src, map.shift)),
    employment_type: str(dig(src, map.employment)),
    recruiter_name: recruiter_name,
    recruiter_email: recruiter_email,
    _recruiter_missing: recruiter_email === '',
    idempotency_key: idempotency_key,
    campaign_name: (title || 'Job') + ' — ' + (city || state || 'any') + ' — ' + day,
    raw: src
  }
}];
