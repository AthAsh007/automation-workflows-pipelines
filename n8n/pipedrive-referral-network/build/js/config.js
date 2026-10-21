// PIPEDRIVE REFERRAL NETWORK — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows and is generated from one file, so the
// activity guard and the reporting run can never disagree about a stage name.
//
// Any key left blank means that step is SKIPPED, not that the run fails. That is what lets
// this be demonstrated on a screen-share before a single credential exists.

// ---------------------------------------------------------------- Your Pipedrive account
// COMPANY_DOMAIN is the first part of your Pipedrive web address:
//   https://<THIS BIT>.pipedrive.com
// API_TOKEN is Settings -> Personal preferences -> API. Blank = nothing is read or written
// and the run falls back to the built-in demo pipeline (see DEMO_PIPELINE).
const COMPANY_DOMAIN = '';
const API_TOKEN      = '';

// The pipeline this runs against. Leave PIPELINE_ID blank to work every open deal in the
// account; set it once you have more than one pipeline.
const PIPELINE_ID = '';

// Every read is paginated (500 per page, Pipedrive's maximum). MAX_PAGES is a safety stop:
// 20 pages = 10,000 open deals. If a read is cut off by it, the run is reported as a FAILED
// read, never as a smaller pipeline — a half-read pipeline reads as "covered" by omission.
const MAX_PAGES = 20;

// ---------------------------------------------------------------- The pipeline's stages
// In order. `id` is Pipedrive's numeric stage id — read it off the URL when you open the
// stage's settings. The rest is this workflow's rule for that stage.
//
//   next_type    the activity type key created when a deal in this stage has no next step
//   due_in_days  how far ahead that activity is scheduled
//   subject      what the activity is called, so a rep reads it and knows what to do
//   stale_days   no activity of ANY kind for this long -> the deal is reported as stalling
//
// A stage with next_type '' is one where the guard deliberately does nothing.
const STAGES = [
  { id: 1, name: 'Target Identified',      next_type: 'initial_call',
    due_in_days: 1,  stale_days: 14,
    subject: 'First outreach call — introduce Trialbridge and the referral network' },
  { id: 2, name: 'Outreach Started',       next_type: 'follow_up_call',
    due_in_days: 3,  stale_days: 10,
    subject: 'Follow-up call — no answer yet on the first attempt' },
  { id: 3, name: 'Contact Made',           next_type: 'follow_up_call',
    due_in_days: 5,  stale_days: 14,
    subject: 'Follow up — find the decision maker for referrals' },
  { id: 4, name: 'Decision Maker Engaged', next_type: 'physician_meeting',
    due_in_days: 7,  stale_days: 14,
    subject: 'Book the physician meeting' },
  { id: 5, name: 'Meeting Scheduled',      next_type: 'materials_drop_off',
    due_in_days: 2,  stale_days: 21,
    subject: 'Confirm the meeting and drop off study materials' },
  { id: 6, name: 'Interested / Follow-Up', next_type: 'referral_follow_up',
    due_in_days: 7,  stale_days: 21,
    subject: 'Follow up with an interested practice — do not let this go quiet' },
  { id: 7, name: 'Referral Partner',       next_type: 'thank_you_call',
    due_in_days: 3,  stale_days: 30,
    subject: 'Thank-you call — confirm the referral process is working for them' },
  { id: 8, name: 'Actively Referring',     next_type: 'referral_follow_up',
    due_in_days: 30, stale_days: 45,
    subject: 'Monthly referral partner check-in' }
];

// A referral partner with no activity of any kind for this long gets a re-engagement
// activity instead of the routine check-in. This is the "inactive referral partner"
// automation.
//
// It is measured on activity, not on referrals, because referral counts only exist once
// RESULT_FIELDS are wired up and this has to work on day one. Once they are wired, the
// weekly report's "Last referral" column is the sharper signal — read both.
const REENGAGE_AFTER_DAYS = 60;
const REENGAGE_TYPE       = 're_engagement';
const REENGAGE_SUBJECT    = 'Re-engagement — no referrals from this practice recently';

// Activity type keys, exactly as they appear in Pipedrive (Settings -> Activity types ->
// each type has a key, not the label). The guard creates activities of these types only.
const ACTIVITY_TYPES = {
  initial_call:       'initial_call',
  follow_up_call:     'follow_up_call',
  email:              'email',
  office_visit:       'office_visit',
  materials_drop_off: 'materials_drop_off',
  physician_meeting:  'physician_meeting',
  practice_manager:   'practice_manager_meeting',
  lunch_meeting:      'lunch_meeting',
  referral_follow_up: 'referral_follow_up',
  thank_you_call:     'thank_you_call',
  re_engagement:      're_engagement'
};

// ---------------------------------------------------------------- The rule
// NO OPEN OPPORTUNITY SHOULD EXIST WITHOUT A NEXT ACTIVITY.
//
// A deal counts as covered when it has at least one activity that is not done and is due
// no later than HORIZON_DAYS from now. An activity scheduled eleven months out is not a
// next step, it is a way of passing the check.
const HORIZON_DAYS = 45;

// A deal created in the last GRACE_HOURS is left alone — the rep is probably still typing.
const GRACE_HOURS = 4;

// Hard ceiling on activities created per run. A misconfigured stage list should cost you
// forty stray activities, not two thousand.
const DAILY_CAP = 40;

// ---------------------------------------------------------------- Business days
// Every "days" setting in this node is counted in BUSINESS days: due dates never land on a
// weekend or a holiday, and a task due on Friday is not "3 days overdue" on Monday morning.
// WORK_DAYS uses 0 = Sunday ... 6 = Saturday. HOLIDAYS are 'YYYY-MM-DD' strings.
const WORK_DAYS = [1, 2, 3, 4, 5];
const HOLIDAYS  = [];

// ---------------------------------------------------------------- Escalation tiers
// A deal whose next activity is overdue does NOT get another one stacked on top of it.
// Stacking is how a rep ends up with 60 open tasks and stops reading any of them. Instead:
//
//   overdue OVERDUE_DAYS or more        -> tier "owner":   the rep's own morning DM
//   overdue MANAGER_AFTER_DAYS or more  -> tier "manager": the management escalation
//
// The manager is told about a deal ONCE, then again only if it is still open after
// REMIND_MANAGER_AFTER_DAYS — a daily repeat of the same twelve deals is how an escalation
// channel gets muted. Memory lives in the workflow's own static data; nothing to set up.
const OVERDUE_DAYS              = 3;
const MANAGER_AFTER_DAYS        = 7;
const REMIND_MANAGER_AFTER_DAYS = 5;

// ---------------------------------------------------------------- Rep workload
// New activities are load-levelled: if a rep already has MAX_PER_OWNER_PER_DAY open
// activities due on the target day, the new one moves to the next business day with room,
// up to LEVEL_WITHIN_DAYS later. Forty tasks dumped on one Monday get done on none of them.
const MAX_PER_OWNER_PER_DAY = 8;
const LEVEL_WITHIN_DAYS     = 3;

// Deals worth more than this that have gone stale are called out separately, which is the
// "management notification for high-priority opportunities" automation.
const HIGH_PRIORITY_VALUE = 25000;

// ---------------------------------------------------------------- The PHI boundary
// Pipedrive is Trialbridge's physician/practice business-development CRM. It is NOT the
// patient clinical database. Patient screening and clinical information live elsewhere.
//
// This workflow refuses to read or write any field whose name contains one of these words.
// It is a hard stop, not a warning: the run fails loudly rather than quietly moving a
// diagnosis into a CRM that was never scoped to hold one.
const FORBIDDEN_FIELD_WORDS = [
  'diagnosis', 'diagnoses', 'medication', 'prescription', 'symptom', 'medical record',
  'mrn', 'chart number', 'date of birth', 'dob', 'ssn', 'social security', 'insurance id',
  'member id', 'screening response', 'screening answer', 'eligibility answer', 'lab result',
  'patient name', 'patient email', 'patient phone', 'patient address', 'phi'
];

// Aggregate recruitment results ARE in scope — counts, never people. These are Pipedrive
// deal custom-field keys (Settings -> Data fields -> the 40-character key).
// Blank means that number is not tracked yet and is reported as "not captured" rather than
// silently as a zero.
const RESULT_FIELDS = {
  referrals_sent:      '',   // patient referrals from this practice
  prescreen_qualified: '',   // referrals that passed pre-screen
  sent_to_site:        '',   // patients sent on to a research site
  screened:            '',   // patients screened at the site
  randomized:          ''    // patients randomised / enrolled
};

// Deal custom fields the guard is allowed to read for context. Same key format.
const CONTEXT_FIELDS = {
  specialty:     '',
  territory:     '',
  study_code:    '',
  practice_size: ''
};

// ---------------------------------------------------------------- Reporting (workflow 02)
// The management dashboard. Pipedrive Insights covers the single-object counts; this covers
// the funnel that spans deals, activities and aggregate results, which Insights cannot.
// Blank sheet id = the numbers are computed and posted to chat, but nothing is written down.
const SHEET_ID        = '';
const DASHBOARD_TAB   = 'Dashboard';    // one row per run, so the trend is the sheet history
const GAPS_TAB        = 'Gaps';         // active deals with no future activity, one row each
const BY_REP_TAB      = 'By rep';       // results by marketing representative
const BY_PRACTICE_TAB = 'By practice';  // results by physician / practice

const DASHBOARD_COLUMNS = {
  run_at:              'Run at',
  open_deals:          'Open deals',
  covered:             'With a next activity',
  gaps:                'Without a next activity',
  coverage_pct:        'Coverage %',
  overdue:             'Overdue activities',
  outreach_attempts:   'Outreach attempts',
  conversations:       'Meaningful conversations',
  meetings:            'Meetings',
  new_partners:        'New referral partners',
  active_partners:     'Actively referring practices',
  referrals_sent:      'Patient referrals',
  prescreen_qualified: 'Pre-screen qualified',
  sent_to_site:        'Sent to site',
  screened:            'Screened',
  randomized:          'Randomised / enrolled',
  referral_to_screen:  'Referral to screen %',
  screen_to_random:    'Screen to randomised %',
  stalled:             'Stalled deals',
  high_priority:       'High-priority stalled'
};

const GAP_COLUMNS = {
  deal_id:       'Deal id',
  deal:          'Deal',
  organisation:  'Practice',
  person:        'Physician / contact',
  stage:         'Stage',
  owner:         'Rep',
  value:         'Value',
  last_activity: 'Last activity',
  days_quiet:    'Days quiet',
  action:        'What the guard did',
  run_at:        'Run at'
};

const BY_REP_COLUMNS = {
  rep:               'Rep',
  open_deals:        'Open deals',
  gaps:              'Without a next activity',
  overdue:           'Overdue activities',
  outreach_attempts: 'Outreach attempts',
  conversations:     'Meaningful conversations',
  meetings:          'Meetings',
  new_partners:      'New referral partners',
  referrals_sent:    'Patient referrals',
  run_at:            'Run at'
};

const BY_PRACTICE_COLUMNS = {
  organisation:        'Practice',
  stage:               'Stage',
  owner:               'Rep',
  referrals_sent:      'Patient referrals',
  prescreen_qualified: 'Pre-screen qualified',
  sent_to_site:        'Sent to site',
  screened:            'Screened',
  randomized:          'Randomised / enrolled',
  last_referral:       'Last referral',
  run_at:              'Run at'
};

// Which activity types count as which KPI. An "outreach attempt" is any attempt; a
// "meaningful conversation" is one that was marked done with an outcome that was not a
// no-answer. The distinction is the whole point of the dashboard — attempts are effort,
// conversations are progress.
const OUTREACH_TYPES     = ['initial_call', 'follow_up_call', 'email', 'office_visit',
                            'materials_drop_off', 're_engagement'];
const CONVERSATION_TYPES = ['initial_call', 'follow_up_call', 'referral_follow_up',
                            'thank_you_call', 'practice_manager_meeting'];
const MEETING_TYPES      = ['physician_meeting', 'practice_manager_meeting', 'lunch_meeting',
                            'office_visit'];

// Activity notes that mean "nobody was reached", so the attempt is not counted as a
// conversation. Matched case-insensitively against the note and the subject.
const NO_ANSWER_WORDS = ['no answer', 'voicemail', 'left message', 'left a message',
                         'gatekeeper', 'not available', 'call back later', 'busy signal'];

// Stages that mean the practice is a partner, for the "new referral partners" count.
const PARTNER_STAGES = ['Referral Partner', 'Actively Referring'];

const REPORT_WINDOW_DAYS = 7;   // the reporting period. 7 = the weekly management report.

// Week-over-week: the report compares itself with the newest Dashboard row that is at least
// BASELINE_MIN_DAYS old, read back from the sheet. No sheet = no comparison, said so.
const BASELINE_MIN_DAYS = 5;

// Rep coaching flags in the weekly report. A rep is flagged when:
//   - COACH_MIN_ATTEMPTS+ attempts but under COACH_MIN_CONVERSATION_PCT% became
//     conversations (effort without progress — a list or a script problem), or
//   - over COACH_MAX_GAP_PCT% of their open deals have no next activity (follow-up slipping).
const COACH_MIN_ATTEMPTS         = 6;
const COACH_MIN_CONVERSATION_PCT = 40;
const COACH_MAX_GAP_PCT          = 30;

// ---------------------------------------------------------------- Notifications
const ALERT_WEBHOOK_URL   = '';   // Slack incoming webhook, the team run summary. Also
                                  // where a FAILED Pipedrive read is reported.
const MANAGER_WEBHOOK_URL = '';   // Optional second webhook for management escalations.
                                  // Blank = escalations go to ALERT_WEBHOOK_URL instead.

// Per-rep morning DMs in Slack: each owner gets only their own deals — what was scheduled
// for them, what they are overdue on. Needs a Slack credential on "[cred] Slack - DM each
// owner" (bot scope chat:write), SLACK_DMS = true, and the map below.
// OWNER_SLACK_IDS maps a Pipedrive user id to a Slack member id: { 11: 'U01ABCDEF' }.
// Reps not in the map are simply not DM'd — they are still in the team summary.
const SLACK_DMS       = false;
const OWNER_SLACK_IDS = {};

// ---------------------------------------------------------------- Demo mode
// With no API token set, builds a deterministic fake pipeline — eight stages, twenty-odd
// deals, a realistic spread of covered, uncovered, overdue and stalled — so the whole rule
// can be watched end to end before an account exists. While this is on the run is FORCED
// into preview: a fabricated deal can never produce a real Pipedrive write.
const DEMO_PIPELINE = true;

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_OWNER_ID blank -> PREVIEW. Every activity the guard would create
//                                          is listed with its deal, stage and due date, and
//                                          nothing is written to Pipedrive. Ships this way.
//   TEST_RUN true,  TEST_OWNER_ID set   -> TEST. Activities really are created, but all
//                                          assigned to that one user, so a real rep's task
//                                          list is not touched while you are testing.
//   TEST_RUN false                      -> LIVE. Activities are created and assigned to the
//                                          deal's own owner.
const TEST_RUN      = true;
const TEST_OWNER_ID = '';

const DEMO_DATA = DEMO_PIPELINE === true && API_TOKEN.trim() === '';

let MODE = TEST_RUN !== true ? 'live'
  : (String(TEST_OWNER_ID).trim() !== '' ? 'test' : 'preview');

// Demo deals are not evidence. They cannot open the write gate, whatever TEST_RUN says.
const FORCED_PREVIEW = DEMO_DATA && MODE !== 'preview';
if (FORCED_PREVIEW) MODE = 'preview';

const OWNER_SLACK = {};
Object.keys(OWNER_SLACK_IDS || {}).forEach(function (k) {
  const v = String(OWNER_SLACK_IDS[k] || '').trim();
  if (v) OWNER_SLACK[String(k)] = v;
});

const BASE_URL = 'https://' + (COMPANY_DOMAIN.trim() || 'api') + '.pipedrive.com/api/v1';

// Every field key this workflow is configured to touch, gathered here so the PHI check runs
// in one place rather than at each use.
const TOUCHED_FIELDS = []
  .concat(Object.keys(RESULT_FIELDS).map(function (k) {
    return { role: 'result', name: k, key: RESULT_FIELDS[k] };
  }))
  .concat(Object.keys(CONTEXT_FIELDS).map(function (k) {
    return { role: 'context', name: k, key: CONTEXT_FIELDS[k] };
  }))
  .filter(function (f) { return String(f.key || '').trim() !== ''; });

return [{
  json: {
    base_url:       BASE_URL,
    api_token:      API_TOKEN.trim(),
    company_domain: COMPANY_DOMAIN.trim(),
    pipeline_id:    String(PIPELINE_ID || '').trim(),
    max_pages:      Math.max(1, Number(MAX_PAGES) || 20),

    stages:              STAGES,
    activity_types:      ACTIVITY_TYPES,
    reengage_after_days: Number(REENGAGE_AFTER_DAYS) || 60,
    reengage_type:       REENGAGE_TYPE,
    reengage_subject:    REENGAGE_SUBJECT,

    horizon_days:        Number(HORIZON_DAYS) || 45,
    grace_hours:         Number(GRACE_HOURS) || 0,
    daily_cap:           Number(DAILY_CAP) || 0,
    overdue_days:        Number(OVERDUE_DAYS) || 0,
    manager_after_days:  Number(MANAGER_AFTER_DAYS) || 0,
    remind_manager_after_days: Number(REMIND_MANAGER_AFTER_DAYS) || 0,
    max_per_owner_per_day: Number(MAX_PER_OWNER_PER_DAY) || 0,
    level_within_days:   Number(LEVEL_WITHIN_DAYS) || 0,
    work_days:           (WORK_DAYS || []).map(Number),
    holidays:            (HOLIDAYS || []).map(function (h) { return String(h).slice(0, 10); }),
    high_priority_value: Number(HIGH_PRIORITY_VALUE) || 0,

    forbidden_field_words: FORBIDDEN_FIELD_WORDS.map(function (w) {
      return String(w).toLowerCase();
    }),
    result_fields:  RESULT_FIELDS,
    context_fields: CONTEXT_FIELDS,
    touched_fields: TOUCHED_FIELDS,

    sheet_id:        SHEET_ID.trim(),
    dashboard_tab:   DASHBOARD_TAB,
    gaps_tab:        GAPS_TAB,
    by_rep_tab:      BY_REP_TAB,
    by_practice_tab: BY_PRACTICE_TAB,
    dashboard_columns:   DASHBOARD_COLUMNS,
    gap_columns:         GAP_COLUMNS,
    by_rep_columns:      BY_REP_COLUMNS,
    by_practice_columns: BY_PRACTICE_COLUMNS,

    outreach_types:     OUTREACH_TYPES,
    conversation_types: CONVERSATION_TYPES,
    meeting_types:      MEETING_TYPES,
    no_answer_words:    NO_ANSWER_WORDS.map(function (w) { return String(w).toLowerCase(); }),
    partner_stages:     PARTNER_STAGES,
    report_window_days: Number(REPORT_WINDOW_DAYS) || 7,
    baseline_min_days:  Number(BASELINE_MIN_DAYS) || 5,
    coach_min_attempts:         Number(COACH_MIN_ATTEMPTS) || 0,
    coach_min_conversation_pct: Number(COACH_MIN_CONVERSATION_PCT) || 0,
    coach_max_gap_pct:          Number(COACH_MAX_GAP_PCT) || 100,

    alert_webhook_url:   ALERT_WEBHOOK_URL.trim(),
    manager_webhook_url: MANAGER_WEBHOOK_URL.trim(),
    test_owner_id:       String(TEST_OWNER_ID || '').trim(),
    owner_slack_ids:     OWNER_SLACK,

    // derived flags — the gates read these, never the raw constants
    mode:         MODE,
    preview_only: MODE === 'preview',
    test_write:   MODE === 'test',
    live_write:   MODE === 'live',

    pipedrive_enabled: API_TOKEN.trim() !== '' && COMPANY_DOMAIN.trim() !== '',
    write_enabled:     MODE !== 'preview' && API_TOKEN.trim() !== ''
                       && COMPANY_DOMAIN.trim() !== '',
    sheet_enabled:   SHEET_ID.trim() !== '',
    // Fabricated demo numbers never land in a real sheet, and are never compared with it.
    sheet_live:      SHEET_ID.trim() !== '' && !DEMO_DATA,
    slack_dm_enabled: SLACK_DMS === true && Object.keys(OWNER_SLACK).length > 0,
    failure_alert_enabled: (ALERT_WEBHOOK_URL.trim() || MANAGER_WEBHOOK_URL.trim()) !== '',
    failure_url:     ALERT_WEBHOOK_URL.trim() || MANAGER_WEBHOOK_URL.trim(),
    alert_enabled:   ALERT_WEBHOOK_URL.trim() !== '',
    manager_enabled: (MANAGER_WEBHOOK_URL.trim() || ALERT_WEBHOOK_URL.trim()) !== '',
    manager_url:     MANAGER_WEBHOOK_URL.trim() || ALERT_WEBHOOK_URL.trim(),
    demo_data:       DEMO_DATA,
    forced_preview:  FORCED_PREVIEW
  }
}];
