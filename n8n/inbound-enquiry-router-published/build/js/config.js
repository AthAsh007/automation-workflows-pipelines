// COMMERCIAL CLEANING — ENQUIRY PIPELINE — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// This same block appears in BOTH workflows ("01 capture and reply" and
// "02 chase and digest"). If you change it in one, paste it into the other.

// ---------------------------------------------------------------- Your tracking sheet
// The id is the long code in the sheet's web address:
// docs.google.com/spreadsheets/d/<THIS BIT>/edit
const TRACKER_SHEET_ID = '';
const TRACKER_TAB      = 'Enquiries';

// The column headings, exactly as they appear in row 1 of the sheet.
const COLUMNS = {
  ref:          'Ref',
  received:     'Received',
  stage:        'Stage',
  owner:        'Owner',
  owner_email:  'Owner email',
  company:      'Company',
  contact:      'Contact',
  email:        'Email',
  phone:        'Phone',
  postcode:     'Postcode',
  area:         'Area',
  premises:     'Premises',
  message:      'What they said',
  sqft:         'Sq ft',
  frequency:    'Frequency',
  access:       'Access',
  last_touch:   'Last touch',
  chases_sent:  'Chases sent',
  next_action:  'Next action',
  notes:        'Notes'
};

// ---------------------------------------------------------------- Who quotes where
// Postcodes are matched on the longest prefix that fits, so 'SW1' beats 'SW'.
// Spaces and case are ignored: "sw1a 1aa" matches 'SW1A', 'SW1' or 'SW'.
const AREAS = [
  { area: 'North',      owner: 'Sam',   email: '', postcodes: ['N', 'EN', 'HA', 'NW'] },
  { area: 'South',      owner: 'Priya', email: '', postcodes: ['SW', 'SE', 'CR', 'BR'] },
  { area: 'East',       owner: 'Dan',   email: '', postcodes: ['E', 'IG', 'RM'] },
  { area: 'West',       owner: 'Priya', email: '', postcodes: ['W', 'UB', 'TW'] },
  { area: 'Central',    owner: 'Sam',   email: '', postcodes: ['EC', 'WC'] }
];

// Anything that does not match an area above, or arrives with no postcode at all.
const FALLBACK = { area: 'Unassigned', owner: 'Office', email: '' };

// ---------------------------------------------------------------- The first reply
const COMPANY_NAME = 'Your Cleaning Company';
const FROM_NAME    = 'Your Cleaning Company';
const REPLY_TO     = '';          // where replies from customers should land
const PHONE        = '';
const WEBSITE      = '';

// The questions you always end up asking. Add or reword freely; the email and the
// sheet columns follow whatever is in this list.
const QUESTIONS = [
  'Roughly how many square feet is the space, or how many rooms and floors?',
  'How often would you like it cleaned — daily, a few times a week, weekly, or a one-off?',
  'When can our team get access, and is there anything they need to get in (keys, fob, alarm code)?'
];

// ---------------------------------------------------------------- Chasing
const CHASE_AFTER_HOURS = 48;   // no movement for this long and the owner gets a nudge
const CHASE_MAX         = 2;    // stop nudging after this many, so nobody gets spammed
const DIGEST_TO         = '';   // who gets the morning summary. Blank = no digest.
const DIGEST_ALWAYS     = true; // send the digest even on a quiet day

// The stages a job moves through. Anything in OPEN_STAGES is still live and can be
// chased; anything else is finished and is left alone.
const STAGE_ON_ARRIVAL  = 'New';
const STAGE_AFTER_REPLY = 'Questions sent';
const OPEN_STAGES       = ['New', 'Questions sent', 'Answers in', 'Quoting', 'Quoted'];

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_EMAIL blank -> PREVIEW. Nothing is emailed. The sheet is still
//                                      written, so you can watch enquiries land.
//   TEST_RUN true,  TEST_EMAIL set   -> TEST. Emails really send, but every one goes to
//                                      TEST_EMAIL instead of the customer.
//   TEST_RUN false                   -> LIVE. Customers get the real thing.
const TEST_RUN   = true;
const TEST_EMAIL = '';

const MODE = TEST_RUN !== true ? 'live'
  : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');

return [{
  json: {
    tracker_sheet_id: TRACKER_SHEET_ID,
    tracker_tab:      TRACKER_TAB,
    columns:          COLUMNS,

    areas:    AREAS,
    fallback: FALLBACK,

    company_name: COMPANY_NAME,
    from_name:    FROM_NAME,
    reply_to:     REPLY_TO.trim(),
    phone:        PHONE.trim(),
    website:      WEBSITE.trim(),
    questions:    QUESTIONS,

    chase_after_hours: Number(CHASE_AFTER_HOURS) || 48,
    chase_max:         Number(CHASE_MAX) || 0,
    digest_to:         DIGEST_TO.trim(),
    digest_always:     DIGEST_ALWAYS === true,

    stage_on_arrival:  STAGE_ON_ARRIVAL,
    stage_after_reply: STAGE_AFTER_REPLY,
    open_stages:       OPEN_STAGES,

    // derived flags - the gates read these, never the raw constants
    mode:          MODE,
    preview_only:  MODE === 'preview',
    test_send:     MODE === 'test',
    live_send:     MODE === 'live',
    send_enabled:  MODE !== 'preview',
    test_email:    TEST_EMAIL.trim(),
    digest_enabled: DIGEST_TO.trim() !== ''
  }
}];
