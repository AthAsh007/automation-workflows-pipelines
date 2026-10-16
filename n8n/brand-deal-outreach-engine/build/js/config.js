// BRAND DEAL OUTREACH ENGINE — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows and is generated from one file, so the
// sender and the reply handler can never disagree about which inbox belongs to which
// student, or about what counts as a booked deal.
//
// Any key left blank means that step is SKIPPED, not that the run fails. That is what lets
// this be demonstrated on a screen-share before a single credential exists.

// ---------------------------------------------------------------- Airtable: the database
// The student dashboard the brief describes. Blank = the run uses the built-in demo roster
// and writes nothing.
//   API key:  airtable.com/create/tokens (a PAT with data.records:read and :write)
//   Base id:  the "app..." segment of the base's URL
const AIRTABLE_API_KEY = '';
const AIRTABLE_BASE_ID = '';
const AIRTABLE_URL     = 'https://api.airtable.com/v0';

const STUDENTS_TABLE = 'Students';   // one row per creator we send for
const BRANDS_TABLE   = 'Brands';     // the target list, per niche
const PITCHES_TABLE  = 'Pitches';    // one row per pitch. Written same day, always.
const INBOXES_TABLE  = 'Inboxes';    // sending accounts and their health

// Field names, exactly as they appear in Airtable.
const STUDENT_FIELDS = {
  student_id:   'Student id',
  name:         'Name',
  handle:       'Handle',
  niche:        'Niche',
  platform:     'Platform',
  followers:    'Followers',
  avg_views:    'Average views',
  rate_card:    'Rate card',
  min_rate:     'Minimum rate',
  deliverables: 'Deliverables',
  proof:        'Proof points',
  status:       'Status',
  started_on:   'Engagement start',
  monthly_target: 'Monthly pitch target'
};

const BRAND_FIELDS = {
  brand_id:     'Brand id',
  brand:        'Brand',
  niche:        'Niche',
  contact_name: 'Contact name',
  contact_email: 'Contact email',
  role:         'Role',
  budget_band:  'Budget band',
  recent_signal: 'Recent signal',
  product:      'Product',
  region:       'Region',
  status:       'Status'
};

const PITCH_FIELDS = {
  pitch_id:    'Pitch id',
  student_id:  'Student id',
  student:     'Student',
  brand_id:    'Brand id',
  brand:       'Brand',
  contact:     'Contact',
  email:       'Email',
  inbox:       'Sent from',
  subject:     'Subject',
  body:        'Body',
  facts_used:  'Facts used',
  sent_at:     'Sent at',
  state:       'State',
  hold_reason: 'Hold reason',
  reply_at:    'Replied at',
  reply_class: 'Reply',
  booked_at:   'Booked at',
  deal_value:  'Deal value'
};

const INBOX_FIELDS = {
  inbox_id:     'Inbox id',
  email:        'Email',
  domain:       'Domain',
  student_id:   'Student id',
  warmed_days:  'Days warming',
  daily_cap:    'Daily cap',
  sent_today:   'Sent today',
  bounce_rate:  'Bounce rate',
  spam_rate:    'Spam complaint rate',
  health_score: 'Health score',
  state:        'State'
};

// Only students in these states are pitched for.
const ACTIVE_STUDENT_STATES = ['Active', 'Onboarding complete', ''];
// Only brands in these states are pitched. Anything else has been contacted or ruled out.
const OPEN_BRAND_STATES = ['New', 'Researched', ''];

// ---------------------------------------------------------------- Volume
// The brief's number is 10,000+ pitches a month across all students. That is a per-student
// daily figure once you divide it by working days, and it is the figure that has to be
// enforced — a month's target is not a thing you can rate-limit against.
const PITCHES_PER_STUDENT_PER_DAY = 25;
const DAILY_CAP                   = 400;  // hard ceiling across all students, per run
const MAX_PER_BRAND_PER_STUDENT   = 1;    // never pitch the same brand twice for one creator
const REPITCH_AFTER_DAYS          = 90;   // a brand that said no is left alone this long

// ---------------------------------------------------------------- Deliverability
// The second of their three hard gates. This is the part that fails CLOSED: an inbox that
// cannot be proved healthy does not send. Every other mistake in cold outreach is
// recoverable; a burnt sending domain is not, and it takes the student's name with it.
const MIN_WARMUP_DAYS   = 14;    // an inbox younger than this sends nothing
const MAX_BOUNCE_RATE   = 0.03;  // 3% — above this the inbox is pulled from rotation
const MAX_SPAM_RATE     = 0.001; // 0.1%
const MIN_HEALTH_SCORE  = 70;    // whatever your sending platform reports, 0-100
const MAX_PER_INBOX_DAY = 40;    // per mailbox, not per domain
const MAX_PER_DOMAIN_DAY = 120;  // across every mailbox on one domain

// An inbox whose health the platform will not tell us about. true = do not send from it.
// Leave it true: an unknown inbox is not a healthy one.
const HOLD_UNKNOWN_INBOX = true;

// ---------------------------------------------------------------- Personalisation
// Their third hard gate: "pitches read human and personal from line one. Never templated."
//
// A pitch must carry at least MIN_FACTS specific, verifiable details drawn from the BRAND
// and STUDENT records — not from the model. If the record does not contain enough to say
// something true and specific, the pitch is HELD, not sent with a generic line in its place.
// That is the difference between personalisation and mail-merge, and it is checkable.
const MIN_FACTS = 3;

// And at least this many of them about the BRAND. Creator numbers are facts too, but a
// pitch made only of them is a CV — MIN_FACTS alone would let one through on the strength
// of the follower count.
const MIN_BRAND_FACTS = 2;

// Which brand record fields count as a usable fact. A blank field is not a fact.
//
// `budget_band` is deliberately NOT here. It is real, and it gates the match upstream, and
// it must never appear in an email — telling a company what you think their budget is, is
// the single fastest way to lose the deal you were quoting into.
const FACT_FIELDS = ['recent_signal', 'product', 'role'];

// Phrases that give a template away. A pitch containing any of these is held and rewritten.
// This list is the single most useful thing in this config — add to it every time you read
// a sent pitch and wince.
const BANNED_PHRASES = [
  'i hope this email finds you well', 'i hope this finds you well', 'quick question',
  'just following up', 'circling back', 'touching base', 'i wanted to reach out',
  'i came across your', 'i stumbled upon', 'love what you are doing',
  'love what you’re doing', 'we are a leading', 'synergy', 'game-changing',
  'revolutionary', 'to whom it may concern', 'dear sir or madam', 'per my last email',
  'as per', 'kindly revert', 'i am reaching out to you today'
];

// A pitch outside this range is held. Short enough to read on a phone, long enough to say
// something.
const MIN_WORDS = 60;
const MAX_WORDS = 160;

// Never send to these. Domains or full addresses. Anything that replies "remove me" is
// added here by workflow 02.
const SUPPRESSION = [];

// Role mailboxes nobody owns. Held — these are where bounce rates come from.
const ROLE_PREFIXES = ['info', 'hello', 'contact', 'support', 'admin', 'sales', 'help',
  'noreply', 'no-reply', 'press', 'careers', 'jobs', 'legal', 'billing', 'webmaster'];

// ---------------------------------------------------------------- The writer
// The model rewrites the SUBJECT and the OPENING LINE around facts that were assembled in
// code. It is never handed the rate card and asked to improvise a number.
// Blank = the skeleton pitch is produced and held for a human to finish. Nothing is sent
// unwritten.
const AI_API_KEY = '';
const AI_URL     = 'https://api.anthropic.com/v1/messages';
const AI_MODEL   = 'claude-opus-5';

// ---------------------------------------------------------------- The sending engine
// Instantly by default. Smartlead works the same way: change SEND_URL and the body built in
// "payload for the campaign".
const SEND_API_KEY  = '';
const SEND_URL      = 'https://api.instantly.ai/api/v2/leads';
const REPLIES_URL   = 'https://api.instantly.ai/api/v2/emails';
const CAMPAIGN_ID   = '';

// Optional: a different campaign per niche, so a skincare brand and a gaming brand are not
// sent the same sequence. Anything not listed here goes to CAMPAIGN_ID.
const CAMPAIGN_BY_NICHE = {
  // 'Beauty': 'campaign-uuid-here',
  // 'Gaming': 'campaign-uuid-here'
};

// ---------------------------------------------------------------- Replies (workflow 02)
// How a reply is classified. First rule whose words appear wins, so put the specific ones
// first. Anything that matches nothing is 'unclear' and goes to a human — never guessed.
const REPLY_RULES = [
  { klass: 'unsubscribe', route: 'suppress',
    words: ['unsubscribe', 'remove me', 'take me off', 'do not contact', 'opt out',
            'stop emailing'] },
  { klass: 'auto-reply', route: 'ignore',
    words: ['out of office', 'automatic reply', 'auto-reply', 'annual leave',
            'on holiday', 'currently away', 'parental leave'] },
  { klass: 'bounce', route: 'suppress',
    words: ['undeliverable', 'delivery failed', 'address not found', 'mailbox full',
            'recipient rejected', 'does not exist'] },
  { klass: 'wrong-person', route: 'reroute',
    words: ['no longer with', 'has left', 'not the right person', 'forward this to',
            'my colleague handles', 'wrong department'] },
  { klass: 'not-now', route: 'nurture',
    words: ['next quarter', 'next year', 'budget is set', 'revisit', 'not right now',
            'circle back in', 'check back'] },
  { klass: 'not-interested', route: 'close',
    words: ['not interested', 'no thanks', 'we will pass', 'we’ll pass', 'not a fit',
            'not for us', 'declining'] },
  { klass: 'interested', route: 'handover',
    words: ['interested', 'tell me more', 'send over', 'rates', 'media kit', 'happy to chat',
            'set up a call', 'what would', 'pricing', 'sounds good', 'let’s talk'] }
];

// A reply routed 'handover' is a human's job — the brief pays a person to work the replies,
// and this workflow's job is to put the right ones in front of them fast, not to negotiate.
const HANDOVER_WEBHOOK_URL = '';   // Slack channel for interested replies. Blank = summary only.

// ---------------------------------------------------------------- Weekly report
// "Report weekly — clean numbers so students and the team can see progress."
// Runs on the hourly trigger, on this day and hour only.
const REPORT_DAY  = 1;   // 0 Sunday … 6 Saturday
const REPORT_HOUR = 9;   // 24h, in the n8n instance's timezone
const REPORT_WINDOW_DAYS = 7;

const ALERT_WEBHOOK_URL = '';   // Slack incoming webhook for the run summaries.

// ---------------------------------------------------------------- Demo mode
// With no Airtable key set, builds a deterministic roster — six students, sixty brands,
// four inboxes with a realistic spread of health — so the whole engine can be watched end
// to end before an account exists. While this is on the run is FORCED into preview: a
// fabricated brand contact can never be emailed.
const DEMO_ROSTER = true;

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_EMAIL blank -> PREVIEW. Every pitch is written, audited and
//                                       assigned an inbox, and NOTHING is sent or logged.
//                                       Ships this way.
//   TEST_RUN true,  TEST_EMAIL set   -> TEST. Pitches really are sent, all redirected to
//                                       that address, so you can read what a brand would get.
//   TEST_RUN false                   -> LIVE.
const TEST_RUN   = true;
const TEST_EMAIL = '';

const DEMO_DATA = DEMO_ROSTER === true && AIRTABLE_API_KEY.trim() === '';

let MODE = TEST_RUN !== true ? 'live'
  : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');

// A fabricated brand contact is not a lead. It cannot open the send gate, whatever
// TEST_RUN says.
const FORCED_PREVIEW = DEMO_DATA && MODE !== 'preview';
if (FORCED_PREVIEW) MODE = 'preview';

const now = new Date();
const REPORT_DUE = now.getDay() === Number(REPORT_DAY) &&
                   now.getHours() === Number(REPORT_HOUR);

return [{
  json: {
    airtable_url:  AIRTABLE_URL,
    airtable_key:  AIRTABLE_API_KEY.trim(),
    airtable_base: AIRTABLE_BASE_ID.trim(),
    students_table: STUDENTS_TABLE,
    brands_table:   BRANDS_TABLE,
    pitches_table:  PITCHES_TABLE,
    inboxes_table:  INBOXES_TABLE,
    student_fields: STUDENT_FIELDS,
    brand_fields:   BRAND_FIELDS,
    pitch_fields:   PITCH_FIELDS,
    inbox_fields:   INBOX_FIELDS,
    active_student_states: ACTIVE_STUDENT_STATES,
    open_brand_states:     OPEN_BRAND_STATES,

    pitches_per_student_per_day: Number(PITCHES_PER_STUDENT_PER_DAY) || 25,
    daily_cap:                   Number(DAILY_CAP) || 0,
    max_per_brand_per_student:   Number(MAX_PER_BRAND_PER_STUDENT) || 1,
    repitch_after_days:          Number(REPITCH_AFTER_DAYS) || 90,

    min_warmup_days:    Number(MIN_WARMUP_DAYS) || 0,
    max_bounce_rate:    Number(MAX_BOUNCE_RATE) || 0,
    max_spam_rate:      Number(MAX_SPAM_RATE) || 0,
    min_health_score:   Number(MIN_HEALTH_SCORE) || 0,
    max_per_inbox_day:  Number(MAX_PER_INBOX_DAY) || 0,
    max_per_domain_day: Number(MAX_PER_DOMAIN_DAY) || 0,
    hold_unknown_inbox: HOLD_UNKNOWN_INBOX !== false,

    min_facts:       Number(MIN_FACTS) || 0,
    min_brand_facts: Number(MIN_BRAND_FACTS) || 0,
    fact_fields: FACT_FIELDS,
    banned_phrases: BANNED_PHRASES.map(function (p) { return String(p).toLowerCase(); }),
    min_words:   Number(MIN_WORDS) || 0,
    max_words:   Number(MAX_WORDS) || 9999,
    suppression: SUPPRESSION.map(function (s) { return String(s).trim().toLowerCase(); })
      .filter(Boolean),
    role_prefixes: ROLE_PREFIXES,

    ai_api_key: AI_API_KEY.trim(),
    ai_url:     AI_URL,
    ai_model:   AI_MODEL,

    send_api_key: SEND_API_KEY.trim(),
    send_url:     SEND_URL,
    replies_url:  REPLIES_URL,
    campaign_id:  CAMPAIGN_ID.trim(),
    campaign_by_niche: CAMPAIGN_BY_NICHE,

    reply_rules: REPLY_RULES,
    handover_webhook_url: HANDOVER_WEBHOOK_URL.trim(),

    report_day:  Number(REPORT_DAY),
    report_hour: Number(REPORT_HOUR),
    report_window_days: Number(REPORT_WINDOW_DAYS) || 7,
    alert_webhook_url:  ALERT_WEBHOOK_URL.trim(),
    test_email: TEST_EMAIL.trim(),

    // derived flags — the gates read these, never the raw constants
    mode:         MODE,
    preview_only: MODE === 'preview',
    test_send:    MODE === 'test',
    live_send:    MODE === 'live',

    airtable_enabled: AIRTABLE_API_KEY.trim() !== '' && AIRTABLE_BASE_ID.trim() !== '',
    log_enabled:      MODE !== 'preview' && AIRTABLE_API_KEY.trim() !== ''
                      && AIRTABLE_BASE_ID.trim() !== '',
    ai_enabled:       AI_API_KEY.trim() !== '',
    send_enabled:     MODE !== 'preview' && SEND_API_KEY.trim() !== '' &&
                      CAMPAIGN_ID.trim() !== '',
    replies_enabled:  SEND_API_KEY.trim() !== '',
    alert_enabled:    ALERT_WEBHOOK_URL.trim() !== '',
    handover_enabled: (HANDOVER_WEBHOOK_URL.trim() || ALERT_WEBHOOK_URL.trim()) !== '',
    handover_url:     HANDOVER_WEBHOOK_URL.trim() || ALERT_WEBHOOK_URL.trim(),
    report_due:       REPORT_DUE,
    demo_data:        DEMO_DATA,
    forced_preview:   FORCED_PREVIEW
  }
}];
