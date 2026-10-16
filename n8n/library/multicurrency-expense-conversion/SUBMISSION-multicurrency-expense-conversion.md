# Convert multi-currency expenses in Google Sheets with daily exchange rates

**Who's it for**
Teams that log travel and supplier expenses in several currencies in one Google Sheet and need a single base-currency total for budgets or reimbursement. It fills the converted columns every morning so nobody looks rates up by hand.

**How it works**
1. Every day at 06:30 it fetches the latest rates for `BASE_CURRENCY` from open.er-api.com, which needs no API key.
2. If the feed fails, or its rates are more than 36 hours old, the run stops before touching the sheet.
3. Each expense row is converted to the base currency. Symbols such as € and £ are mapped to ISO codes, and rows already converted at the same rate are skipped.
4. Unknown currencies, missing amounts and expenses more than 7 days older than the rate are flagged in an FX status column, then the rows are updated by ID.

**How to set up**
1. Run it once as imported. It fetches live rates, converts sample rows and stops at `STOP: dry run - sheet untouched`.
2. Connect Google Sheets and put the spreadsheet id in `EXPENSE_SHEET_ID`. The Expenses tab needs ID, Date, Amount and Currency columns.
3. Set `BASE_CURRENCY` to the currency your books are kept in.
4. Check the output of `Convert each expense`, then set `DRY_RUN = false` to write the converted columns.

**Requirements**
- A Google Sheet with an Expenses tab
- No exchange-rate account; the open.er-api.com feed is free

**How to customize**
- `SYMBOL_MAP` decides what a bare symbol such as $ means in your sheet.
- `MAX_RATE_AGE_HOURS` and `DATE_GAP_DAYS` control the stale-rate flags.
- `DECIMALS` sets rounding of the converted amount.
