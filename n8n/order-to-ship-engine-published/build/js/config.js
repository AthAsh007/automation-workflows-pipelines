// ORDER TO SHIP ENGINE — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows ("01 capture and confirm" and
// "02 progress and ship"). If you change it in one, paste it into the other — build.py
// regenerates both from this one file, so normally you never have to.
//
// A blank key or a false flag means that step is SKIPPED, never that the run fails.
// That is what lets this be demonstrated on a screen-share before a single credential
// exists.

// ---------------------------------------------------------------- The production board
// The Google Sheet the team already runs as their production board. The id is the long
// code in the sheet's web address:
// docs.google.com/spreadsheets/d/<THIS BIT>/edit
const BOARD_SHEET_ID = '';
const BOARD_TAB      = 'Orders';

// Set to true only when ALL of these are in place:
//   1. the sheet exists with the headings below (see sheet/Orders.csv)
//   2. BOARD_SHEET_ID above is filled in
//   3. the [cred] Sheets nodes in both workflows have Google credentials attached
// Until then the workflows run against a built-in demo board: rows are shown in
// STOP nodes instead of being written, and fabricated customers can never be emailed.
const BOARD_READY = false;

// The column headings, exactly as they appear in row 1 of the Orders tab.
// 'Items (json)' holds the line items as JSON so the board stays one row per order.
const COLUMNS = {
  order_key:         'Order key',
  source:            'Source',
  order_id:          'Order no.',
  placed:            'Placed',
  customer:          'Customer',
  email:             'Email',
  items:             'Items (json)',
  spec:              'Spec',
  window_start:      'Ship window start',
  window_end:        'Ship window end',
  stage:             'Stage',
  confirmation_sent: 'Confirmation sent',
  carrier:           'Carrier',
  tracking:          'Tracking no.',
  ship_date:         'Shipped date',
  ship_email_sent:   'Ship email sent',
  notes:             'Notes'
};

// The stages the team moves a row through. The workflow writes 'New order' when the row
// lands and 'Confirmed' once the confirmation email is away; the OFFICE moves rows to
// 'In production' and finally 'Shipped' (when a label exists). That last flip is what
// triggers the shipping email. Nothing ships before a confirmation was recorded.
const STAGE_ON_ARRIVAL = 'New order';
const STAGE_CONFIRMED  = 'Confirmed';
const STAGE_SHIPPED    = 'Shipped';
const STAGES = ['New order', 'Confirmed', 'In production', 'Shipped', 'Delivered',
  'On hold', 'Cancelled'];

// ---------------------------------------------------------------- The stores
// Which store webhooks feed this. Square is in DEPOSIT_SOURCES: for designer/custom
// goods the post says the workflow may begin when the deposit is received, so a Square
// order whose payment has not landed is held until it has. Shopify and Etsy orders only
// arrive here once the store marks them confirmed/paid, so they are not gated.
const SOURCE_LABELS = { shopify: 'Shopify', etsy: 'Etsy', square: 'Square' };
const DEPOSIT_SOURCES = ['square'];

// ---------------------------------------------------------------- Product rules
// The rules/formulas the client provides, in one table so every number an email quotes
// can be traced back to a rule. Each order line is looked up by sku.
//
//   lead_days  how many working days this piece takes to build. The confirmation email's
//              ship window = order date + the LONGEST lead in the order + the buffers
//              below. Nothing ships before its promise, so the window is the honest one.
//   anchors    the wall hardware the customer needs for installation:
//                { mode: 'none' }        free-standing piece — no wall anchors
//                { mode: 'fixed', qty }  per unit (e.g. a bracket kit = 8 anchors)
//                { mode: 'per_metre' }   qty per metre of the line's length, rounded up
//   manual     the installation manual URL for that product
const PRODUCT_RULES = [
  { sku: 'DIN-TBL-WALNUT-6', name: 'Walnut dining table, 6-seat', lead_days: 14,
    anchors: { mode: 'none' }, manual: '', note: 'Free-standing piece — no wall anchors.' },
  { sku: 'CON-OAK-160', name: 'Oak console, 160 cm', lead_days: 10,
    anchors: { mode: 'none' }, manual: '', note: 'Free-standing piece — no wall anchors.' },
  { sku: 'SHLF-OAK-120', name: 'Oak wall shelf, 120 cm', lead_days: 6,
    anchors: { mode: 'per_metre', qty: 2 }, manual: 'https://example.com/manuals/oak-shelf-120.pdf',
    note: 'Two brackets supplied; fixings sized for the wall type.' },
  { sku: 'BRK-STEEL-L', name: 'Steel L-bracket set (pair)', lead_days: 3,
    anchors: { mode: 'fixed', qty: 8 }, manual: '',
    note: 'Four anchors per bracket; use the template supplied.' }
];

// A line item whose sku is NOT in the table above cannot be given an honest ship window
// or an honest anchor count. true = hold the order and show it in a STOP node instead of
// promising something the rules cannot support. Add the missing sku to PRODUCT_RULES and
// re-run.
const HOLD_UNRULED_ITEMS = true;

// The shipping promise, in working days (Mon-Fri):
//   earliest = order date + longest lead in the order + START buffer
//   latest   = order date + longest lead in the order + END buffer
// The email quotes the window, never a single date.
const WINDOW_BUFFER_START_DAYS = 3;
const WINDOW_BUFFER_END_DAYS   = 8;

// ---------------------------------------------------------------- Sending
const COMPANY_NAME = 'Example Furniture Co';
const FROM_NAME    = 'Example Furniture Co';
const REPLY_TO     = '';          // where customer replies should land
const PHONE        = '';
const WEBSITE      = '';

// The personalised emails. The braces are filled in code from the order and the rules —
// the model is never asked to invent a date, an anchor count or a manual link.
const CONFIRM_SUBJECT = 'Your {company} order {order} — thank you';
const SHIP_SUBJECT    = 'Your {company} order {order} has shipped';

// ---------------------------------------------------------------- ShipStation
// Optional. When the office creates a label in ShipStation they flip the board row to
// 'Shipped'; this workflow then tries to pull carrier, tracking number and ship date
// from ShipStation instead of asking anyone to type them.
//
// Set true only when: the [cred] ShipStation node has credentials attached AND the
// fetch path has been checked against your ShipStation account (see README — the
// endpoint is the one integration point to confirm on a live account).
const SHIPSTATION_READY = false;
const SHIPSTATION_BASE  = 'https://api.shipstation.com';

// ---------------------------------------------------------------- Safety switch
//   TEST_RUN true,  TEST_EMAIL blank -> PREVIEW. Rows are written to the sheet (when
//                                      BOARD_READY) but no email is sent. Ships this way.
//   TEST_RUN true,  TEST_EMAIL set   -> TEST. Emails really send, but every one goes to
//                                      TEST_EMAIL instead of the customer.
//   TEST_RUN false                   -> LIVE. Customers get the real thing.
const TEST_RUN   = true;
const TEST_EMAIL = '';

// While the demo board is in use (no sheet configured) the run is FORCED into preview:
// a fabricated customer can never be emailed, whatever TEST_RUN says.
const DEMO_MODE = BOARD_READY !== true;

let MODE = TEST_RUN !== true ? 'live'
  : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');
if (DEMO_MODE && MODE !== 'preview') MODE = 'preview';

// ---------------------------------------------------------------- Demo board
// The rows the workflows run against until BOARD_READY is set. Every customer, order and
// product here is fabricated. The mix is deliberate — it has to be able to show every
// gate doing its job:
//   * a 'Shipped' row that was confirmed and has tracking pasted   -> shipping email
//   * a 'Shipped' row with NO tracking and no ShipStation          -> STOP: tracking missing
//   * a 'Shipped' row that was never confirmed                     -> STOP: never shipped unconfirmed
//   * a finished row already emailed                               -> left alone (idempotent)
//   * open rows in production / new                                -> left alone
const DEMO_ORDERS = [
  {
    order_key: 'shopify|5102', source: 'shopify', order_id: '5102', placed: '2026-09-02 09:41',
    customer: 'Dana Whitfield', email: 'dana.whitfield@example.com',
    items: '[{"sku":"DIN-TBL-WALNUT-6","name":"Walnut dining table, 6-seat","qty":1,"dim_m":"","spec":"2200 x 1000 x 750 mm, matte oil finish"},{"sku":"BRK-STEEL-L","name":"Steel L-bracket set (pair)","qty":2,"dim_m":"","spec":""}]',
    spec: '', window_start: '2026-09-23', window_end: '2026-09-30', stage: 'In production',
    confirmation_sent: '2026-09-02 09:41', carrier: '', tracking: '', ship_date: '',
    ship_email_sent: '', notes: ''
  },
  {
    order_key: 'etsy|2218', source: 'etsy', order_id: '2218', placed: '2026-09-04 14:02',
    customer: 'Marlon Reyes', email: 'marlon.reyes@example.com',
    items: '[{"sku":"SHLF-OAK-120","name":"Oak wall shelf, 120 cm","qty":1,"dim_m":"1.2","spec":"120 x 22 x 4 cm"},{"sku":"BRK-STEEL-L","name":"Steel L-bracket set (pair)","qty":1,"dim_m":"","spec":""}]',
    spec: '', window_start: '2026-09-18', window_end: '2026-09-25', stage: 'Shipped',
    confirmation_sent: '2026-09-04 14:02', carrier: 'UPS', tracking: '1Z999AA10123456784',
    ship_date: '2026-09-16', ship_email_sent: '', notes: ''
  },
  {
    order_key: 'shopify|5117', source: 'shopify', order_id: '5117', placed: '2026-09-05 16:30',
    customer: 'Priya Nair', email: 'priya.nair@example.com',
    items: '[{"sku":"CON-OAK-160","name":"Oak console, 160 cm","qty":1,"dim_m":"","spec":"160 x 40 x 75 cm, no back panel"}]',
    spec: '', window_start: '2026-09-22', window_end: '2026-09-29', stage: 'Shipped',
    confirmation_sent: '2026-09-05 16:30', carrier: '', tracking: '', ship_date: '',
    ship_email_sent: '', notes: ''
  },
  {
    order_key: 'square|ORD-9081', source: 'square', order_id: 'ORD-9081', placed: '2026-09-08 11:12',
    customer: 'Tom Okafor', email: 'tom.okafor@example.com',
    items: '[{"sku":"DIN-TBL-WALNUT-6","name":"Walnut dining table, 6-seat","qty":1,"dim_m":"","spec":"custom width 2400 mm"}]',
    spec: 'Custom width 2400 mm', window_start: '2026-09-28', window_end: '2026-10-05',
    stage: 'Shipped', confirmation_sent: '', carrier: '', tracking: '', ship_date: '',
    ship_email_sent: '', notes: ''
  },
  {
    order_key: 'shopify|5123', source: 'shopify', order_id: '5123', placed: '2026-09-09 08:05',
    customer: 'Elena Rossi', email: 'elena.rossi@example.com',
    items: '[{"sku":"SHLF-OAK-120","name":"Oak wall shelf, 120 cm","qty":2,"dim_m":"1.2","spec":""}]',
    spec: '', window_start: '2026-09-22', window_end: '2026-09-29', stage: 'New order',
    confirmation_sent: '', carrier: '', tracking: '', ship_date: '', ship_email_sent: '',
    notes: ''
  },
  {
    order_key: 'etsy|2190', source: 'etsy', order_id: '2190', placed: '2026-08-28 10:15',
    customer: 'June Park', email: 'june.park@example.com',
    items: '[{"sku":"CON-OAK-160","name":"Oak console, 160 cm","qty":1,"dim_m":"","spec":""}]',
    spec: '', window_start: '2026-09-14', window_end: '2026-09-21', stage: 'Delivered',
    confirmation_sent: '2026-08-28 10:15', carrier: 'FedEx', tracking: '778899001122',
    ship_date: '2026-09-15', ship_email_sent: '2026-09-15 09:30', notes: ''
  }
];

return [{
  json: {
    company_name: COMPANY_NAME,
    from_name:    FROM_NAME,
    reply_to:     REPLY_TO.trim(),
    phone:        PHONE.trim(),
    website:      WEBSITE.trim(),

    board_sheet_id: BOARD_SHEET_ID.trim(),
    board_tab:      BOARD_TAB,
    columns:        COLUMNS,
    board_ready:    BOARD_READY === true,

    source_labels:  SOURCE_LABELS,
    deposit_sources: DEPOSIT_SOURCES,

    product_rules:    PRODUCT_RULES,
    hold_unruly:      HOLD_UNRULED_ITEMS === true,
    window_start_days: Number(WINDOW_BUFFER_START_DAYS) || 0,
    window_end_days:   Number(WINDOW_BUFFER_END_DAYS) || 0,

    stage_on_arrival: STAGE_ON_ARRIVAL,
    stage_confirmed:  STAGE_CONFIRMED,
    stage_shipped:    STAGE_SHIPPED,
    stages:           STAGES,

    confirm_subject: CONFIRM_SUBJECT,
    ship_subject:    SHIP_SUBJECT,

    shipstation_ready: SHIPSTATION_READY === true,
    shipstation_base:  SHIPSTATION_BASE,

    demo_orders: DEMO_ORDERS,
    demo_mode:   DEMO_MODE,

    // derived flags — the gates read these, never the raw constants
    mode:          MODE,
    preview_only:  MODE === 'preview',
    test_send:     MODE === 'test',
    live_send:     MODE === 'live',
    send_enabled:  MODE !== 'preview',
    test_email:    TEST_EMAIL.trim()
  }
}];
