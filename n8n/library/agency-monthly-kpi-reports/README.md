# Email monthly client KPI reports from Google Sheets with month-over-month change

On the 2nd of each month reads KPI rows per client from Google Sheets, compares last month with the month before and with targets, flags each metric green, amber or red, emails every client contact an HTML table and sends the agency an internal summary.

Import `agency-monthly-kpi-reports-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketing and SEO agencies that keep client numbers in one spreadsheet and spend the first week of every month pasting them into report emails. Clients get a one-table report on the 2nd and the team sees which accounts need a call.

## How it works

1. On the 2nd of each month at 08:00 it reads the KPIs tab (Client, Month, Metric, Value, Target) and the Clients tab, or sample data until a sheet is set.
2. For each client it takes last month and the month before, and works out the change for every metric.
3. Each metric gets a flag. With a target: green when met, amber when within `RED_MARGIN_PCT`, red beyond it. Without one: red when it moved the wrong way by more than `RED_DROP_PCT`. `METRICS` says which way is good, so a lower cost per lead counts as better.
4. Each client contact gets an HTML table with this month, last month, change, target and flag. Clients with no data for the month or no contact email are held back.
5. The agency gets one internal email listing every client with its red and amber counts, worst first.

## Sections on the canvas

1. **Start and settings.** Runs on the 2nd of each month at 08:00, giving ad platforms a day to settle last month. Metric directions, flag thresholds and the currency live in `config`.
2. **Read KPIs and clients.** KPIs and contacts are read in parallel and told apart by their columns. `Load sample KPIs and clients` dates its rows to last month, so a preview always has a report month.
3. **Compare, flag and summarise.** Flags read the target first and fall back to the change, and `METRICS` says which way is good, so a falling cost per lead is green. The internal summary sorts accounts by red count so the worst is read first.
4. **Email the clients.** Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every report goes to you, with the real recipient in the subject, so the table can be checked in a real inbox.

## Setup

1. Run it once as imported. It builds reports from sample data and stops at `STOP: preview - nothing sent` and `STOP: internal summary not sent`.
2. Create KPIs and Clients (Client, Contact name, Contact email, Account manager) tabs, connect Google Sheets and set `KPI_SHEET_ID`.
3. Connect Gmail and set `AGENCY_NAME` and `INTERNAL_EMAIL`. Check `METRICS` lists your metric names and formats.
4. Put your address in `TEST_EMAIL` to receive every report yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `KPI_SHEET_ID` | `''` | Google Sheets id with KPIs and Clients tabs; blank uses sample data |
| `AGENCY_NAME` | `'Northwind Growth'` | sign-off and report header |
| `INTERNAL_EMAIL` | `'team@northwind-growth.example'` | gets the internal summary |
| `METRICS` | `{"Sessions":{"direction":"up","format":"` | metric name -> which direction is good and how to format it; others default to up/number |
| `RED_MARGIN_PCT` | `10` | a missed target by more than this percent is red, less is amber |
| `RED_DROP_PCT` | `15` | without a target, a move the wrong way by more than this percent is red |
| `CURRENCY` | `'USD'` | currency for money metrics |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the KPIs tab`
- `Read the Clients tab`
- `Email the internal summary`
- `Email each client report`

## Requirements

- A Google Sheet with KPIs and Clients tabs
- A Gmail account

## Customising

- `METRICS` sets the direction (up, down or neutral) and format of each metric.
- `RED_MARGIN_PCT` and `RED_DROP_PCT` set how strict the flags are.
- `CURRENCY` formats money metrics.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing sent`, `STOP: internal summary not sent` |
| live send from the sheet | 13 | `Email each client report`, `Email the internal summary` | `Email each client report`, `Email the internal summary` |
