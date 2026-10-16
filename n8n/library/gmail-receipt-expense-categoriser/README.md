# Categorise emailed receipts into Google Sheets expense rows with OpenAI

Reads receipt emails from Gmail, pulls vendor, amount, currency and date out with rules, picks a category with OpenAI or a keyword table, flags rows with missing fields and writes each receipt once to an Expenses sheet.

Import `gmail-receipt-expense-categoriser-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Freelancers and small teams whose receipts arrive by email and get typed into an expenses sheet once a quarter. Each receipt becomes a row within a minute of landing in Gmail.

## How it works

1. Gmail is polled every minute for unread mail matching `subject:(receipt OR invoice)`. A manual run uses five sample receipts instead.
2. Rules read the vendor from the sender, the total from lines like "Total paid" or "Amount charged", the currency from the symbol or ISO code, and the receipt date from the body or the email header.
3. A category comes from OpenAI when `USE_OPENAI` is true, otherwise from the keyword table in `config`. An AI answer outside your category list falls back to the keyword match.
4. Rows missing an amount or a vendor are marked needs review. Rows are written to the Expenses tab keyed by Gmail message id, so a re-run never adds a second row.

## Sections on the canvas

1. **Start and settings.** Gmail polls every minute for unread receipts; `Run manually` is the zero-credential way in. Category keywords and review thresholds live in `config`.
2. **Collect and parse receipts.** `Started by Gmail?` tells a real poll from a manual run, which gets `Load sample receipts`. `Extract receipt fields` ranks total labels so a subtotal never wins, and drops message ids it has already written.
3. **Choose a category.** The keyword category is computed first, so `Check the AI category` always has a fallback. A model answer outside the allowed list or under 0.5 confidence is rejected rather than written.
4. **Write once per message.** Rows are upserted on message_id, and `Remember processed messages` runs only after a real write, so a dry run never marks a receipt as done.

## Setup

1. Run it once as imported from `Run manually`. It parses the samples and stops at `STOP: dry run - nothing written`.
2. Connect Gmail on `New receipt in Gmail` and adjust its search query to match your receipts.
3. Connect Google Sheets and put the spreadsheet id in `EXPENSE_SHEET_ID`. The Expenses tab needs a message_id column.
4. Optional: add an OpenAI credential to `Pick a category with OpenAI` and set `USE_OPENAI = true`. Set `DRY_RUN = false` to start writing rows.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `EXPENSE_SHEET_ID` | `''` | Google Sheets id holding the Expenses tab; blank means nothing is written |
| `USE_OPENAI` | `false` | set true after adding the OpenAI credential to the categoriser |
| `CATEGORY_KEYWORDS` | `{"Software":["subscription","license","s` | category -> words that select it; the first category with a hit wins |
| `DEFAULT_CURRENCY` | `'USD'` | used when a receipt shows no currency symbol or code |
| `REVIEW_ABOVE` | `1000` | receipts above this amount are marked needs review |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `New receipt in Gmail`
- `Pick a category with OpenAI`
- `Pick a category with OpenAI model`
- `Write rows to the Expenses tab`

## Requirements

- A Gmail account that receives receipts
- A Google Sheet with an Expenses tab
- Optional: an OpenAI API key

## Customising

- `CATEGORY_KEYWORDS` maps each category to the words that select it.
- `DEFAULT_CURRENCY` is used when a receipt shows only a bare number.
- `REVIEW_ABOVE` marks any receipt above that amount for a second look.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run, samples) | 13 | none | `STOP: dry run - nothing written` |
| Gmail receipt, OpenAI on, live write | 15 | `Write rows to the Expenses tab` | `Remember processed messages` |
