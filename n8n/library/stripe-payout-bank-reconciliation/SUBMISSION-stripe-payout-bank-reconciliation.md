# Reconcile Stripe payouts against bank transactions in Google Sheets

**Who's it for**
Bookkeepers and founders who export bank transactions into Google Sheets and tick off Stripe payouts by hand at month end. It does the matching every Monday so the gaps show up within a week, not at close.

**How it works**
1. Every Monday at 07:00 it reads Stripe payouts that arrived in the last 35 days and the bank credits on your Bank tab, or sample data until both are connected.
2. Each payout is matched to a bank line with the same amount (within 0.01) dated 0 to 3 days after the payout arrival date.
3. A payout with two possible bank lines is marked duplicate, one with only a close amount is marked partial, and one with nothing after 5 days is marked missing.
4. Bank lines that mention Stripe but match no payout are listed too, then every row is written to the Reconciliation tab, keyed by payout id.

**How to set up**
1. Run it once as imported. It reconciles sample data and stops at `STOP: dry run - sheet untouched`.
2. Add a Stripe credential to `Fetch payouts from Stripe` and set `USE_STRIPE = true` in `config`.
3. Connect Google Sheets, put the spreadsheet id in `BANK_SHEET_ID`, and check the column names in `BANK_COLUMNS` match your Bank tab.
4. Read the preview in `Match payouts to bank lines`, then set `DRY_RUN = false` to write the Reconciliation tab.

**Requirements**
- A Stripe account that pays out to a bank account
- A Google Sheet with your bank transactions
- A Reconciliation tab with a payout_id column

**How to customize**
- `DATE_WINDOW_DAYS` and `AMOUNT_TOLERANCE` set how strict a match is.
- `PARTIAL_PCT` decides how close an amount must be to count as a partial match rather than missing.
- `BANK_DATE_FORMAT` handles bank exports that use DD/MM/YYYY or MM/DD/YYYY.
