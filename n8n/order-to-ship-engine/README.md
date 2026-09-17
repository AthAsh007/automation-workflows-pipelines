# Order to ship engine

Two n8n workflows for a custom-furniture maker selling on Shopify, Etsy and Square with a
Google Sheets production board and ShipStation: every order is captured once, written to
the board **first**, confirmed with an honest shipping window, and when the team flips a
row to Shipped the customer gets a personalised shipping + installation email built from
per-product rules — never typed twice, never shipped unconfirmed.

Built against a Phase-1 brief to connect stores →
production board → confirmations → ShipStation → shipping emails without replacing the
systems the maker already runs.

| File | What it does | Trigger |
|---|---|---|
| [`01-capture-and-confirm.json`](01-capture-and-confirm.json) | Store webhook → parse any store's order → dedupe against the board → write the row first → personalised confirmation email with the shipping window | Store webhook (`/webhook/order-in`) |
| [`02-progress-and-ship.json`](02-progress-and-ship.json) | Reads the board, emails every row flipped to Shipped (tracking pasted or pulled from ShipStation), holds anything that shipped before it was confirmed | Weekdays 08:30 & 16:30 + manual |

Both ship with `TEST_RUN = true`, no credentials and no sheet configured. **`node
build/simulate.js` runs the whole thing on this machine right now** — 60+ checks against
built-in demo orders, no n8n and no accounts.

---

## What the demo proves

Their brief has five asks. Ask 4 of the eight finished workflows each own a piece of —
this one owns the whole spine, and the pieces that make it *checkable* are the demo:

### The order is never typed twice

Shopify, Etsy and Square each post a different shape of JSON. `read the order` detects the
source and reads the same facts out of all three — order number, customer, email, line
items. Every order gets a deterministic `Order key` (`shopify|5103`), and the webhook is
matched against the board before anything is written. Webhooks retry; the board does not
collect duplicates, and the store gets a clean `ok` either way.

Square is the deposit case: for a source in `DEPOSIT_SOURCES`, an order whose payment has
not landed stops at **STOP: not a usable order** with the reason "deposit not yet
received". The workflow begins when the deposit webhook arrives — which is exactly the
"custom orders begin when the deposit is received" rule from their brief.

### The row is written first, and the window is never invented

The confirmation email quotes a shipping window, so the window has to be computable. The
rules live in the `config` node: each product has a `lead_days` figure, and the window is
*order date + the longest lead in the order + working-day buffers*. Nothing ships before
its promise, weekends are never promised on, and a product with no rule in
`PRODUCT_RULES` stops the run at **STOP: needs a product rule** instead of producing a
date the config cannot support.

### The sheet stays the sheet

The team keeps working in their Google Sheet exactly as they do now. The workflows write
rows, stamp `Confirmation sent`, and mark rows as emailed — they never reorganise tabs or
match on row numbers. **The one habit the system asks for is flipping the Stage cell to
`Shipped` when a label exists.** That flip is the trigger for the shipping email.

### Never shipped unconfirmed, and never a ship notice without a number

Two gates that make the "reliable" claim checkable:

- A row that reaches `Shipped` with no `Confirmation sent` timestamp stops at
  **STOP: never shipped unconfirmed**. The confirmation email is the proof the customer
  was told what was coming; without it, nothing ships.
- A shipping email is never sent without a tracking number. The number comes from the row
  (pasted by the office, or written back from a label step) or is pulled from ShipStation
  behind the `SHIPSTATION_READY` flag. Neither is available → **STOP: shipped - no
  tracking**.

The demo board ships with one row in each state, so both gates are visible the first time
you press run.

### The installation email is rules, not prose

"Number of wall anchors required using rules we provide" is the sort of thing a person
types differently on every order. Here the `config` node carries per-product rules —
`fixed` counts per unit, `per_metre` scales with the line's length, `none` for
free-standing pieces — and the email computes the count from the order's own line items.
Two bracket kits = 16 anchors, printed by the workflow, not by a human on the fourth
email of the day. Manual links come from the same table, so a link is only ever included
when the product rule carries one.

---

## Running it

### Right now, with nothing installed but node

```bash
node build/simulate.js
```

Executes every Code node unmodified against the sample payloads and the built-in demo
board: all three store shapes, a duplicate delivery, a Square order waiting on its
deposit, an unruly product, a shipped-but-unconfirmed hold, a shipped row with no
tracking, and the two personalised emails rendered as the customer would read them.

### In n8n

1. Import both JSON files. Nothing is configured; nothing will run against anything.
2. **Run workflow 2 (`02`) with "Run it now".** With `BOARD_READY = false` it reads the
   demo board and shows you all three gates: **STOP: nothing…**, the unconfirmed hold,
   and — because a demo row has tracking pasted — the full shipping email under
   **STOP: preview - shipping email not sent**. That one run is the demo.
3. For workflow 1, activate it and post a sample order. Either press **Test workflow**
   and run [`sample/test-post.ps1`](sample/test-post.ps1) (PowerShell) or
   [`sample/test-post.sh`](sample/test-post.sh) with the URL swapped for your webhook's
   Test URL, or point your real store webhook at the Production URL. The terminal gets
   `{"ok":true,"order":"shopify|5103"}` and the canvas ends at a STOP node showing the
   row and the email it would have sent.
4. Set the sheet up ([`sheet/README.md`](sheet/README.md)), put the id in `config`, set
   `BOARD_READY = true`, and attach Google credentials to the `[cred] Sheets` and
   `[cred] Gmail` nodes. Rows now really land.
5. `TEST_EMAIL` set → emails really send, all redirected to you. `TEST_RUN = false` →
   live.

`BOARD_READY = false` (the shipped default) forces preview, so fabricated demo customers
can never be emailed.

---

## The board

One tab, `Orders`, headings generated from `config` so they cannot disagree with the
workflow. The `Items (json)` column holds the line items as JSON, keeping the board one
row per order while still letting workflow 2 compute per-product anchor counts and manual
links at shipping time. A **Stage** dropdown (`sheet/Lists.csv`) is the only thing the
team edits. Full import and naming notes are in [`sheet/README.md`](sheet/README.md).

## Config, and what to change for a real client

Everything is in the `config` node in both files (one file, `build/js/config.js`, compiles
into both — never edit them apart). For a real engagement:

- `PRODUCT_RULES` — replace the demo products with theirs: real lead times, real anchor
  formulas, real manual URLs. This is the table that makes every email number true.
- `BOARD_SHEET_ID` / `BOARD_TAB` — their existing production board, with the columns in
  `sheet/Orders.csv` (or the workflow adapted to theirs).
- `CONFIRM_SUBJECT` / `SHIP_SUBJECT` and the copy in the compose nodes — their voice.
- `DEPOSIT_SOURCES` — which stores gate on payment.
- `SHIPSTATION_READY` — see below.
- Safety switch: `TEST_RUN` / `TEST_EMAIL`.

## Files

```
order-to-ship-engine/
├── 01-capture-and-confirm.json   generated — do not hand-edit
├── 02-progress-and-ship.json     generated — do not hand-edit
├── build/
│   ├── build.py        compiles js/*.js into both workflows + the sheet CSVs
│   ├── validate.py     structure, gates, secrets, config drift, sheet headings
│   ├── simulate.js     runs every Code node outside n8n against the sample payloads
│   └── js/             one file per Code node — the logic actually lives here
├── sample/             store payloads for the webhook demo + the board fixture
├── sheet/              Orders.csv + Lists.csv, headers generated from config
```

```bash
python build/build.py && python build/validate.py && node build/simulate.js
```

---

## Known limits

- **ShipStation is the one integration point not exercised here.** The fetch node uses
  the ShipStation credential type and lists orders by the store order number
  (`GET {base}/v2/orders?orderNumber=…`); the response mapper digs tracking out by common
  field names rather than one fixed path. The endpoint and field names should be
  confirmed against the live account's ShipStation API version during setup — nothing in
  this demo can test it, because nothing here has ShipStation credentials.
- **The Stage column is the whole contract.** If the office never flips a row to
  `Shipped`, no shipping email fires. That is deliberate — the sheet is the trigger — but
  it is the one habit the system needs.
- **"Never typed twice" is per `Order key`.** Two different stores selling the same order
  number are different orders. That is correct for this brief, and worth knowing if the
  client ever consolidates.
- **Webhook spam.** The `order-in` webhook is public; a bad actor who learns the URL can
  post junk. The parser rejects anything that does not read as a real order, but for a
  live store it is worth putting a shared secret in the webhook (a header the store sets)
  and checking it in `read the order`.

Every customer, order, product and email address in the demo fixtures is fabricated.
Example Furniture Co does not exist; the manual URL is a placeholder for illustration.
