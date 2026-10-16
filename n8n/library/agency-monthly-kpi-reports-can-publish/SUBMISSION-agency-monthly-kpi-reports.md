# Email monthly client KPI reports from Google Sheets with month-over-month change

**Who's it for**
Marketing and SEO agencies that keep client numbers in one spreadsheet and spend the first week of every month pasting them into report emails. Clients get a one-table report on the 2nd and the team sees which accounts need a call.

**How it works**
1. On the 2nd of each month at 08:00 it reads the KPIs tab (Client, Month, Metric, Value, Target) and the Clients tab, or sample data until a sheet is set.
2. For each client it takes last month and the month before, and works out the change for every metric.
3. Each metric gets a flag. With a target: green when met, amber when within `RED_MARGIN_PCT`, red beyond it. Without one: red when it moved the wrong way by more than `RED_DROP_PCT`. `METRICS` says which way is good, so a lower cost per lead counts as better.
4. Each client contact gets an HTML table with this month, last month, change, target and flag. Clients with no data for the month or no contact email are held back.
5. The agency gets one internal email listing every client with its red and amber counts, worst first.

**How to set up**
1. Run it once as imported. It builds reports from sample data and stops at `STOP: preview - nothing sent` and `STOP: internal summary not sent`.
2. Create KPIs and Clients (Client, Contact name, Contact email, Account manager) tabs, connect Google Sheets and set `KPI_SHEET_ID`.
3. Connect Gmail and set `AGENCY_NAME` and `INTERNAL_EMAIL`. Check `METRICS` lists your metric names and formats.
4. Put your address in `TEST_EMAIL` to receive every report yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet with KPIs and Clients tabs
- A Gmail account

**How to customize**
- `METRICS` sets the direction (up, down or neutral) and format of each metric.
- `RED_MARGIN_PCT` and `RED_DROP_PCT` set how strict the flags are.
- `CURRENCY` formats money metrics.
