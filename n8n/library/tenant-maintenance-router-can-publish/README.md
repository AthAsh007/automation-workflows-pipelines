# Route tenant maintenance requests from a form to vendors by trade and urgency

Takes a tenant maintenance request from an n8n form, spots emergencies such as gas, flooding or no heat, maps the issue to a trade, picks the covering vendor from a Google Sheets table, sets a response deadline, emails the vendor and the tenant and logs a ticket.

Import `tenant-maintenance-router-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Property managers and small landlords who get repair requests by text, email and phone and then forward each one to the right contractor by hand. Every request gets a ticket number, a vendor and a deadline within a minute.

## How it works

1. A tenant fills in the form with their unit, area, category and a description. A manual run uses a sample gas-smell report.
2. The description is checked for emergency phrases (gas, flood, burst pipe, no heat, sparks, sewage) and urgent ones (leak, no hot water, fridge). That sets the level and a deadline of 4 hours, 24 hours or 5 days.
3. The category maps to a trade. Emergency phrases can override it, so a gas smell reported under Appliance still goes to a gas-safe heating engineer.
4. The Vendors tab is filtered by trade and area. Emergencies only go to vendors marked for emergency call-outs, then the lowest Priority number wins. With no match, the property manager gets the job.
5. The vendor gets a work order, the tenant gets a confirmation with the ticket id and deadline, the manager is copied on emergencies and the ticket is logged.

## Sections on the canvas

1. **Start and settings.** Tenants submit `Maintenance request form`; `Run manually` replays a sample gas report. Emergency phrases, deadlines and trade mappings all live in `config`, so the rules are readable in one place.
2. **Read the request.** `Read the request` lower-cases the email and keeps the description as typed, because the urgency rules read it word by word. A manual run uses `Load sample request`.
3. **Read the vendor table.** Vendors live in a sheet the office already keeps, with trade, areas covered, emergency call-outs and a priority. `Load sample vendors` includes a cheaper firm with no emergency cover, so the rule is visible.
4. **Route and write.** Emergency phrases are matched as whole words and can override the category, so gas reported as an appliance fault still goes to a gas engineer. With no covering vendor, the manager gets the job instead of nobody.
5. **Send and log.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. The ticket is logged only on a live run, so test requests never appear in the Tickets tab.

## Setup

1. Run it once as imported. It routes the sample request and stops at `STOP: preview - nothing sent`.
2. Create Vendors (Vendor, Trade, Email, Areas, Emergency, Priority) and Tickets tabs, connect Google Sheets and set `MAINTENANCE_SHEET_ID`.
3. Connect Gmail, set `MANAGER_EMAIL`, and edit the Area options on the form to your patches.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `MAINTENANCE_SHEET_ID` | `''` | Google Sheets id with Vendors and Tickets tabs; blank uses sample vendors |
| `MANAGER_EMAIL` | `'maintenance@harbour-lettings.example'` | copied on emergencies and gets jobs no vendor covers |
| `TIMEZONE` | `'Europe/London'` | timezone for the deadline shown in emails |
| `EMERGENCY_PATTERNS` | `["smell of gas","gas leak","gas","carbon` | any of these in the description makes it an emergency |
| `URGENT_PATTERNS` | `["leak","leaking","no hot water","not fl` | any of these makes it urgent |
| `SLA_HOURS` | `{"emergency":4,"urgent":24,"routine":120` | hours until a vendor must respond, per level |
| `CATEGORY_TRADES` | `{"Plumbing":"plumbing","Electrical":"ele` | form category -> Trade on the Vendors tab |
| `KEYWORD_TRADES` | `{"gas":"heating","carbon monoxide":"heat` | phrase -> trade; used for emergencies and for the Other category |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Vendors tab`
- `Send the email`
- `Log the ticket`

## Requirements

- A Google Sheet with Vendors and Tickets tabs
- A Gmail account

## Customising

- `EMERGENCY_PATTERNS` and `URGENT_PATTERNS` decide the level from the description.
- `SLA_HOURS` sets the deadline for each level.
- `CATEGORY_TRADES` and `KEYWORD_TRADES` map requests to the Trade column of your vendors.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample gas report, preview) | 13 | none | `STOP: preview - nothing sent` |
| form request with no covering vendor (test mode) | 14 | `Send the email` | `STOP: test send - ticket not logged` |
| live flood report with the vendor sheet | 15 | `Send the email`, `Log the ticket` | `Log the ticket` |
