# Categorise emailed receipts into Google Sheets expense rows with OpenAI

**Who's it for**
Freelancers and small teams whose receipts arrive by email and get typed into an expenses sheet once a quarter. Each receipt becomes a row within a minute of landing in Gmail.

**How it works**
1. Gmail is polled every minute for unread mail matching `subject:(receipt OR invoice)`. A manual run uses five sample receipts instead.
2. Rules read the vendor from the sender, the total from lines like "Total paid" or "Amount charged", the currency from the symbol or ISO code, and the receipt date from the body or the email header.
3. A category comes from OpenAI when `USE_OPENAI` is true, otherwise from the keyword table in `config`. An AI answer outside your category list falls back to the keyword match.
4. Rows missing an amount or a vendor are marked needs review. Rows are written to the Expenses tab keyed by Gmail message id, so a re-run never adds a second row.

**How to set up**
1. Run it once as imported from `Run manually`. It parses the samples and stops at `STOP: dry run - nothing written`.
2. Connect Gmail on `New receipt in Gmail` and adjust its search query to match your receipts.
3. Connect Google Sheets and put the spreadsheet id in `EXPENSE_SHEET_ID`. The Expenses tab needs a message_id column.
4. Optional: add an OpenAI credential to `Pick a category with OpenAI` and set `USE_OPENAI = true`. Set `DRY_RUN = false` to start writing rows.

**Requirements**
- A Gmail account that receives receipts
- A Google Sheet with an Expenses tab
- Optional: an OpenAI API key

**How to customize**
- `CATEGORY_KEYWORDS` maps each category to the words that select it.
- `DEFAULT_CURRENCY` is used when a receipt shows only a bare number.
- `REVIEW_ABOVE` marks any receipt above that amount for a second look.
