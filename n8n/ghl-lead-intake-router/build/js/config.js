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

// A Private Integration token (Settings -> Private Integrations -> create one, scope
// contacts.write / opportunities.write / conversations.write), or a location API key. Both
// blank -> the workflows build the exact payload and stop in front of the write, so you can
// read what they would have sent. Neither is filled in here: this file ships to clients as a
// work sample.
const GHL_API_KEY      = '';
const GHL_API_BASE     = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION  = '2021-07-28';

// ---------------------------------------------------------------- The pipeline
// The pipeline a lead is filed into, and the stages it can be filed at. The workflow
// decides WHICH stage a lead belongs in; the id is what makes that a real stage rather than
// a label. Pipeline id: Pipelines -> your pipeline -> the id in the URL.
const GHL_PIPELINE_ID = '';
const STAGES = [
  { stage: 'New lead',        id: '' },
  { stage: 'Quote requested', id: '' },
  { stage: 'Support',         id: '' }
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
    line: 'Last one from me — shall I close this off, or keep it open for later?' }
];

// The hard stop, enforced in code rather than implied. A lead at this many touches is never
// sent another, whatever the timings say.
const MAX_TOUCHES = 3;

// The stages a lead can still be sequenced in. A lead that has left them is finished, and
// the sequence stops rather than chasing a won or lost job.
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
// Both also need GHL_LOCATION_ID and GHL_API_KEY above; with either blank the workflows stay
// in preview whatever this says.
const DRY_RUN = true;

const MODE = DRY_RUN !== true ? 'live' : 'preview';

// ---------------------------------------------------------------- The demo pipeline
// The leads "02 follow-up sequence" runs against until GoHighLevel is wired up. Every person
// here is invented. The mix is deliberate — it has to show every decision the sequence makes:
//   * 30 h quiet, 0 touches                    -> due touch 1
//   * one touch sent, 80 h quiet                -> due touch 2
//   * 5 h quiet, 0 touches                      -> not due yet
//   * replied 10 h ago                          -> STOP: they replied
//   * stage is 'Won'                            -> STOP: left the sequence
//   * three touches already sent                -> STOP: sequence finished
const DEMO_PIPELINE = [
  { contact_key: 'rachel@brightpath-dental.example', name: 'Rachel Okonkwo', company: 'Brightpath Dental',
    email: 'rachel@brightpath-dental.example', phone: '', contact_id: 'demo-1001', owner: 'Ben',
    stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 30, last_reply_hours_ago: -1 },
  { contact_key: 'tom@beasleylogistics.example', name: 'Tom Beasley', company: 'Beasley Logistics',
    email: 'tom@beasleylogistics.example', phone: '', contact_id: 'demo-1002', owner: 'Cara',
    stage: 'Support', touches_sent: 1, last_touch_hours_ago: 80, last_reply_hours_ago: -1 },
  { contact_key: '07700900456', name: 'Ravi Menon', company: 'Menon & Co',
    email: '', phone: '07700 900456', contact_id: 'demo-1003', owner: 'Ben',
    stage: 'New lead', touches_sent: 0, last_touch_hours_ago: 5, last_reply_hours_ago: -1 },
  { contact_key: 'elena@example.com', name: 'Elena Rossi', company: '',
    email: 'elena@example.com', phone: '', contact_id: 'demo-1004', owner: 'Ada',
    stage: 'Quote requested', touches_sent: 1, last_touch_hours_ago: 100, last_reply_hours_ago: 10 },
  { contact_key: 'june@example.com', name: 'June Park', company: '',
    email: 'june@example.com', phone: '', contact_id: 'demo-1005', owner: 'Ada',
    stage: 'Won', touches_sent: 1, last_touch_hours_ago: 100, last_reply_hours_ago: -1 },
  { contact_key: 'dana@example.com', name: 'Dana Whitfield', company: '',
    email: 'dana@example.com', phone: '', contact_id: 'demo-1006', owner: 'Ada',
    stage: 'New lead', touches_sent: 3, last_touch_hours_ago: 200, last_reply_hours_ago: -1 }
];

const SETTINGS = {
  ghl_location_id: GHL_LOCATION_ID.trim(),
  ghl_api_key:     GHL_API_KEY.trim(),
  ghl_api_base:    GHL_API_BASE.trim().replace(/\/+$/, ''),
  ghl_api_version: GHL_API_VERSION.trim(),

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

  require_contact: REQUIRE_CONTACT === true,
  require_message: REQUIRE_MESSAGE === true,

  stage_on_arrival: 'New lead',

  // derived flags — the gates read these, never the raw constants
  mode:        MODE,
  dry_run:     MODE !== 'live',
  ghl_enabled: MODE === 'live'
    && GHL_LOCATION_ID.trim() !== ''
    && GHL_API_KEY.trim() !== ''
};

// config passes the incoming payload through untouched under `lead`, so whichever trigger
// fired the next node reads the payload from the same place. It runs once per incoming item.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((lead) => ({ json: Object.assign({}, SETTINGS, { lead: lead }) }));
