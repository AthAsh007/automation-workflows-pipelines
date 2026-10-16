// CLAY OUTBOUND SCORING ENGINE — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows ("01 score, enrich and route" and
// "02 classify replies and build the call list"). build.js regenerates both from this one
// file, and validate.js fails if they drift apart, so you never paste it between them.
//
// A blank key or id means that step is SKIPPED, never that the run fails. Both workflows run
// end to end on the invented demo prospects and demo replies, which is what lets this be
// shown on a screen-share before a single credential exists.

// ---------------------------------------------------------------- The safety switch
// Ships true. While it is true, nothing is written to Zoho and nothing is sent to a live
// Smartlead campaign or posted to the team: every payload is built in full and shown on a
// STOP node instead.
const TEST_RUN = true;
// Optional, only read while TEST_RUN is true. A Smartlead campaign id set here receives the
// pushes instead of the real campaigns (at most TEST_CAP leads). It can only ever REDIRECT a
// push, never cause a live one. Zoho is still not written in test mode.
const TEST_CAMPAIGN_ID = '';
const TEST_CAP = 3;

// ---------------------------------------------------------------- Mapping the Clay row
// Clay's HTTP API column posts one row as JSON to this workflow's webhook. You choose the key
// names in that column's body; list every name you might use for each field here, and the
// first one present on the row wins. Column names with spaces work as-is.
const CLAY_FIELDS = {
  clay_row_id:  ['clay_row_id', 'Clay Row ID', 'row_id', 'id'],
  first_name:   ['first_name', 'First Name', 'firstName'],
  last_name:    ['last_name', 'Last Name', 'lastName'],
  full_name:    ['full_name', 'Full Name', 'name', 'Name'],
  title:        ['title', 'Job Title', 'job_title', 'Title'],
  seniority:    ['seniority', 'Seniority'],
  email:        ['email', 'Work Email', 'work_email', 'Email'],
  phone:        ['phone', 'Mobile Phone', 'mobile_phone', 'Phone', 'Direct Phone'],
  linkedin_url: ['linkedin_url', 'LinkedIn URL', 'LinkedIn Profile', 'linkedin'],
  company:      ['company', 'Company Name', 'company_name', 'Company'],
  domain:       ['domain', 'Company Domain', 'company_domain', 'Website'],
  employees:    ['employees', 'Employee Count', 'employee_count', 'Company Size'],
  industry:     ['industry', 'Industry'],
  country:      ['country', 'Country', 'Location Country'],
  technologies: ['technologies', 'Technologies', 'Tech Stack', 'tech_stack'],
  // A Clay AI column's answer. If it names a persona from PERSONAS it is used as-is.
  ai_persona:   ['ai_persona', 'AI Persona', 'Persona']
};

// ---------------------------------------------------------------- Scoring (PLACEHOLDER)
// This table stands in for your own scoring method. It is a worked example, not your model:
// replace the rules, keep the shape. Each rule adds its points when its test matches;
// the total is clamped to 0..100.
//   equals    field value equals one of the values (case-insensitive)
//   contains  field value contains one of the words
//   between   a number between min and max, inclusive
//   any_of    a list field (technologies) contains any of the values
const SCORING = [
  { label: 'C-level',               field: 'seniority',    equals: ['c-level'],                  points: 30 },
  { label: 'VP',                    field: 'seniority',    equals: ['vp'],                       points: 25 },
  { label: 'Director / Head of',    field: 'seniority',    equals: ['director'],                 points: 20 },
  { label: 'Manager',               field: 'seniority',    equals: ['manager'],                  points: 10 },
  { label: 'Revenue-owning title',  field: 'title',        contains: ['sales', 'revenue', 'growth'], points: 10 },
  { label: 'Sweet-spot size',       field: 'employees',    between: [200, 1000],                 points: 25 },
  { label: 'Mid size',              field: 'employees',    between: [50, 199],                   points: 15 },
  { label: 'Large',                 field: 'employees',    between: [1001, 5000],                points: 15 },
  { label: 'Target industry',       field: 'industry',     contains: ['software', 'fintech', 'saas'], points: 20 },
  { label: 'Adjacent industry',     field: 'industry',     contains: ['logistics', 'healthcare'], points: 10 },
  { label: 'Uses a CRM we integrate', field: 'technologies', any_of: ['salesforce', 'hubspot', 'zoho'], points: 10 },
  { label: 'Core market',           field: 'country',      equals: ['united states', 'canada', 'united kingdom'], points: 5 }
];

// A disqualifier makes the prospect Reject whatever the score.
const DISQUALIFY = [
  { label: 'Student or intern',     field: 'title',     contains: ['intern', 'student'] },
  { label: 'Under 10 employees',    field: 'employees', between: [0, 9] },
  { label: 'Competitor',            field: 'domain',    equals: [] }
];

// Tier thresholds, highest first. Below the last one is Reject.
const TIERS = [
  { tier: 'A', min_score: 70 },
  { tier: 'B', min_score: 50 },
  { tier: 'C', min_score: 30 }
];

// Seniority when Clay did not send it, read off the title. First match wins.
const SENIORITY_FROM_TITLE = [
  { seniority: 'c-level',  words: ['chief', 'ceo', 'cro', 'cfo', 'coo', 'cto', 'founder', 'president'] },
  { seniority: 'vp',       words: ['vp', 'vice president'] },
  { seniority: 'director', words: ['director', 'head of'] },
  { seniority: 'manager',  words: ['manager', 'lead'] }
];

// Persona, first match on the title. A Clay AI column's answer (`ai_persona`) wins if it
// names one of these personas.
const PERSONAS = [
  { persona: 'Economic buyer',      words: ['ceo', 'founder', 'chief revenue', 'cro', 'vp sales', 'vp of sales', 'head of sales', 'sales director', 'director of sales'] },
  { persona: 'Operator',            words: ['revenue operations', 'revops', 'sales operations', 'operations'] },
  { persona: 'Technical evaluator', words: ['cto', 'it director', 'engineering', 'architect'] },
  { persona: 'Champion',            words: ['manager', 'lead'] }
];

// What a rep should do next, by tier and persona. `Tier|Persona` wins over `Tier|*`.
const RECOMMENDED_ACTION = {
  'A|Economic buyer': 'Call today, then sequence A',
  'A|*':              'Call within 24 hours, then sequence A',
  'B|*':              'Sequence B, call on any reply',
  'C|*':              'Nurture only: no enrichment, no sequence',
  'Reject|*':         'Do not contact'
};

// ---------------------------------------------------------------- Enrichment (the credits)
// Only these tiers are ever sent to paid enrichment, highest score first, and never more
// than ENRICH_BUDGET contacts in one run. The cap is enforced in code.
const ENRICH_TIERS  = ['A', 'B'];
const ENRICH_BUDGET = 4;
const CREDITS_PER_CONTACT = 1;
// Apollo's people/match reveals a verified work email (and a phone if asked). Blank key ->
// the demo enrichment stands in and the run says so.
const ENRICH_API_KEY = '';
const ENRICH_URL     = 'https://api.apollo.io/api/v1/people/match';
const REVEAL_PHONE   = false;   // phone reveals cost extra credits on most plans

// ---------------------------------------------------------------- Verification
// Every address is checked before it can reach a sending campaign. Anything the verifier did
// not answer counts as a hold: it fails closed.
const VERIFIER_API_KEY = '';
const VERIFIER_URL     = 'https://api.millionverifier.com/api/v3/';
const ACCEPT_STATUSES  = ['ok', 'valid', 'deliverable'];

// ---------------------------------------------------------------- Zoho CRM
// A Self Client in the Zoho API console gives a client id and secret; generate a refresh
// token with scope ZohoCRM.modules.ALL and ZohoCRM.coql.READ. The accounts base must match the
// data centre the org lives in (.com, .eu, .in, .com.au).
const ZOHO_CLIENT_ID     = '';
const ZOHO_CLIENT_SECRET = '';
const ZOHO_REFRESH_TOKEN = '';
const ZOHO_API_BASE      = 'https://www.zohoapis.com';
const ZOHO_ACCOUNTS_BASE = 'https://accounts.zoho.com';
const ZOHO_API_VERSION   = 'v8';
// Leads are upserted, matched on these fields in order, so a re-posted Clay row updates the
// lead instead of duplicating it.
const ZOHO_DUPLICATE_CHECK = ['Email'];
// Empty means Zoho's own workflow rules do NOT fire on these writes. Add 'workflow' to let them.
const ZOHO_TRIGGERS = [];
const LEAD_STATUS_BY_TIER = { A: 'Qualified - A', B: 'Qualified - B', C: 'Nurture' };
// Custom field API names from Zoho (Setup > Developer Hub > APIs > API names). Blank ->
// that field is not written.
const ZOHO_FIELDS = {
  fit_score: '',          // e.g. Fit_Score (number)
  tier: '',               // e.g. Fit_Tier (picklist A/B/C)
  persona: '',            // e.g. Persona
  recommended_action: '', // e.g. Recommended_Action
  clay_row_id: ''         // e.g. Clay_Row_ID
};
// Who owns a tier in Zoho (user ids). Blank -> Zoho's default owner.
const OWNER_BY_TIER = { A: '', B: '', C: '' };
// Reply states written back by workflow 02.
const REPLY_STATUS = {
  interested: 'Replied - Interested',
  not_now:    'Replied - Not now',
  referral:   'Replied - Referral',
  unsubscribe:'Unsubscribed',
  needs_human:'Replied - Needs review'
};

// ---------------------------------------------------------------- Smartlead
const SMARTLEAD_API_KEY  = '';
const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';
// One campaign per tier. Blank -> that tier is not pushed (C is never pushed).
const SMARTLEAD_CAMPAIGNS = { A: '', B: '' };
const SMARTLEAD_BATCH = 100;   // leads per request

// ---------------------------------------------------------------- Reply classification (02)
// OpenAI reads each reply into one class from REPLY_CLASSES. Blank key -> keyword rules only.
const OPENAI_API_KEY = '';
const OPENAI_MODEL   = 'gpt-4o-mini';
const OPENAI_URL     = 'https://api.openai.com/v1/chat/completions';
const REPLY_CLASSES  = ['interested', 'not_now', 'referral', 'unsubscribe', 'out_of_office', 'needs_human'];
// Below this confidence the model's answer is not trusted and a person reads the reply.
const MIN_AI_CONFIDENCE = 0.6;
// How many days out the follow-up task is due, by class.
const TASK_DUE_DAYS = { interested: 0, referral: 1, needs_human: 0, not_now: 60 };

// ---------------------------------------------------------------- Team notifications + call list
// A Slack (or Teams, or Google Chat) incoming-webhook URL. Blank -> shown, not posted.
const NOTIFY_WEBHOOK_URL = '';
// The morning call list: A-tier leads not yet contacted by phone, plus every interested or
// referral reply, ordered by who to ring first. Capped so it stays a list someone finishes.
const CALL_LIST_SIZE = 25;
const CALL_LIST_STATUSES = ['Replied - Interested', 'Replied - Referral', 'Qualified - A'];

// ---------------------------------------------------------------- Derived: do not edit below
const MODE = TEST_RUN !== true ? 'live' : (TEST_CAMPAIGN_ID.trim() !== '' ? 'test' : 'preview');
const ZOHO_AUTH_READY = ZOHO_CLIENT_ID.trim() !== '' && ZOHO_CLIENT_SECRET.trim() !== '' &&
                        ZOHO_REFRESH_TOKEN.trim() !== '';
const SMARTLEAD_READY = SMARTLEAD_API_KEY.trim() !== '';

const SETTINGS = {
  mode: MODE,
  test_campaign_id: TEST_CAMPAIGN_ID.trim(),
  test_cap: TEST_CAP,
  clay_fields: CLAY_FIELDS,
  scoring: SCORING,
  disqualify: DISQUALIFY,
  tiers: TIERS,
  seniority_from_title: SENIORITY_FROM_TITLE,
  personas: PERSONAS,
  recommended_action: RECOMMENDED_ACTION,
  enrich_tiers: ENRICH_TIERS,
  enrich_budget: ENRICH_BUDGET,
  credits_per_contact: CREDITS_PER_CONTACT,
  enrich_api_key: ENRICH_API_KEY,
  enrich_url: ENRICH_URL,
  reveal_phone: REVEAL_PHONE,
  verifier_api_key: VERIFIER_API_KEY,
  verifier_url: VERIFIER_URL,
  accept_statuses: ACCEPT_STATUSES,
  zoho_client_id: ZOHO_CLIENT_ID,
  zoho_client_secret: ZOHO_CLIENT_SECRET,
  zoho_refresh_token: ZOHO_REFRESH_TOKEN,
  zoho_api_base: ZOHO_API_BASE.replace(/\/+$/, ''),
  zoho_accounts_base: ZOHO_ACCOUNTS_BASE.replace(/\/+$/, ''),
  zoho_api_version: ZOHO_API_VERSION,
  zoho_duplicate_check: ZOHO_DUPLICATE_CHECK,
  zoho_triggers: ZOHO_TRIGGERS,
  lead_status_by_tier: LEAD_STATUS_BY_TIER,
  zoho_fields: ZOHO_FIELDS,
  owner_by_tier: OWNER_BY_TIER,
  reply_status: REPLY_STATUS,
  smartlead_api_key: SMARTLEAD_API_KEY,
  smartlead_api_base: SMARTLEAD_API_BASE.replace(/\/+$/, ''),
  smartlead_campaigns: SMARTLEAD_CAMPAIGNS,
  smartlead_batch: SMARTLEAD_BATCH,
  openai_api_key: OPENAI_API_KEY,
  openai_model: OPENAI_MODEL,
  openai_url: OPENAI_URL,
  reply_classes: REPLY_CLASSES,
  min_ai_confidence: MIN_AI_CONFIDENCE,
  task_due_days: TASK_DUE_DAYS,
  notify_webhook_url: NOTIFY_WEBHOOK_URL,
  call_list_size: CALL_LIST_SIZE,
  call_list_statuses: CALL_LIST_STATUSES,

  // Flags. Downstream nodes test these, never a key's emptiness.
  enrich_enabled: ENRICH_API_KEY.trim() !== '',
  verifier_enabled: VERIFIER_API_KEY.trim() !== '',
  zoho_auth_ready: ZOHO_AUTH_READY,
  zoho_enabled: ZOHO_AUTH_READY && MODE === 'live',
  smartlead_enabled: SMARTLEAD_READY && (MODE === 'live' || MODE === 'test'),
  ai_enabled: OPENAI_API_KEY.trim() !== '',
  notify_enabled: NOTIFY_WEBHOOK_URL.trim() !== '' && MODE !== 'preview'
};

// config sits IN the data path: whatever the trigger delivered is passed along untouched
// under `incoming`, one item in, one item out. A trigger with no payload (the schedule, a
// manual run) still produces one item, so $('config').first().json always resolves.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((payload) => ({ json: Object.assign({}, SETTINGS, { incoming: payload }) }));
