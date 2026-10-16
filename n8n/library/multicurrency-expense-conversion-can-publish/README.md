# Convert multi-currency expenses in Google Sheets with daily exchange rates

Fetches the day's exchange rates from the free open.er-api.com feed, converts every expense row in a Google Sheet to your base currency, and flags unknown currencies, stale rates and old expenses converted at today's rate.

Import `multicurrency-expense-conversion-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Teams that log travel and supplier expenses in several currencies in one Google Sheet and need a single base-currency total for budgets or reimbursement. It fills the converted columns every morning so nobody looks rates up by hand.

## How it works

1. Every day at 06:30 it fetches the latest rates for `BASE_CURRENCY` from open.er-api.com, which needs no API key.
2. If the feed fails, or its rates are more than 36 hours old, the run stops before touching the sheet.
3. Each expense row is converted to the base currency. Symbols such as € and £ are mapped to ISO codes, and rows already converted at the same rate are skipped.
4. Unknown currencies, missing amounts and expenses more than 7 days older than the rate are flagged in an FX status column, then the rows are updated by ID.

## Sections on the canvas

1. **Start and settings.** Runs at 06:30, after the free feed has published the day's rates. Base currency, symbol meanings and staleness limits live in `config`.
2. **Get rates and stop if stale.** `Fetch exchange rates` is a public call with no key. `Check the rates` fails closed: a feed error or a timestamp past `MAX_RATE_AGE_HOURS` ends the run before any row is read.
3. **Read expense rows.** The sheet is read once, after the rates pass, and collected into one item. `Load sample expenses` stands in until `EXPENSE_SHEET_ID` is set.
4. **Convert and write.** Rows already holding today's rate are skipped, so re-runs make no changes. Bad rows are still written with a reason in FX status, so they show up on the sheet rather than vanishing.

## Setup

1. Run it once as imported. It fetches live rates, converts sample rows and stops at `STOP: dry run - sheet untouched`.
2. Connect Google Sheets and put the spreadsheet id in `EXPENSE_SHEET_ID`. The Expenses tab needs ID, Date, Amount and Currency columns.
3. Set `BASE_CURRENCY` to the currency your books are kept in.
4. Check the output of `Convert each expense`, then set `DRY_RUN = false` to write the converted columns.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `EXPENSE_SHEET_ID` | `''` | Google Sheets id with an Expenses tab; blank uses sample rows |
| `BASE_CURRENCY` | `'USD'` | ISO code every expense is converted into |
| `SYMBOL_MAP` | `{"$":"USD","€":"EUR","£":"GBP","¥":"JPY"` | symbols found in the Currency column and the code they mean |
| `MAX_RATE_AGE_HOURS` | `36` | rates older than this stop the run |
| `DATE_GAP_DAYS` | `7` | expenses older than this, converted at today's rate, are marked approximate |
| `DECIMALS` | `2` | rounding of the converted amount |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Read the Expenses tab`
- `Update the Expenses tab`

## Requirements

- A Google Sheet with an Expenses tab
- No exchange-rate account; the open.er-api.com feed is free

## Customising

- `SYMBOL_MAP` decides what a bare symbol such as $ means in your sheet.
- `MAX_RATE_AGE_HOURS` and `DATE_GAP_DAYS` control the stale-rate flags.
- `DECIMALS` sets rounding of the converted amount.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 11 | none | `STOP: dry run - sheet untouched` |
| stale feed stops the run | 6 | none | `STOP: rates unavailable - nothing converted` |
| live write to the sheet | 13 | `Update the Expenses tab` | `Update the Expenses tab` |
