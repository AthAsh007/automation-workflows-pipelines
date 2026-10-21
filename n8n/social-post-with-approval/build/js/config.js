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

// Append-only. A draft is opened by an `awaiting` row and closed by a later row carrying the
// same Message id: posted | cancelled | expired | superseded | failed. Three statuses annotate
// without closing: edit-refused | alert | report. The full rule is in "find the pending draft".
const LOG_COLUMNS = {
  date:       'Date',
  slug:       'Slug',
  slot:       'Slot',
  status:     'Status',
  channel_id: 'Channel id',
  message_id: 'Message id',   // the Discord draft — how workflow 02 finds the reply
  reply_id:   'Reply id',     // the reviewer message that caused this row, so it is acted on once
  caption_fp: 'Caption fp',   // fingerprint of the delivered caption
  pillar:     'Pillar',       // what topic rotation is measured against
  hook:       'Hook',         // the opening sentence, for the repeated-hook check
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

// Topic rotation, measured in CALENDAR DAYS from the log rather than in slots, so it still
// holds after the bank has been reordered, rows were skipped or a post went out by hand.
//   TOPIC_COOLDOWN_DAYS  a pillar published this recently is held; the next row is tried
//   FAMILY_MAX_PER_WEEK  at most this many posts in any rolling 7 days from one pillar family
//                        (the part before the comma: "AI workflow, reporting" -> "AI workflow")
const TOPIC_COOLDOWN_DAYS = 21;
const FAMILY_MAX_PER_WEEK = 2;

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

// An EDIT is a message whose FIRST LINE is one of these words and whose remaining lines are the
// replacement caption. It is never published directly: it is checked against the same caption
// rules, and if it passes the bot re-delivers it with the same image as a NEW draft that needs
// its own `post`. If it fails, the bot replies with the reasons and the original stays open.
const EDIT_WORDS = ['edit'];

// The line appended under every draft. Workflow 02 strips exactly this string back off before
// fingerprinting, so change it only while no draft is awaiting approval.
const APPROVAL_INSTRUCTION = 'Reply **post** to publish, **cancel** to discard, or **edit** '
  + 'with the new caption on the lines below it.';

// How long a draft stays approvable. After this the day has moved on and the claims in it
// may not have. Workflow 02 marks it expired rather than publishing it.
const APPROVAL_EXPIRES_HOURS = 20;

// When LinkedIn rejects the token on an approved draft, the approval channel is told once, then
// again only after this many hours, not every five minutes for the rest of the day.
const ALERT_REPEAT_HOURS = 6;

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

// LinkedIn access tokens last 60 days and lapse silently. Put the current token's expiry date
// here (YYYY-MM-DD) and every run summary warns TOKEN_WARN_DAYS ahead. Blank -> no early
// warning; an expired token is still caught at publish time and alerted, never failed quietly.
const LINKEDIN_TOKEN_EXPIRES_ON = '';
const TOKEN_WARN_DAYS = 7;

// Weekly report, built from the Log by workflow 02 the first time its poll runs on
// REPORT_WEEKDAY at or after REPORT_HOUR (TIMEZONE). Posted to REPORT_WEBHOOK_URL.
const REPORT_WEEKDAY = 1;   // 1 = Monday
const REPORT_HOUR    = 9;

// Per-post impressions, clicks and reactions in the weekly report. Needs a token with
// r_organization_social, which LinkedIn only grants to apps approved for the Community
// Management API. false -> the report is built from the Log alone. A 403 is reported as that
// product gate, not as a failure.
const STATS_ENABLED = false;

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
const HASHTAGS_LAST_LINE_ONLY = true;   // hashtags mid-caption read as spam
const NO_LINKS_IN_BODY        = true;   // a link in the body cuts reach; it goes in the first comment

// The opening sentence is compared with every hook published in the last HOOK_LOOKBACK_DAYS.
// At or above HOOK_SIMILARITY (share of meaningful words in common) it is held as a repeat.
const HOOK_LOOKBACK_DAYS = 60;
const HOOK_SIMILARITY    = 0.6;

// A MODEL-written caption that fails the rules gets this many rewrites, with the exact failures
// fed back to the model. Still failing -> held for a human. A banked caption is never
// rewritten: a person wrote it, so a person fixes it. 0 -> no rewrite, hold straight away.
const REWRITE_ATTEMPTS = 1;

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

// Workflow 02 demo: with SHEET_ID blank it reads a made-up log holding one open draft and a
// made-up channel holding this reply to it, so the approval gate runs with no Discord bot.
// 'post' | 'cancel' | 'edit' (a clean revision) | 'bad-edit' (one the caption rules refuse)
const DEMO_REPLY = 'edit';

// ---------------------------------------------------------------- Demo bank
// Used only when SHEET_ID is blank. Three posts, three layouts. With the demo log ("load the
// demo log") slot 1 is held by topic rotation, so slot 2 is picked and goes through the
// write -> fail -> rewrite -> pass loop. While the demo bank is in use the run is FORCED into
// preview: made-up content can never reach the company page.
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
    caption: 'Most teams can name the tools they depend on. Far fewer can say what still '
      + 'works when one of them is down for a day.\n\n'
      + 'Before the next outage, sit down with whoever ships your releases and walk through '
      + 'four questions. Could you deploy a fix without the pipeline? Could anyone sign in if '
      + 'single sign-on was down? Do your build outputs exist anywhere else? And when the '
      + 'assistant everyone leans on stops answering, does work stop or just slow down?\n\n'
      + 'None of this needs new software. It needs an afternoon and a written answer to each '
      + 'question, kept somewhere people will actually find it.\n\n'
      + 'The trade-off is real: an answer you wrote down goes stale as the stack changes, so '
      + 'it needs an owner and a review date, or it quietly becomes fiction.\n\n'
      + 'Which of the four would your team struggle with first?\n\n'
      + '(Demo draft, not for publication.)\n\n'
      + '#Resilience #DevOps #Engineering #Demo'
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
    // Blank on purpose: in the demo this row is written by "demo writer - first draft", whose
    // caption breaks four rules, then fixed by "demo writer - rewrite" — the real rewrite loop,
    // with canned model answers standing in for an API key.
    caption: ''
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
    caption: 'The weekly report is rarely slow because of the analysis. It is slow because '
      + 'somebody spends most of a day collecting numbers from five places first.\n\n'
      + 'That collecting is the part worth automating. Pull each export on a schedule, line '
      + 'the figures up, and flag the sources that disagree instead of averaging them away. '
      + 'The person who used to assemble the report now starts the morning with a finished '
      + 'draft and a short list of conflicts to settle.\n\n'
      + 'What does not change is the judgement. When two systems disagree about revenue, a '
      + 'person still decides which one is right, and the report says so.\n\n'
      + 'The limit worth knowing: this only works once the sources have stable exports. If '
      + 'a number lives in somebody\'s head, it has to be written down first.\n\n'
      + 'How many hours does your team spend collecting before anyone analyses anything?\n\n'
      + '(Demo draft, not for publication.)\n\n'
      + '#Reporting #Automation #Operations #Demo'
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

const TOKEN_EXPIRY_MS = Date.parse(String(LINKEDIN_TOKEN_EXPIRES_ON).trim() + 'T00:00:00Z');
const TOKEN_DAYS_LEFT = isNaN(TOKEN_EXPIRY_MS) ? null
  : Math.floor((TOKEN_EXPIRY_MS - Date.now()) / 86400000);

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
    topic_cooldown_days:      Number(TOPIC_COOLDOWN_DAYS) || 0,
    family_max_per_week:      Number(FAMILY_MAX_PER_WEEK) || 0,

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
    edit_words:     lower(EDIT_WORDS),
    approval_instruction: APPROVAL_INSTRUCTION,
    alert_repeat_hours:   Number(ALERT_REPEAT_HOURS) || 6,
    approval_expires_hours: Number(APPROVAL_EXPIRES_HOURS) || 20,
    discord_message_limit:  Number(DISCORD_MESSAGE_LIMIT) || 2000,

    linkedin_org_urn: LINKEDIN_ORG_URN.trim(),
    linkedin_token:   LINKEDIN_ACCESS_TOKEN.trim(),
    linkedin_version: LINKEDIN_VERSION,
    linkedin_token_days_left: TOKEN_DAYS_LEFT,
    token_warn_days:  Number(TOKEN_WARN_DAYS) || 7,
    report_weekday:   Number(REPORT_WEEKDAY) || 1,
    report_hour:      Number(REPORT_HOUR) || 0,

    llm_base_url: LLM_BASE_URL.replace(/\/+$/, ''),
    llm_api_key:  LLM_API_KEY.trim(),
    llm_model:    LLM_MODEL,

    caption_min_words: Number(CAPTION_MIN_WORDS) || 0,
    caption_max_words: Number(CAPTION_MAX_WORDS) || 400,
    hashtags_min:      Number(HASHTAGS_MIN) || 0,
    hashtags_max:      Number(HASHTAGS_MAX) || 6,
    max_emoji:         Number(MAX_EMOJI) || 0,
    banned_phrases:    lower(BANNED_PHRASES),
    hashtags_last_line_only: HASHTAGS_LAST_LINE_ONLY !== false,
    no_links_in_body:   NO_LINKS_IN_BODY !== false,
    hook_lookback_days: Number(HOOK_LOOKBACK_DAYS) || 60,
    hook_similarity:    Number(HOOK_SIMILARITY) || 0.6,
    rewrite_attempts:   Math.max(0, Number(REWRITE_ATTEMPTS) || 0),

    report_webhook_url: REPORT_WEBHOOK_URL.trim(),
    demo_bank:          DEMO_BANK,
    demo_reply:         String(DEMO_REPLY).trim().toLowerCase(),
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
    stats_enabled:   STATS_ENABLED === true && LINKEDIN_ACCESS_TOKEN.trim() !== '' && !USING_DEMO_BANK,
    logo_present:    LOGO_SVG.trim() !== ''
  }
}];
