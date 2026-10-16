// SUPPORT EMAIL RAG RESPONDER — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows ("01 answer support email" and
// "02 load knowledge base"). build.js regenerates both from this one file, and validate.js
// fails if they drift apart, so you never paste it between them by hand.
//
// No API key is written here. OpenAI, Pinecone and Gmail are connected as n8n credentials on
// the nodes named [cred] ..., so the exported JSON never carries a secret. The switches below
// only say whether those credentials are in place.
//
// With everything below left as shipped, both workflows run end to end on the built-in demo
// emails and demo knowledge base, and nothing is sent, embedded or written anywhere.

// ---------------------------------------------------------------- Who is answering
const COMPANY_NAME = 'Demo Agency';
// How every automated reply is signed.
const SIGNATURE    = 'The Demo Agency support team';
// Where escalations go: the person or shared inbox that picks up what the workflow will not
// answer on its own. Blank -> escalations are built and shown, never sent.
const SUPPORT_TEAM_EMAIL = '';
// Your own sending addresses. Mail from these is never answered, so the workflow cannot reply
// to its own replies.
const OWN_ADDRESSES = [];

// ---------------------------------------------------------------- OpenAI
// true once an OpenAI credential is attached to the three [cred] OpenAI nodes in 01 and the
// one in 02. false -> classification runs on the keyword rules below, and replies are written
// from the matched knowledge with a fixed template. The run still completes.
const USE_OPENAI         = false;
const OPENAI_CHAT_MODEL  = 'gpt-4o-mini';
const OPENAI_EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMENSIONS   = 1536;     // must match the Pinecone index

// ---------------------------------------------------------------- Pinecone
// The index host from the Pinecone console, e.g. https://support-kb-abc123.svc.us-east-1.pinecone.io
// The API key goes in an n8n "Header Auth" credential (name: Api-Key) on the [cred] Pinecone
// nodes. Blank host -> the built-in demo knowledge base below is searched instead.
const PINECONE_INDEX_HOST = '';
const PINECONE_NAMESPACE  = 'support-kb';
const TOP_K               = 4;       // how many knowledge chunks are retrieved per email

// ---------------------------------------------------------------- The two gates
// The workflow only answers when it is sure on BOTH counts. Anything below either floor goes
// to a person, never to a guess.
//
// Classification: how confident the classifier must be that this is (or is not) a support
// request before acting on it.
const MIN_CLASSIFY_CONFIDENCE = 0.6;
// Knowledge: the best retrieved chunk must score at least this. Pinecone returns cosine
// similarity (0..1); the demo knowledge base uses a simpler word-overlap score, so it has its
// own floor.
const MIN_MATCH_SCORE      = 0.75;
const DEMO_MIN_MATCH_SCORE = 0.3;

// Keyword rules. They always run: with USE_OPENAI = false they ARE the classifier, and with it
// on they are the fallback when the model call fails or its answer does not parse.
const SUPPORT_WORDS = ['help', 'issue', 'problem', 'error', 'not working', 'broken', "can't", 'cannot',
  'unable', 'how do i', 'how can i', 'password', 'login', 'log in', 'access', 'invoice', 'billing',
  'payment', 'report', 'dashboard', 'account', 'question', 'support', 'reset', 'update my', 'change my'];
const NOT_SUPPORT_WORDS = ['partnership', 'guest post', 'backlink', 'seo services', 'our services',
  'sponsorship', 'collaboration', 'newsletter', 'unsubscribe', 'webinar', 'special offer',
  'limited time', 'book a demo with us', 'we help agencies'];
// Intents that always go to a person, however good the knowledge match. The email most likely
// to be made worse by an automated answer is the angry one.
const HANDOFF_WORDS = ['refund', 'chargeback', 'complaint', 'unacceptable', 'lawyer', 'legal',
  'cancel my contract', 'cancel our contract', 'terminate', 'third time', 'furious', 'disappointed'];
const HANDOFF_INTENTS = ['complaint', 'refund', 'legal', 'cancellation'];

// ---------------------------------------------------------------- Knowledge base (workflow 02)
// Public URLs of help pages or docs to load into Pinecone. Blank -> the demo knowledge base
// below is chunked and shown instead.
const DOC_URLS      = [];
const CHUNK_WORDS   = 160;
const CHUNK_OVERLAP = 30;

// ---------------------------------------------------------------- Safety switch
// TEST_RUN = true and TEST_EMAIL blank -> PREVIEW. Every reply and escalation is built in full
// and shown on a STOP node; nothing is sent, nothing is upserted.
// TEST_RUN = true and TEST_EMAIL set  -> TEST. Replies and escalations are sent, but all of them
// to TEST_EMAIL, at most TEST_CAP per run, marked [TEST]. Knowledge can be upserted.
// TEST_RUN = false                     -> LIVE. Replies go to the customer, in their thread.
const TEST_RUN   = true;
const TEST_EMAIL = '';
const TEST_CAP   = 3;
// Hard ceiling on customer replies in one run, enforced in code.
const REPLY_CAP_PER_RUN = 20;

const MODE = TEST_RUN !== true ? 'live' : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');

// ---------------------------------------------------------------- Demo data
// Invented. Used only when nothing is connected, so the whole run can be watched first.
const DEMO_KNOWLEDGE = [
  { id: 'portal-access', title: 'Logging in to the client portal',
    text: 'To reset your client portal password, open the portal login page and click "Forgot password". '
      + 'Enter the email address your account was set up with and we send a reset link that is valid for 60 minutes. '
      + 'If the link has expired, request a new one. If you no longer have access to that email address, reply to your '
      + 'account manager and we will move the login to a new address after confirming it with the account owner.' },
  { id: 'invoices', title: 'Invoices and billing',
    text: 'Invoices are issued on the 1st of each month and emailed to the billing contact on file. Payment is due '
      + 'within 14 days by bank transfer or card. You can download past invoices from Billing in the client portal. '
      + 'To change the billing contact or the company details printed on the invoice, reply with the new details '
      + 'and they will appear from the next invoice.' },
  { id: 'reporting', title: 'Monthly reports',
    text: 'Performance reports are published in the client portal by the 5th working day of each month and a link is '
      + 'emailed to the report contacts on your account. Live dashboards update daily. To add someone to the report '
      + 'emails, reply with their name and email address.' },
  { id: 'campaign-changes', title: 'Requesting campaign changes',
    text: 'Budget changes, pausing a campaign and new creative requests are handled within two working days of the '
      + 'request. Urgent pauses are actioned the same working day if requested before 3pm. Send change requests to '
      + 'support with the campaign name and the change you need.' },
  { id: 'onboarding', title: 'Onboarding a new account',
    text: 'New accounts need admin access to the ad accounts, analytics and the website tag manager. Your onboarding '
      + 'checklist in the client portal lists each access request, and the first campaigns go live about ten working '
      + 'days after all access is granted.' }
];

const DEMO_EMAILS = [
  { from: 'Priya Shah <priya@example.com>', subject: 'Locked out of the portal',
    text: "Hi, I can't log in to the client portal. How do I reset my password?",
    id: 'demo-msg-001', threadId: 'demo-thread-001', messageId: '<a1@example.com>' },
  { from: 'Tom Reid <tom@example.org>', subject: 'Re: March invoice',
    text: 'Thanks. Can you change the billing contact on our invoice to accounts@example.org please?',
    id: 'demo-msg-002', threadId: 'demo-thread-777', messageId: '<b2@example.org>',
    inReplyTo: '<prev-777@demo-agency.example>' },
  { from: 'Ana Lopez <ana@example.net>', subject: 'TikTok Shop',
    text: 'Hello, we have a problem connecting our TikTok Shop catalogue to the product feed. Can you help?',
    id: 'demo-msg-003', threadId: 'demo-thread-003', messageId: '<c3@example.net>' },
  { from: 'Growth Partners <hello@example.com>', subject: 'Partnership opportunity',
    text: 'We help agencies scale with white-label SEO services. Interested in a partnership? Book a demo with us.',
    id: 'demo-msg-004', threadId: 'demo-thread-004', messageId: '<d4@example.com>' },
  { from: 'Mark Evans <mark@example.co.uk>', subject: 'Report late AGAIN',
    text: 'This is the third time our monthly report is late. Frankly unacceptable, and I want a refund for this month.',
    id: 'demo-msg-005', threadId: 'demo-thread-005', messageId: '<e5@example.co.uk>' },
  { from: '', subject: '', text: '', id: 'demo-msg-006', threadId: 'demo-thread-006', messageId: '' }
];

const SETTINGS = {
  company_name:       COMPANY_NAME.trim(),
  signature:          SIGNATURE.trim(),
  support_team_email: SUPPORT_TEAM_EMAIL.trim(),
  own_addresses:      OWN_ADDRESSES.map((a) => String(a).trim().toLowerCase()).filter(Boolean),

  openai_chat_model:  OPENAI_CHAT_MODEL.trim(),
  openai_embed_model: OPENAI_EMBED_MODEL.trim(),
  embed_dimensions:   Number(EMBED_DIMENSIONS) || 1536,

  pinecone_index_host: PINECONE_INDEX_HOST.trim().replace(/\/+$/, ''),
  pinecone_namespace:  PINECONE_NAMESPACE.trim(),
  top_k:               Number(TOP_K) || 4,

  min_classify_confidence: Number(MIN_CLASSIFY_CONFIDENCE) || 0.6,
  min_match_score:         Number(MIN_MATCH_SCORE) || 0.75,
  demo_min_match_score:    Number(DEMO_MIN_MATCH_SCORE) || 0.3,

  support_words:     SUPPORT_WORDS,
  not_support_words: NOT_SUPPORT_WORDS,
  handoff_words:     HANDOFF_WORDS,
  handoff_intents:   HANDOFF_INTENTS,

  doc_urls:      DOC_URLS.map((u) => String(u).trim()).filter(Boolean),
  chunk_words:   Number(CHUNK_WORDS) || 160,
  chunk_overlap: Number(CHUNK_OVERLAP) || 0,

  test_email:        TEST_EMAIL.trim(),
  test_cap:          Number(TEST_CAP) || 3,
  reply_cap_per_run: Number(REPLY_CAP_PER_RUN) || 20,
  mode:              MODE,

  demo_knowledge: DEMO_KNOWLEDGE,
  demo_emails:    DEMO_EMAILS,

  // derived flags — the gates read these, never the raw constants
  openai_enabled:    USE_OPENAI === true,
  retrieval_enabled: USE_OPENAI === true && PINECONE_INDEX_HOST.trim() !== '',
  docs_enabled:      DOC_URLS.length > 0,
  // Replies are only sent outside preview. In test mode they are all redirected to TEST_EMAIL.
  send_enabled:      MODE !== 'preview',
  // An escalation needs somewhere to go: the team inbox live, TEST_EMAIL in test.
  alert_enabled:     MODE === 'test' || (MODE === 'live' && SUPPORT_TEAM_EMAIL.trim() !== ''),
  // Loading knowledge changes the index every reply is answered from, so preview never does it.
  upsert_enabled:    USE_OPENAI === true && PINECONE_INDEX_HOST.trim() !== '' && MODE !== 'preview'
};

// config passes the incoming payload through untouched under `incoming`, so whichever
// trigger fired, the next node reads the payload from the same place. It runs once per item.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((payload) => ({ json: Object.assign({}, SETTINGS, { incoming: payload }) }));
