// RECRUITING CANDIDATE ENGINE — CONFIG
// The same node appears at the head of all three workflows. Edit it in one, paste it
// into the other two; validate.py checks that they have not drifted apart.
//
// Any key left blank means that step is SKIPPED, not that the run fails. That is what
// lets the whole engine be demonstrated on a screen-share before a single credential,
// phone number or ATS sandbox exists.

// ---------------------------------------------------------------- Which client is this
// Everything the engine writes carries this id. One n8n instance runs every client;
// two clients can never see each other's rows because every query is filtered on it and
// every table has an RLS policy that says the same thing.
const CLIENT_SLUG = 'meridian';
const CLIENT_ID   = '';          // the clients.id uuid from Supabase. Blank -> demo mode.

// ---------------------------------------------------------------- Supabase
// SUPABASE_URL blank -> the engine runs against sample/ data and writes nothing.
const SUPABASE_URL          = '';   // https://xxxxxxxx.supabase.co
const SUPABASE_SERVICE_KEY  = '';   // service_role key. n8n credential store is better;
                                    // this is here so the template runs before that exists.

// ---------------------------------------------------------------- The ATS
// One block, six vendors. Only ATS_VENDOR and the credentials change between clients —
// the field mapping below is what actually makes a new ATS work.
const ATS_VENDOR   = 'bullhorn';    // bullhorn | avionte | ceipal | jobdiva | recruitcrm | salesforce | generic
const ATS_BASE_URL = '';            // e.g. https://rest99.bullhornstaffing.com/rest-services/abcde
const ATS_TOKEN    = '';            // BhRestToken / bearer. Blank -> ATS steps are skipped.

// How THIS client's ATS names things. This object is the entire onboarding cost of a new
// ATS: point each of our field names at theirs, dotted paths allowed.
const ATS_FIELDS = {
  job: {
    id:            'id',
    title:         'title',
    description:   'publicDescription',
    skills:        'skillList',            // comma string or array, both handled
    city:          'address.city',
    state:         'address.state',
    pay_rate:      'payRate',
    shift:         'customText1',
    employment:    'employmentType',
    recruiter:     'owner.name',
    recruiter_mail:'owner.email'
  },
  candidate: {
    id:         'id',
    first_name: 'firstName',
    last_name:  'lastName',
    email:      'email',
    phone:      'mobile',
    phone_alt:  'phone',
    title:      'occupation',
    skills:     'skillSet',
    city:       'address.city',
    state:      'address.state',
    status:     'status'
  }
};

// Where candidates come from when the ATS is not connected. The search endpoint per
// vendor differs; the shape after `normalise the candidates` does not.
const ATS_CANDIDATE_SEARCH_LIMIT = 200;   // ask the ATS for this many, score them all
const ENROLL_TOP_N               = 25;    // enroll only the best this many

// ---------------------------------------------------------------- The AI reader
// Most job orders are prose. `skillList` is empty far more often than a vendor demo
// suggests, and matching 20,000 candidates against an empty skill list finds nobody.
//
// So when the ATS gives us fewer than MIN_SKILLS_BEFORE_AI real skills, the description is
// read once and turned into a structured requirement list. It runs ONCE PER JOB ORDER, not
// per candidate — a few hundred tokens per campaign, not per person.
//
// Blank key -> the step is skipped and the keyword rules stand on their own.
const AI_API_KEY = '';
const AI_MODEL   = 'claude-opus-5';
const AI_EFFORT  = 'low';        // low | medium | high — extraction is not a hard problem
const MIN_SKILLS_BEFORE_AI = 2;  // at or below this many ATS skills, ask the model

// The model may only return skills. It is never asked who to contact, and never asked to
// score anybody — those stay in code where they can be audited and re-run.
const AI_MAX_SKILLS = 12;

// ---------------------------------------------------------------- Matching
// A transparent score, on purpose. A staffing manager can read why someone was
// contacted, which they cannot do with an embedding similarity.
const MATCH = {
  required_skill:   18,   // per required skill the candidate has
  nice_skill:        6,
  same_city:        12,
  same_state:        6,
  title_overlap:    14,   // words shared between their title and the job title
  recent_activity:  10,   // ATS status suggests they are actively looking
  has_mobile:        8    // no mobile means no SMS and no call. Weighted, not fatal.
};
const MIN_MATCH_SCORE = 40;   // below this, stored with a reason and never contacted

// Statuses in the client's ATS that mean "do not contact this person". Placed candidates
// are the one that gets people in trouble.
const ATS_EXCLUDE_STATUSES = ['Placed', 'Do Not Contact', 'Blacklisted', 'Inactive',
  'Deceased', 'Archived'];

// ---------------------------------------------------------------- The outreach ladder
// Copied onto the campaign at launch, so editing this never changes the behaviour of a
// campaign already running. delay_hours is measured from the previous attempt.
const SEQUENCE = [
  { step: 1, channel: 'sms',   delay_hours: 0,
    template: 'Hi {{first_name}}, it is {{recruiter_name}} at {{client_name}}. We have a '
            + '{{job_title}} role in {{job_city}}{{pay_phrase}}. Interested in hearing more? '
            + 'Reply YES or STOP to opt out.' },
  { step: 2, channel: 'sms',   delay_hours: 20,
    template: 'Hi {{first_name}}, following up on the {{job_title}} position in {{job_city}}. '
            + 'Still open. Reply YES and I will call you, or STOP to opt out.' },
  { step: 3, channel: 'voice', delay_hours: 26,
    agent_note: 'Second contact. They have had two texts and not replied. Keep it under '
              + '90 seconds and offer to text the details instead.' },
  { step: 4, channel: 'sms',   delay_hours: 48,
    template: 'Last note from me on the {{job_title}} role, {{first_name}} — reply YES if '
            + 'you would like the details, otherwise I will close it out. STOP to opt out.' }
];

// ---------------------------------------------------------------- When we are allowed
// TCPA is the reason this block exists. Quiet hours are evaluated in the CANDIDATE's
// timezone, not the server's and not the recruiter's.
const QUIET_HOURS_START = 21;    // no outbound at or after 21:00 local
const QUIET_HOURS_END   = 8;     // no outbound before 08:00 local
const SEND_ON_WEEKENDS  = false;
const DEFAULT_TIMEZONE  = 'America/New_York';

const RUNNER_BATCH_SIZE = 50;    // enrollments claimed per 15-minute run
const DAILY_SEND_CAP    = 500;   // hard ceiling per client per day, enforced in code
const LEASE_SECONDS     = 300;   // how long a claimed row stays claimed

// A number we have already touched today is not touched again, whatever the ladder says.
const MIN_HOURS_BETWEEN_TOUCHES = 18;

// ---------------------------------------------------------------- Twilio
const TWILIO_ACCOUNT_SID  = '';
const TWILIO_AUTH_TOKEN   = '';   // also the key the inbound webhook signature is checked with
const TWILIO_FROM_NUMBER  = '';   // +1XXXXXXXXXX, or a Messaging Service SID below
const TWILIO_MESSAGING_SID= '';   // MGxxxx. Preferred at volume — handles the number pool.
const TWILIO_STATUS_CALLBACK = '';// https://n8n.example.com/webhook/meridian-inbound

// Twilio error codes that mean "this will never work" — retrying them wastes money and
// looks like a loop. Everything else is treated as transient and backed off.
const PERMANENT_SMS_ERRORS = ['21211', '21610', '21614', '21408', '30003', '30005', '30006'];
//                            bad num  optout  not mobile geo-perm unreach  unknown  landline

// ---------------------------------------------------------------- Retell AI
const RETELL_API_KEY   = '';
const RETELL_AGENT_ID  = '';      // the outbound screening agent
const RETELL_FROM_NUMBER = '';    // a number bought inside Retell, or a Twilio number imported
const RETELL_WEBHOOK_SECRET = ''; // verifies the call_analyzed callback

// ---------------------------------------------------------------- Qualification
// The structured criteria. The AI agent is asked to fill these in; it is not asked to
// decide. The decision is this object, evaluated in a Code node, identically every time.
const QUALIFY = {
  must: [
    { key: 'interested',        equals: true,  label: 'said they are interested' },
    { key: 'authorized_to_work', equals: true, label: 'authorised to work' },
    { key: 'can_start_within_days', lte: 21,   label: 'can start within three weeks' }
  ],
  score: [
    { key: 'years_experience',  gte: 2,    points: 25, label: '2+ years experience' },
    { key: 'has_reliable_transport', equals: true, points: 15, label: 'has transport' },
    { key: 'shift_match',       equals: true, points: 20, label: 'shift works for them' },
    { key: 'rate_acceptable',   equals: true, points: 25, label: 'accepts the rate' },
    { key: 'certifications_valid', equals: true, points: 15, label: 'certifications current' }
  ],
  pass_mark: 60,
  // Anything the AI could not establish is null, and null never passes a `must`. An
  // unanswered question is a not-qualified, not an assumed yes.
  review_band: 15   // within this many points of the pass mark -> human review, not a rejection
};

// Words that stop everything, checked before anything else is done with a message.
const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit',
  'remove me', 'opt out', 'optout', 'do not text', 'dont text', 'take me off'];
const POSITIVE_KEYWORDS = ['yes', 'yeah', 'yep', 'y', 'sure', 'interested', 'ok', 'okay',
  'tell me more', 'more info', 'call me', 'sounds good', 'im in', "i'm in"];
const NEGATIVE_KEYWORDS = ['no', 'not interested', 'no thanks', 'nope', 'pass',
  'already have a job', 'found a job', 'not looking'];

// ---------------------------------------------------------------- Scheduling
const CALENDAR_PROVIDER   = 'google';   // google | microsoft | none
const RECRUITER_CALENDARS = {
  // recruiter email -> calendar id. Blank object -> the job order's recruiter_email is used
  // as the calendar id, which is what Google does by default anyway.
};
const INTERVIEW_MINUTES     = 30;
const BOOKING_LEAD_HOURS    = 18;    // never book sooner than this
const BOOKING_WINDOW_DAYS   = 5;     // look this far ahead for a slot
const BOOKING_HOURS         = [9, 10, 11, 13, 14, 15, 16];   // recruiter local hours

// ---------------------------------------------------------------- Telling people
const SLACK_WEBHOOK_URL = '';    // blank -> no Slack notification
const NOTIFY_RECRUITER_EMAIL = true;

// ---------------------------------------------------------------- The safety switch
// Ships in the safest position. Nothing reaches a candidate until someone deliberately
// changes TEST_RUN.
const TEST_RUN    = true;   // true -> no SMS, no call, no ATS write, no calendar event
const TEST_PHONE  = '';     // blank -> preview only. Set -> messages really send, to here.
const DRY_RUN_DB  = false;  // true -> Supabase reads happen, writes do not

// Gives every provider call a deterministic fake response so the three workflows can be
// watched end to end before any account exists. FORCES preview whatever the two above say,
// because a fabricated Twilio SID must never be able to reach a real phone.
const DEMO_MODE = true;

// Quiet hours are real, and at 01:00 the runner correctly defers every single row — which
// is the right behaviour and a useless thing to film. This ignores the quiet-hours check
// so a walkthrough can be recorded at any hour.
//
// It is honoured ONLY when DEMO_MODE is on, and DEMO_MODE forces preview, so this switch
// can never cause a real message at 3am. Turning DEMO_MODE off disarms it automatically.
const DEMO_ANY_HOUR = true;

// =============================================================================
const MODE = DEMO_MODE ? 'preview'
           : (TEST_RUN !== true ? 'live' : (TEST_PHONE.trim() !== '' ? 'test' : 'preview'));

const supabase_enabled = SUPABASE_URL.trim() !== '' && SUPABASE_SERVICE_KEY.trim() !== '';
const ats_enabled      = ATS_BASE_URL.trim() !== '' && ATS_TOKEN.trim() !== '';
const twilio_enabled   = TWILIO_ACCOUNT_SID.trim() !== '' && TWILIO_AUTH_TOKEN.trim() !== ''
                      && (TWILIO_FROM_NUMBER.trim() !== '' || TWILIO_MESSAGING_SID.trim() !== '');
const retell_enabled   = RETELL_API_KEY.trim() !== '' && RETELL_AGENT_ID.trim() !== '';

return [{
  json: {
    client_slug: CLIENT_SLUG,
    client_id:   CLIENT_ID,
    client_name: CLIENT_SLUG.charAt(0).toUpperCase() + CLIENT_SLUG.slice(1),

    supabase_url: SUPABASE_URL.replace(/\/+$/, ''),
    supabase_key: SUPABASE_SERVICE_KEY,
    supabase_enabled: supabase_enabled,
    dry_run_db: DRY_RUN_DB === true,

    ats_vendor: ATS_VENDOR,
    ats_base_url: ATS_BASE_URL.replace(/\/+$/, ''),
    ats_token: ATS_TOKEN,
    ats_fields: ATS_FIELDS,
    ats_enabled: ats_enabled,
    ats_exclude_statuses: ATS_EXCLUDE_STATUSES,
    ats_search_limit: ATS_CANDIDATE_SEARCH_LIMIT,

    ai_key: AI_API_KEY,
    ai_model: AI_MODEL,
    ai_effort: AI_EFFORT,
    ai_max_skills: AI_MAX_SKILLS,
    min_skills_before_ai: MIN_SKILLS_BEFORE_AI,
    ai_enabled: AI_API_KEY.trim() !== '',

    match: MATCH,
    min_match_score: MIN_MATCH_SCORE,
    enroll_top_n: ENROLL_TOP_N,

    sequence: SEQUENCE,
    quiet_hours_start: QUIET_HOURS_START,
    quiet_hours_end: QUIET_HOURS_END,
    send_on_weekends: SEND_ON_WEEKENDS,
    default_timezone: DEFAULT_TIMEZONE,
    runner_batch_size: RUNNER_BATCH_SIZE,
    daily_send_cap: DAILY_SEND_CAP,
    lease_seconds: LEASE_SECONDS,
    min_hours_between_touches: MIN_HOURS_BETWEEN_TOUCHES,

    twilio_sid: TWILIO_ACCOUNT_SID,
    twilio_token: TWILIO_AUTH_TOKEN,
    twilio_from: TWILIO_FROM_NUMBER,
    twilio_messaging_sid: TWILIO_MESSAGING_SID,
    twilio_status_callback: TWILIO_STATUS_CALLBACK,
    twilio_enabled: twilio_enabled,
    permanent_sms_errors: PERMANENT_SMS_ERRORS,

    retell_key: RETELL_API_KEY,
    retell_agent: RETELL_AGENT_ID,
    retell_from: RETELL_FROM_NUMBER,
    retell_secret: RETELL_WEBHOOK_SECRET,
    retell_enabled: retell_enabled,

    qualify: QUALIFY,
    opt_out_keywords: OPT_OUT_KEYWORDS,
    positive_keywords: POSITIVE_KEYWORDS,
    negative_keywords: NEGATIVE_KEYWORDS,

    calendar_provider: CALENDAR_PROVIDER,
    calendar_enabled: CALENDAR_PROVIDER !== 'none',
    recruiter_calendars: RECRUITER_CALENDARS,
    interview_minutes: INTERVIEW_MINUTES,
    booking_lead_hours: BOOKING_LEAD_HOURS,
    booking_window_days: BOOKING_WINDOW_DAYS,
    booking_hours: BOOKING_HOURS,

    slack_webhook_url: SLACK_WEBHOOK_URL,
    slack_enabled: SLACK_WEBHOOK_URL.trim() !== '',
    notify_recruiter_email: NOTIFY_RECRUITER_EMAIL === true,

    mode: MODE,
    test_phone: TEST_PHONE.trim(),
    demo_mode: DEMO_MODE === true,
    // Deliberately ANDed with DEMO_MODE here rather than trusted on its own, so the flag
    // cannot be left on by accident and quietly disable quiet hours in production.
    ignore_quiet_hours: DEMO_MODE === true && DEMO_ANY_HOUR === true,
    forced_preview: DEMO_MODE === true && TEST_RUN !== true,
    // The single flag every outbound gate reads. Nothing else decides whether to send.
    send_enabled: MODE !== 'preview',
    live_send: MODE === 'live',
    // Only a live run may touch the client's ATS or a recruiter's real calendar.
    writeback_enabled: MODE === 'live'
  }
}];
