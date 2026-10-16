# Reconcile Stripe payouts against bank transactions in Google Sheets

Matches every Stripe payout from the last 35 days to a bank credit by amount and arrival window, flags missing, partial and duplicate matches, and writes one reconciliation row per payout to a Google Sheets tab.

Import `stripe-payout-bank-reconciliation-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Bookkeepers and founders who export bank transactions into Google Sheets and tick off Stripe payouts by hand at month end. It does the matching every Monday so the gaps show up within a week, not at close.

## How it works

1. Every Monday at 07:00 it reads Stripe payouts that arrived in the last 35 days and the bank credits on your Bank tab, or sample data until both are connected.
2. Each payout is matched to a bank line with the same amount (within 0.01) dated 0 to 3 days after the payout arrival date.
3. A payout with two possible bank lines is marked duplicate, one with only a close amount is marked partial, and one with nothing after 5 days is marked missing.
4. Bank lines that mention Stripe but match no payout are listed too, then every row is written to the Reconciliation tab, keyed by payout id.

## Sections on the canvas

1. **Start and settings.** Runs every Monday at 07:00 or by hand. Match rules, column names and the date format all live in `config`, so a different bank export only means editing one node.
2. **Read Stripe payouts.** `Stripe connected?` reads payouts that arrived inside `LOOKBACK_DAYS`. Until `USE_STRIPE` is true, `Load sample payouts` feeds the same single item, so the matcher can be checked before a credential exists.
3. **Read bank lines.** `Read bank rows` parses money strings and three date formats and drops debits, because only credits can be payouts. A blank `BANK_SHEET_ID` routes to `Load sample bank lines` instead.
4. **Match, write and summarise.** A bank line is claimed by one payout only, so a double import shows as duplicate rather than two clean matches. `Write to the sheet?` needs both a live run and a sheet id; the summary is built either way.

## Setup

1. Run it once as imported. It reconciles sample data and stops at `STOP: dry run - sheet untouched`.
2. Add a Stripe credential to `Fetch payouts from Stripe` and set `USE_STRIPE = true` in `config`.
3. Connect Google Sheets, put the spreadsheet id in `BANK_SHEET_ID`, and check the column names in `BANK_COLUMNS` match your Bank tab.
4. Read the preview in `Match payouts to bank lines`, then set `DRY_RUN = false` to write the Reconciliation tab.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_STRIPE` | `false` | set true after adding the Stripe credential to the payouts node |
| `BANK_SHEET_ID` | `''` | Google Sheets id holding the Bank and Reconciliation tabs; blank uses sample bank lines |
| `BANK_COLUMNS` | `{"date":"Date","description":"Descriptio` | column headers on your Bank tab |
| `BANK_DATE_FORMAT` | `'YYYY-MM-DD'` | how dates are written on the Bank tab: 'YYYY-MM-DD', 'DD/MM/YYYY' or 'MM/DD/YYYY' |
| `LOOKBACK_DAYS` | `35` | payouts that arrived in this many days are checked |
| `DATE_WINDOW_DAYS` | `3` | a bank line may land this many days after the payout arrival date |
| `AMOUNT_TOLERANCE` | `0.01` | largest difference that still counts as the same amount (major units) |
| `PARTIAL_PCT` | `5` | a bank line within this percent of the payout is a partial match |
| `GRACE_DAYS` | `5` | an unmatched payout younger than this is pending, not missing |
| `STRIPE_WORDS` | `["stripe","strp"]` | words that mark a bank line as a Stripe deposit |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch payouts from Stripe`
- `Read bank transactions`
- `Write Reconciliation tab`

## Requirements

- A Stripe account that pays out to a bank account
- A Google Sheet with your bank transactions
- A Reconciliation tab with a payout_id column

## Customising

- `DATE_WINDOW_DAYS` and `AMOUNT_TOLERANCE` set how strict a match is.
- `PARTIAL_PCT` decides how close an amount must be to count as a partial match rather than missing.
- `BANK_DATE_FORMAT` handles bank exports that use DD/MM/YYYY or MM/DD/YYYY.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 12 | none | `Summarise the reconciliation`, `STOP: dry run - sheet untouched` |
| live write with Stripe and the bank sheet | 14 | `Write Reconciliation tab` | `Summarise the reconciliation`, `Write Reconciliation tab` |
