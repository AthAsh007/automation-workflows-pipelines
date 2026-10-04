# Reprice gold chain stock daily and announce it on WhatsApp

**Who's it for**
Jewellery wholesalers and gold traders who send a daily price list to customers on WhatsApp and rework every price by hand each morning.

**How it works**
Every weekday at 08:00, or by hand, it reads the Stock tab and checks every row: a chain with no weight or an unknown karat is held back with its reason. It fetches today's 24k rate from goldapi.io and prices each chain as weight x purity x rate, plus the style's making charge and your margin. If the rate moved more than `MAX_RATE_MOVE_PCT` since the last list, it stops. From the same priced rows it builds the catalogue, the stock list, a CSV and an announcement of what changed. The owner approves on WhatsApp before any customer receives it, then the prices are written back.

**How to set up**
1. Run **Run it now** first: demo stock, a labelled demo rate, nothing sent.
2. In `config`, set `PURITY`, `STYLES`, `WHOLESALE_MARGIN_PCT` and `SHEET_ID`.
3. Add `GOLD_API_KEY` and connect Google Sheets and Twilio on the `[cred]` nodes.
4. Set `TEST_WHATSAPP` to your number, then `TEST_RUN = false`.

**Requirements**
A Google Sheet with Stock and Customers tabs, a goldapi.io key, and a Twilio WhatsApp sender. WhatsApp only allows free-form messages within 24 hours of the customer's last message, so the broadcast needs an approved template.

**How to customize**
`STYLES` holds making charges per gram, `ROUND_TO` and `CURRENCY` shape the prices, and `BROADCAST_CAP` and `APPROVAL_WAIT_HOURS` bound the send. Import the companion enquiries workflow to answer replies at the approved price.
