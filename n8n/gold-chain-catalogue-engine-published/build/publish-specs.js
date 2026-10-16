// Writes the two tools/layout.py specs for the n8n template library (GUIDELINES §10).
// Kept as JS so the sticky text is readable here; run: bun build/publish-specs.js
// Then, from n8n/workflows/:
//   python ../tools/layout.py <wf>.json <wf>-publish.json <wf-folder>/build/publish-spec-0N.json
//   python ../tools/make_submission_md.py <spec> SUBMISSION-<wf>.md
const fs = require('fs');
const path = require('path');

const T1 = 'Reprice gold chain stock daily and announce it on WhatsApp';
const T2 = 'Answer WhatsApp gold chain enquiries from a Google Sheets price list';

const spec01 = {
  title: T1,
  stickies: [
    { color: 4, band: 'top', from: 'Run it now', to: 'check the stock rows', width: 760, content:
`## ${T1}

**Who's it for**
Jewellery wholesalers and gold traders who send a daily price list to customers on WhatsApp and rework every price by hand each morning.

**How it works**
Every weekday at 08:00, or by hand, it reads the Stock tab and checks every row: a chain with no weight or an unknown karat is held back with its reason. It fetches today's 24k rate from goldapi.io and prices each chain as weight x purity x rate, plus the style's making charge and your margin. If the rate moved more than \`MAX_RATE_MOVE_PCT\` since the last list, it stops. From the same priced rows it builds the catalogue, the stock list, a CSV and an announcement of what changed. The owner approves on WhatsApp before any customer receives it, then the prices are written back.

**How to set up**
1. Run **Run it now** first: demo stock, a labelled demo rate, nothing sent.
2. In \`config\`, set \`PURITY\`, \`STYLES\`, \`WHOLESALE_MARGIN_PCT\` and \`SHEET_ID\`.
3. Add \`GOLD_API_KEY\` and connect Google Sheets and Twilio on the \`[cred]\` nodes.
4. Set \`TEST_WHATSAPP\` to your number, then \`TEST_RUN = false\`.

**Requirements**
A Google Sheet with Stock and Customers tabs, a goldapi.io key, and a Twilio WhatsApp sender. WhatsApp only allows free-form messages within 24 hours of the customer's last message, so the broadcast needs an approved template.

**How to customize**
\`STYLES\` holds making charges per gram, \`ROUND_TO\` and \`CURRENCY\` shape the prices, and \`BROADCAST_CAP\` and \`APPROVAL_WAIT_HOURS\` bound the send. Import the companion enquiries workflow to answer replies at the approved price.` },
    { color: 7, band: 'above', from: 'stock sheet configured?', to: 'check the stock rows', content:
`### 1. Read the stock, and check it before pricing

\`stock sheet configured?\` reads the Stock tab through \`[cred] Sheets - read the stock\`, or falls back to \`use the demo stock\` so the whole run works with nothing connected.

\`check the stock rows\` holds back a chain with no weight, a karat missing from \`PURITY\` or a style missing from \`STYLES\`, with its reason. A row is never priced on a guess and never silently dropped.` },
    { color: 7, band: 'above', from: 'gold rate configured?', to: 'rate looks right?', content:
`### 2. Price every chain at today's rate

\`Gold rate - today's price\` calls goldapi.io; without a key, \`use the demo gold rate\` supplies a rate labelled as not a market price everywhere it appears.

\`price every chain\` applies one formula: weight x purity x 24k rate, plus the making charge, plus margin.

\`rate looks right?\` refuses a rate that moved more than \`MAX_RATE_MOVE_PCT\` since the last list. A stale feed or a wrong currency is far likelier than the market, and a wrong price sent to every customer is the expensive failure.` },
    { color: 7, band: 'above', from: 'build the catalogue', to: 'plan the broadcast', content:
`### 3. Four views of the same priced rows

\`build the catalogue\` makes the customer catalogue, the internal stock list, a CSV and the announcement from one set of rows, so they cannot disagree. The announcement says only what changed: new in, back in stock, last few, sold out.

\`plan the broadcast\` skips opted-out, unusable and duplicate numbers with a reason, and enforces \`BROADCAST_CAP\` in code.` },
    { color: 7, band: 'above', from: 'sending on?', to: 'STOP: prices written', content:
`### 4. The owner approves, then it sends and writes back

\`[cred] Twilio - ask the owner to approve\` sends the full message with an approve link, and \`wait for the owner's approval\` holds the run. Nothing reaches a customer until the owner opens it, and if \`APPROVAL_WAIT_HOURS\` passes first nothing is sent: a morning price is wrong by the evening.

After approval the announcement goes out, and \`[cred] Sheets - write today's prices\` records price, rate and quantity. That write is how tomorrow's run knows what is new and what sold out.` },
    { color: 3, band: 'below', from: 'STOP: preview - draft shown', to: 'STOP: preview - prices not written', content:
`## Nothing is sent until you say so

It ships with \`TEST_RUN = true\` and a blank \`TEST_WHATSAPP\`: every message is built and shown on \`STOP: preview - draft shown\`, and the sheet is not written.

Put your own number in \`TEST_WHATSAPP\` and real sends go only to you, at most three, marked [TEST]. Set \`TEST_RUN = false\` to go live.` },
  ],
};

const spec02 = {
  title: T2,
  stickies: [
    { color: 4, band: 'top', from: 'A WhatsApp message arrives', to: 'read the message', width: 760, content:
`## ${T2}

**Who's it for**
Jewellery wholesalers who get "22k rope 20 inch, how much?" on WhatsApp all day and want every answer to quote the same approved price list.

**How it works**
Twilio posts each incoming WhatsApp message to the webhook. The workflow reads the Stock tab, then works out what the customer wants: style, karat, length and quantity. Keyword rules always run, and an optional AI model can fill gaps, but only into those fields; it never sees a price and never writes the reply. The reply is decided in order: an opt-out is confirmed and recorded, an order, bulk quantity, custom piece or complaint goes to the owner, a stock question is answered from the sheet at the last approved price, and a vague message is asked for style and karat.

**How to set up**
1. Run **Run the demo messages** first: five invented messages, nothing sent.
2. In \`config\`, set \`SHEET_ID\`, \`TWILIO_WHATSAPP_FROM\` and \`OWNER_WHATSAPP\`.
3. Connect Google Sheets and Twilio on the \`[cred]\` nodes and point the sender's incoming webhook here.
4. Set \`TEST_WHATSAPP\`, then \`TEST_RUN = false\`.

**Requirements**
A Google Sheet with Stock and Customers tabs and a Twilio WhatsApp sender. An AI key is optional.

**How to customize**
\`HANDOFF_QTY\` sets when a quantity goes to a person, the keyword lists in \`read the message\` decide what is recognised, and \`STYLES\` limits which styles are ever offered. Pair it with the companion repricing workflow, which writes the prices this one quotes.` },
    { color: 7, band: 'above', from: 'stock sheet configured?', to: 'read the message', content:
`### 1. Take the message in, with the stock beside it

\`A WhatsApp message arrives\` is the Twilio webhook; \`Run the demo messages\` feeds five invented messages instead. The stock comes from \`[cred] Sheets - read the stock\`, or \`use the demo stock\` when no sheet is set.

\`read the message\` applies the keyword rules: style, karat, length, quantity, and whether a person is needed.` },
    { color: 7, band: 'above', from: 'AI configured?', to: 'keyword reading only', content:
`### 2. Let a model help read, never answer

With \`AI_API_KEY\` set, \`AI - read what they want\` reads the message into the same fields. It is never shown a price and never writes the reply.

\`apply the AI reading\` ignores a style that is not in \`STYLES\`, and an answer that does not parse keeps the keyword read. Without a key, \`keyword reading only\` carries on alone.` },
    { color: 7, band: 'above', from: 'decide the reply', to: 'STOP: replies sent', content:
`### 3. Answer from the sheet, or hand it to a person

\`decide the reply\` quotes every price and stock count from the Stock tab at the price last approved, with the list date, so the bot cannot quote a number the owner never saw. Orders, bulk quantities, custom pieces, payment questions and complaints are acknowledged and sent to the owner with who, what and why. The bot does not negotiate.

\`sending on?\` sends through \`[cred] Twilio - send on WhatsApp\`, or shows every reply on \`STOP: preview - replies shown\`.` },
    { color: 7, band: 'below', from: 'rows for the customers tab', to: 'STOP: preview - opt-outs not recorded', content:
`### 4. Record opt-outs

A "STOP" is confirmed to the customer, and \`[cred] Sheets - record the opt-outs\` marks them in the Customers tab, so the daily announcement never messages that number again. In preview, \`STOP: preview - opt-outs not recorded\` shows the rows it would write.` },
  ],
};

fs.writeFileSync(path.join(__dirname, 'publish-spec-01.json'), JSON.stringify(spec01, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'publish-spec-02.json'), JSON.stringify(spec02, null, 2) + '\n');
console.log('wrote publish-spec-01.json, publish-spec-02.json');
