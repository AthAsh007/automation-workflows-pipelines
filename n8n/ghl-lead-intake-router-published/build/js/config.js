// GOHIGHLEVEL — LEAD INTAKE AND ROUTING — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows ("01 intake and routing" and
// "02 follow-up sequence"). build.py regenerates both from this one file, and validate.py
// fails if they drift apart — so you never paste it between them by hand.
//
// A blank id or key means that step is SKIPPED, never that the run fails. That is what lets
// this be demonstrated on a screen-share before a single GoHighLevel credential exists.

// ---------------------------------------------------------------- The GoHighLevel sub-account
// Location id: the Location ID on Settings -> Business Profile, or the id in the URL when
// you are inside the sub-account.
const GHL_LOCATION_ID = '';

// GoHighLevel signs in through an n8n credential, never through a value in this node.
// Create a Header Auth credential: Name "Authorization", Value "Bearer <Private Integration
// token>" (Settings -> Private Integrations, scopes contacts.write / opportunities.write /
// conversations.write). Select it on every GoHighLevel node, then set this to true. Left
// false, the workflows build the exact request and stop in front of the write.
const GHL_CREDENTIAL_ADDED = false;
const GHL_API_BASE     = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION  = '2021-07-28';
// The conversations endpoints (search, messages, send) expect their own Version header.
const GHL_CONVERSATIONS_API_VERSION = '2021-04-15';

// ---------------------------------------------------------------- The pipeline
// The pipeline a lead is filed into, and the stages it can be filed at. The workflow
// decides WHICH stage a lead belongs in; the id is what makes that a real stage rather than
// a label. Pipeline id: Pipelines -> your pipeline -> the id in the URL.
const GHL_PIPELINE_ID = '';
const STAGES = [
  { stage: 'New lead',        id: '' },
  { stage: 'Quote requested', id: '' },
  { stage: 'Support',         id: '' },
  { stage: 'Nurture',         id: '' }
];

// ---------------------------------------------------------------- Custom fields and tags
// Custom field name -> its GoHighLevel field id (Settings -> Custom Fields). The value is
// read off the lead by `from`. A blank id is skipped rather than written as an empty field,
// so a half-mapped account still writes a clean contact.
const CUSTOM_FIELDS = [
  { name: 'Lead source',  id: '', from: 'source'  },
  { name: 'Enquiry type', id: '', from: 'wants'   },
  { name: 'Summary',      id: '', from: 'summary' }
];

// On every contact this workflow writes. The routing rule adds its own.
const BASE_TAGS = ['automation-intake'];

// ---------------------------------------------------------------- Who gets what
// The rule table. First match wins. A rule may match on the intake source, on what the
// person wants, on both — and the last rule matches nothing on purpose, so a lead that fits
// no rule still lands somewhere rather than nowhere.
const OWNERS = [
  { owner: 'Ada',  user_id: '' },
  { owner: 'Ben',  user_id: '' },
  { owner: 'Cara', user_id: '' }
];
const ROUTING_RULES = [
  { match: { wants: 'support' },  owner: 'Cara', stage: 'Support',         tags: ['support'] },
  { match: { wants: 'quote' },    owner: 'Ben',  stage: 'Quote requested', tags: ['quote'] },
  { match: { wants: 'demo' },     owner: 'Ben',  stage: 'New lead',        tags: ['demo'] },
  { match: { source: 'phone' },   owner: 'Ben',  stage: 'New lead',        tags: ['phone'] },
  { match: { source: 'email' },   owner: 'Ada',  stage: 'New lead',        tags: ['email'] },
  { match: { source: 'website' }, owner: 'Ada',  stage: 'New lead',        tags: ['website'] },
  { match: {},                    owner: 'Ada',  stage: 'New lead',        tags: ['unrouted'] }
];

// ---------------------------------------------------------------- Follow-up sequence
// The ordered touches a lead receives if nobody has answered it. A lead gets touch 1 after
// `after_hours` with no movement, then touch 2, then touch 3 — and stops the moment anyone
// replies or the stage moves. The counter is `touches_sent` on the contact; the sequence is
// only ever advanced by one per run, so a lead cannot be double-touched.
const SEQUENCE = [
  { touch: 1, after_hours: 24, channel: 'email', label: 'check-in',
    subject: 'Quick check-in on your enquiry',
    line: 'Just making sure your message reached us and got a reply. Happy to pick this up whenever suits you.' },
  { touch: 2, after_hours: 72, channel: 'email', label: 'value nudge',
    subject: 'Something that might help',
    line: 'I have put a short summary together covering what you asked about. Want me to send it over?' },
  { touch: 3, after_hours: 120, channel: 'sms', label: 'last check-in',
    line: 'Last one from me. Shall I close this off, or keep it open for later?' }
];

// The hard stop, enforced in code rather than implied. A lead at this many touches is never
// sent another, whatever the timings say.
const MAX_TOUCHES = 3;

// The stages a lead can still be sequenced in. A lead that has left them is finished, and
// the sequence stops rather than chasing a won or lost deal.
const OPEN_STAGES = ['New lead', 'Quote requested', 'Support'];
const STOP_ON_STAGE_MOVE = true;

// Signed on the end of each email. Blank -> no signature line.
const FROM_NAME = '';

// Where the sequence's state lives on the contact. GoHighLevel's opportunities carry the stage,
// but not how many touches have gone out or when the last one was — those live in custom fields,
// and these are their ids (Settings -> Custom Fields). Point them at wherever you keep them and
// the read is complete; leave them blank and the counter reads 0, which is honest rather than
// invented.
const SEQ_TOUCHES_FIELD_ID    = '';
const SEQ_LAST_TOUCH_FIELD_ID = '';
const SEQ_LAST_REPLY_FIELD_ID = '';

// How many opportunities one read pulls. GoHighLevel caps a page at 100. If there are more than
// this, the run says so (see `more_pages` on the plan) rather than pretending it read them all.
const PIPELINE_PAGE_LIMIT = 100;

// ---------------------------------------------------------------- Sending window
// A touch only goes out inside the lead's own working hours. The lead's timezone comes from the
// contact's `timezone` field; a contact without one uses DEFAULT_TIMEZONE. Outside the window the
// lead is "waiting: quiet hours" and is picked up by a later run, never sent at 3 a.m.
const DEFAULT_TIMEZONE       = 'Europe/London';
const SEND_WINDOW_START_HOUR = 9;     // first hour a touch may go out (local time)
const SEND_WINDOW_END_HOUR   = 18;    // touches stop at this hour (local time)
const SEND_ON_WEEKENDS       = false;

// Pause between leads, so a long pipeline stays inside GoHighLevel's API rate limits.
const PAUSE_BETWEEN_LEADS_SECONDS = 1;

// ---------------------------------------------------------------- Replies, opt-outs and tags
// Before every touch the contact's conversation is read. A reply after the last touch stops the
// sequence and hands the lead to its owner; an opt-out tags the contact and stops it for good.
// OPT_OUT_KEYWORDS match a message that is only that word ("STOP"); OPT_OUT_PHRASES match
// anywhere in a message ("please unsubscribe me").
const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out'];
const OPT_OUT_PHRASES  = ['unsubscribe', 'opt out', 'opt-out', 'remove me', 'do not contact',
                          'stop messaging', 'stop texting', 'stop emailing'];
const DNC_TAG        = 'do-not-contact';     // added on an opt-out; a contact with it is never touched
const REPLIED_TAG    = 'sequence-replied';   // added when a reply stops the sequence
const SEQUENCE_TAGS  = ['follow-up-sequence']; // added with every touch, beside "sequence-touch-N"

// After the final touch with no reply: a task for the owner, and the opportunity moves to this
// stage (its id comes from STAGES above; a blank id skips the move).
const NURTURE_STAGE  = 'Nurture';
const TASK_DUE_HOURS = 24;                  // the owner's "call this lead" task is due this soon

// ---------------------------------------------------------------- AI-written touches (optional)
// Any OpenAI-compatible chat completions endpoint. Create a Header Auth credential (Name
// "Authorization", Value "Bearer <your API key>"), select it on the AI node and set
// AI_CREDENTIAL_ADDED = true. Left false, every touch uses the SEQUENCE wording above.
// A draft that fails a guardrail is never sent: the SEQUENCE wording goes instead, and the
// reason is recorded on the lead.
const AI_CREDENTIAL_ADDED = false;
const AI_API_BASE    = 'https://api.openai.com/v1';
const AI_MODEL       = 'gpt-4o-mini';
const AI_TEMPERATURE = 0.4;
const EMAIL_MAX_CHARS   = 900;   // email body, before the signature
const SUBJECT_MAX_CHARS = 80;
const SMS_MAX_CHARS     = 320;   // including the opt-out line
const SMS_OPT_OUT_LINE  = 'Reply STOP to opt out';
// Words a follow-up must never contain: no prices, discounts or promises.
const BANNED_WORDS = ['discount', 'coupon', 'promo', 'special offer', 'price', 'pricing',
                      'cost', 'for free', 'free of charge', 'guarantee', 'guaranteed',
                      'promise', 'refund', 'cheapest', '% off'];

// ---------------------------------------------------------------- Run report (optional)
// One summary per run: sent, waiting, stopped by reason, failed, AI vs template.
// REPORT_WEBHOOK_URL: a Slack or Discord incoming-webhook URL. Blank -> not posted.
// LOG_SHEET_ID: a Google Sheet to append one row per run to (needs a Google Sheets credential on
// the sheet node). Blank -> not logged.
const REPORT_WEBHOOK_URL = '';
const LOG_SHEET_ID       = '';
const LOG_SHEET_TAB      = 'Run log';

// ---------------------------------------------------------------- What counts as a lead
// A lead with no way to reach the person is not a lead. Whether a message is also required
// is a judgement call, so it is a setting rather than an assumption.
const REQUIRE_CONTACT = true;    // an email address or a phone number
const REQUIRE_MESSAGE = false;   // false: a named contact with no message is still filed

// ---------------------------------------------------------------- Safety switch
//   DRY_RUN true  (how it ships) -> nothing is written and nothing is sent. The payloads are
//                                   built in full and shown, so the first run after import
//                                   is always safe.
//   DRY_RUN false                -> the contact is created or updated and the touches send.
// Both also need GHL_LOCATION_ID and GHL_CREDENTIAL_ADDED above; without them the workflows stay
// in preview whatever this says.
const DRY_RUN = true;

const MODE = DRY_RUN !== true ? 'live' : 'preview';

// ---------------------------------------------------------------- The demo pipeline
// The leads "02 follow-up sequence" runs against until GoHighLevel is wired up. Every person
// here is invented. The mix is deliberate: it has to show every decision the sequence makes.
//   * 30 h quiet, 0 touches                      -> due touch 1, email
//   * one touch sent, 80 h quiet                  -> due touch 2, email
//   * two touches, 130 h quiet                    -> due touch 3, the final one: SMS, then a task
//                                                    for the owner and a move to Nurture
//   * touch 1 is email, but no email address      -> sent by SMS instead (channel fallback)
//   * 5 h quiet, 0 touches                        -> waiting: not due yet
//   * due, but 22:00 where the lead lives         -> waiting: quiet hours
//   * replied 10 h ago (the reply field)          -> stopped: they replied
//   * replied in the conversation after a touch   -> stopped: replied, handed to the owner
//   * texted STOP                                 -> stopped: opted out, do-not-contact tag
//   * no email and no phone                       -> stopped: unreachable
//   * stage is 'Won'                              -> stopped: left the sequence
//   * three touches already sent                  -> stopped: sequence finished
// `demo_local` is the lead's simulated local weekday (0 Sunday .. 6 Saturday) and hour, so the
// quiet-hours decision shows the same way whenever the demo is run. `demo_messages` stands in
// for the contact's GoHighLevel conversation.
const DEMO_PIPELINE = [
  { contact_key: 'rachel@brightpath-dental.example', name: 'Rachel Okonkwo', company: 'Brightpath Dental',
    email: 'rachel@brightpath-dental.example', phone: '', contact_id: 'demo-1001', opportunity_id: 'demo-opp-1001',
    owner: 'Ben', stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 30, last_reply_hours_ago: -1,
    source: 'website', wants: 'quote', notes: 'Asked for a quote for a new patient booking system.',
    timezone: 'Europe/London', demo_local: { weekday: 2, hour: 10 }, demo_messages: [] },
  { contact_key: 'tom@beasleylogistics.example', name: 'Tom Beasley', company: 'Beasley Logistics',
    email: 'tom@beasleylogistics.example', phone: '', contact_id: 'demo-1002', opportunity_id: 'demo-opp-1002',
    owner: 'Cara', stage: 'Support', touches_sent: 1, last_touch_hours_ago: 80, last_reply_hours_ago: -1,
    source: 'email', wants: 'support', notes: 'Tracking page not updating for two depots.',
    timezone: 'Europe/London', demo_local: { weekday: 2, hour: 11 }, demo_messages: [] },
  { contact_key: '07700900456', name: 'Ravi Menon', company: 'Menon & Co',
    email: '', phone: '07700 900456', contact_id: 'demo-1003', opportunity_id: 'demo-opp-1003',
    owner: 'Ben', stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 5, last_reply_hours_ago: -1,
    source: 'phone', wants: 'general', notes: 'Called about opening hours.',
    timezone: 'Europe/London', demo_local: { weekday: 2, hour: 10 }, demo_messages: [] },
  { contact_key: 'elena@example.com', name: 'Elena Rossi', company: '',
    email: 'elena@example.com', phone: '', contact_id: 'demo-1004', opportunity_id: 'demo-opp-1004',
    owner: 'Ada', stage: 'Quote requested', touches_sent: 1, last_touch_hours_ago: 100, last_reply_hours_ago: 10,
    source: 'website', wants: 'quote', notes: '', timezone: '', demo_local: { weekday: 2, hour: 10 }, demo_messages: [] },
  { contact_key: 'june@example.com', name: 'June Park', company: '',
    email: 'june@example.com', phone: '', contact_id: 'demo-1005', opportunity_id: 'demo-opp-1005',
    owner: 'Ada', stage: 'Won', touches_sent: 1, last_touch_hours_ago: 100, last_reply_hours_ago: -1,
    source: 'website', wants: 'demo', notes: '', timezone: '', demo_local: { weekday: 2, hour: 10 }, demo_messages: [] },
  { contact_key: 'dana@example.com', name: 'Dana Whitfield', company: '',
    email: 'dana@example.com', phone: '', contact_id: 'demo-1006', opportunity_id: 'demo-opp-1006',
    owner: 'Ada', stage: 'New lead', touches_sent: 3, last_touch_hours_ago: 200, last_reply_hours_ago: -1,
    source: 'email', wants: 'general', notes: '', timezone: '', demo_local: { weekday: 2, hour: 10 }, demo_messages: [] },
  { contact_key: 'marcus@halejoinery.example', name: 'Marcus Hale', company: 'Hale Joinery',
    email: 'marcus@halejoinery.example', phone: '+1 312 555 0147', contact_id: 'demo-1007', opportunity_id: 'demo-opp-1007',
    owner: 'Ben', stage: 'Quote requested', touches_sent: 2, last_touch_hours_ago: 130, last_reply_hours_ago: -1,
    source: 'website', wants: 'quote', notes: 'Fitted wardrobes for a two-bedroom flat.',
    timezone: 'America/Chicago', demo_local: { weekday: 2, hour: 11 }, demo_messages: [] },
  { contact_key: '07700900789', name: 'Lee Carter', company: 'Carter Plumbing',
    email: '', phone: '07700 900789', contact_id: 'demo-1008', opportunity_id: 'demo-opp-1008',
    owner: 'Ben', stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 50, last_reply_hours_ago: -1,
    source: 'phone', wants: 'demo', notes: 'Wants to see the booking calendar before deciding.',
    timezone: 'Europe/London', demo_local: { weekday: 2, hour: 14 }, demo_messages: [] },
  { contact_key: 'priya@lotusstudio.example', name: 'Priya Shah', company: 'Lotus Studio',
    email: 'priya@lotusstudio.example', phone: '', contact_id: 'demo-1009', opportunity_id: 'demo-opp-1009',
    owner: 'Ada', stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 40, last_reply_hours_ago: -1,
    source: 'website', wants: 'demo', notes: 'Yoga studio, asked about class bookings.',
    timezone: 'Asia/Kolkata', demo_local: { weekday: 2, hour: 22 }, demo_messages: [] },
  { contact_key: 'owen@gallagherbuild.example', name: 'Owen Gallagher', company: 'Gallagher Build',
    email: 'owen@gallagherbuild.example', phone: '', contact_id: 'demo-1010', opportunity_id: 'demo-opp-1010',
    owner: 'Cara', stage: 'New lead', touches_sent: 1, last_touch_hours_ago: 90, last_reply_hours_ago: -1,
    source: 'email', wants: 'quote', notes: 'Site office fit-out.', timezone: 'Europe/Dublin',
    demo_local: { weekday: 2, hour: 12 },
    demo_messages: [
      { direction: 'inbound',  body: 'Hi, looking for a fit-out quote for our site office.', hours_ago: 120 },
      { direction: 'outbound', body: 'Quick check-in on your enquiry', hours_ago: 90 },
      { direction: 'inbound',  body: 'Thanks for following up, can we talk on Thursday?', hours_ago: 20 }
    ] },
  { contact_key: 'sofia@marinflorals.example', name: 'Sofia Marin', company: 'Marin Florals',
    email: 'sofia@marinflorals.example', phone: '07700 900321', contact_id: 'demo-1011', opportunity_id: 'demo-opp-1011',
    owner: 'Ada', stage: 'New lead', touches_sent: 1, last_touch_hours_ago: 100, last_reply_hours_ago: -1,
    source: 'website', wants: 'general', notes: '', timezone: 'Europe/London',
    demo_local: { weekday: 2, hour: 10 },
    demo_messages: [
      { direction: 'outbound', body: 'Quick check-in on your enquiry', hours_ago: 100 },
      { direction: 'inbound',  body: 'STOP', hours_ago: 50 }
    ] },
  { contact_key: 'sam-doyle', name: 'Sam Doyle', company: '',
    email: '', phone: '', contact_id: 'demo-1012', opportunity_id: 'demo-opp-1012',
    owner: 'Ada', stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 60, last_reply_hours_ago: -1,
    source: 'phone', wants: 'general', notes: 'Caller hung up before leaving a number.',
    timezone: '', demo_local: { weekday: 2, hour: 10 }, demo_messages: [] }
];

const SETTINGS = {
  ghl_location_id: GHL_LOCATION_ID.trim(),
  ghl_credential_added: GHL_CREDENTIAL_ADDED === true,
  ghl_api_base:    GHL_API_BASE.trim().replace(/\/+$/, ''),
  ghl_api_version: GHL_API_VERSION.trim(),
  ghl_conversations_api_version: GHL_CONVERSATIONS_API_VERSION.trim(),

  ghl_pipeline_id: GHL_PIPELINE_ID.trim(),
  stages:          STAGES,

  custom_fields: CUSTOM_FIELDS,
  base_tags:     BASE_TAGS,

  owners:        OWNERS,
  routing_rules: ROUTING_RULES,

  sequence:            SEQUENCE,
  max_touches:         Number(MAX_TOUCHES) || SEQUENCE.length,
  open_stages:         OPEN_STAGES,
  stop_on_stage_move:  STOP_ON_STAGE_MOVE === true,
  from_name:           FROM_NAME.trim(),
  demo_pipeline:       DEMO_PIPELINE,

  seq_touches_field_id:    SEQ_TOUCHES_FIELD_ID.trim(),
  seq_last_touch_field_id: SEQ_LAST_TOUCH_FIELD_ID.trim(),
  seq_last_reply_field_id: SEQ_LAST_REPLY_FIELD_ID.trim(),
  pipeline_page_limit:     Number(PIPELINE_PAGE_LIMIT) || 100,

  default_timezone:        DEFAULT_TIMEZONE.trim() || 'UTC',
  send_window_start_hour:  Number(SEND_WINDOW_START_HOUR),
  send_window_end_hour:    Number(SEND_WINDOW_END_HOUR),
  send_on_weekends:        SEND_ON_WEEKENDS === true,
  pause_between_leads_seconds: Math.max(0, Number(PAUSE_BETWEEN_LEADS_SECONDS) || 0),

  opt_out_keywords: OPT_OUT_KEYWORDS.map((k) => String(k).toLowerCase()),
  opt_out_phrases:  OPT_OUT_PHRASES.map((k) => String(k).toLowerCase()),
  dnc_tag:          DNC_TAG.trim(),
  replied_tag:      REPLIED_TAG.trim(),
  sequence_tags:    SEQUENCE_TAGS,
  nurture_stage:    NURTURE_STAGE.trim(),
  nurture_stage_id: ((STAGES.filter((s) => s.stage === NURTURE_STAGE.trim())[0] || {}).id || '').trim(),
  task_due_hours:   Number(TASK_DUE_HOURS) || 24,

  ai_api_base:       AI_API_BASE.trim().replace(/\/+$/, ''),
  ai_model:          AI_MODEL.trim(),
  ai_temperature:    Number(AI_TEMPERATURE),
  email_max_chars:   Number(EMAIL_MAX_CHARS) || 900,
  subject_max_chars: Number(SUBJECT_MAX_CHARS) || 80,
  sms_max_chars:     Number(SMS_MAX_CHARS) || 320,
  sms_opt_out_line:  SMS_OPT_OUT_LINE.trim(),
  banned_words:      BANNED_WORDS.map((w) => String(w).toLowerCase()),

  report_webhook_url: REPORT_WEBHOOK_URL.trim(),
  log_sheet_id:       LOG_SHEET_ID.trim(),
  log_sheet_tab:      LOG_SHEET_TAB.trim() || 'Run log',

  require_contact: REQUIRE_CONTACT === true,
  require_message: REQUIRE_MESSAGE === true,

  stage_on_arrival: 'New lead',

  // derived flags — the gates read these, never the raw constants
  mode:        MODE,
  dry_run:     MODE !== 'live',
  ghl_enabled: MODE === 'live'
    && GHL_LOCATION_ID.trim() !== ''
    && GHL_CREDENTIAL_ADDED === true,
  ai_enabled:     AI_CREDENTIAL_ADDED === true && AI_API_BASE.trim() !== '' && AI_MODEL.trim() !== '',
  report_enabled: REPORT_WEBHOOK_URL.trim() !== '',
  log_enabled:    LOG_SHEET_ID.trim() !== ''
};

// config passes the incoming payload through untouched under `lead`, so whichever trigger
// fired the next node reads the payload from the same place. It runs once per incoming item.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((lead) => ({ json: Object.assign({}, SETTINGS, { lead: lead }) }));
