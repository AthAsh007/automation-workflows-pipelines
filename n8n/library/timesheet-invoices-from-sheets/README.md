# Send monthly client invoices from Google Sheets timesheets with Gmail

On the 1st of each month, totals last month's billable hours per client and rate from a Google Sheets timesheet, rounds each entry, applies minimum fees and tax, numbers the invoices, emails them as HTML through Gmail and logs each one to an Invoices tab.

Import `timesheet-invoices-from-sheets-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Consultants and small agencies that log hours in a shared Google Sheet and build invoices from it by hand each month. The invoices go out at 08:00 on the 1st with the same numbering and rounding every time.

## How it works

1. On the 1st at 08:00 it reads the Timesheet and Invoices tabs, or sample rows until a sheet is connected.
2. Last month's billable entries are rounded up to 15 minutes each, then grouped by client, project and rate. A Rate column on a row overrides the rate set in `CLIENTS`.
3. Each client gets its minimum fee, tax rate and payment terms from `CLIENTS`. Clients already invoiced for the month, and hours for unknown clients, are held back with a reason.
4. Invoice numbers continue from the highest number on the Invoices tab. Each invoice is emailed as an HTML table and, on a live run, appended to the Invoices tab.

## Sections on the canvas

1. **Start and settings.** Runs at 08:00 on the 1st, so the whole previous month is closed. Client rates, minimum fees, tax and terms live in `CLIENTS` inside `config`.
2. **Read hours and past invoices.** The Invoices tab is read after the timesheet is collected into one item, so it is fetched once. `Load sample timesheet` returns the same pair until `TIMESHEET_SHEET_ID` is set.
3. **Price and write invoices.** `Build invoices per client` rounds each entry before grouping, tops up to the minimum fee, and skips clients already on the log for the month, so a second run in the same month sends nothing new.
4. **Send and log.** A test send goes to `TEST_EMAIL` and leaves the Invoices tab alone, so numbers are only used by invoices that really went to clients.

## Setup

1. Run it once as imported. It builds three sample invoices and stops at `STOP: preview - nothing sent`.
2. Connect Google Sheets, put the spreadsheet id in `TIMESHEET_SHEET_ID`, and add your clients to `CLIENTS` with the exact names used on the Timesheet tab.
3. Connect Gmail on `Email the invoice`.
4. Put your address in `TEST_EMAIL` to receive every invoice yourself. Set `TEST_RUN = false` to send to clients and log the numbers.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `TIMESHEET_SHEET_ID` | `''` | Google Sheets id with Timesheet (Date, Client, Project, Person, Hours, Billable, Rate) and Invoices tabs |
| `CLIENTS` | `[{"name":"Harbour Dental","email":"ap@ha` | one entry per client; name must match a Client column value exactly (case ignored) |
| `ROUND_TO_MINUTES` | `15` | each entry is rounded to this many minutes |
| `ROUND_MODE` | `'up'` | 'up' or 'nearest' |
| `INVOICE_PREFIX` | `'INV'` | numbers look like INV-2026-0042 |
| `BUSINESS_NAME` | `'Fieldnote Consulting'` | shown at the top of every invoice |
| `PAYMENT_DETAILS` | `'Bank transfer to account 00-11-22 / 1...'` | footer line on every invoice |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Timesheet tab`
- `Read the Invoices tab`
- `Email the invoice`
- `Log to the Invoices tab`

## Requirements

- A Google Sheet with Timesheet and Invoices tabs
- A Gmail account

## Customising

- `ROUND_TO_MINUTES` and `ROUND_MODE` set the rounding of each entry.
- `CLIENTS` holds each rate, currency, minimum fee, tax rate and payment terms.
- `INVOICE_PREFIX` and `PAYMENT_DETAILS` change the numbering and the footer.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing sent` |
| test send to TEST_EMAIL | 11 | `Email the invoice` | `STOP: test send - invoice log untouched` |
| live from the sheet | 15 | `Email the invoice`, `Log to the Invoices tab` | `Log to the Invoices tab` |
