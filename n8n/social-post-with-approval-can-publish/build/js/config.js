// ACME LINKEDIN DAILY — CONFIG
// Edit values only in this node. Nothing else in either workflow needs changing.
// Both workflows carry an identical copy of this node; change one, change the other.
//
// Any key left blank means that step is SKIPPED, not that the run fails. That is what
// lets the whole pipeline be demonstrated on a screen-share before a single credential
// exists — see LOOM.md.

// ---------------------------------------------------------------- The content sheet
// The id is the long code in the sheet's web address:
// docs.google.com/spreadsheets/d/<THIS BIT>/edit
//
// Blank -> the DEMO_BANK posts below are used instead and nothing is logged. The draft is
// still written, rendered and delivered, so the pipeline can be watched end to end with no
// Google account attached at all.
const SHEET_ID = '';
const BANK_TAB = 'Bank';   // one row per post, in publish order. sheet/Bank.csv
const LOG_TAB  = 'Log';    // append-only outcome log. sheet/Log.csv

// Column headings, exactly as they appear in row 1 of each tab.
const BANK_COLUMNS = {
  slot:          'Slot',
  slug:          'Slug',
  pillar:        'Pillar',
  category:      'Category',
  headline:      'Headline',
  headline_size: 'Headline size',
  subhead:       'Subhead',
  layout:        'Layout',
  items:         'Items',        // JSON array — shape depends on Layout
  band:          'Band',         // grid only
  stat_big:      'Stat big',     // stat only
  stat_sub:      'Stat sub',     // stat only
  footer:        'Footer',
  caption:       'Caption',      // blank -> written by the model, if one is configured
  state:         'State'         // ready | posted | cancelled | holding
};

const LOG_COLUMNS = {
  date:       'Date',
  slug:       'Slug',
  slot:       'Slot',
  status:     'Status',       // awaiting | posted | cancelled | expired | skipped | failed
  channel_id: 'Channel id',
  message_id: 'Message id',   // the Discord draft — how workflow 02 finds the reply
  caption_fp: 'Caption fp',   // fingerprint of the delivered caption
  urn:        'Post urn',
  note:       'Note',
  at:         'At'
};

// Only these bank states are drafted. Anything else is treated as already handled.
const READY_STATES = ['', 'ready'];

// ---------------------------------------------------------------- When it runs
// The schedule lives on the trigger node, not here — this is the guard that stops a manual
// run at 11pm on a Sunday from putting a post out on a day it should not.
// 1 = Monday ... 7 = Sunday.
const PUBLISH_DAYS = [1, 2, 3, 4, 5];
const TIMEZONE     = 'Asia/Singapore';

// Design-side posts go out on Thursdays. build.js in the drafts repo enforces this at build
// time; this is the same rule enforced again at publish time, because the bank can be
// reordered in the sheet long after it was built.
const DESIGN_PILLAR_PREFIX     = 'Design process';
const ENFORCE_DESIGN_THURSDAY  = true;
const OFF_CADENCE_DESIGN_SLOTS = [6];   // slot 6 is a Friday, and went out that way on purpose

// No two posts published within this many slots may share a layout or a pillar. Five is a
// publishing week at the weekday cadence. Measured in slots, not dates.
const WINDOW_SLOTS = 5;

// ---------------------------------------------------------------- Brand system
// DESIGN.md is the source of record for all of this. Changing a colour here changes every
// future render; it does not reflow anything already published.
const BRAND = {
  bg:          '#050505',
  accent:      '#DC2056',
  white:       '#FFFFFF',
  muted:       '#A8A8A8',
  line:        '#303030',
  card_border: '#262626',
  card_bg:     '#0B0B0B',
  font:        'Arial, Helvetica, sans-serif',
  site:        'acme.example'
};

const CANVAS_WIDTH  = 1080;
const CANVAS_HEIGHT = 1350;
const DEVICE_SCALE  = 2;      // 2 -> a 2160x2700 PNG from a 1080x1350 canvas

// The wordmark, inlined into the template. The renderer loads the HTML with no network, so
// nothing here may reference a file or a URL. Paste the contents of acme_logo_12.svg
// (white wordmark, pink mark) between the quotes. Left blank the template falls back to a
// plain text wordmark, which is visibly not the logo — on purpose. A missing logo must look
// missing rather than quietly pass review.
const LOGO_SVG = '';

// ---------------------------------------------------------------- The renderer
// HTML -> PNG. n8n has no browser of its own, so this is one HTTP call out.
//
//   'browserless' — self-hosted, and the one to use. Add it to the same docker-compose file
//                   n8n runs in and point RENDER_URL at http://browserless:3000. Returns
//                   the PNG bytes directly.
//   'hcti'        — htmlcsstoimage.com. RENDER_USER / RENDER_KEY are the API id and key.
//                   Returns a JSON url, which the workflow then downloads.
//   ''            -> no image. The run stops at "STOP: renderer not configured" and delivers
//                    nothing, because a caption without its image is not a draft.
const RENDER_PROVIDER = 'browserless';
const RENDER_URL      = 'http://browserless:3000';
const RENDER_USER     = '';   // hcti only
const RENDER_KEY      = '';   // browserless token, or the hcti api key

// A render that comes back under this many bytes is a blank or half-drawn canvas, not a
// post. Measured against the live bank: the smallest real render is about 87 KB.
const MIN_PNG_BYTES = 40000;

// ---------------------------------------------------------------- Discord approval
// The channel the draft is delivered to, and the only place an approval is read from.
//
// ANYONE WHO CAN SEND A MESSAGE IN THIS CHANNEL CAN PUBLISH TO THE COMPANY PAGE. Use a
// private channel created for this and nothing else — not a general channel, where one
// person typing a common English word publishes a draft.
//
// The bot token goes in an n8n Discord credential, not here.
const DISCORD_CHANNEL_ID = '';

// What a reviewer types. Matched case-insensitively against the whole message, trimmed.
// Trailing text is NOT tolerated: "post" approves, "post please" does not, because the
// looser the match the more ways an unrelated sentence becomes a publish.
const APPROVE_WORDS = ['post', 'approve', 'ship it'];
const CANCEL_WORDS  = ['cancel', 'reject', 'discard'];

// How long a draft stays approvable. After this the day has moved on and the claims in it
// may not have. Workflow 02 marks it expired rather than publishing it.
const APPROVAL_EXPIRES_HOURS = 20;

// ---------------------------------------------------------------- LinkedIn
// The organisation to post as, and the token that may post as it.
// urn:li:organization:<id> — the id is in the page's admin URL.
const LINKEDIN_ORG_URN = 'urn:li:organization:96592857';

// A w_organization_social token. Blank -> nothing is ever published, whatever a reviewer
// replies; the run reaches "STOP: not published" and says why.
const LINKEDIN_ACCESS_TOKEN = '';

// Probed 2026-08-18: 202512 and earlier are retired (HTTP 426 NONEXISTENT_VERSION).
// 202601..202608 are active.
const LINKEDIN_VERSION = '202608';

// ---------------------------------------------------------------- Writing the caption
// Only used for a bank row whose Caption cell is empty. A row that already carries a caption
// is delivered as written — the model never rewrites approved copy.
//
// Blank key -> a row with no caption is held back with a reason, never delivered bare.
const LLM_BASE_URL = 'https://llm.acme.example';
const LLM_API_KEY  = '';
const LLM_MODEL    = 'modelark/seed-2-0-pro-260328';

// The caption rules, from the acme-linkedin-content skill. These are handed to the model
// and are also checked in code afterwards, because a model asked for 220 words will
// sometimes write 340 and say it wrote 220.
const CAPTION_MIN_WORDS = 120;
const CAPTION_MAX_WORDS = 220;
const HASHTAGS_MIN      = 4;
const HASHTAGS_MAX      = 6;
const MAX_EMOJI         = 1;

// Rejected outright, in a written caption or a banked one. A caption that trips this is held
// back with the phrase named, never quietly edited.
const BANNED_PHRASES = [
  'game changer', 'game-changer', 'revolutionary', 'the future is here',
  'cutting edge', 'cutting-edge', 'unlock the power', 'next level',
  'fast-paced world', 'seamlessly', 'synergy', 'paradigm shift',
  'thought leader', 'disrupt', 'skyrocket', 'supercharge',
  'best-in-class', 'world-class', 'leverage our'
];

// Discord's hard limit on one message is 2000 characters. The caption travels in the message
// body so the reviewer reads exactly what would be published.
const DISCORD_MESSAGE_LIMIT = 2000;

// ---------------------------------------------------------------- Optional notification
const REPORT_WEBHOOK_URL = '';   // Slack incoming webhook. Blank = no notification.

// ---------------------------------------------------------------- Demo bank
// Used only when SHEET_ID is blank. Three posts, three layouts, so a screen-share shows the
// renderer doing real work before any Google account is attached. While the demo bank is in
// use the run is FORCED into preview: made-up content can never reach the company page.
const DEMO_BANK = [
  {
    slot: 1, slug: 'demo-map-the-failure-mode', pillar: 'Engineering insight',
    category: 'RESILIENCE',
    headline: 'ONE OUTAGE.<br>HOW MANY<br><em>BLOCKED TEAMS</em>?',
    headline_size: 94,
    subhead: 'A dependency you never wrote down is still a dependency.',
    layout: 'timeline',
    items: [
      ['Ship a hotfix', 'Without the pipeline, what is your deploy path?'],
      ['Authenticate', 'If SSO is down, who can still get in?'],
      ['Build artifacts', 'Do they exist anywhere other than there?'],
      ['Your assistant', 'Work stopped, or just slower?']
    ],
    footer: 'Map the failure mode first.',
    caption: 'DEMO DRAFT — not for publication.\n\nThis is what the pipeline delivers '
      + 'for review every morning: a caption, and the image it would go out with.\n\nThe '
      + 'layout, the palette and the one-accent rule come from the design system, applied '
      + 'in code rather than retyped each time.\n\n#Demo #Acme'
  },
  {
    slot: 2, slug: 'demo-never-approve-your-own-work',
    pillar: 'Production AI guardrails', category: 'AI GUARDRAILS',
    headline: 'NEVER APPROVE<br><em>YOUR OWN WORK</em>.',
    headline_size: 90,
    subhead: 'Four things a workflow must never read as a human saying yes.',
    layout: 'grid',
    items: [
      ['Its own message', 'The draft it just posted for review'],
      ['Another bot', 'A second agent is not a second opinion'],
      ['Silence', 'Nobody objected is not anybody approved'],
      ['A reaction', 'A thumbs-up is not a signature']
    ],
    band: 'APPROVAL IS A HUMAN, IN THE RIGHT CHANNEL.',
    footer: 'Everything else is the system agreeing with itself.',
    caption: 'DEMO DRAFT — not for publication.\n\nThe approval gate in this pipeline '
      + 'reads one channel and ignores its own messages. That is the whole guardrail.\n\n'
      + '#Demo #Acme'
  },
  {
    slot: 3, slug: 'demo-reporting-costs-a-day', pillar: 'AI workflow, reporting',
    category: 'REPORTING',
    headline: 'IT ISN’T ANALYSIS.<br>IT’S <em>COLLECTION</em>.',
    headline_size: 92,
    subhead: 'A day of assembling. Four minutes of reading.',
    layout: 'cards',
    items: [
      ['STEP 01 · COLLECT', 'Numbers<br>assemble', 'Exports and systems pulled on a schedule.'],
      ['STEP 02 · RECONCILE', 'Conflicts<br>surface', 'Sources that disagree get flagged, never averaged.'],
      ['STEP 03 · DECIDE', 'Stays<br>human', 'Someone still decides which system is right.']
    ],
    footer: 'The judgement stays. The copying goes.',
    caption: 'DEMO DRAFT — not for publication.\n\nThird layout, same build node. The '
      + 'bank row picks the layout; nothing downstream changes.\n\n#Demo #Acme'
  }
];

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_CHANNEL_ID blank -> PREVIEW. The draft is written and rendered so
//                                            you can look at the PNG, but it is delivered
//                                            nowhere and published nowhere. Ships this way.
//   TEST_RUN true,  TEST_CHANNEL_ID set   -> TEST. The draft really is delivered, to that
//                                            channel instead of the live one, and approvals
//                                            are read there. LinkedIn is still never
//                                            published to.
//   TEST_RUN false                        -> LIVE. Delivered to DISCORD_CHANNEL_ID, and an
//                                            approval there publishes to the company page.
//
// Filling in TEST_CHANNEL_ID can only ever redirect a delivery. It cannot cause a publish —
// going live is the separate, deliberate act of setting TEST_RUN = false.
const TEST_RUN        = true;
const TEST_CHANNEL_ID = '';

// Hard ceiling on posts published per run. One a day is the whole design; this exists so a
// bad batch of rows cannot become a bad batch of posts.
const DAILY_CAP = 1;

// ---------------------------------------------------------------- derived
const USING_DEMO_BANK = SHEET_ID.trim() === '';

let MODE = TEST_RUN !== true ? 'live'
  : (TEST_CHANNEL_ID.trim() !== '' ? 'test' : 'preview');

// Demo content is not a post. It cannot open the publish gate, whatever TEST_RUN says.
const FORCED_PREVIEW = USING_DEMO_BANK && MODE === 'live';
if (FORCED_PREVIEW) MODE = 'preview';

const CHANNEL_ID = MODE === 'test' ? TEST_CHANNEL_ID.trim() : DISCORD_CHANNEL_ID.trim();

const lower = (a) => a.map((s) => String(s).trim().toLowerCase()).filter(Boolean);

return [{
  json: {
    sheet_id: SHEET_ID.trim(),
    bank_tab: BANK_TAB,
    log_tab:  LOG_TAB,
    bank_columns: BANK_COLUMNS,
    log_columns:  LOG_COLUMNS,
    ready_states: READY_STATES.map((s) => String(s).trim().toLowerCase()),

    publish_days: PUBLISH_DAYS.map(Number),
    timezone:     TIMEZONE,

    design_pillar_prefix:     DESIGN_PILLAR_PREFIX,
    enforce_design_thursday:  ENFORCE_DESIGN_THURSDAY !== false,
    off_cadence_design_slots: OFF_CADENCE_DESIGN_SLOTS.map(Number),
    window_slots:             Number(WINDOW_SLOTS) || 5,

    brand:         BRAND,
    canvas_width:  Number(CANVAS_WIDTH) || 1080,
    canvas_height: Number(CANVAS_HEIGHT) || 1350,
    device_scale:  Number(DEVICE_SCALE) || 1,
    logo_svg:      LOGO_SVG,

    render_provider: RENDER_PROVIDER.trim().toLowerCase(),
    render_url:      RENDER_URL.replace(/\/+$/, ''),
    render_user:     RENDER_USER.trim(),
    render_key:      RENDER_KEY.trim(),
    min_png_bytes:   Number(MIN_PNG_BYTES) || 0,

    channel_id:     CHANNEL_ID,
    approve_words:  lower(APPROVE_WORDS),
    cancel_words:   lower(CANCEL_WORDS),
    approval_expires_hours: Number(APPROVAL_EXPIRES_HOURS) || 20,
    discord_message_limit:  Number(DISCORD_MESSAGE_LIMIT) || 2000,

    linkedin_org_urn: LINKEDIN_ORG_URN.trim(),
    linkedin_token:   LINKEDIN_ACCESS_TOKEN.trim(),
    linkedin_version: LINKEDIN_VERSION,

    llm_base_url: LLM_BASE_URL.replace(/\/+$/, ''),
    llm_api_key:  LLM_API_KEY.trim(),
    llm_model:    LLM_MODEL,

    caption_min_words: Number(CAPTION_MIN_WORDS) || 0,
    caption_max_words: Number(CAPTION_MAX_WORDS) || 400,
    hashtags_min:      Number(HASHTAGS_MIN) || 0,
    hashtags_max:      Number(HASHTAGS_MAX) || 6,
    max_emoji:         Number(MAX_EMOJI) || 0,
    banned_phrases:    lower(BANNED_PHRASES),

    report_webhook_url: REPORT_WEBHOOK_URL.trim(),
    demo_bank:          DEMO_BANK,
    daily_cap:          Number(DAILY_CAP) || 1,

    // derived flags — every gate reads these, never the raw constants
    mode:            MODE,
    preview_only:    MODE === 'preview',
    test_delivery:   MODE === 'test',
    live_publish:    MODE === 'live' && LINKEDIN_ACCESS_TOKEN.trim() !== '',
    sheet_enabled:   SHEET_ID.trim() !== '',
    using_demo_bank: USING_DEMO_BANK,
    forced_preview:  FORCED_PREVIEW,
    render_enabled:  RENDER_PROVIDER.trim() !== '' && RENDER_URL.trim() !== '',
    deliver_enabled: MODE !== 'preview' && CHANNEL_ID !== '',
    llm_enabled:     LLM_API_KEY.trim() !== '',
    report_enabled:  REPORT_WEBHOOK_URL.trim() !== '',
    logo_present:    LOGO_SVG.trim() !== ''
  }
}];
