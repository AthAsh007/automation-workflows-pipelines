// GOLD CHAIN CATALOGUE ENGINE — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows ("01 reprice and announce" and
// "02 WhatsApp enquiries"). build.js regenerates both from this one file, and validate.js
// fails if they drift apart, so you never paste it between them by hand.
//
// A blank id or key means that step is SKIPPED, never that the run fails. Both workflows run
// end to end on the built-in demo stock, demo gold rate and demo customers below, which is
// what lets this be shown on a screen-share before a single credential exists.

// ---------------------------------------------------------------- The business
const BUSINESS_NAME   = 'Demo Gold Wholesale';
const OWNER_NAME      = 'the owner';
// The owner's WhatsApp number, international format. Drafts and hand-offs go here.
const OWNER_WHATSAPP  = '';
const CURRENCY        = 'USD';
const CURRENCY_SYMBOL = '$';

// ---------------------------------------------------------------- Pricing
// Wholesale gold is priced off the day's rate. A chain's price is
//   weight (g) x purity x today's 24k rate per gram     <- the metal
// + weight (g) x the style's making charge per gram     <- the work
// then the wholesale margin on top, rounded.
// Purity is the fraction of pure gold for each karat. A row whose karat is not in this table
// is held back rather than priced on a guess.
const PURITY = { 24: 0.999, 22: 0.916, 21: 0.875, 18: 0.750, 14: 0.585 };

// One entry per chain style you carry. `words` are what customers type on WhatsApp to mean
// it. The making charge is per gram, in CURRENCY.
const STYLES = {
  rope:   { label: 'Rope',   making_per_gram: 3.5, words: ['rope', 'twisted'] },
  cuban:  { label: 'Cuban',  making_per_gram: 4.0, words: ['cuban', 'curb', 'miami'] },
  figaro: { label: 'Figaro', making_per_gram: 3.0, words: ['figaro'] },
  box:    { label: 'Box',    making_per_gram: 2.5, words: ['box', 'venetian'] },
  franco: { label: 'Franco', making_per_gram: 4.5, words: ['franco'] },
  ball:   { label: 'Ball',   making_per_gram: 2.0, words: ['ball', 'bead'] }
};

const WHOLESALE_MARGIN_PCT = 2.0;
const ROUND_TO             = 1;      // round every price to this many CURRENCY units

// ---------------------------------------------------------------- The gold rate
// Today's 24k rate per gram, from goldapi.io (free tier is enough for once a day).
// Blank -> the demo rate below is used, and every message says so.
const GOLD_API_KEY  = '';
const GOLD_API_BASE = 'https://www.goldapi.io/api';

// The gate that stops a bad number reaching every customer. Gold rarely moves more than a
// few percent in a day; a bigger move since the last list is far more likely to be a wrong
// currency, a stale cache or a typo than the market. Above this, nothing is published and
// the owner is told why.
const MAX_RATE_MOVE_PCT = 3.0;

// ---------------------------------------------------------------- The stock sheet
// One Google Sheet, two tabs. Blank id -> the demo stock and demo customers below.
//   Stock:     sku | style | purity_k | length_in | weight_g | qty | price | rate | priced_qty | priced_at
//   Customers: name | whatsapp | opted_out
// `price`, `rate`, `priced_qty` and `priced_at` are written by workflow 01: they are what the
// last published list said, which is how the next run knows what is new or sold out.
const SHEET_ID        = '';
const STOCK_TAB       = 'Stock';
const CUSTOMERS_TAB   = 'Customers';
const LOW_STOCK_AT    = 2;           // at or below this many pieces, a chain is "last few"

// ---------------------------------------------------------------- WhatsApp (Twilio)
// Your Twilio WhatsApp sender, international format. Blank -> nothing is sent; every message
// is built in full and shown on a STOP node instead. The Twilio account itself goes in n8n's
// credential store, on the nodes named [cred] Twilio.
const TWILIO_WHATSAPP_FROM = '';

// How long the owner has to approve a broadcast before it is dropped. An unapproved list is
// never sent late: prices from the morning are wrong by the evening.
const APPROVAL_WAIT_HOURS = 4;

// The hard ceiling on one broadcast, enforced in code.
const BROADCAST_CAP = 200;

// ---------------------------------------------------------------- Enquiries (workflow 02)
// A request for this many pieces or more goes to a human for a price.
const HANDOFF_QTY = 10;
// Words that mean a person should answer, whatever else the message says.
const HANDOFF_WORDS = ['order', 'bulk', 'discount', 'best price', 'payment', 'invoice',
  'credit', 'custom', 'repair', 'return', 'complaint', 'urgent'];
const OPT_OUT_WORDS = ['stop', 'unsubscribe', 'remove me'];

// ---------------------------------------------------------------- AI (optional)
// An OpenAI-compatible chat endpoint reads what the customer wants: style, karat, length and
// quantity. It never states a price or stock level; those always come from the sheet, in code.
// Blank key -> keyword rules read the message instead, and the workflow behaves the same.
const AI_API_KEY  = '';
const AI_BASE_URL = 'https://api.openai.com/v1';
const AI_MODEL    = 'gpt-4o-mini';

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_WHATSAPP blank (how it ships) -> preview. Nothing is sent, nothing is
//                                                         written; every message is shown.
//   TEST_RUN true,  TEST_WHATSAPP set                  -> test. Messages really send, but ALL
//                                                         of them to TEST_WHATSAPP, at most 3
//                                                         per broadcast, marked [TEST]. The
//                                                         sheet is still not written.
//   TEST_RUN false                                     -> live.
// Filling in TEST_WHATSAPP can only ever redirect a message, never cause one.
const TEST_RUN      = true;
const TEST_WHATSAPP = '';

const MODE = TEST_RUN !== true ? 'live' : (TEST_WHATSAPP.trim() !== '' ? 'test' : 'preview');

// ---------------------------------------------------------------- Demo data
// Every row, number and person here is invented. The DEMO rate is not a market price.
// The mix is deliberate: it has to show every decision the engine makes.
//   * priced last time, still in stock         -> repriced at today's rate
//   * qty 0, had stock last time               -> sold out
//   * had 0 last time, stock now               -> back in stock
//   * qty at or under LOW_STOCK_AT             -> last few
//   * never priced before                      -> new in
//   * no weight / a karat not in PURITY        -> held back, with the reason
const DEMO_GOLD_RATE      = 110.00;   // 24k per gram, CURRENCY. DEMO, not a market price.
const DEMO_STOCK = [
  { sku: 'R22-20',  style: 'rope',   purity_k: 22, length_in: 20, weight_g: 18.4, qty: 6,  price: 1930, rate: 108.4, priced_qty: 6,  priced_at: '2026-09-18' },
  { sku: 'R22-24',  style: 'rope',   purity_k: 22, length_in: 24, weight_g: 22.1, qty: 3,  price: 2318, rate: 108.4, priced_qty: 4,  priced_at: '2026-09-18' },
  { sku: 'C22-22',  style: 'cuban',  purity_k: 22, length_in: 22, weight_g: 35.0, qty: 2,  price: 3710, rate: 108.4, priced_qty: 2,  priced_at: '2026-09-18' },
  { sku: 'C18-20',  style: 'cuban',  purity_k: 18, length_in: 20, weight_g: 28.6, qty: 0,  price: 2466, rate: 108.4, priced_qty: 3,  priced_at: '2026-09-18' },
  { sku: 'F18-18',  style: 'figaro', purity_k: 18, length_in: 18, weight_g: 9.8,  qty: 12, price: 842,  rate: 108.4, priced_qty: 12, priced_at: '2026-09-18' },
  { sku: 'F22-20',  style: 'figaro', purity_k: 22, length_in: 20, weight_g: 12.4, qty: 5,  price: 1296, rate: 108.4, priced_qty: 0,  priced_at: '2026-09-18' },
  { sku: 'B21-18',  style: 'box',    purity_k: 21, length_in: 18, weight_g: 14.2, qty: 1,  price: 1388, rate: 108.4, priced_qty: 5,  priced_at: '2026-09-18' },
  { sku: 'FR22-22', style: 'franco', purity_k: 22, length_in: 22, weight_g: 24.0, qty: 4,  price: '',   rate: '',    priced_qty: '', priced_at: '' },
  { sku: 'BL18-16', style: 'ball',   purity_k: 18, length_in: 16, weight_g: 6.5,  qty: 20, price: '',   rate: '',    priced_qty: '', priced_at: '' },
  { sku: 'R22-18',  style: 'rope',   purity_k: 22, length_in: 18, weight_g: '',   qty: 2,  price: '',   rate: '',    priced_qty: '', priced_at: '' },
  { sku: 'C20-20',  style: 'cuban',  purity_k: 20, length_in: 20, weight_g: 30.2, qty: 1,  price: '',   rate: '',    priced_qty: '', priced_at: '' }
];
const DEMO_CUSTOMERS = [
  { name: 'Northgate Jewellers', whatsapp: '+12025550101', opted_out: '' },
  { name: 'Al Noor Gold',        whatsapp: '+12025550102', opted_out: '' },
  { name: 'Riverside Pawn',      whatsapp: '+12025550103', opted_out: 'yes' },
  { name: 'Sunrise Traders',     whatsapp: '0100',         opted_out: '' },
  { name: 'Crown & Chain',       whatsapp: '+12025550105', opted_out: '' }
];
// What workflow 02 answers when run by hand. The same shape Twilio posts to the webhook.
const DEMO_MESSAGES = [
  { From: 'whatsapp:+12025550101', ProfileName: 'Northgate Jewellers', Body: 'Hi, do you have 22k rope chain 20 inch? price?' },
  { From: 'whatsapp:+12025550102', ProfileName: 'Al Noor Gold',        Body: 'figaro 18k' },
  { From: 'whatsapp:+12025550105', ProfileName: 'Crown & Chain',       Body: 'need 40 pcs cuban 22k for my shop, best price?' },
  { From: 'whatsapp:+12025550101', ProfileName: 'Northgate Jewellers', Body: 'can you do a custom 30 inch rope?' },
  { From: 'whatsapp:+12025550104', ProfileName: 'Sunrise Traders',     Body: 'STOP' }
];

const SETTINGS = {
  business_name:   BUSINESS_NAME.trim(),
  owner_name:      OWNER_NAME.trim() || 'the owner',
  owner_whatsapp:  OWNER_WHATSAPP.trim(),
  currency:        CURRENCY.trim().toUpperCase(),
  currency_symbol: CURRENCY_SYMBOL,

  purity:               PURITY,
  styles:               STYLES,
  wholesale_margin_pct: Number(WHOLESALE_MARGIN_PCT) || 0,
  round_to:             Number(ROUND_TO) || 1,

  gold_api_key:      GOLD_API_KEY.trim(),
  gold_api_base:     GOLD_API_BASE.trim().replace(/\/+$/, ''),
  max_rate_move_pct: Number(MAX_RATE_MOVE_PCT) || 3,

  sheet_id:      SHEET_ID.trim(),
  stock_tab:     STOCK_TAB.trim(),
  customers_tab: CUSTOMERS_TAB.trim(),
  low_stock_at:  Number(LOW_STOCK_AT) || 0,

  twilio_whatsapp_from: TWILIO_WHATSAPP_FROM.trim(),
  approval_wait_hours:  Number(APPROVAL_WAIT_HOURS) || 4,
  broadcast_cap:        Number(BROADCAST_CAP) || 0,

  handoff_qty:   Number(HANDOFF_QTY) || 10,
  handoff_words: HANDOFF_WORDS,
  opt_out_words: OPT_OUT_WORDS,

  ai_api_key:  AI_API_KEY.trim(),
  ai_base_url: AI_BASE_URL.trim().replace(/\/+$/, ''),
  ai_model:    AI_MODEL.trim(),

  test_whatsapp: TEST_WHATSAPP.trim(),
  test_cap:      3,
  mode:          MODE,

  demo_gold_rate: DEMO_GOLD_RATE,
  demo_stock:     DEMO_STOCK,
  demo_customers: DEMO_CUSTOMERS,
  demo_messages:  DEMO_MESSAGES,

  // derived flags — the gates read these, never the raw constants
  gold_api_enabled: GOLD_API_KEY.trim() !== '',
  sheet_enabled:    SHEET_ID.trim() !== '',
  ai_enabled:       AI_API_KEY.trim() !== '',
  // Sending needs a sender AND a mode that allows it. In test mode the owner number is not
  // required, because every message is redirected to TEST_WHATSAPP anyway.
  send_enabled: TWILIO_WHATSAPP_FROM.trim() !== '' && MODE !== 'preview'
    && (MODE === 'test' || OWNER_WHATSAPP.trim() !== ''),
  // The sheet is only ever written live. A test run sends real messages and touches nothing.
  write_enabled: SHEET_ID.trim() !== '' && MODE === 'live'
};

// config passes the incoming payload through untouched under `incoming`, so whichever
// trigger fired, the next node reads the payload from the same place. It runs once per item.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((payload) => ({ json: Object.assign({}, SETTINGS, { incoming: payload }) }));
