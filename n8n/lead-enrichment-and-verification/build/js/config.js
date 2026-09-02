// EVERGREEN PARTNERSHIP ENGINE — STAGE 2: ENRICH AND VERIFY — CONFIG
// Everything you might want to change lives in this one node. Nothing else in this
// workflow needs editing.
//
// Any key left blank means that step is SKIPPED, not that the run fails. That is what
// lets this be demonstrated on a screen-share before a single credential exists.

// ---------------------------------------------------------------- Your working sheet
// The id is the long code in the sheet's web address:
// docs.google.com/spreadsheets/d/<THIS BIT>/edit
const SHEET_ID     = '';
const ORGS_TAB     = 'Organisations';   // the raw list, from scrapers and directories
const CONTACTS_TAB = 'Contacts';        // the enriched, verified output

// Column headings, exactly as they appear in row 1 of each tab.
const ORG_COLUMNS = {
  org_id:      'Org id',
  name:        'Organisation',
  category:    'Category',
  website:     'Website',
  county:      'County',
  city:        'City',
  state:       'State',
  phone:       'Phone',
  // Optional, and only used when Apollo is not configured: a name and address a scraper or
  // a researcher already put on the row.
  contact:       'Contact',
  contact_title: 'Contact title',
  contact_email: 'Contact email',
  source:      'Source',
  status:      'Status',
  enriched_at: 'Enriched at',
  contacts:    'Contacts found',
  notes:       'Notes'
};

const CONTACT_COLUMNS = {
  contact_id:   'Contact id',
  org_id:       'Org id',
  org_name:     'Organisation',
  category:     'Category',
  county:       'County',
  full_name:    'Full name',
  first_name:   'First name',
  title:        'Title',
  email:        'Email',
  email_status: 'Email status',
  verified_at:  'Verified at',
  phone:        'Phone',
  linkedin:     'LinkedIn',
  score:        'ICP score',
  tier:         'Tier',
  sending_list: 'Sending list',
  hold_reason:  'Hold reason',
  campaign:     'Campaign',
  pushed_at:    'Pushed at',
  updated_at:   'Last updated'
};

// ---------------------------------------------------------------- How much per run
const BATCH_SIZE           = 25;   // organisations enriched per run
const MAX_CONTACTS_PER_ORG = 3;    // more than this from one building reads as a blast
const REENRICH_AFTER_DAYS  = 90;   // an org already done is left alone for this long
const DAILY_CAP            = 200;  // hard ceiling on contacts pushed per run

// Only these org statuses are picked up. Anything else is treated as already handled.
const READY_STATUSES = ['', 'New', 'Ready', 'Re-enrich'];

// ---------------------------------------------------------------- Who we are looking for
// The segments in the brief. First rule whose words appear in the org name or the website
// wins, so put the more specific rule first.
const CATEGORY_RULES = [
  { category: 'Hospital / discharge planning',
    words: ['hospital', 'medical center', 'medical centre', 'health system', 'regional health',
            'discharge', 'inpatient', 'emergency department'] },
  { category: 'Addiction treatment',
    words: ['recovery', 'treatment center', 'treatment centre', 'detox', 'sober', 'substance',
            'rehab', 'opioid', 'addiction', 'withdrawal'] },
  { category: 'County social services',
    words: ['job and family services', 'jfs', 'county', 'department of', 'adamhs',
            'developmental disabilities', 'children services', 'public health'] },
  { category: 'Community non-profit',
    words: ['community action', 'united way', 'food bank', 'ministries', 'shelter', 'housing',
            'coalition', 'ymca', 'salvation army', 'foundation', 'nonprofit', 'non-profit'] },
  { category: 'Behavioral health provider',
    words: ['behavioral', 'behavioural', 'counseling', 'counselling', 'mental health',
            'psychiatric', 'wellness'] }
];

// Titles that can actually send a referral. The weight is the starting ICP score.
const TITLE_RULES = [
  { weight: 45, tier: 'A',
    words: ['discharge planner', 'discharge planning', 'director of case management',
            'case management director', 'transitions of care', 'utilization review',
            'utilisation review', 'social work director', 'director of social work',
            'care coordination manager'] },
  { weight: 40, tier: 'A',
    words: ['executive director', 'chief clinical', 'clinical director', 'director of nursing',
            'behavioral health director', 'director of behavioral', 'program director',
            'admissions director', 'director of admissions', 'county director'] },
  { weight: 30, tier: 'B',
    words: ['referral coordinator', 'intake coordinator', 'intake manager', 'care coordinator',
            'case manager', 'social worker', 'peer support', 'community outreach',
            'outreach coordinator', 'nurse manager', 'supervisor'] },
  { weight: 20, tier: 'B',
    words: ['director', 'manager', 'coordinator', 'administrator'] }
];

// Nobody in these roles can refer a patient. Dropped, not scored.
const EXCLUDE_TITLES = ['billing', 'accounts payable', 'recruiter', 'talent acquisition',
  'sales', 'account executive', 'marketing', 'it support', 'systems admin', 'volunteer',
  'intern', 'student', 'security'];

// A mailbox nobody owns. Held back — these are where bounce rates come from.
const ROLE_PREFIXES = ['info', 'admin', 'contact', 'office', 'hello', 'enquiries', 'inquiries',
  'support', 'billing', 'careers', 'jobs', 'hr', 'media', 'press', 'noreply', 'no-reply',
  'donate', 'volunteer', 'webmaster', 'postmaster'];

const MIN_ICP_SCORE = 35;    // below this a contact is kept in the sheet but not emailed
const REQUIRE_STATE = 'MW';  // blank to accept any state

// Never contact these, whatever else says otherwise. Domains or full addresses.
// Anything that replies "remove me" goes in here.
const SUPPRESSION = [
  'mentorship-alliance.example'
];

// ---------------------------------------------------------------- Apollo (people search)
// app.apollo.io -> Settings -> Integrations -> API. Blank = skip Apollo and use whatever
// contact details the raw list already carries.
const APOLLO_API_KEY = '';
const APOLLO_URL     = 'https://api.apollo.io/api/v1/mixed_people/search';

// ---------------------------------------------------------------- Email verification
// This is the KPI. Under 2% bounce is not a copywriting problem, it is this step.
// MillionVerifier by default; any verifier that returns a status string works.
const VERIFIER_API_KEY = '';
const VERIFIER_URL     = 'https://api.millionverifier.com/api/v3/';

// Which verdicts are allowed onto the sending list. Everything else is held.
const ACCEPT_STATUSES = ['ok', 'valid', 'deliverable'];
const RISKY_STATUSES  = ['catch_all', 'catch-all', 'accept_all', 'unknown', 'risky'];

// true = an address we could not verify is never emailed. Turning this off is how a
// campaign ends up at a 12% bounce rate and a burnt domain. Leave it true.
const HOLD_UNVERIFIED = true;

// Demo only. With no verifier key set, gives each address a deterministic fake verdict so
// the whole pipeline can be watched end to end before any account exists. While this is on
// the run is FORCED into preview — a made-up verdict can never reach a real campaign.
const DEMO_VERIFIER = false;

// ---------------------------------------------------------------- Optional AI classifier
// Only used on organisations the keyword rules could not place. Blank = keyword rules only,
// which is where most of them land anyway.
const AI_API_KEY = '';
const AI_URL     = 'https://api.anthropic.com/v1/messages';
const AI_MODEL   = 'claude-opus-5';

// ---------------------------------------------------------------- The sending engine
// Instantly: Settings -> Integrations -> API keys (a v2 key). Smartlead works the same way:
// change INSTANTLY_URL and the body built in "payload for the campaign".
const INSTANTLY_API_KEY     = '';
const INSTANTLY_URL         = 'https://api.instantly.ai/api/v2/leads';
const INSTANTLY_CAMPAIGN_ID = '';

// Optional: a different campaign per segment, so a hospital and a county office do not get
// the same email. Anything not listed here goes to INSTANTLY_CAMPAIGN_ID.
const CAMPAIGN_BY_CATEGORY = {
  // 'Hospital / discharge planning': 'campaign-uuid-here',
  // 'County social services':        'campaign-uuid-here'
};

// ---------------------------------------------------------------- Run summary
const ALERT_WEBHOOK_URL = '';   // Slack incoming webhook. Blank = no notification.

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_CAMPAIGN_ID blank -> PREVIEW. The sheet is written so you can read
//                                            every verdict and score, but nothing is pushed
//                                            to a campaign. Ships this way.
//   TEST_RUN true,  TEST_CAMPAIGN_ID set   -> TEST. Leads really are pushed, but to that
//                                            campaign instead of the live one.
//   TEST_RUN false                         -> LIVE.
const TEST_RUN         = true;
const TEST_CAMPAIGN_ID = '';

const DEMO_VERDICTS = DEMO_VERIFIER === true && VERIFIER_API_KEY.trim() === '';

let MODE = TEST_RUN !== true ? 'live'
  : (TEST_CAMPAIGN_ID.trim() !== '' ? 'test' : 'preview');

// Demo verdicts are not evidence. They cannot open the sending gate, whatever TEST_RUN says.
const FORCED_PREVIEW = DEMO_VERDICTS && MODE !== 'preview';
if (FORCED_PREVIEW) MODE = 'preview';

const CAMPAIGN_ID = MODE === 'test' ? TEST_CAMPAIGN_ID.trim() : INSTANTLY_CAMPAIGN_ID.trim();

return [{
  json: {
    sheet_id:        SHEET_ID,
    orgs_tab:        ORGS_TAB,
    contacts_tab:    CONTACTS_TAB,
    org_columns:     ORG_COLUMNS,
    contact_columns: CONTACT_COLUMNS,

    batch_size:           Number(BATCH_SIZE) || 25,
    max_contacts_per_org: Number(MAX_CONTACTS_PER_ORG) || 1,
    reenrich_after_days:  Number(REENRICH_AFTER_DAYS) || 90,
    daily_cap:            Number(DAILY_CAP) || 0,
    ready_statuses:       READY_STATUSES,

    category_rules: CATEGORY_RULES,
    title_rules:    TITLE_RULES,
    exclude_titles: EXCLUDE_TITLES,
    role_prefixes:  ROLE_PREFIXES,
    min_icp_score:  Number(MIN_ICP_SCORE) || 0,
    require_state:  REQUIRE_STATE.trim().toUpperCase(),
    suppression:    SUPPRESSION.map((s) => String(s).trim().toLowerCase()).filter(Boolean),

    apollo_api_key: APOLLO_API_KEY.trim(),
    apollo_url:     APOLLO_URL,

    verifier_api_key: VERIFIER_API_KEY.trim(),
    verifier_url:     VERIFIER_URL,
    accept_statuses:  ACCEPT_STATUSES.map((s) => s.toLowerCase()),
    risky_statuses:   RISKY_STATUSES.map((s) => s.toLowerCase()),
    hold_unverified:  HOLD_UNVERIFIED !== false,

    ai_api_key: AI_API_KEY.trim(),
    ai_url:     AI_URL,
    ai_model:   AI_MODEL,

    instantly_api_key:    INSTANTLY_API_KEY.trim(),
    instantly_url:        INSTANTLY_URL,
    campaign_id:          CAMPAIGN_ID,
    campaign_by_category: CAMPAIGN_BY_CATEGORY,

    alert_webhook_url: ALERT_WEBHOOK_URL.trim(),

    // derived flags — the gates read these, never the raw constants
    mode:         MODE,
    preview_only: MODE === 'preview',
    test_send:    MODE === 'test',
    live_send:    MODE === 'live',
    push_enabled: MODE !== 'preview' && INSTANTLY_API_KEY.trim() !== '' && CAMPAIGN_ID !== '',

    apollo_enabled:   APOLLO_API_KEY.trim() !== '',
    verifier_enabled: VERIFIER_API_KEY.trim() !== '',
    ai_enabled:       AI_API_KEY.trim() !== '',
    alert_enabled:    ALERT_WEBHOOK_URL.trim() !== '',
    demo_verdicts:    DEMO_VERDICTS,
    forced_preview:   FORCED_PREVIEW
  }
}];
