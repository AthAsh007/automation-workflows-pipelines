// ACME EMAIL OUTREACH — CONFIG
// Edit values only in this node. Nothing else in this workflow needs changing.
//
// TEST_RUN true         -> nothing reaches a lead. Ships true; see the block below.
// GITHUB_TOKEN blank    -> the run stops at "GitHub configured?" and touches nothing.
// LLM_API_KEY blank     -> the copy is used exactly as built, no AI pass.
// REPORT_WEBHOOK_URL '' -> no run report is posted.

// ---------------------------------------------------------------- Google Sheet
// The lead tracker. Copy the id out of the sheet URL:
// docs.google.com/spreadsheets/d/<THIS BIT>/edit
const LEAD_SHEET_ID  = '';
const LEAD_SHEET_TAB = 'Lead Tracker';

// Header names as they appear in row 1. Rename here if the sheet is renamed.
const COLUMNS = {
  row_id:        '#',
  business:      'Business Name',
  type:          'Type',
  website:       'Website / Link',
  task_progress: 'Task Progress',
  dev:           'Dev on task',
  segment:       'Segment / Positioning',
  specialty:     'Specialty Focus',
  email:         'Email',
  priority:      'Priority',
  diagnosis:     'Facelift / CRO Diagnosis',
  pitch_angle:   'Best Pitch Angle',
  status:        'Contact Status',
  method:        'Method of Contact',
  next_action:   'Next Action',
  notes:         'Notes',
  redesign_link: 'Link to the redesign website',
  email_title:   'Email Title',
  email_content: 'Email Content'
};

// ---------------------------------------------------------------- Which rows go out
// A row is emailed when Task Progress matches. Either gate can be left blank to skip
// that column entirely, so you can key off Task Progress, off Status, or off both.
const SEND_WHEN_TASK_PROGRESS = 'Ready for outreach';
const SEND_WHEN_STATUS        = '';   // '' = ignore Contact Status when picking rows
// Both are trimmed and compared case-insensitively.

// The redesign-link column is internal: it points at the deliverables for our own
// reference and never appears in a client's email. Nothing depends on it being filled.
const REQUIRE_REDESIGN_LINK   = false;
const REQUIRE_EMAIL_CHANNEL   = true;   // "Method of Contact" must mention Email
const ONLY_DEV                = '';     // e.g. 'Acme' to send one dev's batch only

// Written back after a successful send. Blank leaves that column alone.
// Contact Status is a dropdown in the sheet, so STATUS_AFTER_SEND must match one of its
// options exactly - same spelling, same capitalisation, no stray space. Anything else
// gets flagged by the sheet's data validation, or rejected outright if it is set to
// "Reject input".
const TASK_PROGRESS_AFTER_SEND = 'Completed';
const STATUS_AFTER_SEND        = 'Contacted';

// Written back when the repo has nothing for that domain. Blank leaves it alone, so
// the row keeps its place in the pipeline and simply gets a note and a next action.
const TASK_PROGRESS_NO_DELIVERABLES = '';
const STATUS_NO_DELIVERABLES        = '';

// ---------------------------------------------------------------- GitHub deliverables
const GITHUB_OWNER   = 'acmetechnology';
const GITHUB_REPO    = 'website-growth-services';
const GITHUB_BRANCH  = 'main';
const GITHUB_PATH    = 'client-deliverables';
// Fine-grained PAT, Contents: Read-only, on this repo. Required — the repo is private.
const GITHUB_TOKEN   = '';

// ---------------------------------------------------------------- Sending
const FROM_EMAIL   = '';
const FROM_NAME    = 'Acme';
const REPLY_TO     = '';
const BCC_EMAIL    = '';          // your own address, so every send is filed
// Contact block, printed at the foot of every email.
const SITE_URL     = 'https://www.acme.example/';
const BOOKING_URL  = 'https://cal.com/technology-acme-5xrlv1/15min';
const WHATSAPP     = '+65 9851 1711';
const SIGNOFF_NAME = 'Operator';
const SIGNOFF_ROLE = 'Acme';
const SUBJECT_TEMPLATE = '{business} — two sample redesigns, attached';

// One safety switch, and the address decides how far a test run goes.
//
//   TEST_RUN true,  TEST_EMAIL blank  -> PREVIEW. Nothing is sent and nothing is
//                                        written. Every lead stops carrying the
//                                        finished subject, html and text to read.
//   TEST_RUN true,  TEST_EMAIL set    -> TEST. The emails really send, but every one
//                                        goes to TEST_EMAIL instead of the lead, with
//                                        the intended recipient named in the subject.
//                                        The sheet is still left alone.
//   TEST_RUN false                    -> LIVE. Real recipients, and the row is
//                                        written back.
//
// Filling in TEST_EMAIL can therefore only ever redirect a send, never cause one:
// going live is always the separate, deliberate act of setting TEST_RUN to false.
const TEST_RUN   = true;
const TEST_EMAIL = '';

// How many leads a TEST run actually mails. A test is for reading the email, not
// for filling your inbox, so this defaults to 1 - the highest-priority eligible row.
// It applies only in test mode; a preview builds the whole batch and a live run
// uses DAILY_CAP.
const TEST_BATCH = 1;

const DAILY_CAP  = 10;    // hard ceiling on sends per execution

// ---------------------------------------------------------------- Attachments
// There is no website to link to, so the designs travel with the email.
//
// Set MAILBOX_LIMIT_MB to the recipient's message limit as their provider states it:
// Gmail and Microsoft 365 are 25 MB, Outlook.com is 20 MB, plenty of corporate gateways
// are 10 MB. It is NOT the file budget - attachments are base64-encoded on the way out,
// which adds about 37%, so a 25 MB mailbox only takes ~18 MB of actual files. The raw
// budget is derived from this, with a little room left for the message body.
//
// PDFs are planned first, so a client whose PDFs fit but whose PDFs plus previews do
// not still gets the PDFs. Measured over the 43 client folders at a 25 MB limit:
// 31 get the PDFs (22 with previews too), and the other 12 have PDF sets of 17-45 MB
// that no mailbox will accept.
const MAILBOX_LIMIT_MB = 25;
const ATTACH_PDFS      = true;    // print-quality, the real deliverable
const ATTACH_PNGS      = true;    // full-page previews, added if there is room left

// ---------------------------------------------------------------- Optional AI polish
// Rewrites the subject line and opening paragraph only. Every fact, link and tip
// in the email is built in code and is never handed to the model.
const LLM_BASE_URL = 'https://llm.acme.example';
const LLM_API_KEY  = '';
const LLM_MODEL    = 'modelark/seed-2-0-pro-260328';

// ---------------------------------------------------------------- Optional report
const REPORT_WEBHOOK_URL = '';

const MODE = TEST_RUN !== true ? 'live'
  : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');

return [{
  json: {
    lead_sheet_id:  LEAD_SHEET_ID,
    lead_sheet_tab: LEAD_SHEET_TAB,
    columns:        COLUMNS,

    send_when_task_progress: SEND_WHEN_TASK_PROGRESS.trim(),
    send_when_status:        SEND_WHEN_STATUS.trim(),
    require_redesign_link:   REQUIRE_REDESIGN_LINK,
    require_email_channel:   REQUIRE_EMAIL_CHANNEL,
    only_dev:                ONLY_DEV.trim(),

    task_progress_after_send:      TASK_PROGRESS_AFTER_SEND.trim(),
    status_after_send:             STATUS_AFTER_SEND.trim(),
    task_progress_no_deliverables: TASK_PROGRESS_NO_DELIVERABLES.trim(),
    status_no_deliverables:        STATUS_NO_DELIVERABLES.trim(),

    github_owner:  GITHUB_OWNER,
    github_repo:   GITHUB_REPO,
    github_branch: GITHUB_BRANCH,
    github_path:   GITHUB_PATH.replace(/^\/+|\/+$/g, ''),
    github_auth:   'Bearer ' + GITHUB_TOKEN.trim(),

    from_email:       FROM_EMAIL.trim(),
    from_name:        FROM_NAME,
    from_header:      FROM_NAME ? FROM_NAME + ' <' + FROM_EMAIL.trim() + '>' : FROM_EMAIL.trim(),
    reply_to:         REPLY_TO.trim(),
    bcc_email:        BCC_EMAIL.trim(),
    site_url:         SITE_URL,
    booking_url:      BOOKING_URL,
    whatsapp:         WHATSAPP.trim(),
    whatsapp_link:    'https://wa.me/' + WHATSAPP.replace(/[^0-9]/g, ''),
    signoff_name:     SIGNOFF_NAME,
    signoff_role:     SIGNOFF_ROLE,
    subject_template: SUBJECT_TEMPLATE,

    daily_cap:  Number(DAILY_CAP) || 0,
    attach_pngs:      ATTACH_PNGS === true,
    attach_pdfs:      ATTACH_PDFS === true,
    mailbox_limit_mb: Number(MAILBOX_LIMIT_MB) || 0,
    // raw bytes: strip the ~37% base64 inflation and reserve 256 KB for the message itself
    attach_budget: Math.max(0,
      Math.floor(((Number(MAILBOX_LIMIT_MB) || 0) * 1048576 - 262144) / 1.37)),
    test_email: TEST_EMAIL.trim(),
    test_batch: Number(TEST_BATCH) || 1,

    llm_base_url: LLM_BASE_URL.replace(/\/+$/, ''),
    llm_api_key:  LLM_API_KEY.trim(),
    llm_model:    LLM_MODEL,

    report_webhook_url: REPORT_WEBHOOK_URL.trim(),

    // derived flags - gates read these, never the raw constants
    github_enabled: GITHUB_TOKEN.trim() !== '',
    llm_enabled:    LLM_API_KEY.trim() !== '',
    report_enabled: REPORT_WEBHOOK_URL.trim() !== '',

    mode:         MODE,               // 'preview' | 'test' | 'live'
    preview_only: MODE === 'preview', // built, shown, never sent
    test_send:    MODE === 'test',    // sent, but redirected to TEST_EMAIL
    live_send:    MODE === 'live',    // the only mode that writes to the sheet
    send_enabled: MODE !== 'preview'
  }
}];
