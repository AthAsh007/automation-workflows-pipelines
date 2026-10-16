# Send monthly client invoices from Google Sheets timesheets with Gmail

**Who's it for**
Consultants and small agencies that log hours in a shared Google Sheet and build invoices from it by hand each month. The invoices go out at 08:00 on the 1st with the same numbering and rounding every time.

**How it works**
1. On the 1st at 08:00 it reads the Timesheet and Invoices tabs, or sample rows until a sheet is connected.
2. Last month's billable entries are rounded up to 15 minutes each, then grouped by client, project and rate. A Rate column on a row overrides the rate set in `CLIENTS`.
3. Each client gets its minimum fee, tax rate and payment terms from `CLIENTS`. Clients already invoiced for the month, and hours for unknown clients, are held back with a reason.
4. Invoice numbers continue from the highest number on the Invoices tab. Each invoice is emailed as an HTML table and, on a live run, appended to the Invoices tab.

**How to set up**
1. Run it once as imported. It builds three sample invoices and stops at `STOP: preview - nothing sent`.
2. Connect Google Sheets, put the spreadsheet id in `TIMESHEET_SHEET_ID`, and add your clients to `CLIENTS` with the exact names used on the Timesheet tab.
3. Connect Gmail on `Email the invoice`.
4. Put your address in `TEST_EMAIL` to receive every invoice yourself. Set `TEST_RUN = false` to send to clients and log the numbers.

**Requirements**
- A Google Sheet with Timesheet and Invoices tabs
- A Gmail account

**How to customize**
- `ROUND_TO_MINUTES` and `ROUND_MODE` set the rounding of each entry.
- `CLIENTS` holds each rate, currency, minimum fee, tax rate and payment terms.
- `INVOICE_PREFIX` and `PAYMENT_DETAILS` change the numbering and the footer.
